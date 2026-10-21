import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Code2,
  History,
  CheckCircle2,
  Clock,
  ArrowRight,
  PlusCircle,
  FileCode,
  ShieldAlert,
  BarChart2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { DebugSessionSummary } from '../types';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';

export const DashboardPage: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<DebugSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    const fetchRecentSessions = async () => {
      try {
        const data = await api.history.list({ limit: 5 });
        const list = Array.isArray(data?.sessions)
          ? data.sessions
          : (Array.isArray(data) ? (data as unknown as DebugSessionSummary[]) : []);
        setSessions(list);
      } catch (err) {
        console.warn('Failed to load dashboard sessions', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecentSessions();
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="dashboard-page p-6 space-y-6">
        <Skeleton height={40} className="w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="auth-required-panel">
        <div className="auth-req-card">
          <ShieldAlert size={36} className="text-cyan-400 mb-3" />
          <h2 className="text-lg font-bold text-slate-100">Authentication Required</h2>
          <p className="text-slate-400 text-sm max-w-sm my-2">
            Please log in or create an account to view your developer dashboard, verification stats, and session history.
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

  const verifiedCount = Array.isArray(sessions) ? sessions.filter((s) => s.verified).length : 0;

  return (
    <div className="dashboard-page">
      {/* Header Greeting */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Developer Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, <span className="font-semibold text-slate-800">{user?.username}</span>!
            Monitor your debugging sessions and verification status.
          </p>
        </div>
        <div className="header-actions">
          <Link to="/debug" className="btn btn-primary btn-md">
            <PlusCircle size={16} />
            <span>New Debug Session</span>
          </Link>
        </div>
      </div>

      {/* Metrics Stat Cards */}
      <div className="stats-cards-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-title">Total Sessions</span>
            <span className="stat-icon-wrap bg-blue-500/10 text-blue-500">
              <Code2 size={18} />
            </span>
          </div>
          <div className="stat-card-body">
            {loading ? <Skeleton width={60} height={32} /> : <span className="stat-value">{sessions.length}</span>}
            <span className="stat-subtext">Recorded in your private history</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-title">Verified Fixes</span>
            <span className="stat-icon-wrap bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <div className="stat-card-body">
            {loading ? (
              <Skeleton width={60} height={32} />
            ) : (
              <span className="stat-value text-emerald-600">{verifiedCount}</span>
            )}
            <span className="stat-subtext">Passed sandboxed execution test</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-title">Account Quota</span>
            <span className="stat-icon-wrap bg-indigo-500/10 text-indigo-500">
              <BarChart2 size={18} />
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-value text-indigo-600">Unlimited</span>
            <span className="stat-subtext">Logged-in authenticated access</span>
          </div>
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="content-card mt-6">
        <div className="card-top-bar">
          <div className="card-title-group">
            <History size={18} className="text-slate-600" />
            <h3 className="card-heading">Recent Debugging Sessions</h3>
          </div>
          <Link to="/history" className="card-action-link">
            <span>View All</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<FileCode size={36} className="text-slate-400" />}
            title="No debugging sessions yet"
            description="Start your first session by submitting a broken code snippet."
            action={{
              label: 'Open Debug Workspace',
              onClick: () => navigate('/debug'),
            }}
          />
        ) : (
          <div className="table-responsive">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Language</th>
                  <th>Error / Issue Description</th>
                  <th>Verification</th>
                  <th>Created At</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((session) => (
                  <tr key={session.id}>
                    <td>
                      <code className="session-id-pill">{session.id.substring(0, 12)}...</code>
                    </td>
                    <td>
                      <Badge variant="outline" size="sm">
                        {session.language}
                      </Badge>
                    </td>
                    <td className="max-w-xs truncate text-slate-700">
                      {session.errorDescription || '(No description provided)'}
                    </td>
                    <td>
                      <Badge variant={session.verified ? 'success' : 'warning'} dot size="sm">
                        {session.verified ? 'VERIFIED' : 'UNVERIFIED'}
                      </Badge>
                    </td>
                    <td className="text-slate-500 text-xs">
                      {new Date(session.createdAt).toLocaleDateString()} at{' '}
                      {new Date(session.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="text-right">
                      <Link to={`/debug/${session.id}`} className="btn btn-secondary btn-xs">
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
