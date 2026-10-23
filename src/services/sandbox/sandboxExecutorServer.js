import express from 'express';
import crypto from 'node:crypto';
import { SandboxService } from '../sandboxService.js';
import { ContainerSandboxRunner } from './containerSandboxRunner.js';
import { SandboxManager } from './sandboxManager.js';
import { config } from '../../config.js';

// Strict allowlist of permissible languages
export const ALLOWED_LANGUAGES = Object.freeze([
  'python',
  'javascript',
  'typescript',
  'java',
  'c',
  'cpp',
  'sql'
]);

// Maximum limits for security bounds
export const MAX_CODE_BYTES = 65536; // 64 KB
export const MAX_TIMEOUT_MS = 15000; // 15 seconds
export const MIN_TIMEOUT_MS = 100;

/**
 * Constant-time comparison to prevent timing side-channel attacks on secret tokens.
 */
function timingSafeTokenCompare(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  const bufProvided = Buffer.from(provided);
  const bufExpected = Buffer.from(expected);
  if (bufProvided.length !== bufExpected.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

/**
 * Creates the isolated Sandbox Executor Express application.
 *
 * @param {Object} [options]
 * @param {string} [options.secret] - Internal shared secret for authentication
 * @param {SandboxService} [options.sandboxService] - Injected SandboxService instance
 * @param {ContainerSandboxRunner} [options.containerRunner] - Injected ContainerSandboxRunner
 * @returns {express.Application}
 */
export function createSandboxExecutorApp(options = {}) {
  const app = express();
  const executorSecret = options.secret !== undefined ? options.secret : (config.SANDBOX_EXECUTOR_SECRET || '');

  // Default to local ContainerSandboxRunner for actual container execution on the host Docker daemon
  const containerRunner = options.containerRunner || new ContainerSandboxRunner();
  const manager = options.sandboxManager || new SandboxManager({
    mode: 'container',
    containerRunner
  });
  const sandboxService = options.sandboxService || new SandboxService(
    config.SANDBOX_TIMEOUT_MS,
    config.MAX_OUTPUT_BYTES,
    manager
  );

  // Disable express header
  app.disable('x-powered-by');

  // Parse JSON payloads with strict size limit (128KB max)
  app.use(express.json({ limit: '128kb' }));

  // 1. Unauthenticated Health Check (used by Docker healthcheck)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'ai-coding-debugger-sandbox-executor',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 2. Authentication Middleware for protected endpoints
  const authenticate = (req, res, next) => {
    // If an executor secret is configured, require and validate it
    if (executorSecret) {
      let providedToken = req.headers['x-executor-secret'];

      // Support Bearer auth header as fallback
      if (!providedToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
          providedToken = parts[1];
        }
      }

      if (!providedToken || !timingSafeTokenCompare(providedToken, executorSecret)) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Missing or invalid executor authentication credentials.'
        });
      }
    }
    next();
  };

  // 3. Status and Capabilities Endpoint
  app.get('/status', authenticate, (req, res) => {
    const status = sandboxService.getStatus();
    res.json({
      success: true,
      service: 'ai-coding-debugger-sandbox-executor',
      ...status
    });
  });

  // 4. Stale Container Pruning Endpoint
  app.post('/cleanup', authenticate, (req, res) => {
    try {
      const cleanupResult = containerRunner.cleanupStaleContainers();
      res.json({
        success: true,
        cleaned: cleanupResult.cleaned,
        errors: cleanupResult.errors
      });
    } catch (err) {
      res.status(500).json({
        error: 'CLEANUP_FAILED',
        message: err.message
      });
    }
  });

  // 5. Protected, Strictly-Validated Execution Endpoint
  app.post('/execute', authenticate, async (req, res) => {
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Request body must be a JSON object.'
      });
    }

    // STRICT ATTRIBUTE ALLOWLIST: Reject ANY unexpected or arbitrary fields!
    // Never accept arbitrary Docker options, host paths, privileged flags, or shell commands from callers.
    const allowedKeys = new Set(['language', 'code', 'testCode', 'stdinInput', 'timeoutMs']);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return res.status(400).json({
          error: 'FORBIDDEN_PARAMETER',
          message: `Arbitrary parameter '${key}' is forbidden. The sandbox executor only accepts language, code, testCode, stdinInput, and timeoutMs.`
        });
      }
    }

    // Language Validation: Strict allowlist
    const { language, code, testCode = '', stdinInput = '', timeoutMs = 5000 } = body;

    if (!language || typeof language !== 'string') {
      return res.status(400).json({
        error: 'INVALID_LANGUAGE',
        message: 'The language field must be a non-empty string.'
      });
    }

    const normalizedLang = language.trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.includes(normalizedLang)) {
      return res.status(400).json({
        error: 'UNSUPPORTED_LANGUAGE',
        message: `Language '${language}' is not permitted. Permitted languages: ${ALLOWED_LANGUAGES.join(', ')}.`
      });
    }

    // Code Validation: Must be string, non-empty, within size bounds
    if (typeof code !== 'string') {
      return res.status(400).json({
        error: 'INVALID_CODE',
        message: 'The code field must be a string.'
      });
    }

    if (code.length === 0) {
      return res.status(400).json({
        error: 'EMPTY_CODE',
        message: 'Source code cannot be empty.'
      });
    }

    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
      return res.status(400).json({
        error: 'CODE_EXCEEDS_MAX_SIZE',
        message: `Source code exceeds maximum allowed size of ${MAX_CODE_BYTES} bytes.`
      });
    }

    // Test code and stdin validations
    if (testCode && (typeof testCode !== 'string' || Buffer.byteLength(testCode, 'utf8') > MAX_CODE_BYTES)) {
      return res.status(400).json({
        error: 'INVALID_TEST_CODE',
        message: 'Test code must be a string within acceptable byte bounds.'
      });
    }

    if (stdinInput && (typeof stdinInput !== 'string' || Buffer.byteLength(stdinInput, 'utf8') > MAX_CODE_BYTES)) {
      return res.status(400).json({
        error: 'INVALID_STDIN',
        message: 'Standard input must be a string within acceptable byte bounds.'
      });
    }

    // Timeout Bounds Validation
    let effectiveTimeout = 5000;
    if (timeoutMs !== undefined && timeoutMs !== null) {
      const parsedTimeout = Number(timeoutMs);
      if (!Number.isFinite(parsedTimeout) || parsedTimeout < MIN_TIMEOUT_MS) {
        return res.status(400).json({
          error: 'INVALID_TIMEOUT',
          message: `timeoutMs must be a number greater than or equal to ${MIN_TIMEOUT_MS}ms.`
        });
      }
      // Enforce strict upper bound
      effectiveTimeout = Math.min(Math.floor(parsedTimeout), MAX_TIMEOUT_MS);
    }

    // Execute through SandboxService
    try {
      const result = await sandboxService.execute({
        language: normalizedLang,
        code,
        testCode,
        stdinInput,
        timeoutMs: effectiveTimeout
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        status: 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: `Sandbox executor internal error: ${err.message}`,
        durationMs: 0,
        errorType: 'EXECUTOR_INTERNAL_ERROR'
      });
    }
  });

  // Catch-all for undefined routes
  app.use((req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Unknown endpoint.'
    });
  });

  return app;
}
