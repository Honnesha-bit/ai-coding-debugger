import {
  AuthStatusResponse,
  User,
  DebugResult,
  DebugSessionSummary,
  HistoryListResponse,
  HistoryListParams,
  EvaluationCase,
  EvaluationResult,
  ExecutionRun,
  LanguageMetadata,
  LanguageDetectionResult,
} from '../types';

export class ApiError extends Error {
  code?: string;
  status: number;
  remainingUses?: number;

  constructor(message: string, status: number, code?: string, remainingUses?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.remainingUses = remainingUses;
  }
}

const rawBase = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = rawBase.replace(/\/+$/, '');

export function buildApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!API_BASE) {
    return cleanEndpoint;
  }
  // If API_BASE ends with '/api' and endpoint starts with '/api', prevent duplicate '/api'
  if (API_BASE.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
    return `${API_BASE.slice(0, -4)}${cleanEndpoint}`;
  }
  return `${API_BASE}${cleanEndpoint}`;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('debugdynasty_token') : null;
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Ignore localStorage access errors
  }

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const url = buildApiUrl(endpoint);
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include session cookies
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Request failed with status ${response.status}`,
      response.status,
      data?.error || data?.code,
      data?.remainingUses
    );
  }

  return data as T;
}

export const api = {
  auth: {
    async getStatus(): Promise<AuthStatusResponse> {
      return request<AuthStatusResponse>('/api/v1/auth/status');
    },

    async login(credentials: { username: string; password: string }): Promise<{ user: User }> {
      return request<{ user: User }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
    },

    async register(credentials: { username: string; email: string; password: string }): Promise<{ user: User }> {
      return request<{ user: User }>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
    },

    async logout(): Promise<void> {
      await request('/api/v1/auth/logout', { method: 'POST' });
    },
  },

  debug: {
    async submit(payload: {
      language: string;
      sourceCode: string;
      errorDescription?: string;
      expectedOutput?: string;
      testCases?: string;
    }): Promise<DebugResult> {
      return request<DebugResult>('/api/v1/debug', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    async execute(payload: {
      language: string;
      sourceCode: string;
      testCases?: string;
    }): Promise<{ success: boolean; result: ExecutionRun }> {
      return request<{ success: boolean; result: ExecutionRun }>('/api/v1/execute', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  },

  history: {
    async list(params: HistoryListParams = {}): Promise<HistoryListResponse> {
      const searchParams = new URLSearchParams();
      if (params.page !== undefined) searchParams.set('page', String(params.page));
      if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
      if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
      if (params.language && params.language !== 'all') searchParams.set('language', params.language);
      if (params.status && params.status !== 'all') searchParams.set('status', params.status);
      if (params.search && params.search.trim()) searchParams.set('search', params.search.trim());

      const qs = searchParams.toString();
      const endpoint = qs ? `/api/v1/history?${qs}` : '/api/v1/history';
      return request<HistoryListResponse>(endpoint);
    },

    async get(id: string): Promise<any> {
      const res = await request<{ session: any }>(`/api/v1/history/${id}`);
      return res.session;
    },

    async delete(id: string): Promise<void> {
      await request(`/api/v1/history/${id}`, { method: 'DELETE' });
    },
  },

  evaluation: {
    async getCases(): Promise<EvaluationCase[]> {
      const res = await request<{ cases: EvaluationCase[] }>('/api/v1/evaluation/cases');
      return res.cases || [];
    },

    async run(): Promise<EvaluationResult> {
      const res = await request<{ run: EvaluationResult }>('/api/v1/evaluation/run', {
        method: 'POST',
      });
      return res.run;
    },

    async getResults(): Promise<EvaluationResult> {
      const res = await request<{ results: EvaluationResult }>('/api/v1/evaluation/results');
      return res.results;
    },

    async getRuns(): Promise<EvaluationResult[]> {
      const res = await request<{ runs: EvaluationResult[] }>('/api/v1/evaluation/runs');
      return res.runs || [];
    },

    getExportUrl(format: 'csv' | 'json'): string {
      return buildApiUrl(`/api/v1/evaluation/export?format=${format}`);
    },
  },

  languages: {
    async getAll(): Promise<LanguageMetadata[]> {
      const res = await request<{ languages: LanguageMetadata[] }>('/api/v1/languages');
      return res.languages || [];
    },

    async detect(payload: { code: string; filename?: string }): Promise<LanguageDetectionResult> {
      return request<LanguageDetectionResult>('/api/v1/languages/detect', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  },
};
