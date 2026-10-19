import test from 'node:test';
import assert from 'node:assert';
import { VerificationService } from '../../src/services/verificationService.js';
import { TestGenerator } from '../../src/services/languages/testGenerator.js';
import { getDatabase } from '../../src/db/database.js';
import { DebugSessionRepository } from '../../src/db/repositories/debugSessionRepository.js';

test('Verification & Testing Suite - 1. Expected-output mismatch causes VERIFICATION_FAILED', () => {
  const result = VerificationService.verify({
    language: 'python',
    repairedResult: {
      status: 'success',
      success: true,
      exitCode: 0,
      stdout: 'Calculating...\nSum: 14\n',
      durationMs: 40
    },
    expectedOutput: 'Sum: 15' // Mismatch!
  });

  assert.strictEqual(result.detailedStatus, 'VERIFICATION_FAILED');
  assert.strictEqual(result.verificationStatus, 'FIX NOT VERIFIED');
  assert.strictEqual(result.isVerified, false);
  assert.strictEqual(result.checks.expectedOutputMatched, false);
  assert.ok(result.summary.includes('stdout did not match expected output'));
});

test('Verification & Testing Suite - 2. Expected-output match awards TESTS_PASSED & FIX VERIFIED', () => {
  const result = VerificationService.verify({
    language: 'python',
    repairedResult: {
      status: 'success',
      success: true,
      exitCode: 0,
      stdout: 'Calculating...\nSum: 15\n',
      durationMs: 35
    },
    expectedOutput: 'Sum: 15'
  });

  assert.strictEqual(result.detailedStatus, 'TESTS_PASSED');
  assert.strictEqual(result.verificationStatus, 'FIX VERIFIED');
  assert.strictEqual(result.isVerified, true);
  assert.strictEqual(result.checks.expectedOutputMatched, true);
});

test('Verification & Testing Suite - 3. Non-zero exit code results in VERIFICATION_FAILED', () => {
  const result = VerificationService.verify({
    language: 'python',
    repairedResult: {
      status: 'runtime_error',
      success: false,
      exitCode: 1,
      stderr: 'IndexError: list index out of range',
      durationMs: 25
    }
  });

  assert.strictEqual(result.detailedStatus, 'VERIFICATION_FAILED');
  assert.strictEqual(result.verificationStatus, 'FIX NOT VERIFIED');
  assert.strictEqual(result.isVerified, false);
  assert.strictEqual(result.checks.executionPassed, false);
  assert.ok(result.statusReason.includes('exit code: 1'));
});

test('Verification & Testing Suite - 4. Process timeout results in TIMEOUT status', () => {
  const result = VerificationService.verify({
    language: 'python',
    repairedResult: {
      status: 'timeout',
      success: false,
      exitCode: -1,
      durationMs: 5000
    }
  });

  assert.strictEqual(result.detailedStatus, 'TIMEOUT');
  assert.strictEqual(result.verificationStatus, 'FIX NOT VERIFIED');
  assert.strictEqual(result.isVerified, false);
  assert.ok(result.summary.includes('timed out'));
});

test('Verification & Testing Suite - 5. Unavailable runtime results in EXECUTION_UNAVAILABLE & PARTIALLY_VERIFIED', () => {
  const suite = TestGenerator.generateSuite({
    language: 'java',
    code: 'public class Solution { public static void main(String[] args) {} }'
  });

  const result = VerificationService.verify({
    language: 'java',
    repairedResult: {
      status: 'execution_unavailable',
      executionAvailable: false,
      durationMs: 1
    },
    testSuite: suite.testCases
  });

  assert.strictEqual(result.detailedStatus, 'EXECUTION_UNAVAILABLE');
  assert.strictEqual(result.verificationStatus, 'FIX PARTIALLY VERIFIED');
  assert.strictEqual(result.isVerified, false);
  assert.strictEqual(result.toolchainStatus, 'unavailable');
  assert.ok(result.testResults.length > 0);
  assert.strictEqual(result.testResults[0].status, 'unavailable');
  assert.strictEqual(result.testResults[0].executed, false);
});

test('Verification & Testing Suite - 6. TestGenerator produces normal, boundary, edge_case, and invalid_input tests', () => {
  const suite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def binary_search(arr, target):\n    low = 0\n    high = len(arr) - 1\n    return -1',
    errorDescription: 'Binary search off by one defect'
  });

  assert.strictEqual(suite.hasCustomTests, false);
  assert.ok(suite.testCases.length >= 4);

  const categories = suite.testCases.map(tc => tc.category);
  assert.ok(categories.includes('normal'), 'Must include normal test case');
  assert.ok(categories.includes('boundary'), 'Must include boundary test case');
  assert.ok(categories.includes('edge_case'), 'Must include edge case');
  assert.ok(categories.includes('invalid_input'), 'Must include invalid input test');

  // Must distinguish generated from user-defined
  assert.ok(suite.testCases.every(tc => tc.isGenerated === true));
  assert.ok(suite.testCases.every(tc => tc.executed === false));
  assert.ok(suite.executableTestCode.includes('assert binary_search'));
});

test('Verification & Testing Suite - 7. TestGenerator handles user-defined tests without overwriting them', () => {
  const customTests = 'assert add(2, 3) == 5\nassert add(0, 0) == 0';
  const suite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def add(a, b): return a + b',
    customTestCases: customTests
  });

  assert.strictEqual(suite.hasCustomTests, true);
  assert.strictEqual(suite.testCases.length, 2);
  assert.strictEqual(suite.testCases[0].isGenerated, false);
  assert.strictEqual(suite.testCases[0].category, 'user_defined');
  assert.strictEqual(suite.executableTestCode, customTests);
});

test('Verification & Testing Suite - 8. TestGenerator handles malformed and empty inputs safely', () => {
  const emptySuite = TestGenerator.generateSuite({
    language: 'python',
    code: '',
    customTestCases: '   \n# comment line\n// comment\n   '
  });

  assert.ok(Array.isArray(emptySuite.testCases));
  // Does not crash, returns valid object
  const genString = TestGenerator.generate({ language: 'unknown', code: 'xyz' });
  assert.strictEqual(typeof genString, 'string');
});

test('Verification & Testing Suite - 9. Regression failure detected when repair breaks working baseline case', () => {
  const originalRun = {
    status: 'success',
    success: true,
    exitCode: 0,
    stdout: 'Baseline passed'
  };

  const repairedRun = {
    status: 'runtime_error',
    success: false,
    exitCode: 1,
    stderr: 'NullPointerException'
  };

  const result = VerificationService.verify({
    language: 'python',
    originalResult: originalRun,
    repairedResult: repairedRun
  });

  assert.strictEqual(result.regressionReport.regressionDetected, true);
  assert.ok(result.regressionReport.summary.toLowerCase().includes('regression detected'));
  assert.ok(result.regressionReport.confidenceNote.includes('Regressions outside the evaluated test suite'));
});

test('Verification & Testing Suite - 10. Honest reporting: Exit code 0 without assertions is EXECUTION_PASSED and PARTIALLY_VERIFIED', () => {
  // A program that prints 'Hello' without assertions or expected output
  const result = VerificationService.verify({
    language: 'python',
    repairedResult: {
      status: 'success',
      success: true,
      exitCode: 0,
      stdout: 'Hello World\n',
      durationMs: 30
    },
    expectedOutput: '', // No expected output provided
    testSuite: []       // No tests
  });

  // Must not claim full verification just because exit code was 0!
  assert.strictEqual(result.detailedStatus, 'EXECUTION_PASSED');
  assert.strictEqual(result.verificationStatus, 'FIX PARTIALLY VERIFIED');
  assert.strictEqual(result.isVerified, false);
  assert.ok(result.statusReason.includes('no functional assertions'));
});

test('Verification & Testing Suite - 11. Backward compatibility: repository stores and retrieves detailedStatus, testResults, and regressionReport', () => {
  const db = getDatabase(':memory:');
  const repo = new DebugSessionRepository(db);

  const sessionId = 'test-phase-4-verification';
  const testResults = [
    {
      id: 'test_1',
      name: 'Normal Search',
      category: 'normal',
      description: 'Search test',
      isGenerated: true,
      executed: true,
      passed: true,
      status: 'passed'
    }
  ];

  const regressionReport = {
    regressionDetected: false,
    passed: 1,
    failed: 0,
    skipped: 0,
    unavailable: 0,
    summary: '0 regressions detected',
    confidenceNote: 'Note: Regressions outside evaluated suite remain theoretically possible.'
  };

  repo.create({
    id: sessionId,
    language: 'python',
    sourceCode: 'def test(): pass',
    errorDescription: 'test bug',
    diagnosis: 'syntax fix',
    rootCause: 'logic defect',
    correctedCode: 'def test(): pass',
    diff: '',
    confidence: 'high',
    verificationStatus: 'FIX VERIFIED',
    detailedStatus: 'TESTS_PASSED',
    testResults,
    regressionReport,
    verified: true
  });

  const row = repo.findById(sessionId);
  assert.ok(row);
  assert.strictEqual(row.verificationStatus, 'FIX VERIFIED');
  assert.strictEqual(row.detailedStatus, 'TESTS_PASSED');
  assert.strictEqual(row.testResults.length, 1);
  assert.strictEqual(row.testResults[0].passed, true);
  assert.strictEqual(row.regressionReport.regressionDetected, false);
});
