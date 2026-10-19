# PHASE 21 — FREE HOSTING COMPATIBILITY AND DEPLOYMENT READINESS REPORT

**Project**: AI Coding Debugger  
**Path**: `C:\Users\honne\.gemini\antigravity\scratch\ai-coding-debugger`  
**Date**: October 19, 2026  
**Inspection Type**: Read-Only Architecture & Free Cloud Hosting Feasibility Review  
**Deployment Action**: NONE (Planning & Inspection Only — No deployment initiated, no accounts created, no code modified)  
**Linux Sandbox Isolation Gates (Phase 12)**: 26/26 Marked Strictly **NOT RUN**

---

## 1. Executive Summary

This report evaluates the feasibility, constraints, and operational blueprint for deploying the **AI Coding Debugger** to a free-tier hosting platform without payment cards, cloud costs, code compromises, or arbitrary host code execution.

The evaluation confirms:
1. **Single-Service Architecture**: The existing Express backend natively serves the compiled Vite/React frontend from `public/` and handles SPA client-side routing. No secondary frontend deployment service is required.
2. **Safe Verification Mode Viability**: Because conventional free cloud PaaS hosts do not provide Docker socket access or container virtualization, the newly implemented **Safe Verification Mode** (`SANDBOX_MODE=safe_verification`) enables complete application demonstration (AI diagnosis, diff viewing, 8 canonical verification categories, static analysis with disclaimers, and test suite downloads) without executing untrusted code on the host.
3. **Primary Free Hosting Recommendation**: **Render Free Web Service** meets all zero-card requirements (free tier requires no payment card to launch, provides native Node.js support, 512MB RAM, and automatic SSL).
4. **Storage Ephemerality Reality**: Free tiers operate on ephemeral filesystems. SQLite database files will reset upon instance sleep/wake or redeployment. This is acceptable for demo sessions but must be explicitly documented.
5. **Readiness Verdict**:
   - **GO** for a public demonstration running in **Safe Verification Mode** with mock AI and zero external costs.
   - **NO-GO** for arbitrary container code execution (all 26 Linux isolation gates remain strictly **NOT RUN**).

---

## 2. Current Application Architecture & Build Inspection

### 2.1 Build and Start Commands
- **Frontend Build**: `npm run build` executes `vite build`.
  - Input: `client/` (React 19, TypeScript, Tailwind CSS, Lucide icons).
  - Output: `public/` (`public/index.html`, `public/assets/index-*.js`, `public/assets/index-*.css`).
  - Empirical verification: Successfully compiled 1,957 modules in 501ms with zero errors.
- **Backend Start**: `npm start` executes `node src/server.js`.
  - Entry point: `src/server.js` validates production configuration, initializes `node:sqlite`, and listens on `process.env.PORT || 3000`.

### 2.2 Frontend-Backend Integration
- **Unified Single Process**: `src/app.js` mounts `express.static(path.join(config.ROOT_DIR, 'public'))`.
- **SPA Routing Fallback**: Any non-API route (`*`) not matching `/api` or `/health` returns `public/index.html`:
  ```javascript
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  ```
- **Finding**: The backend completely serves the frontend. A separate frontend host (such as Vercel or Netlify) is **not required**.

### 2.3 Health Endpoint
- **URL**: `GET /health`
- **Response**: `200 OK`
  ```json
  {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2026-10-19T14:35:00.000Z"
  }
  ```
- **Hosting Integration**: Fully compatible with automated container health probes (e.g. Render Health Check Path: `/health`).

### 2.4 Security & Request Configuration
- **Payload Limits**: Clamped to 512KB via `express.json({ limit: '512kb' })`.
- **Security Headers**: Native middleware applies `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, and `Referrer-Policy`.
- **CORS Handling**: In production, `cors({ origin: corsOrigin, credentials: true })`. When the client is served from the same origin, browser requests are same-origin and bypass CORS restrictions.
- **Cookie Security**: `guest_session_id` and `session_token` cookies enforce `httpOnly: true`, `sameSite: 'lax'`, and `secure: config.NODE_ENV === 'production'`.
- **Reverse Proxy Support**: `app.set('trust proxy', 1)` is activated when `TRUST_PROXY=true`, ensuring HTTPS protocol detection (`X-Forwarded-Proto`) and client IP resolution (`X-Forwarded-For`) function accurately behind cloud load balancers.
- **Production Secret Validation**: `validateProductionConfig()` strictly enforces that `SESSION_SECRET` is provided, is $\ge 32$ characters, and is not a known template default.

---

## 3. Data Storage & Persistence Analysis

### 3.1 Storage Mechanism
- **Engine**: Node.js native `node:sqlite` (`DatabaseSync`).
- **File Location**: Controlled by `DB_PATH`, defaulting to `data/debugger.sqlite` with WAL journal sidecars (`debugger.sqlite-wal`, `debugger.sqlite-shm`).
- **Permissions**: `permissionSecurity.js` enforces POSIX permissions `0700` on the parent directory and `0600` on the database file, with symlink attack prevention.

### 3.2 Survival Across Hosting Lifecycle
| Event | SQLite Persistence Behavior on Free Cloud Tiers |
| :--- | :--- |
| **In-Memory Query** | Fully consistent and immediate. |
| **Active Session (Warm)** | Persists in `data/debugger.sqlite` while container is running. |
| **Instance Inactivity Sleep** | **RESET**: Container spins down to zero; ephemeral filesystem is wiped upon wake-up. |
| **Service Redeployment / Git Push** | **RESET**: New deployment starts from clean build artifact; previous local database is destroyed. |
| **Process Crash / Restart** | **RESET**: Ephemeral disk is re-provisioned; database reinitializes from `CREATE TABLE IF NOT EXISTS`. |

### 3.3 Persistence Decision
- **Decision**: **Accept Ephemeral SQLite for Demonstration**.
- **Rationale**:
  1. For a demonstration of AI debugging, diffs, guest restrictions, and test suite downloads, long-term persistence is unnecessary.
  2. Free persistent volumes either do not exist on card-free tiers or require paid storage add-ons (e.g. Render Disks cost $0.25/GB/mo minimum and are unavailable on free web services).
  3. External serverless databases (Turso, Supabase, Neon) would require code refactoring, schema migrations, and external account creation, which violates the strict constraints of this phase.
  4. Resetting on sleep actually prevents public demonstration instances from accumulating malicious or abusive database entries.

---

## 4. Runtime Constraints of Conventional Free Hosts

| Constraint / Requirement | Application Need | Conventional Free Host Capability | Status |
| :--- | :--- | :--- | :---: |
| **Node.js Version** | **$\ge$ 22.5.0** (required for native `node:sqlite`) | Many default to Node 18 or 20 LTS. Must set `NODE_VERSION=22`. | **CONFIGURABLE** |
| **Docker Daemon Access** | Required for `ContainerSandboxRunner` | **Not available** on free PaaS/serverless containers. | **CANNOT SATISFY** |
| **Arbitrary Code Execution** | Disabled in Safe Verification Mode | Handled by `SANDBOX_MODE=safe_verification`. | **SATISFIED** |
| **RAM Allowance** | App requires ~60–90MB | Free tiers provide 256MB–512MB RAM. | **SATISFIED** |
| **Port Binding** | Reads `process.env.PORT` | Free hosts inject random port via `PORT`. | **SATISFIED** |
| **Outbound Internet Access** | Zero needed when `AI_PROVIDER=mock` | Unrestricted HTTP/HTTPS outbound available if needed. | **SATISFIED** |

### 4.1 Mock AI Verification
- `AI_PROVIDER=mock` activates `_mockAnalyze()` in `src/services/aiService.js`.
- It executes entirely in-memory using deterministic AST and regex pattern matching.
- **Evidence**: Verified across all 243 automated tests with zero external HTTP requests, zero API keys, and zero billing costs.

### 4.2 Code Execution Denial Verification
- When `SANDBOX_MODE=safe_verification`, `SandboxManager.isExecutionAllowed()` returns:
  `{ allowed: false, reason: 'EXECUTION_UNAVAILABLE' }`.
- `SandboxService.execute()` returns `status: 'execution_unavailable'` and `executionAvailable: false`.
- Arbitrary submitted code is **never passed to a host process runner**.

---

## 5. Free Hosting Provider Comparison (2026 Verification)

All provider evaluations were verified against current official documentation:

| Provider | Free Web Service Tier? | Payment Card Required? | Idle Sleep Behavior | Storage Persistence | Node.js $\ge$ 22 Support | Suitability for This Project |
| :--- | :---: | :---: | :--- | :--- | :---: | :--- |
| **Render** | **YES** (Hobby Plan) | **NO** (Card-free signup) | Sleeps after 15 min inactivity (30–60s cold start) | **Ephemeral** (Wiped on sleep / redeploy) | **YES** (via `NODE_VERSION=22`) | **RECOMMENDED** (Meets all zero-cost & zero-card constraints) |
| **Koyeb** | YES (Starter) | **YES** (Mandatory card with $29 auth hold) | Scales to zero after 1h | Ephemeral (2GB SSD) | YES | **DISQUALIFIED** (Violates zero-card restriction) |
| **Fly.io** | NO permanent free tier | **YES** (Trial lasts 2h runtime or 7d, card required after) | Auto-stops after 5 min | Persistent volumes available | YES | **DISQUALIFIED** (Violates zero-cost & zero-card restrictions) |
| **Railway** | NO permanent free tier | **YES** (30-day $5 trial; card required to continue) | Sleeps when credits deplete | Ephemeral on trial | YES | **DISQUALIFIED** (Temporary trial only; requires payment card) |
| **Vercel** | YES (Hobby) | NO | Serverless execution (spins down after request) | **Ephemeral / Read-Only** (SQLite resets per invocation) | YES | **POOR FIT** (Express serverless wrapping breaks SQLite state) |
| **Glitch** | **SHUT DOWN** | N/A | Platform hosting permanently terminated July 8, 2025 | N/A | N/A | **DISQUALIFIED** (Platform defunct) |
| **Hugging Face Spaces** | Restricted | **YES** (Docker Spaces require PRO subscription $9/mo) | Sleeps after 48h | Ephemeral | YES | **DISQUALIFIED** (Requires paid plan for custom Docker/Node backend) |

### 5.1 Provider Conclusion
**Render Free Web Service** is the sole production PaaS provider that allows deploying a full Node.js web service without requiring a payment card, while supporting Node.js 22 and meeting all safety boundaries.

---

## 6. Smallest Architecture Change Recommendation

To preserve the codebase and minimize complexity:
- **Application Code Changes**: **0 lines**. No restructuring, no database migration, no router changes.
- **Deployment Structure**: Deploy as a single unified service (Render Web Service).
- **Build Command**: `npm run build` (builds frontend assets to `public/`).
- **Start Command**: `npm start` (starts Express server on `config.PORT`).
- **Host Configuration**:
  - Set `NODE_VERSION=22` in host environment variables to ensure `node:sqlite` compatibility.
  - Set `SANDBOX_MODE=safe_verification` to enforce safe verification boundaries.
  - Set `TRUST_PROXY=true` to properly resolve client IPs and enable secure cookies.

---

## 7. Environment Variable Checklist (Names Only)

The following environment variables must be configured on the hosting platform. **Values are omitted in strict compliance with security directives.**

| Variable Name | Required? | Purpose |
| :--- | :---: | :--- |
| `NODE_ENV` | **YES** | Set to `production` for security headers, secure cookies, and optimized build. |
| `NODE_VERSION` | **YES** | Set to `22` (or `22.14.0`) so the host uses Node.js $\ge$ 22.5.0 for `node:sqlite`. |
| `SESSION_SECRET` | **YES** | Random $\ge 32$-character string (e.g. generated via `openssl rand -hex 32`). Must not match template defaults. |
| `SANDBOX_MODE` | **YES** | Set to `safe_verification` to enforce fail-closed non-execution of submitted code. |
| `TRUST_PROXY` | **YES** | Set to `true` (enables `app.set('trust proxy', 1)` behind reverse proxy). |
| `CORS_ORIGIN` | **YES** | Set to public service URL (e.g. `https://<service-name>.onrender.com`). |
| `AI_PROVIDER` | **YES** | Set to `mock` for 100% free, deterministic, credential-free execution. |
| `PORT` | Auto | Automatically injected by host (defaults to 10000 on Render). |
| `DB_PATH` | Optional | Defaults to `data/debugger.sqlite`. |
| `MAX_GUEST_USES` | Optional | Defaults to `2`. |

---

## 8. Security Blockers & Risk Analysis

| Risk Area | Threat / Concern | Mitigation Status in Current Implementation |
| :--- | :--- | :--- |
| **Arbitrary Host Execution** | Untrusted code executing on cloud host | **RESOLVED**: `SANDBOX_MODE=safe_verification` denies host execution (`EXECUTION_UNAVAILABLE`). |
| **Weak Session Secret** | Predictable session signatures in production | **RESOLVED**: `validateProductionConfig` aborts process startup if secret is missing, <32 chars, or default. |
| **IP Spoofing / Quota Bypass** | Guests spoofing `X-Forwarded-For` | **RESOLVED**: Express only trusts 1 hop when `TRUST_PROXY=true`; dual-anchored cookie+IP tracking enforced. |
| **SSL Cookie Invalidation** | Cookies with `secure: true` rejected | **RESOLVED**: `trust proxy` correctly detects `X-Forwarded-Proto: https` from Render SSL termination. |
| **Formula Injection** | Malicious CSV export payloads | **RESOLVED**: `ExportService.sanitizeCsvField` neutralizes formula triggers (`=`, `+`, `-`, `@`). |
| **Memory Exhaustion (OOM)** | Node.js exceeding free 512MB RAM | **RESOLVED**: App uses ~75MB RAM; static assets served with cache headers; payload capped at 512KB. |
| **Linux Container Gates (Phase 12)** | Container isolation unproven | **HELD**: All 26 gates remain **NOT RUN**. Execution is prohibited until validated. |

---

## 9. Deployment Steps for Later Approved Deployment

When explicit approval to deploy is granted, follow these exact manual steps:

1. **Prepare Git Repository**:
   Ensure all changes are staged and committed to a private GitHub repository.
2. **Create Render Account**:
   Sign up at [render.com](https://render.com) using GitHub authentication (zero credit card required).
3. **Create New Web Service**:
   - Click **New +** $\rightarrow$ **Web Service**.
   - Select the GitHub repository.
   - **Name**: `ai-coding-debugger`.
   - **Region**: Choose closest region (e.g., Oregon, Frankfurt, Singapore).
   - **Branch**: `main`.
   - **Runtime**: `Node`.
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free** (512MB RAM, 0.1 CPU).
4. **Configure Environment Variables**:
   Under **Environment Variables**, add the keys from the checklist in Section 7:
   - `NODE_ENV=production`
   - `NODE_VERSION=22`
   - `SESSION_SECRET=<generated-random-hex-string>`
   - `SANDBOX_MODE=safe_verification`
   - `TRUST_PROXY=true`
   - `CORS_ORIGIN=https://ai-coding-debugger.onrender.com`
   - `AI_PROVIDER=mock`
5. **Configure Health Check**:
   Under **Advanced Settings**, set **Health Check Path** to `/health`.
6. **Deploy**:
   Click **Create Web Service**. Monitor build logs to confirm Vite compilation and server initialization.
7. **Verify Public URL**:
   Test `GET /health` and navigate to the application dashboard to confirm Safe Verification Mode is active.

---

## 10. Exact Commands and Test Evidence Available

| Command | Purpose | Verified Outcome |
| :--- | :--- | :--- |
| `npm test` | Full regression suite (unit + integration) | **243 passed, 0 failed, 0 skipped** (53,062ms) |
| `npm run test:unit` | 17 unit test suites | **All 17 suites passed** |
| `npm run test:integration` | 6 integration test suites | **All 6 suites passed** |
| `npm run build` | Vite client production compilation | **1,957 modules transformed in 501ms** |
| `node --test tests/unit/safeVerification.test.js` | 8 canonical categories & boundaries | **13 passed, 0 failed** |
| `node --test tests/unit/sandboxIsolation.test.js` | Sandbox boundary enforcement | **20 passed, 0 failed** |
| `node --test tests/integration/launchHardening.test.js` | Production configuration validation | **Passed** |

---

## 11. Clear GO / NO-GO Decision

### Verdict for Safe Verification Mode Demonstration: **GO**
The application is fully architected, configured, and hardened for a public demonstration on Render Free Web Service:
- Requires **zero cloud expenditure** and **zero payment cards**.
- Enforces **zero arbitrary code execution on the host**.
- Reliably serves the compiled frontend and backend from a single Node.js process.
- Honestly reports all 8 canonical verification categories with full static check limitation disclaimers.

### Verdict for Production Isolated Code Execution Launch: **NO-GO**
In accordance with non-negotiable project security directives, public launch of arbitrary code execution remains strictly held:
- All 26 Linux Docker isolation validation gates remain **NOT RUN**.
- Free PaaS cloud hosts cannot provide the root container virtualization required for `ContainerSandboxRunner`.
- Isolated execution can only be authorized after all 26 gates are genuinely executed and passed on a validated Linux host.
