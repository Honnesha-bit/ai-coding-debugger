import { config } from '../../config.js';
import { HostSandboxRunner } from './hostSandboxRunner.js';
import { ContainerSandboxRunner } from './containerSandboxRunner.js';

/**
 * Sandbox Manager:
 * Manages available execution backends (Container vs Host process),
 * inspects runtime availability, and enforces isolation policy.
 *
 * Policy:
 * - 'container': STRICT isolation mode. Requires Docker/Podman. Fails closed with 'execution_unavailable' if runtime is missing.
 * - 'host': Local development mode. Uses host child processes with shell:false and stripped environment.
 * - 'auto': Prefers container if Docker/Podman is available; otherwise falls back to host with explicit isolation status reporting.
 */
export class SandboxManager {
  constructor(options = {}) {
    const isProduction = (options.nodeEnv || config.NODE_ENV) === 'production';
    let mode = options.mode || config.SANDBOX_MODE;

    // In production, host execution cannot be selected accidentally
    if (isProduction) {
      mode = 'container';
    }

    this.isProduction = isProduction;
    this.mode = mode || 'auto';
    this.hostRunner = options.hostRunner || new HostSandboxRunner();
    this.containerRunner = options.containerRunner || new ContainerSandboxRunner();
  }

  /**
   * Returns the active runner according to the configured mode, environment, and runtime availability.
   * In production, always returns the container runner to prevent accidental host fallback.
   */
  getActiveRunner() {
    if (this.isProduction || this.mode === 'container' || this.mode === 'safe_verification') {
      return this.containerRunner;
    }
    if (this.mode === 'host') {
      return this.hostRunner;
    }
    // 'auto' mode in local development
    if (this.containerRunner.isAvailable()) {
      return this.containerRunner;
    }
    return this.hostRunner;
  }

  /**
   * Reports complete sandbox status and capability metadata.
   */
  getStatus() {
    const activeRunner = this.getActiveRunner();
    const isContainerAvailable = this.containerRunner.isAvailable();
    const containerRuntime = this.containerRunner.getBinaryName();

    let isolationType = activeRunner.getCapabilities().isolationType;
    if (this.mode === 'safe_verification' && !isContainerAvailable) {
      isolationType = 'safe_verification_no_execution';
    }

    return {
      mode: this.mode,
      activeRunnerId: activeRunner.id,
      activeRunnerName: activeRunner.name,
      isContainerAvailable,
      containerRuntime,
      isIsolated: activeRunner.getCapabilities().isolated,
      isolationType,
      capabilities: activeRunner.getCapabilities(),
      strictContainerRequired: this.isProduction || this.mode === 'container' || this.mode === 'safe_verification',
      isSafeVerification: this.mode === 'safe_verification',
      isProduction: this.isProduction
    };
  }

  /**
   * Determines if execution can proceed or if container isolation is required but missing.
   */
  isExecutionAllowed() {
    if (this.mode === 'safe_verification' && !this.containerRunner.isAvailable()) {
      return {
        allowed: false,
        reason: 'EXECUTION_UNAVAILABLE',
        message: 'Secure isolated container runtime (Docker/Podman) is not available on this host. Host process execution is disabled in safe verification mode to protect system integrity.'
      };
    }
    if ((this.isProduction || this.mode === 'container') && !this.containerRunner.isAvailable()) {
      return {
        allowed: false,
        reason: 'STRICT_CONTAINER_ISOLATION_REQUIRED',
        message: this.isProduction
          ? 'Strict container isolation is required in production (NODE_ENV=production), but neither Docker nor Podman is installed or functional on this host.'
          : 'Strict container isolation is required (SANDBOX_MODE=container), but neither Docker nor Podman is installed or functional on this host.'
      };
    }
    return {
      allowed: true,
      runner: this.getActiveRunner()
    };
  }
}
