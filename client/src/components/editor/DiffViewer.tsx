import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Columns, AlignJustify, Check, Copy } from 'lucide-react';

const MonacoDiffEditorComponent = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.DiffEditor }))
);

interface DiffErrorBoundaryProps {
  onError: (error: Error) => void;
  children: React.ReactNode;
}

class DiffErrorBoundary extends React.Component<DiffErrorBoundaryProps, { hasError: boolean }> {
  constructor(props: DiffErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface DiffViewerProps {
  originalCode: string;
  correctedCode: string;
  language: string;
  height?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  originalCode,
  correctedCode,
  language,
  height = '380px',
}) => {
  const [sideBySide, setSideBySide] = useState<boolean>(true);
  const [diffEngine, setDiffEngine] = useState<'loading' | 'monaco' | 'fallback'>('loading');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (diffEngine !== 'loading') return;
    const timer = setTimeout(() => {
      setDiffEngine((curr) => (curr === 'loading' ? 'fallback' : curr));
    }, 2500);
    return () => clearTimeout(timer);
  }, [diffEngine]);

  const handleCopyCorrected = () => {
    navigator.clipboard.writeText(correctedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      default:
        return 'plaintext';
    }
  };

  const monacoTheme = 'vs-dark';
  const origLines = originalCode ? originalCode.split('\n') : [''];
  const corrLines = correctedCode ? correctedCode.split('\n') : [''];

  return (
    <div className="flex flex-col w-full rounded-xl overflow-hidden border border-slate-700/80 bg-[#1e1e1e] shadow-md font-mono text-xs">
      {/* Diff Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#252526] border-b border-slate-700 text-xs">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5 text-rose-400 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Original (Buggy)</span>
          </span>
          <span className="text-slate-500 font-mono">→</span>
          <span className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Corrected (Proposed Fix)</span>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCopyCorrected}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#333333] hover:bg-[#3e3e42] text-slate-200 text-[11px] font-mono transition border border-slate-600 shadow-xs"
            title="Copy proposed fix"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Fix'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSideBySide(!sideBySide)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#333333] hover:bg-[#3e3e42] text-slate-200 text-[11px] font-mono transition border border-slate-600 shadow-xs"
            title={sideBySide ? 'Switch to inline diff view' : 'Switch to side-by-side diff view'}
          >
            {sideBySide ? (
              <>
                <AlignJustify className="w-3.5 h-3.5 text-blue-400" />
                <span>Inline</span>
              </>
            ) : (
              <>
                <Columns className="w-3.5 h-3.5 text-blue-400" />
                <span>Side-by-Side</span>
              </>
            )}
          </button>
        </div>
      </div>

      {diffEngine === 'fallback' ? (
        /* Robust Lightweight Diff Viewer */
        <div className="w-full grid grid-cols-2 divide-x divide-slate-800 bg-[#1e1e1e] overflow-auto" style={{ height }}>
          <div className="p-3 bg-rose-950/15 overflow-auto text-slate-200 leading-[20px]">
            <div className="text-[10px] uppercase font-bold text-rose-400 mb-2 border-b border-rose-900/50 pb-1">
              Original Code
            </div>
            {origLines.map((line, idx) => (
              <div key={idx} className="flex space-x-2">
                <span className="text-slate-600 select-none w-6 text-right">{idx + 1}</span>
                <span className="whitespace-pre">{line}</span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-emerald-950/15 overflow-auto text-slate-200 leading-[20px]">
            <div className="text-[10px] uppercase font-bold text-emerald-400 mb-2 border-b border-emerald-900/50 pb-1">
              Corrected Code
            </div>
            {corrLines.map((line, idx) => (
              <div key={idx} className="flex space-x-2">
                <span className="text-slate-600 select-none w-6 text-right">{idx + 1}</span>
                <span className="whitespace-pre">{line}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <DiffErrorBoundary onError={() => setDiffEngine('fallback')}>
          <Suspense
            fallback={
              <div
                className="flex flex-col items-center justify-center text-slate-400 text-xs font-mono bg-[#1e1e1e] space-y-2"
                style={{ height }}
              >
                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Calculating code difference...</span>
              </div>
            }
          >
            <div data-testid="diff-editor-container">
              <MonacoDiffEditorComponent
                height={height}
                original={originalCode}
                modified={correctedCode}
                language={getMonacoLanguage(language)}
                theme={monacoTheme}
                onMount={() => setDiffEngine('monaco')}
                options={{
                  readOnly: true,
                  renderSideBySide: sideBySide,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
                  lineNumbers: 'on',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  diffWordWrap: 'on',
                }}
              />
            </div>
          </Suspense>
        </DiffErrorBoundary>
      )}
    </div>
  );
};

export default DiffViewer;
