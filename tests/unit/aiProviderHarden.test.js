import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiService } from '../../src/services/aiService.js';
import { AiRepairService } from '../../src/services/aiRepairService.js';
import { SandboxService } from '../../src/services/sandboxService.js';

describe('AI Provider Hardening & Security Isolation Suite', () => {
  it('Rejects Gemini requests when GEMINI_API_KEY is not set with clear error', async () => {
    const ai = new AiService({ provider: 'gemini', geminiApiKey: '' });
    await assert.rejects(
      async () => {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: 'print("test")'
        });
      },
      /GEMINI_API_KEY is not set/
    );
  });

  it('Rejects OpenAI requests when OPENAI_API_KEY is not set with clear error', async () => {
    const ai = new AiService({ provider: 'openai', openaiApiKey: '' });
    await assert.rejects(
      async () => {
        await ai.diagnoseAndFix({
          language: 'python',
          sourceCode: 'print("test")'
        });
      },
      /OPENAI_API_KEY is not set/
    );
  });

  it('Mock mode explicitly identifies provider as mock', async () => {
    const ai = new AiService({ provider: 'mock' });
    const res = await ai.diagnoseAndFix({
      language: 'python',
      sourceCode: 'def add(a, b): return a + b\nprint(add(2, 3))'
    });
    assert.ok(res.provider && res.provider.startsWith('mock'));
  });

  it('AiRepairService preserves and propagates provider identifier', async () => {
    const ai = new AiService({ provider: 'mock' });
    const sandbox = new SandboxService(2000, 32768);
    const repair = new AiRepairService({ aiService: ai, sandboxService: sandbox });

    const outcome = await repair.repairAndVerify({
      language: 'python',
      sourceCode: 'def add(a, b): return a + b\nprint(add(2, 3))'
    });

    assert.ok(outcome.provider && outcome.provider.startsWith('mock'));
    assert.ok(outcome.executionDurationMs > 0);
  });

  it('Sanitizes rate limit and network errors without exposing secrets', async () => {
    const ai = new AiService({ provider: 'gemini', geminiApiKey: 'DUMMY_SECRET_KEY_12345' });

    // Mock fetch that simulates 429 rate limit
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded'
    });

    try {
      await assert.rejects(
        async () => {
          await ai.diagnoseAndFix({
            language: 'python',
            sourceCode: 'print(1)'
          });
        },
        (err) => {
          assert.ok(err.message.includes('rate limit exceeded'));
          assert.equal(err.message.includes('DUMMY_SECRET_KEY_12345'), false, 'Never leak API keys in error messages!');
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
