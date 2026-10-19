import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Terminal,
  Zap,
  ShieldCheck,
  Code2,
  GitCompare,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';

export const LandingPage: React.FC = () => {
  const { guestStatus, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="landing-page-wrapper">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge-row">
            <Badge variant="primary" dot>
              AI Coding Debugger v1.0
            </Badge>
            {!isAuthenticated && (
              <span className="guest-pill-sub">
                {guestStatus.remainingUses > 0
                  ? `${guestStatus.remainingUses} free guest debugging attempts available`
                  : 'Free attempts used — Login required'}
              </span>
            )}
          </div>

          <h1 className="hero-title">
            Intelligent Root-Cause Diagnosis & <br />
            <span className="hero-highlight">Verified Sandboxed Code Repair</span>
          </h1>

          <p className="hero-subtitle">
            Don't just get an AI suggestion. Automatically diagnose runtime errors, inspect
            before-and-after unified diffs, and verify fixes in real isolated execution environments
            before pushing to production.
          </p>

          <div className="hero-cta-group">
            <Link to="/debug" className="btn btn-primary btn-lg">
              <span>Start Debugging Code</span>
              <ArrowRight size={18} />
            </Link>
            <Link to="/evaluation" className="btn btn-outline btn-lg">
              <BarChart3 size={18} />
              <span>Held-Out Benchmark</span>
            </Link>
          </div>

          <div className="hero-trust-row">
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Real Python 3 & Node.js Execution</span>
            </div>
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Isolated Child-Process Sandbox</span>
            </div>
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Unified Diff & Line Change Viewer</span>
            </div>
          </div>
        </div>

        {/* Hero Demo Visual Card */}
        <div className="hero-preview-card">
          <div className="preview-top-bar">
            <div className="window-dots">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <span className="preview-filename">binary_search_fix.py — Verified Fix</span>
            <span className="badge badge-success badge-sm">PASS (Exit 0)</span>
          </div>

          <div className="preview-diff-body">
            <div className="diff-line-demo diff-del">
              <span className="demo-num">3</span>
              <span className="demo-sign">-</span>
              <code>high = len(arr)  # Off-by-one boundary error</code>
            </div>
            <div className="diff-line-demo diff-add">
              <span className="demo-num">3</span>
              <span className="demo-sign">+</span>
              <code>high = len(arr) - 1  # Corrected 0-indexed upper bound</code>
            </div>
            <div className="diff-line-demo diff-normal">
              <span className="demo-num">4</span>
              <span className="demo-sign">&nbsp;</span>
              <code>while low &lt;= high:</code>
            </div>
          </div>

          <div className="preview-footer-stats">
            <div className="stat-item">
              <span className="stat-label">Root Cause:</span>
              <span className="stat-val">IndexError / Upper Boundary Overshoot</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Sandbox Time:</span>
              <span className="stat-val">142ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="features-section">
        <div className="section-title-wrap">
          <h2 className="section-title">A Complete Code Verification Platform</h2>
          <p className="section-subtitle">
            Engineered for developers who need verified certainty, not ungrounded hallucinations.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon bg-blue-500/10 text-blue-500">
              <Sparkles size={24} />
            </div>
            <h3 className="feature-card-title">Simple English Diagnostics</h3>
            <p className="feature-card-text">
              Understand what went wrong in plain, concise English alongside technical root causes
              explaining language-specific edge cases.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-indigo-500/10 text-indigo-500">
              <GitCompare size={24} />
            </div>
            <h3 className="feature-card-title">Accurate Unified Diffs</h3>
            <p className="feature-card-text">
              Inspect before-and-after comparisons with exact line numbers, green addition
              highlights, red deletion markers, and copy actions.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-emerald-500/10 text-emerald-500">
              <ShieldCheck size={24} />
            </div>
            <h3 className="feature-card-title">Isolated Execution Sandbox</h3>
            <p className="feature-card-text">
              Untrusted code runs outside the main API process with hard 5000ms CPU clock timeouts,
              64KB buffer caps, and automatic directory cleanup.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-amber-500/10 text-amber-500">
              <BarChart3 size={24} />
            </div>
            <h3 className="feature-card-title">25+ Held-Out Benchmark</h3>
            <p className="feature-card-text">
              Tested against a frozen evaluation suite across 17 distinct bug categories with
              publicly exportable CSV and JSON reports.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-purple-500/10 text-purple-500">
              <Code2 size={24} />
            </div>
            <h3 className="feature-card-title">Multi-Language Support</h3>
            <p className="feature-card-text">
              Full support for Python 3 and JavaScript (Node.js), with compiler syntax and runtime
              exception categorization.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-rose-500/10 text-rose-500">
              <Zap size={24} />
            </div>
            <h3 className="feature-card-title">Session State Preservation</h3>
            <p className="feature-card-text">
              Guest quotas allow 2 free attempts before requiring authentication. Your pending code
              and error notes survive the login flow.
            </p>
          </div>
        </div>
      </section>

      {/* Workflow Steps Section */}
      <section className="workflow-section">
        <div className="section-title-wrap">
          <h2 className="section-title">How It Works in 4 Steps</h2>
          <p className="section-subtitle">From broken code to verified patch in seconds.</p>
        </div>

        <div className="workflow-steps-grid">
          <div className="step-card">
            <div className="step-number">01</div>
            <h4 className="step-title">Paste Broken Code</h4>
            <p className="step-desc">
              Select Python or JavaScript, paste your snippet, and describe the observed crash or
              unexpected output.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">02</div>
            <h4 className="step-title">Automated Analysis</h4>
            <p className="step-desc">
              AI engine validates language syntax, pinpoints affected lines, and constructs a
              minimal, targeted code patch.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">03</div>
            <h4 className="step-title">Sandbox Execution</h4>
            <p className="step-desc">
              Original and corrected versions execute inside isolated workers to capture stdout,
              stderr, and test assertions.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">04</div>
            <h4 className="step-title">Inspect & Apply Fix</h4>
            <p className="step-desc">
              Review the unified diff, verify pass/fail status, and copy the verified fix into your
              codebase.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="bottom-cta-banner">
        <h2 className="banner-title">Ready to Debug Your Code with Real Verification?</h2>
        <p className="banner-desc">
          Try 2 free debugging sessions instantly without creating an account.
        </p>
        <div className="banner-actions">
          <Link to="/debug" className="btn btn-primary btn-lg">
            Start Free Debug Session
          </Link>
          <Link to="/register" className="btn btn-outline btn-lg">
            Create Free Account
          </Link>
        </div>
      </section>
    </div>
  );
};
