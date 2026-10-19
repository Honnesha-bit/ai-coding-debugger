# AI Coding Debugger — REST API Specification

Base URL: `http://localhost:3000/api/v1`

All responses return standard `application/json` unless otherwise specified.

---

## 1. Global Request Sizing & Rate Limiting Rules

### 1.1 Global Payload & Field Size Caps
- **Global HTTP Request Payload Limit**: **512 KB** (`express.json({ limit: '512kb' })`). Requests exceeding 512KB are immediately rejected with HTTP 413 `PAYLOAD_TOO_LARGE`.
- **Field-Level Length Limits**:
  - `sourceCode`: Maximum 65,536 characters (64 KB).
  - `errorDescription`: Maximum 8,192 characters (8 KB).
  - `expectedOutput`: Maximum 16,384 characters (16 KB).
  - `testCases`: Maximum 32,768 characters (32 KB).
  - `password`: Maximum 128 characters (protects against scrypt CPU starvation).
  - Requests exceeding field caps return HTTP 400 `INVALID_INPUT`.

### 1.2 Dual-Anchored Rate Limiting & Guest Quotas
- Unauthenticated visitors receive exactly **2 free debugging attempts**.
- Quota is tracked concurrently across **session cookie** (`guest_sess_...`) AND **client IP address** (`guest_ip_...`).
- Rotating or clearing cookies cannot bypass the quota.
- When 2 uses are exhausted, subsequent debugging attempts return HTTP 403 `LOGIN_REQUIRED`.
- General API rate limits: 120 requests per minute per IP; 20 debug runs per minute. Excess requests return HTTP 429 `RATE_LIMIT_EXCEEDED`.

---

## 2. Authentication Endpoints

### 2.1 Register
- **URL**: `POST /auth/register`
- **Request Body**:
  ```json
  {
    "username": "developer1",
    "email": "dev@example.com",
    "password": "securepassword123"
  }
  ```
- **Validation Rules**: `username` 3–32 alphanumeric/underscore; `email` valid format; `password` 8–128 characters.
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_9f82...",
      "username": "developer1",
      "email": "dev@example.com",
      "created_at": "2026-10-18T14:00:00.000Z"
    },
    "message": "Account created successfully"
  }
  ```
- **Cookies Set**: `session_token` (`HttpOnly`, `SameSite=Lax`, `Secure` in production, 7-day expiration).

### 2.2 Login
- **URL**: `POST /auth/login`
- **Request Body**:
  ```json
  {
    "username": "developer1",
    "password": "securepassword123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_9f82...",
      "username": "developer1",
      "email": "dev@example.com",
      "created_at": "2026-10-18T14:00:00.000Z"
    },
    "message": "Logged in successfully"
  }
  ```
- **Security**: The session token and cryptographic nonce are rotated on login to prevent session fixation attacks.

### 2.3 Logout
- **URL**: `POST /auth/logout`
- **Response `200 OK`**:
  ```json
  { "success": true, "message": "Logged out successfully" }
  ```
- **Cookies Cleared**: `session_token`.

### 2.4 Auth & Guest Quota Status
- **URL**: `GET /auth/status`
- **Response `200 OK` (Unauthenticated Guest)**:
  ```json
  {
    "authenticated": false,
    "user": null,
    "guestStatus": {
      "usageCount": 1,
      "maxUses": 2,
      "remainingUses": 1,
      "isExhausted": false,
      "message": "Free debugging uses remaining: 1"
    }
  }
  ```
- **Response `200 OK` (Authenticated User)**:
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "usr_9f82...",
      "username": "developer1",
      "email": "dev@example.com",
      "created_at": "2026-10-18T14:00:00.000Z"
    },
    "guestStatus": null
  }
  ```

---

## 3. Core Debugging & Execution Endpoints

### 3.1 Submit Code for Automated Debugging
- **URL**: `POST /debug`
- **Authorization**: Optional (Consumes 1 guest attempt if unauthenticated).
- **Request Body**:
  ```json
  {
    "language": "python",
    "sourceCode": "def divide(a, b): return a / b\nprint(divide(10, 0))",
    "errorDescription": "ZeroDivisionError: division by zero",
    "expectedOutput": "0",
    "testCases": "assert divide(10, 2) == 5"
  }
  ```
- **Response `200 OK` (Fix Verified)**:
  ```json
  {
    "success": true,
    "session": {
      "id": "dbg_4b1a8...",
      "language": "python",
      "originalCode": "def divide(a, b): return a / b\nprint(divide(10, 0))",
      "correctedCode": "def divide(a, b):\n    if b == 0:\n        return 0\n    return a / b\nprint(divide(10, 0))",
      "explanation": "The function attempted to divide by zero when b equals 0.",
      "rootCause": "Unchecked zero divisor in arithmetic division.",
      "confidence": "HIGH",
      "affectedLines": [1],
      "verificationStatus": "FIX VERIFIED",
      "unifiedDiff": "@@ -1,2 +1,4 @@\n-def divide(a, b): return a / b\n+def divide(a, b):\n+    if b == 0:\n+        return 0\n+    return a / b\n print(divide(10, 0))",
      "executionResults": {
        "original": {
          "status": "error",
          "stdout": "",
          "stderr": "ZeroDivisionError: division by zero",
          "executionTimeMs": 42
        },
        "corrected": {
          "status": "success",
          "stdout": "0\n",
          "stderr": "",
          "executionTimeMs": 38
        }
      },
      "created_at": "2026-10-19T10:00:00.000Z"
    },
    "guestStatus": {
      "usageCount": 2,
      "maxUses": 2,
      "remainingUses": 0,
      "isExhausted": true,
      "message": "You have used your 2 free debugging attempts."
    }
  }
  ```
- **Response `403 Forbidden` (Guest Quota Exhausted)**:
  ```json
  {
    "error": "LOGIN_REQUIRED",
    "code": "LOGIN_REQUIRED",
    "message": "You have used your 2 free debugging attempts. Please log in or create an account to continue.",
    "guestStatus": {
      "usageCount": 2,
      "maxUses": 2,
      "remainingUses": 0,
      "isExhausted": true
    }
  }
  ```
- **Response `200 OK` (Safe Verification Mode - Container Unavailable)**:
  ```json
  {
    "success": true,
    "sessionId": "dbg_4b1a8...",
    "diagnosis": "The function attempted to divide by zero when b equals 0.",
    "rootCause": "Unchecked zero divisor in arithmetic division.",
    "correctedCode": "def divide(a, b):\n    if b == 0:\n        return 0\n    return a / b",
    "confidence": "HIGH",
    "category": "TESTS_GENERATED_NOT_RUN",
    "resultCategory": "TESTS_GENERATED_NOT_RUN",
    "verificationStatus": "FIX PARTIALLY VERIFIED",
    "detailedStatus": "EXECUTION_UNAVAILABLE",
    "verificationSummary": "Fix partially verified: Code syntax and structure passed static checks with 0 errors. 4 test cases were generated but NOT RUN because secure container execution is unavailable. You can download the generated tests to run them locally.",
    "staticChecks": {
      "passed": true,
      "errors": [],
      "warnings": [],
      "checks": [
        { "name": "Delimiter & Bracket Balance", "passed": true, "details": "Matching delimiter pairs verified." },
        { "name": "Structural Syntax Patterns", "passed": true, "details": "Static structure analysis for Python 3 passed with 0 errors." }
      ],
      "disclaimer": "Static checks verify basic lexical delimiters, structural patterns, and suspicious keywords. They do NOT replace a real compiler, type-checker, or dynamic container execution, and cannot guarantee runtime safety or correctness."
    },
    "downloadableTestFile": {
      "filename": "test_suite.py",
      "mimeType": "text/plain; charset=utf-8",
      "testCount": 4
    }
  }
  ```

### 3.2 Download Proposed Test Suite
- **URL**: `POST /debug/tests/download`
- **Query Parameters**: `format=file` (optional, sends attachment)
- **Request Body**:
  ```json
  {
    "language": "python",
    "testCases": [
      { "name": "test_normal", "assertionCode": "assert divide(10, 2) == 5" }
    ],
    "correctedCode": "def divide(a, b):\n    return a / b if b != 0 else 0",
    "expectedOutput": "5",
    "sessionId": "dbg_4b1a8..."
  }
  ```
- **Response `200 OK` (JSON format)**:
  ```json
  {
    "success": true,
    "filename": "test_suite.py",
    "content": "# AI Coding Debugger - Proposed Test Suite (Python)\n...",
    "mimeType": "text/plain; charset=utf-8",
    "language": "python",
    "testCount": 1
  }
  ```
- **Response `200 OK` (Attachment format if `?format=file`)**:
  - `Content-Disposition: attachment; filename="test_suite.py"`
  - `Content-Type: text/plain; charset=utf-8`

### 3.3 Direct Code Execution in Sandbox
- **URL**: `POST /execute`
- **Request Body**:
  ```json
  {
    "language": "javascript",
    "sourceCode": "console.log('Testing execution');",
    "timeoutMs": 3000
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "result": {
      "status": "success",
      "stdout": "Testing execution\n",
      "stderr": "",
      "exitCode": 0,
      "timedOut": false,
      "executionTimeMs": 65
    }
  }
  ```

---

## 4. Session History Endpoints

### 4.1 List Session History
- **URL**: `GET /history`
- **Query Parameters**:
  - `page`: Page number (default `1`).
  - `limit`: Items per page (default `10`, max `50`).
  - `language`: Filter by language (e.g. `python`).
  - `status`: Filter by verification status (`FIX VERIFIED`, etc.).
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "sessions": [
      {
        "id": "dbg_4b1a8...",
        "language": "python",
        "verificationStatus": "FIX VERIFIED",
        "confidence": "HIGH",
        "explanation": "The function attempted to divide by zero...",
        "created_at": "2026-10-19T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 14,
      "page": 1,
      "limit": 10,
      "totalPages": 2
    }
  }
  ```

### 4.2 Get Session by ID
- **URL**: `GET /history/:id`
- **Ownership Verification**: Authenticated users can only retrieve their own sessions. Guests can only retrieve their own cookie-linked sessions. Cross-user access returns HTTP 404/403.

### 4.3 Delete Session
- **URL**: `DELETE /history/:id`
- **Response `200 OK`**:
  ```json
  { "success": true, "message": "Session deleted successfully" }
  ```

---

## 5. Evaluation Benchmark Endpoints

### 5.1 Run Evaluation Benchmark
- **URL**: `POST /evaluation/run`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "run": {
      "id": "eval_7c2a1...",
      "timestamp": "2026-10-19T12:00:00.000Z",
      "totalCases": 25,
      "fixSuccessRate": 0.80,
      "compilationSuccessRate": 0.80,
      "regressionRate": 0.00,
      "explanationAccuracy": 0.94,
      "sandboxFailureRate": 0.00,
      "medianLatencyMs": 0,
      "failureCounts": {
        "providerErrors": 0,
        "malformedResponses": 0,
        "timeouts": 0,
        "compilationFailures": 5,
        "testFailures": 0
      }
    }
  }
  ```

### 5.2 Export Evaluation Results
- **URL**: `GET /evaluation/export?format=json` or `GET /evaluation/export?format=csv`
- **CSV Formula Injection Defense**: Any exported string beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` is escaped with a leading single quote (`'`) to neutralize spreadsheet code execution (CWE-1236).
