import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  Shield,
  Sliders,
  Database,
  RotateCcw,
  Palette,
  Server,
  User,
  HelpCircle,
  CheckCircle2,
  Cpu,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { storage } from '../services/storage';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';

export const SettingsPage: React.FC = () => {
  const { user, isAuthenticated, isLoading, guestStatus } = useAuth();
  const { success, info } = useToast();

  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'backend' | 'account' | 'help'>('general');

  // Form State
  const [defaultLang, setDefaultLang] = useState('python');
  const [autoRun, setAutoRun] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState('14px');
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  useEffect(() => {
    const s = storage.getSettings();
    setDefaultLang(s.defaultLanguage || 'python');
    setAutoRun(s.autoRunSandbox !== undefined ? s.autoRunSandbox : true);
    setHighContrast(!!s.highContrastDiff);
  }, []);

  const handleSave = () => {
    storage.saveSettings({
      defaultLanguage: defaultLang,
      autoRunSandbox: autoRun,
      highContrastDiff: highContrast,
    });
    success('Settings saved successfully.');
  };

  const handleClearPreservedWork = () => {
    storage.clearPendingWork();
    info('Saved draft code and form values cleared.');
  };

  const handleResetDefaults = () => {
    setDefaultLang('python');
    setAutoRun(true);
    setHighContrast(false);
    setFontSize('14px');
    setShowLineNumbers(true);
    storage.saveSettings({
      defaultLanguage: 'python',
      autoRunSandbox: true,
      highContrastDiff: false,
    });
    info('Preferences reset to Debug Dynasty defaults.');
  };

  return (
    <div className="settings-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure workspace preferences, execution parameters, and local data</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleResetDefaults} className="btn btn-outline btn-sm">
            <RotateCcw size={14} />
            <span>Reset Defaults</span>
          </button>
          <button onClick={handleSave} className="btn btn-primary btn-sm">
            <Save size={15} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      <div className="settings-layout-grid mt-6">
        {/* Left Sidebar Tabs */}
        <aside className="settings-sidebar-nav">
          <button
            onClick={() => setActiveTab('general')}
            className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
          >
            <Sliders size={16} />
            <span>General</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`settings-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
          >
            <Palette size={16} />
            <span>Appearance</span>
          </button>

          <button
            onClick={() => setActiveTab('backend')}
            className={`settings-tab-btn ${activeTab === 'backend' ? 'active' : ''}`}
          >
            <Server size={16} />
            <span>API & Backend</span>
          </button>

          <button
            onClick={() => setActiveTab('account')}
            className={`settings-tab-btn ${activeTab === 'account' ? 'active' : ''}`}
          >
            <User size={16} />
            <span>Account</span>
          </button>

          <button
            onClick={() => setActiveTab('help')}
            className={`settings-tab-btn ${activeTab === 'help' ? 'active' : ''}`}
          >
            <HelpCircle size={16} />
            <span>Help & Support</span>
          </button>
        </aside>

        {/* Right Tab Content */}
        <div className="settings-content-main space-y-6">
          {activeTab === 'general' && (
            <>
              {/* Workspace Preferences */}
              <div className="content-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sliders size={18} className="text-cyan-400" />
                  <h3 className="font-semibold text-slate-100 text-base">Workspace & Editor Defaults</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-3 border-b border-cyan-500/10">
                    <div>
                      <span className="font-medium text-slate-100 text-sm block">Default Programming Language</span>
                      <span className="text-xs text-slate-400">Automatically preselected when opening a new debugging workspace session</span>
                    </div>
                    <select
                      value={defaultLang}
                      onChange={(e) => setDefaultLang(e.target.value)}
                      className="select-field text-sm"
                    >
                      <option value="python">Python 3</option>
                      <option value="javascript">JavaScript (Node.js)</option>
                      <option value="typescript">TypeScript</option>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                      <option value="c">C</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="sql">SQL</option>
                    </select>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-3 border-b border-cyan-500/10">
                    <div>
                      <span className="font-medium text-slate-100 text-sm block">Auto-Run Sandbox Verification</span>
                      <span className="text-xs text-slate-400">
                        Execute sandboxed test execution immediately upon generating proposed code fixes
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoRun}
                      onChange={(e) => setAutoRun(e.target.checked)}
                      className="h-4 w-4 rounded border-cyan-500/30 text-cyan-500 focus:ring-cyan-400 bg-[#070c18]"
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-3">
                    <div>
                      <span className="font-medium text-slate-100 text-sm block">High Contrast Diff Highlighting</span>
                      <span className="text-xs text-slate-400">
                        Enhance saturation on added (+) and removed (-) code lines in the diff viewer
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={highContrast}
                      onChange={(e) => setHighContrast(e.target.checked)}
                      className="h-4 w-4 rounded border-cyan-500/30 text-cyan-500 focus:ring-cyan-400 bg-[#070c18]"
                    />
                  </div>
                </div>
              </div>

              {/* Local Storage & Cache Controls */}
              <div className="content-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Database size={18} className="text-cyan-400" />
                  <h3 className="font-semibold text-slate-100 text-base">Client Storage & Preserved Drafts</h3>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="font-medium text-slate-100 text-sm block">Clear Pending Draft Code</span>
                    <span className="text-xs text-slate-400">
                      Removes any temporary code snippets or error logs stored in your browser session
                    </span>
                  </div>
                  <button onClick={handleClearPreservedWork} className="btn btn-secondary btn-sm shrink-0">
                    <RotateCcw size={14} />
                    <span>Clear Draft</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'appearance' && (
            <div className="content-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Palette size={18} className="text-cyan-400" />
                <h3 className="font-semibold text-slate-100 text-base">Theme & Visual Customization</h3>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-3 border-b border-cyan-500/10">
                  <div>
                    <span className="font-medium text-slate-100 text-sm block">Color Palette</span>
                    <span className="text-xs text-slate-400">Debug Dynasty Dark Navy with Cyan Glow (Optimized for developer focus)</span>
                  </div>
                  <Badge variant="primary" dot size="sm">
                    Dark Navy & Cyan
                  </Badge>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-3 border-b border-cyan-500/10">
                  <div>
                    <span className="font-medium text-slate-100 text-sm block">Editor Font Size</span>
                    <span className="text-xs text-slate-400">Monospace typography scale in code and diff viewers</span>
                  </div>
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                    className="select-field text-sm"
                  >
                    <option value="12px">12px (Compact)</option>
                    <option value="13px">13px (Standard)</option>
                    <option value="14px">14px (Recommended)</option>
                    <option value="16px">16px (Large)</option>
                  </select>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-3">
                  <div>
                    <span className="font-medium text-slate-100 text-sm block">Show Line Numbers</span>
                    <span className="text-xs text-slate-400">Display line gutters in the code editor and execution panels</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showLineNumbers}
                    onChange={(e) => setShowLineNumbers(e.target.checked)}
                    className="h-4 w-4 rounded border-cyan-500/30 text-cyan-500 focus:ring-cyan-400 bg-[#070c18]"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backend' && (
            <div className="content-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Server size={18} className="text-cyan-400" />
                <h3 className="font-semibold text-slate-100 text-base">Backend & Execution Sandbox Policy</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-[#070c18] border border-cyan-500/20 rounded-xl">
                  <span className="font-semibold text-cyan-300 block mb-1">AI Provider Pipeline</span>
                  <span className="text-slate-400">Primary: Google Gemini (Supported 2.0 Flash) with graceful fallback handling</span>
                </div>
                <div className="p-3.5 bg-[#070c18] border border-cyan-500/20 rounded-xl">
                  <span className="font-semibold text-cyan-300 block mb-1">Execution Clock Timeout</span>
                  <span className="text-slate-400">5,000 milliseconds (Hard SIGKILL on runaway loops)</span>
                </div>
                <div className="p-3.5 bg-[#070c18] border border-cyan-500/20 rounded-xl">
                  <span className="font-semibold text-cyan-300 block mb-1">Maximum Output Buffer</span>
                  <span className="text-slate-400">65,536 bytes (64 KB ceiling on combined stdout/stderr)</span>
                </div>
                <div className="p-3.5 bg-[#070c18] border border-cyan-500/20 rounded-xl">
                  <span className="font-semibold text-cyan-300 block mb-1">Sandbox Isolation</span>
                  <span className="text-slate-400">Docker container runtime with non-root security and network isolation</span>
                </div>
                <div className="p-3.5 bg-[#070c18] border border-cyan-500/20 rounded-xl">
                  <span className="font-semibold text-cyan-300 block mb-1">CSV CWE-1236 Defense</span>
                  <span className="text-slate-400">Sanitization automatically neutralizes formula triggers</span>
                </div>
                <div className="p-3.5 bg-[#070c18] border border-cyan-500/20 rounded-xl">
                  <span className="font-semibold text-cyan-300 block mb-1">Honest Verification</span>
                  <span className="text-slate-400">Fixes are strictly marked VERIFIED only when assertions execute and pass</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="content-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <User size={18} className="text-cyan-400" />
                <h3 className="font-semibold text-slate-100 text-base">Account & Subscription Status</h3>
              </div>

              {isLoading ? (
                <div className="p-4 bg-[#070c18] border border-cyan-500/20 rounded-xl space-y-2">
                  <div className="h-4 bg-slate-700/50 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-slate-700/30 rounded w-1/2 animate-pulse" />
                </div>
              ) : isAuthenticated ? (
                <div className="space-y-4">
                  <div className="p-4 bg-[#070c18] border border-cyan-500/20 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-100 text-sm block">{user?.username}</span>
                      <span className="text-xs text-slate-400">{user?.email}</span>
                    </div>
                    <Badge variant="primary" dot size="sm">
                      Full Account
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-400">
                    Your session history and benchmark records are stored persistently in SQLite.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-[#070c18] border border-cyan-500/20 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-100 text-sm block">Guest Session</span>
                      <span className="text-xs text-slate-400">Remaining free uses: {guestStatus.remainingUses} / 2</span>
                    </div>
                    <Badge variant={guestStatus.remainingUses > 0 ? 'warning' : 'danger'} dot size="sm">
                      {guestStatus.remainingUses > 0 ? `${guestStatus.remainingUses} Left` : 'Exhausted'}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-400">
                    Sign in or register to access unlimited debugging sessions and persistent cross-device history.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'help' && (
            <div className="content-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <HelpCircle size={18} className="text-cyan-400" />
                <h3 className="font-semibold text-slate-100 text-base">Help, Documentation & System Info</h3>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-[#070c18] border border-cyan-500/20 rounded-xl">
                  <span className="font-bold text-slate-100 text-sm block mb-1">Debug Dynasty v2.0.0</span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    AI Coding Debugger with honest sandbox verification. Built with React 19, TypeScript, Vite, Node.js, Express, and Docker Sandbox Isolation.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-[#070c18] border border-cyan-500/10 rounded-lg flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-slate-300">16 Languages Supported</span>
                  </div>
                  <div className="p-3 bg-[#070c18] border border-cyan-500/10 rounded-lg flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-slate-300">Docker Isolated Runtime</span>
                  </div>
                  <div className="p-3 bg-[#070c18] border border-cyan-500/10 rounded-lg flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-slate-300">25 Held-Out Benchmark Cases</span>
                  </div>
                  <div className="p-3 bg-[#070c18] border border-cyan-500/10 rounded-lg flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-slate-300">Automatic Draft Preservation</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
