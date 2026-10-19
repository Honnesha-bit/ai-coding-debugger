import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, GuestStatus } from '../types';
import { api } from '../services/api';

interface AuthContextValue {
  user: User | null;
  guestStatus: GuestStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  refreshAuth: () => Promise<void>;
  updateGuestStatus: (status: GuestStatus) => void;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  register: (credentials: { username: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const defaultGuestStatus: GuestStatus = {
  usageCount: 0,
  maxUses: 2,
  remainingUses: 2,
  isExhausted: false,
  message: 'Free debugging uses remaining: 2',
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [guestStatus, setGuestStatus] = useState<GuestStatus>(defaultGuestStatus);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await api.auth.getStatus();
      if (data.authenticated && data.user) {
        setUser(data.user);
        setGuestStatus({
          ...data.guestStatus,
          remainingUses: Infinity,
          isExhausted: false,
        });
      } else {
        setUser(null);
        if (data.guestStatus) {
          setGuestStatus(data.guestStatus);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch auth status', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.auth.login(credentials);
    setUser(res.user);
    setIsLoginModalOpen(false);
    await refreshAuth();
  };

  const register = async (credentials: { username: string; email: string; password: string }) => {
    const res = await api.auth.register(credentials);
    setUser(res.user);
    setIsLoginModalOpen(false);
    await refreshAuth();
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    await refreshAuth();
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);
  const updateGuestStatus = (status: GuestStatus) => setGuestStatus(status);

  return (
    <AuthContext.Provider
      value={{
        user,
        guestStatus,
        isAuthenticated: !!user,
        isLoading,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
        refreshAuth,
        updateGuestStatus,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
