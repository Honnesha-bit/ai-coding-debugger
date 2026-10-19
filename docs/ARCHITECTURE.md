# AI Coding Debugger — System Architecture

## 1. Overview

The **AI Coding Debugger** is a full-stack, automated code analysis, repair, and verification platform. It allows developers and guests to input buggy code in 16 programming languages, describe observed issues, receive structured AI-powered root-cause diagnoses and minimal patches, visually inspect diffs, and immediately verify corrections inside an isolated execution sandbox.

```
+-------------------------------------------------------------------------------+
|                               Browser Client (SPA)                            |
|  - Monaco/Text Editor   - Guest 2-Use Quota Badge  - Work Preservation Store  |
|  - Interactive Diff     - Accessible Login Modal   - Evaluation Benchmark UI  |
+---------------------------------------+---------------------------------------+
                                        | HTTP / JSON / Cookies
                                        v
+-------------------------------------------------------------------------------+
|                              Express API Gateway                              |
|  - CORS & Security Headers                  - Dual Guest Tracking (Cookie+IP) |
|  - Global 512KB Payload Ceiling             - Dual-Anchored Rate Limiting     |
|  - Request Size Validation (64KB/8KB/32KB)  - HMAC Session Auth Validator     |
+-------------------+-------------------+-------------------+-------------------+
                    |                   |                   |
                    v                   v                   v
+-----------------------+   +-----------------------+   +-----------------------+
|   AI Engine Service   |   |   Diff Engine Service |   |   Database (SQLite)   |
|  - Multi-Provider:    |   |  - Unified Patch Gen  |   |  - users              |
|    Gemini & OpenAI    |   |  - Line-by-Line AST   |   |  - guest_sessions     |
|  - Deterministic Mock |   |  - Add/Del Tokenizer  |   |  - debug_sessions     |
|  - AiCallBudget Cap=3 |   +-----------------------+   |  - evaluation_runs    |
|  - Native Prompt Isolation                            |  - POSIX 0700/0600    |
+-----------+-----------+                               |  - Symlink Defense    |
            |                                           +-----------------------+
            v
+-------------------------------------------------------------------------------+
|                           Sandbox Manager Subsystem                           |
|  - Production: Mode locked to container, fails closed if Docker unavailable   |
|  - Development: Auto-selection between Container and Host runners             |
+---------------------------------------+---------------------------------------+
                    |                                   |
                    v (Production)                      v (Local Development)
+---------------------------------------+   +-----------------------------------+
|       Container Sandbox Runner        |   |        Host Sandbox Runner        |
|  - Docker Engine / Podman Container   |   |  - Isolated child process (spawn) |
|  - --network none (Zero kernel routes)|   |  - Stripped parent environment    |
|  - --read-only rootfs                 |   |  - 5000ms hard clock timeout      |
|  - /tmp:noexec & /workspace (tmpfs)   |   |  - 64KB stdout/stderr truncation  |
|  - Non-root user 10001:10001          |   |  - Ephemeral folder cleanup       |
|  - --cap-drop ALL & NoNewPrivs        |   +-----------------------------------+
|  - cgroups: 256MB, 64 PIDs, 1.0 CPU   |
+---------------------------------------+
```

---

## 2. Component Architecture

### 2.1 Frontend Single-Page Application (`client/` & `public/`)
- **React 19 & TypeScript (`client/src/`)**: Built with Vite into optimized production bundles in `public/`.
- **11 Dedicated Product Routes**:
  - `/` — Landing Page with interactive demo showcases, feature breakdown, and CTAs.
  - `/login` — Secure authentication with password visibility toggle, error handling, and redirection to preserved work.
  - `/register` — Account creation with instant login and quota upgrade.
  - `/dashboard` — Authenticated workspace overview, recent debugging sessions, and quota metrics.
  - `/debug` — Main debugging workspace: dark midnight editor (`#0b1120`), 16-language selector, drag-and-drop file uploader, error description, test code, quota badge, and execution terminal.
  - `/debug/:id` — Full session view: root-cause diagnosis, corrected code, unified diff, and terminal runs.
  - `/history` — Searchable debugging archive with language/status filters and deletion.
  - `/evaluation` — 25-case held-out benchmark dashboard with 7 metrics, benchmark runner, and CSV/JSON export.
  - `/profile` — User profile, quota tier, and account settings.
  - `/settings` — Execution preferences, themes, font sizing, and timeout configurations.
  - `/404` — Clean 404 page with navigation shortcuts.
- **Developer SaaS Design System (`client/src/index.css`)**:
  - Clean light workspace with dark midnight code editor and execution terminal.
  - Interactive unified and side-by-side diff viewer with syntax highlights.
  - Responsive layout with desktop sidebar, mobile navigation, and breadcrumbs.
  - Loading skeletons, empty states, error boundaries, and accessible toasts.
- **Guest 2-Use Enforcer (`client/src/components/common/LoginRequiredModal.tsx`)**:
  - Live usage indicator:
    - `"Free debugging uses remaining: 2"`
    - `"Free debugging uses remaining: 1"`
    - `"You have used your 2 free debugging attempts."`
  - Modal: **Your Free Debugging Uses Are Finished** with three actions:
    1. **Log In**
    2. **Create Account**
    3. **Maybe Later**
- **Work Preservation Engine (`client/src/services/storage.ts`)**:
  - Persists source code, language, error descriptions, and test assertions in `sessionStorage` (`ai_debugger_pending_work`).
  - Restores pending form fields post-authentication with a dedicated **Continue Debugging** banner and 1-click execution.

---

### 2.2 Backend API Gateway (`src/app.js`, `src/server.js`)
- **Runtime**: Node.js $\ge$ 22.5.0 native ES Modules (`import`/`export`).
- **HTTP Engine**: Express.js with `cookie-parser` and `cors`.
- **Hardened Middleware Chain**:
  1. `cors({ origin: config.CORS_ORIGIN, credentials: true })`: Strict cross-origin origin checks.
  2. `securityHeadersMiddleware`: OWASP security headers (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`).
  3. `express.json({ limit: '512kb' })`: Strict global payload size limit; payloads $>512$KB return HTTP 413 `PAYLOAD_TOO_LARGE`.
  4. `cookieParser()`: Signed and opaque cookie parsing.
  5. `createDualRateLimiter()`: Enforces dual-anchored rate limiting against session cookie (`guest_sess_...`) AND client IP address (`guest_ip_...`), preventing quota bypass via cookie rotation.
  6. `validateSubmissionMiddleware`: Validates submission size caps before quota reservation (sourceCode $\le$ 64KB, errorDescription $\le$ 8KB, expectedOutput $\le$ 16KB, testCases $\le$ 32KB).
  7. `trackGuestSession`: Generates or extracts `guest_session_id` cookie.
  8. `authenticate`: Verifies cryptographic HMAC-SHA256 session tokens.
  9. `enforceGuestLimit`: Atomically verifies and reserves attempts for unauthenticated visitors in SQLite.

---

### 2.3 Guest Session & Concurrency Management (`src/services/guestService.js`)
- Each unauthenticated guest receives an opaque session identifier cookie (`gst_<hex16>`).
- Server maintains session records in SQLite `guest_sessions` table.
- **Atomic Reservation Query**:
  ```sql
  UPDATE guest_sessions 
  SET usage_count = usage_count + 1, updated_at = ?
  WHERE session_id = ? AND usage_count < 2;
  ```
  - If `changes === 0`, request is immediately blocked with HTTP 403 `LOGIN_REQUIRED`.
  - Quota is deducted before invoking AI or container workers.
  - Concurrent requests are serialized and safely bounded.

---

### 2.4 Multi-Provider AI Architecture & Hard Call Budget (`src/services/aiService.js`, `src/services/aiRepairService.js`)
- **Provider Fallback Cascade**:
  1. Primary: Google Gemini (`gemini-flash-latest`).
  2. Fallback: OpenAI (`gpt-4o-mini`).
  3. Offline/Test: Deterministic Mock AI AST engine.
- **AiCallBudget (`src/services/aiService.js`)**:
  - Enforces a strict **hard cap of 3 total AI calls per request** across all retries and fallback attempts.
  - Prevents runaway billing and infinite repair loops.
  - Auth failures (HTTP 401/403) fail fast immediately without retrying.
  - Composite error messages redact API keys and tokens before logging or returning to clients.
- **Native Prompt Injection Boundaries**:
  - System instructions are passed exclusively via native SDK channels (Gemini `systemInstruction`, OpenAI `role: 'system'`).
  - Untrusted user source code, test cases, and error messages are encapsulated inside passive JSON data blocks (`--- BEGIN USER SUBMISSION (DATA ONLY) ---`).
  - Output schemas are strictly validated with JSON parsers; malformed LLM responses trigger fallback.

---

### 2.5 Multi-Tier Sandbox Execution & Safe Verification Architecture (`src/services/sandbox/`)

#### 1. Safe Verification Mode (`SANDBOX_MODE=safe_verification`)
- Default mode in non-production environments when Docker or Podman is not available.
- **Safety Guarantee**: Strictly refuses to execute untrusted user-submitted code directly on the host.
- **8 Canonical Verification Categories**:
  1. `STATIC_CHECK_PASSED`: Code syntax and structure verified via static delimiter and pattern checks without dynamic execution.
  2. `STATIC_CHECK_FAILED`: Code failed lexical pattern or delimiter checks (e.g., unbalanced brackets or syntax errors).
  3. `TESTS_GENERATED_NOT_RUN`: Functional test cases were generated, but dynamic runtime execution was not performed because container sandbox is unavailable.
  4. `EXECUTION_UNAVAILABLE`: Dynamic execution was unavailable due to missing container isolation.
  5. `EXECUTION_PASSED_NO_ASSERTIONS`: Dynamic execution ran and exited 0, but no functional assertions were evaluated.
  6. `TESTS_PASSED_VERIFIED`: Dynamic execution ran in isolated container sandbox and passed all assertions.
  7. `TESTS_FAILED_VERIFIED`: Dynamic execution ran in sandbox and failed compilation or assertions.
  8. `VERIFICATION_ERROR`: Verification infrastructure error or process timeout.
- **Static Analysis & Limitation Disclaimer**: Runs static delimiter balancing and adapter-specific syntax rules, attaching structured checks and an explicit disclaimer stating that static regex/delimiter checks do not substitute for a compiler or dynamic execution.
- **Downloadable Test Suite Generation**: Formats self-contained runnable test files (`test_suite.py`, `test_suite.js`, `test_suite.ts`, `test_suite.sql`, `TestSuite.java`, `test_suite.c`/`cpp`) for offline validation via `POST /api/v1/debug/tests/download`.

#### 2. ContainerSandboxRunner (`src/services/sandbox/containerSandboxRunner.js`)
- Executes untrusted code inside isolated Docker or Podman containers:
  - `--network none`: Kernel network namespace disconnected; zero routes, loopback only.
  - `--read-only`: Root filesystem mounted read-only (`EROFS` on write).
  - `--tmpfs /tmp:rw,noexec,nosuid,size=64m`: Non-executable temporary storage.
  - `--tmpfs /workspace:rw,size=64m`: Writable memory-backed scratch workspace.
  - `--user 10001:10001`: Execution strictly as unprivileged user `sandboxuser`.
  - `--cap-drop ALL`: All 41 Linux kernel capabilities completely stripped (`CapEff: 0000000000000000`).
  - `--security-opt no-new-privileges:true`: Prevents SUID privilege escalation.
  - `--memory 256m --memory-swap 256m`: Kernel cgroups memory ceiling with OOM killer.
  - `--pids-limit 64`: Fork bomb protection.
  - `--cpus 1.0`: CFS CPU scheduler quota.
- **Execution Path Translation**:
  - Host temporary execution directory is mounted strictly read-only at `/app/code:ro`.
  - Execution directory is pointed at `/workspace`.
  - Code files are referenced as `/app/code/<file>`.
  - Compiler outputs and scratch artifacts are emitted to `/workspace`.

#### 3. HostSandboxRunner (`src/services/sandbox/hostSandboxRunner.js`)
- Internal test runner strictly confined to controlled integration test harnesses:
  - Executes code via `child_process.spawn`.
  - Environment variables stripped (no database paths, session keys, or API tokens).
  - 5000ms clock timeout terminates hanging processes via `SIGKILL`.
  - 64KB stdout/stderr buffer clamp with truncation notices.
  - Ephemeral directories deleted immediately upon process exit.

#### 4. SandboxManager (`src/services/sandbox/sandboxManager.js`)
- Enforces environment mode locking and boundaries:
  - If `NODE_ENV === 'production'` or `SANDBOX_MODE === 'container'`: Mode is locked to `container`.
  - If `SANDBOX_MODE === 'safe_verification'`: `strictContainerRequired` is set to `true`. Host runner is never returned as active runner when container is absent, and `isExecutionAllowed()` safely fails closed (`EXECUTION_UNAVAILABLE`).

---

### 2.6 Database & Inode Permission Security (`src/db/`)
- **Native SQLite**: Built on Node.js 22 `node:sqlite` (`DatabaseSync`).
- **WAL Mode**: `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`.
- **POSIX Inode Hardening (`src/db/permissionSecurity.js`)**:
  - Directory mode enforced at `0700` (`rwx------`).
  - Database file and WAL/SHM sidecars enforced at `0600` (`rw-------`).
  - Process `umask` set to `0077` on POSIX systems.
- **Symlink Attack Defense**:
  - `assertNotSymbolicLink` verifies paths using `fs.lstatSync`.
  - Rejects symlinks pointing to `/etc/passwd` or system files with `DatabaseSecurityError` (`SYM_LINK_DETECTED`).
- **Query Parameterization & Ownership**:
  - All SQL queries use prepared statement parameters (`?`).
  - Session history queries strictly enforce user ID matching (`user_id = ?`) or guest session matching (`guest_session_id = ? AND user_id IS NULL`).
