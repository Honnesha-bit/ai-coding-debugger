import { config } from '../../config.js';
import { HostSandboxRunner } from './hostSandboxRunner.js';
import { ContainerSandboxRunner } from './containerSandboxRunner.js';

/**
 * Sandbox Manager:
 * Manages available execution backends (Container vs Host process),
 * inspects runtime availability, and enforces isolation policy.
 *
 * Policy:
 * - 'container': STRICT isolation mode. Requires Docker/Podman engine daemon AND sandbox image.
 *                Fails closed with 'EXECUTION_UNAVAILABLE' if runtime or image is missing.
 * - 'auto': Strict container mode. Fails closed without falling back to host execution.
 * - 'safe_verification': Refuses dynamic execution; generates test cases and performs static analysis.
 * - 'host': Internal unit-test harness fixture runner ONLY. Permitted strictly when allowHostFixture=true
 *           in non-production environments. Never allowed for user submissions.
 */
export class SandboxManager {
  constructor(options = {}) {
    const isProduction = (options.nodeEnv || config.NODE_ENV) === 'production';
    const requestedMode = options.mode || config.SANDBOX_MODE || 'container';
    let mode = requestedMode;

    // In production or auto mode, enforce strict container mode
    if (isProduction || mode === 'auto') {
      mode = 'container';
    }

    this.isProduction = isProduction;
    this.requestedMode = requestedMode;
    this.allowHostFixture = options.allowHostFixture === true && !isProduction;
    this.mode = mode;
    this.hostRunner = options.hostRunner || new HostSandboxRunner();
    this.containerRunner = options.containerRunner || new ContainerSandboxRunner();
  }

  /**
   * Returns the active runner according to the configured mode, environment, and runtime availability.
   * Host runner is only accessible to explicitly authorized internal test fixtures.
   */
  getActiveRunner() {
    if (this.mode === 'host' && this.allowHostFixture && !this.isProduction) {
      return this.hostRunner;
    }
    return this.containerRunner;
  }

  /**
   * Reports complete sandbox status and capability metadata.
   */
  getStatus() {
    const activeRunner = this.getActiveRunner();
    const readiness = typeof this.containerRunner.checkReadiness === 'function'
      ? this.containerRunner.checkReadiness()
      : {
          ready: this.containerRunner.isAvailable(),
          daemonRunning: this.containerRunner.isAvailable(),
          imagePresent: true
        };
    const isContainerAvailable = readiness.daemonRunning;
    const containerRuntime = this.containerRunner.getBinaryName();

    let isolationType = activeRunner.getCapabilities().isolationType;
    if (this.mode === 'safe_verification' || !readiness.ready) {
      isolationType = readiness.ready ? 'docker_container' : 'container_unavailable';
    }

    return {
      mode: this.mode,
      activeRunnerId: activeRunner.id,
      activeRunnerName: activeRunner.name,
      isContainerAvailable,
      containerRuntime,
      isIsolated: readiness.ready,
      isolationType,
      capabilities: activeRunner.getCapabilities(),
      strictContainerRequired: true,
      isSafeVerification: this.mode === 'safe_verification',
      isProduction: this.isProduction
    };
  }

  /**
   * Determines if execution can proceed or if container isolation is required but missing.
   * Never permits arbitrary user code execution on the host OS.
   */
  isExecutionAllowed() {
    // 1. Safe verification mode
    if (this.mode === 'safe_verification' || this.requestedMode === 'safe_verification') {
      return {
        allowed: false,
        reason: 'EXECUTION_UNAVAILABLE',
        message: 'Host process execution is disabled in safe verification mode to protect system integrity. Container runtime is required for dynamic execution.'
      };
    }

    // 2. Host mode (Restricted strictly to internal test fixtures)
    if (this.requestedMode === 'host' || this.mode === 'host') {
      if (!this.allowHostFixture || this.isProduction) {
        return {
          allowed: false,
          reason: 'STRICT_CONTAINER_ISOLATION_REQUIRED',
          message: 'Direct host execution of untrusted user submissions is strictly prohibited. Container isolation is required.'
        };
      }
      return {
        allowed: true,
        runner: this.hostRunner
      };
    }

    // 3. Container mode (includes 'auto' which maps to container)
    const readiness = typeof this.containerRunner.checkReadiness === 'function'
      ? this.containerRunner.checkReadiness()
      : {
          ready: this.containerRunner.isAvailable() && (typeof this.containerRunner.hasImage !== 'function' || this.containerRunner.hasImage()),
          daemonRunning: this.containerRunner.isAvailable(),
          imagePresent: typeof this.containerRunner.hasImage === 'function' ? this.containerRunner.hasImage() : true
        };

    if (!readiness.ready) {
      let reason = readiness.reason || 'CONTAINER_RUNTIME_UNAVAILABLE';
      let message = readiness.message;

      if (!readiness.daemonRunning) {
        reason = 'CONTAINER_RUNTIME_UNAVAILABLE';
        message = this.isProduction
          ? 'Strict container isolation is required in production (NODE_ENV=production), but container runtime (Docker/Podman) is not installed or functional on this host.'
          : 'Strict container isolation is required (SANDBOX_MODE=container). Container runtime (Docker/Podman) is not running or functional on this host. Install Docker Desktop or Podman to enable isolated execution.';
      }

      return {
        allowed: false,
        reason,
        message
      };
    }

    return {
      allowed: true,
      runner: this.containerRunner
    };
  }
}
