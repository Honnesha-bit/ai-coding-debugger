import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Code2,
  History,
  BarChart3,
  User,
  Settings,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  const navItems = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/debug', label: 'Debugger Workspace', icon: Code2 },
    { to: '/history', label: 'Session History', icon: History },
    { to: '/evaluation', label: 'Held-Out Benchmark', icon: BarChart3 },
    { to: '/profile', label: 'Account Profile', icon: User },
    { to: '/settings', label: 'System Settings', icon: Settings },
  ];

  return (
    <aside className="app-sidebar" aria-label="Application Navigation">
      <div className="sidebar-section">
        <span className="sidebar-section-title">Navigation</span>
        <nav className="sidebar-nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={18} className="sidebar-item-icon" />
                <span className="sidebar-item-label">{item.label}</span>
                <ChevronRight size={14} className="sidebar-item-chevron" />
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-bottom-card">
        <div className="sandbox-security-indicator">
          <ShieldCheck size={16} className="text-emerald-500" />
          <div className="security-text">
            <span className="security-title">Isolated Sandbox</span>
            <span className="security-sub">Child Process + 5s Timeout</span>
          </div>
        </div>
        {user && (
          <div className="sidebar-user-footer">
            <div className="user-avatar-sm">{user.username.charAt(0).toUpperCase()}</div>
            <div className="user-info-text">
              <span className="user-display-name">{user.username}</span>
              <span className="user-email-text">{user.email}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
