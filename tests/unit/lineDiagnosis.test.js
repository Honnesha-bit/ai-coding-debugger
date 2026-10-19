import test from 'node:test';
import assert from 'node:assert';
import { AiService } from '../../src/services/aiService.js';
import { getDatabase } from '../../src/db/database.js';
import { DebugSessionRepository } from '../../src/db/repositories/debugSessionRepository.js';

test('LineDiagnosis - validates exact 1-indexed line numbers and extracts snippets from sourceCode', () => {
  const service = new AiService();
  const sourceCode = `def add(a, b):\n    return a - b\nprint(add(2, 3))`;

  const normalized = service._validateAndNormalizeSchema(
    {
      diagnosis: 'Subtraction operator used instead of addition',
      rootCause: 'Incorrect binary operator (-) on line 2',
      correctedCode: `def add(a, b):\n    return a + b\nprint(add(2, 3))`,
      affectedLines: [2],
      lineDiagnoses: [
        {
          lineNumber: 2,
          lineRange: [2, 2],
          snippet: 'return a - b',
          explanation: 'The function subtracts b from a instead of adding them.',
          suggestedCorrection: 'return a + b',
          whyItWorks: 'Using + performs arithmetic addition as expected.',
          isUncertain: false,
          confidence: 'high'
        }
      ],
      confidence: 'high'
    },
    sourceCode
  );

  assert.strictEqual(normalized.affectedLines.length, 1);
  assert.strictEqual(normalized.affectedLines[0], 2);
  assert.strictEqual(normalized.lineDiagnoses.length, 1);

  const diag = normalized.lineDiagnoses[0];
  assert.strictEqual(diag.lineNumber, 2);
  assert.deepStrictEqual(diag.lineRange, [2, 2]);
  assert.strictEqual(diag.snippet, 'return a - b');
  assert.strictEqual(diag.suggestedCorrection, 'return a + b');
  assert.strictEqual(diag.isUncertain, false);
  assert.strictEqual(diag.confidence, 'high');
});

test('LineDiagnosis - filters out-of-range line numbers and marks them uncertain', () => {
  const service = new AiService();
  const sourceCode = `x = 10\ny = 20\nprint(x + y)`; // Only 3 lines!

  const normalized = service._validateAndNormalizeSchema(
    {
      diagnosis: 'Unknown runtime defect',
      rootCause: 'Imagined defect',
      correctedCode: `x = 10\ny = 20\nprint(x + y)`,
      affectedLines: [99, -5, 0], // All out of range
      lineDiagnoses: [
        {
          lineNumber: 99, // Out of range for a 3-line file
          explanation: 'Line 99 is invalid',
          suggestedCorrection: 'N/A',
          whyItWorks: 'N/A',
          isUncertain: false
        }
      ],
      confidence: 'medium'
    },
    sourceCode
  );

  // affectedLines should filter out non-existent line numbers
  assert.deepStrictEqual(normalized.affectedLines, []);

  // line diagnosis should be marked uncertain because line 99 exceeds total lines (3)
  assert.strictEqual(normalized.lineDiagnoses.length, 1);
  assert.strictEqual(normalized.lineDiagnoses[0].lineNumber, null);
  assert.strictEqual(normalized.lineDiagnoses[0].isUncertain, true);
});

test('LineDiagnosis - handles multiple affected lines accurately', () => {
  const service = new AiService();
  const sourceCode = `def process(items):\n    total = 0\n    for i in range(len(items) + 1):\n        total += items[i]\n    return total`;

  const normalized = service._validateAndNormalizeSchema(
    {
      diagnosis: 'Off-by-one boundary error in range loop and index access',
      rootCause: 'range(len(items) + 1) exceeds bounds of items',
      correctedCode: `def process(items):\n    total = 0\n    for i in range(len(items)):\n        total += items[i]\n    return total`,
      affectedLines: [3, 4],
      confidence: 'high'
    },
    sourceCode
  );

  assert.deepStrictEqual(normalized.affectedLines, [3, 4]);
  assert.strictEqual(normalized.lineDiagnoses.length, 2);

  assert.strictEqual(normalized.lineDiagnoses[0].lineNumber, 3);
  assert.strictEqual(normalized.lineDiagnoses[0].snippet, 'for i in range(len(items) + 1):');
  assert.strictEqual(normalized.lineDiagnoses[0].isUncertain, false);

  assert.strictEqual(normalized.lineDiagnoses[1].lineNumber, 4);
  assert.strictEqual(normalized.lineDiagnoses[1].snippet, 'total += items[i]');
  assert.strictEqual(normalized.lineDiagnoses[1].isUncertain, false);
});

test('LineDiagnosis - marks line location uncertain when defect cannot be isolated to a single line', () => {
  const service = new AiService();
  const sourceCode = `import math\n\ndef calculate():\n    return val * 2`;

  const normalized = service._validateAndNormalizeSchema(
    {
      diagnosis: 'NameError: name "val" is not defined anywhere in the scope',
      rootCause: 'Missing declaration or parameter definition for "val"',
      correctedCode: `import math\n\ndef calculate(val):\n    return val * 2`,
      affectedLines: [], // No single line is solely at fault
      lineDiagnoses: [
        {
          lineNumber: null,
          lineRange: null,
          snippet: '',
          explanation: '"val" is accessed without prior definition or argument binding.',
          suggestedCorrection: 'Pass val as a function parameter def calculate(val):',
          whyItWorks: 'Provides parameter binding in function scope.',
          isUncertain: true,
          confidence: 'medium'
        }
      ],
      confidence: 'medium'
    },
    sourceCode
  );

  assert.strictEqual(normalized.lineDiagnoses.length, 1);
  assert.strictEqual(normalized.lineDiagnoses[0].lineNumber, null);
  assert.strictEqual(normalized.lineDiagnoses[0].isUncertain, true);
  assert.ok(normalized.lineDiagnoses[0].explanation.includes('val'));
});

test('LineDiagnosis - synthesizes honest fallback when lineDiagnoses is omitted by AI', () => {
  const service = new AiService();
  const sourceCode = `a = 1\nb = 0\nc = a / b`;

  // Case A: affectedLines provided
  const withLines = service._validateAndNormalizeSchema(
    {
      diagnosis: 'Division by zero on line 3',
      rootCause: 'Denominator b evaluates to 0',
      correctedCode: `a = 1\nb = 2\nc = a / b`,
      affectedLines: [2, 3]
    },
    sourceCode
  );

  assert.strictEqual(withLines.lineDiagnoses.length, 2);
  assert.strictEqual(withLines.lineDiagnoses[0].lineNumber, 2);
  assert.strictEqual(withLines.lineDiagnoses[0].snippet, 'b = 0');
  assert.strictEqual(withLines.lineDiagnoses[1].lineNumber, 3);
  assert.strictEqual(withLines.lineDiagnoses[1].snippet, 'c = a / b');

  // Case B: no affectedLines provided -> marked uncertain
  const withoutLines = service._validateAndNormalizeSchema(
    {
      diagnosis: 'General logic issue',
      rootCause: 'Unknown flow',
      correctedCode: `a = 1\nb = 2\nc = a / b`,
      affectedLines: []
    },
    sourceCode
  );

  assert.strictEqual(withoutLines.lineDiagnoses.length, 1);
  assert.strictEqual(withoutLines.lineDiagnoses[0].lineNumber, null);
  assert.strictEqual(withoutLines.lineDiagnoses[0].isUncertain, true);
});

test('LineDiagnosis - mock analyzer produces accurate lineDiagnoses for python sample', async () => {
  const service = new AiService({ provider: 'mock' });
  const result = await service.diagnoseAndFix({
    language: 'python',
    sourceCode: 'def binary_search(arr, target):\n    low = 0\n    high = len(arr)\n    while low <= high:\n        pass'
  });

  assert.ok(Array.isArray(result.lineDiagnoses));
  assert.ok(result.lineDiagnoses.length > 0);

  const item = result.lineDiagnoses[0];
  assert.strictEqual(item.lineNumber, 3);
  assert.strictEqual(item.snippet, 'high = len(arr)');
  assert.ok(item.suggestedCorrection.includes('high = len(arr) - 1'));
  assert.ok(item.whyItWorks.length > 0);
  assert.strictEqual(item.isUncertain, false);
});

test('LineDiagnosis - repository stores and retrieves lineDiagnoses accurately with backwards compatibility', () => {
  const db = getDatabase(':memory:');
  const repo = new DebugSessionRepository(db);

  const sessionId = 'test-session-line-diag';
  const testDiagnoses = [
    {
      lineNumber: 4,
      lineRange: [4, 4],
      snippet: 'printf("Hello")',
      explanation: 'Missing semicolon after printf statement',
      suggestedCorrection: 'printf("Hello");',
      whyItWorks: 'C requires semicolons to terminate expression statements.',
      isUncertain: false,
      confidence: 'high'
    }
  ];

  repo.create({
    id: sessionId,
    language: 'c',
    sourceCode: 'int main() {\n    printf("Hello")\n    return 0;\n}',
    errorDescription: "error: expected ';' before 'return'",
    diagnosis: 'Missing semicolon',
    rootCause: 'Syntax error on statement termination',
    correctedCode: 'int main() {\n    printf("Hello");\n    return 0;\n}',
    diff: '',
    confidence: 'high',
    lineDiagnoses: testDiagnoses,
    verified: true,
    verificationStatus: 'FIX VERIFIED'
  });

  const fetched = repo.findById(sessionId);
  assert.ok(fetched);
  assert.ok(Array.isArray(fetched.lineDiagnoses));
  assert.strictEqual(fetched.lineDiagnoses.length, 1);
  assert.strictEqual(fetched.lineDiagnoses[0].lineNumber, 4);
  assert.strictEqual(fetched.lineDiagnoses[0].snippet, 'printf("Hello")');
  assert.strictEqual(fetched.lineDiagnoses[0].suggestedCorrection, 'printf("Hello");');
  assert.strictEqual(fetched.lineDiagnoses[0].whyItWorks, 'C requires semicolons to terminate expression statements.');
  assert.strictEqual(fetched.lineDiagnoses[0].isUncertain, false);
});
