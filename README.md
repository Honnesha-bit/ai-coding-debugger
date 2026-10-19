# AI Coding Debugger

**AI Coding Debugger** is a full-stack automated debugging and code verification platform. It enables developers to input buggy code, receive structured AI-powered root-cause diagnoses and minimal corrections, inspect before-and-after unified and structured diffs, and immediately verify the fix inside an isolated execution sandbox.

---

## Key Features

- **Automatic Multi-Language Debugging (16 Languages)**:
  - Supports Python 3, JavaScript (Node.js), TypeScript, SQL (SQLite), HTML5, CSS3, Java, C, C++, C#, Go, Rust, PHP, Ruby, Kotlin, and Swift.
  - Automatic language detection from file extensions, syntax keywords, and structure with uncertain-state notifications.
  - Source file drag-and-drop / upload with instant detection and loading into workspace.
  - 8 canonical verification result categories:
    1. `STATIC_CHECK_PASSED`: Code passed static syntax/structural pattern analysis without dynamic execution.
    2. `STATIC_CHECK_FAILED`: Code failed static delimiter balance or syntax pattern analysis.
    3. `TESTS_GENERATED_NOT_RUN`: Test cases were generated, but dynamic execution was not run because container sandbox was unavailable.
    4. `EXECUTION_UNAVAILABLE`: Dynamic execution was unavailable due to missing container isolation.
    5. `EXECUTION_PASSED_NO_ASSERTIONS`: Dynamic execution ran and exited 0, but no functional assertions were evaluated.
    6. `TESTS_PASSED_VERIFIED`: Dynamic execution ran in isolated container sandbox and passed all assertions.
    7. `TESTS_FAILED_VERIFIED`: Dynamic execution ran in sandbox and failed compilation or assertions.
    8. `VERIFICATION_ERROR`: Verification infrastructure error or timeout.
  - Automatic retry and repair loop: captures compiler/runtime errors from failed sandbox runs and feeds them back to retry and refine fixes.
  - Standalone Test Suite Export: Instant download of self-contained test suites (`.py`, `.js`, `.ts`, `.sql`, `.java`, `.c`/`.cpp`) for local evaluation.
- **AI Diagnostics & Correction**:
  - Simple, understandable English explanation of the bug.
  - Precise technical root cause analysis.
  - Minimal code correction returned according to a strict schema.
  - Evidence-based qualitative confidence indicators (`HIGH`, `MEDIUM`, `LOW`).
  - Affected line numbers highlighted.
- **Multi-Provider Fallback & Hard Call Cap**:
  - Primary provider: Google Gemini (`gemini-flash-latest`).
  - Secondary fallback: OpenAI (`gpt-4o-mini`).
  - Offline / test fallback: Deterministic Mock AI AST provider.
  - `AiCallBudget`: Strictly enforced **hard cap of 3 calls per request** across all retries and fallback cascades, preventing runaway costs and infinite loops.
- **Interactive Diff Viewer**:
  - Unified diff format (`diff` library).
  - Side-by-side line additions (`+`, green) and deletions (`-`, red) with line numbers.
  - Tabbed switching between diff, corrected code, and original code.
- **Isolated Execution Sandbox Architecture**:
  - **Safe Verification Mode (`SANDBOX_MODE=safe_verification`)**: Default in development when Docker is unavailable. Refuses unsafe host execution of arbitrary submitted code, runs static lexical and delimiter analysis with explicit limitation disclaimers, generates comprehensive test suites marked unrun, and offers downloadable test files.
  - **Container Mode (`ContainerSandboxRunner`)**: Production container isolation with `--network none`, `--read-only` root, RAM `tmpfs` mounts at `/tmp:noexec` and `/workspace`, non-root user (`10001:10001`), dropped capabilities (`--cap-drop ALL`), `no-new-privileges`, 256MB memory cap, 64 process limit, and 1.0 CPU quota.
  - **Host Mode (`HostSandboxRunner`)**: Internal runner strictly confined to controlled integration test harnesses with stripped parent process environment, 5000ms clock timeout, 64KB stdout truncation, and ephemeral workspace cleanup.
  - **Fail-Closed Protection**: In production (`NODE_ENV=production`) or safe verification mode, `SandboxManager` safely rejects execution (`execution_unavailable`) if Docker is absent, strictly refusing host execution fallback.
- **Mandatory Two-Guest-Uses Rule & Dual Rate Limiting**:
  - Unauthenticated visitors receive exactly **2 free eligible debugging attempts**.
  - Dynamic usage badge tracks remaining attempts (`"Free debugging uses remaining: 2"`, `1`, `0`).
  - On the 3rd attempt, submission is blocked and the modal appears:
    - **Title**: *Your Free Debugging Uses Are Finished*
    - **Message**: *You've used your 2 free debugging attempts. Please log in or create a free account to continue debugging your code.*
    - **Actions**: **Log In**, **Create Account**, **Maybe Later**.
  - **Dual-Anchored Enforcement**: Tracked simultaneously across session cookie (`guest_sess_...`) AND client IP address (`guest_ip_...`). Cookie rotation or incognito window cycling cannot bypass quota.
  - **Work Preservation**: Code, error descriptions, and test assertions survive the login flow. Post-login, a **Continue Debugging** banner allows one-click submission without retyping.
- **Defense-in-Depth Security**:
  - **Prompt Injection Hardening**: Native system instruction separation with untrusted user input strictly encapsulated inside structured JSON delimiters.
  - **Input Size Caps**: Global 512KB payload ceiling; sourceCode $\le$ 64KB, errorDescription $\le$ 8KB, testCases $\le$ 32KB, passwords $\le$ 128 characters.
  - **POSIX SQLite Hardening**: Database directory enforced at `0700` (`rwx------`), main DB and WAL/SHM sidecars enforced at `0600` (`rw-------`), with symlink attack rejection.
  - **Private Session History**: Parameterized SQL queries and strict user/guest ownership checks prevent cross-tenant data leakage.
- **Evaluation Benchmark**:
  - Frozen dataset of 25 distinct held-out bugs across Python and JavaScript.
  - Evaluates 7 required metrics: Fix Success Rate, Compilation Success Rate, Regression Rate, Explanation Accuracy, Sandbox Failure Rate, Median Latency, Failure Counts.
  - CSV and JSON export with CSV formula injection mitigation (CWE-1236).

---

## Quick Start

### 1. Prerequisites
- **Node.js $\ge$ 22.5.0** (Required for native `node:sqlite` database synchronization).
- **Python 3.10+** (Required for local Python debugging).
- **Docker Engine 24.0+** (Required for production container sandbox isolation).

### 2. Installation
```bash
# Navigate to project directory
cd ai-coding-debugger

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` (sensible defaults provided for offline mock development):
```bash
cp .env.example .env
```
Key configuration settings:
- `PORT`: HTTP port (default `3000`)
- `NODE_ENV`: `development` or `production`
- `AI_PROVIDER`: `mock`, `gemini`, or `openai`
- `GEMINI_API_KEY`: API key for Google Gemini (optional in mock mode)
- `OPENAI_API_KEY`: API key for OpenAI (optional in mock mode)
- `SESSION_SECRET`: Session signing secret ($\ge 32$ characters required in production)
- `MAX_GUEST_USES`: Number of free guest attempts (default `2`)
- `SANDBOX_MODE`: `auto`, `container`, or `host`
- `SANDBOX_TIMEOUT_MS`: Execution timeout in milliseconds (default `5000`)

### 4. Build Frontend
The frontend is built with React 19, TypeScript, and Vite into `public/`:
```bash
# Build production bundle
npm run build

# Or develop client with hot reloading
npm run dev
```

### 5. Start the Application
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## Frontend Architecture & Routes

The client SPA is organized under `client/src/` with dedicated pages, components, and contexts:

| Route | Page Component | Description |
| :--- | :--- | :--- |
| `/` | `LandingPage.tsx` | Product intro, interactive demo previews, workflow steps, and CTAs |
| `/login` | `LoginPage.tsx` | Secure login form, password visibility toggle, error handling, redirect to preserved work |
| `/register` | `RegisterPage.tsx` | Account registration with validation and automatic login |
| `/dashboard` | `DashboardPage.tsx` | Authenticated user overview, recent sessions, system metrics, and quick actions |
| `/debug` | `DebugWorkspacePage.tsx` | Core debugger workspace: editor, error field, test code, quota badge, live execution |
| `/debug/:id` | `DebugResultPage.tsx` | Full session view: explanation, corrected code, unified diff, terminal runs |
| `/history` | `HistoryPage.tsx` | Searchable debugging history with language/status filters and deletion |
| `/evaluation` | `EvaluationPage.tsx` | Held-out evaluation dashboard: 7 metrics, benchmark runner, CSV/JSON export |
| `/profile` | `ProfilePage.tsx` | Account details, quota tier, and security preferences |
| `/settings` | `SettingsPage.tsx` | Execution preferences, theme, font size, and timeout configurations |
| `/404` | `NotFoundPage.tsx` | User-friendly 404 page with navigation shortcuts |

---

## Testing & Verification

The test suite contains **243 automated unit and integration tests** executing via Node.js native test runner (`node --test`):

```bash
# Run full regression suite (all 243 tests)
npm test

# Run unit tests only (17 test suites)
npm run test:unit

# Run integration tests only (6 test suites)
npm run test:integration
```

### Test Suite Breakdown:
- `tests/unit/safeVerification.test.js`: 8 canonical verification categories, static analysis disclaimers, test download formatting, export metrics.
- `tests/unit/aiCallBudget.test.js`: AI hard cap, composite error redaction, auth fail-fast.
- `tests/unit/inputValidation.test.js`: Payload size caps, field length validation, password limits.
- `tests/unit/promptInjectionHardening.test.js`: System instruction boundaries, passive JSON encapsulation.
- `tests/unit/databasePermissions.test.js`: POSIX `0700`/`0600` permissions, symlink rejection, sidecars.
- `tests/unit/sandboxIsolation.test.js`: Container runner path mapping, Docker arguments, fail-closed lock.
- `tests/unit/multiProviderFallback.test.js`: Provider fallback cascade, exponential backoff.
- `tests/integration/guestRestriction.test.js`: 2-use guest limit, atomic reservations, work preservation.
- `tests/integration/launchHardening.test.js`: IP rate limiting, brute-force defense, production config checks.
- `tests/integration/history.test.js`: Session ownership isolation, cross-tenant protection.
- `tests/integration/auth.test.js`: scrypt password hashing, session fixation defense, nonce rotation.

---

## Phase 12: Linux Sandbox Validation Matrix

For production container deployment, all 26 operating system isolation gates are defined in [`scripts/run_phase12_validation.sh`](scripts/run_phase12_validation.sh):
- **Category A**: Image build & toolchains (Python, Node, Java, GCC, G++, SQLite).
- **Category B**: Network namespace denial (zero kernel routes, `ENETUNREACH` drops).
- **Category C**: Filesystem immutability (read-only root, non-executable `/tmp:noexec`, 64MB RAM tmpfs).
- **Category D**: Non-root user (`10001:10001`), stripped capabilities (`0x0`), `NoNewPrivs`.
- **Category E**: Bounded resource limits (256MB memory OOM, 64 PID fork limit, 1.0 CPU quota).
- **Category F**: Production application integration & fail-closed lock.
- **Category G**: POSIX database directory (`0700`) and file (`0600`) permissions on Linux ext4.

Step-by-step instructions for executing these 26 gates on a disposable Linux VM are documented in [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) and [disposable-linux-vm-testing-guide.md](disposable-linux-vm-testing-guide.md).

---

## Evaluation Benchmark & Exports

### Run Benchmark
Executes the frozen 25-case held-out benchmark and records the 7 metrics:
```bash
npm run evaluate
```

### Export Benchmark Results
Exports latest benchmark results to CSV and JSON:
```bash
npm run export
```
Outputs are written to:
- `data/latest_evaluation.csv`
- `data/latest_evaluation.json`

---

## Project Documentation

- [Architecture & System Design](docs/ARCHITECTURE.md)
- [REST API Specification](docs/API.md)
- [Security Architecture & Threat Model](docs/SECURITY.md)
- [Evaluation Benchmark & Metrics Specification](docs/EVALUATION.md)
- [Production Deployment & Linux Sandbox Guide](docs/DEPLOYMENT_GUIDE.md)
- [Final Completion Report](FINAL_COMPLETION_REPORT.md)
