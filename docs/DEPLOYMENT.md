# AI Coding Debugger — Production Deployment & Operations Guide

This guide establishes the verified installation commands, hosting compatibility evaluation, container sandbox prerequisites, SQLite database persistence and backup procedures, health checks, rollback plans, and operational monitoring for deploying the **AI Coding Debugger**.

---

## 1. Production Architecture Overview

The production deployment operates under a zero-trust model where web traffic handling and code execution are strictly decoupled:

```
[Untrusted Public Internet]
             │
             ▼ (HTTPS / TLS 1.3)
[Cloud Edge / Reverse Proxy] (Cloudflare, Nginx, or Caddy)
  • SSL/TLS Termination
  • DDoS Mitigation & Cloud WAF
  • Static Asset Caching
             │
             ▼ (HTTP / Unix Domain Socket, TRUST_PROXY=true)
[Node.js Application Gateway] (Node.js >= 22.5.0, Port 3000)
  ├── OWASP Security Headers (CSP, FrameGuard, NoSniff, HSTS)
  ├── Dual Sliding-Window Rate Limiters (Session Cookie + IP tracking)
  ├── Global 512KB Body Size Cap & Input Validation Middleware
  ├── Native SQLite Sync Database with WAL Mode (Mounted Volume: /app/data)
  ├── Multi-Provider AI Service (Gemini, OpenAI, Mock AST with 3-Call Budget)
  └── SandboxManager Subsystem (Locked to 'container' in production)
             │
             ▼ (Docker Engine Daemon / Unix Socket: /var/run/docker.sock)
[Container Sandbox Execution Engine]
  ├── Fail-Closed Gate (Host execution strictly prohibited in production)
  ├── Concurrency Limiter (Max 4 concurrent, bounded queue of 16)
  └── Ephemeral Container Instances (`ai-coding-debugger-sandbox:latest`):
        • `--network none` (Total network namespace denial; zero routes)
        • `--read-only` (Immutable root filesystem, EROFS on write)
        • `--tmpfs /tmp:rw,noexec,nosuid,size=64m` (Non-executable temp)
        • `--tmpfs /workspace:rw,size=64m` (Memory-only scratch workspace)
        • `--memory 256m --memory-swap 256m` (cgroups v2 OOM ceiling)
        • `--pids-limit 64` (Process fork-bomb containment)
        • `--cpus 1.0` (CFS CPU scheduler limit)
        • `--cap-drop ALL` (Effective capabilities: 0x0)
        • `--security-opt no-new-privileges:true` (SUID restriction)
        • `--user 10001:10001` (Unprivileged sandboxuser)
```

---

## 2. Hosting Compatibility Matrix

Because the AI Coding Debugger executes untrusted multi-language user code, the hosting environment **must support spawning Docker containers with cgroups v2 resource limits**:

| Hosting Platform | Container Runtime & DinD Support | Persistent SQLite Storage | Sandbox Isolation Feasibility | Estimated Cost | Deployment Compatibility Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Linux Cloud VM / VPS** *(DigitalOcean, Hetzner, AWS EC2, GCP)* | **Full Native Support** (Direct access to Linux kernel cgroups and Docker daemon) | **Native NVMe / Persistent Disk** (Full persistence across reboots) | **EXCELLENT (Recommended)**. Native cgroups v2, network isolation, and POSIX file modes. | ~\$4 – \$10 / month | **RECOMMENDED PRIMARY CHOICE**. Cleanest architecture, complete container isolation, lowest cost. |
| **Fly.io** | **Supported via Firecracker MicroVMs** | **Supported** (`fly volumes create`, mounted to `/app/data`) | **HIGH**. MicroVM architecture provides hardware-level virtualization. | ~\$3 – \$7 / month | **RECOMMENDED MANAGED RUNNER-UP**. Excellent if managed infrastructure is preferred. |
| **Render Web Services** | **UNSUPPORTED** (Does not permit access to Docker socket or nested container execution) | **Paid Disks Only** (\$7/month minimum) | **BLOCKED**. In production (`NODE_ENV=production`), app safely fails closed because Docker daemon is missing. | Free tier lacks persistent disk & sleeps | **INCOMPATIBLE FOR DIRECT EXECUTION**. Only suitable as a frontend reverse proxy if sandbox runs on a dedicated VM. |
| **Railway** | **Restricted** (Docker-in-Docker requires privileged containers, which are heavily throttled/restricted) | **Supported on Paid Tier** | **COMPLEX / BRITTLE**. DinD socket forwarding introduces security vulnerabilities and configuration fragility. | \$5/month subscription minimum | **NOT RECOMMENDED**. Unnecessary operational complexity. |

---

## 3. Verified Installation & Setup Commands

### Step 1: System Provisioning (Ubuntu 24.04 LTS / Debian 12)
```bash
# Update base system packages
apt-get update && apt-get upgrade -y

# Install Docker Engine and base utilities
apt-get install -y ca-certificates curl gnupg docker.io git

# Add official NodeSource repository for Node.js 22.x (Requires >= 22.5.0 for node:sqlite)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Verify runtimes
docker --version
node --version # Must output v22.5.0 or higher
```

### Step 2: Build Sandbox Container Image
```bash
# Build multi-language sandbox image
docker build -t ai-coding-debugger-sandbox:latest -f Dockerfile.sandbox .

# Verify image builds cleanly with non-root user
docker inspect ai-coding-debugger-sandbox:latest --format 'User: {{.Config.User}} | Workdir: {{.Config.WorkingDir}}'
# Expected: User: 10001:10001 | Workdir: /workspace
```

### Step 3: Install Node.js Application Dependencies & Build Client
```bash
# Install production dependencies
npm install --omit=dev

# Build client Single-Page Application into public/
npm run build
```

### Step 4: Configure Production Environment Variables
Generate a high-entropy 64-character hex secret and populate `/app/.env`:
```bash
SESSION_KEY=$(node -e "console.log(crypto.randomBytes(32).toString('hex'))")

cat << EOF > .env
PORT=3000
NODE_ENV=production
SESSION_SECRET=${SESSION_KEY}
AI_PROVIDER=mock
AI_FALLBACK_PROVIDER=auto
AI_MAX_CALLS_PER_REQUEST=3
DB_PATH=/app/data/debugger.sqlite
SANDBOX_MODE=container
SANDBOX_IMAGE=ai-coding-debugger-sandbox:latest
SANDBOX_MEMORY_LIMIT=256m
SANDBOX_PIDS_LIMIT=64
SANDBOX_CPUS=1.0
MAX_GUEST_USES=2
TRUST_PROXY=true
CORS_ORIGIN=https://debugger.yourdomain.com
EOF
```

---

## 4. Health Checks & Verification

### 4.1 Application Health Check
- **Endpoint**: `GET /api/v1/auth/status`
- **Verification Command**:
  ```bash
  curl -s -i http://127.0.0.1:3000/api/v1/auth/status
  ```
- **Expected Status**: `HTTP/1.1 200 OK`
- **Expected Payload**:
  ```json
  {"authenticated":false,"user":null,"guestStatus":{"usageCount":0,"maxUses":2,"remainingUses":2,"isExhausted":false,"message":"Free debugging uses remaining: 2"}}
  ```

### 4.2 Sandbox Fail-Closed Health Check
- Verify that if the Docker daemon is stopped, the application safely rejects execution without falling back to the host:
  ```bash
  # Simulate unavailable Docker
  systemctl stop docker
  curl -s -X POST http://127.0.0.1:3000/api/v1/execute \
    -H "Content-Type: application/json" \
    -d '{"language":"python","sourceCode":"print(1)"}'
  # Expected Response: HTTP 503 Service Unavailable
  # {"error":"EXECUTION_UNAVAILABLE","code":"STRICT_CONTAINER_ISOLATION_REQUIRED"}
  
  # Restart Docker
  systemctl start docker
  ```

---

## 5. Database Persistence & Backup Routines

The SQLite database uses Write-Ahead Logging (`WAL` mode). Active transactions are logged to `-wal` and indexed via `-shm`.

### 5.1 Volume Mount Directory
- Mount persistent host storage to `/app/data`.
- Ensure directory permissions are strictly `0700` and file permissions are `0600`.

### 5.2 Safe Online Backup Procedure
Do not perform a raw file copy of `debugger.sqlite` while writes are active, as this could copy an inconsistent WAL state. Use the SQLite `.backup` command or checkpoint routine:

```bash
# 1. Trigger passive WAL checkpoint to flush uncommitted pages to main file
node -e "
import { getDatabase, closeDatabase } from './src/db/database.js';
const db = getDatabase('/app/data/debugger.sqlite');
db.exec('PRAGMA wal_checkpoint(PASSIVE);');
closeDatabase();
"

# 2. Perform safe atomic backup
sqlite3 /app/data/debugger.sqlite ".backup '/app/backups/debugger-$(date +%Y%m%d%H%M).sqlite'"

# 3. Compress backup
gzip -9 "/app/backups/debugger-$(date +%Y%m%d%H%M).sqlite"
```

---

## 6. Rollback & Disaster Recovery Guidance

1. **Application Code Rollback**:
   - The frontend bundle in `public/` and backend code in `src/` are fully stateless.
   - To roll back to a previous release:
     ```bash
     git checkout <previous-tag-or-commit>
     npm install --omit=dev
     npm run build
     systemctl restart ai-coding-debugger
     ```
2. **Database Rollback**:
   - The SQLite database schema uses `CREATE TABLE IF NOT EXISTS` migrations without destructive column drops.
   - In case of data corruption, restore the latest verified backup:
     ```bash
     systemctl stop ai-coding-debugger
     cp /app/backups/debugger-latest.sqlite /app/data/debugger.sqlite
     chmod 600 /app/data/debugger.sqlite
     systemctl start ai-coding-debugger
     ```

---

## 7. Phase 12 Linux Validation Gate Reference

Before opening the arbitrary code execution endpoint to public traffic, all 26 security gates in [`scripts/run_phase12_validation.sh`](../scripts/run_phase12_validation.sh) must be executed on the deployment host:
```bash
chmod +x scripts/run_phase12_validation.sh
./scripts/run_phase12_validation.sh
```

Ensure all 26 gates print `[PASS]` and confirm zero infrastructure failures before removing access restrictions.
