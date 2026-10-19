import test from 'node:test';
import assert from 'node:assert';
import { VerificationService } from '../../src/services/verificationService.js';
import { DiffService } from '../../src/services/diffService.js';
import { LanguageRegistry } from '../../src/services/languages/languageRegistry.js';

test('Workflow Polish & Terminal Status Mapping Suite', async (t) => {
  await t.test('1. Distinguishes execution_unavailable truthfully without fabricating execution', () => {
    const report = VerificationService.verify({
      language: 'java',
      repairedResult: {
        status: 'execution_unavailable',
        executionAvailable: false,
        durationMs: 1
      }
    });

    assert.strictEqual(report.verificationStatus, 'FIX PARTIALLY VERIFIED');
    assert.strictEqual(report.isVerified, false);
    assert.strictEqual(report.toolchainStatus, 'unavailable');
    assert.ok(report.summary.includes('Compiler toolchain'));
  });

  await t.test('2. Distinguishes timeout truthfully without fabricating success', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'timeout',
        durationMs: 5000,
        exitCode: 124
      }
    });

    assert.strictEqual(report.verificationStatus, 'FIX NOT VERIFIED');
    assert.strictEqual(report.isVerified, false);
    assert.ok(report.summary.includes('timed out'));
  });

  await t.test('3. Distinguishes compilation / syntax error truthfully', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'compilation_error',
        errorType: 'SYNTAX_ERROR',
        stderr: 'SyntaxError: invalid syntax'
      }
    });

    assert.strictEqual(report.verificationStatus, 'FIX NOT VERIFIED');
    assert.strictEqual(report.isVerified, false);
    assert.ok(report.summary.includes('failed compilation or syntax'));
  });

  await t.test('4. Distinguishes test assertion failure truthfully', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'test_failure',
        stderr: 'AssertionError: assert 4 == 5'
      }
    });

    assert.strictEqual(report.verificationStatus, 'FIX NOT VERIFIED');
    assert.strictEqual(report.isVerified, false);
    assert.ok(report.summary.includes('failed verification tests'));
  });

  await t.test('5. Awards FIX VERIFIED only when process exits 0 and passes all checks', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'success',
        success: true,
        exitCode: 0,
        stdout: 'ALL_TESTS_PASSED',
        durationMs: 42
      }
    });

    assert.strictEqual(report.verificationStatus, 'FIX VERIFIED');
    assert.strictEqual(report.isVerified, true);
    assert.strictEqual(report.checks.executionPassed, true);
  });

  await t.test('6. Structured diff preserves dual old and new line numbers for UI alignment', () => {
    const diffService = new DiffService();
    const original = 'def compute(a, b):\n    val = a - b\n    return val';
    const corrected = 'def compute(a, b):\n    val = a + b\n    return val';

    const diff = diffService.generateStructuredDiff(original, corrected);
    assert.strictEqual(diff.hasChanges, true);
    assert.strictEqual(diff.additions, 1);
    assert.strictEqual(diff.deletions, 1);

    const delLine = diff.lines.find(l => l.type === 'del');
    const addLine = diff.lines.find(l => l.type === 'add');
    const normalLine = diff.lines.find(l => l.type === 'normal');

    assert.strictEqual(delLine.oldLineNumber, 2);
    assert.strictEqual(delLine.newLineNumber, null);
    assert.strictEqual(addLine.oldLineNumber, null);
    assert.strictEqual(addLine.newLineNumber, 2);
    assert.ok(normalLine.oldLineNumber !== null && normalLine.newLineNumber !== null);
  });

  await t.test('7. LanguageRegistry categorizes all 16 languages cleanly', () => {
    const all = LanguageRegistry.getAll();
    assert.strictEqual(all.length, 16);

    const core = LanguageRegistry.getCoreAdapters();
    assert.strictEqual(core.length, 6);
    const coreIds = core.map(c => c.id);
    assert.deepStrictEqual(coreIds.sort(), ['c', 'cpp', 'java', 'javascript', 'python', 'typescript'].sort());
  });
});
