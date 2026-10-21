import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Terminal,
  LogIn,
  UserPlus,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-left">
          <Link to="/" className="brand-logo" title="Debug Dynasty — AI Coding Debugger">
            <div className="logo-icon-wrap">
              <Terminal size={19} className="text-cyan-400" />
            </div>
            <span className="brand-title">Debug Dynasty</span>
            <span className="brand-badge">AI</span>
          </Link>

          <nav className="header-nav">
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              Home
            </Link>
            <Link
              to="/debug"
              className={`nav-link ${location.pathname.startsWith('/debug') ? 'active' : ''}`}
            >
              Debugger
            </Link>
            {isAuthenticated && (
              <Link
                to="/dashboard"
                className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
              >
                Dashboard
              </Link>
            )}
            <Link
              to="/history"
              className={`nav-link ${location.pathname === '/history' ? 'active' : ''}`}
            >
              History
            </Link>
            <Link
              to="/evaluation"
              className={`nav-link ${location.pathname === '/evaluation' ? 'active' : ''}`}
            >
              Evaluation
            </Link>
            <Link
              to="/settings"
              className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}
            >
              Settings
            </Link>
          </nav>
        </div>

        <div className="header-right">
          {isAuthenticated ? (
            <div className="user-nav-menu">
              <Link to="/profile" className="user-profile-button" title="View account profile">
                <div className="user-avatar-circle">
                  {user?.username.charAt(0).toUpperCase()}
                </div>
                <span className="user-name-label">{user?.username}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="btn btn-ghost btn-sm"
                title="Log out of account"
              >
                <LogOut size={16} />
                <span className="hidden-mobile">Logout</span>
              </button>
            </div>
          ) : (
            <div className="auth-action-buttons">
              <Link to="/login" className="btn btn-ghost btn-sm">
                <LogIn size={15} />
                <span>Log In</span>
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                <UserPlus size={15} />
                <span>Get Started</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
