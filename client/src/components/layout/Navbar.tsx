import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Terminal,
  Shield,
  LogIn,
  UserPlus,
  LogOut,
  LayoutDashboard,
  History,
  Sparkles,
  Menu,
  X,
  Code2,
  BarChart3,
  User
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../common/Badge';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, guestStatus, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const getGuestBadgeVariant = () => {
    if (guestStatus.remainingUses === 2) return 'primary';
    if (guestStatus.remainingUses === 1) return 'warning';
    return 'danger';
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-left">
          <Link to="/" className="brand-logo">
            <div className="logo-icon-wrap">
              <Terminal size={20} className="text-blue-500" />
            </div>
            <span className="brand-title">AI Coding Debugger</span>
            <span className="brand-badge">SaaS</span>
          </Link>

          <nav className="header-nav hidden md:flex">
            <Link
              to="/debug"
              className={`nav-link ${location.pathname.startsWith('/debug') ? 'active' : ''}`}
            >
              Workspace
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
              Benchmark
            </Link>
          </nav>
        </div>

        <div className="header-right">
          {/* Guest Usage Counter Badge */}
          {!isAuthenticated && (
            <div className="guest-quota-wrapper" title="Remaining free guest debugging quota">
              <Badge variant={getGuestBadgeVariant()} dot>
                {guestStatus.remainingUses === 2 && 'Free uses: 2'}
                {guestStatus.remainingUses === 1 && 'Free uses: 1'}
                {guestStatus.remainingUses <= 0 && '0 Free uses left'}
              </Badge>
            </div>
          )}

          {isAuthenticated ? (
            <div className="user-nav-menu hidden sm:flex">
              <Link to="/profile" className="user-profile-button">
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
            <div className="auth-action-buttons hidden sm:flex">
              <Link to="/login" className="btn btn-ghost btn-sm">
                <LogIn size={15} />
                <span>Log In</span>
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                <UserPlus size={15} />
                <span>Create Account</span>
              </Link>
            </div>
          )}

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="btn btn-ghost btn-sm md:hidden p-1.5 text-slate-600"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2 shadow-lg animate-fadeIn">
          <Link
            to="/debug"
            className={`flex items-center gap-2 p-2 rounded-lg text-sm font-medium ${
              location.pathname.startsWith('/debug') ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Code2 size={16} />
            <span>Debugger Workspace</span>
          </Link>
          {isAuthenticated && (
            <Link
              to="/dashboard"
              className={`flex items-center gap-2 p-2 rounded-lg text-sm font-medium ${
                location.pathname === '/dashboard' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </Link>
          )}
          <Link
            to="/history"
            className={`flex items-center gap-2 p-2 rounded-lg text-sm font-medium ${
              location.pathname === '/history' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <History size={16} />
            <span>Session History</span>
          </Link>
          <Link
            to="/evaluation"
            className={`flex items-center gap-2 p-2 rounded-lg text-sm font-medium ${
              location.pathname === '/evaluation' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <BarChart3 size={16} />
            <span>Held-Out Benchmark</span>
          </Link>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  className="flex items-center gap-2 p-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <User size={16} />
                  <span>Account ({user?.username})</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 p-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 w-full text-left"
                >
                  <LogOut size={16} />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-1">
                <Link to="/login" className="btn btn-secondary btn-sm flex-1 text-center">
                  Log In
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm flex-1 text-center">
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
