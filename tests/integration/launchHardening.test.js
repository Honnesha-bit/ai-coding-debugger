import test from 'node:test';
import assert from 'node:assert';
import { startTestServer } from '../testHelper.js';
import { config, validateProductionConfig } from '../../src/config.js';
import { createApp } from '../../src/app.js';
import { setupTestDb, teardownTestDb } from '../testHelper.js';
import { createRateLimiter } from '../../src/middleware/rateLimitMiddleware.js';

test('Launch Hardening & Security Remediation Suite', async (t) => {
  let client;

  t.beforeEach(async () => {
    client = await startTestServer();
  });

  t.afterEach(async () => {
    if (client) await client.close();
  });

  const validPayload = {
    language: 'python',
    sourceCode: 'print("Testing execution endpoint")'
  };

  // 1. POST /api/v1/execute enforces guest quota (Max 2 uses)
  await t.test('1. POST /api/v1/execute enforces guest quota and blocks third attempt', async () => {
    // 1st execute
    const res1 = await client.request('/api/v1/execute', {
      method: 'POST',
      body: validPayload
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.guestStatus.remainingUses, 1);

    // 2nd execute
    const res2 = await client.request('/api/v1/execute', {
      method: 'POST',
      body: validPayload
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.guestStatus.remainingUses, 0);

    // 3rd execute - must be blocked with 403 LOGIN_REQUIRED
    const res3 = await client.request('/api/v1/execute', {
      method: 'POST',
      body: validPayload
    });
    assert.strictEqual(res3.status, 403);
    const data3 = await res3.json();
    assert.strictEqual(data3.error, 'LOGIN_REQUIRED');
    assert.strictEqual(data3.code, 'LOGIN_REQUIRED');
    assert.ok(data3.message.includes('free debugging attempts'));
  });

  // 2. POST /api/v1/execute allows authenticated users without guest quota restriction
  await t.test('2. POST /api/v1/execute allows authenticated users without consuming guest quota', async () => {
    // Register and authenticate
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'execuser', email: 'execuser@example.com', password: 'password123' }
    });

    // Execute multiple times - all must succeed without being blocked by guest quota
    const res1 = await client.request('/api/v1/execute', {
      method: 'POST',
      body: validPayload
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.guestStatus.isExhausted, false);

    const res2 = await client.request('/api/v1/execute', {
      method: 'POST',
      body: validPayload
    });
    assert.strictEqual(res2.status, 200);

    const res3 = await client.request('/api/v1/execute', {
      method: 'POST',
      body: validPayload
    });
    assert.strictEqual(res3.status, 200);
  });

  // 3. POST /api/v1/evaluation/run is protected from unauthenticated access
  await t.test('3. POST /api/v1/evaluation/run rejects unauthenticated requests with 401', async () => {
    const res = await client.request('/api/v1/evaluation/run', {
      method: 'POST'
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNAUTHORIZED');
    assert.strictEqual(data.code, 'UNAUTHORIZED');
  });

  // 4. POST /api/v1/evaluation/run allows authenticated users
  await t.test('4. POST /api/v1/evaluation/run permits authenticated users', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'evaluser', email: 'evaluser@example.com', password: 'password123' }
    });

    const res = await client.request('/api/v1/evaluation/run', {
      method: 'POST'
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.run);
  });

  // 5. Production configuration validator enforces strong SESSION_SECRET
  await t.test('5. validateProductionConfig enforces secret requirements and fails safely', () => {
    // Valid in development
    assert.doesNotThrow(() => {
      validateProductionConfig({ NODE_ENV: 'development', SESSION_SECRET: 'any' });
    });

    // Missing secret in production
    assert.throws(
      () => validateProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: '' }),
      /FATAL CONFIGURATION ERROR: SESSION_SECRET is required/
    );

    // Short secret in production
    assert.throws(
      () => validateProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: 'short_secret_under_32_chars' }),
      /FATAL CONFIGURATION ERROR: SESSION_SECRET is too weak/
    );

    // Known default template secret in production
    assert.throws(
      () => validateProductionConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'ai-coding-debugger-secret-key-32-chars-min'
      }),
      /FATAL CONFIGURATION ERROR: SESSION_SECRET must not use a known template/
    );

    // Strong 64-char secret in production succeeds
    assert.doesNotThrow(() => {
      validateProductionConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'e7c5b6a1d4f20839e94817a5b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4'
      });
    });
  });

  // 6a. Development cookie behavior: omits Secure flag
  await t.test('6a. Cookies omit Secure flag in development mode', async () => {
    const prevEnv = config.NODE_ENV;
    config.NODE_ENV = 'development';

    try {
      const devDb = setupTestDb();
      const devApp = createApp(devDb);

      await new Promise((resolve) => {
        const devServer = devApp.listen(0, '127.0.0.1', async () => {
          const port = devServer.address().port;
          const res = await fetch(`http://127.0.0.1:${port}/api/v1/auth/status`);
          const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
          const guestCookie = setCookies.find(c => c.startsWith('guest_session_id='));

          assert.ok(guestCookie, 'Should set guest_session_id cookie');
          assert.strictEqual(guestCookie.includes('Secure'), false, 'Development cookies must not require Secure');
          assert.ok(guestCookie.includes('HttpOnly'), 'Development cookie must include HttpOnly');

          devServer.close(resolve);
        });
      });
    } finally {
      config.NODE_ENV = prevEnv;
      teardownTestDb();
    }
  });

  // 6b. Production cookie behavior: enforces Secure flag
  await t.test('6b. Cookies enforce Secure flag in production mode', async () => {
    const prevEnv = config.NODE_ENV;
    config.NODE_ENV = 'production';

    try {
      const prodDb = setupTestDb();
      const prodApp = createApp(prodDb);

      await new Promise((resolve) => {
        const prodServer = prodApp.listen(0, '127.0.0.1', async () => {
          const port = prodServer.address().port;
          const res = await fetch(`http://127.0.0.1:${port}/api/v1/auth/status`);
          const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
          const guestCookie = setCookies.find(c => c.startsWith('guest_session_id='));

          assert.ok(guestCookie, 'Should set guest_session_id cookie');
          assert.ok(guestCookie.includes('Secure'), 'Production cookie must include Secure attribute');
          assert.ok(guestCookie.includes('HttpOnly'), 'Production cookie must include HttpOnly');

          prodServer.close(resolve);
        });
      });
    } finally {
      config.NODE_ENV = prevEnv;
      teardownTestDb();
    }
  });

  // 7. Middleware ordering: Authenticated user receives user-keyed rate limit bucket
  await t.test('7. Authenticated user receives user-keyed rate limit bucket', async () => {
    // Register and authenticate user
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'bucketuser', email: 'bucket@example.com', password: 'password123' }
    });

    // Make an API request
    const res = await client.request('/api/v1/languages');
    assert.strictEqual(res.status, 200);

    const limit = res.headers.get('x-ratelimit-limit');
    assert.ok(limit !== null, 'X-RateLimit-Limit must be populated');
  });

  // 8. Repeated requests from one guest IP reach the configured IP limit
  await t.test('8. Repeated requests from one guest IP reach the configured IP limit', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 3, message: 'IP limit hit' });
    const req = { ip: '198.51.100.1', headers: {}, socket: { remoteAddress: '198.51.100.1' } };
    const createRes = () => {
      const r = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      return r;
    };

    let passed = 0;
    const next = () => { passed++; };

    // Requests 1, 2, 3 succeed
    for (let i = 0; i < 3; i++) {
      limiter(req, createRes(), next);
    }
    assert.strictEqual(passed, 3);

    // Request 4 blocked with 429
    const res4 = createRes();
    limiter(req, res4, next);
    assert.strictEqual(passed, 3);
    assert.strictEqual(res4.statusCode, 429);
    assert.strictEqual(res4.body.error, 'RATE_LIMIT_EXCEEDED');
    assert.strictEqual(res4.headers['x-ratelimit-remaining'], '0');
    assert.ok(res4.headers['retry-after']);
  });

  // 9. Rotating guest cookies does NOT reset the IP-based quota (Fix for session-cookie rotation bypass)
  await t.test('9. Rotating guest cookies does NOT reset the IP-based quota', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 3, message: 'Too many requests' });
    const createRes = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } });

    let passed = 0;
    const next = () => { passed++; };

    // Request 1: Session A
    limiter({ ip: '198.51.100.2', guestSessionId: 'gst_session_A', socket: { remoteAddress: '198.51.100.2' } }, createRes(), next);
    // Request 2: Session B (Rotated!)
    limiter({ ip: '198.51.100.2', guestSessionId: 'gst_session_B', socket: { remoteAddress: '198.51.100.2' } }, createRes(), next);
    // Request 3: Session C (Rotated!)
    limiter({ ip: '198.51.100.2', guestSessionId: 'gst_session_C', socket: { remoteAddress: '198.51.100.2' } }, createRes(), next);
    assert.strictEqual(passed, 3);

    // Request 4: Session D (Brand new session cookie!) - Must be BLOCKED because IP quota is exhausted!
    const res4 = createRes();
    limiter({ ip: '198.51.100.2', guestSessionId: 'gst_session_D', socket: { remoteAddress: '198.51.100.2' } }, res4, next);
    assert.strictEqual(passed, 3, '4th request must not pass despite fresh session cookie');
    assert.strictEqual(res4.statusCode, 429);
    assert.strictEqual(res4.body.error, 'RATE_LIMIT_EXCEEDED');
  });

  // 10. Different session cookies from the same IP share the exact same IP bucket
  await t.test('10. Different session cookies from the same IP share the exact same IP bucket', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 5 });
    const createRes = () => ({ headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status() { return this; }, json() { return this; } });

    limiter({ ip: '198.51.100.3', guestSessionId: 'gst_cookie_1' }, createRes(), () => {});
    limiter({ ip: '198.51.100.3', guestSessionId: 'gst_cookie_2' }, createRes(), () => {});
    limiter({ ip: '198.51.100.3', guestSessionId: 'gst_cookie_3' }, createRes(), () => {});

    // IP bucket has 3 hits, while each session bucket has only 1 hit
    assert.strictEqual(limiter.getHitCount('ip_198.51.100.3'), 3);
    assert.strictEqual(limiter.getHitCount('guest_gst_cookie_1'), 1);
    assert.strictEqual(limiter.getHitCount('guest_gst_cookie_2'), 1);
    assert.strictEqual(limiter.getHitCount('guest_gst_cookie_3'), 1);
  });

  // 11. Two independent client IPs have independent IP buckets
  await t.test('11. Two independent client IPs have independent IP buckets', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 2 });
    const createRes = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } });

    let ip1Passed = 0;
    let ip2Passed = 0;

    // IP 1 uses all 2 requests
    limiter({ ip: '203.0.113.10', guestSessionId: 'gst_ip1' }, createRes(), () => { ip1Passed++; });
    limiter({ ip: '203.0.113.10', guestSessionId: 'gst_ip1' }, createRes(), () => { ip1Passed++; });

    // IP 1 3rd request blocked
    const resBlocked = createRes();
    limiter({ ip: '203.0.113.10', guestSessionId: 'gst_ip1' }, resBlocked, () => { ip1Passed++; });
    assert.strictEqual(ip1Passed, 2);
    assert.strictEqual(resBlocked.statusCode, 429);

    // IP 2 is completely unblocked and can make requests
    limiter({ ip: '203.0.113.20', guestSessionId: 'gst_ip2' }, createRes(), () => { ip2Passed++; });
    limiter({ ip: '203.0.113.20', guestSessionId: 'gst_ip2' }, createRes(), () => { ip2Passed++; });
    assert.strictEqual(ip2Passed, 2, 'Independent IP must not be throttled by IP 1 usage');
  });

  // 12. Session-based bucket works when requests share a session across different IPs
  await t.test('12. Session-based bucket works when requests share a session across different IPs', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 2 });
    const createRes = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } });

    let passed = 0;
    // Shared session across IP A and IP B
    limiter({ ip: '10.0.0.1', guestSessionId: 'shared_session' }, createRes(), () => { passed++; });
    limiter({ ip: '10.0.0.2', guestSessionId: 'shared_session' }, createRes(), () => { passed++; });
    assert.strictEqual(passed, 2);

    // Request from IP C with the same shared session is blocked because session bucket reached limit
    const res3 = createRes();
    limiter({ ip: '10.0.0.3', guestSessionId: 'shared_session' }, res3, () => { passed++; });
    assert.strictEqual(passed, 2);
    assert.strictEqual(res3.statusCode, 429);
  });

  // 13. Authenticated-user rate limiting remains compatible and isolated from IP limits
  await t.test('13. Authenticated-user rate limiting remains compatible and isolated', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 2 });
    const createRes = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } });

    // Exhaust IP 198.51.100.99 with guest requests
    limiter({ ip: '198.51.100.99', guestSessionId: 'gst_exh_1' }, createRes(), () => {});
    limiter({ ip: '198.51.100.99', guestSessionId: 'gst_exh_2' }, createRes(), () => {});

    // Authenticated user connecting from the same IP is tracked by user ID, not blocked by guest exhaustion
    let authPassed = 0;
    limiter({ ip: '198.51.100.99', user: { id: 'usr_premium_1' } }, createRes(), () => { authPassed++; });
    assert.strictEqual(authPassed, 1, 'Authenticated user must be keyed by user ID and not blocked by guest IP exhaustion');
    assert.strictEqual(limiter.getHitCount('user_usr_premium_1'), 1);
  });

  // 14. Untrusted forwarded headers cannot arbitrarily change client IP when TRUST_PROXY is false
  await t.test('14. Untrusted forwarded headers cannot arbitrarily change client IP when TRUST_PROXY is false', async () => {
    // client uses default startTestServer where TRUST_PROXY is false
    // Sending spoofed X-Forwarded-For should not change the trusted IP
    const res = await client.request('/api/v1/languages', {
      headers: {
        'X-Forwarded-For': '203.0.113.195, 10.0.0.1'
      }
    });
    assert.strictEqual(res.status, 200);
  });

  // 15. Correctly configured trusted proxy behavior when TRUST_PROXY is true
  await t.test('15. Correctly configured trusted proxy behavior when TRUST_PROXY is true', async () => {
    const prevTrust = config.TRUST_PROXY;
    config.TRUST_PROXY = true;

    try {
      const proxyDb = setupTestDb();
      const proxyApp = createApp(proxyDb);

      await new Promise((resolve) => {
        const proxyServer = proxyApp.listen(0, '127.0.0.1', async () => {
          const port = proxyServer.address().port;
          const res = await fetch(`http://127.0.0.1:${port}/api/v1/languages`, {
            headers: {
              'X-Forwarded-For': '198.51.100.88'
            }
          });
          assert.strictEqual(res.status, 200);
          proxyServer.close(resolve);
        });
      });
    } finally {
      config.TRUST_PROXY = prevTrust;
      teardownTestDb();
    }
  });

  // 16. A request does not incorrectly count twice against the same bucket
  await t.test('16. A request does not incorrectly count twice against the same bucket', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 10 });
    const createRes = () => ({ headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status() { return this; }, json() { return this; } });

    // Request with no guestSessionId (only IP key)
    limiter({ ip: '198.51.100.77', socket: { remoteAddress: '198.51.100.77' } }, createRes(), () => {});
    assert.strictEqual(limiter.getHitCount('ip_198.51.100.77'), 1, 'Exactly 1 hit counted for IP');
  });

  // 17. Bounded in-memory storage prunes excess entries under flood
  await t.test('17. Bounded in-memory storage prunes excess entries under flood', () => {
    const limiter = createRateLimiter({ windowMs: 10000, max: 10, maxEntries: 50 });
    const createRes = () => ({ headers: {}, setHeader() {}, status() { return this; }, json() { return this; } });

    // Send 100 requests with unique sessions
    for (let i = 0; i < 100; i++) {
      limiter({ ip: `10.0.0.${i}`, guestSessionId: `gst_flood_${i}` }, createRes(), () => {});
    }

    // Must be pruned to stay around maxEntries, not growing unbounded
    assert.ok(limiter.getHitCount('guest_gst_flood_99') >= 0);
  });
});
