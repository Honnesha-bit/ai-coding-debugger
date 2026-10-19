import test from 'node:test';
import assert from 'node:assert';
import {
  LIMITS,
  ValidationError,
  validateDebugSubmission,
  validateLanguageDetectionInput
} from '../../src/middleware/validationMiddleware.js';
import { AiService } from '../../src/services/aiService.js';
import { AiRepairService } from '../../src/services/aiRepairService.js';
import { AuthService } from '../../src/services/authService.js';
import { startTestServer } from '../testHelper.js';

test('Stage 5: Input Validation & Length Caps Suite', async (t) => {
  // =========================================================================
  // SECTION 1: validateDebugSubmission Unit Boundaries
  // =========================================================================

  await t.test('1. Valid debug submissions within limits pass successfully', () => {
    // Minimal valid
    assert.strictEqual(
      validateDebugSubmission({ language: 'python', sourceCode: 'print(1)' }),
      true
    );

    // Full valid payload with string testCases
    assert.strictEqual(
      validateDebugSubmission({
        language: 'javascript',
        sourceCode: 'console.log("hello");',
        errorDescription: 'No output',
        expectedOutput: 'hello',
        testCases: 'test()'
      }),
      true
    );

    // Full valid payload with structured testCases array
    assert.strictEqual(
      validateDebugSubmission({
        language: 'typescript',
        sourceCode: 'const x: number = 42;',
        errorDescription: 'Type check',
        expectedOutput: '42',
        testCases: [
          { input: 'arg1', expected: '42' },
          { input: 'arg2', expected: '84' }
        ]
      }),
      true
    );
  });

  await t.test('2. Source code validations: required, non-empty, and type checks', () => {
    // Missing source code
    assert.throws(
      () => validateDebugSubmission({ language: 'python' }),
      (err) => err instanceof ValidationError && /Source code is required/.test(err.message) && err.field === 'sourceCode'
    );

    // Empty string
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: '' }),
      (err) => err instanceof ValidationError && /Source code is required/.test(err.message)
    );

    // Whitespace only
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: '   \n  \t ' }),
      (err) => err instanceof ValidationError && /Source code is required/.test(err.message)
    );

    // Non-string
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 12345 }),
      (err) => err instanceof ValidationError && /Source code is required/.test(err.message)
    );
  });

  await t.test('3. Source code character limit (65,536 chars)', () => {
    // Exactly at boundary
    const exactValid = 'x'.repeat(LIMITS.MAX_SOURCE_CODE_CHARS);
    assert.strictEqual(
      validateDebugSubmission({ language: 'python', sourceCode: exactValid }),
      true
    );

    // Exceeds boundary by 1 char
    const oversized = 'x'.repeat(LIMITS.MAX_SOURCE_CODE_CHARS + 1);
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: oversized }),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed length') && err.field === 'sourceCode'
    );
  });

  await t.test('4. Source code UTF-8 byte limit (128 KB)', () => {
    // Multibyte characters: '€' is 3 bytes in UTF-8
    // 45,000 '€' characters = 45,000 chars (< 65,536) but 135,000 bytes (> 131,072 bytes)
    const multibyteOversized = '€'.repeat(45000);
    assert.ok(multibyteOversized.length <= LIMITS.MAX_SOURCE_CODE_CHARS);
    assert.ok(Buffer.byteLength(multibyteOversized, 'utf8') > LIMITS.MAX_SOURCE_CODE_BYTES);

    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: multibyteOversized }),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed UTF-8 size') && err.field === 'sourceCode'
    );
  });

  await t.test('5. Programming language validations: required, length cap, supported check', () => {
    // Missing language
    assert.throws(
      () => validateDebugSubmission({ sourceCode: 'print(1)' }),
      (err) => err instanceof ValidationError && /Programming language is required/.test(err.message) && err.field === 'language'
    );

    // Empty language
    assert.throws(
      () => validateDebugSubmission({ language: '  ', sourceCode: 'print(1)' }),
      (err) => err instanceof ValidationError && /Programming language is required/.test(err.message)
    );

    // Language ID too long (> 32 chars)
    const longLang = 'a'.repeat(33);
    assert.throws(
      () => validateDebugSubmission({ language: longLang, sourceCode: 'print(1)' }),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum length') && err.field === 'language'
    );

    // Unsupported language
    assert.throws(
      () => validateDebugSubmission({ language: 'brainfuck', sourceCode: 'print(1)' }),
      (err) => err instanceof ValidationError && err.code === 'UNSUPPORTED_LANGUAGE' && err.field === 'language'
    );
  });

  await t.test('6. Error description boundaries (8,192 chars / 16 KB bytes)', () => {
    // Non-string
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', errorDescription: 999 }),
      (err) => err instanceof ValidationError && err.field === 'errorDescription'
    );

    // Exactly at boundary
    const exactDesc = 'e'.repeat(LIMITS.MAX_ERROR_DESC_CHARS);
    assert.strictEqual(
      validateDebugSubmission({ language: 'python', sourceCode: 'x=1', errorDescription: exactDesc }),
      true
    );

    // Exceeds char limit
    const oversizedDesc = 'e'.repeat(LIMITS.MAX_ERROR_DESC_CHARS + 1);
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', errorDescription: oversizedDesc }),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed length') && err.field === 'errorDescription'
    );

    // Multibyte byte limit: 6,000 '€' = 18,000 bytes (> 16,384 bytes)
    const multibyteDesc = '€'.repeat(6000);
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', errorDescription: multibyteDesc }),
      (err) => err instanceof ValidationError && err.message.includes('UTF-8 size') && err.field === 'errorDescription'
    );
  });

  await t.test('7. Expected output boundaries (16,384 chars / 32 KB bytes)', () => {
    // Non-string
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', expectedOutput: {} }),
      (err) => err instanceof ValidationError && err.field === 'expectedOutput'
    );

    // Exactly at boundary
    const exactOut = 'o'.repeat(LIMITS.MAX_EXPECTED_OUTPUT_CHARS);
    assert.strictEqual(
      validateDebugSubmission({ language: 'python', sourceCode: 'x=1', expectedOutput: exactOut }),
      true
    );

    // Exceeds char limit
    const oversizedOut = 'o'.repeat(LIMITS.MAX_EXPECTED_OUTPUT_CHARS + 1);
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', expectedOutput: oversizedOut }),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed length') && err.field === 'expectedOutput'
    );
  });

  await t.test('8. Test cases string boundaries (32,768 chars / 64 KB bytes)', () => {
    // Exactly at boundary
    const exactTc = 't'.repeat(LIMITS.MAX_TEST_CASES_CHARS);
    assert.strictEqual(
      validateDebugSubmission({ language: 'python', sourceCode: 'x=1', testCases: exactTc }),
      true
    );

    // Exceeds char limit
    const oversizedTc = 't'.repeat(LIMITS.MAX_TEST_CASES_CHARS + 1);
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', testCases: oversizedTc }),
      (err) => err instanceof ValidationError && err.message.includes('exceed maximum allowed length') && err.field === 'testCases'
    );
  });

  await t.test('9. Structured test cases array boundaries (max 10 items, 4 KB per field)', () => {
    // Exactly 10 items passes
    const tenCases = Array.from({ length: 10 }, (_, i) => ({ input: `in_${i}`, expected: `out_${i}` }));
    assert.strictEqual(
      validateDebugSubmission({ language: 'python', sourceCode: 'x=1', testCases: tenCases }),
      true
    );

    // 11 items fails
    const elevenCases = Array.from({ length: 11 }, (_, i) => ({ input: `in_${i}`, expected: `out_${i}` }));
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', testCases: elevenCases }),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed count') && err.field === 'testCases'
    );

    // Malformed array item (primitive)
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', testCases: ['not an object'] }),
      (err) => err instanceof ValidationError && err.message.includes('must be an object')
    );

    // Item input exceeds 4,096 chars
    const oversizedCase = [{ input: 'x'.repeat(4097), expected: 'ok' }];
    assert.throws(
      () => validateDebugSubmission({ language: 'python', sourceCode: 'x=1', testCases: oversizedCase }),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed size')
    );
  });

  // =========================================================================
  // SECTION 2: validateLanguageDetectionInput Unit Tests
  // =========================================================================

  await t.test('10. Language detection inputs validation', () => {
    // Valid inputs
    assert.strictEqual(validateLanguageDetectionInput({ code: 'const x = 1;', filename: 'app.js' }), true);
    assert.strictEqual(validateLanguageDetectionInput({ code: 'def foo(): pass' }), true);
    assert.strictEqual(validateLanguageDetectionInput({ filename: 'test.py' }), true);
    assert.strictEqual(validateLanguageDetectionInput({}), true);

    // Oversized code
    assert.throws(
      () => validateLanguageDetectionInput({ code: 'x'.repeat(LIMITS.MAX_SOURCE_CODE_CHARS + 1) }),
      (err) => err instanceof ValidationError && err.field === 'code'
    );

    // Oversized filename (> 256 chars)
    assert.throws(
      () => validateLanguageDetectionInput({ filename: 'f'.repeat(LIMITS.MAX_FILENAME_CHARS + 1) }),
      (err) => err instanceof ValidationError && err.field === 'filename'
    );

    // Non-string types
    assert.throws(
      () => validateLanguageDetectionInput({ code: 12345 }),
      (err) => err instanceof ValidationError && err.field === 'code'
    );
    assert.throws(
      () => validateLanguageDetectionInput({ filename: ['app.py'] }),
      (err) => err instanceof ValidationError && err.field === 'filename'
    );
  });

  // =========================================================================
  // SECTION 3: Defense-in-Depth Service Boundary Tests
  // =========================================================================

  await t.test('11. AiService.diagnoseAndFix enforces boundaries directly', async () => {
    const aiService = new AiService({ provider: 'mock' });

    // Missing source code
    await assert.rejects(
      async () => aiService.diagnoseAndFix({ language: 'python', sourceCode: '' }),
      /Source code is required/
    );

    // Missing language
    await assert.rejects(
      async () => aiService.diagnoseAndFix({ language: '', sourceCode: 'print(1)' }),
      /Programming language is required/
    );

    // Oversized source code
    await assert.rejects(
      async () => aiService.diagnoseAndFix({
        language: 'python',
        sourceCode: 'x'.repeat(LIMITS.MAX_SOURCE_CODE_CHARS + 1)
      }),
      /exceeds maximum allowed length/
    );
  });

  await t.test('12. AiRepairService.repairAndVerify enforces boundaries directly', async () => {
    const aiRepair = new AiRepairService({
      aiService: new AiService({ provider: 'mock' }),
      sandboxService: { execute: async () => ({ status: 'success' }) }
    });

    // Oversized input rejected immediately before sandbox execution
    await assert.rejects(
      async () => aiRepair.repairAndVerify({
        language: 'python',
        sourceCode: 'x'.repeat(LIMITS.MAX_SOURCE_CODE_CHARS + 1)
      }),
      /exceeds maximum allowed length/
    );
  });

  // =========================================================================
  // SECTION 4: AuthService Input Bounds
  // =========================================================================

  await t.test('13. AuthService enforces username (3-32) and password (6-128) bounds', () => {
    const mockRepo = {
      findByUsername: () => null,
      findByEmail: () => null,
      createUser: (u) => u,
      findById: () => null
    };
    const auth = new AuthService(mockRepo);

    // Username too long (> 32)
    assert.throws(
      () => auth.register({ username: 'u'.repeat(33), email: 'u@example.com', password: 'password123' }),
      /Username cannot exceed 32 characters/
    );

    // Password too long (> 128)
    assert.throws(
      () => auth.register({ username: 'validuser', email: 'u@example.com', password: 'p'.repeat(129) }),
      /Password cannot exceed 128 characters/
    );

    // Non-string types rejected
    assert.throws(
      () => auth.register({ username: 12345, email: 'u@example.com', password: 'password123' }),
      /must be strings/
    );

    // Login with oversized credentials rejected immediately without scrypt
    assert.throws(
      () => auth.login({ username: 'u'.repeat(33), password: 'p'.repeat(129) }),
      /Invalid username or password/
    );
  });

  // =========================================================================
  // SECTION 5: HTTP Endpoints & Middleware Integration Tests
  // =========================================================================

  let client;

  t.beforeEach(async () => {
    client = await startTestServer();
  });

  t.afterEach(async () => {
    if (client) await client.close();
  });

  await t.test('14. POST /api/v1/debug rejects oversized sourceCode with 400 without consuming guest quota', async () => {
    // Check initial guest uses
    const initialStatus = await (await client.request('/api/v1/auth/status')).json();
    assert.strictEqual(initialStatus.guestStatus.remainingUses, 2);

    // Send oversized source code
    const res = await client.request('/api/v1/debug', {
      method: 'POST',
      body: {
        language: 'python',
        sourceCode: 'x'.repeat(LIMITS.MAX_SOURCE_CODE_CHARS + 1)
      }
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_INPUT');
    assert.strictEqual(data.field, 'sourceCode');
    assert.ok(data.message.includes('exceeds maximum allowed length'));

    // Verify guest quota was NOT consumed
    const afterStatus = await (await client.request('/api/v1/auth/status')).json();
    assert.strictEqual(afterStatus.guestStatus.remainingUses, 2);
  });

  await t.test('15. POST /api/v1/debug rejects unsupported language with 400 UNSUPPORTED_LANGUAGE', async () => {
    const res = await client.request('/api/v1/debug', {
      method: 'POST',
      body: {
        language: 'fortran77',
        sourceCode: 'PROGRAM HELLO\nPRINT *, "HELLO"\nEND'
      }
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNSUPPORTED_LANGUAGE');
    assert.strictEqual(data.field, 'language');
  });

  await t.test('16. POST /api/v1/execute rejects oversized code with 400 without consuming guest quota', async () => {
    const res = await client.request('/api/v1/execute', {
      method: 'POST',
      body: {
        language: 'python',
        sourceCode: 'print(1) # ' + 'x'.repeat(LIMITS.MAX_SOURCE_CODE_CHARS)
      }
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_INPUT');

    const status = await (await client.request('/api/v1/auth/status')).json();
    assert.strictEqual(status.guestStatus.remainingUses, 2);
  });

  await t.test('17. POST /api/v1/languages/detect validates code and filename limits', async () => {
    // Oversized filename
    const res1 = await client.request('/api/v1/languages/detect', {
      method: 'POST',
      body: { filename: 'a'.repeat(LIMITS.MAX_FILENAME_CHARS + 1) }
    });
    assert.strictEqual(res1.status, 400);
    const data1 = await res1.json();
    assert.strictEqual(data1.error, 'INVALID_INPUT');

    // Valid detect
    const res2 = await client.request('/api/v1/languages/detect', {
      method: 'POST',
      body: { code: 'def hello():\n    pass', filename: 'test.py' }
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.detectedLanguage, 'python');
  });

  await t.test('18. HTTP 413 PAYLOAD_TOO_LARGE returned when body exceeds Express 512KB limit', async () => {
    // 512KB + 1KB raw string body
    const oversizedBody = JSON.stringify({
      language: 'python',
      sourceCode: 'x'.repeat(520 * 1024)
    });

    const res = await client.request('/api/v1/debug', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(oversizedBody).toString()
      },
      body: oversizedBody
    });

    assert.strictEqual(res.status, 413);
    const data = await res.json();
    assert.strictEqual(data.error, 'PAYLOAD_TOO_LARGE');
    assert.ok(data.message.includes('512kb'));
  });
});
