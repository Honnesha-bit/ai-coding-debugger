import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { LanguageRegistry } from './languages/languageRegistry.js';
import { StaticAnalyzer } from './languages/staticAnalyzer.js';
import { SandboxManager } from './sandbox/sandboxManager.js';
import { ConcurrencyLimiter } from './sandbox/concurrencyLimiter.js';

export class SandboxService {
  constructor(timeoutMs = null, maxOutputBytes = null, sandboxManager = null, concurrencyLimiter = null) {
    this.timeoutMs = timeoutMs || config.SANDBOX_TIMEOUT_MS;
    this.maxOutputBytes = maxOutputBytes || config.MAX_OUTPUT_BYTES;
    this.tempBaseDir = config.TEMP_DIR;
    this.sandboxManager = sandboxManager || new SandboxManager();
    this.concurrencyLimiter = concurrencyLimiter || new ConcurrencyLimiter({
      maxConcurrent: config.SANDBOX_MAX_CONCURRENT,
      queueTimeoutMs: config.SANDBOX_QUEUE_TIMEOUT_MS
    });

    if (!fs.existsSync(this.tempBaseDir)) {
      fs.mkdirSync(this.tempBaseDir, { recursive: true });
    }
  }

  /**
   * Reports active sandbox status, runtime detection, and security capabilities.
   */
  getStatus() {
    const status = this.sandboxManager.getStatus();
    status.concurrency = this.concurrencyLimiter ? this.concurrencyLimiter.getStats() : null;
    return status;
  }

  /**
   * Returns security capabilities of the active sandbox runner.
   */
  getCapabilities() {
    return this.sandboxManager.getStatus().capabilities;
  }

  /**
   * Checks if an executable exists in system PATH (delegates to LanguageRegistry).
   */
  hasBinary(binaryName) {
    return LanguageRegistry.hasBinary(binaryName);
  }

  /**
   * Executes code in an isolated temporary directory within a dedicated runner (container or host).
   * Uses language adapters to configure syntax checks, compilation, and execution.
   *
   * @param {Object} options
   * @param {string} options.language - Language ID (e.g. python, javascript, typescript, java, c, cpp, sql, etc.)
   * @param {string} options.code - Source code
   * @param {string} [options.testCode] - Optional test assertions
   * @param {string} [options.stdinInput] - Optional standard input
   * @param {number} [options.timeoutMs] - Custom timeout
   */
  async execute({ language, code, testCode = '', stdinInput = '', timeoutMs = null }) {
    const adapter = LanguageRegistry.getAdapter(language);
    if (!adapter) {
      return {
        status: 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: `Unsupported language: '${language}'. The AI Coding Debugger supports Python, JavaScript, TypeScript, Java, C, C++, and SQL.`,
        durationMs: 0,
        errorType: 'UNSUPPORTED_LANGUAGE'
      };
    }

    const effectiveTimeout = timeoutMs || this.timeoutMs;
    const startTime = Date.now();

    // 1. Static-Only Languages (HTML, CSS)
    if (adapter.executionStrategy === 'static_only') {
      const analysis = StaticAnalyzer.analyze(adapter.id, code);
      const durationMs = Math.max(1, Date.now() - startTime);

      if (!analysis.isValid) {
        return {
          status: 'compilation_error',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: analysis.errors.map(e => `Line ${e.line}: [${e.rule}] ${e.message}`).join('\n'),
          durationMs,
          errorType: 'STATIC_VALIDATION_ERROR',
          isStaticValidation: true
        };
      }

      return {
        status: 'success',
        success: true,
        exitCode: 0,
        stdout: `[Static Validation Passed: ${adapter.name}]\n- Structure and syntax verified\n- 0 critical defects detected\n${analysis.warnings.length ? analysis.warnings.map(w => `  * Warning (Line ${w.line}): ${w.message}`).join('\n') : ''}`,
        stderr: '',
        durationMs,
        errorType: null,
        isStaticValidation: true
      };
    }

    // 2. Languages requiring compiler/interpreter that may not be installed locally (Java, C, C++, Go, Rust, etc.)
    const checkBinary = adapter.compilerBinary || adapter.binaryName;
    const isCompiledLanguage = adapter.isCompiled && adapter.id !== 'typescript';

    if (isCompiledLanguage || (checkBinary && !['node', 'python'].includes(checkBinary))) {
      // First, perform static analysis
      const analysis = StaticAnalyzer.analyze(adapter.id, code);
      const durationMs = Math.max(1, Date.now() - startTime);

      if (!analysis.isValid) {
        return {
          status: 'compilation_error',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: analysis.errors.map(e => `Line ${e.line}: [${e.rule}] ${e.message}`).join('\n'),
          durationMs,
          errorType: 'SYNTAX_ERROR'
        };
      }

      // Check if compiler is available
      const isAvailable = this.hasBinary(checkBinary);
      if (!isAvailable) {
        return {
          status: 'execution_unavailable',
          success: true,
          exitCode: 0,
          stdout: `[Static Syntax Analysis Passed: ${adapter.name}]\n- Static syntax and structure verified with 0 syntax errors.\n\n[Toolchain Notice]\n${adapter.getSetupInstructions()}\nFull compiled binary execution is disabled until the toolchain is installed.`,
          stderr: '',
          durationMs,
          errorType: null,
          executionAvailable: false
        };
      }
    }

    // 3. Strict Isolation Policy Check
    const allowance = this.sandboxManager.isExecutionAllowed();
    if (!allowance.allowed) {
      return {
        status: 'execution_unavailable',
        success: false,
        executionAvailable: false,
        exitCode: -1,
        stdout: '',
        stderr: `[Sandbox Security Enforcement]\n${allowance.message}\n\nTo enable isolated execution:\n1. Install Docker Desktop or Podman on this host.\n2. Build the sandbox image: docker build -t ${config.SANDBOX_IMAGE} -f Dockerfile.sandbox .\n3. Restart the server.\n\nDirect host execution is prohibited when SANDBOX_MODE=container.`,
        durationMs: 0,
        errorType: 'CONTAINER_RUNTIME_UNAVAILABLE',
        isolationType: 'container_unavailable'
      };
    }

    const runner = allowance.runner || this.sandboxManager.getActiveRunner();

    // 4. Concurrency Slot Acquisition
    let releaseSlot = null;
    try {
      releaseSlot = await this.concurrencyLimiter.acquire();
    } catch (err) {
      return {
        status: 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: `Execution concurrency queue error: ${err.message}`,
        durationMs: 0,
        errorType: err.code || 'CONCURRENCY_LIMIT_EXCEEDED'
      };
    }

    // 5. Executable Execution in Sandbox Workspace
    let tempDir = null;
    try {
      tempDir = fs.mkdtempSync(path.join(this.tempBaseDir, 'run-'));
    } catch (err) {
      return {
        status: 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: `Failed to create sandbox workspace: ${err.message}`,
        durationMs: 0,
        errorType: 'INFRASTRUCTURE_ERROR'
      };
    }

    try {
      const rawFileName = typeof adapter.getSourceFileName === 'function'
        ? adapter.getSourceFileName(code)
        : `solution${adapter.extensions[0] || '.txt'}`;

      // Prevent directory traversal or malicious characters in filename
      const fileName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(tempDir, fileName);

      // Format code with test cases if provided
      let fullCode = code;
      if (typeof adapter.generateTestWrapper === 'function') {
        fullCode = adapter.generateTestWrapper({ code, customTestCases: testCode });
      }

      fs.writeFileSync(filePath, fullCode, 'utf8');

      // Handle Compilation if language is compiled and compiler exists
      if (isCompiledLanguage && this.hasBinary(checkBinary)) {
        const outBinName = process.platform === 'win32' ? 'solution.exe' : 'solution.out';
        const outBinPath = path.join(tempDir, outBinName);
        const compileCmd = adapter.getCompilationCommand(filePath, tempDir, outBinPath);

        if (compileCmd) {
          const compStartTime = Date.now();
          const compResult = await runner.run({
            cmd: compileCmd.command,
            args: compileCmd.args,
            cwd: tempDir,
            stdinInput: '',
            timeoutMs: effectiveTimeout,
            maxOutputBytes: this.maxOutputBytes
          });
          const compDuration = Math.max(1, Date.now() - compStartTime);

          if (compResult.exitCode !== 0 || compResult.timedOut) {
            return {
              status: 'compilation_error',
              success: false,
              exitCode: compResult.exitCode,
              stdout: compResult.stdout,
              stderr: compResult.stderr || 'Compilation failed.',
              durationMs: compDuration,
              errorType: 'COMPILATION_ERROR',
              isolationType: runner.getCapabilities().isolationType
            };
          }

          // Execute compiled binary
          const execCmd = adapter.getExecutionCommand(outBinPath, tempDir, code);
          const execStartTime = Date.now();
          const execResult = await runner.run({
            cmd: execCmd.command,
            args: execCmd.args,
            cwd: tempDir,
            stdinInput,
            timeoutMs: effectiveTimeout,
            maxOutputBytes: this.maxOutputBytes
          });
          const execDuration = Math.max(1, Date.now() - execStartTime);

          return this._categorizeResult(execResult, execDuration, fullCode, adapter.id, runner);
        }
      }

      // Direct Execution (Python, JavaScript, TypeScript, SQL)
      let cmd = 'node';
      let args = [];

      if (adapter.id === 'python') {
        cmd = 'python';
        args = [fileName];
      } else if (adapter.id === 'javascript') {
        cmd = 'node';
        args = [fileName];
      } else if (adapter.id === 'typescript') {
        cmd = 'node';
        args = ['--experimental-strip-types', fileName];
      } else if (adapter.id === 'sql') {
        const runnerPath = path.resolve(config.ROOT_DIR, 'src/services/languages/runners/sqlRunner.js');
        cmd = 'node';
        args = [runnerPath, filePath];
      } else {
        const execCmd = adapter.getExecutionCommand(filePath, tempDir);
        cmd = execCmd.command;
        args = execCmd.args;
      }

      const processStartTime = Date.now();
      const result = await runner.run({
        cmd,
        args,
        cwd: tempDir,
        stdinInput,
        timeoutMs: effectiveTimeout,
        maxOutputBytes: this.maxOutputBytes
      });
      const durationMs = Math.max(1, Date.now() - processStartTime);

      return this._categorizeResult(result, durationMs, fullCode, adapter.id, runner);
    } catch (err) {
      return {
        status: 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        durationMs: 0,
        errorType: 'INFRASTRUCTURE_ERROR'
      };
    } finally {
      if (releaseSlot) {
        releaseSlot();
      }
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore busy file locks on Windows
        }
      }
    }
  }

  _categorizeResult(rawResult, durationMs, fullCode, langId, runner = null) {
    const isolationType = runner ? runner.getCapabilities().isolationType : 'unknown';

    if (rawResult.spawnError) {
      return {
        status: 'infrastructure_error',
        success: false,
        exitCode: -1,
        stdout: rawResult.stdout,
        stderr: `Process spawn error: ${rawResult.spawnError.message}`,
        durationMs,
        errorType: 'INFRASTRUCTURE_ERROR',
        isolationType
      };
    }

    if (rawResult.timedOut) {
      return {
        status: 'timeout',
        success: false,
        exitCode: -1,
        stdout: rawResult.stdout,
        stderr: `Execution timed out after ${this.timeoutMs}ms (infinite loop or runaway computation).`,
        durationMs,
        errorType: 'TIMEOUT',
        isolationType
      };
    }

    if (rawResult.exitCode === 0) {
      return {
        status: 'success',
        success: true,
        exitCode: 0,
        stdout: rawResult.stdout,
        stderr: rawResult.stderr,
        durationMs,
        errorType: null,
        isolationType
      };
    }

    const combinedOutput = (rawResult.stderr + '\n' + rawResult.stdout).toLowerCase();
    const isPython = langId === 'python';
    const isSql = langId === 'sql';

    if (isSql) {
      return {
        status: 'runtime_error',
        success: false,
        exitCode: rawResult.exitCode,
        stdout: rawResult.stdout,
        stderr: rawResult.stderr,
        durationMs,
        errorType: 'SQL_ERROR',
        isolationType
      };
    }

    const isSyntaxError = isPython
      ? combinedOutput.includes('syntaxerror:') || combinedOutput.includes('indentationerror:')
      : combinedOutput.includes('syntaxerror:') || combinedOutput.includes('parse error') || combinedOutput.includes('error: expected');

    if (isSyntaxError) {
      return {
        status: 'compilation_error',
        success: false,
        exitCode: rawResult.exitCode,
        stdout: rawResult.stdout,
        stderr: rawResult.stderr,
        durationMs,
        errorType: 'SYNTAX_ERROR',
        isolationType
      };
    }

    const isTestFailure = isPython
      ? combinedOutput.includes('assertionerror')
      : combinedOutput.includes('failed') || combinedOutput.includes('assertionerror');

    if (isTestFailure) {
      return {
        status: 'test_failure',
        success: false,
        exitCode: rawResult.exitCode,
        stdout: rawResult.stdout,
        stderr: rawResult.stderr,
        durationMs,
        errorType: 'TEST_ASSERTION_FAILED',
        isolationType
      };
    }

    return {
      status: 'runtime_error',
      success: false,
      exitCode: rawResult.exitCode,
      stdout: rawResult.stdout,
      stderr: rawResult.stderr,
      durationMs,
      errorType: 'RUNTIME_EXCEPTION',
      isolationType
    };
  }
}
