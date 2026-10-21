import React from 'react';
import { User, Mail, Calendar, ShieldCheck, Key, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Badge } from '../components/common/Badge';

export const ProfilePage: React.FC = () => {
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="profile-page flex items-center justify-center min-h-[400px]">
        <div className="btn-spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="auth-required-panel">
        <div className="auth-req-card">
          <User size={36} className="text-cyan-400 mb-3" />
          <h2 className="text-lg font-bold text-slate-100">Please Log In</h2>
          <p className="text-slate-400 text-sm max-w-sm my-2">
            You must be logged in to view your profile and account details.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <Link to="/login" className="btn btn-primary btn-md">
              Sign In
            </Link>
            <Link to="/register" className="btn btn-outline btn-md">
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="profile-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">User Profile</h1>
          <p className="page-subtitle">Manage your personal developer account and authentication status</p>
        </div>
      </div>

      <div className="content-card profile-details-card mt-6">
        <div className="profile-header-banner">
          <div className="profile-avatar-large">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="profile-titles">
            <h2 className="profile-name">{user.username}</h2>
            <span className="profile-role">Registered Developer Account</span>
          </div>
          <Badge variant="success" dot size="sm" className="ml-auto">
            Active Account
          </Badge>
        </div>

        <div className="profile-info-grid mt-6">
          <div className="info-cell">
            <span className="info-label flex items-center gap-1.5">
              <User size={14} className="text-slate-400" /> Username
            </span>
            <span className="info-val">{user.username}</span>
          </div>

          <div className="info-cell">
            <span className="info-label flex items-center gap-1.5">
              <Mail size={14} className="text-slate-400" /> Email Address
            </span>
            <span className="info-val">{user.email}</span>
          </div>

          <div className="info-cell">
            <span className="info-label flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-400" /> Member Since
            </span>
            <span className="info-val">{new Date(user.created_at).toLocaleDateString()}</span>
          </div>

          <div className="info-cell">
            <span className="info-label flex items-center gap-1.5">
              <Key size={14} className="text-slate-400" /> User Identifier
            </span>
            <span className="info-val font-mono text-xs">{user.id}</span>
          </div>
        </div>

        <div className="profile-security-box mt-6">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Password & Security</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Passwords are cryptographically salted and hashed using standard Node.js scrypt. Session
                tokens are protected via HMAC-SHA256 and rotated upon every authentication.
              </p>
            </div>
          </div>
        </div>

        <div className="profile-actions-footer mt-6 pt-6 border-t border-slate-100 flex justify-end">
          <button onClick={handleLogout} className="btn btn-secondary btn-sm text-rose-600 hover:bg-rose-50">
            <LogOut size={15} />
            <span>Sign Out of All Sessions</span>
          </button>
        </div>
      </div>
    </div>
  );
};
