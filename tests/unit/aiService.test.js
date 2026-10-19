import test from 'node:test';
import assert from 'node:assert';
import { AiService } from '../../src/services/aiService.js';

test('AiService - rejects empty source code', async () => {
  const service = new AiService();
  await assert.rejects(
    async () => {
      await service.diagnoseAndFix({ language: 'python', sourceCode: '' });
    },
    /Source code is required/
  );
});

test('AiService - rejects missing language', async () => {
  const service = new AiService();
  await assert.rejects(
    async () => {
      await service.diagnoseAndFix({ language: '', sourceCode: 'print(1)' });
    },
    /Programming language is required/
  );
});

test('AiService - strictly validates schema and qualitative confidence', () => {
  const service = new AiService();
  const valid = service._validateAndNormalizeSchema({
    diagnosis: 'Simple explanation of the error',
    rootCause: 'Index boundary error',
    correctedCode: 'def fix(): pass',
    affectedLines: [3, 4],
    confidence: 'HIGH'
  });

  assert.strictEqual(valid.diagnosis, 'Simple explanation of the error');
  assert.strictEqual(valid.rootCause, 'Index boundary error');
  assert.strictEqual(valid.confidence, 'high');
  assert.deepStrictEqual(valid.affectedLines, [3, 4]);

  // Rejects missing diagnosis
  assert.throws(() => {
    service._validateAndNormalizeSchema({
      rootCause: 'something',
      correctedCode: 'code'
    });
  }, /missing "diagnosis"/);
});

test('AiService - mock analyzer identifies binary search off-by-one bug', async () => {
  const service = new AiService({ provider: 'mock' });
  const result = await service.diagnoseAndFix({
    language: 'python',
    sourceCode: 'def binary_search(arr, target):\n    low = 0\n    high = len(arr)\n    while low <= high:\n        pass'
  });

  assert.strictEqual(result.confidence, 'high');
  assert.strictEqual(result.provider, 'mock-analyzer');
  assert.ok(result.correctedCode.includes('high = len(arr) - 1'));
  assert.ok(result.diagnosis.toLowerCase().includes('off-by-one'));
});
