import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, User, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { storage } from '../services/storage';

export const RegisterPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { register, isAuthenticated, isLoading } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const pendingWork = storage.getPendingWork();
  const fromState = location.state?.from;
  const fromPath = typeof fromState === 'string' ? fromState : fromState?.pathname;
  const redirectTarget = fromPath || (pendingWork?.sourceCode ? '/debugger' : '/debugger');

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(redirectTarget, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, redirectTarget]);

  const isPasswordValid = password.length >= 6;
  const doPasswordsMatch = password && confirmPassword && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg('');

    const trimmedUser = username.trim();
    const trimmedEmail = email.trim();

    if (trimmedUser.length < 3) {
      setErrorMsg('Username must be at least 3 characters.');
      return;
    }
    if (trimmedUser.length > 32) {
      setErrorMsg('Username cannot exceed 32 characters.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!isPasswordValid) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (password.length > 128) {
      setErrorMsg('Password cannot exceed 128 characters.');
      return;
    }
    if (!doPasswordsMatch) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await register({
        username: trimmedUser,
        email: trimmedEmail,
        password,
      });
      success('Account created successfully! Welcome to Debug Dynasty.');
      navigate(redirectTarget, { replace: true });
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message?.includes('fetch')) {
        setErrorMsg('Unable to connect to the authentication server. Please check your network and try again.');
      } else if (err.status === 429) {
        setErrorMsg('Too many registration attempts. Please wait 1 minute before retrying.');
      } else if (err.message?.includes('Username already taken')) {
        setErrorMsg('Username is already taken. Please choose another username.');
      } else if (err.message?.includes('Email already registered')) {
        setErrorMsg('An account with this email address already exists. Please log in.');
      } else {
        setErrorMsg(err.message || 'Registration failed. Please check your details and try again.');
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
            <UserPlus size={22} className="text-emerald-500" />
          </div>
          <h2 className="auth-title">Create your free account</h2>
          <p className="auth-subtitle">Unlock unlimited debugging sessions and history tracking</p>
        </div>

        {errorMsg && (
          <div className="auth-error-alert" role="alert">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="reg-username" className="form-label">
              Username
            </label>
            <div className="input-wrap">
              <span className="input-icon-prefix">
                <User size={16} />
              </span>
              <input
                id="reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="developer1"
                className="form-input with-prefix"
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-email" className="form-label">
              Email Address
            </label>
            <div className="input-wrap">
              <span className="input-icon-prefix">
                <Mail size={16} />
              </span>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@example.com"
                className="form-input with-prefix"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-password" className="form-label">
              Password
            </label>
            <div className="input-wrap">
              <span className="input-icon-prefix">
                <Lock size={16} />
              </span>
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="form-input with-prefix with-suffix"
                autoComplete="new-password"
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

          <div className="form-group">
            <label htmlFor="reg-confirm-password" className="form-label">
              Confirm Password
            </label>
            <div className="input-wrap">
              <span className="input-icon-prefix">
                <Lock size={16} />
              </span>
              <input
                id="reg-confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="form-input with-prefix"
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="password-checklist">
            <div className={`check-item ${isPasswordValid ? 'met' : ''}`}>
              <Check size={14} />
              <span>At least 6 characters</span>
            </div>
            {confirmPassword && (
              <div className={`check-item ${doPasswordsMatch ? 'met' : ''}`}>
                <Check size={14} />
                <span>Passwords match</span>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-block btn-lg mt-2">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="btn-spinner" />
                <span>Creating Account...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>Create Free Account</span>
                <ArrowRight size={16} />
              </span>
            )}
          </button>
        </form>

        <div className="auth-footer-prompt">
          <span>Already have an account?</span>{' '}
          <Link to="/login" className="auth-link">
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
};
