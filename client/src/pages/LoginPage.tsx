import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { storage } from '../services/storage';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { login, isAuthenticated, isLoading } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const pendingWork = storage.getPendingWork();
  const fromState = location.state?.from;
  const fromPath = typeof fromState === 'string' ? fromState : fromState?.pathname;
  const redirectTarget = fromPath || (pendingWork?.sourceCode ? '/debug' : '/dashboard');

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(redirectTarget, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg('');

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      await login({ username: trimmedUser, password });
      success(`Welcome back, ${trimmedUser}!`);
      navigate(redirectTarget, { replace: true });
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message?.includes('fetch')) {
        setErrorMsg('Unable to connect to the authentication server. Please check your network and try again.');
      } else if (err.status === 401 || err.code === 'INVALID_CREDENTIALS') {
        setErrorMsg('Invalid username or password. Please verify your credentials and try again.');
      } else if (err.status === 429) {
        setErrorMsg('Too many login attempts. Please wait 1 minute before retrying.');
      } else {
        setErrorMsg(err.message || 'Invalid username or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-box">
        <div className="auth-card-header">
          <div className="auth-icon-badge">
            <Lock size={22} className="text-blue-500" />
          </div>
          <h2 className="auth-title">Log in to your account</h2>
          <p className="auth-subtitle">Continue debugging and access your private session history</p>
        </div>

        {pendingWork?.sourceCode && (
          <div className="auth-preserved-note">
            <Sparkles size={16} className="text-emerald-500 shrink-0" />
            <span>Your pending code and error details are saved and ready to debug.</span>
          </div>
        )}

        {errorMsg && (
          <div className="auth-error-alert" role="alert">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="login-username" className="form-label">
              Username or Email
            </label>
            <div className="input-wrap">
              <span className="input-icon-prefix">
                <User size={16} />
              </span>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="developer1 or dev@example.com"
                className="form-input with-prefix"
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="login-password" className="form-label">
                Password
              </label>
            </div>
            <div className="input-wrap">
              <span className="input-icon-prefix">
                <Lock size={16} />
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="form-input with-prefix with-suffix"
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="input-icon-suffix"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-block btn-lg mt-2">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="btn-spinner" />
                <span>Logging in...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>Sign In</span>
                <ArrowRight size={16} />
              </span>
            )}
          </button>
        </form>

        <div className="auth-footer-prompt">
          <span>Don't have an account yet?</span>{' '}
          <Link to="/register" className="auth-link">
            Create Free Account
          </Link>
        </div>
      </div>
    </div>
  );
};
