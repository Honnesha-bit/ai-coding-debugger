import test from 'node:test';
import assert from 'node:assert';
import { VerificationService } from '../../src/services/verificationService.js';
import { TestGenerator } from '../../src/services/languages/testGenerator.js';
import { StaticAnalyzer } from '../../src/services/languages/staticAnalyzer.js';
import { SandboxManager } from '../../src/services/sandbox/sandboxManager.js';
import { ExportService } from '../../src/services/exportService.js';

test('Safe Verification Suite - 1. VerificationService produces all 8 canonical categories', async (t) => {
  // Category 1: STATIC_CHECK_PASSED (static-only language)
  await t.test('Category: STATIC_CHECK_PASSED', () => {
    const report = VerificationService.verify({
      language: 'css',
      repairedResult: {
        isStaticValidation: true,
        success: true,
        exitCode: 0,
        stdout: 'Valid CSS'
      }
    });
    assert.strictEqual(report.category, 'STATIC_CHECK_PASSED');
    assert.strictEqual(report.resultCategory, 'STATIC_CHECK_PASSED');
    assert.strictEqual(report.detailedStatus, 'STATIC_CHECK_PASSED');
    assert.strictEqual(report.isVerified, true);
  });

  // Category 2: STATIC_CHECK_FAILED (syntax / bracket mismatch)
  await t.test('Category: STATIC_CHECK_FAILED', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'execution_unavailable',
        executionAvailable: false
      },
      correctedCode: 'def broken_fn(x:\n    return x + (1 * 2' // Unbalanced parenthesis
    });
    assert.strictEqual(report.category, 'STATIC_CHECK_FAILED');
    assert.strictEqual(report.resultCategory, 'STATIC_CHECK_FAILED');
    assert.strictEqual(report.isVerified, false);
    assert.strictEqual(report.staticChecks.passed, false);
    assert.ok(report.staticChecks.errors.length > 0);
  });

  // Category 3: TESTS_GENERATED_NOT_RUN (tests generated, sandbox unavailable)
  await t.test('Category: TESTS_GENERATED_NOT_RUN', () => {
    const suite = TestGenerator.generateSuite({
      language: 'python',
      code: 'def add(a, b):\n    return a + b'
    });
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'execution_unavailable',
        executionAvailable: false
      },
      testSuite: suite.testCases,
      correctedCode: 'def add(a, b):\n    return a + b'
    });
    assert.strictEqual(report.category, 'TESTS_GENERATED_NOT_RUN');
    assert.strictEqual(report.resultCategory, 'TESTS_GENERATED_NOT_RUN');
    assert.strictEqual(report.detailedStatus, 'EXECUTION_UNAVAILABLE');
    assert.strictEqual(report.isVerified, false);
    assert.ok(report.testResults.length > 0);
    assert.ok(report.testResults.every(t => t.executed === false));
    assert.ok(report.downloadableTestFile !== null);
  });

  // Category 4: EXECUTION_UNAVAILABLE (no tests, sandbox unavailable)
  await t.test('Category: EXECUTION_UNAVAILABLE', () => {
    const report = VerificationService.verify({
      language: 'java',
      repairedResult: {
        status: 'execution_unavailable',
        executionAvailable: false
      },
      testSuite: [],
      correctedCode: 'public class Solution { public static void main(String[] args) {} }'
    });
    assert.strictEqual(report.category, 'EXECUTION_UNAVAILABLE');
    assert.strictEqual(report.resultCategory, 'EXECUTION_UNAVAILABLE');
    assert.strictEqual(report.detailedStatus, 'EXECUTION_UNAVAILABLE');
    assert.strictEqual(report.isVerified, false);
  });

  // Category 5: EXECUTION_PASSED_NO_ASSERTIONS (ran exit 0, no assertions)
  await t.test('Category: EXECUTION_PASSED_NO_ASSERTIONS', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'success',
        exitCode: 0,
        stdout: 'Hello World',
        success: true
      },
      testSuite: []
    });
    assert.strictEqual(report.category, 'EXECUTION_PASSED_NO_ASSERTIONS');
    assert.strictEqual(report.resultCategory, 'EXECUTION_PASSED_NO_ASSERTIONS');
    assert.strictEqual(report.detailedStatus, 'EXECUTION_PASSED');
    assert.strictEqual(report.isVerified, false); // Honest: no assertions evaluated
  });

  // Category 6: TESTS_PASSED_VERIFIED (ran in container, assertions passed)
  await t.test('Category: TESTS_PASSED_VERIFIED', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'success',
        exitCode: 0,
        stdout: '[ALL_VERIFICATION_TESTS_PASSED]',
        success: true
      },
      testSuite: [
        { id: 't1', name: 'add(1, 2) == 3', assertionCode: 'assert add(1, 2) == 3', isGenerated: true }
      ]
    });
    assert.strictEqual(report.category, 'TESTS_PASSED_VERIFIED');
    assert.strictEqual(report.resultCategory, 'TESTS_PASSED_VERIFIED');
    assert.strictEqual(report.detailedStatus, 'TESTS_PASSED');
    assert.strictEqual(report.isVerified, true);
  });

  // Category 7: TESTS_FAILED_VERIFIED (ran in container, assertion failed)
  await t.test('Category: TESTS_FAILED_VERIFIED', () => {
    const report = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'test_failure',
        exitCode: 1,
        stderr: 'AssertionError: assert 4 == 5',
        success: false
      },
      testSuite: [
        { id: 't1', name: 'test_fail', assertionCode: 'assert 4 == 5', isGenerated: true }
      ]
    });
    assert.strictEqual(report.category, 'TESTS_FAILED_VERIFIED');
    assert.strictEqual(report.resultCategory, 'TESTS_FAILED_VERIFIED');
    assert.strictEqual(report.detailedStatus, 'VERIFICATION_FAILED');
    assert.strictEqual(report.isVerified, false);
  });

  // Category 8: VERIFICATION_ERROR (infrastructure error or timeout)
  await t.test('Category: VERIFICATION_ERROR', () => {
    const reportNull = VerificationService.verify({
      language: 'python',
      repairedResult: null
    });
    assert.strictEqual(reportNull.category, 'VERIFICATION_ERROR');
    assert.strictEqual(reportNull.resultCategory, 'VERIFICATION_ERROR');
    assert.strictEqual(reportNull.detailedStatus, 'INFRASTRUCTURE_ERROR');

    const reportTimeout = VerificationService.verify({
      language: 'python',
      repairedResult: {
        status: 'timeout',
        durationMs: 5000,
        exitCode: -1
      }
    });
    assert.strictEqual(reportTimeout.category, 'VERIFICATION_ERROR');
    assert.strictEqual(reportTimeout.detailedStatus, 'TIMEOUT');
  });
});

test('Safe Verification Suite - 2. Static check analysis and explicit disclaimer presence', () => {
  const validReport = VerificationService.verify({
    language: 'javascript',
    repairedResult: { status: 'execution_unavailable', executionAvailable: false },
    correctedCode: 'function sum(a, b) { return a + b; }'
  });

  assert.ok(validReport.staticChecks, 'Must include staticChecks object');
  assert.strictEqual(validReport.staticChecks.passed, true);
  assert.ok(validReport.staticChecks.disclaimer.includes('Static checks verify basic lexical delimiters'));
  assert.ok(validReport.staticChecks.disclaimer.includes('They do NOT replace a real compiler'));

  const brokenReport = VerificationService.verify({
    language: 'javascript',
    repairedResult: { status: 'execution_unavailable', executionAvailable: false },
    correctedCode: 'function broken() { if (true) { console.log("Missing brace"); }' // Missing outer closing brace
  });

  assert.strictEqual(brokenReport.staticChecks.passed, false);
  assert.strictEqual(brokenReport.category, 'STATIC_CHECK_FAILED');
  assert.ok(brokenReport.staticChecks.errors.length > 0);
});

test('Safe Verification Suite - 3. TestGenerator formatDownloadableTestSuite produces valid files', () => {
  const pySuite = TestGenerator.formatDownloadableTestSuite({
    language: 'python',
    testCases: [{ name: 'test_positive', assertionCode: 'assert solve(1) == 2' }],
    correctedCode: 'def solve(x): return x + 1',
    expectedOutput: '2'
  });

  assert.strictEqual(pySuite.filename, 'test_suite.py');
  assert.ok(pySuite.content.includes('def solve(x): return x + 1'));
  assert.ok(pySuite.content.includes('assert solve(1) == 2'));
  assert.strictEqual(pySuite.testCount, 1);

  const jsSuite = TestGenerator.formatDownloadableTestSuite({
    language: 'javascript',
    testCases: [{ name: 'test_add', assertionCode: 'console.assert(add(1, 2) === 3)' }],
    correctedCode: 'function add(a, b) { return a + b; }'
  });

  assert.strictEqual(jsSuite.filename, 'test_suite.js');
  assert.ok(jsSuite.content.includes('console.assert(add(1, 2) === 3)'));

  const sqlSuite = TestGenerator.formatDownloadableTestSuite({
    language: 'sql',
    testCases: [{ name: 'test_query', assertionCode: 'SELECT 1;' }],
    correctedCode: 'SELECT * FROM users;'
  });

  assert.strictEqual(sqlSuite.filename, 'test_suite.sql');
  assert.ok(sqlSuite.content.includes('SELECT * FROM users;'));
});

test('Safe Verification Suite - 4. SandboxManager enforces safe_verification isolation boundary', () => {
  const manager = new SandboxManager({ mode: 'safe_verification' });
  const status = manager.getStatus();

  assert.strictEqual(status.mode, 'safe_verification');
  assert.strictEqual(status.strictContainerRequired, true);

  const permission = manager.isExecutionAllowed('python');
  assert.strictEqual(permission.allowed, false);
  assert.strictEqual(permission.reason, 'EXECUTION_UNAVAILABLE');
  assert.ok(permission.message.toLowerCase().includes('safe verification mode'));

  // Never returns host runner in safe_verification mode when container is unavailable
  const activeRunner = manager.getActiveRunner('python');
  assert.strictEqual(activeRunner, manager.containerRunner);
  assert.notStrictEqual(activeRunner, manager.hostRunner);
});

test('Safe Verification Suite - 5. ExportService includes verificationCategory in CSV and JSON', () => {
  const evalRun = {
    id: 'eval_safe_test',
    timestamp: '2026-10-19T14:00:00Z',
    totalCases: 2,
    fixSuccessRate: 0.5,
    compilationSuccessRate: 1.0,
    staticCheckSuccessRate: 1.0,
    executionAvailableRate: 0.5,
    regressionRate: 0.0,
    explanationAccuracy: 0.85,
    sandboxFailureRate: 0.0,
    medianLatencyMs: 200,
    latencyObservations: 2,
    failureCounts: { executionUnavailable: 1 },
    rawResults: [
      {
        id: 'case_1',
        title: 'Python Binary Search',
        language: 'python',
        category: 'algorithms',
        correctedStatus: 'success',
        verificationCategory: 'TESTS_PASSED_VERIFIED',
        staticCheckPassed: true,
        executionAvailable: true,
        fixSuccess: true,
        compilationSuccess: true,
        regression: false,
        explanationScore: 1.0,
        latencyMs: 150
      },
      {
        id: 'case_2',
        title: 'C++ Off By One',
        language: 'cpp',
        category: 'bounds',
        correctedStatus: 'execution_unavailable',
        verificationCategory: 'TESTS_GENERATED_NOT_RUN',
        staticCheckPassed: true,
        executionAvailable: false,
        fixSuccess: false,
        compilationSuccess: true,
        regression: false,
        explanationScore: 0.7,
        latencyMs: 250
      }
    ]
  };

  const csv = ExportService.toCsv(evalRun);
  assert.ok(csv.includes('verificationCategory'));
  assert.ok(csv.includes('staticCheckPassed'));
  assert.ok(csv.includes('executionAvailable'));
  assert.ok(csv.includes('TESTS_PASSED_VERIFIED'));
  assert.ok(csv.includes('TESTS_GENERATED_NOT_RUN'));

  const jsonStr = ExportService.toJson(evalRun);
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.summaryMetrics.staticCheckSuccessRate, 1.0);
  assert.strictEqual(parsed.summaryMetrics.executionAvailableRate, 0.5);
  assert.strictEqual(parsed.results[0].verificationCategory, 'TESTS_PASSED_VERIFIED');
  assert.strictEqual(parsed.results[1].verificationCategory, 'TESTS_GENERATED_NOT_RUN');
  assert.strictEqual(parsed.results[1].executionAvailable, false);
});
