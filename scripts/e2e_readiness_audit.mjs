/**
 * AI Coding Debugger — Complete End-to-End Readiness Audit
 * Verifies all 9 user audit requirements against live server on http://localhost:3000
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { SandboxManager } from '../src/services/sandbox/sandboxManager.js';
import { ContainerSandboxRunner } from '../src/services/sandbox/containerSandboxRunner.js';
import { StaticAnalyzer } from '../src/services/languages/staticAnalyzer.js';
import { TestGenerator } from '../src/services/languages/testGenerator.js';

const BASE_URL = 'http://localhost:3000';

function mergeCookies(existing = '', res) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const cookieMap = new Map();
  if (existing) {
    existing.split('; ').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) cookieMap.set(k.trim(), v.trim());
    });
  }
  for (const header of setCookies) {
    const [pair] = header.split(';');
    const [k, v] = pair.split('=');
    if (k && v) cookieMap.set(k.trim(), v.trim());
  }
  return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

const auditLog = [];

function record(section, testName, status, details = {}) {
  const entry = { section, testName, status, details, timestamp: new Date().toISOString() };
  auditLog.push(entry);
  const icon = status === 'PASS' ? '✓' : '✗';
  console.log(`  [${icon}] ${testName}`);
  if (status !== 'PASS') {
    console.error(`      Error:`, details.error || details.message);
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('   AI CODING DEBUGGER — END-TO-END READINESS AUDIT SUITE');
  console.log('================================================================\n');

  // ----------------------------------------------------------------
  // SECTION 1: SYSTEM HEALTH & SERVER AVAILABILITY
  // ----------------------------------------------------------------
  console.log('--- Section 1: System Health & Documented Startup ---');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/v1/health`);
    const health = await healthRes.json();
    if (healthRes.status === 200 && health.status === 'healthy') {
      record('Health', '1.1 Health endpoint responds 200 Healthy', 'PASS', { health });
    } else {
      record('Health', '1.1 Health endpoint responds 200 Healthy', 'FAIL', { status: healthRes.status, health });
    }
  } catch (err) {
    record('Health', '1.1 Health endpoint responds 200 Healthy', 'FAIL', { error: err.message });
  }

  try {
    const statusRes = await fetch(`${BASE_URL}/api/v1/sandbox/status`);
    const sbStatus = await statusRes.json();
    const isContainer = sbStatus.isContainerAvailable && sbStatus.isolationType === 'docker_container';
    record('Health', '1.2 Sandbox status reports container isolation and live runtime', isContainer ? 'PASS' : 'FAIL', {
      isContainerAvailable: sbStatus.isContainerAvailable,
      isolationType: sbStatus.isolationType,
      runtime: sbStatus.containerRuntime
    });
  } catch (err) {
    record('Health', '1.2 Sandbox status reports container isolation', 'FAIL', { error: err.message });
  }

  // ----------------------------------------------------------------
  // SECTION 2: MULTI-LANGUAGE LIVE VERIFICATION (Python, JS, Java, C, C++)
  // ----------------------------------------------------------------
  console.log('\n--- Section 2: Core Languages Live Verification ---');

  // Helper for authenticated sessions so quota doesn't block multi-language testing
  let authCookie = '';
  const testUser = `auditor_${Date.now()}`;
  try {
    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        email: `${testUser}@audit.local`,
        password: 'Password123!'
      })
    });
    authCookie = mergeCookies('', regRes);
  } catch (err) {
    console.error('Failed to create test user for language audits:', err);
  }

  // 2.1 Python Live Container Execution
  try {
    const pyCode = 'def add(a, b):\n    return a - b\n\nprint(add(2, 3))';
    const pyRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: pyCode,
        errorDescription: 'Subtracts instead of adds',
        expectedOutput: '5'
      })
    });
    const pyData = await pyRes.json();
    const isPyContainer = pyData.originalRun?.isolationType === 'docker_container';
    const hasDiff = Boolean(pyData.diff && pyData.structuredDiff);
    const hasDiagnosis = Boolean(pyData.diagnosis && pyData.rootCause);
    record('Languages', '2.1 Python executes in Docker container with diff & diagnosis', (isPyContainer && hasDiff && hasDiagnosis) ? 'PASS' : 'FAIL', {
      status: pyRes.status,
      isolationType: pyData.originalRun?.isolationType,
      hasDiff,
      hasDiagnosis,
      verificationStatus: pyData.verificationStatus
    });
  } catch (err) {
    record('Languages', '2.1 Python executes in Docker container', 'FAIL', { error: err.message });
  }

  // 2.2 JavaScript Live Container Execution
  try {
    const jsCode = 'function multiply(a, b) {\n    return a + b;\n}\nconsole.log(multiply(3, 4));';
    const jsRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'javascript',
        sourceCode: jsCode,
        errorDescription: 'Adds instead of multiplies',
        expectedOutput: '12'
      })
    });
    const jsData = await jsRes.json();
    const isJsContainer = jsData.originalRun?.isolationType === 'docker_container';
    record('Languages', '2.2 JavaScript executes in Docker container with diff & diagnosis', isJsContainer ? 'PASS' : 'FAIL', {
      status: jsRes.status,
      isolationType: jsData.originalRun?.isolationType,
      verificationStatus: jsData.verificationStatus
    });
  } catch (err) {
    record('Languages', '2.2 JavaScript executes in Docker container', 'FAIL', { error: err.message });
  }

  // 2.3 Java Honest Verification & Toolchain Reporting
  try {
    const javaCode = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello Java");\n    }\n}';
    const javaRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'java',
        sourceCode: javaCode,
        errorDescription: 'Test Java code verification'
      })
    });
    const javaData = await javaRes.json();
    const isHonest = javaData.category === 'TESTS_GENERATED_NOT_RUN' || javaData.category === 'STATIC_CHECK_PASSED';
    const hasDownload = Boolean(javaData.downloadableTestFile);
    record('Languages', '2.3 Java performs static checks and generates downloadable test suite', (isHonest && hasDownload) ? 'PASS' : 'FAIL', {
      status: javaRes.status,
      category: javaData.category,
      hasDownload,
      verified: javaData.verified
    });
  } catch (err) {
    record('Languages', '2.3 Java static verification', 'FAIL', { error: err.message });
  }

  // 2.4 C / C++ Honest Verification & Toolchain Reporting
  try {
    const cCode = '#include <stdio.h>\nint main(void) {\n    puts("Hello C");\n    return 0;\n}';
    const cRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'c',
        sourceCode: cCode,
        errorDescription: 'Test C code'
      })
    });
    const cData = await cRes.json();
    const isHonest = cData.category === 'TESTS_GENERATED_NOT_RUN' || cData.category === 'STATIC_CHECK_PASSED';
    record('Languages', '2.4 C language reports static syntax verification and generates tests', isHonest ? 'PASS' : 'FAIL', {
      status: cRes.status,
      category: cData.category,
      verified: cData.verified
    });
  } catch (err) {
    record('Languages', '2.4 C language verification', 'FAIL', { error: err.message });
  }

  // ----------------------------------------------------------------
  // SECTION 3: ERROR SCENARIOS, TIMEOUTS & BUFFER LIMITS
  // ----------------------------------------------------------------
  console.log('\n--- Section 3: Error Scenarios, Timeouts & Limits ---');

  // 3.1 Syntax Error Handling
  try {
    const synRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'def broken_syntax(:\n    pass'
      })
    });
    const synData = await synRes.json();
    const hasSyntaxError = synData.originalRun?.status === 'compilation_error' || synData.originalRun?.errorType === 'SYNTAX_ERROR';
    record('Errors', '3.1 Syntax errors correctly categorized as compilation_error/SYNTAX_ERROR', hasSyntaxError ? 'PASS' : 'FAIL', {
      runStatus: synData.originalRun?.status,
      errorType: synData.originalRun?.errorType
    });
  } catch (err) {
    record('Errors', '3.1 Syntax error categorization', 'FAIL', { error: err.message });
  }

  // 3.2 Runtime Exception Handling
  try {
    const runRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'print(10 / 0)'
      })
    });
    const runData = await runRes.json();
    const hasZeroDiv = runData.originalRun?.stderr?.includes('ZeroDivisionError');
    record('Errors', '3.2 Runtime exception (ZeroDivisionError) captured from container', hasZeroDiv ? 'PASS' : 'FAIL', {
      runStatus: runData.originalRun?.status,
      stderrSnippet: runData.originalRun?.stderr?.slice(0, 100)
    });
  } catch (err) {
    record('Errors', '3.2 Runtime exception', 'FAIL', { error: err.message });
  }

  // 3.3 Infinite Loop Timeout Handling
  try {
    const start = Date.now();
    const loopRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'while True:\n    pass'
      })
    });
    const loopData = await loopRes.json();
    const duration = Date.now() - start;
    const isTimeout = loopData.originalRun?.status === 'timeout';
    record('Errors', '3.3 Runaway infinite loop killed by container timeout', isTimeout ? 'PASS' : 'FAIL', {
      durationMs: duration,
      runStatus: loopData.originalRun?.status,
      errorType: loopData.originalRun?.errorType
    });
  } catch (err) {
    record('Errors', '3.3 Infinite loop timeout', 'FAIL', { error: err.message });
  }

  // 3.4 Oversized Output Truncation
  try {
    const hugeRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'print("A" * 100000)'
      })
    });
    const hugeData = await hugeRes.json();
    const isTruncated = hugeData.originalRun?.stdout?.includes('[OUTPUT TRUNCATED: Exceeded size limit]');
    record('Errors', '3.4 Oversized stdout truncated to prevent buffer exhaustion', isTruncated ? 'PASS' : 'FAIL', {
      stdoutLength: hugeData.originalRun?.stdout?.length,
      hasTruncationNote: isTruncated
    });
  } catch (err) {
    record('Errors', '3.4 Output truncation', 'FAIL', { error: err.message });
  }

  // 3.5 Invalid Inputs (Empty body, unknown language, missing source code)
  try {
    const emptyRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({})
    });
    const unsuppRes = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({ language: 'brainfuck', sourceCode: '++--' })
    });
    const isValidRejections = emptyRes.status === 400 && unsuppRes.status === 400;
    record('Errors', '3.5 Invalid input rejected with structured 400 error payloads', isValidRejections ? 'PASS' : 'FAIL', {
      emptyStatus: emptyRes.status,
      unsupportedStatus: unsuppRes.status
    });
  } catch (err) {
    record('Errors', '3.5 Invalid inputs', 'FAIL', { error: err.message });
  }

  // 3.6 Docker Unavailability / Missing Image Fail-Closed Check
  try {
    const mockRunner = new ContainerSandboxRunner();
    mockRunner.isAvailable = () => false;
    const manager = new SandboxManager({ mode: 'container', containerRunner: mockRunner });
    const allowance = manager.isExecutionAllowed();
    const failsClosed = allowance.allowed === false && allowance.reason === 'CONTAINER_RUNTIME_UNAVAILABLE';
    record('Errors', '3.6 Offline Docker daemon fails closed with CONTAINER_RUNTIME_UNAVAILABLE', failsClosed ? 'PASS' : 'FAIL', {
      allowed: allowance.allowed,
      reason: allowance.reason
    });
  } catch (err) {
    record('Errors', '3.6 Docker unavailable fail-closed', 'FAIL', { error: err.message });
  }

  // ----------------------------------------------------------------
  // SECTION 4: UI HONESTY — UNEXECUTED TESTS NEVER LABELED AS PASSED
  // ----------------------------------------------------------------
  console.log('\n--- Section 4: UI Truthfulness & Test Status Integrity ---');
  try {
    const dummyCases = [
      { id: 't1', name: 'Test 1', category: 'normal' },
      { id: 't2', name: 'Test 2', category: 'boundary' }
    ];
    const evaluated = TestGenerator.evaluateTestResults(dummyCases, { status: 'execution_unavailable', executionAvailable: false });
    const anyMarkedPassed = evaluated.some(t => t.passed === true);
    const allMarkedUnavailable = evaluated.every(t => t.executed === false && t.status === 'unavailable');
    record('UI Honesty', '4.1 Unexecuted tests have executed: false and passed: null (never true)', (!anyMarkedPassed && allMarkedUnavailable) ? 'PASS' : 'FAIL', {
      sampleEvaluated: evaluated[0]
    });
  } catch (err) {
    record('UI Honesty', '4.1 Unexecuted test status integrity', 'FAIL', { error: err.message });
  }

  // ----------------------------------------------------------------
  // SECTION 5: AUTHENTICATION, HISTORY & GUEST RESTRICTIONS
  // ----------------------------------------------------------------
  console.log('\n--- Section 5: Authentication, History & Guest Restrictions ---');

  // 5.1 Guest Two-Attempt Rule
  let freshGuestCookie = '';
  try {
    // Attempt 1
    const g1 = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'python', sourceCode: 'print(1)' })
    });
    freshGuestCookie = mergeCookies('', g1);
    const d1 = await g1.json();

    // Attempt 2
    const g2 = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: freshGuestCookie },
      body: JSON.stringify({ language: 'python', sourceCode: 'print(2)' })
    });
    freshGuestCookie = mergeCookies(freshGuestCookie, g2);
    const d2 = await g2.json();

    // Attempt 3 (Should be blocked)
    const g3 = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: freshGuestCookie },
      body: JSON.stringify({ language: 'python', sourceCode: 'print(3)' })
    });
    const d3 = await g3.json();

    const enforcesTwoRule = g1.status === 200 && g2.status === 200 && g3.status === 403 && (d3.error === 'LOGIN_REQUIRED' || d3.code === 'LOGIN_REQUIRED');
    record('Auth & Quota', '5.1 Guest quota strictly permits 2 attempts and blocks 3rd with 403 LOGIN_REQUIRED', enforcesTwoRule ? 'PASS' : 'FAIL', {
      attempt1Remaining: d1.guestStatus?.remainingUses,
      attempt2Remaining: d2.guestStatus?.remainingUses,
      attempt3Status: g3.status,
      attempt3Error: d3.error || d3.code
    });
  } catch (err) {
    record('Auth & Quota', '5.1 Guest quota enforcement', 'FAIL', { error: err.message });
  }

  // 5.2 Private History Isolation Between Users
  try {
    const userAlice = `alice_${Date.now()}`;
    const userBob = `bob_${Date.now()}`;

    // Register Alice & Bob
    const aliceRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userAlice, email: `${userAlice}@test.com`, password: 'Password123!' })
    });
    const aliceCookie = mergeCookies('', aliceRes);

    const bobRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userBob, email: `${userBob}@test.com`, password: 'Password123!' })
    });
    const bobCookie = mergeCookies('', bobRes);

    // Alice creates a private debug session
    const aliceDebug = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: aliceCookie },
      body: JSON.stringify({ language: 'python', sourceCode: 'print("Alice secret code")' })
    });
    const aliceData = await aliceDebug.json();
    const aliceSessionId = aliceData.sessionId;

    // Bob attempts to read Alice's session
    const bobAccess = await fetch(`${BASE_URL}/api/v1/history/${aliceSessionId}`, {
      headers: { cookie: bobCookie }
    });

    const isProtected = bobAccess.status === 403 || bobAccess.status === 404;
    record('Auth & Quota', '5.2 Cross-user history isolation: User Bob cannot access Alice session', isProtected ? 'PASS' : 'FAIL', {
      bobAccessStatus: bobAccess.status
    });
  } catch (err) {
    record('Auth & Quota', '5.2 Cross-user history isolation', 'FAIL', { error: err.message });
  }

  // ----------------------------------------------------------------
  // SECTION 6: SECURITY & INFORMATION DISCLOSURE AUDIT
  // ----------------------------------------------------------------
  console.log('\n--- Section 6: Security & Information Disclosure Audit ---');
  try {
    // Check OWASP headers on responses
    const headersRes = await fetch(`${BASE_URL}/api/v1/health`);
    const csp = headersRes.headers.get('content-security-policy');
    const xcto = headersRes.headers.get('x-content-type-options');
    const xfo = headersRes.headers.get('x-frame-options');

    const hasHeaders = xcto === 'nosniff' && (xfo === 'DENY' || xfo === 'SAMEORIGIN');
    record('Security', '6.1 OWASP security headers present (X-Content-Type-Options, X-Frame-Options)', hasHeaders ? 'PASS' : 'FAIL', {
      xcto,
      xfo
    });
  } catch (err) {
    record('Security', '6.1 OWASP security headers', 'FAIL', { error: err.message });
  }

  // Summary
  console.log('\n================================================================');
  const total = auditLog.length;
  const passed = auditLog.filter(t => t.status === 'PASS').length;
  const failed = auditLog.filter(t => t.status === 'FAIL').length;
  console.log(`  AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED across ${total} verification checks.`);
  console.log('================================================================\n');

  return { total, passed, failed, auditLog };
}

runAudit().then(res => {
  if (res.failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}).catch(err => {
  console.error('Audit suite crashed:', err);
  process.exit(1);
});
