import { PreservedDebugWork } from '../types';

const STORAGE_KEY_PENDING_WORK = 'ai_debugger_pending_work';
const STORAGE_KEY_SETTINGS = 'ai_debugger_user_settings';

export const storage = {
  savePendingWork(work: Omit<PreservedDebugWork, 'timestamp'>): void {
    try {
      const data: PreservedDebugWork = { ...work, timestamp: Date.now() };
      sessionStorage.setItem(STORAGE_KEY_PENDING_WORK, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save pending work to sessionStorage', e);
    }
  },

  getPendingWork(): PreservedDebugWork | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_PENDING_WORK);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  clearPendingWork(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY_PENDING_WORK);
    } catch {}
  },

  getSettings(): { defaultLanguage: string; autoRunSandbox: boolean; highContrastDiff: boolean } {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      defaultLanguage: 'python',
      autoRunSandbox: true,
      highContrastDiff: false,
    };
  },

  saveSettings(settings: { defaultLanguage: string; autoRunSandbox: boolean; highContrastDiff: boolean }): void {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {}
  }
};
