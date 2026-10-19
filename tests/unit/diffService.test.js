import test from 'node:test';
import assert from 'node:assert';
import { DiffService } from '../../src/services/diffService.js';

test('DiffService - generates valid unified diff', () => {
  const diffService = new DiffService();
  const orig = 'def add(a, b):\n    return a - b';
  const corr = 'def add(a, b):\n    return a + b';

  const patch = diffService.generateUnifiedDiff(orig, corr);
  assert.ok(patch.includes('--- original/solution'));
  assert.ok(patch.includes('+++ corrected/solution'));
  assert.ok(patch.includes('-    return a - b'));
  assert.ok(patch.includes('+    return a + b'));
});

test('DiffService - structured diff identifies additions, deletions, line numbers', () => {
  const diffService = new DiffService();
  const orig = 'x = 1\ny = 2\nz = x * y';
  const corr = 'x = 1\ny = 5\nz = x * y';

  const res = diffService.generateStructuredDiff(orig, corr);
  assert.strictEqual(res.hasChanges, true);
  assert.strictEqual(res.additions, 1);
  assert.strictEqual(res.deletions, 1);

  const delLine = res.lines.find(l => l.type === 'del');
  const addLine = res.lines.find(l => l.type === 'add');

  assert.strictEqual(delLine.oldLineNumber, 2);
  assert.strictEqual(delLine.content, 'y = 2');
  assert.strictEqual(addLine.newLineNumber, 2);
  assert.strictEqual(addLine.content, 'y = 5');
});

test('DiffService - handles identical code without changes', () => {
  const diffService = new DiffService();
  const code = 'print("unchanged")';

  const res = diffService.generateStructuredDiff(code, code);
  assert.strictEqual(res.hasChanges, false);
  assert.strictEqual(res.additions, 0);
  assert.strictEqual(res.deletions, 0);
  assert.strictEqual(res.lines.length, 1);
  assert.strictEqual(res.lines[0].type, 'normal');
});
