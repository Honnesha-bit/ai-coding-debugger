import test from 'node:test';
import assert from 'node:assert';
import { VerificationService } from '../../src/services/verificationService.js';
import { TestGenerator } from '../../src/services/languages/testGenerator.js';
import { getDatabase } from '../../src/db/database.js';
import { DebugSessionRepository } from '../../src/db/repositories/debugSessionRepository.js';
import { PythonAdapter } from '../../src/services/languages/adapters/PythonAdapter.js';
import { JavaScriptAdapter } from '../../src/services/languages/adapters/JavaScriptAdapter.js';
import { TypeScriptAdapter } from '../../src/services/languages/adapters/TypeScriptAdapter.js';
import { JavaAdapter } from '../../src/services/languages/adapters/JavaAdapter.js';
import { CAdapter } from '../../src/services/languages/adapters/CAdapter.js';
import { CppAdapter } from '../../src/services/languages/adapters/CppAdapter.js';
import { SqlAdapter } from '../../src/services/languages/adapters/SqlAdapter.js';
import { BaseAdapter } from '../../src/services/languages/adapters/BaseAdapter.js';
import { SandboxManager } from '../../src/services/sandbox/sandboxManager.js';
import { SandboxService } from '../../src/services/sandboxService.js';
import { AiService } from '../../src/services/aiService.js';
import { DiffService } from '../../src/services/diffService.js';
import { AiRepairService } from '../../src/services/aiRepairService.js';

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

test('Verification & Testing Suite - 8a. Regression: customTestCases as an Array of structured objects does not call .trim() on array', () => {
  const structuredTestCases = [
    { name: '10% Discount on 1000', input: '1000, 10', expected_output: 'Final price: 900.0' },
    { name: '20% Discount on 500', input: '500, 20', expected_output: 'Final price: 400.0' },
  ];

  const suite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def calculate_discount(price, discount_percent):\n    return f"Final price: {price - price * (discount_percent / 100)}"\n',
    customTestCases: structuredTestCases
  });

  assert.strictEqual(suite.hasCustomTests, true);
  assert.strictEqual(suite.testCases.length, 2);
  assert.strictEqual(suite.testCases[0].name, '10% Discount on 1000');
  assert.strictEqual(suite.testCases[0].input, '1000, 10');
  assert.strictEqual(suite.testCases[0].expected_output, 'Final price: 900.0');
  assert.ok(suite.executableTestCode.includes('assert calculate_discount(1000, 10) == "Final price: 900.0"'));
  assert.ok(suite.executableTestCode.includes('ALL_VERIFICATION_TESTS_PASSED'));
});

test('Verification & Testing Suite - 8b. Regression: customTestCases as an empty Array [] falls through to auto-generation without throwing .trim is not a function', () => {
  const suite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def add(a, b):\n    return a + b\n',
    customTestCases: []
  });

  assert.strictEqual(suite.hasCustomTests, false);
  assert.ok(Array.isArray(suite.testCases));
  assert.ok(suite.testCases.length > 0);
  assert.strictEqual(suite.testCases[0].isGenerated, true);
});

test('Verification & Testing Suite - 8c. Regression: customTestCases handles null, undefined, whitespace strings, and single objects safely', () => {
  // Null
  const nullSuite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def add(a, b): return a + b',
    customTestCases: null
  });
  assert.strictEqual(nullSuite.hasCustomTests, false);

  // Undefined
  const undefSuite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def add(a, b): return a + b',
    customTestCases: undefined
  });
  assert.strictEqual(undefSuite.hasCustomTests, false);

  // Whitespace only string
  const wsSuite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def add(a, b): return a + b',
    customTestCases: '     \n    \n   '
  });
  assert.strictEqual(wsSuite.hasCustomTests, false);

  // Single test case object
  const singleObjSuite = TestGenerator.generateSuite({
    language: 'python',
    code: 'def multiply(a, b): return a * b',
    customTestCases: { name: 'Simple Multiply', input: '3, 4', expected_output: '12' }
  });
  assert.strictEqual(singleObjSuite.hasCustomTests, true);
  assert.strictEqual(singleObjSuite.testCases.length, 1);
  assert.ok(singleObjSuite.executableTestCode.includes('multiply(3, 4) == 12'));

  // Array of raw string assertions
  const strArraySuite = TestGenerator.generateSuite({
    language: 'javascript',
    code: 'function add(a, b) { return a + b; }',
    customTestCases: ['if (add(1, 2) !== 3) throw new Error("fail 1");', 'if (add(0, 0) !== 0) throw new Error("fail 2");']
  });
  assert.strictEqual(strArraySuite.hasCustomTests, true);
  assert.strictEqual(strArraySuite.testCases.length, 2);
  assert.ok(strArraySuite.executableTestCode.includes('add(1, 2) !== 3'));
});

test('Verification & Testing Suite - 8d. Regression: All language adapters safely handle Array, Object, null, undefined in generateTestWrapper', () => {
  const adapters = [
    new BaseAdapter(),
    new PythonAdapter(),
    new JavaScriptAdapter(),
    new TypeScriptAdapter(),
    new JavaAdapter(),
    new CAdapter(),
    new CppAdapter(),
    new SqlAdapter(),
  ];

  const code = '/* test code */';
  const structuredArray = [{ assertionCode: 'assert(1 == 1);' }];
  const emptyArray = [];
  const stringCases = 'assert(2 == 2);';

  for (const adapter of adapters) {
    // Array of objects
    assert.doesNotThrow(() => {
      const res = adapter.generateTestWrapper({ code, customTestCases: structuredArray });
      assert.ok(typeof res === 'string');
    }, `Adapter ${adapter.id} threw with Array of objects`);

    // Empty array
    assert.doesNotThrow(() => {
      const res = adapter.generateTestWrapper({ code, customTestCases: emptyArray });
      assert.strictEqual(res, code);
    }, `Adapter ${adapter.id} threw with empty Array`);

    // Null and undefined
    assert.doesNotThrow(() => {
      const res1 = adapter.generateTestWrapper({ code, customTestCases: null });
      assert.strictEqual(res1, code);
      const res2 = adapter.generateTestWrapper({ code, customTestCases: undefined });
      assert.strictEqual(res2, code);
    }, `Adapter ${adapter.id} threw with null/undefined`);

    // String
    assert.doesNotThrow(() => {
      const res = adapter.generateTestWrapper({ code, customTestCases: stringCases });
      assert.ok(typeof res === 'string');
    }, `Adapter ${adapter.id} threw with string`);
  }
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

test('Verification & Testing Suite - 12. Regression: SQLite faithfully serializes and deserializes testCases across Array, Object, and String formats', () => {
  const db = getDatabase(':memory:');
  const repo = new DebugSessionRepository(db);

  // 1. Array of objects
  const arrayCases = [{ name: 'case1', input: '10', expected_output: '20' }];
  repo.create({
    id: 'test_arr_tc',
    language: 'python',
    sourceCode: 'def f(x): return x*2',
    testCases: arrayCases,
    diagnosis: 'none',
    rootCause: 'none',
    correctedCode: 'def f(x): return x*2'
  });
  const arrRow = repo.findById('test_arr_tc');
  assert.deepStrictEqual(arrRow.testCases, arrayCases);

  // 2. Single object
  const singleObjCase = { input: '5', expected: '10' };
  repo.create({
    id: 'test_obj_tc',
    language: 'python',
    sourceCode: 'def f(x): return x*2',
    testCases: singleObjCase,
    diagnosis: 'none',
    rootCause: 'none',
    correctedCode: 'def f(x): return x*2'
  });
  const objRow = repo.findById('test_obj_tc');
  assert.deepStrictEqual(objRow.testCases, singleObjCase);

  // 3. String assertion
  const strCase = 'assert f(2) == 4';
  repo.create({
    id: 'test_str_tc',
    language: 'python',
    sourceCode: 'def f(x): return x*2',
    testCases: strCase,
    diagnosis: 'none',
    rootCause: 'none',
    correctedCode: 'def f(x): return x*2'
  });
  const strRow = repo.findById('test_str_tc');
  assert.strictEqual(strRow.testCases, strCase);
});

test('Verification & Testing Suite - 13. False-positive prevention: Correct Python code returns hasBug: false and CODE VERIFIED', async () => {
  const fixtureManager = new SandboxManager({ mode: 'host', allowHostFixture: true, nodeEnv: 'development' });
  const sandbox = new SandboxService(10000, 4096, fixtureManager);
  const aiService = new AiService({ provider: 'mock' });
  const diffService = new DiffService();
  const repairService = new AiRepairService({ aiService, sandboxService: sandbox, diffService });

  const cleanCode = 'print(2 + 2)';
  const res = await repairService.repairAndVerify({
    language: 'python',
    sourceCode: cleanCode
  });

  assert.strictEqual(res.hasBug, false);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.verificationStatus, 'CODE VERIFIED');
  assert.strictEqual(res.category, 'CODE_CORRECT');
  assert.strictEqual(res.diff, '');
  assert.deepStrictEqual(res.lineDiagnoses, []);
  assert.deepStrictEqual(res.affectedLines, []);
  assert.strictEqual(res.correctedCode, cleanCode);
});

test('Verification & Testing Suite - 14. Detection: Genuinely incorrect Python code returns hasBug: true and diagnoses defect', async () => {
  const fixtureManager = new SandboxManager({ mode: 'host', allowHostFixture: true, nodeEnv: 'development' });
  const sandbox = new SandboxService(10000, 4096, fixtureManager);
  const aiService = new AiService({ provider: 'mock' });
  const diffService = new DiffService();
  const repairService = new AiRepairService({ aiService, sandboxService: sandbox, diffService });

  const buggyCode = 'print(10 / 0)';
  const res = await repairService.repairAndVerify({
    language: 'python',
    sourceCode: buggyCode
  });

  assert.strictEqual(res.hasBug, true);
  assert.ok(res.diagnosis.length > 0);
  assert.ok(res.rootCause.length > 0);
  assert.notStrictEqual(res.correctedCode, buggyCode);
});

test('Verification & Testing Suite - 15. False-positive prevention: Correct JavaScript code returns hasBug: false and CODE VERIFIED', async () => {
  const fixtureManager = new SandboxManager({ mode: 'host', allowHostFixture: true, nodeEnv: 'development' });
  const sandbox = new SandboxService(10000, 4096, fixtureManager);
  const aiService = new AiService({ provider: 'mock' });
  const diffService = new DiffService();
  const repairService = new AiRepairService({ aiService, sandboxService: sandbox, diffService });

  const cleanJs = 'console.log(2 + 2);';
  const res = await repairService.repairAndVerify({
    language: 'javascript',
    sourceCode: cleanJs
  });

  assert.strictEqual(res.hasBug, false);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.verificationStatus, 'CODE VERIFIED');
  assert.strictEqual(res.category, 'CODE_CORRECT');
  assert.strictEqual(res.diff, '');
  assert.deepStrictEqual(res.lineDiagnoses, []);
});

test('Verification & Testing Suite - 16. Detection: Genuinely incorrect JavaScript syntax code returns hasBug: true', async () => {
  const fixtureManager = new SandboxManager({ mode: 'host', allowHostFixture: true, nodeEnv: 'development' });
  const sandbox = new SandboxService(10000, 4096, fixtureManager);
  const aiService = new AiService({ provider: 'mock' });
  const diffService = new DiffService();
  const repairService = new AiRepairService({ aiService, sandboxService: sandbox, diffService });

  const buggyJs = 'const x = ;';
  const res = await repairService.repairAndVerify({
    language: 'javascript',
    sourceCode: buggyJs
  });

  assert.strictEqual(res.hasBug, true);
  assert.ok(res.diagnosis.length > 0);
  assert.notStrictEqual(res.correctedCode, buggyJs);
});

test('Verification & Testing Suite - 17. Honest reporting: Clean code with unavailable runtime reports STATIC CHECK PASSED', () => {
  const cleanCode = 'public class Hello { public static void main(String[] args) {} }';
  const result = VerificationService.verify({
    language: 'java',
    sourceCode: cleanCode,
    correctedCode: cleanCode,
    hasBug: false,
    repairedResult: {
      status: 'execution_unavailable',
      executionAvailable: false
    }
  });

  assert.strictEqual(result.verificationStatus, 'STATIC CHECK PASSED');
  assert.strictEqual(result.detailedStatus, 'STATIC_CHECK_PASSED');
  assert.strictEqual(result.category, 'STATIC_CHECK_PASSED');
  assert.strictEqual(result.isVerified, false);
  assert.strictEqual(result.toolchainStatus, 'unavailable');
});

test('Verification & Testing Suite - 18. Honest reporting: Bug fix with unavailable runtime reports FIX PARTIALLY VERIFIED and isVerified: false', () => {
  const suite = TestGenerator.generateSuite({
    language: 'java',
    code: 'public class Solution { public static void main(String[] args) { int x = 1; } }'
  });

  const result = VerificationService.verify({
    language: 'java',
    sourceCode: 'public class Solution { public static void main(String[] args) { int x = ; } }',
    correctedCode: 'public class Solution { public static void main(String[] args) { int x = 1; } }',
    hasBug: true,
    repairedResult: {
      status: 'execution_unavailable',
      executionAvailable: false
    },
    testSuite: suite.testCases
  });

  assert.strictEqual(result.verificationStatus, 'FIX PARTIALLY VERIFIED');
  assert.strictEqual(result.category, 'TESTS_GENERATED_NOT_RUN');
  assert.strictEqual(result.isVerified, false);
  assert.strictEqual(result.checks.executionPassed, null);
  assert.strictEqual(result.toolchainStatus, 'unavailable');
});
