import test from 'node:test';
import assert from 'node:assert';
import { SandboxService } from '../../src/services/sandboxService.js';
import { ContainerSandboxRunner } from '../../src/services/sandbox/containerSandboxRunner.js';

test('Sandbox Security & Execution Suite', async (t) => {
  const runner = new ContainerSandboxRunner();
  const readiness = runner.checkReadiness();

  if (!readiness.ready) {
    t.skip(`Live container tests skipped: ${readiness.message}. Unsafe host execution is not substituted.`);
    return;
  }

  const sandbox = new SandboxService(15000, 1024); // 15s timeout for container startup under load, 1KB max buffer

  await t.test('Executes Python code and captures stdout', async () => {
    const res = await sandbox.execute({
      language: 'python',
      code: 'print("Sandboxed Python execution!")'
    });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes('Sandboxed Python execution!'));
  });

  await t.test('Executes JavaScript code and captures stdout', async () => {
    const res = await sandbox.execute({
      language: 'javascript',
      code: 'console.log("Sandboxed JS execution!");'
    });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes('Sandboxed JS execution!'));
  });

  await t.test('Kills runaway infinite loops and reports timeout status', async () => {
    const res = await sandbox.execute({
      language: 'python',
      code: 'while True: pass',
      timeoutMs: 1500
    });
    assert.strictEqual(res.status, 'timeout');
    assert.strictEqual(res.errorType, 'TIMEOUT');
    assert.ok(res.stderr.includes('timed out'));
  });

  await t.test('Distinguishes Python SyntaxError as compilation_error', async () => {
    const res = await sandbox.execute({
      language: 'python',
      code: 'def bad syntax():'
    });
    assert.strictEqual(res.status, 'compilation_error');
    assert.strictEqual(res.errorType, 'SYNTAX_ERROR');
  });

  await t.test('Distinguishes runtime exceptions', async () => {
    const res = await sandbox.execute({
      language: 'python',
      code: 'print(10 / 0)'
    });
    assert.strictEqual(res.status, 'runtime_error');
    assert.ok(res.stderr.includes('ZeroDivisionError'));
  });

  await t.test('Distinguishes assertion failures as test_failure', async () => {
    const res = await sandbox.execute({
      language: 'python',
      code: 'x = 1',
      testCode: 'assert x == 2, "Mismatch"'
    });
    assert.strictEqual(res.status, 'test_failure');
    assert.strictEqual(res.errorType, 'TEST_ASSERTION_FAILED');
  });

  await t.test('Truncates oversized output to prevent buffer exhaustion', async () => {
    const res = await sandbox.execute({
      language: 'python',
      code: 'print("A" * 5000)'
    });
    assert.ok(res.stdout.includes('[OUTPUT TRUNCATED: Exceeded size limit]'));
  });

  await t.test('Executes Java code inside container sandbox and captures stdout', async () => {
    const res = await sandbox.execute({
      language: 'java',
      code: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Sandboxed Java execution!");\n  }\n}'
    });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes('Sandboxed Java execution!'));
  });

  await t.test('Distinguishes Java SyntaxError as compilation_error', async () => {
    const res = await sandbox.execute({
      language: 'java',
      code: 'public class Main {\n  public static void main(String[] args) {\n    int x = 5\n  }\n}'
    });
    assert.strictEqual(res.status, 'compilation_error');
    assert.strictEqual(res.errorType, 'SYNTAX_ERROR');
  });

  await t.test('Distinguishes Java runtime exceptions', async () => {
    const res = await sandbox.execute({
      language: 'java',
      code: 'public class Main {\n  public static void main(String[] args) {\n    int a = 10 / 0;\n  }\n}'
    });
    assert.strictEqual(res.status, 'runtime_error');
    assert.ok(res.stderr.includes('ArithmeticException'));
  });

  await t.test('Distinguishes Java assertion failures as test_failure', async () => {
    const res = await sandbox.execute({
      language: 'java',
      code: 'public class Main {\n  public static void main(String[] args) {\n    int a = 1;\n    assert a == 2 : "Java assertion mismatch";\n  }\n}'
    });
    assert.strictEqual(res.status, 'test_failure');
    assert.strictEqual(res.errorType, 'TEST_ASSERTION_FAILED');
  });

  await t.test('Kills Java runaway infinite loops and reports timeout status', async () => {
    const res = await sandbox.execute({
      language: 'java',
      code: 'public class Main {\n  public static void main(String[] args) {\n    while (true) {}\n  }\n}',
      timeoutMs: 1500
    });
    assert.strictEqual(res.status, 'timeout');
    assert.strictEqual(res.errorType, 'TIMEOUT');
  });
});
