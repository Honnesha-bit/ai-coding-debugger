/**
 * Abstract BaseAdapter for language-specific analysis, compilation, and execution.
 * Enforces a consistent interface across all programming languages.
 */
export class BaseAdapter {
  constructor(config = {}) {
    this.id = config.id || 'unknown';
    this.name = config.name || 'Unknown Language';
    this.extensions = config.extensions || [];
    this.detectionIndicators = config.detectionIndicators || [];
    this.isCompiled = Boolean(config.isCompiled);
    this.executionStrategy = config.executionStrategy || 'native_subprocess';
    this.binaryName = config.binaryName || null;
    this.compilerBinary = config.compilerBinary || null;
    this.defaultTimeoutMs = config.defaultTimeoutMs || 5000;
    this.maxOutputBytes = config.maxOutputBytes || 65536; // 64KB
    this.isCore = Boolean(config.isCore);
    this.sampleCode = config.sampleCode || '';
    this.capabilities = {
      detection: true,
      parsing: true,
      staticAnalysis: true,
      compilation: Boolean(config.isCompiled),
      execution: config.executionStrategy !== 'static_only',
      testVerification: true,
      ...(config.capabilities || {})
    };
  }

  /**
   * Returns human-readable setup instructions when toolchain is missing.
   * @returns {string}
   */
  getSetupInstructions() {
    return `To enable execution for ${this.name}, please install the required toolchain (${this.binaryName || 'compiler'}) and ensure it is available in system PATH.`;
  }

  /**
   * Validates code statically.
   * @param {string} code
   * @returns {{ isValid: boolean, errors: Array<{line: number, message: string, rule: string}>, warnings: Array<{line: number, message: string}> }}
   */
  staticAnalyze(code) {
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  /**
   * Returns command and args to check syntax without full execution.
   * Never construct shell strings with user input directly!
   * @param {string} filePath
   * @param {string} tempDir
   * @returns {{ command: string, args: string[] } | null}
   */
  getSyntaxCheckCommand(filePath, tempDir) {
    return null;
  }

  /**
   * Returns compilation command and args for compiled languages.
   * @param {string} filePath
   * @param {string} tempDir
   * @param {string} outputExecutablePath
   * @returns {{ command: string, args: string[] } | null}
   */
  getCompilationCommand(filePath, tempDir, outputExecutablePath) {
    return null;
  }

  /**
   * Returns command and args to execute the code or compiled binary.
   * @param {string} targetPath - Source file path or compiled binary path
   * @param {string} tempDir - Isolated working directory
   * @returns {{ command: string, args: string[] }}
   */
  getExecutionCommand(targetPath, tempDir) {
    throw new Error(`Execution command not implemented for adapter: ${this.id}`);
  }

  /**
   * Generates or appends test assertions.
   * @param {Object} params
   * @param {string} params.code
   * @param {string} [params.customTestCases]
   * @param {string} [params.expectedOutput]
   * @returns {string}
   */
  generateTestWrapper({ code, customTestCases = '', expectedOutput = '' }) {
    if (customTestCases && customTestCases.trim()) {
      return `${code}\n\n${customTestCases.trim()}`;
    }
    return code;
  }

  /**
   * File name used when writing source code to disk.
   * @returns {string}
   */
  getSourceFileName() {
    const ext = this.extensions[0] || '.txt';
    return `solution${ext}`;
  }
}
