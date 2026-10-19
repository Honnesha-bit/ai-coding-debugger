import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService, AiCallBudget } from '../../src/services/aiService.js';
import { AiRepairService } from '../../src/services/aiRepairService.js';

test('AI Call Budget - 1. Basic accounting, properties and exhaustion tracking', () => {
  const budget = new AiCallBudget(3);
  assert.equal(budget.maxCalls, 3);
  assert.equal(budget.callsMade, 0);
  assert.equal(budget.remainingCalls, 3);
  assert.equal(budget.isExhausted, false);
  assert.equal(budget.canConsume(), true);

  assert.equal(budget.consume('gemini'), true);
  assert.equal(budget.callsMade, 1);
  assert.equal(budget.remainingCalls, 2);
  assert.equal(budget.isExhausted, false);

  assert.equal(budget.consume('gemini'), true);
  assert.equal(budget.callsMade, 2);
  assert.equal(budget.remainingCalls, 1);
  assert.equal(budget.isExhausted, false);

  assert.equal(budget.consume('openai'), true);
  assert.equal(budget.callsMade, 3);
  assert.equal(budget.remainingCalls, 0);
  assert.equal(budget.isExhausted, true);
  assert.equal(budget.canConsume(), false);

  // 4th call must be rejected
  assert.equal(budget.consume('openai'), false);
  assert.equal(budget.callsMade, 3);
  assert.equal(budget.remainingCalls, 0);
  assert.equal(budget.isExhausted, true);

  // Verify recorded invocation history
  assert.equal(budget.invocations.length, 3);
  assert.equal(budget.invocations[0].provider, 'gemini');
  assert.equal(budget.invocations[0].callIndex, 1);
  assert.equal(budget.invocations[1].provider, 'gemini');
  assert.equal(budget.invocations[1].callIndex, 2);
  assert.equal(budget.invocations[2].provider, 'openai');
  assert.equal(budget.invocations[2].callIndex, 3);
});

test('AI Call Budget - 2. Handles invalid constructor bounds safely', () => {
  const budgetZero = new AiCallBudget(0);
  assert.equal(budgetZero.maxCalls, 3, 'Zero maxCalls should fallback safely to 3');

  const budgetNeg = new AiCallBudget(-5);
  assert.equal(budgetNeg.maxCalls, 3, 'Negative maxCalls should fallback safely to 3');

  const budgetNan = new AiCallBudget('invalid');
  assert.equal(budgetNan.maxCalls, 3, 'NaN maxCalls should fallback safely to 3');
});

test('AI Call Budget - 3. Successful call on attempt 1 makes only 1 call and leaves remainder in budget', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  const geminiPayload = {
    diagnosis: 'Simple syntax fix',
    rootCause: 'Missing colon',
    correctedCode: 'def fix(): pass',
    affectedLines: [1],
    confidence: 'high'
  };

  globalThis.fetch = async () => {
    fetchCount++;
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
      geminiApiKey: 'TEST_KEY',
      maxCallsPerRequest: 3,
      retryBaseMs: 5
    });

    const budget = new AiCallBudget(3);
    const result = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'def fix()\n    pass',
      budget
    });

    assert.equal(fetchCount, 1, 'Only exactly 1 fetch invocation should occur on success');
    assert.equal(budget.callsMade, 1);
    assert.equal(budget.remainingCalls, 2);
    assert.equal(budget.isExhausted, false);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.aiCallsMade, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI Call Budget - 4. Hard cap stops retries + fallback at exactly 3 total provider calls', async () => {
  const originalFetch = globalThis.fetch;
  let geminiCalls = 0;
  let openAiCalls = 0;

  // Primary Gemini fails with transient 429 rate limit
  // Fallback OpenAI fails with transient 500 server error
  globalThis.fetch = async (url) => {
    if (url.includes('googleapis.com')) {
      geminiCalls++;
      return {
        ok: false,
        status: 429,
        headers: { get: () => '0' },
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      };
    }
    if (url.includes('api.openai.com')) {
      openAiCalls++;
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'OpenAI internal error' } })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const budget = new AiCallBudget(3);
    const ai = new AiService({
      provider: 'gemini',
      fallbackProvider: 'openai',
      geminiApiKey: 'TEST_GEMINI_KEY',
      openaiApiKey: 'TEST_OPENAI_KEY',
      maxRetries: 2, // Would ordinarily allow up to 3 Gemini + 3 OpenAI = 6 calls
      retryBaseMs: 5
    });

    await assert.rejects(
      async () => {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: 'x = 1',
          budget
        });
      },
      (err) => {
        assert.ok(err.message.includes('Primary (GEMINI) failed'));
        return true;
      }
    );

    // Assert that total provider calls across primary + fallback stopped at exactly 3!
    const totalCalls = geminiCalls + openAiCalls;
    assert.equal(totalCalls, 3, `Expected exactly 3 total provider calls, got ${totalCalls} (Gemini: ${geminiCalls}, OpenAI: ${openAiCalls})`);
    assert.equal(budget.callsMade, 3);
    assert.equal(budget.isExhausted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI Call Budget - 5. Non-retryable error (401 auth error) fails fast on 1 call without wasting budget', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = async () => {
    fetchCount++;
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API Key' } })
    };
  };

  try {
    const budget = new AiCallBudget(3);
    const ai = new AiService({
      provider: 'openai',
      fallbackProvider: 'gemini',
      openaiApiKey: 'INVALID_KEY',
      geminiApiKey: 'VALID_KEY',
      maxRetries: 3,
      retryBaseMs: 5
    });

    await assert.rejects(
      async () => {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: 'print("hello")',
          budget
        });
      },
      /authentication failed \(HTTP 401\)/
    );

    assert.equal(fetchCount, 1, 'Non-retryable 401 must fail immediately on 1 attempt');
    assert.equal(budget.callsMade, 1);
    assert.equal(budget.remainingCalls, 2);
    assert.equal(budget.isExhausted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI Call Budget - 6. Mock provider honors call budget and blocks 4th call', async () => {
  const ai = new AiService({ provider: 'mock' });
  const budget = new AiCallBudget(3);

  const sample = {
    language: 'python',
    sourceCode: 'def binary_search(arr, target):\n    low = 0\n    high = len(arr)\n    while low <= high:\n        pass',
    budget
  };

  // Calls 1, 2, 3 should succeed
  const res1 = await ai.diagnoseAndFix(sample);
  assert.equal(res1.provider, 'mock-analyzer');
  assert.equal(budget.callsMade, 1);

  const res2 = await ai.diagnoseAndFix(sample);
  assert.equal(budget.callsMade, 2);

  const res3 = await ai.diagnoseAndFix(sample);
  assert.equal(budget.callsMade, 3);
  assert.equal(budget.isExhausted, true);

  // Call 4 must fail with budget exhausted error
  await assert.rejects(
    async () => {
      await ai.diagnoseAndFix(sample);
    },
    /AI call budget exhausted/
  );
  assert.equal(budget.callsMade, 3);
});

test('AI Call Budget - 7. Multi-iteration repair loop stops after budget is exhausted even if maxRetries allows more', async () => {
  let aiCalls = 0;

  // Mock AI service that returns code that fails sandbox verification
  const fakeAiService = {
    provider: 'test-ai',
    maxCallsPerRequest: 3,
    diagnoseAndFix: async ({ budget }) => {
      aiCalls++;
      if (budget) {
        if (!budget.consume('test-ai')) {
          throw new Error('AI call budget exhausted');
        }
      }
      return {
        diagnosis: `Diagnosis attempt ${aiCalls}`,
        rootCause: 'Intentional sandbox failure',
        correctedCode: `print("still failing ${aiCalls}")`,
        confidence: 'medium',
        affectedLines: [1]
      };
    }
  };

  // Mock sandbox that always fails the run
  const fakeSandboxService = {
    execute: async () => ({
      status: 'assertion_failure',
      stdout: '',
      stderr: 'AssertionError: test failed',
      exitCode: 1
    })
  };

  const budget = new AiCallBudget(3);
  const repair = new AiRepairService({
    aiService: fakeAiService,
    sandboxService: fakeSandboxService
  });

  // Request maxRetries = 5, which would ordinarily allow 6 attempts
  const outcome = await repair.repairAndVerify({
    language: 'python',
    sourceCode: 'print("initial")',
    maxRetries: 5,
    budget
  });

  // Repair loop must stop after 3 attempts because the budget is 3!
  assert.equal(aiCalls, 3, `Expected exactly 3 AI calls, got ${aiCalls}`);
  assert.equal(budget.callsMade, 3);
  assert.equal(budget.isExhausted, true);
  assert.equal(outcome.attempts.length, 3, `Expected 3 attempts recorded, got ${outcome.attempts.length}`);
  assert.equal(outcome.verified, false);
  assert.equal(outcome.aiCallsMade, 3);
});

test('AI Call Budget - 8. Shared budget across internal retries within repair loop iterations', async () => {
  let totalCalls = 0;
  let iteration = 0;

  // Fake AI service:
  // Iteration 1 takes 2 calls (1 transient failure + 1 retry success)
  // Iteration 2 takes 1 call (success)
  // Total calls = 3. Iteration 3 must be blocked!
  const fakeAiService = {
    provider: 'test-ai',
    maxCallsPerRequest: 3,
    diagnoseAndFix: async ({ budget }) => {
      iteration++;
      if (iteration === 1) {
        // First iteration consumes 2 calls
        if (!budget.consume('test-ai')) throw new Error('Budget exceeded');
        totalCalls++;
        if (!budget.consume('test-ai')) throw new Error('Budget exceeded');
        totalCalls++;
      } else {
        // Subsequent iterations consume 1 call
        if (!budget.consume('test-ai')) throw new Error('Budget exceeded');
        totalCalls++;
      }
      return {
        diagnosis: `Diagnosis iter ${iteration}`,
        rootCause: 'Root cause',
        correctedCode: `def fix_${iteration}(): pass`,
        confidence: 'high',
        affectedLines: [1]
      };
    }
  };

  const fakeSandboxService = {
    execute: async () => ({
      status: 'assertion_failure',
      stdout: '',
      stderr: 'Test failed',
      exitCode: 1
    })
  };

  const budget = new AiCallBudget(3);
  const repair = new AiRepairService({
    aiService: fakeAiService,
    sandboxService: fakeSandboxService
  });

  const outcome = await repair.repairAndVerify({
    language: 'python',
    sourceCode: 'x = 0',
    maxRetries: 4,
    budget
  });

  // Iteration 1 used 2 calls. Iteration 2 used 1 call. Total = 3 calls.
  // Before iteration 3, budget.isExhausted is true, so loop breaks!
  assert.equal(totalCalls, 3);
  assert.equal(budget.callsMade, 3);
  assert.equal(budget.isExhausted, true);
  assert.equal(outcome.attempts.length, 2, 'Should stop after 2 iterations because 3 calls were used');
});

test('AI Call Budget - 9. Concurrent requests maintain independent isolated budgets without cross-talk', async () => {
  const originalFetch = globalThis.fetch;
  const requestsCount = 5;
  const plans = [
    { targetCalls: 1, shouldSucceed: true },
    { targetCalls: 2, shouldSucceed: true },
    { targetCalls: 3, shouldSucceed: true },
    { targetCalls: 1, shouldSucceed: true },
    { targetCalls: 2, shouldSucceed: true }
  ];

  const payload = {
    diagnosis: 'Concurrent test fix',
    rootCause: 'Async race protection',
    correctedCode: 'x = 1',
    affectedLines: [1],
    confidence: 'high'
  };

  // Mock fetch that simulates asynchronous network latency (10ms)
  globalThis.fetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
      })
    };
  };

  try {
    const ai = new AiService({
      provider: 'gemini',
      geminiApiKey: 'TEST_GEMINI_KEY',
      maxCallsPerRequest: 3,
      retryBaseMs: 5
    });

    // Run 5 requests concurrently, each with its own budget
    const tasks = plans.map(async (plan, index) => {
      const budget = new AiCallBudget(3);
      for (let c = 0; c < plan.targetCalls; c++) {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: `print("request ${index} step ${c}")`,
          budget
        });
      }
      return { index, callsMade: budget.callsMade, remaining: budget.remainingCalls };
    });

    const results = await Promise.all(tasks);

    for (let i = 0; i < requestsCount; i++) {
      const expected = plans[i].targetCalls;
      const actual = results[i].callsMade;
      assert.equal(actual, expected, `Request ${i} expected ${expected} calls, got ${actual}`);
      assert.equal(results[i].remaining, 3 - expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
