import React, { useState, useEffect } from 'react';
import { Settings, Save, Shield, Sliders, Database, RotateCcw } from 'lucide-react';
import { storage } from '../services/storage';
import { useToast } from '../context/ToastContext';

export const SettingsPage: React.FC = () => {
  const { success, info } = useToast();
  const [defaultLang, setDefaultLang] = useState('python');
  const [autoRun, setAutoRun] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const s = storage.getSettings();
    setDefaultLang(s.defaultLanguage);
    setAutoRun(s.autoRunSandbox);
    setHighContrast(s.highContrastDiff);
  }, []);

  const handleSave = () => {
    storage.saveSettings({
      defaultLanguage: defaultLang,
      autoRunSandbox: autoRun,
      highContrastDiff: highContrast,
    });
    success('Preferences saved successfully.');
  };

  const handleClearPreservedWork = () => {
    storage.clearPendingWork();
    info('Saved draft code and form values cleared.');
  };

  return (
    <div className="settings-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Application Settings</h1>
          <p className="page-subtitle">Configure workspace preferences, execution parameters, and local data</p>
        </div>
        <button onClick={handleSave} className="btn btn-primary btn-sm">
          <Save size={15} />
          <span>Save Preferences</span>
        </button>
      </div>

      <div className="settings-cards-list mt-6 space-y-6">
        {/* Workspace Preferences */}
        <div className="content-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sliders size={18} className="text-blue-500" />
            <h3 className="font-semibold text-slate-800 text-base">Workspace & Editor Defaults</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-2 border-b border-slate-100">
              <div>
                <span className="font-medium text-slate-800 text-sm block">Default Programming Language</span>
                <span className="text-xs text-slate-500">Automatically selected when opening a new debugging session</span>
              </div>
              <select
                value={defaultLang}
                onChange={(e) => setDefaultLang(e.target.value)}
                className="select-field text-sm"
              >
                <option value="python">Python 3</option>
                <option value="javascript">JavaScript (Node.js)</option>
              </select>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-2 border-b border-slate-100">
              <div>
                <span className="font-medium text-slate-800 text-sm block">Auto-Run Sandbox Verification</span>
                <span className="text-xs text-slate-500">
                  Execute sandboxed verification immediately upon receiving proposed correction
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(e) => setAutoRun(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-slate-800 text-sm block">High Contrast Diff Highlighting</span>
                <span className="text-xs text-slate-500">
                  Enhance color saturation on added (+) and removed (-) code lines
                </span>
              </div>
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Security & Engine Boundaries Info */}
        <div className="content-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-emerald-500" />
            <h3 className="font-semibold text-slate-800 text-base">Sandbox & Security Policy</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="font-semibold text-slate-700 block mb-1">Execution Clock Timeout</span>
              <span className="text-slate-500">5,000 milliseconds (hard SIGKILL on runaway loops)</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="font-semibold text-slate-700 block mb-1">Maximum Output Buffer</span>
              <span className="text-slate-500">65,536 bytes (64 KB ceiling on combined stdout/stderr)</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="font-semibold text-slate-700 block mb-1">Process Isolation</span>
              <span className="text-slate-500">Ephemeral child process in randomized temporary directory</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="font-semibold text-slate-700 block mb-1">CWE-1236 Defense</span>
              <span className="text-slate-500">Formula sanitization prepends ' to =, +, -, and @ fields</span>
            </div>
          </div>
        </div>

        {/* Local Storage & Cache Controls */}
        <div className="content-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database size={18} className="text-slate-600" />
            <h3 className="font-semibold text-slate-800 text-base">Client Storage & Draft Cache</h3>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-slate-800 text-sm block">Clear Pending Draft Code</span>
              <span className="text-xs text-slate-500">
                Removes any saved source code or error descriptions stored in browser sessionStorage
              </span>
            </div>
            <button onClick={handleClearPreservedWork} className="btn btn-secondary btn-sm">
              <RotateCcw size={14} />
              <span>Clear Draft</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
