import test from 'node:test';
import assert from 'node:assert';
import { EvaluationService } from '../../src/services/evaluationService.js';
import { setupTestDb, teardownTestDb } from '../testHelper.js';

test('EvaluationService - dataset contains at least 25 distinct held-out snippets', () => {
  const service = new EvaluationService();
  const dataset = service.loadDataset();

  assert.ok(dataset.length >= 25, `Expected >= 25 cases, found ${dataset.length}`);

  const ids = new Set();
  for (const c of dataset) {
    assert.ok(c.id, 'Every case must have an id');
    assert.ok(c.buggyCode, 'Every case must have buggyCode');
    assert.ok(c.testCode, 'Every case must have testCode');
    assert.strictEqual(c.split, 'held-out');
    assert.ok(!ids.has(c.id), `Duplicate ID detected: ${c.id}`);
    ids.add(c.id);
  }
});

test('EvaluationService - runs evaluation and computes all 7 metrics', async () => {
  setupTestDb();
  try {
    const service = new EvaluationService();
    // Fast partial slice or full evaluation
    const run = await service.runEvaluation();

    assert.ok(run.id.startsWith('eval_'));
    assert.strictEqual(run.totalCases, 25);
    assert.strictEqual(typeof run.fixSuccessRate, 'number');
    assert.strictEqual(typeof run.compilationSuccessRate, 'number');
    assert.strictEqual(typeof run.regressionRate, 'number');
    assert.strictEqual(typeof run.explanationAccuracy, 'number');
    assert.strictEqual(typeof run.sandboxFailureRate, 'number');
    assert.strictEqual(typeof run.medianLatencyMs, 'number');
    assert.ok(run.latencyObservations >= 25);
    assert.ok(run.failureCounts !== undefined);
  } finally {
    teardownTestDb();
  }
});
