import test from 'node:test';
import assert from 'node:assert';
import { ExportService } from '../../src/services/exportService.js';

test('ExportService - sanitizes CSV formula injection attempts', () => {
  // Test formula prefixes: =, +, -, @
  assert.strictEqual(ExportService.sanitizeCsvField('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.strictEqual(ExportService.sanitizeCsvField('-2+3*cmd|'), "'-2+3*cmd|");
  assert.strictEqual(ExportService.sanitizeCsvField('@calc.exe'), "'@calc.exe");
  assert.strictEqual(ExportService.sanitizeCsvField('+123'), "'+123");
});

test('ExportService - escapes quotes and commas in CSV fields', () => {
  assert.strictEqual(ExportService.sanitizeCsvField('Hello, World'), '"Hello, World"');
  assert.strictEqual(ExportService.sanitizeCsvField('Quote "test" here'), '"Quote ""test"" here"');
});

test('ExportService - exports valid CSV table with correct headers', () => {
  const dummyRun = {
    id: 'eval_123',
    timestamp: '2026-10-18T10:00:00Z',
    totalCases: 1,
    rawResults: [
      {
        id: 'eval-01',
        title: 'Binary Search Fix',
        language: 'python',
        category: 'off-by-one',
        correctedStatus: 'success',
        fixSuccess: true,
        compilationSuccess: true,
        regression: false,
        explanationScore: 1.0,
        latencyMs: 120,
        diagnosis: 'Off by one',
        rootCause: 'Index bound'
      }
    ]
  };

  const csv = ExportService.toCsv(dummyRun);
  const lines = csv.trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].startsWith('id,title,language,category,status'));
  assert.ok(lines[1].includes('eval-01'));
  assert.ok(lines[1].includes('true'));
});

test('ExportService - exports valid JSON with numeric values preserved', () => {
  const dummyRun = {
    id: 'eval_123',
    timestamp: '2026-10-18T10:00:00Z',
    totalCases: 25,
    fixSuccessRate: 0.92,
    compilationSuccessRate: 1.0,
    regressionRate: 0.0,
    explanationAccuracy: 0.95,
    sandboxFailureRate: 0.0,
    medianLatencyMs: 150,
    latencyObservations: 25,
    failureCounts: { timeouts: 0 },
    rawResults: []
  };

  const jsonStr = ExportService.toJson(dummyRun);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.runId, 'eval_123');
  assert.strictEqual(typeof parsed.summaryMetrics.fixSuccessRate, 'number');
  assert.strictEqual(parsed.summaryMetrics.fixSuccessRate, 0.92);
  assert.strictEqual(parsed.summaryMetrics.medianLatencyMs, 150);
});
