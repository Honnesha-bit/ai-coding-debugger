# Phase 16: Linux Host Preflight Inspection & Safe Transfer Instructions

**Project:** AI Coding Debugger  
**Date:** October 19, 2026  
**Auditor Role:** Senior Application Security Engineer & Linux Container Security Specialist  
**Transfer Package:** `C:\Users\honne\.gemini\antigravity\scratch\ai-coding-debugger-transfer\ai-coding-debugger-validation-package.tar.gz`  
**Package Size:** **377,076 bytes (368 KB / 0.36 MB)**  
**Package SHA-256:** `11a578675ffcc2025c5771b96733d60eb13bf7f56e77c5bb1e663b4f8c6ab857`  
**Preflight Status:** **AWAITING LINUX HOST TERMINAL OUTPUT (Not Yet Executed on Linux)**  
**Validation Gate Status:** **All 26 Security Gates Strictly Marked `NOT RUN`**

---

## 1. Status of Verification: Windows Host vs. Linux Target

In accordance with strict authorization boundaries, checks performed locally on the Windows development workstation are cleanly distinguished from checks that must be executed on the Linux host:

### Checks Verified on the Windows Workstation:
- [x] **Original Project Untouched:** The application directory [`C:\Users\honne\.gemini\antigravity\scratch\ai-coding-debugger`](file:///C:/Users/honne/.gemini/antigravity/scratch/ai-coding-debugger) is unmodified.
- [x] **Local Test Suite Integrity:** All 230 unit and integration tests pass cleanly (`npm.cmd test`).
- [x] **Isolated Staging Folder:** Transfer package was created in a separate directory: `C:\Users\honne\.gemini\antigravity\scratch\ai-coding-debugger-transfer`.
- [x] **Confidentiality Audit:** Programmatic audit verified zero `.env` files (only `.env.example`), zero `.sqlite` databases/sidecars, zero `node_modules`, zero `.log` files, and zero keys or certificates.
- [x] **Transfer Archive Integrity:** `ai-coding-debugger-validation-package.tar.gz` (377,076 bytes) generated with SHA-256 `11a578675ffcc2025c5771b96733d60eb13bf7f56e77c5bb1e663b4f8c6ab857`.
- [x] **Zero Host Modifications:** Zero software, packages, Docker, WSL, or system settings were installed or changed on Windows.

### Checks Requiring the Target Linux Computer (Pending User Execution):
- [ ] Genuine Linux kernel and architecture confirmation (`uname -srmo`, `uname -m`).
- [ ] Node.js version $\ge 22.5.0$ verification for native `node:sqlite`.
- [ ] Docker CLI and Docker daemon accessibility by the current user without `sudo`.
- [ ] Docker security profile (cgroups version, storage driver, security options).
- [ ] Host disk space ($\ge 2$ GB free) and memory ($\ge 1$ GB available).
- [ ] Host archivers and utilities (`tar`, `gzip`, `sha256sum`, `curl`).
- [ ] Archive transfer integrity verification on the Linux machine (`sha256sum -c`).

---

## 2. How to Open a Terminal and Run Preflight on Your Linux Computer

1. **If using a Remote Linux Server / Cloud VM via SSH:**
   - On your Windows laptop, open PowerShell or Command Prompt.
   - Connect to your Linux machine:
     ```bash
     ssh <username>@<linux-host-ip>
     ```
     *(e.g., `ssh ubuntu@192.168.1.50` or `ssh root@203.0.113.10`)*

2. **If using a Local Linux Machine / Dedicated Desktop:**
   - Log in to your Linux desktop.
   - Open your terminal application (e.g. GNOME Terminal, Konsole, xterm, or press `Ctrl + Alt + T`).

3. **Run the Preflight Script:**
   - Copy the entire read-only preflight command block from **Section 3** below.
   - Paste it directly into your Linux terminal and press `Enter`.
   - The script will run non-destructively in approximately 3 seconds.

4. **Saving Output Safely:**
   - Select and copy the terminal output.
   - Confirm that the output does not contain private IP addresses, passwords, or personal account names before sharing.
   - Paste the terminal output into our conversation so we can verify the environment against the decision criteria.

---

## 3. Exact Linux Preflight Script (Read-Only & Non-Destructive)

> [!IMPORTANT]
> This script does **NOT** install software, does **NOT** use `sudo`, does **NOT** alter configuration files, and does **NOT** print environment variables or secrets.

```bash
echo "==================================================================="
echo "  AI CODING DEBUGGER — LINUX HOST PREFLIGHT INSPECTION             "
echo "==================================================================="

echo -e "\n--- [1. Host Kernel & CPU Architecture] ---"
uname -srmo
uname -m

echo -e "\n--- [2. Node.js Version & node:sqlite Compatibility] ---"
if command -v node &>/dev/null; then
  node --version
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major > 22 || (major === 22 && minor >= 5)) {
      console.log("[PREFLIGHT PASS] Node.js " + process.versions.node + " is compatible with native node:sqlite.");
    } else {
      console.log("[PREFLIGHT WARNING] Node.js " + process.versions.node + " is older than 22.5.0. node:sqlite strictly requires >= 22.5.0.");
    }
  '
else
  echo "[PREFLIGHT NOTICE] Node.js is not yet installed in PATH."
fi

echo -e "\n--- [3. Docker CLI Version] ---"
if command -v docker &>/dev/null; then
  docker --version
else
  echo "[PREFLIGHT FAIL] Docker CLI is not installed or not in PATH."
fi

echo -e "\n--- [4. Docker Daemon Status & User Permissions] ---"
if docker info &>/dev/null; then
  echo "[PREFLIGHT PASS] Docker daemon is running and current user has access."
else
  echo "[PREFLIGHT FAIL] Cannot connect to Docker daemon."
  echo "Check if daemon is active ('systemctl status docker') or if your user belongs to the 'docker' group."
fi

echo -e "\n--- [5. Docker Security & Runtime Configuration] ---"
if docker info &>/dev/null; then
  docker info 2>/dev/null | grep -E "Server Version|Cgroup Version|Cgroup Driver|Storage Driver|Operating System|OSType|Architecture|Security Options" || true
fi

echo -e "\n--- [6. Host Utilities & Archivers] ---"
for cmd in tar gzip sha256sum curl; do
  if command -v "$cmd" &>/dev/null; then
    echo "  [FOUND] $cmd: $(command -v "$cmd")"
  else
    echo "  [MISSING] $cmd is missing from PATH"
  fi
done

echo -e "\n--- [7. Available Disk Space & RAM] ---"
df -h /tmp .
free -m

echo -e "\n--- [8. Non-Root Docker Execution Test] ---"
if docker ps &>/dev/null; then
  echo "[PREFLIGHT PASS] Current account can execute Docker commands without sudo."
else
  echo "[PREFLIGHT FAIL] Current account cannot list containers without sudo."
fi

echo -e "\n==================================================================="
echo "  PREFLIGHT COMPLETE — REVIEW RESULTS ABOVE                        "
echo "==================================================================="
```

---

## 4. Expected Results & Decision Criteria

When reviewing your terminal output, each check must satisfy the following criteria:

| Preflight Check | Target Requirement | Decision Criterion |
| :--- | :--- | :--- |
| **1. Operating System** | Linux Kernel 5.x or 6.x | `uname -srmo` must report `Linux` (e.g. `Linux 6.8.0-xx x86_64 GNU/Linux`). Non-Linux environments fail. |
| **2. Architecture** | x86_64 / amd64 or arm64 | Must report `x86_64` or `aarch64`. |
| **3. Node.js Runtime** | Node.js $\ge$ 22.5.0 | Output must show `v22.5.0` or higher (e.g., `v22.14.0`). If Node.js is 18.x or 20.x, native `node:sqlite` will fail. |
| **4. Docker CLI** | Docker CLI 20.10+ to 27.x | `docker --version` must return cleanly. |
| **5. Docker Daemon** | Daemon active & responding | Check 4 must print `[PREFLIGHT PASS] Docker daemon is running and current user has access.` |
| **6. Security Options** | cgroups v2 / v1 support | Check 5 must show `Cgroup Version: 2` (or `1`) and `Security Options: ... seccomp, apparmor`. |
| **7. Host Utilities** | `tar`, `gzip`, `sha256sum` | All 3 archiver utilities must be reported as `[FOUND]`. |
| **8. Free Storage** | $\ge 2$ GB available on `/tmp` | `df -h /tmp` must show at least 2 GB free for image build and temporary scratch files. |
| **9. Available RAM** | $\ge 1$ GB free memory | `free -m` must show at least 1024 MB available. |
| **10. Permission Mode** | Non-root Docker execution | Check 8 must report `[PREFLIGHT PASS] Current account can execute Docker commands without sudo.` |

### Failure Policy:
- **If any check fails (e.g. Docker unavailable, permission denied, Node.js incompatible):**  
  We will **STOP immediately** and explain the specific deficiency. We will **NOT** execute `sudo` commands, alter system configurations, or attempt automated repairs.
- **Do not transfer or extract the package until all preflight criteria are satisfied.**

---

## 5. Next Transfer & Validation Steps (Holding State — Do NOT Run Automatically)

Once you supply the preflight output and all criteria pass, the procedure will proceed in these exact steps:

### Step 1: Copy Archive and Checksum File to the Linux Host
From PowerShell on your Windows workstation:
```powershell
cd C:\Users\honne\.gemini\antigravity\scratch\ai-coding-debugger-transfer
scp ai-coding-debugger-validation-package.tar.gz <USER>@<LINUX-HOST-IP>:/tmp/
scp ai-coding-debugger-validation-package.tar.gz.sha256 <USER>@<LINUX-HOST-IP>:/tmp/
```

### Step 2: Verify Checksum on the Linux Host
In your Linux terminal:
```bash
cd /tmp
sha256sum -c ai-coding-debugger-validation-package.tar.gz.sha256
# Expected output:
# ai-coding-debugger-validation-package.tar.gz: OK
```
*If checksum verification fails, the archive must NOT be extracted.*

### Step 3: Inspect Archive Contents Without Extracting
```bash
# Verify no real .env file exists (only ./.env.example)
tar -ztvf ai-coding-debugger-validation-package.tar.gz | grep -E "\.env$|\.env\."

# Verify no SQLite database exists (should output 0 lines)
tar -ztvf ai-coding-debugger-validation-package.tar.gz | grep "\.sqlite"
```

### Step 4: Extract into a Dedicated Disposable Directory
```bash
mkdir -p /tmp/ai-coding-debugger-validation
cd /tmp/ai-coding-debugger-validation
tar -xzf /tmp/ai-coding-debugger-validation-package.tar.gz
```

### Step 5: Install Production Dependencies (When Approved)
```bash
npm install --omit=dev
```

### Step 6: Create Disposable Mock Test Environment
```bash
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

### Step 7: Run Validation Suite (ONLY When Explicitly Authorized)
```bash
chmod +x scripts/run_phase12_validation.sh
./scripts/run_phase12_validation.sh 2>&1 | tee /tmp/phase12_validation_results.log
```

---

## 6. Complete 26-Gate Security Matrix (All Marked `NOT RUN`)

Every security gate is defined in `scripts/run_phase12_validation.sh` and remains strictly marked **`NOT RUN`**:

| Gate | Category | Description | Isolation Property / Assertion | Status |
| :---: | :--- | :--- | :--- | :---: |
| **A.1** | Image Build | Docker Sandbox Image Build | Non-root User `10001:10001`, Workdir `/workspace` | `NOT RUN` |
| **A.2** | Image Build | Compiler Toolchain Integrity | Python 3, Node, Java 17, GCC, G++, SQLite3 verified | `NOT RUN` |
| **B.1** | Network | Kernel Routing Table Denial | Zero routes, loopback only (abort on failure) | `NOT RUN` |
| **B.2** | Network | Outbound TCP Socket Drop | Connect to `1.1.1.1` drops with `ENETUNREACH` | `NOT RUN` |
| **B.3** | Network | Cloud Metadata Endpoint Drop | Connect to `169.254.169.254` blocked with `ENETUNREACH` | `NOT RUN` |
| **C.1** | Filesystem | Root Filesystem Immutability | Root mount `ro`; write fails with `EROFS` (abort on failure) | `NOT RUN` |
| **C.2** | Filesystem | Non-Executable `/tmp:noexec` | Script execution in `/tmp` rejected with exit 126 (`EACCES`) | `NOT RUN` |
| **C.3** | Filesystem | Isolated Writable Workspace | `/workspace` backed by isolated 64MB RAM tmpfs | `NOT RUN` |
| **C.4** | Filesystem | Read-Only Host Code Mount | `/app/code` readable by 10001, writes rejected with `EROFS` | `NOT RUN` |
| **C.5** | Filesystem | Host & Socket Invisibility | Docker socket & SSH keys completely hidden | `NOT RUN` |
| **D.1** | Privilege | Non-Root User Enforcement | Process runs as `UID 10001:GID 10001` (abort on failure) | `NOT RUN` |
| **D.2** | Privilege | Zero Linux Capabilities | All 41 capabilities stripped (`CapEff: 0000000000000000`) | `NOT RUN` |
| **D.3** | Privilege | No-New-Privileges Flag | `PR_SET_NO_NEW_PRIVS == 1` prevents SUID escalation | `NOT RUN` |
| **E.1** | Resources | 256MB Memory Cap & OOM | Allocation past 256MB triggers cgroup OOM killer (exit 137) | `NOT RUN` |
| **E.2** | Resources | 64 PID Fork-Bomb Resistance | Spawning $>64$ processes rejected with `EAGAIN` | `NOT RUN` |
| **E.3** | Resources | CPU Quota & CFS Throttling | 1.0 CPU quota verified; multiprocessing triggers throttling | `NOT RUN` |
| **E.4** | Resources | 2500ms Wall-Clock Timeout | Runaway execution forcibly terminated at 2500ms | `NOT RUN` |
| **E.5** | Resources | 64KB Buffer Truncation | Stdout clamped at 65,536 bytes with warning marker | `NOT RUN` |
| **E.6** | Resources | Ephemeral Workspace Cleanup | Host temporary execution directory purged on completion | `NOT RUN` |
| **F.1** | Application | Production Mode Locking | `NODE_ENV=production` locks runner to container | `NOT RUN` |
| **F.2** | Application | Production Fail-Closed Gate | Unavailable Docker returns `execution_unavailable` | `NOT RUN` |
| **F.3** | Application | Guest Quota & Auth Boundary | Guest quota (2 attempts) enforced in production mode | `NOT RUN` |
| **G.1** | POSIX DB | Database Directory Mode 0700 | Parent directory permissions hardened to octal `0700` | `NOT RUN` |
| **G.2** | POSIX DB | Database File Mode 0600 | Main SQLite file permissions hardened to octal `0600` | `NOT RUN` |
| **G.3** | POSIX DB | SQLite WAL/SHM Mode 0600 | Sidecars verified `0600` during active transaction | `NOT RUN` |
| **G.4** | POSIX DB | Symbolic Link Rejection | Symlinked database rejected with `SYM_LINK_DETECTED` | `NOT RUN` |

---

## 7. Current Holding State & Action Required

I have stopped execution and will not initiate file transfers or container operations until you:
1. Run the preflight script in Section 3 on your Linux computer.
2. Share the terminal output with me.
3. Explicitly confirm authorization to proceed to the transfer phase.
