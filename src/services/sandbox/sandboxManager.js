import { config } from '../../config.js';
import { HostSandboxRunner } from './hostSandboxRunner.js';
import { ContainerSandboxRunner } from './containerSandboxRunner.js';
import { RemoteExecutorClient } from './remoteExecutorClient.js';

/**
 * Sandbox Manager:
 * Manages available execution backends:
 * - 'executor': SECURE ISOLATION MODE. Execution is delegated to a separate, authenticated,
 *               network-isolated sandbox executor service. Public gateway container has ZERO
 *               Docker socket access.
 * - 'container': Direct container mode (Docker/Podman). Fails closed if Docker daemon or image missing.
 * - 'auto': Strict container/executor mode. Fails closed without falling back to host execution.
 * - 'safe_verification': Refuses dynamic execution; generates test cases and performs static analysis.
 * - 'host': Internal unit-test harness fixture runner ONLY. Permitted strictly when allowHostFixture=true
 *           in non-production environments. Never allowed for user submissions.
 */
export class SandboxManager {
  constructor(options = {}) {
    const isProduction = (options.nodeEnv || process.env.NODE_ENV || config.NODE_ENV) === 'production';
    let requestedMode = options.mode || process.env.SANDBOX_MODE || config.SANDBOX_MODE || 'container';
    const executorUrl = options.executorUrl || process.env.SANDBOX_EXECUTOR_URL || config.SANDBOX_EXECUTOR_URL || '';

    // If executor URL is configured and mode was not explicitly set, default to executor mode
    if (!options.mode && (requestedMode === 'executor' || Boolean(executorUrl))) {
      requestedMode = 'executor';
    }

    let mode = requestedMode;

    // In production, strictly disallow unsafe host execution mode
    if (isProduction && mode === 'host') {
      mode = 'container';
    }
    if (mode === 'auto') {
      mode = 'container';
    }

    this.isProduction = isProduction;
    this.requestedMode = requestedMode;
    this.allowHostFixture = options.allowHostFixture === true && !isProduction;
    this.mode = mode;
    this.hostRunner = options.hostRunner || new HostSandboxRunner();
    this.containerRunner = options.containerRunner || new ContainerSandboxRunner();
    this.remoteRunner = options.remoteRunner || new RemoteExecutorClient(options);
  }

  /**
   * Returns the active runner according to the configured mode, environment, and runtime availability.
   * Host runner is only accessible to explicitly authorized internal test fixtures.
   */
  getActiveRunner() {
    if (this.mode === 'host' && this.allowHostFixture && !this.isProduction) {
      return this.hostRunner;
    }
    if (this.mode === 'executor') {
      return this.remoteRunner;
    }
    return this.containerRunner;
  }

  /**
   * Reports complete sandbox status and capability metadata.
   */
  getStatus() {
    const activeRunner = this.getActiveRunner();

    if (this.mode === 'executor') {
      const isAvailable = this.remoteRunner.isAvailable();
      return {
        mode: 'executor',
        activeRunnerId: activeRunner.id,
        activeRunnerName: activeRunner.name,
        isContainerAvailable: isAvailable,
        containerRuntime: 'remote_docker_executor',
        isIsolated: isAvailable,
        isolationType: isAvailable ? 'isolated_sandbox_service' : 'container_unavailable',
        capabilities: activeRunner.getCapabilities(),
        strictContainerRequired: true,
        isSafeVerification: false,
        isProduction: this.isProduction
      };
    }

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

    // 3. Remote Sandbox Executor mode (Isolated microservice)
    if (this.mode === 'executor') {
      if (!this.remoteRunner.isAvailable()) {
        return {
          allowed: false,
          reason: 'EXECUTOR_UNAVAILABLE',
          message: 'The dedicated sandbox executor service is not configured or reachable. Public gateway direct Docker socket access is disabled.'
        };
      }
      return {
        allowed: true,
        runner: this.remoteRunner
      };
    }

    // 4. Local Container mode (includes 'auto' when executor is not configured)
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
