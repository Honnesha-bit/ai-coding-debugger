/**
 * Multi-Language Live API Integration Verification Script
 * Validates real HTTP calls to http://localhost:3000 for:
 * - Language Registry (16 languages)
 * - Automatic Language Detection (extensions + syntax patterns + uncertain flags)
 * - Language-Specific Execution & Static Validation (Python, JS, TS, SQL, HTML, CSS, Java, C, Rust)
 * - Iterative Feedback Retry Loop
 * - 4 Distinct Verification Statuses
 */

const BASE_URL = 'http://localhost:3000';

async function runStep(name, fn) {
  try {
    process.stdout.write(`  [Test] ${name}... `);
    const result = await fn();
    console.log(`✓ PASS ${result ? `(${result})` : ''}`);
    return { name, status: 'PASS' };
  } catch (err) {
    console.log(`✗ FAIL: ${err.message}`);
    return { name, status: 'FAIL', error: err.message };
  }
}

async function main() {
  console.log('\n========================================================');
  console.log('  MULTI-LANGUAGE END-TO-END VERIFICATION SUITE');
  console.log('========================================================\n');

  // Authenticate an operator account to avoid guest limits during test
  const authRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `lang_tester_${Date.now()}`,
      email: `tester_${Date.now()}@example.com`,
      password: 'Password123!'
    })
  });
  const setCookies = authRes.headers.getSetCookie ? authRes.headers.getSetCookie() : [authRes.headers.get('set-cookie')].filter(Boolean);
  const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

  const results = [];

  // 1. Language Registry
  results.push(await runStep('1. Fetch language registry returns all 16 target languages', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages`);
    const data = await res.json();
    if (!data.success || data.languages.length !== 16) {
      throw new Error(`Expected 16 languages, found ${data.languages?.length}`);
    }
    return `Found ${data.languages.length} languages`;
  }));

  // 2. Language Detection
  results.push(await runStep('2. Auto-detects TypeScript from code syntax', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'const x: number = 42; console.log(x);' })
    });
    const data = await res.json();
    if (data.detectedLanguage !== 'typescript') throw new Error(`Expected typescript, got ${data.detectedLanguage}`);
    return `${data.detectedLanguage} (${Math.round(data.confidence * 100)}%)`;
  }));

  results.push(await runStep('3. Auto-detects SQL from query syntax', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SELECT id, username FROM users WHERE active = 1;' })
    });
    const data = await res.json();
    if (data.detectedLanguage !== 'sql') throw new Error(`Expected sql, got ${data.detectedLanguage}`);
    return `${data.detectedLanguage} (${Math.round(data.confidence * 100)}%)`;
  }));

  results.push(await runStep('4. Correctly flags uncertain detection on random text', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'just some plain english text with no code' })
    });
    const data = await res.json();
    if (!data.isUncertain) throw new Error('Expected isUncertain=true');
    return 'isUncertain: true';
  }));

  // 3. Multi-Language Debugging
  results.push(await runStep('5. Debugs TypeScript and executes in sandbox (FIX VERIFIED)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        language: 'typescript',
        sourceCode: `function add(a: number, b: number): number {\n    return a - b;\n}\n\nconsole.log(add(2, 3));`,
        errorDescription: 'Subtracts instead of adds',
        expectedOutput: '5'
      })
    });
    const data = await res.json();
    if (data.verificationStatus !== 'FIX VERIFIED') throw new Error(`Expected FIX VERIFIED, got ${data.verificationStatus}`);
    if (!data.correctedCode.includes('return a + b;')) throw new Error('Correction missing return a + b;');
    return `${data.verificationStatus}`;
  }));

  results.push(await runStep('6. Debugs SQL and executes in-memory SQLite sandbox (FIX VERIFIED)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        language: 'sql',
        sourceCode: `CREATE TABLE users (id INT, name TEXT);\nINSERT INTO users VALUES (1, 'Alice');\nSELECT * WHERE id = 1;`,
        errorDescription: 'Missing FROM clause in SELECT'
      })
    });
    const data = await res.json();
    if (data.verificationStatus !== 'FIX VERIFIED') throw new Error(`Expected FIX VERIFIED, got ${data.verificationStatus}`);
    if (!data.correctedCode.includes('FROM users')) throw new Error('Correction missing FROM users');
    return `${data.verificationStatus}`;
  }));

  results.push(await runStep('7. Debugs HTML with static validation (FIX PARTIALLY VERIFIED)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        language: 'html',
        sourceCode: `<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body>\n  <div><p>Unclosed paragraph</div>\n</body>\n</html>`,
        errorDescription: 'Unclosed <p> element'
      })
    });
    const data = await res.json();
    if (data.verificationStatus !== 'FIX PARTIALLY VERIFIED') throw new Error(`Expected FIX PARTIALLY VERIFIED, got ${data.verificationStatus}`);
    return `${data.verificationStatus}`;
  }));

  results.push(await runStep('8. Debugs CSS with static syntax validation (FIX PARTIALLY VERIFIED)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        language: 'css',
        sourceCode: `body {\n    color: red\n    margin: 0;\n}`,
        errorDescription: 'Missing semicolon'
      })
    });
    const data = await res.json();
    if (data.verificationStatus !== 'FIX PARTIALLY VERIFIED') throw new Error(`Expected FIX PARTIALLY VERIFIED, got ${data.verificationStatus}`);
    return `${data.verificationStatus}`;
  }));

  results.push(await runStep('9. Handles Java with honest execution_unavailable status (FIX PARTIALLY VERIFIED)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        language: 'java',
        sourceCode: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello")\n    }\n}`,
        errorDescription: 'Missing semicolon in print statement'
      })
    });
    const data = await res.json();
    if (data.verificationStatus !== 'FIX PARTIALLY VERIFIED') throw new Error(`Expected FIX PARTIALLY VERIFIED, got ${data.verificationStatus}`);
    if (data.correctedRun?.status !== 'execution_unavailable') throw new Error(`Expected execution_unavailable, got ${data.correctedRun?.status}`);
    return `${data.verificationStatus} - execution_unavailable`;
  }));

  results.push(await runStep('10. Tracks retry history and attempts metadata', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        language: 'python',
        sourceCode: `def is_even(n):\n    return n % 2 == 1\n\nprint(is_even(4))`,
        errorDescription: 'Returns False for 4',
        expectedOutput: 'True'
      })
    });
    const data = await res.json();
    if (!Array.isArray(data.attempts) || data.attempts.length === 0) throw new Error('Expected attempts array');
    return `${data.attempts.length} attempt(s) recorded`;
  }));

  console.log('\n========================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`  MULTI-LANGUAGE TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
