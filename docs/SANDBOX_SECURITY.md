# Production Sandbox Security, Isolation & Abuse Prevention Architecture

## 1. Threat Model & Security Boundaries

When untrusted public users submit source code to the AI Coding Debugger, the execution environment faces several potential threat vectors:
- **Fork Bombs & Resource Starvation**: Infinite recursion, excessive memory allocation, runaway process spawning.
- **Concurrent Request Flooding**: Mass parallel execution requests designed to starve CPU and crash the host server.
- **Data Exfiltration & Network Abuse**: Initiating outbound HTTP/TCP connections to exfiltrate database credentials or attack remote systems.
- **Filesystem Access & Tampering**: Attempting to read host configuration files (`/etc/passwd`, Windows registry, server `.env` files) or corrupt local databases.
- **Process Escalation**: Attempting to break out of child processes to control the parent Express server.
- **Payload Flooding**: Oversized HTTP bodies sent to exhaust server memory.

---

## 2. Modular Architecture & Implementation Status

The sandbox and defense engine uses a modular runner architecture located at `src/services/sandbox/` and middleware at `src/middleware/`:

| Component | File Path | Status | Description |
|---|---|---|---|
| **Sandbox Manager** | `src/services/sandbox/sandboxManager.js` | **IMPLEMENTED** | Detects runtime availability (`docker`/`podman`), locks to `container` runner in production, and enforces strict fail-closed isolation. |
| **Container Sandbox Runner** | `src/services/sandbox/containerSandboxRunner.js` | **IMPLEMENTED** | Generates restricted container execution arguments with `--network none`, `--read-only`, tmpfs, memory cap, and PID limits. |
| **Host Sandbox Runner** | `src/services/sandbox/hostSandboxRunner.js` | **IMPLEMENTED** | Direct OS child process execution with `shell: false`, environment variable scrubbing, 32KB buffer caps, and clock timeouts. (Used only in development). |
| **Concurrency Limiter** | `src/services/sandbox/concurrencyLimiter.js` | **IMPLEMENTED** | Bounded execution queue capping simultaneous executions to 4 with a queue backlog of 16 and 10s wait timeout. |
| **Rate Limit Middleware** | `src/middleware/rateLimitMiddleware.js` | **IMPLEMENTED** | In-memory sliding-window rate limiter (120 req/min API, 30 req/min debug, 20 req/min auth) with standard `Retry-After` headers. |
| **Security Headers** | `src/middleware/securityHeadersMiddleware.js` | **IMPLEMENTED** | OWASP HTTP response headers (CSP, FrameGuard, NoSniff, Referrer-Policy, HSTS in production, removes Express header). |
| **Sandbox Image Dockerfile** | `Dockerfile.sandbox` | **IMPLEMENTED** | Multi-language container image with non-root user `sandboxuser:10001` and minimal runtimes. |
| **Status API** | `GET /api/v1/sandbox/status` | **IMPLEMENTED** | Reports active runner, container availability, concurrency stats, and isolation capabilities. |

---

## 3. Defense Layer 1: Application-Level Protections & Abuse Prevention

1. **Sliding-Window Rate Limiting (`rateLimitMiddleware.js`)**:
   - Zero-dependency sliding-window algorithm tracking timestamps per client IP or authenticated session.
   - Enforces 120 requests/minute for general API endpoints.
   - Enforces 30 requests/minute for computationally heavy debug/execute endpoints.
   - Enforces 20 attempts/minute for authentication routes to prevent credential brute-forcing.
   - Returns HTTP `429 Too Many Requests` with RFC-compliant `Retry-After` and `X-RateLimit-*` headers.

2. **Concurrency Limiter & Bounded Queue (`concurrencyLimiter.js`)**:
   - Maximum 4 concurrent executions running simultaneously.
   - Bounded FIFO waiting queue with a maximum depth of 16.
   - If the queue exceeds capacity, incoming execution requests immediately return HTTP `503 Service Unavailable` (`SERVER_BUSY`).
   - If a queued execution waits longer than 10,000ms without acquiring a slot, it is aborted with `QUEUE_TIMEOUT`.

3. **HTTP Body Clamping (512 KB Limit)**:
   - `express.json` and `express.urlencoded` limit payloads to 512 KB.
   - Excessively large code submissions are rejected early at the gateway layer with HTTP `413 Payload Too Large`.

4. **OWASP Security Headers (`securityHeadersMiddleware.js`)**:
   - `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing exploits.
   - `X-Frame-Options: DENY`: Blocks clickjacking attacks by forbidding iframe embedding.
   - `X-XSS-Protection: 0`: Replaces insecure legacy browser XSS filters with modern CSP.
   - `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer data leakage.
   - `Content-Security-Policy`: Restricts script and asset origins.
   - `Strict-Transport-Security` (HSTS): Enforced in `production` with 1-year max-age.
   - Express identification header `X-Powered-By` is stripped.

---

## 4. Defense Layer 2: Host Safeguards (Development Mode Only)

The host runner (`HostSandboxRunner`) implements defense-in-depth for local development:
1. **`shell: false` Process Spawning**:
   - `spawn(cmd, args, { shell: false })` directly invokes OS binaries without an intermediate shell (`cmd.exe`, `powershell.exe`, or `/bin/sh`).
   - Prevents command injection via metacharacters (`;`, `&`, `|`, `` ` ``, `$()`, `>`).
2. **Environment Variable Scrubbing**:
   - Ambient parent process environment is scrubbed.
   - API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`), session secrets, and database paths are stripped.
   - Child processes receive only standard operating system paths.
3. **Stream Buffer Cap (32KB DOS Defense)**:
   - `stdout` and `stderr` streams are clamped strictly at 32,768 bytes.
   - Overflow data is discarded and flagged with `[OUTPUT TRUNCATED: Exceeded size limit]`.
4. **Hard Execution Timeout (5000ms SIGKILL)**:
   - Monotonic clock timer forces `SIGKILL` after 5000ms.
5. **Ephemeral Directory Lifecycles & Path Sanitization**:
   - Unique scratch directory per execution (`fs.mkdtempSync`).
   - Filenames are sanitized via `path.basename` and regex (`[^a-zA-Z0-9._-]` $\rightarrow$ `_`), blocking directory traversal attacks (`../`, `..\`).
   - Guaranteed cleanup in `finally` blocks.

> [!WARNING]
> **Host Mode Operational Notice**: Host execution is strictly reserved for local development. In production mode (`NODE_ENV=production`), the application **strictly forbids host execution** and fails closed.

---

## 5. Defense Layer 3: Container Sandbox Execution (Production Mode)

When running in production, `ContainerSandboxRunner` encapsulates execution in disposable containers:

### Container Profile & Flags
```bash
docker run --rm \
  --name ai-sandbox-<uuid> \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --tmpfs /workspace:rw,size=64m \
  --memory 256m \
  --memory-swap 256m \
  --pids-limit 64 \
  --cpus 1.0 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --user 10001:10001 \
  -v <ephemeralHostDir>:/app/code:ro \
  -w /workspace \
  ai-coding-debugger-sandbox:latest \
  <command> <args>
```

### Security Constraint Matrix:
- `--network none`: Blocks all TCP/UDP socket creation, port scanning, SSRF, and outbound data exfiltration.
- `--read-only`: Root filesystem is mounted read-only. Untrusted code cannot modify system binaries or libraries.
- `--tmpfs /tmp:rw,noexec,nosuid,size=64m`: Scratch directory is stored strictly in volatile RAM, bounded to 64MB, with `noexec` to block executing downloaded binaries.
- `--pids-limit 64`: Thwarts fork bombs by killing process creation attempts once 64 PIDs are reached.
- `--memory 256m`: Enforces OOM killer on runaway memory allocations without crashing host.
- `--cpus 1.0`: Prevents CPU starvation of the API server.
- `--cap-drop ALL`: Strips all Linux capabilities (`CAP_NET_RAW`, `CAP_SYS_ADMIN`, `CAP_CHOWN`, etc.).
- `--user 10001:10001`: Executes strictly as unprivileged non-root user.

---

## 6. Strict Production Isolation Policy & Fail-Closed Behavior

The sandbox behavior is governed by `NODE_ENV` and `SANDBOX_MODE`:
- In **production** (`NODE_ENV=production`):
  - `SANDBOX_MODE` is strictly locked to `container`.
  - The system will **NEVER** select or fall back to the host runner, even if requested in options.
  - If Docker or Podman is not detected or operational, execution immediately **fails closed** and returns `status: 'execution_unavailable'` with error type `CONTAINER_RUNTIME_UNAVAILABLE`.
- In **development** (`NODE_ENV=development`):
  - `SANDBOX_MODE=auto` prefers container execution if Docker is functional, or falls back to host execution with an explicit `isIsolated: false` status.
