import test from 'node:test';
import assert from 'node:assert/strict';

import { LanguageRegistry } from '../../src/services/languages/languageRegistry.js';
import { LanguageDetector } from '../../src/services/languages/languageDetector.js';
import { StaticAnalyzer } from '../../src/services/languages/staticAnalyzer.js';
import { SandboxService } from '../../src/services/sandboxService.js';
import { AiService } from '../../src/services/aiService.js';
import { AiRepairService } from '../../src/services/aiRepairService.js';

test('LanguageRegistry - contains all 16 target programming languages', () => {
  const all = LanguageRegistry.getAll();
  assert.equal(all.length, 16);

  const expectedLangs = [
    'python', 'javascript', 'typescript', 'sql', 'html', 'css',
    'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift'
  ];

  for (const langId of expectedLangs) {
    const lang = LanguageRegistry.getById(langId);
    assert.ok(lang, `Language ${langId} should be in LanguageRegistry`);
    assert.ok(lang.extensions.length > 0, `${langId} must declare extensions`);
    assert.ok(lang.capabilities, `${langId} must declare capabilities`);
  }
});

test('LanguageDetector - detects language from file extensions accurately', () => {
  const testCases = [
    { filename: 'app.py', expected: 'python' },
    { filename: 'index.js', expected: 'javascript' },
    { filename: 'component.tsx', expected: 'typescript' },
    { filename: 'query.sql', expected: 'sql' },
    { filename: 'index.html', expected: 'html' },
    { filename: 'styles.css', expected: 'css' },
    { filename: 'Main.java', expected: 'java' },
    { filename: 'solution.cpp', expected: 'cpp' },
    { filename: 'server.go', expected: 'go' },
    { filename: 'main.rs', expected: 'rust' }
  ];

  for (const tc of testCases) {
    const res = LanguageDetector.detect({ code: 'x = 1', filename: tc.filename });
    assert.equal(res.detectedLanguage, tc.expected, `Expected ${tc.filename} to be ${tc.expected}`);
    assert.ok(res.confidence >= 0.9, 'Confidence should be high for extension match');
    assert.equal(res.isUncertain, false);
  }
});

test('LanguageDetector - detects language from syntax patterns without filename', () => {
  const pythonCode = `def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n - 1) + fibonacci(n - 2)\n\nprint(fibonacci(5))`;
  const pyRes = LanguageDetector.detect({ code: pythonCode });
  assert.equal(pyRes.detectedLanguage, 'python');
  assert.equal(pyRes.isUncertain, false);

  const tsCode = `interface User {\n  id: number;\n  name: string;\n}\nconst u: User = { id: 1, name: "Alice" };`;
  const tsRes = LanguageDetector.detect({ code: tsCode });
  assert.equal(tsRes.detectedLanguage, 'typescript');

  const sqlCode = `SELECT id, name FROM users WHERE active = 1 ORDER BY created_at DESC;`;
  const sqlRes = LanguageDetector.detect({ code: sqlCode });
  assert.equal(sqlRes.detectedLanguage, 'sql');

  const htmlCode = `<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body><h1>Hello</h1></body>\n</html>`;
  const htmlRes = LanguageDetector.detect({ code: htmlCode });
  assert.equal(htmlRes.detectedLanguage, 'html');

  const rustCode = `fn main() {\n    let mut count = 0;\n    count += 1;\n    println!("Count: {}", count);\n}`;
  const rsRes = LanguageDetector.detect({ code: rustCode });
  assert.equal(rsRes.detectedLanguage, 'rust');
});

test('LanguageDetector - flags uncertain or gibberish input', () => {
  const gibberish = 'random nonsensical text with no code structures';
  const res = LanguageDetector.detect({ code: gibberish });
  assert.equal(res.isUncertain, true);
  assert.ok(res.message.includes('uncertain'));
});

test('StaticAnalyzer - identifies syntax defects across languages', () => {
  // Python missing colon
  const pyBad = `def calculate(a, b)\n    return a + b`;
  const pyRes = StaticAnalyzer.analyze('python', pyBad);
  assert.equal(pyRes.isValid, false);
  assert.ok(pyRes.errors.some(e => e.rule === 'PYTHON_MISSING_COLON'));

  // Delimiter mismatch
  const mismatched = `function test() { return (1 + 2]; }`;
  const mmRes = StaticAnalyzer.analyze('javascript', mismatched);
  assert.equal(mmRes.isValid, false);
  assert.ok(mmRes.errors.some(e => e.rule === 'MISMATCHED_DELIMITER'));

  // HTML unclosed tag
  const htmlBad = `<div><p>Unclosed paragraph</div>`;
  const htmlRes = StaticAnalyzer.analyze('html', htmlBad);
  assert.equal(htmlRes.isValid, false);
  assert.ok(htmlRes.errors.some(e => e.rule === 'HTML_UNCLOSED_TAG'));

  // CSS missing semicolon
  const cssBad = `body {\n  color: red\n  margin: 0;\n}`;
  const cssRes = StaticAnalyzer.analyze('css', cssBad);
  assert.equal(cssRes.isValid, false);
  assert.ok(cssRes.errors.some(e => e.rule === 'CSS_MISSING_SEMICOLON'));

  // SQL missing FROM
  const sqlBad = `SELECT * WHERE id = 10;`;
  const sqlRes = StaticAnalyzer.analyze('sql', sqlBad);
  assert.equal(sqlRes.isValid, false);
  assert.ok(sqlRes.errors.some(e => e.rule === 'SQL_MISSING_FROM'));
});

test('SandboxService - executes TypeScript in isolated sandbox', async () => {
  const sandbox = new SandboxService();
  const tsCode = `const greeting: string = "Hello TypeScript!";\nconsole.log(greeting);`;
  const result = await sandbox.execute({ language: 'typescript', code: tsCode });
  assert.equal(result.status, 'success');
  assert.ok(result.stdout.includes('Hello TypeScript!'));
});

test('SandboxService - executes in-memory SQL in isolated sandbox', async () => {
  const sandbox = new SandboxService();
  const sqlCode = `CREATE TABLE items (id INT, name TEXT);\nINSERT INTO items VALUES (1, 'Widget');\nSELECT * FROM items;`;
  const result = await sandbox.execute({ language: 'sql', code: sqlCode });
  assert.equal(result.status, 'success');
  assert.ok(result.stdout.includes('Widget'));
});

test('SandboxService - validates HTML and CSS statically without pretending binary execution', async () => {
  const sandbox = new SandboxService();
  const htmlCode = `<!DOCTYPE html>\n<html>\n<head><title>Title</title></head>\n<body><p>Valid</p></body>\n</html>`;
  const htmlRes = await sandbox.execute({ language: 'html', code: htmlCode });
  assert.equal(htmlRes.status, 'success');
  assert.equal(htmlRes.isStaticValidation, true);

  const cssCode = `div.card {\n    padding: 10px;\n    border: 1px solid #ccc;\n}`;
  const cssRes = await sandbox.execute({ language: 'css', code: cssCode });
  assert.equal(cssRes.status, 'success');
  assert.equal(cssRes.isStaticValidation, true);
});

test('SandboxService - safely handles uninstalled toolchains with honest status', async () => {
  const sandbox = new SandboxService();
  const javaCode = `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}`;
  const res = await sandbox.execute({ language: 'java', code: javaCode });
  // Since javac is not in host PATH, should report execution_unavailable
  assert.equal(res.status, 'execution_unavailable');
  assert.equal(res.executionAvailable, false);
  assert.ok(res.stdout.includes('Static Syntax Analysis Passed'));
});

test('AiRepairService - completes repair and returns distinct verification status', async () => {
  const ai = new AiService({ provider: 'mock' });
  const sandbox = new SandboxService();
  const repairService = new AiRepairService({ aiService: ai, sandboxService: sandbox });

  // Test TypeScript repair
  const buggyTs = `function add(a: number, b: number): number {\n    return a - b;\n}\n\nconsole.log(add(2, 3));`;
  const result = await repairService.repairAndVerify({
    language: 'typescript',
    sourceCode: buggyTs,
    errorDescription: 'Subtracts instead of adds',
    expectedOutput: '5'
  });

  assert.equal(result.verificationStatus, 'FIX VERIFIED');
  assert.equal(result.verified, true);
  assert.ok(result.correctedCode.includes('return a + b;'));
  assert.ok(result.attempts.length >= 1);
});
