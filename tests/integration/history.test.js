import test from 'node:test';
import assert from 'node:assert';
import { startTestServer } from '../testHelper.js';
import { DebugSessionRepository } from '../../src/db/repositories/debugSessionRepository.js';

function createIsolatedClient(baseUrl) {
  const cookieJar = {};
  return {
    cookieJar,
    async request(endpoint, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (Object.keys(cookieJar).length > 0) {
        headers['Cookie'] = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
      }
      if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }
      const res = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const sc of raw) {
        const parts = sc.split(';')[0].split('=');
        if (parts.length >= 2) cookieJar[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
      return res;
    }
  };
}

test('History Integration Suite - Privacy, Ownership & Pagination Enforcement', async (t) => {
  let client;

  t.beforeEach(async () => {
    client = await startTestServer();
  });

  t.afterEach(async () => {
    if (client) await client.close();
  });

  await t.test('1. Guest session identity, ownership, and deletion', async () => {
    // Guest creates a debugging session
    const debugRes = await client.request('/api/v1/debug', {
      method: 'POST',
      body: {
        language: 'python',
        sourceCode: 'print("guest debug code preview testing")',
        errorDescription: 'Guest syntax issue'
      }
    });
    assert.strictEqual(debugRes.status, 200);
    const debugData = await debugRes.json();
    const guestSessionId = debugData.sessionId;
    assert.ok(guestSessionId);

    // Guest lists their history
    const historyRes = await client.request('/api/v1/history');
    assert.strictEqual(historyRes.status, 200);
    const historyData = await historyRes.json();
    assert.strictEqual(historyData.success, true);
    assert.strictEqual(historyData.sessions.length, 1);
    assert.strictEqual(historyData.totalCount, 1);

    const first = historyData.sessions[0];
    assert.strictEqual(first.id, guestSessionId);
    assert.strictEqual(first.language, 'python');
    assert.strictEqual(first.errorDescription, 'Guest syntax issue');
    assert.ok(first.sourceCodePreview.includes('guest debug code preview'));
    assert.ok(first.verificationStatus);

    // Guest fetches single session details
    const getRes = await client.request(`/api/v1/history/${guestSessionId}`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.session.id, guestSessionId);

    // Guest deletes their session
    const delRes = await client.request(`/api/v1/history/${guestSessionId}`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);

    // After deletion, session returns 404 NOT_FOUND
    const verifyDelRes = await client.request(`/api/v1/history/${guestSessionId}`);
    assert.strictEqual(verifyDelRes.status, 404);
  });

  await t.test('2. Authenticated user Alice cannot view or delete User Bob session', async () => {
    // Register and login Alice
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'alice', email: 'alice@example.com', password: 'password123' }
    });

    const debugRes = await client.request('/api/v1/debug', {
      method: 'POST',
      body: {
        language: 'python',
        sourceCode: 'print("alice debug")',
        errorDescription: 'Alice specific bug'
      }
    });
    const debugData = await debugRes.json();
    const aliceSessionId = debugData.sessionId;
    assert.ok(aliceSessionId);

    // Register and login Bob on an isolated client instance
    const bobClient = createIsolatedClient(client.baseUrl);
    await bobClient.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'bob', email: 'bob@example.com', password: 'password123' }
    });

    // Bob cannot read Alice's session
    const getRes = await bobClient.request(`/api/v1/history/${aliceSessionId}`);
    assert.strictEqual(getRes.status, 403);
    const getData = await getRes.json();
    assert.strictEqual(getData.error, 'FORBIDDEN');

    // Bob cannot delete Alice's session
    const delRes = await bobClient.request(`/api/v1/history/${aliceSessionId}`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 403);
    const delData = await delRes.json();
    assert.strictEqual(delData.error, 'FORBIDDEN');
  });

  await t.test('3. Cross-guest isolation and guest-to-user isolation', async () => {
    const guest1 = createIsolatedClient(client.baseUrl);
    const guest2 = createIsolatedClient(client.baseUrl);

    // Guest 1 creates a session
    const res1 = await guest1.request('/api/v1/debug', {
      method: 'POST',
      body: { language: 'python', sourceCode: 'print("g1")', errorDescription: 'G1 Error' }
    });
    const data1 = await res1.json();
    const g1SessionId = data1.sessionId;

    // Guest 2 creates a session
    const res2 = await guest2.request('/api/v1/debug', {
      method: 'POST',
      body: { language: 'javascript', sourceCode: 'console.log("g2")', errorDescription: 'G2 Error' }
    });
    const data2 = await res2.json();
    const g2SessionId = data2.sessionId;

    // Guest 2 checks history: must ONLY see G2, NOT G1
    const listRes2 = await guest2.request('/api/v1/history');
    const listData2 = await listRes2.json();
    assert.strictEqual(listData2.sessions.length, 1);
    assert.strictEqual(listData2.sessions[0].id, g2SessionId);

    // Guest 2 attempts to read Guest 1 session: 403 FORBIDDEN
    const crossGetRes = await guest2.request(`/api/v1/history/${g1SessionId}`);
    assert.strictEqual(crossGetRes.status, 403);

    // Guest 2 attempts to delete Guest 1 session: 403 FORBIDDEN
    const crossDelRes = await guest2.request(`/api/v1/history/${g1SessionId}`, { method: 'DELETE' });
    assert.strictEqual(crossDelRes.status, 403);
  });

  await t.test('4. Client-supplied guestSessionId / userId in query is strictly ignored', async () => {
    const guest1 = createIsolatedClient(client.baseUrl);
    const guest2 = createIsolatedClient(client.baseUrl);

    // Guest 1 creates a session
    const res1 = await guest1.request('/api/v1/debug', {
      method: 'POST',
      body: { language: 'python', sourceCode: 'print("g1 secret")', errorDescription: 'Secret' }
    });
    const data1 = await res1.json();
    const g1SessionId = data1.sessionId;

    // Guest 2 establishes cookie
    await guest2.request('/api/v1/languages');

    // Guest 2 attempts to impersonate Guest 1 via query params
    const spoofRes = await guest2.request(`/api/v1/history?guestSessionId=${guest1.cookieJar['guest_session_id']}&userId=some_admin`);
    assert.strictEqual(spoofRes.status, 200);
    const spoofData = await spoofRes.json();
    // Must return 0 sessions because Guest 2 has created 0 sessions
    assert.strictEqual(spoofData.sessions.length, 0);
  });

  await t.test('5. Database-level pagination, limits, and total counts', async () => {
    // Register and login Alice
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'alice_pagination', email: 'alice_pag@example.com', password: 'password123' }
    });

    // Populate multiple sessions in DB
    const repo = new DebugSessionRepository();
    const authStatusRes = await client.request('/api/v1/auth/status');
    const authData = await authStatusRes.json();
    const aliceId = authData.user.id;

    for (let i = 1; i <= 7; i++) {
      repo.create({
        id: `dbg_pag_test_${i}`,
        userId: aliceId,
        language: i % 2 === 0 ? 'python' : 'javascript',
        sourceCode: `console.log("code ${i}")`,
        errorDescription: `Error number ${i}`,
        diagnosis: `Diag ${i}`,
        rootCause: `Cause ${i}`,
        correctedCode: `console.log("fixed ${i}")`,
        diff: '+ fix',
        confidence: 'high',
        verified: i <= 4,
        verificationStatus: i <= 4 ? 'FIX VERIFIED' : 'FIX NOT VERIFIED',
        createdAt: new Date(Date.now() + i * 1000).toISOString()
      });
    }

    // Page 1 with limit 3
    const p1Res = await client.request('/api/v1/history?limit=3&page=1');
    assert.strictEqual(p1Res.status, 200);
    const p1Data = await p1Res.json();
    assert.strictEqual(p1Data.sessions.length, 3);
    assert.strictEqual(p1Data.totalCount, 7);
    assert.strictEqual(p1Data.totalPages, 3);
    assert.strictEqual(p1Data.page, 1);
    assert.strictEqual(p1Data.pageSize, 3);

    // Page 2 with limit 3
    const p2Res = await client.request('/api/v1/history?limit=3&page=2');
    const p2Data = await p2Res.json();
    assert.strictEqual(p2Data.sessions.length, 3);
    assert.strictEqual(p2Data.page, 2);

    // Page 3 with limit 3 (should have 1 session)
    const p3Res = await client.request('/api/v1/history?limit=3&page=3');
    const p3Data = await p3Res.json();
    assert.strictEqual(p3Data.sessions.length, 1);
    assert.strictEqual(p3Data.page, 3);

    // Safe bounds: limit > 50 is clamped to 50
    const clampedRes = await client.request('/api/v1/history?limit=100');
    const clampedData = await clampedRes.json();
    assert.strictEqual(clampedData.pageSize, 50);

    // Safe bounds: limit < 1 is clamped to 1
    const minLimitRes = await client.request('/api/v1/history?limit=-5');
    const minLimitData = await minLimitRes.json();
    assert.strictEqual(minLimitData.pageSize, 1);
  });

  await t.test('6. Language and verification status filters', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'alice_filter', email: 'alice_filter@example.com', password: 'password123' }
    });

    const repo = new DebugSessionRepository();
    const authStatusRes = await client.request('/api/v1/auth/status');
    const authData = await authStatusRes.json();
    const aliceId = authData.user.id;

    repo.create({
      id: 'dbg_py_ver',
      userId: aliceId,
      language: 'python',
      sourceCode: 'print(1)',
      errorDescription: 'Python verified bug',
      diagnosis: 'Diag',
      rootCause: 'Cause',
      correctedCode: 'print(1)',
      diff: '',
      confidence: 'high',
      verified: true,
      verificationStatus: 'FIX VERIFIED',
      createdAt: new Date().toISOString()
    });

    repo.create({
      id: 'dbg_js_unver',
      userId: aliceId,
      language: 'javascript',
      sourceCode: 'console.log(1)',
      errorDescription: 'JS unverified bug',
      diagnosis: 'Diag',
      rootCause: 'Cause',
      correctedCode: 'console.log(1)',
      diff: '',
      confidence: 'medium',
      verified: false,
      verificationStatus: 'FIX NOT VERIFIED',
      createdAt: new Date(Date.now() + 1000).toISOString()
    });

    // Filter by language: python
    const pyRes = await client.request('/api/v1/history?language=python');
    const pyData = await pyRes.json();
    assert.strictEqual(pyData.totalCount, 1);
    assert.strictEqual(pyData.sessions[0].id, 'dbg_py_ver');

    // Filter by language: javascript
    const jsRes = await client.request('/api/v1/history?language=javascript');
    const jsData = await jsRes.json();
    assert.strictEqual(jsData.totalCount, 1);
    assert.strictEqual(jsData.sessions[0].id, 'dbg_js_unver');

    // Filter by status: verified
    const verRes = await client.request('/api/v1/history?status=verified');
    const verData = await verRes.json();
    assert.strictEqual(verData.totalCount, 1);
    assert.strictEqual(verData.sessions[0].id, 'dbg_py_ver');

    // Filter by status: unverified
    const unverRes = await client.request('/api/v1/history?status=unverified');
    const unverData = await unverRes.json();
    assert.strictEqual(unverData.totalCount, 1);
    assert.strictEqual(unverData.sessions[0].id, 'dbg_js_unver');
  });

  await t.test('7. Search and SQL injection resistance', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'alice_sqli', email: 'alice_sqli@example.com', password: 'password123' }
    });

    const repo = new DebugSessionRepository();
    const authStatusRes = await client.request('/api/v1/auth/status');
    const authData = await authStatusRes.json();
    const aliceId = authData.user.id;

    repo.create({
      id: 'dbg_sqli_target',
      userId: aliceId,
      language: 'python',
      sourceCode: 'x = 1',
      errorDescription: 'Target unique keyword zebra',
      diagnosis: 'Diag',
      rootCause: 'Cause',
      correctedCode: 'x = 1',
      diff: '',
      confidence: 'high',
      verified: true,
      verificationStatus: 'FIX VERIFIED',
      createdAt: new Date().toISOString()
    });

    // Search by keyword
    const searchRes = await client.request('/api/v1/history?search=zebra');
    const searchData = await searchRes.json();
    assert.strictEqual(searchData.totalCount, 1);
    assert.strictEqual(searchData.sessions[0].id, 'dbg_sqli_target');

    // SQL Injection payload in language
    const sqliLangRes = await client.request('/api/v1/history?language=\' OR 1=1 --');
    assert.strictEqual(sqliLangRes.status, 200);
    const sqliLangData = await sqliLangRes.json();
    assert.strictEqual(sqliLangData.totalCount, 0);

    // SQL Injection payload in search
    const sqliSearchRes = await client.request('/api/v1/history?search=\' OR \'1\'=\'1');
    assert.strictEqual(sqliSearchRes.status, 200);
    const sqliSearchData = await sqliSearchRes.json();
    // Searches literally for "' OR '1'='1" and does not return everything
    assert.strictEqual(sqliSearchData.totalCount, 0);
  });
});
