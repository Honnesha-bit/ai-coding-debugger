# Disposable Linux VM Testing Guide — AI Coding Debugger

**Project:** AI Coding Debugger  
**Validation Suite:** 26 Linux Container Sandbox Security Gates (`scripts/run_phase12_validation.sh`)  
**Target Environment:** Remote Disposable Linux VM (Ubuntu 24.04 LTS or Debian 12)  
**Host Computer Impact:** **ZERO (Your Windows computer, operating system, and personal files remain 100% untouched)**

---

## 1. Why a Disposable Linux VM Protects Your Computer Best

Testing Linux container sandboxes directly on your personal Windows computer can cause unwanted friction:
- **Zero changes to your laptop:** You do NOT need to install WSL 2, Docker Desktop, or any background hypervisors or services.
- **Zero risk to personal data:** The tests execute on an isolated virtual machine located in a secure cloud datacenter. The container cannot access your Windows desktop, files, or registry.
- **Genuine Linux Kernel:** Security gates (kernel routing table drops, read-only rootfs `EROFS`, cgroups v2 memory OOM, CFS CPU throttling, and POSIX octal file modes `0700`/`0600`) require a real production Linux kernel to be tested accurately.
- **Instantly Disposable:** When testing completes, you delete the VM immediately.

---

## 2. Choosing a Cloud Provider (Cost: Under $0.10)

You only need the virtual machine for **10 to 15 minutes**. Since cloud providers bill per second or minute, the total cost is just a few cents:

| Cloud Provider | Recommended VM Type | Specs | Hourly Cost |
| :--- | :--- | :--- | :--- |
| **DigitalOcean** | Basic Droplet (Ubuntu 24.04 x64) | 2 vCPUs, 4 GB RAM, 25 GB SSD | ~$0.03 / hr |
| **Hetzner Cloud** | CX22 (Ubuntu 24.04) | 2 vCPUs, 4 GB RAM, 40 GB NVMe | ~€0.01 / hr |
| **AWS EC2** | `t3.medium` (Ubuntu 24.04 LTS) | 2 vCPUs, 4 GB RAM, 20 GB EBS | ~$0.04 / hr |
| **Google Cloud (GCP)** | `e2-standard-2` | 2 vCPUs, 8 GB RAM, 20 GB Disk | ~$0.06 / hr |

---

## 3. Step-by-Step Validation Walkthrough

### Step 1: Connect to your Disposable VM via SSH
Open PowerShell or Command Prompt on your Windows computer:
```bash
ssh root@<YOUR-VM-IP-ADDRESS>
```
*(Replace `<YOUR-VM-IP-ADDRESS>` with the public IPv4 address assigned to your VM)*

---

### Step 2: Install Docker and Node.js 22.x (Verified Official Commands)

> [!IMPORTANT]
> The AI Coding Debugger uses Node's native SQLite module (`node:sqlite`), which strictly requires **Node.js $\ge$ 22.5.0**. Ubuntu's default package repository only provides Node.js 18.x. Use the official NodeSource script below to install Node.js 22.x.

Run these commands in your SSH terminal:
```bash
# 1. Update package lists and install base dependencies
apt-get update && apt-get install -y ca-certificates curl gnupg docker.io

# 2. Add official NodeSource Node.js 22.x repository and install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# 3. Verify tool installations
docker --version
node --version
# Output MUST show Node.js v22.5.0 or higher (e.g., v22.14.0)
```

---

### Step 3: Transfer Code Cleanly (Excluding Secrets and Local Files)

Your local development folder on Windows contains local `.env` files, databases, and dependencies. To protect private keys and prevent sending unnecessary files:

#### A. On your Windows laptop (Run in PowerShell from the project folder):
```powershell
# Navigate to the project directory
cd C:\Users\honne\.gemini\antigravity\scratch\ai-coding-debugger

# Package code into a clean tarball, explicitly EXCLUDING secrets, databases, logs, and node_modules
tar --exclude=".env" --exclude="node_modules" --exclude="data/*.sqlite*" --exclude="temp" --exclude="*.log" -czf ai-coding-debugger-clean.tar.gz .

# Upload the clean archive to the VM's /tmp directory
scp ai-coding-debugger-clean.tar.gz root@<YOUR-VM-IP-ADDRESS>:/tmp/
```

#### B. On your Linux VM (Run in the SSH session):
```bash
# Extract into a clean testing workspace
mkdir -p /tmp/ai-coding-debugger
cd /tmp/ai-coding-debugger
tar -xzf /tmp/ai-coding-debugger-clean.tar.gz

# Install production dependencies
npm install --omit=dev

# Write disposable test configuration (ZERO real secrets or credentials)
cat << 'EOF' > .env
NODE_ENV=production
SANDBOX_MODE=container
AI_PROVIDER=mock
SESSION_SECRET=test-disposable-session-secret-64-character-hex-string-for-qa
DB_PATH=/tmp/test-db/debugger.sqlite
SANDBOX_MEMORY_LIMIT=256m
SANDBOX_PIDS_LIMIT=64
SANDBOX_CPUS=1.0
EOF
```

---

### Step 4: Run the Turnkey 26-Gate Security Suite

Make the runner executable and execute the suite:
```bash
chmod +x scripts/run_phase12_validation.sh
./scripts/run_phase12_validation.sh
```

The automated script executes sequentially through all 26 gates:
1. **Prerequisite Check (Step 0)**: Verifies Docker daemon status, cgroup availability, and Node.js $\ge$ 22.5.0. Creates dedicated `$PHASE12_TMP_ROOT`.
2. **Category A (Image Build & Toolchains)**: Builds `Dockerfile.sandbox` (Debian Bookworm base) and verifies all 6 toolchains (Python 3, Node, Java 17, GCC, G++, SQLite3).
3. **Category B (Network Isolation)**: Kernel routing table verification, loopback-only interface check, outbound TCP drop (`ENETUNREACH`), and cloud metadata blocking (`169.254.169.254`). Immediate abort on network breach.
4. **Category C (Filesystem Boundaries)**: Root filesystem immutability (`EROFS`), non-executable `/tmp:noexec` (exit code 126 `EACCES`), 64MB memory-only `/workspace` tmpfs, read-only host directory mounts (`EROFS`), and host Docker socket invisibility. Immediate abort on writable rootfs.
5. **Category D (Privilege De-escalation)**: Non-root execution (`10001:10001`), dropping all 41 Linux capabilities (`CapEff: 0000000000000000`), and locking `NoNewPrivs`. Immediate abort on root privileges.
6. **Category E (Resource Caps & Watchdogs)**: Memory limit (256MB) OOM killer verification (exit 137), fork-bomb PID limit (64 PIDs, `EAGAIN`), CFS CPU quota & multi-process throttling, 2500ms wall-clock timeout, 64KB buffer truncation, and ephemeral workspace cleanup. All tests guarded by 15-second outer watchdogs.
7. **Category F (Application Fail-Closed)**: Verifies production container mode lock, fail-closed rejection without Docker daemon, and guest quota protection using clean mock configurations.
8. **Category G (POSIX SQLite Inode Security)**: Tests native ext4 directory permissions `0700`, main database file permissions `0600`, WAL and SHM sidecars `0600` during active transactions, and symlink attack rejection (`SYM_LINK_DETECTED`).

---

### Step 5: Teardown & Permanent VM Deletion (Protect Your Wallet)

Once the test finishes and shows:
```text
===================================================================
  VALIDATION COMPLETE                                              
===================================================================
Total Gates Tested: 26
Passed: 26 / 26
Failed: 0 / 26

>>> ALL 26 LINUX CONTAINER SANDBOX GATES PASSED SUCCESSFULLY! <<<
```

1. Copy the console output for your records.
2. Disconnect from the SSH session:
   ```bash
   exit
   ```
3. Log in to your cloud provider dashboard (DigitalOcean, AWS, Hetzner, or GCP).
4. Click **Destroy / Delete Instance / Terminate**.
5. The VM is permanently erased. No recurring charges remain. Your personal laptop was never altered or exposed.
