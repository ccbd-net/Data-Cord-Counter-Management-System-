import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Company } from '../types/index.ts';
import { useDataSync } from '../hooks/useDataSync.ts';
import { toBengaliDigits } from '../utils/formatters.ts';
import {
  Menu,
  Clock,
  LogOut,
  Building,
  Shield,
} from 'lucide-react';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  pageTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileMenu,
  pageTitle,
}) => {
  const { user, isSuperAdmin, isCompanyAdmin, activeCompanyId, setActiveCompanyId, logout } = useAuth();
  const [dhakaTime, setDhakaTime] = useState<string>('');
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);

  const loadCompanies = useCallback(() => {
    if (isSuperAdmin || user?.role === 'super_admin' || user?.role === 'master_admin') {
      api.getCompanies().then((res: { companies: Company[] }) => {
        setCompaniesList(res.companies.map((c: Company) => ({ id: c.id, name: c.name })));
      }).catch(() => {});
    }
  }, [isSuperAdmin, user?.role]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useDataSync(
    useCallback(() => {
      loadCompanies();
    }, [loadCompanies]),
    ['COMPANY_CHANGED', 'VAULT_REHYDRATED']
  );

  // Live Asia/Dhaka Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format in Asia/Dhaka
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      const timeStr = now.toLocaleTimeString('en-US', options);
      setDhakaTime(toBengaliDigits(timeStr));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCompanySwitch = (newCompanyId: string | null) => {
    setActiveCompanyId(newCompanyId);
    window.location.reload();
  };

  const activeCompanyName = companiesList.find((c) => c.id === activeCompanyId)?.name;

  return (
    <>
      {activeCompanyId && (
        <div className="bg-amber-500 text-slate-900 px-4 py-1.5 text-xs font-semibold flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-slate-950 shrink-0" />
            <span>
              🔍 আপনি <strong>{activeCompanyName || 'নির্বাচিত কোম্পানি'}</strong> এর ডাটা মোডে আছেন।
            </span>
          </div>
          <button
            onClick={() => handleCompanySwitch(null)}
            className="px-2.5 py-0.5 bg-slate-900 text-amber-300 rounded text-[11px] font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            মাস্টার প্ল্যাটফর্মে ফিরুন
          </button>
        </div>
      )}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 py-3 flex items-center justify-between shadow-xs">
        {/* Left: Mobile hamburger & Page Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="মেনু খুলুন"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              {pageTitle}
            </h1>
            <div className="text-[11px] text-slate-500 hidden sm:block">
              {user?.company?.name ? `${user.company.name} — ` : ''}Counter Management System
            </div>
          </div>
        </div>

        {/* Right: Company Switcher, Dhaka Clock, Assigned Counter, User Info */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Super Admin Quick Company Switcher */}
          {(isSuperAdmin || user?.role === 'super_admin' || user?.role === 'master_admin') && companiesList.length > 0 && (
            <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-xl text-xs shadow-2xs">
              <Building className="w-3.5 h-3.5 text-purple-700 shrink-0" />
              <span className="text-[11px] font-bold text-purple-900 hidden lg:inline">কোম্পানি:</span>
              <select
                value={activeCompanyId || ''}
                onChange={(e) => handleCompanySwitch(e.target.value || null)}
                className="bg-transparent font-bold text-purple-900 outline-none cursor-pointer text-xs max-w-[140px] sm:max-w-[180px] truncate"
              >
                <option value="">সকল কোম্পানি (ওভারভিউ)</option>
                {companiesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Asia/Dhaka Live Clock */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-emerald-600 animate-spin-slow" />
            <span>ঢাকা: {dhakaTime}</span>
          </div>

          {/* Current Counter Badge with Seat Color */}
          {user?.counterName && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800">
              <span
                className="w-3.5 h-3.5 rounded-full shadow-xs ring-1 ring-black/10 shrink-0"
                style={{ backgroundColor: user.counterColor || '#2563EB' }}
                title={`সিট কালার: ${user.counterColor}`}
              />
              <span className="hidden sm:inline truncate max-w-[150px]">{user.counterName}</span>
              <span className="text-[10px] text-slate-500 font-mono">({user.counterCode})</span>
            </div>
          )}

          {/* User Role Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {isSuperAdmin
                ? 'সুপার এডমিন'
                : isCompanyAdmin
                ? 'কোম্পানি এডমিন'
                : user?.role === 'master_admin'
                ? 'মাস্টার এডমিন'
                : user?.role === 'moderator'
                ? 'মডারেটর'
                : 'কাউন্টার অপারেটর'}
            </span>
          </div>

          {/* User Avatar & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-xs shadow-xs">
              {user?.name?.slice(0, 1) || 'U'}
            </div>

            <button
              type="button"
              onClick={logout}
              title="লগআউট করুন"
              className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
};
