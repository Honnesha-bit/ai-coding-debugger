import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../src/app.js';
import { createSandboxExecutorApp } from '../../src/services/sandbox/sandboxExecutorServer.js';
import { getDatabase, closeDatabase } from '../../src/db/database.js';
import { config } from '../../src/config.js';

describe('Gateway & Sandbox Executor End-to-End Integration Suite', () => {
  const TEST_SECRET = 'gateway-integration-secret-32-chars-minimum-token';
  let executorServer;
  let executorUrl;
  let gatewayServer;
  let gatewayUrl;
  let savedEnv;
  let origConfigAi;

  before(async () => {
    savedEnv = { ...process.env };
    origConfigAi = config.AI_PROVIDER;
    config.AI_PROVIDER = 'mock';
    // 1. Start test Sandbox Executor service
    const mockContainerRunner = {
      id: 'container',
      name: 'Mock Container Runner',
      isAvailable: () => true,
      checkReadiness: () => ({ ready: true, daemonRunning: true, imagePresent: true }),
      getBinaryName: () => 'docker',
      getCapabilities: () => ({
        isolated: true,
        isolationType: 'docker_container',
        runtime: 'docker'
      }),
      cleanupStaleContainers: () => ({ cleaned: 0, errors: [] })
    };

    const mockSandboxService = {
      getStatus: () => ({
        mode: 'container',
        isIsolated: true,
        isolationType: 'docker_container'
      }),
      execute: async ({ language, code }) => {
        if (code.includes('fail_infra')) {
          return {
            status: 'infrastructure_error',
            success: false,
            exitCode: -1,
            stdout: '',
            stderr: 'Sandbox worker failure simulation.',
            durationMs: 10,
            errorType: 'INFRASTRUCTURE_ERROR'
          };
        }
        return {
          status: 'success',
          success: true,
          exitCode: 0,
          stdout: `Executed in isolated sandbox: language=${language}`,
          stderr: '',
          durationMs: 25,
          errorType: null
        };
      }
    };

    const executorApp = createSandboxExecutorApp({
      secret: TEST_SECRET,
      containerRunner: mockContainerRunner,
      sandboxService: mockSandboxService
    });

    executorServer = http.createServer(executorApp);
    await new Promise((resolve) => {
      executorServer.listen(0, '127.0.0.1', () => {
        executorUrl = `http://127.0.0.1:${executorServer.address().port}`;
        resolve();
      });
    });

    // 2. Start Gateway App configured with SANDBOX_MODE=executor and the executorUrl
    process.env.SANDBOX_MODE = 'executor';
    process.env.SANDBOX_EXECUTOR_URL = executorUrl;
    process.env.SANDBOX_EXECUTOR_SECRET = TEST_SECRET;
    process.env.AI_PROVIDER = 'mock';

    const gatewayApp = createApp();
    gatewayServer = http.createServer(gatewayApp);
    await new Promise((resolve) => {
      gatewayServer.listen(0, '127.0.0.1', () => {
        gatewayUrl = `http://127.0.0.1:${gatewayServer.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (gatewayServer) {
      await new Promise((resolve) => gatewayServer.close(resolve));
    }
    if (executorServer) {
      await new Promise((resolve) => executorServer.close(resolve));
    }
    try {
      closeDatabase();
    } catch {}

    config.AI_PROVIDER = origConfigAi;

    // Restore environment variables to prevent leaking into subsequent integration suites
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it('1. GET /api/v1/sandbox/status on gateway reports isolated_sandbox_service without Docker socket access', async () => {
    const res = await fetch(`${gatewayUrl}/api/v1/sandbox/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.mode, 'executor');
    assert.equal(data.isolationType, 'isolated_sandbox_service');
    assert.equal(data.capabilities.gatewayDockerSocketAccess, false);
  });

  it('2. POST /api/v1/debug routes code to executor and returns diagnosed and verified solution', async () => {
    const res = await fetch(`${gatewayUrl}/api/v1/debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'def add(a, b):\n    return a - b\n',
        errorDescription: 'Expected addition but subtracts',
        expectedOutput: 'add(2, 3) == 5',
        testCases: 'assert add(2, 3) == 5'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.sessionId);
    assert.ok(data.diagnosis);
    assert.ok(data.correctedCode);
    assert.equal(data.originalRun.isolationType, 'isolated_sandbox_service');
  });

  it('3. Preserves guest attempts refund when sandbox infrastructure failure occurs', async () => {
    // Check initial guest status
    const initialStatusRes = await fetch(`${gatewayUrl}/api/v1/guest/status`);
    const initialStatus = await initialStatusRes.json();
    const initialRemaining = initialStatus.remainingUses;

    // Send code triggering infrastructure error
    const res = await fetch(`${gatewayUrl}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'def buggy():\n    # fail_infra\n    pass\n',
        errorDescription: 'Infra failure trigger',
        expectedOutput: 'none'
      })
    });

    assert.equal(res.status, 500);
    const data = await res.json();
    assert.equal(data.error, 'SANDBOX_INFRASTRUCTURE_FAILURE');

    // Verify guest attempt was refunded
    const afterStatusRes = await fetch(`${gatewayUrl}/api/v1/guest/status`);
    const afterStatus = await afterStatusRes.json();
    assert.equal(afterStatus.remainingUses, initialRemaining);
  });
});
