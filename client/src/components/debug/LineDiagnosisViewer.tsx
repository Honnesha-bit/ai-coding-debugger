import React, { useState } from 'react';
import {
  AlertTriangle,
  HelpCircle,
  Lightbulb,
  Copy,
  Check,
  Code2,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { LineDiagnosis } from '../../types';
import { Badge } from '../common/Badge';

interface LineDiagnosisViewerProps {
  diagnoses?: LineDiagnosis[];
  language?: string;
  className?: string;
}

export const LineDiagnosisViewer: React.FC<LineDiagnosisViewerProps> = ({
  diagnoses,
  language = 'code',
  className = '',
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!diagnoses || diagnoses.length === 0) {
    return null;
  }

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Ignore clipboard write failures gracefully
    }
  };

  const hasUncertainDiagnosis = diagnoses.some((d) => d.isUncertain || d.lineNumber === null);

  return (
    <div className={`line-diagnosis-viewer space-y-4 ${className}`}>
      <div className="flex items-center justify-between pb-1 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Code2 size={18} className="text-blue-600" />
          <h3 className="font-semibold text-slate-800 text-base">Line-by-Line Diagnosis</h3>
          <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
            {diagnoses.length} {diagnoses.length === 1 ? 'diagnostic item' : 'diagnostic items'}
          </span>
        </div>
        {hasUncertainDiagnosis && (
          <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 flex items-center gap-1.5 font-medium">
            <AlertTriangle size={13} className="text-amber-600 shrink-0" />
            <span>Some line locations are uncertain</span>
          </span>
        )}
      </div>

      <div className="diagnoses-list space-y-4">
        {diagnoses.map((item, index) => {
          const isUncertain = Boolean(item.isUncertain || item.lineNumber === null);
          const lineLabel =
            !isUncertain && item.lineNumber !== null
              ? item.lineRange && item.lineRange.length === 2 && item.lineRange[0] !== item.lineRange[1]
                ? `Lines ${item.lineRange[0]}–${item.lineRange[1]}`
                : `Line ${item.lineNumber}`
              : 'Structural / Scope Issue';

          const confidenceVariant =
            item.confidence === 'high'
              ? 'success'
              : item.confidence === 'low'
              ? 'warning'
              : 'primary';

          return (
            <div
              key={index}
              className={`rounded-xl border transition-all ${
                isUncertain
                  ? 'bg-amber-50/40 border-amber-200'
                  : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
              } overflow-hidden`}
            >
              {/* Card Header */}
              <div
                className={`px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b ${
                  isUncertain ? 'bg-amber-100/60 border-amber-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isUncertain ? (
                    <HelpCircle size={16} className="text-amber-600" />
                  ) : (
                    <FileCode size={16} className="text-blue-600" />
                  )}
                  <span className="font-semibold text-slate-800 text-sm">{lineLabel}</span>
                  {item.lineNumber !== null && (
                    <span className="font-mono text-xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                      L{item.lineNumber}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isUncertain ? (
                    <Badge variant="warning" size="sm" dot>
                      Line Location Uncertain
                    </Badge>
                  ) : (
                    <Badge variant={confidenceVariant} size="sm" dot>
                      {(item.confidence || 'Medium').toUpperCase()} CONFIDENCE
                    </Badge>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3.5">
                {/* Uncertainty Explanation Banner */}
                {isUncertain && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Exact line number could not be uniquely isolated.</p>
                      <p className="mt-0.5 text-amber-700">
                        This issue spans multiple statements, missing definitions, or runtime context. Review the explanation and suggested correction below.
                      </p>
                    </div>
                  </div>
                )}

                {/* Original Snippet */}
                {item.snippet && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Original Code {item.lineNumber ? `(Line ${item.lineNumber})` : ''}
                      </span>
                    </div>
                    <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 overflow-x-auto text-xs font-mono text-rose-300">
                      <code>{item.snippet}</code>
                    </div>
                  </div>
                )}

                {/* Plain English Explanation */}
                <div>
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
                    Issue Explanation
                  </span>
                  <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {item.explanation}
                  </p>
                </div>

                {/* Suggested Correction */}
                {item.suggestedCorrection && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Suggested Correction
                      </span>
                      <button
                        onClick={() => handleCopy(item.suggestedCorrection, index)}
                        className="btn btn-ghost btn-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        title="Copy correction to clipboard"
                      >
                        {copiedIndex === index ? (
                          <>
                            <Check size={12} className="text-emerald-600" />
                            <span className="text-emerald-600 font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy Correction</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 overflow-x-auto text-xs font-mono text-emerald-300">
                      <code>{item.suggestedCorrection}</code>
                    </div>
                  </div>
                )}

                {/* Why It Works */}
                {item.whyItWorks && (
                  <div className="rounded-lg bg-emerald-50/70 border border-emerald-200/80 p-3 text-xs text-emerald-900 flex items-start gap-2.5">
                    <Lightbulb size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-emerald-800 block mb-0.5">Why this works</span>
                      <p className="leading-relaxed text-emerald-950">{item.whyItWorks}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
