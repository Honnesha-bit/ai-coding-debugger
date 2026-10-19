import React, { useState } from 'react';
import { StructuredDiff } from '../../types';
import { CodeEditor } from './CodeEditor';
import { Columns, Code, FileText, Check, Copy, Plus, Minus, FileDiff } from 'lucide-react';

interface DiffViewerProps {
  originalCode: string;
  correctedCode: string;
  structuredDiff?: StructuredDiff;
  language?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  originalCode,
  correctedCode,
  structuredDiff,
  language = 'python',
}) => {
  const [activeTab, setActiveTab] = useState<'diff' | 'corrected' | 'original'>('diff');
  const [copiedCorrected, setCopiedCorrected] = useState(false);
  const [copiedDiff, setCopiedDiff] = useState(false);

  const handleCopyCorrected = () => {
    navigator.clipboard.writeText(correctedCode);
    setCopiedCorrected(true);
    setTimeout(() => setCopiedCorrected(false), 2000);
  };

  const handleCopyUnifiedDiff = () => {
    if (!structuredDiff?.lines) return;
    const diffText = structuredDiff.lines
      .map((l) => (l.type === 'add' ? `+ ${l.content}` : l.type === 'del' ? `- ${l.content}` : `  ${l.content}`))
      .join('\n');
    navigator.clipboard.writeText(diffText);
    setCopiedDiff(true);
    setTimeout(() => setCopiedDiff(false), 2000);
  };

  const hasDiffLines = Boolean(structuredDiff && structuredDiff.lines && structuredDiff.lines.length > 0);

  return (
    <div className="diff-viewer-card">
      <div className="diff-card-header">
        <div className="diff-tabs-group">
          <button
            type="button"
            onClick={() => setActiveTab('diff')}
            className={`diff-tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
            aria-selected={activeTab === 'diff'}
          >
            <Columns size={15} />
            <span>Side-by-Side Diff</span>
            {structuredDiff && (
              <span className="diff-stat-pill">
                <span className="text-emerald-400 font-bold">+{structuredDiff.additions}</span>
                <span className="text-rose-400 font-bold">-{structuredDiff.deletions}</span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('corrected')}
            className={`diff-tab-btn ${activeTab === 'corrected' ? 'active' : ''}`}
            aria-selected={activeTab === 'corrected'}
          >
            <Code size={15} />
            <span>Corrected Code</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('original')}
            className={`diff-tab-btn ${activeTab === 'original' ? 'active' : ''}`}
            aria-selected={activeTab === 'original'}
          >
            <FileText size={15} />
            <span>Original Code</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'diff' && hasDiffLines && (
            <button
              type="button"
              onClick={handleCopyUnifiedDiff}
              className="btn btn-outline btn-xs text-slate-300 hover:text-white"
              title="Copy diff text"
            >
              {copiedDiff ? <Check size={13} className="text-emerald-400" /> : <FileDiff size={13} />}
              <span>{copiedDiff ? 'Diff Copied' : 'Copy Diff'}</span>
            </button>
          )}

          {activeTab === 'corrected' && (
            <button
              type="button"
              onClick={handleCopyCorrected}
              className="btn btn-primary btn-xs"
            >
              {copiedCorrected ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedCorrected ? 'Copied!' : 'Copy Corrected Code'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="diff-card-body">
        {activeTab === 'diff' && (
          <div className="structured-diff-viewport">
            {hasDiffLines ? (
              <div className="diff-lines-table">
                {/* Header row for line numbers */}
                <div className="diff-table-header-row text-[10px] uppercase font-mono text-slate-400 bg-slate-900/60 border-b border-slate-800 flex items-center">
                  <div className="diff-num-old text-right pr-2">Old</div>
                  <div className="diff-num-new text-right pr-2">New</div>
                  <div className="diff-marker-col">+/-</div>
                  <div className="diff-code-col">Code Diff Content</div>
                </div>

                {structuredDiff!.lines.map((line, idx) => {
                  const isAdd = line.type === 'add';
                  const isDel = line.type === 'del';
                  const rowClass = isAdd ? 'diff-add' : isDel ? 'diff-del' : 'diff-normal';

                  return (
                    <div key={idx} className={`diff-line-row ${rowClass}`}>
                      {/* Old line number */}
                      <div className="diff-num-old" aria-label={line.oldLineNumber ? `Original line ${line.oldLineNumber}` : undefined}>
                        {line.oldLineNumber ?? ''}
                      </div>
                      {/* New line number */}
                      <div className="diff-num-new" aria-label={line.newLineNumber ? `Corrected line ${line.newLineNumber}` : undefined}>
                        {line.newLineNumber ?? ''}
                      </div>
                      {/* Marker */}
                      <div className="diff-marker-col" aria-hidden="true">
                        {isAdd ? '+' : isDel ? '-' : ' '}
                      </div>
                      {/* Code Content */}
                      <div className="diff-code-col">
                        <code>{line.content || ' '}</code>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-slate-400 text-center flex flex-col items-center justify-center gap-2">
                <Check size={28} className="text-emerald-500" />
                <span className="font-medium text-slate-300">No code changes detected</span>
                <span className="text-xs text-slate-500">The submitted code is already identical to the repaired result.</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'corrected' && (
          <CodeEditor
            value={correctedCode}
            language={language}
            readOnly={true}
            minHeight="350px"
          />
        )}

        {activeTab === 'original' && (
          <CodeEditor
            value={originalCode}
            language={language}
            readOnly={true}
            minHeight="350px"
          />
        )}
      </div>
    </div>
  );
};
