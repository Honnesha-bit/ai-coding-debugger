import React, { useState } from 'react';
import { ExecutionRun } from '../../types';
import { Badge } from '../common/Badge';
import {
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertOctagon,
  Copy,
  Check,
  Info,
  Cpu
} from 'lucide-react';

interface ExecutionTerminalProps {
  originalRun?: ExecutionRun;
  correctedRun?: ExecutionRun;
}

export const ExecutionTerminal: React.FC<ExecutionTerminalProps> = ({
  originalRun,
  correctedRun,
}) => {
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedCorrected, setCopiedCorrected] = useState(false);

  const getStatusBadge = (run?: ExecutionRun) => {
    if (!run) return <Badge variant="neutral">Not Executed</Badge>;
    switch (run.status) {
      case 'success':
        return (
          <Badge variant="success" dot size="sm">
            Success (Exit 0)
          </Badge>
        );
      case 'timeout':
        return (
          <Badge variant="danger" dot size="sm">
            Timeout (&gt;5000ms)
          </Badge>
        );
      case 'compilation_error':
        return (
          <Badge variant="warning" dot size="sm">
            Syntax / Compile Error
          </Badge>
        );
      case 'test_failure':
        return (
          <Badge variant="danger" dot size="sm">
            Assertion Failed
          </Badge>
        );
      case 'execution_unavailable':
        return (
          <Badge variant="warning" dot size="sm">
            Toolchain Unavailable
          </Badge>
        );
      case 'infrastructure_error':
        return (
          <Badge variant="danger" dot size="sm">
            Sandbox Failure
          </Badge>
        );
      default:
        return (
          <Badge variant="danger" dot size="sm">
            Runtime Error (Exit {run.exitCode})
          </Badge>
        );
    }
  };

  const copyPaneOutput = (run: ExecutionRun | undefined, setCopied: (v: boolean) => void) => {
    if (!run) return;
    const text = [
      run.stderr ? `STDERR:\n${run.stderr}` : '',
      run.stdout ? `STDOUT:\n${run.stdout}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    navigator.clipboard.writeText(text || '(No output)');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatusBanner = (run?: ExecutionRun) => {
    if (!run) return null;
    if (run.status === 'timeout') {
      return (
        <div className="terminal-status-notice timeout-notice mb-2 p-2 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-1.5">
          <AlertOctagon size={13} className="text-rose-400 shrink-0" />
          <span>Execution timed out. Process was safely terminated to prevent infinite loops.</span>
        </div>
      );
    }
    if (run.status === 'execution_unavailable') {
      return (
        <div className="terminal-status-notice unavailable-notice mb-2 p-2 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-1.5">
          <Info size={13} className="text-amber-400 shrink-0" />
          <span>Toolchain not installed in local environment. Verified via static syntax analysis.</span>
        </div>
      );
    }
    if (run.status === 'test_failure') {
      return (
        <div className="terminal-status-notice failure-notice mb-2 p-2 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-rose-400 shrink-0" />
          <span>Automated verification assertion failed on code execution.</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="terminal-comparison-card">
      <div className="terminal-card-header">
        <div className="terminal-title-group">
          <Terminal size={16} className="text-blue-500" />
          <span className="font-semibold text-slate-800 text-sm">Sandbox Verification Execution</span>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <Cpu size={12} className="text-slate-400" />
          <span>Isolated Process &bull; Network Disabled &bull; 64KB Max Stream</span>
        </div>
      </div>

      <div className="terminal-panes-grid">
        {/* Original Code Execution */}
        <div className="terminal-pane original-pane">
          <div className="pane-header">
            <span className="pane-title">Original Submitted Code</span>
            <div className="flex items-center gap-2">
              {getStatusBadge(originalRun)}
              {originalRun && (originalRun.stdout || originalRun.stderr) && (
                <button
                  type="button"
                  onClick={() => copyPaneOutput(originalRun, setCopiedOriginal)}
                  className="btn btn-ghost btn-xs text-slate-400 hover:text-white"
                  title="Copy terminal output"
                >
                  {copiedOriginal ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              )}
            </div>
          </div>
          <div className="pane-meta">
            <span className="flex items-center gap-1">
              <Clock size={12} /> {originalRun?.durationMs ?? 0}ms
            </span>
            <span>Exit Code: {originalRun?.exitCode ?? 'N/A'}</span>
          </div>

          {renderStatusBanner(originalRun)}

          <pre className="terminal-stdout-box">
            {originalRun?.stderr && (
              <span className="text-rose-400 font-bold block mb-1">
                STDERR:
                {'\n' + originalRun.stderr}
              </span>
            )}
            {originalRun?.stdout && (
              <span className="text-slate-300 block">
                STDOUT:
                {'\n' + originalRun.stdout}
              </span>
            )}
            {!originalRun?.stdout && !originalRun?.stderr && (
              <span className="text-slate-500 italic block">
                {originalRun ? '(Process exited with no output)' : '(Execution pending)'}
              </span>
            )}
          </pre>
        </div>

        {/* Corrected Code Execution */}
        <div className="terminal-pane corrected-pane">
          <div className="pane-header">
            <span className="pane-title">Corrected Code (Verified)</span>
            <div className="flex items-center gap-2">
              {getStatusBadge(correctedRun)}
              {correctedRun && (correctedRun.stdout || correctedRun.stderr) && (
                <button
                  type="button"
                  onClick={() => copyPaneOutput(correctedRun, setCopiedCorrected)}
                  className="btn btn-ghost btn-xs text-slate-400 hover:text-white"
                  title="Copy terminal output"
                >
                  {copiedCorrected ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              )}
            </div>
          </div>
          <div className="pane-meta">
            <span className="flex items-center gap-1">
              <Clock size={12} /> {correctedRun?.durationMs ?? 0}ms
            </span>
            <span>Exit Code: {correctedRun?.exitCode ?? 'N/A'}</span>
          </div>

          {renderStatusBanner(correctedRun)}

          <pre className="terminal-stdout-box">
            {correctedRun?.stderr && (
              <span className="text-rose-400 font-bold block mb-1">
                STDERR:
                {'\n' + correctedRun.stderr}
              </span>
            )}
            {correctedRun?.stdout && (
              <span className="text-emerald-400 font-mono block">
                STDOUT:
                {'\n' + correctedRun.stdout}
              </span>
            )}
            {!correctedRun?.stdout && !correctedRun?.stderr && (
              <span className="text-slate-500 italic block">
                {correctedRun ? '(Process exited with no output)' : '(Execution pending)'}
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
};
