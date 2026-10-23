import { config } from '../../config.js';

/**
 * Remote Executor Client:
 * Communicates with the dedicated, isolated Sandbox Executor Service via internal HTTP.
 *
 * Security properties:
 * - Public gateway does NOT mount /var/run/docker.sock.
 * - Public gateway does NOT require Docker CLI.
 * - Authenticates requests via internal shared secret (X-Executor-Secret).
 * - Sends only high-level, domain-specific execution parameters (language, code, testCode, stdin, timeout).
 * - Never sends arbitrary container options, host paths, or shell commands.
 */
export class RemoteExecutorClient {
  constructor(options = {}) {
    this.executorUrl = (options.executorUrl || process.env.SANDBOX_EXECUTOR_URL || config.SANDBOX_EXECUTOR_URL || '').replace(/\/+$/, '');
    this.executorSecret = options.executorSecret || process.env.SANDBOX_EXECUTOR_SECRET || config.SANDBOX_EXECUTOR_SECRET || '';
    this.defaultTimeoutMs = options.timeoutMs || config.SANDBOX_EXECUTOR_TIMEOUT_MS || 20000;
    this.id = 'remote_executor';
    this.name = 'Remote Sandbox Executor Client';
    this._cachedReadiness = null;
    this._cacheTimestamp = 0;
    this._cacheTtlMs = 5000;
  }

  /**
   * Clears readiness cache (useful in tests).
   */
  clearCache() {
    this._cachedReadiness = null;
    this._cacheTimestamp = 0;
  }

  /**
   * Reports security capabilities of the remote executor architecture.
   */
  getCapabilities() {
    return {
      isolated: true,
      isolationType: 'isolated_sandbox_service',
      containerized: true,
      runtime: 'remote_docker_executor',
      gatewayDockerSocketAccess: false,
      networkRestricted: true,
      networkMode: 'none',
      filesystemRestricted: 'read_only_root_with_ram_tmpfs',
      user: '10001:10001 (non-root)',
      description: 'Execution is delegated to a dedicated, authenticated sandbox executor service. The gateway container has ZERO Docker socket access.'
    };
  }

  /**
   * Fast synchronous availability check based on configuration and cache.
   */
  isAvailable() {
    if (!this.executorUrl) {
      return false;
    }
    if (this._cachedReadiness && (Date.now() - this._cacheTimestamp < this._cacheTtlMs)) {
      return this._cachedReadiness.ready;
    }
    return true;
  }

  /**
   * Checks health and readiness of the remote executor service.
   */
  async checkReadiness() {
    if (!this.executorUrl) {
      return {
        ready: false,
        daemonRunning: false,
        imagePresent: false,
        reason: 'EXECUTOR_NOT_CONFIGURED',
        message: 'SANDBOX_EXECUTOR_URL is not configured.'
      };
    }

    if (this._cachedReadiness && (Date.now() - this._cacheTimestamp < this._cacheTtlMs)) {
      return this._cachedReadiness;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(`${this.executorUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const outcome = {
          ready: true,
          daemonRunning: true,
          imagePresent: true,
          executorStatus: data.status || 'ok'
        };
        this._cachedReadiness = outcome;
        this._cacheTimestamp = Date.now();
        return outcome;
      }

      const outcome = {
        ready: false,
        daemonRunning: false,
        imagePresent: false,
        reason: 'EXECUTOR_UNHEALTHY',
        message: `Remote sandbox executor returned HTTP status ${res.status}.`
      };
      this._cachedReadiness = outcome;
      this._cacheTimestamp = Date.now();
      return outcome;
    } catch (err) {
      clearTimeout(timeout);
      const outcome = {
        ready: false,
        daemonRunning: false,
        imagePresent: false,
        reason: 'EXECUTOR_UNAVAILABLE',
        message: `Failed to connect to sandbox executor at ${this.executorUrl}: ${err.message}`
      };
      this._cachedReadiness = outcome;
      this._cacheTimestamp = Date.now();
      return outcome;
    }
  }

  /**
   * Sends a strictly validated execution request to the remote executor service.
   *
   * @param {Object} options
   * @param {string} options.language - Programming language ID
   * @param {string} options.code - Source code string
   * @param {string} [options.testCode] - Optional test code string
   * @param {string} [options.stdinInput] - Optional stdin string
   * @param {number} [options.timeoutMs] - Execution timeout in ms
   * @returns {Promise<Object>} Execution result matching SandboxService schema
   */
  async execute({ language, code, testCode = '', stdinInput = '', timeoutMs = 5000 }) {
    if (!this.executorUrl) {
      return {
        status: 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: 'Sandbox executor URL is not configured. Direct Docker socket access is disabled on this gateway.',
        durationMs: 0,
        errorType: 'EXECUTOR_NOT_CONFIGURED',
        isolationType: 'isolated_sandbox_service'
      };
    }

    const effectiveTimeout = timeoutMs || 5000;
    const requestTimeout = Math.min(effectiveTimeout + 8000, 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      if (this.executorSecret) {
        headers['X-Executor-Secret'] = this.executorSecret;
      }

      const bodyPayload = JSON.stringify({
        language,
        code,
        testCode,
        stdinInput,
        timeoutMs: effectiveTimeout
      });

      const res = await fetch(`${this.executorUrl}/execute`, {
        method: 'POST',
        headers,
        body: bodyPayload,
        signal: controller.signal
      });

      clearTimeout(timer);

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          return {
            status: 'infrastructure_error',
            success: false,
            exitCode: -1,
            stdout: '',
            stderr: 'Authentication failed between gateway and sandbox executor service (invalid X-Executor-Secret).',
            durationMs: 0,
            errorType: 'EXECUTOR_AUTH_ERROR',
            isolationType: 'isolated_sandbox_service'
          };
        }

        if (res.status === 400) {
          return {
            status: data?.status || 'compilation_error',
            success: false,
            exitCode: data?.exitCode ?? 1,
            stdout: data?.stdout || '',
            stderr: data?.message || data?.stderr || 'Invalid execution request rejected by sandbox executor.',
            durationMs: 0,
            errorType: data?.error || 'INVALID_EXECUTION_REQUEST',
            isolationType: 'isolated_sandbox_service'
          };
        }

        return {
          status: 'infrastructure_error',
          success: false,
          exitCode: -1,
          stdout: '',
          stderr: data?.message || `Sandbox executor responded with HTTP error ${res.status}`,
          durationMs: 0,
          errorType: 'EXECUTOR_ERROR',
          isolationType: 'isolated_sandbox_service'
        };
      }

      if (!data) {
        return {
          status: 'infrastructure_error',
          success: false,
          exitCode: -1,
          stdout: '',
          stderr: 'Empty response payload received from sandbox executor.',
          durationMs: 0,
          errorType: 'EXECUTOR_INVALID_RESPONSE',
          isolationType: 'isolated_sandbox_service'
        };
      }

      // Tag with isolated executor metadata
      data.isolationType = 'isolated_sandbox_service';
      return data;
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError';

      return {
        status: isTimeout ? 'timeout' : 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: isTimeout
          ? `Execution request to sandbox executor timed out after ${requestTimeout}ms.`
          : `Failed to connect to sandbox executor service at ${this.executorUrl}: ${err.message}`,
        durationMs: 0,
        errorType: isTimeout ? 'TIMEOUT' : 'EXECUTOR_UNAVAILABLE',
        isolationType: 'isolated_sandbox_service'
      };
    }
  }
}
