import { execSync, execFileSync } from 'node:child_process';
import { PythonAdapter } from './adapters/PythonAdapter.js';
import { JavaScriptAdapter } from './adapters/JavaScriptAdapter.js';
import { TypeScriptAdapter } from './adapters/TypeScriptAdapter.js';
import { JavaAdapter } from './adapters/JavaAdapter.js';
import { CAdapter } from './adapters/CAdapter.js';
import { CppAdapter } from './adapters/CppAdapter.js';
import { SqlAdapter } from './adapters/SqlAdapter.js';
import { HtmlAdapter } from './adapters/HtmlAdapter.js';
import { CssAdapter } from './adapters/CssAdapter.js';
import { GenericModernAdapter } from './adapters/GenericModernAdapter.js';

class LanguageRegistryManager {
  constructor() {
    this._adapters = new Map();
    this._toolchainStatusCache = null;
    this._binaryCache = new Map();

    this._initializeDefaultAdapters();
  }

  _initializeDefaultAdapters() {
    // 1. The 6 Core Languages
    this.registerAdapter(new PythonAdapter());
    this.registerAdapter(new JavaScriptAdapter());
    this.registerAdapter(new TypeScriptAdapter());
    this.registerAdapter(new JavaAdapter());
    this.registerAdapter(new CAdapter());
    this.registerAdapter(new CppAdapter());

    // 2. Auxiliary Languages
    this.registerAdapter(new SqlAdapter());
    this.registerAdapter(new HtmlAdapter());
    this.registerAdapter(new CssAdapter());

    // 3. Other Modern Languages
    this.registerAdapter(new GenericModernAdapter({
      id: 'csharp',
      name: 'C#',
      extensions: ['.cs'],
      binaryName: 'dotnet',
      compilerBinary: 'dotnet'
    }));

    this.registerAdapter(new GenericModernAdapter({
      id: 'go',
      name: 'Go',
      extensions: ['.go'],
      binaryName: 'go',
      compilerBinary: 'go'
    }));

    this.registerAdapter(new GenericModernAdapter({
      id: 'rust',
      name: 'Rust',
      extensions: ['.rs'],
      binaryName: 'rustc',
      compilerBinary: 'rustc'
    }));

    this.registerAdapter(new GenericModernAdapter({
      id: 'php',
      name: 'PHP',
      extensions: ['.php'],
      binaryName: 'php',
      compilerBinary: 'php',
      isCompiled: false
    }));

    this.registerAdapter(new GenericModernAdapter({
      id: 'ruby',
      name: 'Ruby',
      extensions: ['.rb'],
      binaryName: 'ruby',
      compilerBinary: 'ruby',
      isCompiled: false
    }));

    this.registerAdapter(new GenericModernAdapter({
      id: 'kotlin',
      name: 'Kotlin',
      extensions: ['.kt', '.kts'],
      binaryName: 'kotlinc',
      compilerBinary: 'kotlinc'
    }));

    this.registerAdapter(new GenericModernAdapter({
      id: 'swift',
      name: 'Swift',
      extensions: ['.swift'],
      binaryName: 'swift',
      compilerBinary: 'swift'
    }));
  }

  /**
   * Registers a language adapter.
   */
  registerAdapter(adapter) {
    if (!adapter || !adapter.id) {
      throw new Error('Cannot register adapter without valid id.');
    }
    this._adapters.set(adapter.id.toLowerCase(), adapter);
  }

  /**
   * Retrieves an adapter by language ID or alias.
   */
  getAdapter(languageId) {
    if (!languageId || typeof languageId !== 'string') return null;
    const key = languageId.toLowerCase().trim();

    // Alias mappings
    if (key === 'py') return this._adapters.get('python');
    if (key === 'js') return this._adapters.get('javascript');
    if (key === 'ts') return this._adapters.get('typescript');
    if (key === 'c++') return this._adapters.get('cpp');
    if (key === 'cs') return this._adapters.get('csharp');
    if (key === 'rb') return this._adapters.get('ruby');

    return this._adapters.get(key) || null;
  }

  hasAdapter(languageId) {
    return Boolean(this.getAdapter(languageId));
  }

  /**
   * Returns all 6 core language adapters.
   */
  getCoreAdapters() {
    return ['python', 'javascript', 'typescript', 'java', 'c', 'cpp']
      .map(id => this.getAdapter(id))
      .filter(Boolean);
  }

  getAll() {
    return this.getAllAdapters();
  }

  isSupported(languageId) {
    return this.hasAdapter(languageId);
  }

  /**
   * Returns all registered adapters.
   */
  getAllAdapters() {
    return Array.from(this._adapters.values());
  }

  /**
   * Backward compatibility getter.
   */
  getById(languageId) {
    return this.getAdapter(languageId);
  }

  /**
   * Backward compatibility getter for extensions.
   */
  getByExtension(ext) {
    if (!ext) return null;
    const cleanExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    for (const adapter of this._adapters.values()) {
      if (adapter.extensions.includes(cleanExt)) {
        return adapter;
      }
    }
    return null;
  }

  /**
   * Checks if a binary executable exists in system PATH (cached).
   */
  hasBinary(binaryName) {
    if (!binaryName) return false;
    const baseBin = binaryName.split(' ')[0];

    // Node runtime is inherently available in the running Node.js process
    if (baseBin === 'node' || baseBin === 'nodejs') {
      return true;
    }

    if (this._binaryCache.has(baseBin)) {
      return this._binaryCache.get(baseBin);
    }

    try {
      const isWin = process.platform === 'win32';
      if (isWin) {
        execFileSync('where.exe', [baseBin], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 });
      } else {
        execFileSync('which', [baseBin], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 });
      }
      this._binaryCache.set(baseBin, true);
      return true;
    } catch (err) {
      // Do not cache false on timeout (infrastructure latency spike)
      if (err && (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM')) {
        return false;
      }
      this._binaryCache.set(baseBin, false);
      return false;
    }
  }

  /**
   * Clears binary availability cache (useful for testing).
   */
  clearBinaryCache() {
    this._binaryCache.clear();
  }

  /**
   * Detects toolchains across all core languages.
   * Reports available vs missing status with setup instructions.
   */
  detectToolchains() {
    const report = {};
    for (const adapter of this.getAllAdapters()) {
      let isAvailable = false;
      let checkBinary = adapter.compilerBinary || adapter.binaryName;

      if (!checkBinary) {
        // e.g. static HTML, CSS
        isAvailable = true;
      } else if (adapter.id === 'typescript') {
        // TypeScript runs natively on Node.js 22.6+ via --experimental-strip-types
        isAvailable = this.hasBinary('node');
      } else if (adapter.id === 'sql') {
        // SQL runs in-memory via Node sqlite
        isAvailable = this.hasBinary('node');
      } else {
        isAvailable = this.hasBinary(checkBinary);
      }

      report[adapter.id] = {
        name: adapter.name,
        isCore: adapter.isCore,
        toolchainBinary: checkBinary,
        isAvailable,
        setupInstructions: isAvailable ? 'Toolchain available and ready for execution.' : adapter.getSetupInstructions()
      };
    }
    return report;
  }
}

export const LanguageRegistry = new LanguageRegistryManager();

// Export array for backward compatibility
export const SUPPORTED_LANGUAGES = LanguageRegistry.getAllAdapters();
