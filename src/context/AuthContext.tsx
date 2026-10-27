import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types/index.ts';
import { api } from '../services/api.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (loginId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  switchDemoUser: (loginId: string, pin: string) => Promise<void>;
  hasRole: (roles: Array<User['role']>) => boolean;
  isMasterAdmin: boolean;
  isModerator: boolean;
  isBookingPoint: boolean;
  isMasterBookingCounter: boolean;
  canManageTrips: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('zb_auth_token'));
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const savedToken = localStorage.getItem('zb_auth_token');
    if (!savedToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getMe();
      setUser(data.user);
    } catch {
      localStorage.removeItem('zb_auth_token');
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (loginId: string, pin: string) => {
    setLoading(true);
    try {
      const res = await api.login(loginId, pin);
      localStorage.setItem('zb_auth_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  };

  const switchDemoUser = async (loginId: string, pin: string) => {
    await login(loginId, pin);
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      localStorage.removeItem('zb_auth_token');
      setToken(null);
      setUser(null);
    }
  };

  const hasRole = (roles: Array<User['role']>) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const isMasterAdmin = user?.role === 'master_admin';
  const isModerator = user?.role === 'moderator' || isMasterAdmin;
  const isBookingPoint = user?.role === 'booking_point';
  const isMasterBookingCounter = user?.role === 'booking_point' && user?.counterType === 'master_booking';
  const canManageTrips = isMasterAdmin || user?.role === 'moderator' || Boolean(isMasterBookingCounter);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        switchDemoUser,
        hasRole,
        isMasterAdmin,
        isModerator,
        isBookingPoint,
        isMasterBookingCounter: Boolean(isMasterBookingCounter),
        canManageTrips,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
