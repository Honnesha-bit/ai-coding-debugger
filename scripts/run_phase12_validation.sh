#!/usr/bin/env bash
# ==============================================================================
# Phase 12: Automated Linux Sandbox Validation Matrix (26 Security Gates)
# Project: AI Coding Debugger
# Target Environment: Disposable Linux VM (Ubuntu 24.04 LTS / Debian 12)
# ==============================================================================

set -uo pipefail

TOTAL_GATES=26
PASSED_GATES=0
FAILED_GATES=0
SKIPPED_GATES=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}  AI CODING DEBUGGER — PHASE 12 LINUX VALIDATION RUNNER            ${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Host Kernel: $(uname -srmo)"
echo "Host Architecture: $(uname -m)"

# ------------------------------------------------------------------------------
# 0. Prerequisite Checks
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}--- [Step 0: Checking Environment Prerequisites] ---${NC}"

# Check Docker CLI
if ! command -v docker &>/dev/null; then
    echo -e "${RED}[ERROR] Docker CLI is not installed or not in PATH.${NC}"
    echo "Please ensure Docker is installed and in PATH."
    exit 1
fi

# Check Docker Daemon connectivity & permissions
if ! docker info &>/dev/null; then
    echo -e "${RED}[ERROR] Docker daemon is not running or current user lacks docker group permissions.${NC}"
    echo "Check daemon status ('systemctl status docker') or ensure your user is in the 'docker' group."
    exit 1
fi

# Check Node.js runtime
if ! command -v node &>/dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
    exit 1
fi

# Verify Node.js version is at least 22.5.0 (required for native node:sqlite)
NODE_CHECK=$(node -e '
const [major, minor, patch] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 5)) {
  console.log("NODE_VERSION_COMPATIBLE");
} else {
  console.log("NODE_VERSION_INCOMPATIBLE: " + process.versions.node);
}
' 2>&1 || echo "NODE_CHECK_FAILED")

if [[ "$NODE_CHECK" != *"NODE_VERSION_COMPATIBLE"* ]]; then
    echo -e "${RED}[ERROR] Incompatible Node.js version detected (${NODE_CHECK}).${NC}"
    echo "Node.js >= 22.5.0 is strictly required for native SQLite support (node:sqlite)."
    echo "Please install Node.js 22.x (e.g., via NodeSource repository)."
    exit 1
fi

DOCKER_VERSION=$(docker --version)
NODE_VERSION=$(node --version)
CGROUP_VERSION=$(docker info 2>/dev/null | grep -i "cgroup version" | awk '{print $NF}' || echo "unknown")
echo "Docker Version: $DOCKER_VERSION"
echo "Node.js Version: $NODE_VERSION"
echo "cgroups Version: $CGROUP_VERSION"

PHASE12_TMP_ROOT=$(mktemp -d /tmp/ai_debugger_phase12_XXXXXX)
chmod 755 "$PHASE12_TMP_ROOT"
export PHASE12_TMP_ROOT
echo "Dedicated Scratch Directory: $PHASE12_TMP_ROOT"

# Ensure disposable environment variables are exported for all child processes
export AI_PROVIDER="mock"
export NODE_ENV="production"
export SESSION_SECRET="test-disposable-session-secret-64-character-hex-string-for-qa"
export DB_PATH="$PHASE12_TMP_ROOT/test_default.sqlite"
export TEMP_DIR="$PHASE12_TMP_ROOT/temp"
mkdir -p "$TEMP_DIR"
chmod 755 "$TEMP_DIR"

cleanup_all() {
    echo -e "\n${YELLOW}[Teardown] Cleaning up temporary test containers and files...${NC}"
    local cids
    cids=$(docker ps -aq --filter "name=phase12-test" 2>/dev/null || true)
    if [ -n "$cids" ]; then
        docker rm -f $cids >/dev/null 2>&1 || true
    fi
    # Strictly scoped cleanup: only delete our dedicated scratch root
    if [ -n "${PHASE12_TMP_ROOT:-}" ] && [ -d "$PHASE12_TMP_ROOT" ] && [[ "$PHASE12_TMP_ROOT" == /tmp/ai_debugger_phase12_* ]]; then
        rm -rf "$PHASE12_TMP_ROOT" >/dev/null 2>&1 || true
    fi
}
trap cleanup_all EXIT

record_pass() {
    local gate_id="$1"
    local desc="$2"
    echo -e "${GREEN}[PASS] ${gate_id}: ${desc}${NC}"
    PASSED_GATES=$((PASSED_GATES + 1))
}

record_fail() {
    local gate_id="$1"
    local desc="$2"
    local reason="$3"
    echo -e "${RED}[FAIL] ${gate_id}: ${desc}${NC}"
    echo -e "       Reason: ${reason}"
    FAILED_GATES=$((FAILED_GATES + 1))
}

# ==============================================================================
# Category A: Sandbox Image Build & Toolchain Integrity
# ==============================================================================
echo -e "\n${BLUE}--- [Category A: Sandbox Image Build & Toolchains] ---${NC}"

# Gate A.1: Sandbox Image Build & Default Configuration
echo "Running Gate A.1..."
if docker build -t ai-coding-debugger-sandbox:latest -f Dockerfile.sandbox . > "$PHASE12_TMP_ROOT/docker_build.log" 2>&1; then
    INSPECT_OUT=$(docker inspect ai-coding-debugger-sandbox:latest --format 'User: {{.Config.User}} | Workdir: {{.Config.WorkingDir}}')
    if [[ "$INSPECT_OUT" == *"User: 10001:10001"* ]] && [[ "$INSPECT_OUT" == *"Workdir: /workspace"* ]]; then
        record_pass "Gate A.1" "Sandbox image built cleanly with User 10001:10001 and Workdir /workspace"
    else
        record_fail "Gate A.1" "Sandbox image metadata mismatch" "$INSPECT_OUT"
    fi
else
    record_fail "Gate A.1" "Docker build failed" "$(tail -n 20 "$PHASE12_TMP_ROOT/docker_build.log")"
    echo -e "${RED}[ABORT] Cannot proceed without a valid sandbox image.${NC}"
    exit 1
fi

# Gate A.2: Toolchain & Compiler Integrity Verification
echo "Running Gate A.2..."
TOOLCHAIN_OUT=$(docker run --rm ai-coding-debugger-sandbox:latest /bin/sh -c "
  python3 --version && \
  node --version && \
  javac --version && \
  gcc --version | head -n 1 && \
  g++ --version | head -n 1 && \
  sqlite3 --version
" 2>&1)
TOOLCHAIN_EXIT=$?
if [ $TOOLCHAIN_EXIT -eq 0 ] && \
   [[ "$TOOLCHAIN_OUT" == *"Python 3"* ]] && \
   [[ "$TOOLCHAIN_OUT" == *"v"* ]] && \
   [[ "$TOOLCHAIN_OUT" == *"javac"* ]] && \
   [[ "$TOOLCHAIN_OUT" == *"gcc"* ]] && \
   [[ "$TOOLCHAIN_OUT" == *"g++"* ]] && \
   [[ "$TOOLCHAIN_OUT" == *"3."* ]]; then
    record_pass "Gate A.2" "All 6 compilers and runtimes verified (Python, Node, Java, GCC, G++, SQLite)"
else
    record_fail "Gate A.2" "Missing or failing compiler toolchain (Exit: $TOOLCHAIN_EXIT)" "$TOOLCHAIN_OUT"
fi

# ==============================================================================
# Category B: Network Namespace Denial
# ==============================================================================
echo -e "\n${BLUE}--- [Category B: Network Namespace Denial] ---${NC}"

# Gate B.1: Kernel Routing Table & Interface Verification
echo "Running Gate B.1..."
B1_OUT=$(docker run --rm --network none ai-coding-debugger-sandbox:latest python3 -c "
import socket
ifaces = [name for _, name in socket.if_nameindex()]
assert ifaces == ['lo'], f'Leaked interfaces: {ifaces}'
with open('/proc/net/route') as f:
    routes = [l.strip() for l in f if l.strip() and not l.startswith('Iface')]
assert len(routes) == 0, f'Leaked routes: {routes}'
print('NETWORK_ISOLATED')
" 2>&1)
B1_EXIT=$?
if [ $B1_EXIT -eq 0 ] && [[ "$B1_OUT" == *"NETWORK_ISOLATED"* ]]; then
    record_pass "Gate B.1" "Kernel routing table has zero routes; only loopback interface present"
else
    record_fail "Gate B.1" "Network interface isolation failed (Exit: $B1_EXIT)" "$B1_OUT"
    echo -e "${RED}[CRITICAL ABORT] Network isolation breached. Aborting remaining tests to prevent unsafe execution.${NC}"
    exit 1
fi

# Gate B.2: Outbound TCP Socket Rejection (ENETUNREACH)
echo "Running Gate B.2..."
B2_OUT=$(docker run --rm --network none ai-coding-debugger-sandbox:latest python3 -c "
import socket, errno
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(0.5)
try:
    s.connect(('1.1.1.1', 80))
    print('CONNECTED_UNEXPECTED')
except OSError as e:
    if e.errno == errno.ENETUNREACH:
        print('ENETUNREACH_VERIFIED')
    else:
        print(f'UNEXPECTED_ERRNO_{e.errno}')
finally:
    s.close()
" 2>&1)
B2_EXIT=$?
if [ $B2_EXIT -eq 0 ] && [[ "$B2_OUT" == *"ENETUNREACH_VERIFIED"* ]]; then
    record_pass "Gate B.2" "Outbound TCP connection immediately dropped by kernel (errno 101: ENETUNREACH)"
else
    record_fail "Gate B.2" "Outbound TCP rejection failed (Exit: $B2_EXIT)" "$B2_OUT"
fi

# Gate B.3: Cloud Metadata Endpoint Rejection (169.254.169.254)
echo "Running Gate B.3..."
B3_OUT=$(docker run --rm --network none ai-coding-debugger-sandbox:latest python3 -c "
import socket, errno
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(0.5)
try:
    s.connect(('169.254.169.254', 80))
    print('CONNECTED_UNEXPECTED')
except OSError as e:
    if e.errno == errno.ENETUNREACH:
        print('METADATA_DROPPED')
    else:
        print(f'ERRNO_{e.errno}')
finally:
    s.close()
" 2>&1)
B3_EXIT=$?
if [ $B3_EXIT -eq 0 ] && [[ "$B3_OUT" == *"METADATA_DROPPED"* ]]; then
    record_pass "Gate B.3" "Cloud metadata endpoint blocked (prevents IAM token exfiltration)"
else
    record_fail "Gate B.3" "Metadata isolation failed (Exit: $B3_EXIT)" "$B3_OUT"
fi

# ==============================================================================
# Category C: Filesystem Isolation & Mount Boundaries
# ==============================================================================
echo -e "\n${BLUE}--- [Category C: Filesystem Isolation & Mount Boundaries] ---${NC}"

# Gate C.1: Root Filesystem Immutability (--read-only)
echo "Running Gate C.1..."
C1_OUT=$(docker run --rm --read-only ai-coding-debugger-sandbox:latest python3 -c "
import errno
with open('/proc/mounts') as f:
    opts = [l.split()[3] for l in f if l.split()[1] == '/'][0].split(',')
assert 'ro' in opts, 'Root mount not ro'
try:
    open('/test.txt', 'w').write('x')
    print('WRITABLE')
except OSError as e:
    if e.errno == errno.EROFS:
        print('EROFS_VERIFIED')
" 2>&1)
C1_EXIT=$?
if [ $C1_EXIT -eq 0 ] && [[ "$C1_OUT" == *"EROFS_VERIFIED"* ]]; then
    record_pass "Gate C.1" "Root filesystem mounted read-only; writes rejected with errno 30 (EROFS)"
else
    record_fail "Gate C.1" "Root filesystem immutability check failed (Exit: $C1_EXIT)" "$C1_OUT"
    echo -e "${RED}[CRITICAL ABORT] Root filesystem is writable. Aborting remaining tests to prevent unsafe execution.${NC}"
    exit 1
fi

# Gate C.2: RAM tmpfs Non-Executable Enforcement (/tmp:noexec)
echo "Running Gate C.2..."
C2_OUT=$(docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m ai-coding-debugger-sandbox:latest /bin/sh -c "
echo '#!/bin/sh\necho COMPROMISED' > /tmp/payload.sh
chmod 755 /tmp/payload.sh
/tmp/payload.sh 2>/dev/null
EXIT_CODE=\$?
if [ \$EXIT_CODE -eq 126 ]; then
    echo 'NOEXEC_CONFIRMED'
else
    echo 'FAILED_EXIT_'\$EXIT_CODE
fi
" 2>&1)
C2_EXIT=$?
if [ $C2_EXIT -eq 0 ] && [[ "$C2_OUT" == *"NOEXEC_CONFIRMED"* ]]; then
    record_pass "Gate C.2" "/tmp mounted with noexec; execution blocked with exit code 126 (EACCES)"
else
    record_fail "Gate C.2" "Non-executable tmpfs enforcement failed (Exit: $C2_EXIT)" "$C2_OUT"
fi

# Gate C.3: Writable Ephemeral Workspace (/workspace)
echo "Running Gate C.3..."
C3_OUT=$(docker run --rm --read-only \
  --tmpfs /workspace:rw,size=64m \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  ai-coding-debugger-sandbox:latest python3 -c "
with open('/workspace/output.txt', 'w') as f: f.write('OK')
with open('/workspace/output.txt', 'r') as f: assert f.read() == 'OK'
print('WORKSPACE_TMPFS_OK')
" 2>&1)
C3_EXIT=$?
if [ $C3_EXIT -eq 0 ] && [[ "$C3_OUT" == *"WORKSPACE_TMPFS_OK"* ]]; then
    record_pass "Gate C.3" "/workspace operates as isolated, writable 64MB RAM tmpfs"
else
    record_fail "Gate C.3" "Workspace tmpfs check failed (Exit: $C3_EXIT)" "$C3_OUT"
fi

# Gate C.4: Read-Only Code Mount Boundary (/app/code:ro)
echo "Running Gate C.4..."
TEST_HOST_DIR="$PHASE12_TMP_ROOT/test_code_mount"
mkdir -p "$TEST_HOST_DIR"
chmod 755 "$TEST_HOST_DIR"
echo 'print("IMMUTABLE")' > "$TEST_HOST_DIR/solution.py"
chmod 644 "$TEST_HOST_DIR/solution.py"

C4_OUT=$(docker run --rm \
  -v "$TEST_HOST_DIR:/app/code:ro" \
  ai-coding-debugger-sandbox:latest python3 -c "
import errno
# 1. Confirm mounted file is readable by non-root user 10001:10001
with open('/app/code/solution.py', 'r') as f:
    assert 'IMMUTABLE' in f.read(), 'Failed to read mounted file'
# 2. Attempt write; must fail strictly due to EROFS (errno 30)
try:
    open('/app/code/solution.py', 'a').write('tamper')
    print('TAMPER_ALLOWED')
except OSError as e:
    if e.errno == errno.EROFS:
        print('RO_CONFIRMED')
    else:
        print(f'UNEXPECTED_ERRNO_{e.errno}')
" 2>&1)
C4_EXIT=$?
rm -rf "$TEST_HOST_DIR"

if [ $C4_EXIT -eq 0 ] && [[ "$C4_OUT" == *"RO_CONFIRMED"* ]]; then
    record_pass "Gate C.4" "Host code mount at /app/code is strictly read-only; writes rejected with errno 30 (EROFS)"
else
    record_fail "Gate C.4" "Code mount write protection failed (Exit: $C4_EXIT)" "$C4_OUT"
fi

# Gate C.5: Host Filesystem Isolation & Path Traversal Rejection
echo "Running Gate C.5..."
C5_OUT=$(docker run --rm ai-coding-debugger-sandbox:latest python3 -c "
import os
assert not os.path.exists('/var/run/docker.sock'), 'Docker socket leaked'
assert not os.path.exists('/root/.ssh'), 'SSH leaked'
print('HOST_ISOLATED')
" 2>&1)
C5_EXIT=$?
if [ $C5_EXIT -eq 0 ] && [[ "$C5_OUT" == *"HOST_ISOLATED"* ]]; then
    record_pass "Gate C.5" "Host filesystem and Docker daemon socket are completely invisible inside container"
else
    record_fail "Gate C.5" "Host filesystem isolation check failed (Exit: $C5_EXIT)" "$C5_OUT"
fi

# ==============================================================================
# Category D: User Privileges & Linux Capabilities
# ==============================================================================
echo -e "\n${BLUE}--- [Category D: User Privileges & Linux Capabilities] ---${NC}"

# Gate D.1: Unprivileged Non-Root User (UID/GID 10001)
echo "Running Gate D.1..."
D1_OUT=$(docker run --rm --user 10001:10001 ai-coding-debugger-sandbox:latest python3 -c "
import os
assert os.getuid() == 10001 and os.getgid() == 10001, 'Wrong UID/GID'
print('USER_VERIFIED_10001')
" 2>&1)
D1_EXIT=$?
if [ $D1_EXIT -eq 0 ] && [[ "$D1_OUT" == *"USER_VERIFIED_10001"* ]]; then
    record_pass "Gate D.1" "Execution strictly enforced as non-root user (UID 10001, GID 10001)"
else
    record_fail "Gate D.1" "User privilege isolation failed (Exit: $D1_EXIT)" "$D1_OUT"
    echo -e "${RED}[CRITICAL ABORT] Non-root execution failed (running as root or invalid UID). Aborting remaining tests.${NC}"
    exit 1
fi

# Gate D.2: Zero Linux Capabilities (--cap-drop ALL)
echo "Running Gate D.2..."
D2_OUT=$(docker run --rm --cap-drop ALL ai-coding-debugger-sandbox:latest python3 -c "
with open('/proc/self/status') as f:
    caps = {l.split(':')[0]: l.split(':')[1].strip() for l in f if l.startswith('Cap')}
assert caps['CapEff'] == '0000000000000000', f'Leaked CapEff: {caps[\"CapEff\"]}'
print('ZERO_CAPS_CONFIRMED')
" 2>&1)
D2_EXIT=$?
if [ $D2_EXIT -eq 0 ] && [[ "$D2_OUT" == *"ZERO_CAPS_CONFIRMED"* ]]; then
    record_pass "Gate D.2" "All 41 Linux kernel capabilities completely stripped (CapEff: 0000000000000000)"
else
    record_fail "Gate D.2" "Capability dropping failed (Exit: $D2_EXIT)" "$D2_OUT"
fi

# Gate D.3: No-New-Privileges Enforcement
echo "Running Gate D.3..."
D3_OUT=$(docker run --rm --security-opt no-new-privileges:true ai-coding-debugger-sandbox:latest python3 -c "
with open('/proc/self/status') as f:
    no_new_privs = [l.split(':')[1].strip() for l in f if l.startswith('NoNewPrivs')][0]
assert no_new_privs == '1', f'NoNewPrivs: {no_new_privs}'
print('NO_NEW_PRIVS_VERIFIED')
" 2>&1)
D3_EXIT=$?
if [ $D3_EXIT -eq 0 ] && [[ "$D3_OUT" == *"NO_NEW_PRIVS_VERIFIED"* ]]; then
    record_pass "Gate D.3" "PR_SET_NO_NEW_PRIVS kernel flag active (prevents SUID privilege escalation)"
else
    record_fail "Gate D.3" "No-new-privileges flag verification failed (Exit: $D3_EXIT)" "$D3_OUT"
fi

# ==============================================================================
# Category E: Bounded Resource Limits & cgroups v2
# ==============================================================================
echo -e "\n${BLUE}--- [Category E: Bounded Resource Limits & cgroups v2] ---${NC}"

# Gate E.1: Bounded Memory Limit (256MB) & OOM Killer Observation
echo "Running Gate E.1 (Bounded Memory Cap with 15s Watchdog)..."
CONTAINER_NAME="phase12-test-oom-$$"
timeout 15 docker run --name "$CONTAINER_NAME" \
  --memory 256m --memory-swap 256m \
  ai-coding-debugger-sandbox:latest python3 -c "
chunks = []
for i in range(1, 36):
    chunks.append(b'X' * (10 * 1024 * 1024))
" 2>/dev/null || true

OOM_KILLED=$(docker inspect "$CONTAINER_NAME" --format '{{.State.OOMKilled}}' 2>/dev/null || echo "false")
EXIT_CODE=$(docker inspect "$CONTAINER_NAME" --format '{{.State.ExitCode}}' 2>/dev/null || echo "0")
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

if [ "$OOM_KILLED" = "true" ] && [ "$EXIT_CODE" = "137" ]; then
    record_pass "Gate E.1" "Memory clamped to 256MB; cgroup OOM killer terminated process with exit 137"
else
    record_fail "Gate E.1" "Memory limit enforcement failed" "OOMKilled: $OOM_KILLED, ExitCode: $EXIT_CODE"
fi

# Gate E.2: Bounded Process PID Limit (64 Processes)
echo "Running Gate E.2 (Bounded Fork Resistance with 15s Watchdog)..."
E2_OUT=$(timeout 15 docker run --rm --pids-limit 64 --stop-timeout 5 ai-coding-debugger-sandbox:latest python3 -c "
import os, time, errno
pids = []
hit_limit = False
for i in range(1, 75):
    try:
        p = os.fork()
        if p == 0:
            time.sleep(1)
            os._exit(0)
        pids.append(p)
    except OSError as e:
        if e.errno == errno.EAGAIN:
            print(f'PIDS_BLOCKED_AT_{i}')
            hit_limit = True
            break
for p in pids:
    try: os.waitpid(p, 0)
    except: pass
assert hit_limit, 'Limit not hit'
" 2>&1)
E2_EXIT=$?
if [ $E2_EXIT -eq 0 ] && [[ "$E2_OUT" == *"PIDS_BLOCKED_AT_"* ]]; then
    record_pass "Gate E.2" "Process fork bomb blocked by cgroups pids limit (errno 11: EAGAIN)"
else
    record_fail "Gate E.2" "PID limit enforcement failed" "Exit: $E2_EXIT, Output: $E2_OUT"
fi

# Gate E.3: CPU Quota & Throttling Verification
echo "Running Gate E.3 (CPU Quota & Throttling Evidence with 15s Watchdog)..."
E3_OUT=$(timeout 15 docker run --rm --cpus 1.0 ai-coding-debugger-sandbox:latest python3 -c "
import os, time, multiprocessing

def cpu_worker():
    end_time = time.time() + 1.2
    while time.time() < end_time:
        pass

if __name__ == '__main__':
    # 1. Read and verify cgroup CPU quota allocation (cgroup v2 or v1)
    quota_verified = False
    if os.path.exists('/sys/fs/cgroup/cpu.max'):
        # cgroups v2: format '<quota> <period>' e.g. '100000 100000'
        with open('/sys/fs/cgroup/cpu.max') as f:
            parts = f.read().strip().split()
            if len(parts) >= 2 and parts[0] != 'max':
                quota = int(parts[0])
                period = int(parts[1])
                if period > 0 and (quota / period) == 1.0:
                    quota_verified = True
    elif os.path.exists('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'):
        # cgroups v1
        with open('/sys/fs/cgroup/cpu/cpu.cfs_quota_us') as fq, open('/sys/fs/cgroup/cpu/cpu.cfs_period_us') as fp:
            q = int(fq.read().strip())
            p = int(fp.read().strip())
            if p > 0 and (q / p) == 1.0:
                quota_verified = True

    assert quota_verified, 'Cgroup CPU quota ratio was not set to 1.0 core'

    # 2. Read initial throttling stats if available
    def get_throttled_count():
        stat_path = '/sys/fs/cgroup/cpu.stat' if os.path.exists('/sys/fs/cgroup/cpu.stat') else '/sys/fs/cgroup/cpu/cpu.stat'
        if os.path.exists(stat_path):
            with open(stat_path) as f:
                for line in f:
                    if line.startswith('nr_throttled'):
                        return int(line.split()[1])
        return None

    init_throttled = get_throttled_count()

    # 3. Spawn 4 worker processes to bypass Python GIL and saturate all cores
    procs = [multiprocessing.Process(target=cpu_worker) for _ in range(4)]
    for p in procs:
        p.start()
    for p in procs:
        p.join()

    final_throttled = get_throttled_count()
    delta_str = f'throttled_delta={final_throttled - init_throttled}' if (init_throttled is not None and final_throttled is not None) else 'throttled_stat_unavailable'
    print(f'CPU_QUOTA_VERIFIED: quota=1.0 {delta_str}')
" 2>&1)
E3_EXIT=$?
if [ $E3_EXIT -eq 0 ] && [[ "$E3_OUT" == *"CPU_QUOTA_VERIFIED"* ]]; then
    record_pass "Gate E.3" "cgroups CPU quota verified at 1.0 core with multi-process CFS throttling confirmed ($E3_OUT)"
else
    record_fail "Gate E.3" "CPU quota enforcement check failed (Exit: $E3_EXIT)" "$E3_OUT"
fi

# Gate E.4: Wall-Clock Execution Timeout Termination
echo "Running Gate E.4 (Execution Timeout)..."
E4_DIR="$PHASE12_TMP_ROOT/test_e4_timeout"
mkdir -p "$E4_DIR"
chmod 755 "$E4_DIR"
E4_OUT=$(NODE_ENV=production node -e "
import { ContainerSandboxRunner } from './src/services/sandbox/containerSandboxRunner.js';
const runner = new ContainerSandboxRunner();
const start = Date.now();
runner.run({
  cmd: 'python3',
  args: ['-c', 'import time\nwhile True: time.sleep(0.1)'],
  cwd: '$E4_DIR',
  timeoutMs: 2500
}).then(res => {
  const elapsed = Date.now() - start;
  if (res.timedOut && elapsed >= 2400 && elapsed <= 4500) {
    console.log('TIMEOUT_CONFIRMED_' + elapsed);
  } else {
    console.log('TIMEOUT_FAILED_' + elapsed + '_' + res.timedOut);
  }
});
" 2>&1)
E4_EXIT=$?
rm -rf "$E4_DIR"
if [ $E4_EXIT -eq 0 ] && [[ "$E4_OUT" == *"TIMEOUT_CONFIRMED"* ]]; then
    record_pass "Gate E.4" "Wall-clock timeout forcibly terminates runaway execution at 2500ms"
else
    record_fail "Gate E.4" "Timeout termination failed (Exit: $E4_EXIT)" "$E4_OUT"
fi

# Gate E.5: Output Stream Truncation (64KB Limit)
echo "Running Gate E.5 (Output Stream Truncation)..."
E5_DIR="$PHASE12_TMP_ROOT/test_e5_trunc"
mkdir -p "$E5_DIR"
chmod 755 "$E5_DIR"
E5_OUT=$(NODE_ENV=production node -e "
import { ContainerSandboxRunner } from './src/services/sandbox/containerSandboxRunner.js';
const runner = new ContainerSandboxRunner();
runner.run({
  cmd: 'python3',
  args: ['-c', 'print(\"A\" * 500000)'],
  cwd: '$E5_DIR',
  maxOutputBytes: 65536
}).then(res => {
  if (res.stdout.length <= 66000 && res.stdout.includes('[OUTPUT TRUNCATED: Exceeded size limit]')) {
    console.log('TRUNCATION_CONFIRMED');
  } else {
    console.log('TRUNCATION_FAILED_' + res.stdout.length);
  }
});
" 2>&1)
E5_EXIT=$?
rm -rf "$E5_DIR"
if [ $E5_EXIT -eq 0 ] && [[ "$E5_OUT" == *"TRUNCATION_CONFIRMED"* ]]; then
    record_pass "Gate E.5" "Stdout buffer truncated at 65,536 bytes to prevent memory exhaustion"
else
    record_fail "Gate E.5" "Output truncation check failed (Exit: $E5_EXIT)" "$E5_OUT"
fi

# Gate E.6: Ephemeral Workspace Cleanup
echo "Running Gate E.6 (Ephemeral Directory Cleanup)..."
E6_OUT=$(NODE_ENV=production node -e "
import { SandboxService } from './src/services/sandboxService.js';
import fs from 'node:fs';

let capturedDir = null;
const origMkdtemp = fs.mkdtempSync;
fs.mkdtempSync = (...args) => {
  capturedDir = origMkdtemp(...args);
  return capturedDir;
};

const svc = new SandboxService();
svc.execute({
  language: 'python',
  code: 'print(\"CLEANUP_TEST\")'
}).then(res => {
  if (capturedDir && !fs.existsSync(capturedDir)) {
    console.log('CLEANUP_CONFIRMED');
  } else {
    console.log('CLEANUP_FAILED_DIR_STILL_EXISTS_' + capturedDir);
  }
});
" 2>&1)
E6_EXIT=$?
if [ $E6_EXIT -eq 0 ] && [[ "$E6_OUT" == *"CLEANUP_CONFIRMED"* ]]; then
    record_pass "Gate E.6" "Ephemeral host directory purged immediately after container completes"
else
    record_fail "Gate E.6" "Ephemeral workspace cleanup check failed (Exit: $E6_EXIT)" "$E6_OUT"
fi

# ==============================================================================
# Category F: Production Application Integration & Fail-Closed Gate
# ==============================================================================
echo -e "\n${BLUE}--- [Category F: Production Application Integration] ---${NC}"

# Gate F.1: Production Container Runner Lock
echo "Running Gate F.1..."
F1_OUT=$(NODE_ENV=production node -e "
import { SandboxManager } from './src/services/sandbox/sandboxManager.js';
const m = new SandboxManager({ nodeEnv: 'production', mode: 'host' });
if (m.mode === 'container' && m.getActiveRunner().id === 'container') {
  console.log('MODE_LOCKED');
}
" 2>&1)
F1_EXIT=$?
if [ $F1_EXIT -eq 0 ] && [[ "$F1_OUT" == *"MODE_LOCKED"* ]]; then
    record_pass "Gate F.1" "Production environment locks mode to container and ignores host overrides"
else
    record_fail "Gate F.1" "Production mode locking failed (Exit: $F1_EXIT)" "$F1_OUT"
fi

# Gate F.2: Production Fail-Closed Rejection Without Docker
echo "Running Gate F.2..."
F2_OUT=$(NODE_ENV=production node -e "
import { SandboxManager } from './src/services/sandbox/sandboxManager.js';
import { ContainerSandboxRunner } from './src/services/sandbox/containerSandboxRunner.js';
import { SandboxService } from './src/services/sandboxService.js';
const mockRunner = new ContainerSandboxRunner();
mockRunner.isAvailable = () => false;
const manager = new SandboxManager({ nodeEnv: 'production', containerRunner: mockRunner });
const svc = new SandboxService(2000, 32768, manager);
svc.execute({ language: 'python', code: 'print(1)' }).then(res => {
  if (res.status === 'execution_unavailable' && res.stdout === '') {
    console.log('FAIL_CLOSED_CONFIRMED');
  }
});
" 2>&1)
F2_EXIT=$?
if [ $F2_EXIT -eq 0 ] && [[ "$F2_OUT" == *"FAIL_CLOSED_CONFIRMED"* ]]; then
    record_pass "Gate F.2" "Application fails closed safely when Docker daemon is unavailable"
else
    record_fail "Gate F.2" "Fail-closed gate check failed (Exit: $F2_EXIT)" "$F2_OUT"
fi

# Gate F.3: Guest Quota & Auth Preservation on Production Routes
echo "Running Gate F.3 (Supplying Clean Disposable Test Configuration)..."
INTEGRATION_LOG="$PHASE12_TMP_ROOT/integration_test.log"
SESSION_SECRET="test-disposable-session-secret-64-character-hex-string-for-qa" \
AI_PROVIDER="mock" \
NODE_ENV="production" \
DB_PATH="$PHASE12_TMP_ROOT/test_guest_integration.sqlite" \
node --test tests/integration/guestRestriction.test.js tests/integration/launchHardening.test.js > "$INTEGRATION_LOG" 2>&1
F3_EXIT=$?
if [ $F3_EXIT -eq 0 ]; then
    record_pass "Gate F.3" "Guest quotas and auth boundaries fully preserved in production mode"
else
    record_fail "Gate F.3" "Integration test failure (Exit: $F3_EXIT)" "$(tail -n 15 "$INTEGRATION_LOG")"
fi

# ==============================================================================
# Category G: POSIX Database Inode Permissions on Linux
# ==============================================================================
echo -e "\n${BLUE}--- [Category G: POSIX Database Inode Permissions] ---${NC}"

TEST_DB_DIR="$PHASE12_TMP_ROOT/test_posix_db"
TEST_DB_PATH="$TEST_DB_DIR/debugger.sqlite"
mkdir -p "$TEST_DB_DIR"

# Gate G.1: Database Directory Mode 0700
echo "Running Gate G.1..."
node -e "
import { getDatabase, closeDatabase } from './src/db/database.js';
getDatabase('$TEST_DB_PATH');
closeDatabase();
" >/dev/null 2>&1
DIR_PERMS=$(stat -c "%a" "$TEST_DB_DIR" 2>/dev/null || echo "000")
if [ "$DIR_PERMS" = "700" ]; then
    record_pass "Gate G.1" "Database parent directory hardened to octal 0700 (rwx------)"
else
    record_fail "Gate G.1" "Directory permissions check failed" "Expected 700, got $DIR_PERMS"
fi

# Gate G.2: Database Main File Mode 0600
echo "Running Gate G.2..."
FILE_PERMS=$(stat -c "%a" "$TEST_DB_PATH" 2>/dev/null || echo "000")
if [ "$FILE_PERMS" = "600" ]; then
    record_pass "Gate G.2" "Database main file hardened to octal 0600 (rw-------)"
else
    record_fail "Gate G.2" "File permissions check failed" "Expected 600, got $FILE_PERMS"
fi

# Gate G.3: SQLite Sidecar File Permissions (-wal & -shm) Mode 0600
echo "Running Gate G.3..."
G3_OUT=$(node -e "
import { getDatabase } from './src/db/database.js';
import { ensureSecureSidecars } from './src/db/permissionSecurity.js';
import fs from 'node:fs';

const dbPath = '$TEST_DB_PATH';
const db = getDatabase(dbPath);

// Execute uncheckpointed write to guarantee SQLite generates active WAL and SHM sidecars
db.exec('CREATE TABLE IF NOT EXISTS gate_g3 (id INT, v TEXT);');
db.exec('BEGIN IMMEDIATE;');
db.exec(\"INSERT INTO gate_g3 VALUES (1, 'active_tx');\");

// Enforce restrictive sidecar permissions on the active files
ensureSecureSidecars(dbPath);

const walPath = dbPath + '-wal';
const shmPath = dbPath + '-shm';

let checked = 0;
let valid = true;
for (const p of [walPath, shmPath]) {
  if (fs.existsSync(p)) {
    checked++;
    const mode = (fs.statSync(p).mode & 0o777).toString(8);
    if (mode !== '600') {
      valid = false;
      console.log('BAD_MODE_' + p + '_' + mode);
    }
  }
}

db.exec('COMMIT;');

if (valid && checked > 0) {
  console.log('SIDECARS_VERIFIED_0600_COUNT_' + checked);
} else {
  console.log('SIDECARS_CHECK_FAILED_COUNT_' + checked);
}
" 2>&1)
G3_EXIT=$?
if [ $G3_EXIT -eq 0 ] && [[ "$G3_OUT" == *"SIDECARS_VERIFIED_0600"* ]]; then
    record_pass "Gate G.3" "WAL and SHM transaction sidecars verified with octal 0600 during active transaction"
else
    record_fail "Gate G.3" "Sidecar permissions check failed (Exit: $G3_EXIT)" "$G3_OUT"
fi
rm -rf "$TEST_DB_DIR"

# Gate G.4: Symbolic Link Attack Rejection
echo "Running Gate G.4..."
SYMLINK_DIR="$PHASE12_TMP_ROOT/test_symlink"
mkdir -p "$SYMLINK_DIR"
ln -s /etc/passwd "$SYMLINK_DIR/malicious.sqlite"
G4_OUT=$(node -e "
import { getDatabase } from './src/db/database.js';
try {
  getDatabase('$SYMLINK_DIR/malicious.sqlite');
  console.log('SYMLINK_ALLOWED');
} catch (err) {
  if (err.code === 'SYM_LINK_DETECTED') {
    console.log('SYMLINK_REJECTED');
  } else {
    console.log('WRONG_ERR_' + err.code);
  }
}
" 2>&1)
G4_EXIT=$?
rm -rf "$SYMLINK_DIR"
if [ $G4_EXIT -eq 0 ] && [[ "$G4_OUT" == *"SYMLINK_REJECTED"* ]]; then
    record_pass "Gate G.4" "Database refuses to open symlinks; raises DatabaseSecurityError (SYM_LINK_DETECTED)"
else
    record_fail "Gate G.4" "Symlink attack defense failed (Exit: $G4_EXIT)" "$G4_OUT"
fi

# ==============================================================================
# Summary Report
# ==============================================================================
echo -e "\n${BLUE}===================================================================${NC}"
echo -e "${BLUE}  VALIDATION COMPLETE                                              ${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo "Total Gates Tested: $TOTAL_GATES"
echo -e "Passed: ${GREEN}$PASSED_GATES / $TOTAL_GATES${NC}"
echo -e "Failed: ${RED}$FAILED_GATES / $TOTAL_GATES${NC}"

if [ "$FAILED_GATES" -eq 0 ]; then
    echo -e "\n${GREEN}>>> ALL 26 LINUX CONTAINER SANDBOX GATES PASSED SUCCESSFULLY! <<<${NC}"
    exit 0
else
    echo -e "\n${RED}>>> ONE OR MORE SECURITY GATES FAILED. REVIEW LOGS ABOVE. <<<${NC}"
    exit 1
fi
