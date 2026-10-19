import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  ExternalLink,
  PlusCircle,
  FileCode,
  Info,
  Clock,
  Gauge
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { DebugSessionSummary, LanguageMetadata } from '../types';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';

export const HistoryPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { success, error } = useToast();

  const [sessions, setSessions] = useState<DebugSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<LanguageMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const pageSize = 8;

  // Fetch supported languages dynamically from LanguageRegistry
  useEffect(() => {
    let mounted = true;
    api.languages.getAll()
      .then((data) => {
        if (mounted) setLanguages(data);
      })
      .catch(() => {
        // Fallback gracefully without breaking UI
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Debounce search query to prevent rapid database requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch paginated & filtered sessions from the backend
  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const data = await api.history.list({
          page,
          limit: pageSize,
          language: langFilter,
          status: statusFilter,
          search: debouncedSearch
        });
        if (!cancelled) {
          setSessions(data.sessions || []);
          setTotalCount(data.totalCount || 0);
          setTotalPages(data.totalPages || 1);
        }
      } catch (err: any) {
        if (!cancelled) {
          error(err.message || 'Failed to load debugging history.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, langFilter, statusFilter, refreshTrigger, error]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this debugging session from history?')) return;
    try {
      await api.history.delete(id);
      success('Session deleted.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      error(err.message || 'Failed to delete session.');
    }
  };

  const renderStatusBadge = (session: DebugSessionSummary) => {
    const status = session.verificationStatus;
    if (status === 'FIX VERIFIED') {
      return (
        <Badge variant="success" dot size="sm">
          FIX VERIFIED
        </Badge>
      );
    }
    if (status === 'FIX PARTIALLY VERIFIED') {
      return (
        <Badge variant="warning" dot size="sm">
          PARTIAL FIX
        </Badge>
      );
    }
    if (status === 'FIX NOT VERIFIED') {
      return (
        <Badge variant="danger" dot size="sm">
          NOT VERIFIED
        </Badge>
      );
    }
    if (status === 'ANALYSIS FAILED') {
      return (
        <Badge variant="danger" dot size="sm">
          FAILED
        </Badge>
      );
    }
    return (
      <Badge variant={session.verified ? 'success' : 'warning'} dot size="sm">
        {session.verified ? 'VERIFIED' : 'UNVERIFIED'}
      </Badge>
    );
  };

  return (
    <div className="history-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Debugging History</h1>
          <p className="page-subtitle">Search, filter, and inspect previous debugging operations</p>
        </div>
        <Link to="/debug" className="btn btn-primary btn-sm">
          <PlusCircle size={15} />
          <span>New Session</span>
        </Link>
      </div>

      {/* Guest Mode Informational Banner */}
      {!isAuthenticated && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Info size={18} className="text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Guest Session History:</strong> You are viewing temporary history stored for this browser. Sign in or create a free account to permanently preserve and access your debugging history across devices.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to="/login" className="btn btn-secondary btn-xs">
              Sign In
            </Link>
            <Link to="/register" className="btn btn-primary btn-xs">
              Register
            </Link>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="filter-controls-bar content-card p-4 mt-4">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by error description, keywords, or session ID..."
            className="search-input"
          />
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <span className="filter-label">Language:</span>
            <select
              value={langFilter}
              onChange={(e) => {
                setLangFilter(e.target.value);
                setPage(1);
              }}
              className="select-field text-xs py-1.5"
            >
              <option value="all">All Languages</option>
              {languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-label">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="select-field text-xs py-1.5"
            >
              <option value="all">All Results</option>
              <option value="verified">Verified Fix</option>
              <option value="unverified">Unverified Fix</option>
              <option value="FIX VERIFIED">Status: Fix Verified</option>
              <option value="FIX PARTIALLY VERIFIED">Status: Partially Verified</option>
              <option value="FIX NOT VERIFIED">Status: Not Verified</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="content-card mt-4">
        {loading ? (
          <div className="p-6 space-y-4">
            <Skeleton height={44} className="w-full" />
            <Skeleton height={44} className="w-full" />
            <Skeleton height={44} className="w-full" />
            <Skeleton height={44} className="w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<FileCode size={38} className="text-slate-400" />}
            title="No sessions match your filters"
            description={
              totalCount === 0 && !debouncedSearch && langFilter === 'all' && statusFilter === 'all'
                ? 'You have not completed any debugging sessions yet. Start debugging code to see your history here!'
                : 'Try adjusting your search query or filter selections.'
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Language</th>
                  <th>Observed Error & Code Preview</th>
                  <th>Verification Status</th>
                  <th>Diagnostics</th>
                  <th>Timestamp</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <code className="session-id-pill" title={session.id}>
                        {session.id.substring(0, 14)}
                      </code>
                    </td>
                    <td>
                      <Badge variant="outline" size="sm">
                        {session.language}
                      </Badge>
                    </td>
                    <td className="max-w-xs md:max-w-md">
                      <div className="truncate font-medium text-slate-800 text-xs">
                        {session.errorDescription || '(No description)'}
                      </div>
                      {session.sourceCodePreview && (
                        <div
                          className="truncate text-[11px] text-slate-500 font-mono mt-0.5"
                          title={session.sourceCodePreview}
                        >
                          {session.sourceCodePreview}
                        </div>
                      )}
                    </td>
                    <td>
                      {renderStatusBadge(session)}
                    </td>
                    <td>
                      <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                        {session.confidence && (
                          <span className="capitalize">
                            Confidence: <strong>{session.confidence}</strong>
                          </span>
                        )}
                        {session.durationMs != null && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} className="text-slate-400" />
                            {session.durationMs}ms
                          </span>
                        )}
                        {!session.confidence && session.durationMs == null && (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">
                      {new Date(session.createdAt).toLocaleDateString()} at{' '}
                      {new Date(session.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="text-right space-x-2 whitespace-nowrap">
                      <Link
                        to={`/debug/${session.id}`}
                        className="btn btn-secondary btn-xs inline-flex items-center gap-1"
                      >
                        <span>Inspect</span>
                        <ExternalLink size={12} />
                      </Link>
                      <button
                        onClick={() => handleDelete(session.id)}
                        className="btn btn-ghost btn-xs text-rose-500 hover:bg-rose-50"
                        title="Delete session"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalCount > 0 && (
          <div className="pagination-bar p-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * pageSize + 1} to{' '}
              {Math.min(page * pageSize, totalCount)} of {totalCount} sessions
            </span>
            {totalPages > 1 && (
              <div className="pagination-buttons flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary btn-xs"
                >
                  Previous
                </button>
                <span className="px-2 py-1 text-xs text-slate-700 font-medium">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-secondary btn-xs"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
