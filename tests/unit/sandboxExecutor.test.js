import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSandboxExecutorApp, ALLOWED_LANGUAGES, MAX_CODE_BYTES } from '../../src/services/sandbox/sandboxExecutorServer.js';
import { RemoteExecutorClient } from '../../src/services/sandbox/remoteExecutorClient.js';
import { SandboxManager } from '../../src/services/sandbox/sandboxManager.js';
import { SandboxService } from '../../src/services/sandboxService.js';

describe('Secure Sandbox Executor Service & Isolation Boundary Suite', () => {
  const TEST_SECRET = 'test-executor-secret-at-least-32-characters-long-hex';
  let server;
  let baseUrl;
  let mockExecutedRequests = [];
  let mockCleanupCalled = false;

  before(async () => {
    // Create test instance of executor app with a mock runner to avoid needing Docker daemon in unit test
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
      cleanupStaleContainers: () => {
        mockCleanupCalled = true;
        return { cleaned: 3, errors: [] };
      }
    };

    const mockSandboxService = {
      getStatus: () => ({
        mode: 'container',
        isIsolated: true,
        isolationType: 'docker_container'
      }),
      execute: async (opts) => {
        mockExecutedRequests.push(opts);
        if (opts.code.includes('RAISE_TIMEOUT')) {
          return {
            status: 'timeout',
            success: false,
            exitCode: -1,
            stdout: '',
            stderr: 'Execution timed out.',
            durationMs: opts.timeoutMs || 5000,
            errorType: 'TIMEOUT'
          };
        }
        return {
          status: 'success',
          success: true,
          exitCode: 0,
          stdout: `Executed ${opts.language} cleanly`,
          stderr: '',
          durationMs: 42,
          errorType: null
        };
      }
    };

    const app = createSandboxExecutorApp({
      secret: TEST_SECRET,
      containerRunner: mockContainerRunner,
      sandboxService: mockSandboxService
    });

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
  });

  // 1. Healthcheck Endpoint
  it('1. GET /health responds 200 without requiring authentication (for Docker healthcheck)', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'ai-coding-debugger-sandbox-executor');
  });

  // 2. Unauthorized Requests Rejection
  it('2. Rejects unauthorized requests without X-Executor-Secret with 401', async () => {
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'python',
        code: 'print("hello")'
      })
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'UNAUTHORIZED');
  });

  it('3. Rejects requests with invalid X-Executor-Secret with 401', async () => {
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Secret': 'wrong-secret-token'
      },
      body: JSON.stringify({
        language: 'python',
        code: 'print("hello")'
      })
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'UNAUTHORIZED');
  });

  it('4. Rejects GET /status without credentials with 401', async () => {
    const res = await fetch(`${baseUrl}/status`);
    assert.equal(res.status, 401);
  });

  it('5. Allows GET /status when authenticated with valid X-Executor-Secret', async () => {
    const res = await fetch(`${baseUrl}/status`, {
      headers: { 'X-Executor-Secret': TEST_SECRET }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.service, 'ai-coding-debugger-sandbox-executor');
  });

  // 3. Rejection of Arbitrary Options, Host Mounts, and Privileged Flags
  it('6. Rejects attempts to pass arbitrary Docker options (mounts, privileged, network)', async () => {
    const maliciousPayloads = [
      { language: 'python', code: 'x = 1', mounts: ['/:/host'] },
      { language: 'python', code: 'x = 1', volumes: ['/var/run/docker.sock:/sock'] },
      { language: 'python', code: 'x = 1', privileged: true },
      { language: 'python', code: 'x = 1', network: 'host' },
      { language: 'python', code: 'x = 1', image: 'malicious-image:latest' },
      { language: 'python', code: 'x = 1', capAdd: ['SYS_ADMIN'] },
      { language: 'python', code: 'x = 1', securityOpt: ['label=disable'] },
      { language: 'python', code: 'x = 1', cmd: 'rm', args: ['-rf', '/'] },
      { language: 'python', code: 'x = 1', cwd: '/etc' },
      { language: 'python', code: 'x = 1', env: { HOST_SECRET: 'leaked' } }
    ];

    for (const payload of maliciousPayloads) {
      const res = await fetch(`${baseUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Executor-Secret': TEST_SECRET
        },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 400, `Expected 400 for payload: ${JSON.stringify(payload)}`);
      const data = await res.json();
      assert.equal(data.error, 'FORBIDDEN_PARAMETER');
      assert.ok(data.message.includes('forbidden'));
    }
  });

  // 4. Invalid Execution Requests
  it('7. Rejects non-allowlisted languages (e.g. bash, ruby, perl, php)', async () => {
    const unallowed = ['bash', 'sh', 'ruby', 'perl', 'php', 'powershell', 'zsh', 'cmd'];
    for (const lang of unallowed) {
      const res = await fetch(`${baseUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Executor-Secret': TEST_SECRET
        },
        body: JSON.stringify({
          language: lang,
          code: 'echo 123'
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'UNSUPPORTED_LANGUAGE');
    }
  });

  it('8. Accepts all allowlisted programming languages', async () => {
    for (const lang of ALLOWED_LANGUAGES) {
      const res = await fetch(`${baseUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Executor-Secret': TEST_SECRET
        },
        body: JSON.stringify({
          language: lang,
          code: '// valid snippet'
        })
      });
      assert.equal(res.status, 200, `Expected 200 for allowed language: ${lang}`);
    }
  });

  it('9. Rejects empty code submissions with 400', async () => {
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Secret': TEST_SECRET
      },
      body: JSON.stringify({
        language: 'python',
        code: ''
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'EMPTY_CODE');
  });

  it('10. Rejects oversized code submissions (>64KB) with 400', async () => {
    const oversizedCode = 'a'.repeat(MAX_CODE_BYTES + 10);
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Secret': TEST_SECRET
      },
      body: JSON.stringify({
        language: 'python',
        code: oversizedCode
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'CODE_EXCEEDS_MAX_SIZE');
  });

  it('11. Rejects invalid timeout values (<100ms or non-number)', async () => {
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Secret': TEST_SECRET
      },
      body: JSON.stringify({
        language: 'python',
        code: 'print("x")',
        timeoutMs: -50
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'INVALID_TIMEOUT');
  });

  // 5. Timeout & Resource Bounds
  it('12. Automatically clamps timeout values exceeding 15000ms to 15000ms ceiling', async () => {
    mockExecutedRequests = [];
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Secret': TEST_SECRET
      },
      body: JSON.stringify({
        language: 'python',
        code: 'print("test")',
        timeoutMs: 999999
      })
    });
    assert.equal(res.status, 200);
    assert.equal(mockExecutedRequests.length, 1);
    assert.equal(mockExecutedRequests[0].timeoutMs, 15000);
  });

  it('13. Correctly propagates timeout status when execution exceeds limit', async () => {
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Secret': TEST_SECRET
      },
      body: JSON.stringify({
        language: 'python',
        code: 'while True: pass # RAISE_TIMEOUT',
        timeoutMs: 1000
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'timeout');
    assert.equal(data.errorType, 'TIMEOUT');
  });

  // 6. Stale Container Pruning Endpoint
  it('14. POST /cleanup prunes stale containers and returns cleanup metrics', async () => {
    mockCleanupCalled = false;
    const res = await fetch(`${baseUrl}/cleanup`, {
      method: 'POST',
      headers: { 'X-Executor-Secret': TEST_SECRET }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.cleaned, 3);
    assert.equal(mockCleanupCalled, true);
  });

  // 7. RemoteExecutorClient Integration & Gateway Decoupling
  it('15. RemoteExecutorClient correctly reports capabilities indicating gateway has no Docker socket', () => {
    const client = new RemoteExecutorClient({
      executorUrl: baseUrl,
      executorSecret: TEST_SECRET
    });
    const caps = client.getCapabilities();
    assert.equal(caps.gatewayDockerSocketAccess, false);
    assert.equal(caps.isolationType, 'isolated_sandbox_service');
    assert.equal(caps.networkMode, 'none');
    assert.ok(caps.description.includes('ZERO Docker socket access'));
  });

  it('16. RemoteExecutorClient forwards execution requests and parses responses cleanly', async () => {
    const client = new RemoteExecutorClient({
      executorUrl: baseUrl,
      executorSecret: TEST_SECRET
    });

    const result = await client.execute({
      language: 'python',
      code: 'print("Hello via RemoteExecutorClient")',
      testCode: 'assert True'
    });

    assert.equal(result.status, 'success');
    assert.equal(result.isolationType, 'isolated_sandbox_service');
    assert.ok(result.stdout.includes('Executed python cleanly'));
  });

  it('17. RemoteExecutorClient fails closed with EXECUTOR_UNAVAILABLE when executor is down', async () => {
    const deadClient = new RemoteExecutorClient({
      executorUrl: 'http://127.0.0.1:59999',
      executorSecret: TEST_SECRET,
      timeoutMs: 1000
    });

    const result = await deadClient.execute({
      language: 'python',
      code: 'print("Will fail safely")'
    });

    assert.equal(result.status, 'infrastructure_error');
    assert.equal(result.errorType, 'EXECUTOR_UNAVAILABLE');
    assert.ok(result.stderr.includes('Failed to connect to sandbox executor service'));
  });

  it('18. RemoteExecutorClient fails closed with EXECUTOR_AUTH_ERROR when credentials fail', async () => {
    const badAuthClient = new RemoteExecutorClient({
      executorUrl: baseUrl,
      executorSecret: 'invalid-secret'
    });

    const result = await badAuthClient.execute({
      language: 'python',
      code: 'print("Auth failure test")'
    });

    assert.equal(result.status, 'infrastructure_error');
    assert.equal(result.errorType, 'EXECUTOR_AUTH_ERROR');
    assert.ok(result.stderr.includes('Authentication failed between gateway and sandbox executor'));
  });

  it('19. SandboxManager activates RemoteExecutorClient when mode=executor', () => {
    const manager = new SandboxManager({
      mode: 'executor',
      executorUrl: baseUrl,
      executorSecret: TEST_SECRET
    });

    assert.equal(manager.mode, 'executor');
    const runner = manager.getActiveRunner();
    assert.equal(runner.id, 'remote_executor');

    const status = manager.getStatus();
    assert.equal(status.mode, 'executor');
    assert.equal(status.isolationType, 'isolated_sandbox_service');
    assert.equal(status.capabilities.gatewayDockerSocketAccess, false);
  });

  it('20. SandboxService in executor mode routes through remote client without touching local disk', async () => {
    const manager = new SandboxManager({
      mode: 'executor',
      executorUrl: baseUrl,
      executorSecret: TEST_SECRET
    });

    const sandbox = new SandboxService(5000, 65536, manager);
    const result = await sandbox.execute({
      language: 'javascript',
      code: 'console.log("Gateway without Docker socket");'
    });

    assert.equal(result.status, 'success');
    assert.equal(result.isolationType, 'isolated_sandbox_service');
    assert.ok(result.stdout.includes('Executed javascript cleanly'));
  });
});
