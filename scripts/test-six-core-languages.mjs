import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';

async function runSixCoreLanguagesSuite() {
  console.log('\n========================================================');
  console.log('  TESTING SIX CORE LANGUAGE ADAPTERS SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`  [Test] ${name}... `);
    try {
      await fn();
      console.log('✓ PASS');
      passed++;
    } catch (err) {
      console.log('✗ FAIL');
      console.error(`         Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Language Registry & Core Adapters
  await test('1. Language Registry lists 6 core adapters with toolchain detection', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.languages.length >= 6);
    assert.ok(data.coreLanguages);
    assert.deepEqual(data.coreLanguages.sort(), ['c', 'cpp', 'java', 'javascript', 'python', 'typescript'].sort());
    assert.ok(data.toolchains.python.isAvailable === true);
    assert.ok(data.toolchains.javascript.isAvailable === true);
    assert.ok(data.toolchains.typescript.isAvailable === true);
    assert.ok(data.toolchains.java.isAvailable === false);
    assert.ok(data.toolchains.c.isAvailable === false);
    assert.ok(data.toolchains.cpp.isAvailable === false);
  });

  // 2. Python Detection
  await test('2. Auto-detects Python code unambiguously', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'def fib(n):\n    if n <= 1: return n\n    return fib(n - 1) + fib(n - 2)\nprint(fib(5))'
      })
    });
    const data = await res.json();
    assert.equal(data.detectedLanguage, 'python');
    assert.equal(data.isAmbiguous, false);
    assert.ok(data.confidence > 0.7);
  });

  // 3. Ambiguous JS vs TS
  await test('3. Flags JavaScript code without types as ambiguous with TypeScript', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'function add(a, b) {\n    return a + b;\n}\nconsole.log(add(1, 2));'
      })
    });
    const data = await res.json();
    assert.equal(data.isAmbiguous, true);
    assert.deepEqual(data.ambiguousOptions, ['javascript', 'typescript']);
    assert.equal(data.needsConfirmation, true);
  });

  // 4. Decisive TypeScript Detection
  await test('4. Decisively detects TypeScript when interfaces or types are present', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'interface User {\n    id: number;\n    name: string;\n}\nconst u: User = { id: 1, name: "Alice" };'
      })
    });
    const data = await res.json();
    assert.equal(data.detectedLanguage, 'typescript');
    assert.equal(data.isAmbiguous, false);
  });

  // 5. Ambiguous C vs C++
  await test('5. Flags standard C syntax as ambiguous with C++', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello\\n");\n    return 0;\n}'
      })
    });
    const data = await res.json();
    assert.equal(data.isAmbiguous, true);
    assert.deepEqual(data.ambiguousOptions, ['c', 'cpp']);
  });

  // 6. Decisive C++ Detection
  await test('6. Decisively detects C++ with iostream and std::cout', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/languages/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: '#include <iostream>\nusing namespace std;\nint main() {\n    cout << "C++ stream" << endl;\n    return 0;\n}'
      })
    });
    const data = await res.json();
    assert.equal(data.detectedLanguage, 'cpp');
    assert.equal(data.isAmbiguous, false);
  });

  // Helper function to get an authenticated session
  async function getAuthenticatedHeaders() {
    const username = `coreuser_${Date.now()}`;
    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: 'Password123!'
      })
    });
    const cookies = regRes.headers.getSetCookie();
    const sessionTokenCookie = cookies.find(c => c.startsWith('session_token='));
    return {
      'Content-Type': 'application/json',
      'Cookie': sessionTokenCookie ? sessionTokenCookie.split(';')[0] : ''
    };
  }

  const authHeaders = await getAuthenticatedHeaders();

  // 7. Python Debugging & Real Verification
  await test('7. Debugs Python code with FIX VERIFIED in real sandbox', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        language: 'python',
        sourceCode: 'def binary_search(arr, target):\n    low = 0\n    high = len(arr)\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\nassert binary_search([1, 3, 5], 3) == 1',
        errorDescription: 'IndexError in binary search'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.verificationStatus, 'FIX VERIFIED');
    assert.equal(data.verified, true);
    assert.ok(data.executionDurationMs > 0, 'Measured latency must be > 0ms');
  });

  // 8. TypeScript Debugging & Real Verification
  await test('8. Debugs TypeScript code with FIX VERIFIED via native type-stripping', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        language: 'typescript',
        sourceCode: 'function add(a: number, b: number): number {\n    return a + b;\n}\nconsole.log(add(10, 20));',
        errorDescription: 'Works correctly'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.verificationStatus, 'FIX VERIFIED');
    assert.equal(data.verified, true);
    assert.ok(data.correctedRun.stdout.includes('30'));
  });

  // 9. Java Debugging & Honest Toolchain Unavailable
  await test('9. Debugs Java with honest FIX PARTIALLY VERIFIED status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        language: 'java',
        sourceCode: 'public class Main {\n    public static void main(String[] args) {\n        int x = 5\n    }\n}',
        errorDescription: 'Missing semicolon'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.verificationStatus, 'FIX PARTIALLY VERIFIED');
    assert.ok(data.correctedCode.includes('int x = 5;'));
    assert.ok(data.verificationSummary.includes('partially verified'));
  });

  // 10. C Debugging & Honest Toolchain Unavailable
  await test('10. Debugs C with honest FIX PARTIALLY VERIFIED status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        language: 'c',
        sourceCode: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello C")\n    return 0;\n}',
        errorDescription: 'Missing semicolon'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.verificationStatus, 'FIX PARTIALLY VERIFIED');
    assert.ok(data.correctedCode.includes('printf("Hello C");'));
  });

  // 11. C++ Debugging & Honest Toolchain Unavailable
  await test('11. Debugs C++ with honest FIX PARTIALLY VERIFIED status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/debug`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        language: 'cpp',
        sourceCode: '#include <iostream>\n\nint main() {\n    std::cout << "Hello"\n    return 0;\n}',
        errorDescription: 'Missing semicolon'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.verificationStatus, 'FIX PARTIALLY VERIFIED');
    assert.ok(data.correctedCode.includes('std::cout << "Hello";'));
  });

  // 12. Run Evaluation and Check Real Latency
  await test('12. Evaluation benchmark measures genuine non-zero execution latencies', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/evaluation/run`, {
      method: 'POST',
      headers: authHeaders
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    const run = data.run || data.results;
    assert.ok(run, 'Must return evaluation run record');
    assert.ok(run.medianLatencyMs > 0, `Median latency must be > 0ms, was ${run.medianLatencyMs}ms`);
    assert.ok(run.rawResults.length >= 25);
  });

  console.log('\n========================================================');
  console.log(`  SIX CORE LANGUAGES RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runSixCoreLanguagesSuite();
