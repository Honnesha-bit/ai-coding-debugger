import React, { useRef, useState } from 'react';
import { Copy, Check, AlertCircle, FileCode } from 'lucide-react';

interface CodeEditorProps {
  value: string;
  onChange?: (val: string) => void;
  language?: string;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
  showLineNumbers?: boolean;
  errorLines?: number[];
  actions?: React.ReactNode;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'python',
  readOnly = false,
  placeholder = 'Write or paste source code here...',
  minHeight = '320px',
  showLineNumbers = true,
  errorLines,
  actions,
}) => {
  const [copied, setCopied] = useState(false);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = value ? value.split('\n') : [''];

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = value.substring(0, start) + '    ' + value.substring(end);
      if (onChange) onChange(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const validErrorLines = errorLines && errorLines.length > 0 ? errorLines : null;

  return (
    <div className="code-editor-shell">
      <div className="editor-top-bar">
        <div className="flex items-center gap-2">
          <div className="editor-lang-tag">
            <span className="lang-indicator-dot" />
            <span>{language.toUpperCase()}</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </span>
          {validErrorLines && (
            <span className="editor-error-flag inline-flex items-center gap-1 text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/50 px-2 py-0.5 rounded-full font-mono">
              <AlertCircle size={11} className="text-rose-400" />
              <span>Line {validErrorLines.join(', ')}</span>
            </span>
          )}
        </div>

        <div className="editor-top-actions">
          {actions}
          <button
            onClick={handleCopy}
            className="btn btn-ghost btn-xs text-slate-400 hover:text-white"
            title="Copy code"
            disabled={!value}
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      <div className="editor-body" style={{ minHeight }}>
        {showLineNumbers && (
          <div ref={gutterRef} className="line-numbers-gutter" aria-hidden="true">
            {lines.map((_, i) => {
              const lineNum = i + 1;
              const isError = Boolean(validErrorLines && validErrorLines.includes(lineNum));
              return (
                <div
                  key={i}
                  className={`line-number-cell ${isError ? 'error-line-active' : ''}`}
                  title={isError ? `Defect detected on line ${lineNum}` : undefined}
                >
                  {isError && <span className="error-marker-dot" aria-hidden="true" />}
                  <span>{lineNum}</span>
                </div>
              );
            })}
          </div>
        )}

        {readOnly ? (
          <pre className="code-preview-pane">
            <code>{value || '(Empty)'}</code>
          </pre>
        ) : (
          <textarea
            value={value}
            onChange={(e) => onChange && onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder={placeholder}
            className="code-input-textarea"
            spellCheck="false"
            autoCapitalize="off"
            autoComplete="off"
          />
        )}
      </div>
    </div>
  );
};
