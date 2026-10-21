# AI Coding Debugger — College Project Demonstration Guide

**Project**: AI Coding Debugger
**Target URL**: [http://localhost:3000](http://localhost:3000)
**Environment**: Node.js v24+, Docker Desktop (Linux Containers on WSL 2), React 19, SQLite

---

## 1. Overview & Key Innovations to Highlight

During your demonstration, emphasize these core engineering and security achievements:

1. **Genuine Container Sandbox Isolation**:
   - Code executes inside a hardened Linux container (`ai-coding-debugger-sandbox:latest`).
   - Strict runtime constraints: `--network none` (no internet access), `--read-only` root filesystem, `--user 10001:10001` (unprivileged non-root), `--cap-drop ALL`, `no-new-privileges`, 256MB RAM cap, 64 process limit, and 1.0 CPU quota.
   - User source code is mounted read-only at `/app/code:ro`; writable operations occur only in ephemeral RAM tmpfs (`/workspace`).
2. **Fail-Closed Security Policy**:
   - The application **never executes untrusted user submissions directly on the host operating system**.
   - If Docker or the container image is unavailable, it fails closed with `EXECUTION_UNAVAILABLE`, performing static syntax analysis and generating downloadable test suites.
3. **Formal Verification Model & Honest Reporting**:
   - Never awards `FIX VERIFIED` based on exit code 0 alone; tests functional assertions.
   - Generated but unexecuted test cases are labeled `SKIPPED` / `UNAVAILABLE`, **never marked as passed**.
4. **Mandatory Two-Guest-Uses Quota & Work Preservation**:
   - Dual-anchored tracking across session cookies and client IP addresses prevents incognito evasion.
   - On the 3rd attempt, blocks submission with the *Your Free Debugging Uses Are Finished* modal while preserving typed code.

---

## 2. Pre-Demo Setup & Startup

### Step 1: Ensure Docker Desktop is Running
Open Docker Desktop on Windows. Confirm the bottom-left whale icon shows **Engine running** (WSL 2, Linux containers).

### Step 2: Start the Application
Open PowerShell in `C:\Users\honne\Desktop\varun` and run:

```powershell
npm start
```

*The server will start and log:*
```
AI Coding Debugger server running on http://localhost:3000
Environment: development
AI Provider: mock
```

### Step 3: Open in Browser
Navigate to [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or Firefox.

---

## 3. The Five Demonstration Scenarios

### Demo 1: Python Logic Bug (Binary Search Off-by-One)
*Demonstrates: Algorithm bug diagnosis, side-by-side diff, container execution, and test pass verification.*

1. In the Workspace, select **Python 3** from the language dropdown.
2. Paste this code into the editor:
   ```python
   def binary_search(arr, target):
       low = 0
       high = len(arr)
       while low <= high:
           mid = (low + high) // 2
           if arr[mid] == target:
               return mid
           elif arr[mid] < target:
               low = mid + 1
           else:
               high = mid - 1
       return -1

   print(binary_search([1, 3, 5, 7, 9], 7))
   ```
3. In **Error Description**, type: `Off-by-one bug: index error or out-of-bounds search on upper bound`
4. In **Expected Output**, type: `3`
5. Click **Analyze & Repair Code**.
6. **What to Point Out to Evaluators**:
   - **Diagnosis**: Identifies `high = len(arr)` as the off-by-one cause.
   - **Diff Viewer**: Displays unified diff showing `- high = len(arr)` and `+ high = len(arr) - 1`.
   - **Isolation Badge**: Shows `ISOLATION: DOCKER_CONTAINER` in the execution terminal.
   - **Verification Status**: Displays green badge `TESTS PASSED & VERIFIED (CONTAINER)`.

---

### Demo 2: JavaScript Logic Bug (Lexicographical Sorting)
*Demonstrates: JavaScript engine execution, array comparator correction, and assertion passing.*

1. Select **JavaScript (Node.js)**.
2. Paste this code:
   ```javascript
   function sortNumbers(arr) {
       return arr.sort();
   }

   console.log(JSON.stringify(sortNumbers([25, 8, 100, 3])));
   ```
3. In **Error Description**, type: `Numbers sorted lexicographically: 100 sorted before 25`
4. In **Expected Output**, type: `[3,8,25,100]`
5. Click **Analyze & Repair Code**.
6. **What to Point Out**:
   - Explains that `Array.prototype.sort()` sorts as strings by default.
   - Proposes `[...arr].sort((a, b) => a - b)`.
   - Shows pre-fix output `[100, 25, 3, 8]` vs corrected output `[3, 8, 25, 100]`.
   - Verification status: `FIX VERIFIED`.

---

### Demo 3: Syntax Error (Missing Colon & Line Highlighting)
*Demonstrates: Compiler/syntax error parsing, line-level diagnosis, and automated repair feedback.*

1. Select **Python 3**.
2. Paste this code:
   ```python
   def calculate_discount(price, discount)
       return price * (1 - discount)

   print(calculate_discount(100, 0.2))
   ```
3. Click **Analyze & Repair Code**.
4. **What to Point Out**:
   - Categorized as `compilation_error` / `SYNTAX_ERROR`.
   - Line Diagnosis card highlights line 1 with missing `:` explanation.
   - Proposed fix adds the colon: `def calculate_discount(price, discount):`.
   - Re-running candidate code inside the container confirms exit code 0 and output `80.0`.

---

### Demo 4: Runtime Exception (Division by Zero Guard)
*Demonstrates: In-container exception interception, stack trace parsing, and protective defensive repair.*

1. Select **Python 3**.
2. Paste this code:
   ```python
   def calculate_average(numbers):
       return sum(numbers) / len(numbers)

   print(calculate_average([]))
   ```
3. In **Error Description**, type: `ZeroDivisionError when input list is empty`
4. In **Expected Output**, type: `0.0`
5. Click **Analyze & Repair Code**.
6. **What to Point Out**:
   - Original run captures `ZeroDivisionError: division by zero` from Docker container stderr.
   - Proposes defensive guard: `if not numbers: return 0.0`.
   - Corrected code executes in container, exiting 0 with `0.0`. Status: `FIX VERIFIED`.

---

### Demo 5: Security / Hardening: Infinite Loop Timeout
*Demonstrates: Sandbox process control, runaway process termination, and timeout truthfulness.*

1. Select **Python 3**.
2. Paste this code:
   ```python
   def run_loop():
       while True:
           pass

   run_loop()
   ```
3. Click **Analyze & Repair Code**.
4. **What to Point Out**:
   - The container timer limits execution to 5000ms.
   - `docker kill <containerId>` is invoked, terminating all child processes.
   - Status reports `EXECUTION TIMED OUT` / `VERIFICATION_FAILED`.
   - Emphasize: **The system never hangs the server and never falsely claims success**.

---

## 4. Bonus Demos (Advanced Technical Features)

### Bonus Demo A: Java Static Verification & Test Export
*Demonstrates: Fail-closed honesty when local host toolchains are not installed.*
1. Select **Java**.
2. Paste a standard class:
   ```java
   public class Main {
       public static void main(String[] args) {
           System.out.println("Hello from Java");
       }
   }
   ```
3. Click **Analyze & Repair Code**.
4. **What to Point Out**:
   - Because `javac` is not installed on the Windows host, the system **honestly refuses to fake execution**.
   - Assigns `STATIC_CHECK_PASSED` and `TESTS_GENERATED_NOT_RUN`.
   - Click the **Download Tests (test_suite.java)** button: generates a complete, self-contained test file for local offline execution.
   - Test cases are labeled `SKIPPED`, **never falsely claimed as passed**.

### Bonus Demo B: Two-Guest-Uses Rule & Quota Enforcement
*Demonstrates: Monetization/quota boundaries, dual IP/cookie tracking, and work preservation.*
1. Open an Incognito window to `http://localhost:3000/debug`.
2. Observe the badge in the navigation bar: `Free debugging uses remaining: 2`.
3. Submit Attempt 1 (badge drops to `1`).
4. Submit Attempt 2 (badge drops to `0`).
5. Submit Attempt 3:
   - Request is blocked with HTTP 403 `LOGIN_REQUIRED`.
   - The modal *Your Free Debugging Uses Are Finished* appears.
   - Click **Log In** or **Register**: after logging in, a banner appears with **Continue Debugging**, preserving all typed code without loss.

---

## 5. AI Engine Configuration (Google Gemini & Offline Mock)

- **Active Engine**: The server is configured with live **Google Gemini AI** (`AI_PROVIDER=gemini`, model `gemini-flash-lite-latest`).
  - Diagnoses and fixes are generated in real-time by Google Gemini.
  - The UI displays an active badge: `AI PROVIDER: GEMINI`.
- **Offline Fallback**: If internet connectivity is interrupted, setting `AI_PROVIDER=mock` in `.env` enables the built-in deterministic AST analyzer for offline demonstration.
  - In mock mode, the UI clearly identifies `OFFLINE MOCK AST ANALYZER` with an explicit notice to prevent misleading claims.

---

## 6. Troubleshooting During the Demonstration

| Issue | Cause | Immediate Resolution |
|---|---|---|
| **`CONTAINER_RUNTIME_UNAVAILABLE`** | Docker Desktop is closed or starting up. | Start Docker Desktop from Windows Start Menu. Wait until the status whale icon turns green. Refresh the web page. |
| **Port 3000 already in use** | A previous server instance is running. | Run `Get-Process node \| Stop-Process -Force` in PowerShell, then re-run `npm start`. |
| **Guest limit reached during practice** | Browser cookie consumed the 2 attempts. | Click **Register** to create a test user (e.g., `evaluator1` / `Password123!`) for unlimited debugging attempts. |
| **UI styles or assets stale** | Browser cached previous Vite bundle. | Press `Ctrl + Shift + R` (hard refresh) in your browser. |
