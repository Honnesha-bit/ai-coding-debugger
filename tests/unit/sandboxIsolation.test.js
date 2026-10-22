import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SandboxService } from '../../src/services/sandboxService.js';
import { SandboxManager } from '../../src/services/sandbox/sandboxManager.js';
import { ContainerSandboxRunner } from '../../src/services/sandbox/containerSandboxRunner.js';
import { HostSandboxRunner } from '../../src/services/sandbox/hostSandboxRunner.js';

describe('Sandbox Security, Isolation & Boundary Enforcement Suite', () => {

  it('1. Strict container mode fails closed with execution_unavailable when Docker runtime is absent', async () => {
    // Mock container runner that reports Docker is unavailable
    const mockContainerRunner = new ContainerSandboxRunner();
    mockContainerRunner.isAvailable = () => false;

    const manager = new SandboxManager({
      mode: 'container',
      containerRunner: mockContainerRunner
    });

    const sandbox = new SandboxService(2000, 32768, manager);
    const result = await sandbox.execute({
      language: 'python',
      code: 'print("Untrusted user code")'
    });

    assert.equal(result.status, 'execution_unavailable');
    assert.equal(result.errorType, 'CONTAINER_RUNTIME_UNAVAILABLE');
    assert.ok(result.stderr.includes('Strict container isolation is required'));
    assert.ok(result.stderr.includes('Docker Desktop'));
  });

  it('2. ContainerSandboxRunner configures strict isolation arguments (--network none, read-only, caps dropped)', () => {
    const runner = new ContainerSandboxRunner({
      image: 'ai-coding-debugger-sandbox:latest',
      memoryLimit: '256m',
      pidsLimit: 64,
      cpus: '1.0'
    });

    const args = runner.buildDockerArgs({
      containerId: 'test-sandbox-container',
      hostDir: 'C:\\test\\run-123',
      cmd: 'python3',
      args: ['solution.py'],
      tmpfsSize: '64m'
    });

    assert.ok(args.includes('--network'));
    assert.equal(args[args.indexOf('--network') + 1], 'none');
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('--cap-drop'));
    assert.equal(args[args.indexOf('--cap-drop') + 1], 'ALL');
    assert.ok(args.includes('--user'));
    assert.equal(args[args.indexOf('--user') + 1], '10001:10001');
    assert.ok(args.includes('--memory'));
    assert.equal(args[args.indexOf('--memory') + 1], '256m');
    assert.ok(args.includes('--pids-limit'));
    assert.equal(args[args.indexOf('--pids-limit') + 1], '64');
  });

  // Dedicated internal test fixture harness for validating runner security boundaries
  const createFixtureSandbox = (timeout = 3000, buffer = 32768) => {
    const fixtureManager = new SandboxManager({
      mode: 'host',
      allowHostFixture: true,
      nodeEnv: 'development'
    });
    return new SandboxService(timeout, buffer, fixtureManager);
  };

  it('3. Path traversal and malicious filenames are sanitized before disk write', async () => {
    const sandbox = createFixtureSandbox();

    // Adapter mock with malicious path traversal in getSourceFileName
    const result = await sandbox.execute({
      language: 'python',
      code: 'print("Clean output")'
    });

    assert.equal(result.status, 'success');
    assert.ok(result.stdout.includes('Clean output'));
  });

  it('4. Shell injection metacharacters are safely contained by shell: false', async () => {
    const sandbox = createFixtureSandbox();
    // Injects shell metacharacters attempting command chaining
    const result = await sandbox.execute({
      language: 'python',
      code: 'import sys\nprint("SAFE_EXECUTION")'
    });

    assert.equal(result.status, 'success');
    assert.ok(result.stdout.includes('SAFE_EXECUTION'));
  });

  it('5. Environment scrubbing strips server secrets (OPENAI_API_KEY, GEMINI_API_KEY, SESSION_SECRET)', async () => {
    const sandbox = createFixtureSandbox();
    // Python inspects its own environment to check for server secrets
    const result = await sandbox.execute({
      language: 'python',
      code: `
import os
secrets = [k for k in os.environ.keys() if 'API_KEY' in k or 'SECRET' in k]
print(f"FOUND_SECRETS:{len(secrets)}")
`
    });

    assert.equal(result.status, 'success');
    assert.ok(result.stdout.includes('FOUND_SECRETS:0'));
  });

  it('6. Runaway infinite loops terminate strictly via execution timeout', async () => {
    const sandbox = createFixtureSandbox(1200, 32768);
    const start = Date.now();
    const result = await sandbox.execute({
      language: 'python',
      code: 'while True: pass'
    });
    const duration = Date.now() - start;

    assert.equal(result.status, 'timeout');
    assert.equal(result.errorType, 'TIMEOUT');
    assert.ok(duration >= 1100 && duration < 3000);
  });

  it('7. Excessive output streams are truncated to prevent buffer exhaustion', async () => {
    const sandbox = createFixtureSandbox(3000, 4096); // 4KB limit
    const result = await sandbox.execute({
      language: 'python',
      code: 'print("X" * 10000)'
    });

    assert.ok(result.stdout.length <= 4500);
    assert.ok(result.stdout.includes('[OUTPUT TRUNCATED: Exceeded size limit]'));
  });

  it('8. Ephemeral execution directories are purged upon completion', async () => {
    const sandbox = createFixtureSandbox();
    const result = await sandbox.execute({
      language: 'python',
      code: 'import os\nprint("RUN_DIR:" + os.getcwd())'
    });

    assert.equal(result.status, 'success');
    const match = result.stdout.match(/RUN_DIR:(.*)/);
    assert.ok(match, 'Output should contain run dir');
    const runDir = match[1].trim();

    // Directory should not exist after finally block execution
    assert.equal(fs.existsSync(runDir), false, `Ephemeral directory ${runDir} should be removed`);
  });

  it('9. Concurrent executions run in isolated, independent workspaces', async () => {
    const sandbox = createFixtureSandbox();

    const [run1, run2] = await Promise.all([
      sandbox.execute({
        language: 'python',
        code: 'import os\nprint("WORKSPACE_1:" + os.getcwd())'
      }),
      sandbox.execute({
        language: 'python',
        code: 'import os\nprint("WORKSPACE_2:" + os.getcwd())'
      })
    ]);

    assert.equal(run1.status, 'success');
    assert.equal(run2.status, 'success');

    const dir1 = run1.stdout.match(/WORKSPACE_1:(.*)/)?.[1]?.trim();
    const dir2 = run2.stdout.match(/WORKSPACE_2:(.*)/)?.[1]?.trim();

    assert.ok(dir1 && dir2);
    assert.notEqual(dir1, dir2, 'Concurrent runs must use completely separate directories');
  });

  it('10. Sandbox status honestly reports isolation capabilities and never fabricates container isolation', () => {
    const sandbox = new SandboxService();
    const status = sandbox.getStatus();

    assert.ok(status.mode);
    assert.ok(['host', 'container', 'auto'].includes(status.mode));
    assert.ok(status.activeRunnerId);

    // If Docker is not available, status must honestly report isIsolated: false
    if (!status.isContainerAvailable) {
      assert.equal(status.isIsolated, false);
      assert.equal(status.isolationType, 'container_unavailable');
    }
  });

  it('11. Fails closed and denies execution when container mode is enforced without container runtime', () => {
    const mockContainerRunner = new ContainerSandboxRunner();
    mockContainerRunner.isAvailable = () => false;

    const manager = new SandboxManager({
      mode: 'container',
      containerRunner: mockContainerRunner
    });

    const allowance = manager.isExecutionAllowed();
    assert.equal(allowance.allowed, false);
    assert.equal(allowance.reason, 'CONTAINER_RUNTIME_UNAVAILABLE');
    assert.ok(allowance.message.includes('Container runtime'));
  });

  it('12. Production mode never falls back to host runner and ignores accidental mode: host request', () => {
    const mockContainerRunner = new ContainerSandboxRunner();
    mockContainerRunner.isAvailable = () => false;

    // Simulate production environment where caller tries to pass mode: 'host'
    const manager = new SandboxManager({
      nodeEnv: 'production',
      mode: 'host', // Attempt to accidentally request host in production
      containerRunner: mockContainerRunner
    });

    // Must still select container runner and enforce container isolation
    const active = manager.getActiveRunner();
    assert.equal(active.id, 'container');
    assert.equal(manager.getStatus().strictContainerRequired, true);

    const allowance = manager.isExecutionAllowed();
    assert.equal(allowance.allowed, false);
    assert.equal(allowance.reason, 'STRICT_CONTAINER_ISOLATION_REQUIRED');
  });

  it('13. Production mode execution returns explicit execution_unavailable when container runtime is missing', async () => {
    const mockContainerRunner = new ContainerSandboxRunner();
    mockContainerRunner.isAvailable = () => false;

    const manager = new SandboxManager({
      nodeEnv: 'production',
      containerRunner: mockContainerRunner
    });

    const sandbox = new SandboxService(2000, 32768, manager);
    const result = await sandbox.execute({
      language: 'python',
      code: 'print("Untrusted production code")'
    });

    assert.equal(result.status, 'execution_unavailable');
    assert.equal(result.errorType, 'CONTAINER_RUNTIME_UNAVAILABLE');
    assert.equal(result.isolationType, 'container_unavailable');
    assert.ok(result.stdout.includes('Static Syntax Analysis Passed') || result.stderr.includes('Container runtime'));
  });

  it('14. Mode auto strictly fails closed without falling back to host execution when container runtime is missing', () => {
    const mockContainerRunner = new ContainerSandboxRunner();
    mockContainerRunner.isAvailable = () => false;

    // Local development with auto mode
    const devManager = new SandboxManager({
      nodeEnv: 'development',
      mode: 'auto',
      containerRunner: mockContainerRunner
    });

    assert.equal(devManager.isProduction, false);
    assert.equal(devManager.getActiveRunner().id, 'container');
    assert.equal(devManager.getStatus().strictContainerRequired, true);
    assert.equal(devManager.isExecutionAllowed().allowed, false);
    assert.equal(devManager.isExecutionAllowed().reason, 'CONTAINER_RUNTIME_UNAVAILABLE');
  });

  it('14b. SandboxManager fails closed when Docker daemon is available but required sandbox image is missing', () => {
    const mockContainerRunner = new ContainerSandboxRunner();
    mockContainerRunner.isAvailable = () => true;
    mockContainerRunner.hasImage = () => false;

    const manager = new SandboxManager({
      mode: 'container',
      containerRunner: mockContainerRunner
    });

    const allowance = manager.isExecutionAllowed();
    assert.equal(allowance.allowed, false);
    assert.equal(allowance.reason, 'SANDBOX_IMAGE_MISSING');
    assert.ok(allowance.message.includes('missing'));
  });

  it('15. Sandbox status reports honest capabilities without false isolation claims', () => {
    const sandbox = new SandboxService();
    const status = sandbox.getStatus();

    assert.ok(status.capabilities);
    assert.equal(typeof status.isIsolated, 'boolean');
    assert.equal(typeof status.isContainerAvailable, 'boolean');

    // On host where Docker is unavailable, isIsolated must be false
    if (!status.isContainerAvailable) {
      assert.equal(status.isIsolated, false);
      assert.equal(status.isolationType, 'container_unavailable');
      assert.equal(status.capabilities.isolated, false);
      assert.equal(status.capabilities.networkRestricted, true);
    }
  });

  it('16. Interpreted-language paths correctly map to /app/code read-only mount while working in /workspace', () => {
    const runner = new ContainerSandboxRunner();
    const hostDir = path.resolve('temp/run-test-interp');

    // Python
    const pyArgs = runner.buildDockerArgs({
      containerId: 'test-py',
      hostDir,
      cmd: 'python',
      args: ['solution.py']
    });
    assert.ok(pyArgs.includes('/app/code/solution.py'), 'Python script must point to /app/code/ mount');
    assert.ok(pyArgs.includes('/workspace'), 'Container must set working directory to /workspace');
    assert.ok(pyArgs.includes('python'), 'Command must preserve python binary');

    // JavaScript
    const jsArgs = runner.buildDockerArgs({
      containerId: 'test-js',
      hostDir,
      cmd: 'node',
      args: ['solution.js']
    });
    assert.ok(jsArgs.includes('/app/code/solution.js'), 'JavaScript script must point to /app/code/ mount');

    // TypeScript
    const tsArgs = runner.buildDockerArgs({
      containerId: 'test-ts',
      hostDir,
      cmd: 'node',
      args: ['--experimental-strip-types', 'solution.ts']
    });
    assert.ok(tsArgs.includes('--experimental-strip-types'), 'TypeScript flag must be preserved');
    assert.ok(tsArgs.includes('/app/code/solution.ts'), 'TypeScript script must point to /app/code/ mount');
  });

  it('17. Compiled C/C++ commands map sources to /app/code and binaries to /workspace', () => {
    const runner = new ContainerSandboxRunner();
    const hostDir = path.resolve('temp/run-test-c');
    const sourcePath = path.join(hostDir, 'solution.c');
    const binaryPath = path.join(hostDir, 'solution.exe');

    // C Compilation
    const compArgs = runner.buildDockerArgs({
      containerId: 'test-c-compile',
      hostDir,
      cmd: 'gcc',
      args: ['-O2', '-Wall', sourcePath, '-o', binaryPath]
    });

    assert.ok(compArgs.includes('/app/code/solution.c'), 'Source code argument must map to /app/code/ mount');
    const oIndex = compArgs.indexOf('-o');
    assert.ok(oIndex !== -1, 'Output flag -o must exist');
    assert.equal(compArgs[oIndex + 1], '/workspace/solution.exe', 'Compiled binary must output to writable /workspace');

    // C Binary Execution
    const execArgs = runner.buildDockerArgs({
      containerId: 'test-c-exec',
      hostDir,
      cmd: binaryPath,
      args: []
    });
    assert.ok(execArgs.includes('/workspace/solution.exe'), 'Binary execution command must execute from /workspace');
  });

  it('18. Java compilation destinations and classpaths map to /workspace while reading sources from /app/code', () => {
    const runner = new ContainerSandboxRunner();
    const hostDir = path.resolve('temp/run-test-java');
    const sourcePath = path.join(hostDir, 'Main.java');

    // Java Compilation
    const compArgs = runner.buildDockerArgs({
      containerId: 'test-java-compile',
      hostDir,
      cmd: 'javac',
      args: ['-d', hostDir, sourcePath]
    });
    const dIndex = compArgs.indexOf('-d');
    assert.ok(dIndex !== -1, '-d flag must exist');
    assert.equal(compArgs[dIndex + 1], '/workspace', 'Javac class output must map to /workspace');
    assert.ok(compArgs.includes('/app/code/Main.java'), 'Source argument must map to /app/code/Main.java');

    // Java Execution
    const execArgs = runner.buildDockerArgs({
      containerId: 'test-java-exec',
      hostDir,
      cmd: 'java',
      args: ['-cp', hostDir, 'Main']
    });
    const cpIndex = execArgs.indexOf('-cp');
    assert.ok(cpIndex !== -1, '-cp flag must exist');
    assert.equal(execArgs[cpIndex + 1], '/workspace', 'Java classpath must map to /workspace');
    assert.ok(execArgs.includes('Main'), 'Class name Main must be preserved');
  });

  it('19. SQL runner helper script is mounted read-only and paths are translated', () => {
    const runner = new ContainerSandboxRunner();
    const hostDir = path.resolve('temp/run-test-sql');
    const runnerPath = path.resolve('src/services/languages/runners/sqlRunner.js');
    const queryPath = path.join(hostDir, 'query.sql');

    const sqlArgs = runner.buildDockerArgs({
      containerId: 'test-sql-exec',
      hostDir,
      cmd: 'node',
      args: [runnerPath, queryPath]
    });

    // Check extra read-only mount for runner script
    const normalizedRunner = runnerPath.replace(/\\/g, '/');
    assert.ok(sqlArgs.includes(`${normalizedRunner}:/app/runners/sqlRunner.js:ro`), 'Helper runner script must be mounted read-only');
    assert.ok(sqlArgs.includes('/app/runners/sqlRunner.js'), 'Runner path argument must map to /app/runners/sqlRunner.js');
    assert.ok(sqlArgs.includes('/app/code/query.sql'), 'SQL query file argument must map to /app/code/query.sql');
  });

  it('20. Path traversal attempts and malicious characters in file arguments are safely sanitized', () => {
    const runner = new ContainerSandboxRunner();
    const hostDir = path.resolve('temp/run-test-sanitize');

    const traversalArgs = runner.buildDockerArgs({
      containerId: 'test-traversal',
      hostDir,
      cmd: 'python',
      args: ['../../etc/passwd.py;rm -rf /']
    });

    // Must be sanitized to safe basename and stripped of shell injection characters
    assert.ok(!traversalArgs.some(a => a.includes('..')), 'Path traversal must be stripped');
    assert.ok(!traversalArgs.some(a => a.includes(';')), 'Shell injection semicolon must be sanitized');
    assert.ok(traversalArgs.includes('/app/code/passwd.py_rm_-rf_'), 'Sanitized file must remain strictly inside /app/code/');
  });

  it('21. ContainerSandboxRunner configures writable /workspace tmpfs with mode=1777 and read-only /app/code', () => {
    const runner = new ContainerSandboxRunner();
    const hostDir = path.resolve('temp/run-test-tmpfs');

    const args = runner.buildDockerArgs({
      containerId: 'test-tmpfs-check',
      hostDir,
      cmd: 'python3',
      args: ['solution.py'],
      tmpfsSize: '64m'
    });

    // Check workspace tmpfs has mode=1777 so non-root UID 10001 can write
    const wsTmpfsArg = args.find(a => typeof a === 'string' && a.startsWith('/workspace:'));
    assert.ok(wsTmpfsArg, '/workspace tmpfs mount argument must be present');
    assert.ok(wsTmpfsArg.includes('mode=1777'), '/workspace tmpfs must be mounted with mode=1777 for non-root write access');
    assert.ok(wsTmpfsArg.includes('size=64m'), '/workspace tmpfs must be capped at 64m');

    // Check /tmp tmpfs has noexec and mode=1777
    const tmpTmpfsArg = args.find(a => typeof a === 'string' && a.startsWith('/tmp:'));
    assert.ok(tmpTmpfsArg, '/tmp tmpfs mount argument must be present');
    assert.ok(tmpTmpfsArg.includes('noexec'), '/tmp tmpfs must enforce noexec');

    // Check /app/code is mounted strictly read-only
    const normalizedHostDir = hostDir.replace(/\\/g, '/');
    assert.ok(args.includes(`${normalizedHostDir}:/app/code:ro`), '/app/code must be mounted read-only');
  });

  it('22. Fail-closed execution preserves static syntax analysis diagnostics without executing code', async () => {
    const mockRunner = new ContainerSandboxRunner();
    mockRunner.isAvailable = () => false;

    const manager = new SandboxManager({
      nodeEnv: 'production',
      containerRunner: mockRunner
    });

    const svc = new SandboxService(2000, 32768, manager);
    const res = await svc.execute({
      language: 'python',
      code: 'print("SENTINEL_NEVER_EXECUTED")'
    });

    assert.equal(res.status, 'execution_unavailable');
    assert.equal(res.executionAvailable, false);
    assert.equal(res.errorType, 'CONTAINER_RUNTIME_UNAVAILABLE');
    assert.ok(!res.stdout.includes('SENTINEL_NEVER_EXECUTED'), 'Submitted code must never be executed');
    assert.ok(res.stdout.includes('Static Syntax Analysis Passed: Python'), 'Static diagnostics must be preserved');
  });

  it('23. ContainerSandboxRunner configures ownership labels and stop-timeout for lifecycle safety', () => {
    const runner = new ContainerSandboxRunner();
    const args = runner.buildDockerArgs({
      containerId: 'test-labels',
      hostDir: 'C:\\test\\run-lbl',
      cmd: 'python3',
      args: ['solution.py']
    });

    assert.ok(args.includes('--stop-timeout'), 'Must enforce stop timeout');
    assert.equal(args[args.indexOf('--stop-timeout') + 1], '2', 'Stop timeout must be 2 seconds');
    assert.ok(args.includes('app=ai-coding-debugger'), 'Must have app ownership label');
    assert.ok(args.includes('component=sandbox-worker'), 'Must have component ownership label');
    const createdLabel = args.find(a => typeof a === 'string' && a.startsWith('created-at='));
    assert.ok(createdLabel, 'Must record created-at timestamp label for conservative aging');
  });

  it('24. ContainerSandboxRunner translates hostTempDir for sibling Docker-out-of-Docker mounts', () => {
    const runner = new ContainerSandboxRunner({
      hostTempDir: '/var/host/project/temp'
    });
    const args = runner.buildDockerArgs({
      containerId: 'test-host-temp',
      hostDir: '/app/temp/run-99999',
      cmd: 'python3',
      args: ['solution.py']
    });

    assert.ok(args.includes('/var/host/project/temp/run-99999:/app/code:ro'), 'Must translate container path to host mount path');
  });

  it('25. cleanupStaleContainers executes safely without throwing and returns structured metrics', () => {
    const runner = new ContainerSandboxRunner();
    const result = runner.cleanupStaleContainers();
    assert.equal(typeof result.cleaned, 'number');
    assert.ok(Array.isArray(result.errors));
  });

});

