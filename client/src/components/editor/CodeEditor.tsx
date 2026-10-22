import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { Copy, Check, AlertCircle, Code, Sparkles, Terminal } from 'lucide-react';
import { Issue } from '../../types/api';

// Dynamically import Monaco Editor
const MonacoEditorComponent = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.default }))
);

interface EditorErrorBoundaryProps {
  onError: (error: Error) => void;
  children: React.ReactNode;
}

interface EditorErrorBoundaryState {
  hasError: boolean;
}

class EditorErrorBoundary extends React.Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
  constructor(props: EditorErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): EditorErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: string;
  readOnly?: boolean;
  height?: string;
  placeholder?: string;
  highlightLine?: number | null;
  highlightColumn?: number | null;
  issues?: Issue[];
  onMount?: (editor: any, monaco: any) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  readOnly = false,
  height = '340px',
  placeholder = '// Enter your code here...',
  highlightLine = null,
  highlightColumn = null,
  issues = [],
  onMount,
}) => {
  const [editorEngine, setEditorEngine] = useState<'loading' | 'monaco' | 'fallback'>('loading');
  const [copied, setCopied] = useState<boolean>(false);
  const [engineNotice, setEngineNotice] = useState<string | null>(null);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Safety timer: If Monaco fails to mount within 2500ms (e.g. offline, CSP, or slow network),
  // automatically fall back to the built-in lightweight editor so the user is never stuck.
  useEffect(() => {
    if (editorEngine !== 'loading') return;

    const timer = setTimeout(() => {
      setEditorEngine((current) => {
        if (current === 'loading') {
          setEngineNotice('Lightweight Code Engine active');
          return 'fallback';
        }
        return current;
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, [editorEngine]);

  const handleEditorError = (err: any) => {
    console.warn('Monaco failed to mount, activating lightweight editor:', err);
    setEngineNotice('Monaco unavailable: Lightweight Editor active');
    setEditorEngine('fallback');
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorEngine('monaco');
    setEngineNotice(null);

    if (onMount) onMount(editor, monaco);

    if (highlightLine && highlightLine > 0) {
      editor.revealLineInCenter(highlightLine);
      editor.setPosition({ lineNumber: highlightLine, column: highlightColumn || 1 });
      editor.focus();
    }
  };

  // Jump to highlightLine when it changes in Monaco
  useEffect(() => {
    if (editorRef.current && highlightLine && highlightLine > 0) {
      editorRef.current.revealLineInCenter(highlightLine);
      editorRef.current.setPosition({ lineNumber: highlightLine, column: highlightColumn || 1 });
      editorRef.current.focus();

      if (monacoRef.current) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [
          {
            range: new monacoRef.current.Range(highlightLine, 1, highlightLine, 1),
            options: {
              isWholeLine: true,
              className: 'bg-rose-500/20 border-l-4 border-rose-500',
              glyphMarginClassName: 'text-rose-500',
            },
          },
        ]);
      }
    }
  }, [highlightLine, highlightColumn]);

  // Synchronize Monaco editor content whenever value prop changes externally (e.g. Load Example or Apply Fix)
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  // Fallback textarea key handler (Tab inserts 4 spaces)
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  // Synchronize line gutter scroll with textarea
  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Normalize language for Monaco
  const getMonacoLanguage = (lang: string): string => {
    switch (lang.toLowerCase()) {
      case 'c++':
      case 'cpp':
        return 'cpp';
      case 'javascript':
      case 'js':
      case 'node':
        return 'javascript';
      case 'typescript':
      case 'ts':
        return 'typescript';
      case 'python':
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'sql':
        return 'sql';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      default:
        return 'plaintext';
    }
  };

  const lines = value ? value.split('\n') : [''];
  const errorLines = [
    ...(highlightLine && highlightLine > 0 ? [highlightLine] : []),
    ...(issues ? issues.filter((i) => i.line && i.line > 0).map((i) => i.line as number) : []),
  ];

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-700/80 bg-[#1e1e1e] font-mono text-sm shadow-md transition flex flex-col">
      {/* Top Bar with Language Tag & Copy Action */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-slate-700/80 text-xs">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#333333] text-[#22D3EE] font-mono text-[11px] font-semibold uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
            <span>{language.toUpperCase()}</span>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </span>

          {errorLines.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/50 px-2 py-0.5 rounded-full font-mono">
              <AlertCircle size={11} className="text-rose-400" />
              <span>Defect: L{errorLines[0]}</span>
            </span>
          )}

          {engineNotice && (
            <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
              {engineNotice}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Switch Engine Button */}
          <button
            type="button"
            onClick={() => setEditorEngine((prev) => (prev === 'fallback' ? 'monaco' : 'fallback'))}
            className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700/50 transition font-mono flex items-center space-x-1"
            title="Toggle between Monaco Editor and Lightweight Editor"
          >
            {editorEngine === 'fallback' ? <Code size={12} /> : <Terminal size={12} />}
            <span>{editorEngine === 'fallback' ? 'Lightweight' : 'Monaco'}</span>
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!value}
            className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700/50 transition font-mono text-[11px] flex items-center space-x-1 disabled:opacity-40"
            title="Copy source code"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Editor Surface */}
      <div className="relative w-full" style={{ minHeight: height }}>
        {editorEngine === 'fallback' ? (
          /* Robust Built-In Lightweight Code Editor */
          <div className="flex w-full bg-[#1e1e1e] font-mono text-xs overflow-hidden" style={{ height }}>
            {/* Synchronized Line Numbers Gutter */}
            <div
              ref={gutterRef}
              className="select-none py-3 px-2 bg-[#181818] border-r border-slate-800 text-slate-500 font-mono text-right overflow-hidden flex flex-col"
              style={{ minWidth: '42px', height }}
              aria-hidden="true"
            >
              {lines.map((_, i) => {
                const lineNum = i + 1;
                const isError = errorLines.includes(lineNum);
                return (
                  <div
                    key={i}
                    className={`h-[20px] leading-[20px] pr-1 ${
                      isError ? 'text-rose-400 font-bold bg-rose-500/10' : ''
                    }`}
                  >
                    {lineNum}
                  </div>
                );
              })}
            </div>

            {/* Editable Textarea / Read-Only Pre */}
            {readOnly ? (
              <pre
                className="w-full h-full p-3 text-slate-100 font-mono text-xs overflow-auto whitespace-pre bg-[#1e1e1e] leading-[20px]"
                style={{ height }}
              >
                <code>{value || placeholder}</code>
              </pre>
            ) : (
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange && onChange(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                onScroll={handleTextareaScroll}
                placeholder={placeholder}
                style={{ height }}
                className="w-full p-3 bg-[#1e1e1e] text-slate-100 font-mono text-xs outline-hidden resize-none overflow-auto leading-[20px] focus:ring-0 selection:bg-blue-600/40"
                spellCheck="false"
                autoCapitalize="off"
                autoComplete="off"
              />
            )}
          </div>
        ) : (
          /* Monaco Editor with ErrorBoundary, Suspense & Graceful Fallback */
          <EditorErrorBoundary onError={handleEditorError}>
            <Suspense
              fallback={
                <div
                  className="w-full flex flex-col items-center justify-center bg-[#1e1e1e] text-slate-400 text-xs font-mono space-y-2"
                  style={{ height }}
                >
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Initializing Code Editor...</span>
                </div>
              }
            >
              {typeof window !== 'undefined' && (
                <MonacoEditorComponent
                  height={height}
                  language={getMonacoLanguage(language)}
                  value={value}
                  theme="vs-dark"
                  onMount={handleEditorDidMount}
                  onChange={(val) => onChange && onChange(val || '')}
                  loading={
                    <div
                      className="w-full flex flex-col items-center justify-center bg-[#1e1e1e] text-slate-400 text-xs font-mono space-y-2"
                      style={{ height }}
                    >
                      <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      <span>Loading Code Engine...</span>
                    </div>
                  }
                  options={{
                    readOnly,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    tabSize: 4,
                    padding: { top: 12, bottom: 12 },
                    renderLineHighlight: 'line',
                    overviewRulerBorder: false,
                    cursorBlinking: 'smooth',
                  }}
                />
              )}
            </Suspense>
          </EditorErrorBoundary>
        )}
      </div>
    </div>
  );
};

export default CodeEditor;
