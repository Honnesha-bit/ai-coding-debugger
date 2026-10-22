import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LanguageRegistry } from '../../src/services/languages/languageRegistry.js';
import { LanguageDetector } from '../../src/services/languages/languageDetector.js';
import { StaticAnalyzer } from '../../src/services/languages/staticAnalyzer.js';
import { SandboxService } from '../../src/services/sandboxService.js';
import { AiService } from '../../src/services/aiService.js';
import { DiffService } from '../../src/services/diffService.js';
import { AiRepairService } from '../../src/services/aiRepairService.js';
import { VerificationService } from '../../src/services/verificationService.js';
import { SandboxManager } from '../../src/services/sandbox/sandboxManager.js';

describe('Core Language Adapters & Multi-Language Architecture Suite', () => {
  // Isolated test fixture harness explicitly authorized for unit-level adapter verification
  const fixtureManager = new SandboxManager({
    mode: 'host',
    allowHostFixture: true,
    nodeEnv: 'development'
  });
  const sandbox = new SandboxService(3000, 4096, fixtureManager);
  const aiService = new AiService({ provider: 'mock' });
  const diffService = new DiffService();
  const repairService = new AiRepairService({ aiService, sandboxService: sandbox, diffService });

  // 1. Core Registry Verification
  it('LanguageRegistry registers and exposes all 6 core adapters', () => {
    const coreAdapters = LanguageRegistry.getCoreAdapters();
    const coreIds = coreAdapters.map(a => a.id);

    assert.equal(coreAdapters.length, 6, 'Should have exactly 6 core adapters');
    assert.deepEqual(coreIds.sort(), ['c', 'cpp', 'java', 'javascript', 'python', 'typescript'].sort());

    for (const adapter of coreAdapters) {
      assert.ok(adapter.name, `Adapter ${adapter.id} must have a display name`);
      assert.ok(adapter.extensions.length > 0, `Adapter ${adapter.id} must define extensions`);
      assert.ok(typeof adapter.staticAnalyze === 'function', `Adapter ${adapter.id} must implement staticAnalyze`);
      assert.ok(typeof adapter.getSetupInstructions === 'function', `Adapter ${adapter.id} must provide setup instructions`);
    }
  });

  // 2. Python Adapter
  describe('Python Adapter Tests', () => {
    it('Preserves valid Python code without syntax errors', () => {
      const code = 'def add(a, b):\n    return a + b\n\nprint(add(2, 3))';
      const analysis = StaticAnalyzer.analyze('python', code);
      assert.equal(analysis.isValid, true);
      assert.equal(analysis.errors.length, 0);
    });

    it('Identifies Python syntax error (missing colon)', () => {
      const code = 'def broken(a, b)\n    return a + b';
      const analysis = StaticAnalyzer.analyze('python', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'PYTHON_MISSING_COLON'));
    });

    it('Executes valid Python code in sandbox and returns status success', async () => {
      const code = 'print("PYTHON_SANDBOX_SUCCESS")';
      const res = await sandbox.execute({ language: 'python', code });
      assert.equal(res.status, 'success');
      assert.equal(res.exitCode, 0);
      assert.ok(res.stdout.includes('PYTHON_SANDBOX_SUCCESS'));
    });

    it('Captures Python runtime exception in sandbox', async () => {
      const code = 'val = 10 / 0';
      const res = await sandbox.execute({ language: 'python', code });
      assert.equal(res.status, 'runtime_error');
      assert.ok(res.stderr.includes('ZeroDivisionError'));
    });

    it('Terminates runaway Python infinite loop within timeout', async () => {
      const code = 'while True:\n    pass';
      const res = await sandbox.execute({ language: 'python', code, timeoutMs: 1200 });
      assert.equal(res.status, 'timeout');
      assert.equal(res.errorType, 'TIMEOUT');
    });
  });

  // 3. JavaScript Adapter
  describe('JavaScript Adapter Tests', () => {
    it('Preserves valid JavaScript code', () => {
      const code = 'function multiply(a, b) {\n    return a * b;\n}\nconsole.log(multiply(3, 4));';
      const analysis = StaticAnalyzer.analyze('javascript', code);
      assert.equal(analysis.isValid, true);
      assert.equal(analysis.errors.length, 0);
    });

    it('Detects Python keywords in JavaScript as syntax defect', () => {
      const code = 'def calculate(x, y) {\n    return x + y;\n}';
      const analysis = StaticAnalyzer.analyze('javascript', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'JS_PYTHON_SYNTAX'));
    });

    it('Executes JavaScript in sandbox and captures stdout', async () => {
      const code = 'console.log("JS_EXECUTION_PASS");';
      const res = await sandbox.execute({ language: 'javascript', code });
      assert.equal(res.status, 'success');
      assert.ok(res.stdout.includes('JS_EXECUTION_PASS'));
    });
  });

  // 4. TypeScript Adapter
  describe('TypeScript Adapter Tests', () => {
    it('Preserves valid TypeScript code with types', () => {
      const code = 'interface User {\n    id: number;\n    name: string;\n}\nconst u: User = { id: 1, name: "Alice" };';
      const analysis = StaticAnalyzer.analyze('typescript', code);
      assert.equal(analysis.isValid, true);
    });

    it('Detects malformed TypeScript interface without name', () => {
      const code = 'interface {\n    id: number;\n}';
      const analysis = StaticAnalyzer.analyze('typescript', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'TS_MISSING_INTERFACE_NAME'));
    });

    it('Executes TypeScript code natively via Node.js type-stripping', async () => {
      const code = 'const addNum = (x: number, y: number): number => x + y;\nconsole.log("TS_SUM:", addNum(5, 7));';
      const res = await sandbox.execute({ language: 'typescript', code, timeoutMs: 10000 });
      assert.equal(res.status, 'success');
      assert.ok(res.stdout.includes('TS_SUM: 12'));
    });
  });

  // 5. Java Adapter
  describe('Java Adapter Tests', () => {
    it('Preserves valid Java class and main entrypoint', () => {
      const code = 'public class Hello {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}';
      const analysis = StaticAnalyzer.analyze('java', code);
      assert.equal(analysis.isValid, true);
    });

    it('Detects missing class declaration in Java', () => {
      const code = 'public static void main(String[] args) {\n    System.out.println("No class");\n}';
      const analysis = StaticAnalyzer.analyze('java', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'JAVA_MISSING_CLASS'));
    });

    it('Detects missing semicolon in Java', () => {
      const code = 'public class Test {\n    public static void main(String[] args) {\n        int x = 10\n    }\n}';
      const analysis = StaticAnalyzer.analyze('java', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'JAVA_MISSING_SEMICOLON'));
    });

    it('Honestly reports execution_unavailable when javac compiler is missing', async () => {
      const missingSandbox = new SandboxService(3000, 4096, fixtureManager, null, {
        hasBinary: (bin) => (bin === 'javac' || bin === 'java' ? false : LanguageRegistry.hasBinary(bin))
      });
      const code = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Java test");\n    }\n}';
      const res = await missingSandbox.execute({ language: 'java', code });
      assert.equal(res.status, 'execution_unavailable');
      assert.equal(res.executionAvailable, false);
      assert.ok(res.stdout.includes('Static Syntax Analysis Passed: Java'));
      assert.ok(res.stdout.includes('Toolchain Notice'));
    });

    it('Executes valid Java code when javac and java are available', async (t) => {
      if (!LanguageRegistry.hasBinary('javac') || !LanguageRegistry.hasBinary('java')) {
        t.skip('javac or java is not installed on this host environment');
        return;
      }
      const code = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("JAVA_EXECUTION_PASS");\n    }\n}';
      const res = await sandbox.execute({ language: 'java', code, timeoutMs: 10000 });
      assert.equal(res.status, 'success');
      assert.ok(res.stdout.includes('JAVA_EXECUTION_PASS'));
    });
  });

  // 6. C Adapter
  describe('C Adapter Tests', () => {
    it('Preserves valid C code', () => {
      const code = '#include <stdio.h>\n\nint main(void) {\n    printf("Hello C\\n");\n    return 0;\n}';
      const analysis = StaticAnalyzer.analyze('c', code);
      assert.equal(analysis.isValid, true);
    });

    it('Rejects C++ std::cout streams in C files', () => {
      const code = '#include <stdio.h>\n\nint main(void) {\n    std::cout << "Invalid C";\n    return 0;\n}';
      const analysis = StaticAnalyzer.analyze('c', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'C_INVALID_CPP_FEATURE'));
    });

    it('Detects missing semicolon in C', () => {
      const code = '#include <stdio.h>\n\nint main(void) {\n    int sum = 5\n    return 0;\n}';
      const analysis = StaticAnalyzer.analyze('c', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'C_MISSING_SEMICOLON'));
    });

    it('Honestly reports execution_unavailable when gcc compiler is missing', async () => {
      const missingSandbox = new SandboxService(3000, 4096, fixtureManager, null, {
        hasBinary: (bin) => (bin === 'gcc' ? false : LanguageRegistry.hasBinary(bin))
      });
      const code = '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}';
      const res = await missingSandbox.execute({ language: 'c', code });
      assert.equal(res.status, 'execution_unavailable');
      assert.equal(res.executionAvailable, false);
      assert.ok(res.stdout.includes('Static Syntax Analysis Passed: C'));
      assert.ok(res.stdout.includes('Toolchain Notice'));
    });

    it('Executes valid C code when gcc compiler is available', async (t) => {
      if (!LanguageRegistry.hasBinary('gcc')) {
        t.skip('gcc is not installed on this host environment');
        return;
      }
      const code = '#include <stdio.h>\n\nint main(void) {\n    printf("C_EXECUTION_PASS\\n");\n    return 0;\n}';
      const res = await sandbox.execute({ language: 'c', code });
      assert.equal(res.status, 'success');
      assert.ok(res.stdout.includes('C_EXECUTION_PASS'));
    });
  });

  // 7. C++ Adapter
  describe('C++ Adapter Tests', () => {
    it('Preserves valid C++ code with iostream and namespaces', () => {
      const code = '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello C++" << endl;\n    return 0;\n}';
      const analysis = StaticAnalyzer.analyze('cpp', code);
      assert.equal(analysis.isValid, true);
    });

    it('Detects missing semicolon after stream insertion in C++', () => {
      const code = '#include <iostream>\n\nint main() {\n    std::cout << "Missing semicolon"\n    return 0;\n}';
      const analysis = StaticAnalyzer.analyze('cpp', code);
      assert.equal(analysis.isValid, false);
      assert.ok(analysis.errors.some(e => e.rule === 'CPP_MISSING_SEMICOLON'));
    });

    it('Honestly reports execution_unavailable when g++ compiler is missing', async () => {
      const missingSandbox = new SandboxService(3000, 4096, fixtureManager, null, {
        hasBinary: (bin) => (bin === 'g++' ? false : LanguageRegistry.hasBinary(bin))
      });
      const code = '#include <iostream>\nint main() {\n    return 0;\n}';
      const res = await missingSandbox.execute({ language: 'cpp', code });
      assert.equal(res.status, 'execution_unavailable');
      assert.equal(res.executionAvailable, false);
      assert.ok(res.stdout.includes('Static Syntax Analysis Passed: C++'));
      assert.ok(res.stdout.includes('Toolchain Notice'));
    });

    it('Executes valid C++ code when g++ compiler is available', async (t) => {
      if (!LanguageRegistry.hasBinary('g++')) {
        t.skip('g++ is not installed on this host environment');
        return;
      }
      const code = '#include <iostream>\nint main() {\n    std::cout << "CPP_EXECUTION_PASS" << std::endl;\n    return 0;\n}';
      const res = await sandbox.execute({ language: 'cpp', code });
      assert.equal(res.status, 'success');
      assert.ok(res.stdout.includes('CPP_EXECUTION_PASS'));
    });
  });

  // 8. Automatic Language Detection & Ambiguity Checks
  describe('Language Detection & Ambiguity Evaluation', () => {
    it('Detects unambiguous Python syntax with high confidence', () => {
      const code = 'def binary_search(arr, target):\n    for x in arr:\n        if x == target:\n            return True\n    return False';
      const res = LanguageDetector.detect({ code });
      assert.equal(res.detectedLanguage, 'python');
      assert.equal(res.isAmbiguous, false);
      assert.ok(res.confidence > 0.7);
    });

    it('Flags JavaScript code without explicit types as ambiguous with TypeScript', () => {
      const code = 'function add(a, b) {\n    const sum = a + b;\n    console.log("Sum:", sum);\n    return sum;\n}';
      const res = LanguageDetector.detect({ code });
      assert.equal(res.isAmbiguous, true);
      assert.deepEqual(res.ambiguousOptions, ['javascript', 'typescript']);
      assert.equal(res.needsConfirmation, true);
    });

    it('Detects TypeScript decisively when type annotations or interfaces exist', () => {
      const code = 'interface Config {\n    port: number;\n    host: string;\n}\nconst conf: Config = { port: 8080, host: "localhost" };';
      const res = LanguageDetector.detect({ code });
      assert.equal(res.detectedLanguage, 'typescript');
      assert.equal(res.isAmbiguous, false);
    });

    it('Flags standard C code as ambiguous with C++', () => {
      const code = '#include <stdio.h>\n\nint main(void) {\n    printf("Standard C/C++\\n");\n    return 0;\n}';
      const res = LanguageDetector.detect({ code });
      assert.equal(res.isAmbiguous, true);
      assert.deepEqual(res.ambiguousOptions, ['c', 'cpp']);
      assert.equal(res.needsConfirmation, true);
    });

    it('Rejects unsupported language or meaningless input', () => {
      const code = '+++++[>++++++++++<-]>.';
      const res = LanguageDetector.detect({ code });
      assert.equal(res.detectedLanguage, null);
      assert.equal(res.confidence, 0);
      assert.equal(res.isUncertain, true);
    });
  });

  // 9. Feedback Repair Loop & Verification Statuses
  describe('AiRepairService & VerificationService Flow', () => {
    it('Produces FIX VERIFIED for executable Python logic fix', async () => {
      const buggyCode = 'def binary_search(arr, target):\n    low = 0\n    high = len(arr)\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\nassert binary_search([1, 3, 5], 3) == 1';
      const res = await repairService.repairAndVerify({
        language: 'python',
        sourceCode: buggyCode
      });

      assert.equal(res.verificationStatus, 'FIX VERIFIED');
      assert.equal(res.verified, true);
      assert.ok(res.attempts.length >= 1);
      assert.ok(res.diff.includes('+'));
      assert.ok(res.executionDurationMs > 0, 'Duration must be genuine measured timestamp');
    });

    it('Produces FIX PARTIALLY VERIFIED for Java static fix when compiler is unavailable', async () => {
      const missingSandbox = new SandboxService(3000, 4096, fixtureManager, null, {
        hasBinary: (bin) => (bin === 'javac' || bin === 'java' ? false : LanguageRegistry.hasBinary(bin))
      });
      const missingRepairService = new AiRepairService({ aiService, sandboxService: missingSandbox, diffService });
      const buggyJava = 'public class Main {\n    public static void main(String[] args) {\n        int x = 5\n    }\n}';
      const res = await missingRepairService.repairAndVerify({
        language: 'java',
        sourceCode: buggyJava
      });

      assert.equal(res.verificationStatus, 'FIX PARTIALLY VERIFIED');
      assert.equal(res.toolchainStatus, 'unavailable');
      assert.ok(res.verificationSummary.includes('partially verified'));
    });
  });
});
