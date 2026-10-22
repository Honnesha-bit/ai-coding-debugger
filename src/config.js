import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from .env file if present
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Ignore malformed lines
  }
}

export const config = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SESSION_SECRET: process.env.SESSION_SECRET || 'ai-coding-debugger-secret-key-32-chars-min',
  MAX_GUEST_USES: parseInt(process.env.MAX_GUEST_USES || '2', 10),
  SANDBOX_TIMEOUT_MS: parseInt(process.env.SANDBOX_TIMEOUT_MS || '5000', 10),
  MAX_OUTPUT_BYTES: parseInt(process.env.MAX_OUTPUT_BYTES || '65536', 10),
  AI_PROVIDER: process.env.AI_PROVIDER || 'mock',
  AI_FALLBACK_PROVIDER: process.env.AI_FALLBACK_PROVIDER || 'auto',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'gemini-flash-latest',
  AI_MAX_RETRIES: parseInt(process.env.AI_MAX_RETRIES || '2', 10),
  AI_RETRY_BASE_MS: parseInt(process.env.AI_RETRY_BASE_MS || '500', 10),
  AI_TOTAL_TIMEOUT_MS: parseInt(process.env.AI_TOTAL_TIMEOUT_MS || '15000', 10),
  AI_MAX_CALLS_PER_REQUEST: parseInt(process.env.AI_MAX_CALLS_PER_REQUEST || '3', 10),
  DB_PATH: process.env.DB_PATH || path.join(rootDir, 'data', 'debugger.sqlite'),
  DATASET_PATH: path.join(rootDir, 'data', 'held_out_dataset.json'),
  ROOT_DIR: rootDir,
  TEMP_DIR: process.env.TEMP_DIR || path.join(rootDir, 'temp'),
  HOST_TEMP_DIR: process.env.HOST_TEMP_DIR || '',
  SANDBOX_MODE: process.env.SANDBOX_MODE || 'container', // 'container' (strict fail-closed) | 'safe_verification'
  SANDBOX_IMAGE: process.env.SANDBOX_IMAGE || 'ai-coding-debugger-sandbox:latest',
  SANDBOX_MEMORY_LIMIT: process.env.SANDBOX_MEMORY_LIMIT || '256m',
  SANDBOX_PIDS_LIMIT: parseInt(process.env.SANDBOX_PIDS_LIMIT || '64', 10),
  SANDBOX_CPUS: process.env.SANDBOX_CPUS || '1.0',
  SANDBOX_MAX_CONCURRENT: parseInt(process.env.SANDBOX_MAX_CONCURRENT || '4', 10),
  SANDBOX_QUEUE_TIMEOUT_MS: parseInt(process.env.SANDBOX_QUEUE_TIMEOUT_MS || '10000', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10),
  RATE_LIMIT_DEBUG_MAX: parseInt(process.env.RATE_LIMIT_DEBUG_MAX || '20', 10)
};

export const KNOWN_INSECURE_SECRETS = [
  'ai-coding-debugger-secret-key-32-chars-min',
  'replace_with_a_secure_random_64_character_hex_string_for_production',
  'secret',
  'password',
  '12345678',
  'changeme'
];

/**
 * Validates production environment configuration.
 * Fails safely and immediately if critical secrets are missing, weak, or known template values.
 * Never echoes secret values in error messages.
 */
export function validateProductionConfig(cfg = config) {
  if (cfg.NODE_ENV !== 'production') {
    return { valid: true };
  }

  const secret = cfg.SESSION_SECRET;
  if (!secret || typeof secret !== 'string') {
    throw new Error('FATAL CONFIGURATION ERROR: SESSION_SECRET is required when NODE_ENV=production.');
  }

  const trimmed = secret.trim();
  if (trimmed.length < 32) {
    throw new Error('FATAL CONFIGURATION ERROR: SESSION_SECRET is too weak. Minimum 32 characters required in production.');
  }

  if (KNOWN_INSECURE_SECRETS.includes(trimmed)) {
    throw new Error('FATAL CONFIGURATION ERROR: SESSION_SECRET must not use a known template or default secret in production. Generate a strong random key (e.g. openssl rand -hex 32).');
  }

  return { valid: true };
}
