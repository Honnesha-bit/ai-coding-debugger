import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';

export const LandingPage: React.FC = () => {
  const { guestStatus, isAuthenticated } = useAuth();

  return (
    <div className="landing-page-wrapper">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge-row">
            <Badge variant="primary" dot>
              Debug Dynasty v2.0 • AI-Powered Code Repair
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
            Debug smarter. <br />
            <span className="hero-highlight">Code with confidence.</span>
          </h1>

          <p className="hero-subtitle">
            AI-powered code debugging, instant root-cause analysis, before-and-after unified diffs,
            and verified sandbox execution across 16 programming languages.
          </p>

          <div className="hero-cta-group">
            <Link to="/debug" className="btn btn-primary btn-lg">
              <span>Start Debugging</span>
              <ArrowRight size={18} />
            </Link>
            <Link to="/evaluation" className="btn btn-outline btn-lg">
              <BarChart3 size={18} />
              <span>Explore Benchmark</span>
            </Link>
          </div>

          <div className="hero-trust-row">
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span>Supports Python, TypeScript, Java, C, C++, Go, Rust & 9 more</span>
            </div>
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span>Restricted Docker sandbox execution with timeout defense</span>
            </div>
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span>Real verification testing — fixes are never falsely verified</span>
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
            <span className="preview-filename">solution.py</span>
            <span className="badge badge-success badge-sm">FIX VERIFIED</span>
          </div>

          <div className="preview-diff-body">
            <div className="diff-line-demo diff-del">
              <span className="demo-num">3</span>
              <span className="demo-sign">-</span>
              <code>high = len(arr)  # Off-by-one boundary overshoot</code>
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
            <div className="diff-line-demo diff-normal">
              <span className="demo-num">5</span>
              <span className="demo-sign">&nbsp;</span>
              <code>&nbsp;&nbsp;&nbsp;&nbsp;mid = (low + high) // 2</code>
            </div>
          </div>

          <div className="preview-footer-stats">
            <div className="stat-item">
              <span className="stat-label">Root Cause:</span>
              <span className="stat-val">IndexError / Off-By-One</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Sandbox Time:</span>
              <span className="stat-val">142ms</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Tests Passed:</span>
              <span className="stat-val text-emerald-400">4 / 4 Assertions</span>
            </div>
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
