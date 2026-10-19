import { BaseAdapter } from './BaseAdapter.js';

export class HtmlAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'html',
      name: 'HTML5',
      extensions: ['.html', '.htm'],
      isCompiled: false,
      isCore: false,
      binaryName: null,
      executionStrategy: 'static_only',
      capabilities: {
        compilation: false,
        execution: false
      },
      sampleCode: '<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body><h1>Hello World</h1></body>\n</html>'
    });
  }

  getSetupInstructions() {
    return 'HTML5 is a declarative markup language validated statically by the built-in DOM structure parser.';
  }

  getSourceFileName() {
    return 'index.html';
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const trimmed = (code || '').trim();

    if (!trimmed) {
      errors.push({ line: 1, message: 'HTML source is empty.', rule: 'HTML_EMPTY' });
      return { isValid: false, errors, warnings };
    }

    if (!/<!DOCTYPE\s+html>/i.test(trimmed)) {
      warnings.push({ line: 1, message: 'Missing <!DOCTYPE html> preamble for HTML5 standard compliance.' });
    }

    // Tag balancing check
    const tagRegex = /<\/?([a-zA-Z0-9]+)(\s+[^>]*)?(\/?)>/g;
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype']);
    const stack = [];

    let match;
    while ((match = tagRegex.exec(code)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      const isSelfClosing = match[3] === '/' || voidTags.has(tagName);
      const isClosing = fullTag.startsWith('</');

      if (voidTags.has(tagName)) continue;

      if (!isClosing && !isSelfClosing) {
        stack.push({ tag: tagName, index: match.index });
      } else if (isClosing) {
        if (stack.length === 0) {
          errors.push({
            line: code.substring(0, match.index).split('\n').length,
            message: `Unexpected closing tag </${tagName}> without matching open tag.`,
            rule: 'HTML_UNMATCHED_CLOSING_TAG'
          });
        } else {
          const last = stack.pop();
          if (last.tag !== tagName) {
            errors.push({
              line: code.substring(0, match.index).split('\n').length,
              message: `Mismatched closing tag: expected </${last.tag}>, found </${tagName}>.`,
              rule: 'HTML_MISMATCHED_TAG'
            });
          }
        }
      }
    }

    while (stack.length > 0) {
      const unclosed = stack.pop();
      errors.push({
        line: code.substring(0, unclosed.index).split('\n').length,
        message: `Unclosed HTML tag <${unclosed.tag}>.`,
        rule: 'HTML_UNCLOSED_TAG'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
