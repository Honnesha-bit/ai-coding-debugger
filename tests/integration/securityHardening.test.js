import test from 'node:test';
import assert from 'node:assert';
import { startTestServer } from '../testHelper.js';
import { ConcurrencyLimiter } from '../../src/services/sandbox/concurrencyLimiter.js';
import { createRateLimiter } from '../../src/middleware/rateLimitMiddleware.js';

test('Security Hardening & Protection Suite', async (t) => {
  let client;

  t.beforeEach(async () => {
    client = await startTestServer();
  });

  t.afterEach(async () => {
    if (client) await client.close();
  });

  await t.test('1. OWASP Security Headers are present on responses', async () => {
    const res = await client.request('/health');
    assert.strictEqual(res.status, 200);

    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(res.headers.get('x-xss-protection'), '0');
    assert.strictEqual(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
    assert.strictEqual(res.headers.get('x-powered-by'), null);
  });

  await t.test('2. Rate limiting headers are populated on API requests', async () => {
    const res = await client.request('/api/v1/languages');
    assert.strictEqual(res.status, 200);

    const limit = res.headers.get('x-ratelimit-limit');
    const remaining = res.headers.get('x-ratelimit-remaining');

    assert.ok(limit !== null, 'X-RateLimit-Limit should be present');
    assert.ok(remaining !== null, 'X-RateLimit-Remaining should be present');
    assert.ok(parseInt(remaining, 10) >= 0);
  });

  await t.test('3. Rate limiter triggers 429 when max limit is exceeded', async () => {
    // Test the createRateLimiter unit logic directly with small limit
    const smallLimiter = createRateLimiter({
      windowMs: 10000,
      max: 3,
      message: 'Rate limit test exceeded'
    });

    const mockReq = { ip: '127.0.0.1', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const mockRes = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; }
    };

    let calledNext = 0;
    const next = () => { calledNext++; };

    // Request 1, 2, 3 should pass
    smallLimiter(mockReq, mockRes, next);
    smallLimiter(mockReq, mockRes, next);
    smallLimiter(mockReq, mockRes, next);
    assert.strictEqual(calledNext, 3);

    // Request 4 should be rejected with 429
    smallLimiter(mockReq, mockRes, next);
    assert.strictEqual(mockRes.statusCode, 429);
    assert.strictEqual(mockRes.body.error, 'RATE_LIMIT_EXCEEDED');
    assert.ok(mockRes.headers['retry-after']);
    assert.strictEqual(calledNext, 3);
  });

  await t.test('4. Large request bodies (>512kb) are rejected with 413 Payload Too Large', async () => {
    // Generate 600KB payload
    const largeCode = 'a'.repeat(600 * 1024);
    const res = await client.request('/api/v1/debug', {
      method: 'POST',
      body: {
        language: 'python',
        sourceCode: largeCode
      }
    });

    assert.strictEqual(res.status, 413);
  });

  await t.test('5. ConcurrencyLimiter bounded execution queue operates correctly', async () => {
    const limiter = new ConcurrencyLimiter({
      maxConcurrent: 2,
      maxQueue: 2,
      queueTimeoutMs: 500
    });

    const release1 = await limiter.acquire();
    const release2 = await limiter.acquire();

    const stats = limiter.getStats();
    assert.strictEqual(stats.running, 2);
    assert.strictEqual(stats.queued, 0);

    // Queue 3rd and 4th requests
    let slot3Acquired = false;
    const p3 = limiter.acquire().then(rel => {
      slot3Acquired = true;
      return rel;
    });

    assert.strictEqual(limiter.getStats().queued, 1);

    // 5th request should be rejected immediately because maxQueue is 2
    let slot4Acquired = false;
    const p4 = limiter.acquire().then(rel => {
      slot4Acquired = true;
      return rel;
    });
    assert.strictEqual(limiter.getStats().queued, 2);

    await assert.rejects(
      async () => {
        await limiter.acquire();
      },
      (err) => {
        assert.strictEqual(err.code, 'SERVER_BUSY');
        assert.strictEqual(err.statusCode, 503);
        return true;
      }
    );

    // Release 1st slot, slot 3 should be granted
    release1();
    const release3 = await p3;
    assert.strictEqual(slot3Acquired, true);

    // Clean up
    release2();
    const release4 = await p4;
    release3();
    release4();

    assert.strictEqual(limiter.getStats().running, 0);
  });

  await t.test('6. Sandbox status endpoint includes concurrency limiter statistics', async () => {
    const res = await client.request('/api/v1/sandbox/status');
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.ok(data.concurrency, 'concurrency stats should be present');
    assert.strictEqual(typeof data.concurrency.running, 'number');
    assert.strictEqual(typeof data.concurrency.queued, 'number');
    assert.strictEqual(typeof data.concurrency.maxConcurrent, 'number');
    assert.strictEqual(typeof data.concurrency.maxQueue, 'number');
  });
});
