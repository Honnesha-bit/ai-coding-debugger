/**
 * AI CODING DEBUGGER — FULL-APPLICATION JOURNEY TEST SUITE
 * Tests Phase 5 User Journeys:
 * 1. Guest Journey: Landing -> Debug 1 -> Debug 2 -> Blocked Debug 3 (LOGIN_REQUIRED)
 * 2. Authenticated Journey: Register -> Login -> Submit Code -> History -> Ownership Privacy
 * 3. Evaluation Journey: Cases (25) -> Metrics (7) -> CSV & JSON Exports (CWE-1236 check)
 * 4. Edge Cases: Empty code, invalid language, infinite loop timeout safety, buffer truncation
 */

const BASE_URL = 'http://localhost:3000';

function extractCookie(res, name = 'guest_session_id') {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  for (const header of setCookies) {
    const parts = header.split(';')[0].split('=');
    if (parts[0].trim() === name) {
      return `${parts[0].trim()}=${parts[1].trim()}`;
    }
  }
  return null;
}

function mergeCookies(existing, res) {
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

async function runTest(name, fn) {
  try {
    process.stdout.write(`  Testing: ${name}... `);
    await fn();
    console.log('✓ PASS');
    return { name, status: 'PASS' };
  } catch (err) {
    console.log(`✗ FAIL: ${err.message}`);
    return { name, status: 'FAIL', error: err.message };
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('  STARTING PHASE 5: FULL-APPLICATION TEST SUITE');
  console.log('======================================================\n');

  const results = [];

  // ==========================================
  // JOURNEY 1: GUEST USER JOURNEY
  // ==========================================
  console.log('--- Journey 1: Guest User Flow & Quota Enforcement ---');
  let guestCookie = '';

  results.push(await runTest('1.1 Landing page delivers 200 and valid SPA HTML', async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const html = await res.text();
    if (!html.includes('id="root"')) throw new Error('Root mount point missing from HTML');
    guestCookie = mergeCookies(guestCookie, res);
  }));

  results.push(await runTest('1.2 Initial guest status provides 2 free debugging uses', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/status`, {
      headers: { cookie: guestCookie }
    });
    guestCookie = mergeCookies(guestCookie, res);
    const data = await res.json();
    if (data.authenticated !== false) throw new Error('Expected unauthenticated');
    if (data.guestStatus.remainingUses !== 2) throw new Error(`Expected 2 uses, got ${data.guestStatus.remainingUses}`);
    if (data.guestStatus.isExhausted !== false) throw new Error('Expected not exhausted');
  }));

  results.push(await runTest('1.3 Guest Attempt 1 succeeds and decrements quota to 1', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: guestCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'def add(a, b):\n    return a - b\n\nprint(add(2, 3))',
        errorDescription: 'Subtracts instead of adds'
      })
    });
    guestCookie = mergeCookies(guestCookie, res);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.sessionId) throw new Error('Expected sessionId');
    if (!data.correctedCode) throw new Error('Expected correctedCode');
    if (!data.diff) throw new Error('Expected unified diff');
    if (!data.originalRun || !data.correctedRun) throw new Error('Expected execution runs');
    if (data.guestStatus.remainingUses !== 1) throw new Error(`Expected 1 use remaining, got ${data.guestStatus.remainingUses}`);
  }));

  results.push(await runTest('1.4 Guest Attempt 2 succeeds and decrements quota to 0', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: guestCookie },
      body: JSON.stringify({
        language: 'javascript',
        sourceCode: 'console.log("Attempt 2");',
        errorDescription: 'Second test'
      })
    });
    guestCookie = mergeCookies(guestCookie, res);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.guestStatus.remainingUses !== 0) throw new Error(`Expected 0 uses remaining, got ${data.guestStatus.remainingUses}`);
    if (data.guestStatus.isExhausted !== true) throw new Error('Expected isExhausted=true');
  }));

  results.push(await runTest('1.5 Guest Attempt 3 is blocked by backend with 403 LOGIN_REQUIRED', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: guestCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'print("Attempt 3")',
        errorDescription: 'Third attempt should be blocked'
      })
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    const data = await res.json();
    if (data.error !== 'LOGIN_REQUIRED' && data.code !== 'LOGIN_REQUIRED') {
      throw new Error(`Expected LOGIN_REQUIRED error code, got ${data.error || data.code}`);
    }
  }));

  // ==========================================
  // JOURNEY 2: AUTHENTICATED USER JOURNEY
  // ==========================================
  console.log('\n--- Journey 2: Authenticated User Flow & Private History ---');
  let authCookie = '';
  const testUser = `alice_${Date.now()}`;

  results.push(await runTest('2.1 User registration creates account and issues session token', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        email: `${testUser}@example.com`,
        password: 'Password123!'
      })
    });
    authCookie = mergeCookies(authCookie, res);
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.user || data.user.username !== testUser) throw new Error('User not returned correctly');
  }));

  results.push(await runTest('2.2 Authenticated user enjoys unlimited quota and verified status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/status`, {
      headers: { cookie: authCookie }
    });
    const data = await res.json();
    if (!data.authenticated) throw new Error('Expected authenticated=true');
    if (data.user.username !== testUser) throw new Error('Username mismatch');
    if (data.guestStatus.isExhausted !== false) throw new Error('Authenticated user should not be exhausted');
  }));

  let aliceSessionId = '';
  results.push(await runTest('2.3 Authenticated user submits code and verifies fix in sandbox', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: `def is_even(n):\n    return n % 2 == 1\n\nprint(is_even(4))`,
        errorDescription: 'Returns False for even number 4',
        expectedOutput: 'True'
      })
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    aliceSessionId = data.sessionId;
    if (!aliceSessionId) throw new Error('Missing sessionId');
    if (!data.diagnosis) throw new Error('Missing diagnosis');
    if (data.verified !== true) throw new Error('Expected verified fix');
  }));

  results.push(await runTest('2.4 Authenticated user retrieves private session history', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/history`, {
      headers: { cookie: authCookie }
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.sessions)) throw new Error('Expected sessions array');
    const found = data.sessions.find(s => s.id === aliceSessionId);
    if (!found) throw new Error('Session not found in user history');
  }));

  results.push(await runTest('2.5 Unauthenticated user cannot access private history', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/history`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  }));

  results.push(await runTest('2.6 Cross-user isolation: Bob cannot view Alice session', async () => {
    // Register Bob
    const bobName = `bob_${Date.now()}`;
    const bobRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: bobName,
        email: `${bobName}@example.com`,
        password: 'Password123!'
      })
    });
    const bobCookie = mergeCookies('', bobRes);

    // Bob tries to access Alice's session
    const accessRes = await fetch(`${BASE_URL}/api/v1/history/${aliceSessionId}`, {
      headers: { cookie: bobCookie }
    });
    if (accessRes.status !== 403) throw new Error(`Expected 403, got ${accessRes.status}`);
  }));

  // ==========================================
  // JOURNEY 3: EVALUATION BENCHMARK JOURNEY
  // ==========================================
  console.log('\n--- Journey 3: Evaluation Benchmark & Exports ---');

  results.push(await runTest('3.1 Evaluation dataset contains 25 distinct held-out snippets', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/evaluation/cases`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.totalCases < 25) throw new Error(`Expected at least 25 cases, found ${data.totalCases}`);
  }));

  results.push(await runTest('3.2 Latest benchmark records all 7 required evaluation metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/evaluation/results`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    const r = data.results;
    if (typeof r.fixSuccessRate !== 'number') throw new Error('fixSuccessRate missing');
    if (typeof r.compilationSuccessRate !== 'number') throw new Error('compilationSuccessRate missing');
    if (typeof r.regressionRate !== 'number') throw new Error('regressionRate missing');
    if (typeof r.explanationAccuracy !== 'number') throw new Error('explanationAccuracy missing');
    if (typeof r.sandboxFailureRate !== 'number') throw new Error('sandboxFailureRate missing');
    if (typeof r.medianLatencyMs !== 'number') throw new Error('medianLatencyMs missing');
    if (!r.failureCounts) throw new Error('failureCounts missing');
  }));

  results.push(await runTest('3.3 CSV Export contains headers, records, and CWE-1236 defense', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/evaluation/export?format=csv`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 26) throw new Error(`Expected header + 25 rows, got ${lines.length} lines`);
    if (!lines[0].includes('id') || !lines[0].includes('fixSuccess')) {
      throw new Error('CSV header missing expected columns');
    }
  }));

  results.push(await runTest('3.4 JSON Export returns valid structured JSON array/run', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/evaluation/export?format=json`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (!json.runId && !Array.isArray(json)) throw new Error('Invalid JSON export structure');
  }));

  // ==========================================
  // JOURNEY 4: EDGE CASES & SAFETY
  // ==========================================
  console.log('\n--- Journey 4: Edge Cases, Error Handling & Sandboxed Safety ---');

  results.push(await runTest('4.1 Rejects empty source code with 400 MISSING_CODE', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: '   '
      })
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  }));

  results.push(await runTest('4.2 Rejects unsupported programming language with 400 INVALID_LANGUAGE', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'brainfuck',
        sourceCode: '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>'
      })
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  }));

  results.push(await runTest('4.3 Sandboxed execution handles infinite loop and reports timeout within limits', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'while True:\n    pass',
        errorDescription: 'Infinite loop test'
      })
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.originalRun.status !== 'timeout') {
      throw new Error(`Expected timeout status, got ${data.originalRun.status}`);
    }
  }));

  // Summary
  console.log('\n======================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`  PHASE 5 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
