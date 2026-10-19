import path from 'node:path';
import { LanguageRegistry } from './languageRegistry.js';

export class LanguageDetector {
  /**
   * Detects the programming language from code snippet and optional filename.
   * Explicitly detects ambiguity between related languages (e.g. JavaScript vs TypeScript, C vs C++).
   *
   * @param {Object} params
   * @param {string} params.code - Source code string
   * @param {string} [params.filename] - Optional source file name
   * @returns {Object} Detection result with confidence, ambiguity flags, and guidance
   */
  static detect({ code, filename = '' }) {
    const trimmed = (code || '').trim();

    // 1. Filename Extension Check (Strong initial signal)
    let extensionMatch = null;
    if (filename && typeof filename === 'string') {
      const ext = path.extname(filename).toLowerCase();
      const matched = LanguageRegistry.getByExtension(ext);
      if (matched) {
        extensionMatch = {
          adapter: matched,
          ext
        };
      }
    }

    if (!trimmed) {
      if (extensionMatch) {
        return {
          detectedLanguage: extensionMatch.adapter.id,
          languageName: extensionMatch.adapter.name,
          confidence: 0.95,
          reason: `Matched file extension '${extensionMatch.ext}'`,
          isUncertain: false,
          isAmbiguous: false,
          needsConfirmation: false,
          ambiguousOptions: [],
          message: `Auto-detected ${extensionMatch.adapter.name} from file extension.`
        };
      }

      return {
        detectedLanguage: null,
        languageName: null,
        confidence: 0,
        reason: 'Empty source code',
        isUncertain: true,
        isAmbiguous: false,
        needsConfirmation: false,
        ambiguousOptions: [],
        message: 'No code provided for language detection.'
      };
    }

    // 2. Syntax-Based Scoring Engine
    const scores = {
      python: 0,
      javascript: 0,
      typescript: 0,
      java: 0,
      c: 0,
      cpp: 0,
      sql: 0,
      html: 0,
      css: 0,
      csharp: 0,
      go: 0,
      rust: 0,
      php: 0,
      ruby: 0,
      kotlin: 0,
      swift: 0
    };

    // Python indicators
    if (/^\s*(?:import\s+[a-z0-9_]+|from\s+[a-z0-9_]+\s+import)/m.test(trimmed)) scores.python += 40;
    if (/\bdef\s+[a-z_][a-z0-9_]*\s*\([^)]*\)\s*:/i.test(trimmed)) scores.python += 55;
    if (/\belif\b|\bNone\b|\bTrue\b|\bFalse\b/.test(trimmed)) scores.python += 25;
    if (/print\s*\([^)]*\)/m.test(trimmed) && !trimmed.includes(';')) scores.python += 25;
    if (/__name__\s*==\s*['"]__main__['"]/.test(trimmed)) scores.python += 40;
    if (/\bself\.[a-z_]/i.test(trimmed)) scores.python += 30;
    if (/:\s*$/m.test(trimmed) && !trimmed.includes('{')) scores.python += 15;

    // Java indicators
    if (/\bpublic\s+class\s+[A-Z][a-zA-Z0-9_]*/.test(trimmed)) scores.java += 55;
    if (/\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]/.test(trimmed)) scores.java += 55;
    if (/System\.out\.println\s*\(/.test(trimmed)) scores.java += 45;
    if (/\bpackage\s+[a-z0-9_.]+\s*;/.test(trimmed)) scores.java += 30;

    // C indicators (shared with C++)
    if (/#include\s*<stdio\.h>/.test(trimmed)) { scores.c += 50; scores.cpp += 35; }
    if (/\bprintf\s*\(/.test(trimmed) && !trimmed.includes('System.out')) { scores.c += 30; scores.cpp += 25; }
    if (/\bscanf\s*\(/.test(trimmed)) { scores.c += 25; scores.cpp += 20; }
    if (/\bint\s+main\s*\(\s*(?:void)?\s*\)/.test(trimmed) && !trimmed.includes('class')) { scores.c += 20; scores.cpp += 20; }

    // C++ exclusive indicators
    if (/#include\s*<iostream>/.test(trimmed)) scores.cpp += 60;
    if (/std::cout|std::cin|std::endl|std::vector|std::string/.test(trimmed)) scores.cpp += 50;
    if (/\busing\s+namespace\s+std\s*;/.test(trimmed)) scores.cpp += 50;
    if (/template\s*<typename|template\s*<class/.test(trimmed)) scores.cpp += 45;

    // TypeScript specific indicators (guarding against HTML tags)
    const hasTypeAnnotation =
      /:\s*(?:string|number|boolean|any|void|unknown|never)\b/.test(trimmed) ||
      /\binterface\s+[A-Z][a-zA-Z0-9_]*\s*\{/.test(trimmed) ||
      /\btype\s+[A-Z][a-zA-Z0-9_]*\s*=/.test(trimmed) ||
      /\bas\s+(?:const|[A-Z][a-zA-Z0-9_]*)\b/.test(trimmed) ||
      /<(?:string|number|boolean|Record<|Array<)/.test(trimmed);

    const hasJsKeywords = /\b(?:const|let|var|function|console\.log|=>|import\s+.*?from|===|!==|undefined)\b/.test(trimmed);

    if (hasTypeAnnotation) {
      scores.typescript += 60;
    }

    if (hasJsKeywords && !/\bdef\s+[a-z_]/i.test(trimmed)) {
      if (hasTypeAnnotation) {
        scores.typescript += 30;
      } else {
        scores.javascript += 50;
      }
    }

    // SQL indicators
    if (/\bSELECT\b[\s\S]*?\bFROM\b/i.test(trimmed)) scores.sql += 50;
    if (/\bCREATE\s+TABLE\b/i.test(trimmed)) scores.sql += 45;
    if (/\bINSERT\s+INTO\b[\s\S]*?\bVALUES\b/i.test(trimmed)) scores.sql += 45;

    // HTML / CSS
    if (/<!DOCTYPE\s+html>/i.test(trimmed) || /<\s*(?:html|head|body|div|span|p|a|ul|li)\b[^>]*>/i.test(trimmed)) scores.html += 60;
    if (/(?:^|\n)\s*(@media|\.[a-z0-9_-]+|#[a-z0-9_-]+)\s*\{[^}]*:[^}]*\}/i.test(trimmed)) scores.css += 50;

    // Other modern languages
    if (/\bpackage\s+main\b/.test(trimmed) && /func\s+main/.test(trimmed)) scores.go += 60;
    if (/\bfn\s+main\s*\(\s*\)/.test(trimmed) && /println!/.test(trimmed)) scores.rust += 60;
    if (/<\?(?:php|=)/i.test(trimmed)) scores.php += 60;
    if (/\busing\s+System\s*;/.test(trimmed) && /Console\.WriteLine/.test(trimmed)) scores.csharp += 60;

    // If extension was provided, boost that specific language
    if (extensionMatch) {
      scores[extensionMatch.adapter.id] = (scores[extensionMatch.adapter.id] || 0) + 70;
    }

    // Sort scored languages
    const ranked = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, score]) => score > 0);

    if (ranked.length === 0 || ranked[0][1] < 20) {
      return {
        detectedLanguage: null,
        languageName: null,
        confidence: 0,
        reason: 'Unrecognized syntax patterns or unsupported language.',
        isUncertain: true,
        isAmbiguous: false,
        needsConfirmation: true,
        ambiguousOptions: [],
        message: 'Language detection uncertain. Please select your programming language manually from the dropdown.'
      };
    }

    const [topId, topScore] = ranked[0];
    const second = ranked[1];
    const topAdapter = LanguageRegistry.getAdapter(topId);

    // 3. Ambiguity Evaluation
    let isAmbiguous = false;
    let ambiguityReason = '';
    let ambiguousOptions = [];

    // Check JS vs TS ambiguity (valid JS syntax without explicit type annotations could be either)
    if ((topId === 'javascript' || topId === 'typescript') && !hasTypeAnnotation && !extensionMatch) {
      isAmbiguous = true;
      ambiguityReason = 'Code uses JavaScript/TypeScript syntax without explicit type annotations. It can run as either JavaScript or TypeScript.';
      ambiguousOptions = ['javascript', 'typescript'];
    }

    // Check C vs C++ ambiguity (valid C code without C++ features could be compiled as either C or C++)
    if ((topId === 'c' || topId === 'cpp') && !trimmed.includes('std::') && !trimmed.includes('iostream') && !extensionMatch) {
      if (topScore >= 30 && second && (second[0] === 'c' || second[0] === 'cpp')) {
        isAmbiguous = true;
        ambiguityReason = 'Code uses standard C syntax compatible with both C and C++.';
        ambiguousOptions = ['c', 'cpp'];
      }
    }

    const confidence = Math.min(
      0.98,
      Number(
        extensionMatch && extensionMatch.adapter.id === topId
          ? 0.95
          : (topScore / 100 + (isAmbiguous ? 0.2 : 0.4)).toFixed(2)
      )
    );

    const isUncertain = confidence < 0.65 || isAmbiguous;

    let message = `Auto-detected ${topAdapter.name} (${Math.round(confidence * 100)}% confidence).`;
    if (isAmbiguous) {
      message = `Ambiguous syntax: ${ambiguityReason} Defaulting to ${topAdapter.name}, but please confirm.`;
    } else if (isUncertain) {
      message = `Low confidence detection for ${topAdapter.name}. Please verify your selection.`;
    }

    return {
      detectedLanguage: topAdapter.id,
      languageName: topAdapter.name,
      confidence,
      reason: extensionMatch ? `Matched file extension '${extensionMatch.ext}'` : `Syntax pattern match (${topScore} pts)`,
      isUncertain,
      isAmbiguous,
      needsConfirmation: isUncertain,
      ambiguousOptions,
      message
    };
  }
}
