import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface UserProfile {
  id: string;
  name: string;
  username?: string;
  email: string;
  role?: string;
  token?: string;
  created_at?: string;
}

export type LoginParams = { username?: string; email?: string; password?: string } | string;
export type RegisterParams = { username?: string; name?: string; email?: string; password?: string } | string;

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentialsOrUser: LoginParams, password?: string) => Promise<void>;
  register: (dataOrName: RegisterParams, email?: string, password?: string) => Promise<void>;
  loginAsDemo: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem('debugdynasty_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isAuthenticated = Boolean(user);

  // Sync to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('debugdynasty_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('debugdynasty_user');
      localStorage.removeItem('debugdynasty_token');
    }
  }, [user]);

  // Check existing session on mount via /api/v1/auth/status
  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const token = localStorage.getItem('debugdynasty_token');
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/v1/auth/status`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          const profile: UserProfile = {
            id: data.user.id,
            name: data.user.username || data.user.name || data.user.email?.split('@')[0],
            username: data.user.username || data.user.email?.split('@')[0],
            email: data.user.email,
            role: data.user.role || 'Developer',
            created_at: data.user.created_at,
            token: token || undefined,
          };
          setUser(profile);
          return;
        } else {
          setUser(null);
        }
      }
    } catch {
      // Offline or network error; keep localStorage user as fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (credentialsOrUser: LoginParams, passwordArg?: string): Promise<void> => {
    let identifier = '';
    let password = '';

    if (typeof credentialsOrUser === 'string') {
      identifier = credentialsOrUser.trim();
      password = passwordArg || '';
    } else if (credentialsOrUser && typeof credentialsOrUser === 'object') {
      identifier = (credentialsOrUser.username || credentialsOrUser.email || '').trim();
      password = credentialsOrUser.password || '';
    }

    if (!identifier) {
      throw new Error('Please enter a username or email address.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username: identifier, email: identifier, identifier, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Invalid username or password.');
    }

    const loggedInUser: UserProfile = {
      id: data.user?.id || `user_${Date.now()}`,
      name: data.user?.username || identifier.split('@')[0],
      username: data.user?.username || identifier.split('@')[0],
      email: data.user?.email || (identifier.includes('@') ? identifier : `${identifier}@debugdynasty.dev`),
      role: data.user?.role || 'Developer',
      token: data.token,
      created_at: data.user?.created_at,
    };

    setUser(loggedInUser);
    if (loggedInUser.token) {
      localStorage.setItem('debugdynasty_token', loggedInUser.token);
    }
  };

  const register = async (
    dataOrName: RegisterParams,
    emailArg?: string,
    passwordArg?: string
  ): Promise<void> => {
    let username = '';
    let email = '';
    let password = '';

    if (typeof dataOrName === 'string') {
      username = dataOrName.trim();
      email = (emailArg || '').trim();
      password = passwordArg || '';
    } else if (dataOrName && typeof dataOrName === 'object') {
      username = (dataOrName.username || dataOrName.name || '').trim();
      email = (dataOrName.email || '').trim();
      password = dataOrName.password || '';
    }

    if (!username) {
      throw new Error('Please enter a username or full name.');
    }
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Registration failed.');
    }

    const newUser: UserProfile = {
      id: data.user?.id || `user_${Date.now()}`,
      name: data.user?.username || username,
      username: data.user?.username || username,
      email: data.user?.email || email,
      role: data.user?.role || 'Developer',
      token: data.token,
      created_at: data.user?.created_at,
    };

    setUser(newUser);
    if (newUser.token) {
      localStorage.setItem('debugdynasty_token', newUser.token);
    }
  };

  const loginAsDemo = async (): Promise<void> => {
    // Attempt backend registration/login for demo staff engineer
    const demoCredentials = { username: 'alexchen', password: 'DemoPassword123!' };
    try {
      await login(demoCredentials);
    } catch {
      try {
        await register({
          username: 'alexchen',
          email: 'alex.chen@debugdynasty.dev',
          password: 'DemoPassword123!',
        });
      } catch {
        // Fallback local session if backend auth is unreachable
        const demoUser: UserProfile = {
          id: 'usr_demo_01',
          name: 'Alex Chen',
          email: 'alex.chen@debugdynasty.dev',
          role: 'Staff Engineer',
          token: 'dynasty_tok_demo_alexchen_2026',
        };
        setUser(demoUser);
        localStorage.setItem('debugdynasty_token', demoUser.token!);
      }
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      localStorage.removeItem('debugdynasty_user');
      localStorage.removeItem('debugdynasty_token');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, register, loginAsDemo, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
