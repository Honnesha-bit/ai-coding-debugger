/**
 * Base abstract class defining the interface for Sandbox Runners.
 */
export class SandboxRunner {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }

  /**
   * Checks if this runner's required runtime is available in the current environment.
   * @returns {boolean}
   */
  isAvailable() {
    throw new Error('SandboxRunner.isAvailable() must be implemented by subclass');
  }

  /**
   * Returns security capabilities of this runner.
   * @returns {Object}
   */
  getCapabilities() {
    throw new Error('SandboxRunner.getCapabilities() must be implemented by subclass');
  }

  /**
   * Executes a command within the runner's isolation boundary.
   *
   * @param {Object} options
   * @param {string} options.cmd - Executable binary or command
   * @param {string[]} options.args - Command line arguments
   * @param {string} options.cwd - Working directory
   * @param {string} [options.stdinInput] - Standard input string
   * @param {number} options.timeoutMs - Execution timeout in milliseconds
   * @param {number} options.maxOutputBytes - Maximum stdout/stderr bytes to capture
   * @param {Object} [options.env] - Environment variables
   * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, timedOut: boolean, spawnError?: Error }>}
   */
  async run() {
    throw new Error('SandboxRunner.run() must be implemented by subclass');
  }
}
