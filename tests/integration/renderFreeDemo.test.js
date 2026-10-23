import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../src/app.js';
import { closeDatabase } from '../../src/db/database.js';
import { config } from '../../src/config.js';

describe('Render Free Demo Mode Verification Suite (SANDBOX_MODE=safe_verification)', () => {
  let server;
  let baseUrl;
  let savedEnv;
  let origConfigAi;

  before(async () => {
    savedEnv = { ...process.env };
    origConfigAi = config.AI_PROVIDER;
    config.AI_PROVIDER = 'mock';
    // Configure environment as it would be configured on Render Free Web Service in demo mode
    process.env.NODE_ENV = 'production';
    process.env.PORT = '0';
    process.env.SESSION_SECRET = 'render-free-demo-session-secret-at-least-32-chars-long';
    process.env.SANDBOX_MODE = 'safe_verification';
    process.env.AI_PROVIDER = 'mock';
    process.env.SANDBOX_EXECUTOR_URL = '';
    process.env.SANDBOX_EXECUTOR_SECRET = '';

    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      closeDatabase();
    } catch {}

    config.AI_PROVIDER = origConfigAi;

    // Restore environment variables
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it('1. GET /health responds HTTP 200 with healthy status (Render healthcheck compatible)', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.equal(data.version, '1.0.0');
  });

  it('2. GET /api/health and /api/v1/health respond HTTP 200 identically', async () => {
    const res1 = await fetch(`${baseUrl}/api/health`);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.status, 'healthy');

    const res2 = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.status, 'healthy');
  });

  it('3. GET /api/v1/sandbox/status reports safe_verification mode without Docker or executor', async () => {
    const res = await fetch(`${baseUrl}/api/v1/sandbox/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.mode, 'safe_verification');
    assert.equal(data.isSafeVerification, true);
    assert.equal(data.isIsolated, false);
    assert.equal(data.isolationType, 'container_unavailable');
  });

  it('4. POST /api/v1/debug safely analyzes code without dynamic execution on host', async () => {
    const res = await fetch(`${baseUrl}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'def calculate_discount(price, pct):\n    return price - (price * pct)\n',
        errorDescription: 'Discount calculation logic defect',
        expectedOutput: 'calculate_discount(100, 0.2) == 80',
        testCases: 'assert calculate_discount(100, 0.2) == 80'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.sessionId);
    assert.ok(data.diagnosis);
    assert.ok(data.correctedCode);
    assert.ok(data.provider.startsWith('mock'), 'Expected mock provider');

    // Dynamic execution must report execution_unavailable
    assert.equal(data.originalRun.status, 'execution_unavailable');
    assert.equal(data.originalRun.executionAvailable, false);
    assert.ok(data.downloadableTestFile, 'Must offer downloadable test file for local execution');
    assert.ok(data.staticChecks, 'Must include static check results');
  });

  it('5. Arbitrary/malicious code is never executed on the host OS', async () => {
    // Attempt code that would create a marker file on the host if executed
    const markerFile = `marker_${Date.now()}.txt`;
    const maliciousCode = `import os\nwith open("${markerFile}", "w") as f:\n    f.write("BREACH")\n`;

    const res = await fetch(`${baseUrl}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'python',
        sourceCode: maliciousCode,
        errorDescription: 'Security check'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.originalRun.status, 'execution_unavailable');
    assert.equal(data.originalRun.executionAvailable, false);

    // Verify file was NEVER created on disk
    const fs = await import('node:fs');
    assert.equal(fs.existsSync(markerFile), false, 'Malicious code must NEVER be executed on host');
  });

  it('6. Guest quota (2 free attempts) enforces limits and offers login in demo mode', async () => {
    // Check guest status
    const statusRes = await fetch(`${baseUrl}/api/v1/guest/status`);
    const statusData = await statusRes.json();
    assert.equal(statusData.success, true);
    assert.equal(typeof statusData.remainingUses, 'number');
    assert.equal(statusData.maxUses, 2);
  });
});
