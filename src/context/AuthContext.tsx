import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types/index.ts';
import { api } from '../services/api.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
  login: (loginId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  switchDemoUser: (loginId: string, pin: string) => Promise<void>;
  hasRole: (roles: Array<User['role']>) => boolean;
  isSuperAdmin: boolean;
  isCompanyAdmin: boolean;
  isMasterAdmin: boolean;
  isModerator: boolean;
  isBookingPoint: boolean;
  isMasterBookingCounter: boolean;
  isFuelManager: boolean;
  isChecker: boolean;
  canManageFuel: boolean;
  canManageTrips: boolean;
  refreshUser: () => Promise<void>;
  updateOwnCredentials: (params: {
    currentPin: string;
    newLoginId?: string;
    newPin?: string;
  }) => Promise<{ message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('zb_auth_token'));
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(
    localStorage.getItem('zb_active_company_id')
  );
  const [loading, setLoading] = useState<boolean>(true);

  const setActiveCompanyId = (id: string | null) => {
    if (id) {
      localStorage.setItem('zb_active_company_id', id);
    } else {
      localStorage.removeItem('zb_active_company_id');
    }
    setActiveCompanyIdState(id);
    refreshUser();
  };

  const refreshUser = async () => {
    const savedToken = localStorage.getItem('zb_auth_token');
    if (!savedToken) {
      await api.ensureServerHydrated().catch(() => {});
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getMe();
      setUser(data.user);
    } catch (err: any) {
      // Only clear tokens if the server explicitly responded with 401 Unauthorized after auto-rehydrate
      if (err?.status === 401) {
        localStorage.removeItem('zb_auth_token');
        localStorage.removeItem('zb_active_company_id');
        setUser(null);
        setToken(null);
        setActiveCompanyIdState(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    const handleResumeSync = () => {
      if (document.visibilityState === 'visible') {
        api.ensureServerHydrated(true).catch(() => {});
      }
    };

    window.addEventListener('focus', handleResumeSync);
    document.addEventListener('visibilitychange', handleResumeSync);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        api.ensureServerHydrated(true).catch(() => {});
      }
    }, 120000);

    return () => {
      window.removeEventListener('focus', handleResumeSync);
      document.removeEventListener('visibilitychange', handleResumeSync);
      clearInterval(interval);
    };
  }, []);

  const login = async (loginId: string, pin: string) => {
    setLoading(true);
    try {
      const res = await api.login(loginId, pin);
      localStorage.setItem('zb_auth_token', res.token);
      if (res.user.companyId) {
        localStorage.setItem('zb_active_company_id', res.user.companyId);
        setActiveCompanyIdState(res.user.companyId);
      }
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
      localStorage.removeItem('zb_active_company_id');
      localStorage.removeItem('zb_active_tab');
      setToken(null);
      setUser(null);
      setActiveCompanyIdState(null);
    }
  };

  const updateOwnCredentials = async (params: {
    currentPin: string;
    newLoginId?: string;
    newPin?: string;
  }) => {
    const res = await api.updateOwnCredentials(params);
    if (res.token) setToken(res.token);
    if (res.user) setUser(res.user);
    return { message: res.message };
  };

  const hasRole = (roles: Array<User['role']>) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const isSuperAdmin = Boolean(user?.role === 'super_admin' && !user?.companyId);
  const isCompanyAdmin = user?.role === 'company_admin' || Boolean(user?.companyId && user?.role === 'master_admin');
  const isMasterAdmin = isSuperAdmin || isCompanyAdmin;
  const isModerator = user?.role === 'moderator' || isMasterAdmin;
  const isBookingPoint = user?.role === 'booking_point';
  const isMasterBookingCounter = user?.role === 'booking_point' && user?.counterType === 'master_booking';
  const isFuelManager = user?.role === 'fuel_manager';
  const isChecker = user?.role === 'checker';
  const canManageFuel = isModerator || isFuelManager;
  const canManageTrips = isMasterAdmin || user?.role === 'moderator' || Boolean(isMasterBookingCounter);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        activeCompanyId,
        setActiveCompanyId,
        login,
        logout,
        switchDemoUser,
        hasRole,
        isSuperAdmin,
        isCompanyAdmin,
        isMasterAdmin,
        isModerator,
        isBookingPoint,
        isMasterBookingCounter: Boolean(isMasterBookingCounter),
        isFuelManager,
        isChecker,
        canManageFuel,
        canManageTrips,
        refreshUser,
        updateOwnCredentials,
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
