# AI Coding Debugger — Production Deployment & Operations Guide

This guide details the architecture, hosting evaluation, container isolation prerequisites, database persistence requirements, operational monitoring, and rollback strategies for publicly deploying the **AI Coding Debugger**.

---

## 1. Architecture Overview

The production architecture enforces a zero-trust model where public web traffic is separated from code execution:

```
[Public Internet / Untrusted Users]
                  │
                  ▼ (HTTPS / TLS 1.3)
      [Cloud Edge / Reverse Proxy]
       - Cloudflare / Nginx / Load Balancer
       - SSL Termination & DDoS Protection
                  │
                  ▼ (HTTP / Unix Socket, TRUST_PROXY=true)
      [Node.js Application Gateway] (Port 3000)
       ├── OWASP Security Headers (CSP, FrameGuard, NoSniff, HSTS)
       ├── Sliding-Window Rate Limiters (120 req/min API, 30 req/min debug, 20 req/min auth)
       ├── Body Size Clamping (Max 512 KB)
       ├── Guest Session Tracking (2-use quota) & JWT Auth
       ├── SQLite DatabaseSync with WAL (Persistent Disk: /app/data)
       └── AiRepairService (Mock / Google Gemini / OpenAI)
                  │
                  ▼ (Local Docker Daemon / Unix Socket)
      [Container Sandbox Execution Engine]
       ├── Fail-Closed Policy (Host execution strictly prohibited in production)
       ├── Concurrency Limiter (Max 4 concurrent, bounded queue of 16)
       └── Ephemeral Container Instances (`ai-coding-debugger-sandbox:latest`):
             • `--network none` (Total network isolation)
             • `--read-only` (Immutable root filesystem)
             • `--tmpfs /tmp:rw,noexec,nosuid,size=64m`
             • `--tmpfs /workspace:rw,size=64m`
             • `--memory 256m` / `--pids-limit 64` / `--cpus 1.0`
             • `--cap-drop ALL`
             • `--user 10001:10001` (Unprivileged sandbox user)
```

---

## 2. Hosting Evaluation Matrix

A critical requirement of the AI Coding Debugger is that **untrusted user-submitted code must be executed inside isolated containers**. The table below evaluates hosting options based on Docker/container runtime support, persistent disk storage for SQLite, security isolation, and operational cost:

| Hosting Provider | Docker-in-Docker / Container Spawning | Persistent Disk Storage for SQLite | Sandbox Isolation Feasibility | Free / Low-Cost Tier | Overall Evaluation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Linux VPS / Cloud VM** *(Hetzner, DigitalOcean, Linode, OVH)* | **Full Native Support** (Direct access to Linux kernel cgroups and Docker/Podman daemon) | **Native NVMe Disk** (Full persistence across reboots, zero volume detach latency) | **EXCELLENT (Recommended)**. Full container isolation with kernel-enforced limits. | ~\$4.00 – \$6.00 / month | **RECOMMENDED PRIMARY CHOICE**. Cleanest architecture, complete container control, best security. |
| **Fly.io** | **Supported via Firecracker MicroVMs** or docker-on-fly | **Supported** (`fly volumes create`, mount to `/app/data`) | **HIGH**. MicroVM architecture provides hardware-level virtualization. | Pay-as-you-go (~\$3 – \$5 / month for small VM + volume) | **STRONG RUNNER-UP**. Excellent if managed container deployment is preferred over managing OS updates. |
| **Railway** | **Limited / Restricted** (DinD requires privileged containers which are heavily restricted) | **Supported on Paid Tier** (\$5/month subscription minimum) | **MODERATE / COMPLEX**. Custom Dockerfile required, DinD socket mounting is complex and brittle. | 30-day trial only, no permanent free tier | **NOT RECOMMENDED**. DinD friction makes secure sandbox spawning fragile. |
| **Render** | **UNSUPPORTED** (Render Web Services do not permit access to Docker socket or nested containers) | **Paid Disks Only** (\$7/month minimum for persistent disk) | **BLOCKED**. In production mode (`NODE_ENV=production`), app fails closed because Docker runtime is missing. | Free tier lacks persistent disk & sleeps after 15 min | **INCOMPATIBLE FOR CONTAINER EXECUTION**. Only suitable as a frontend/API proxy if sandbox is on an external VM. |

### Evidence-Based Recommendation: Linux VPS (Hetzner Cloud CX22 or DigitalOcean Droplet)
- **Why**: The application executes user code via Docker child processes. A standard Linux VPS provides direct, unconstrained access to the host Docker daemon, Linux namespaces, cgroups v2, and network isolation without the performance penalties or security bypasses of nested virtualization.
- **Cost**: Hetzner CX22 (2 vCPU, 4GB RAM, 40GB NVMe) costs ~€3.79/month (~\$4.10/mo), easily supporting the Node.js API and 4 concurrent sandbox containers.

---

## 3. Database Persistence Guide (SQLite WAL Mode)

The application uses Node.js 24's native `DatabaseSync` (`node:sqlite`) with Write-Ahead Logging (WAL) enabled:
- **Default Database Location**: `data/debugger.sqlite`
- **Volume Mount Point**: When running in a container, mount a persistent host directory to `/app/data`.

### Deployment Checklist for Data Persistence:
1. Ensure the directory exists with appropriate read/write permissions for the Node process.
2. Ensure the filesystem supports POSIX locking (do not use NFS or SMB network shares for SQLite WAL files).
3. **Automated Backup Strategy**:
   Run a daily cron job using SQLite's online vacuum/backup:
   ```bash
   sqlite3 /app/data/debugger.sqlite ".backup '/app/backups/debugger-$(date +%Y%m%d).sqlite'"
   ```

---

## 4. Container Sandbox Setup & Security Hardening

### Step 1: Build the Multi-Language Sandbox Image
On the production server, build the hardened execution container:
```bash
docker build -t ai-coding-debugger-sandbox:latest -f Dockerfile.sandbox .
```

Verify that the image contains all required toolchains:
```bash
docker run --rm ai-coding-debugger-sandbox:latest python3 --version
docker run --rm ai-coding-debugger-sandbox:latest node --version
docker run --rm ai-coding-debugger-sandbox:latest javac -version
docker run --rm ai-coding-debugger-sandbox:latest gcc --version
docker run --rm ai-coding-debugger-sandbox:latest g++ --version
```

### Step 2: Enforce Strict Fail-Closed Execution
In production, `NODE_ENV=production` automatically locks `SANDBOX_MODE=container`. If Docker is stopped or unavailable, the system immediately returns:
```json
{
  "status": "execution_unavailable",
  "errorType": "CONTAINER_RUNTIME_UNAVAILABLE",
  "isolationType": "container_unavailable"
}
```
**Host fallback is strictly prohibited in production** to protect the host server from malicious user submissions.

---

## 5. Step-by-Step Production Deployment (Ubuntu 24.04 VPS)

### 1. Provision Server & Install Docker and Node.js 24
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Install Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Configure Dedicated Non-Root Service User
```bash
sudo useradd -m -s /bin/bash debugger
sudo usermod -aG docker debugger
sudo su - debugger
```

### 3. Deploy Application Code & Build Frontend
```bash
git clone <repository_url> ai-coding-debugger
cd ai-coding-debugger

# Install production dependencies
npm ci --omit=dev

# Build frontend production bundle
npm run build

# Build sandbox container image
docker build -t ai-coding-debugger-sandbox:latest -f Dockerfile.sandbox .
```

### 4. Configure Production Environment Variables
Create `.env` based on `.env.example`:
```bash
cat << 'EOF' > .env
PORT=3000
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_actual_gemini_api_key
SANDBOX_MODE=container
SANDBOX_IMAGE=ai-coding-debugger-sandbox:latest
SANDBOX_TIMEOUT_MS=5000
MAX_OUTPUT_BYTES=32768
SANDBOX_MAX_CONCURRENT=4
SANDBOX_QUEUE_TIMEOUT_MS=10000
DB_PATH=/home/debugger/ai-coding-debugger/data/debugger.sqlite
TRUST_PROXY=true
CORS_ORIGIN=https://debugger.yourdomain.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
RATE_LIMIT_DEBUG_MAX=30
EOF
```

### 5. Setup Systemd Service
Create `/etc/systemd/system/ai-coding-debugger.service`:
```ini
[Unit]
Description=AI Coding Debugger Gateway
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=debugger
WorkingDirectory=/home/debugger/ai-coding-debugger
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-coding-debugger
```

### 6. Setup Nginx Reverse Proxy with TLS (Let's Encrypt)
```nginx
server {
    server_name debugger.yourdomain.com;

    client_max_body_size 1M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable SSL via Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d debugger.yourdomain.com
```

---

## 6. Operational Monitoring & Health Verification

1. **Liveness & Readiness**:
   ```bash
   curl -i http://localhost:3000/health
   # Returns: 200 OK {"status":"healthy","version":"1.0.0"}
   ```
2. **Sandbox Isolation & Concurrency Status**:
   ```bash
   curl -i http://localhost:3000/api/v1/sandbox/status
   # Returns:
   # {
   #   "mode": "container",
   #   "activeRunnerId": "container",
   #   "isContainerAvailable": true,
   #   "isIsolated": true,
   #   "concurrency": { "running": 0, "queued": 0, "maxConcurrent": 4 }
   # }
   ```
3. **Application Logs**:
   ```bash
   journalctl -u ai-coding-debugger -f
   ```

---

## 7. Rollback & Disaster Recovery Procedures

1. **Service Rollback**:
   If a newly deployed version encounters unexpected issues:
   ```bash
   git checkout <last-known-stable-tag-or-commit>
   npm run build
   sudo systemctl restart ai-coding-debugger
   ```
2. **Database Recovery**:
   If database corruption occurs:
   ```bash
   sudo systemctl stop ai-coding-debugger
   cp /app/backups/debugger-YYYYMMDD.sqlite /app/data/debugger.sqlite
   sudo systemctl start ai-coding-debugger
   ```
