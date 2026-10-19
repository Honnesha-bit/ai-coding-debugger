import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService } from '../../src/services/aiService.js';

test('Multi-Provider Fallback - 1. Primary provider succeeds and returns truthful attribution', async () => {
  const originalFetch = globalThis.fetch;
  const mockPayload = {
    diagnosis: 'Index error on line 2',
    rootCause: 'Zero-based index offset',
    correctedCode: 'def fix(): pass',
    affectedLines: [2],
    confidence: 'high'
  };

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }]
    })
  });

  try {
    const ai = new AiService({
      provider: 'gemini',
      geminiApiKey: 'TEST_GEMINI_KEY',
      openaiApiKey: 'TEST_OPENAI_KEY',
      retryBaseMs: 5
    });

    const result = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'def test():\n    pass'
    });

    assert.equal(result.provider, 'gemini');
    assert.equal(result.diagnosis, 'Index error on line 2');
    assert.equal(result.confidence, 'high');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 2. Rate limit (429) on primary transparently falls back to OpenAI and attributes correctly', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  const calledUrls = [];

  const openAiPayload = {
    diagnosis: 'OpenAI diagnosis after fallback',
    rootCause: 'Technical cause from OpenAI',
    correctedCode: 'def open_ai_fix(): pass',
    affectedLines: [1],
    confidence: 'medium'
  };

  globalThis.fetch = async (url) => {
    callCount++;
    calledUrls.push(url);

    // Gemini calls fail with 429
    if (url.includes('googleapis.com')) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => '1' },
        json: async () => ({ error: { message: 'Resource exhausted' } })
      };
    }

    // OpenAI fallback succeeds
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(openAiPayload) } }]
      })
    };
  };

  try {
    const ai = new AiService({
      provider: 'gemini',
      fallbackProvider: 'openai',
      geminiApiKey: 'TEST_GEMINI_KEY',
      openaiApiKey: 'TEST_OPENAI_KEY',
      maxRetries: 1, // 1 retry then fallback
      retryBaseMs: 5
    });

    const result = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'x = 1'
    });

    // Successfully fell back to OpenAI
    assert.equal(result.provider, 'openai');
    assert.equal(result.diagnosis, 'OpenAI diagnosis after fallback');
    assert.ok(calledUrls.some(u => u.includes('googleapis.com')), 'Must attempt Gemini first');
    assert.ok(calledUrls.some(u => u.includes('api.openai.com')), 'Must attempt OpenAI fallback');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 3. Server outage (503) on primary triggers fallback to alternate provider', async () => {
  const originalFetch = globalThis.fetch;
  const geminiPayload = {
    diagnosis: 'Gemini recovery diagnosis',
    rootCause: 'Fixed off-by-one',
    correctedCode: 'def gemini_fix(): pass',
    affectedLines: [1],
    confidence: 'high'
  };

  globalThis.fetch = async (url) => {
    if (url.includes('api.openai.com')) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Service Unavailable' } })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }]
      })
    };
  };

  try {
    const ai = new AiService({
      provider: 'openai',
      fallbackProvider: 'gemini',
      openaiApiKey: 'TEST_OPENAI_KEY',
      geminiApiKey: 'TEST_GEMINI_KEY',
      maxRetries: 1,
      retryBaseMs: 5
    });

    const result = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'y = 2'
    });

    assert.equal(result.provider, 'gemini');
    assert.equal(result.diagnosis, 'Gemini recovery diagnosis');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 4. Quota exhaustion fails fast without retry loops and triggers fallback', async () => {
  const originalFetch = globalThis.fetch;
  let openAiAttempts = 0;

  const geminiPayload = {
    diagnosis: 'Gemini fix when OpenAI is out of credits',
    rootCause: 'Root cause',
    correctedCode: 'def fix(): pass',
    affectedLines: [1],
    confidence: 'high'
  };

  globalThis.fetch = async (url) => {
    if (url.includes('api.openai.com')) {
      openAiAttempts++;
      return {
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'You exceeded your current quota, please check your plan and billing details.',
            code: 'insufficient_quota'
          }
        })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }]
      })
    };
  };

  try {
    const ai = new AiService({
      provider: 'openai',
      fallbackProvider: 'gemini',
      openaiApiKey: 'TEST_OPENAI_KEY',
      geminiApiKey: 'TEST_GEMINI_KEY',
      maxRetries: 3, // Even with maxRetries 3, quota error must not loop
      retryBaseMs: 5
    });

    const result = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'z = 3'
    });

    // OpenAI should fail fast on attempt 1 without retrying quota 3 times
    assert.equal(openAiAttempts, 1, 'Quota exhaustion must fail fast without wasting retries');
    assert.equal(result.provider, 'gemini');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 5. Permanent 401/403 authentication failures fail fast without retries or fallback', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = async () => {
    fetchCount++;
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key provided' } })
    };
  };

  try {
    const ai = new AiService({
      provider: 'openai',
      fallbackProvider: 'gemini',
      openaiApiKey: 'INVALID_OPENAI_KEY',
      geminiApiKey: 'VALID_GEMINI_KEY',
      maxRetries: 2,
      retryBaseMs: 5
    });

    await assert.rejects(
      async () => {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: 'a = 1'
        });
      },
      /authentication failed \(HTTP 401\)/
    );

    // Must not retry on invalid key
    assert.equal(fetchCount, 1, 'Auth failure must fail fast on 1 attempt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 6. Never silently substitute mock when both live providers fail', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: 'Internal Server Error' } })
  });

  try {
    const ai = new AiService({
      provider: 'gemini',
      fallbackProvider: 'openai',
      geminiApiKey: 'TEST_GEMINI_KEY',
      openaiApiKey: 'TEST_OPENAI_KEY',
      maxRetries: 1,
      retryBaseMs: 5
    });

    await assert.rejects(
      async () => {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: 'def binary_search(arr, target): pass'
        });
      },
      (err) => {
        // Must throw clear failure and NOT return mock diagnosis
        assert.ok(err.message.includes('AI Provider pipeline failure'));
        assert.ok(err.message.includes('Primary (GEMINI) failed'));
        assert.ok(err.message.includes('Fallback (OPENAI) also failed'));
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 7. Transient 429 recovers on retry with exponential backoff before fallback', async () => {
  const originalFetch = globalThis.fetch;
  let attempt = 0;

  const geminiPayload = {
    diagnosis: 'Recovered after transient rate limit',
    rootCause: 'Fixed error',
    correctedCode: 'def fix(): pass',
    affectedLines: [1],
    confidence: 'high'
  };

  globalThis.fetch = async () => {
    attempt++;
    if (attempt < 3) {
      // Fail first 2 attempts with 429
      return {
        ok: false,
        status: 429,
        headers: { get: () => '0' },
        json: async () => ({ error: { message: 'Rate limit' } })
      };
    }
    // Attempt 3 succeeds
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }]
      })
    };
  };

  try {
    const ai = new AiService({
      provider: 'gemini',
      geminiApiKey: 'TEST_GEMINI_KEY',
      maxRetries: 2,
      retryBaseMs: 5
    });

    const result = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'b = 2'
    });

    assert.equal(attempt, 3);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.diagnosis, 'Recovered after transient rate limit');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 8. Secret sanitization prevents leaking API keys in composite errors', async () => {
  const originalFetch = globalThis.fetch;
  const secretGeminiKey = 'AIzaSy_SUPER_SECRET_GEMINI_KEY_XYZ123';
  const secretOpenAiKey = 'sk-proj_SUPER_SECRET_OPENAI_KEY_ABC789';

  globalThis.fetch = async (url, opts) => {
    // Simulate network error that echoes back the secret key
    throw new Error(`Failed request for ${secretGeminiKey} with auth ${opts?.headers?.Authorization || opts?.headers?.['x-goog-api-key']}`);
  };

  try {
    const ai = new AiService({
      provider: 'gemini',
      fallbackProvider: 'openai',
      geminiApiKey: secretGeminiKey,
      openaiApiKey: secretOpenAiKey,
      maxRetries: 1,
      retryBaseMs: 5
    });

    await assert.rejects(
      async () => {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: 'c = 3'
        });
      },
      (err) => {
        assert.equal(err.message.includes(secretGeminiKey), false, 'Must not leak secret Gemini key');
        assert.equal(err.message.includes(secretOpenAiKey), false, 'Must not leak secret OpenAI key');
        assert.ok(err.message.includes('[REDACTED_GEMINI_KEY]'), 'Should redact Gemini key');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Multi-Provider Fallback - 9. Validates schema and line bounds on fallback responses', async () => {
  const originalFetch = globalThis.fetch;

  // Fallback response with invalid line numbers (e.g. line 999 for 2-line file)
  const openAiMalformedLinesPayload = {
    diagnosis: 'Fallback fix with out of bounds lines',
    rootCause: 'Out of bounds',
    correctedCode: 'x = 10\ny = 20',
    affectedLines: [999], // Out of range for a 2-line file
    confidence: 'high'
  };

  globalThis.fetch = async (url) => {
    if (url.includes('googleapis.com')) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Gemini down' } })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(openAiMalformedLinesPayload) } }]
      })
    };
  };

  try {
    const ai = new AiService({
      provider: 'gemini',
      fallbackProvider: 'openai',
      geminiApiKey: 'TEST_GEMINI_KEY',
      openaiApiKey: 'TEST_OPENAI_KEY',
      maxRetries: 1,
      retryBaseMs: 5
    });

    const result = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'x = 10\ny = 20' // 2 lines
    });

    // Fallback response passed through strict schema normalization
    assert.equal(result.provider, 'openai');
    assert.deepEqual(result.affectedLines, [], 'Out-of-bounds line 999 must be stripped from affectedLines');
    assert.equal(result.lineDiagnoses[0].isUncertain, true, 'Out of bounds line must be marked uncertain');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
