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
  KeyRound,
  X,
  CheckCircle,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  pageTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileMenu,
  pageTitle,
}) => {
  const { user, isSuperAdmin, isCompanyAdmin, activeCompanyId, setActiveCompanyId, logout, updateOwnCredentials } = useAuth();
  const [dhakaTime, setDhakaTime] = useState<string>('');
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);

  // Change Own Login ID & PIN Modal State
  const [isCredModalOpen, setIsCredModalOpen] = useState<boolean>(false);
  const [currentPin, setCurrentPin] = useState<string>('');
  const [newLoginId, setNewLoginId] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmNewPin, setConfirmNewPin] = useState<string>('');
  const [credError, setCredError] = useState<string>('');
  const [credSuccess, setCredSuccess] = useState<string>('');
  const [credSubmitting, setCredSubmitting] = useState<boolean>(false);

  const loadCompanies = useCallback(() => {
    if (isSuperAdmin) {
      api.getCompanies().then((res: { companies: Company[] }) => {
        setCompaniesList(res.companies.map((c: Company) => ({ id: c.id, name: c.name })));
      }).catch(() => {});
    } else {
      setCompaniesList([]);
    }
  }, [isSuperAdmin]);

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

  const openCredentialsModal = () => {
    setCurrentPin('');
    setNewLoginId(user?.loginId || '');
    setNewPin('');
    setConfirmNewPin('');
    setCredError('');
    setCredSuccess('');
    setIsCredModalOpen(true);
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError('');
    setCredSuccess('');

    if (!currentPin.trim()) {
      setCredError('যাচাইয়ের জন্য বর্তমান পিন কোড লিখুন।');
      return;
    }

    const cleanLoginId = newLoginId.trim();
    const cleanNewPin = newPin.trim();
    const cleanConfirmPin = confirmNewPin.trim();

    if (!cleanLoginId && !cleanNewPin) {
      setCredError('পরিবর্তনের জন্য নতুন লগইন আইডি অথবা নতুন পিন দিন।');
      return;
    }

    if (cleanLoginId && (cleanLoginId.length < 3 || /\s/.test(cleanLoginId))) {
      setCredError('লগইন আইডি কমপক্ষে ৩ অক্ষরের হতে হবে এবং কোনো স্পেস থাকা যাবে না।');
      return;
    }

    if (cleanNewPin) {
      if (cleanNewPin.length < 4 || cleanNewPin.length > 6) {
        setCredError('নতুন পিন কোড অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।');
        return;
      }
      if (cleanNewPin !== cleanConfirmPin) {
        setCredError('নতুন পিন এবং কনফার্ম পিন একরকম হয়নি!');
        return;
      }
    }

    setCredSubmitting(true);
    try {
      const res = await updateOwnCredentials({
        currentPin: currentPin.trim(),
        newLoginId: cleanLoginId && cleanLoginId !== user?.loginId ? cleanLoginId : undefined,
        newPin: cleanNewPin || undefined,
      });
      setCredSuccess(res.message || 'লগইন আইডি ও পিন সফলভাবে পরিবর্তন হয়েছে!');
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
    } catch (err: any) {
      setCredError(err.message || 'লগইন তথ্য পরিবর্তন করা যায়নি।');
    } finally {
      setCredSubmitting(false);
    }
  };

  const activeCompanyName = companiesList.find((c) => c.id === activeCompanyId)?.name;

  return (
    <>
      {isSuperAdmin && activeCompanyId && (
        <div className="bg-amber-500 text-slate-900 px-4 py-1.5 text-xs font-semibold flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-slate-950 shrink-0" />
            <span>
              আপনি <strong>{activeCompanyName || 'নির্বাচিত কোম্পানি'}</strong> এর ডাটা মোডে আছেন।
            </span>
          </div>
          <button
            type="button"
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

          <div className="flex items-center gap-2.5">
            <img
              src={user?.company?.logoUrl || '/assets/aistudio/1795612353186_f79fafda.jpg'}
              alt={user?.company?.name || 'Counter Management'}
              className="w-8 h-8 rounded-lg object-cover border border-emerald-500/30 shadow-xs shrink-0 hidden sm:block"
            />
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                {pageTitle}
              </h1>
              <div className="text-[11px] text-slate-500 hidden sm:block">
                {user?.company?.name ? `${user.company.name} — ` : ''}Counter Management System
              </div>
            </div>
          </div>
        </div>

        {/* Right: Company Switcher (Super Admin ONLY), Dhaka Clock, Assigned Counter, User Info */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isSuperAdmin && companiesList.length > 0 && (
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
                : isCompanyAdmin || user?.role === 'master_admin'
                ? 'মাস্টার এডমিন'
                : user?.role === 'moderator'
                ? 'মডারেটর'
                : user?.role === 'fuel_manager'
                ? 'ফুয়েল ম্যানেজার'
                : user?.role === 'checker'
                ? 'চেকার'
                : 'কাউন্টার অপারেটর'}
            </span>
          </div>

          {/* Change Own Login ID & PIN Button */}
          <button
            type="button"
            onClick={openCredentialsModal}
            title="নিজস্ব লগইন আইডি ও পিন পরিবর্তন করুন"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span className="hidden md:inline">আইডি ও পিন</span>
          </button>

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

      {/* Self-Service Login ID & PIN Change Modal */}
      {isCredModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="self-credentials-title"
        >
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="self-credentials-title" className="font-bold text-sm">
                    নিজস্ব লগইন আইডি ও পিন পরিবর্তন
                  </h3>
                  <div className="text-[11px] text-slate-300">{user?.name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !credSubmitting && setIsCredModalOpen(false)}
                disabled={credSubmitting}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCredentialsSubmit} className="p-5 space-y-4">
              {credSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{credSuccess}</span>
                </div>
              )}

              {credError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{credError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  বর্তমান পিন কোড *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="আপনার বর্তমান পিন দিন"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold tracking-widest outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  নতুন লগইন আইডি (Login ID)
                </label>
                <input
                  type="text"
                  value={newLoginId}
                  onChange={(e) => setNewLoginId(e.target.value.replace(/\s+/g, ''))}
                  placeholder="আপনার নতুন ইউনিক লগইন আইডি"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    নতুন পিন (৪-৬ ডিজিট)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="পরিবর্তন করতে চাইলে"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold tracking-widest outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    নতুন পিন নিশ্চিত করুন
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value)}
                    placeholder="পুনরায় পিন লিখুন"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold tracking-widest outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                গোপনীয়তা নিশ্চিত: আপনার পরিবর্তিত লগইন আইডি ও পিন সম্পূর্ণ এনক্রিপ্টেড অবস্থায় সংরক্ষিত থাকে এবং অন্য কেউ এটি দেখতে পায় না।
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCredModalOpen(false)}
                  disabled={credSubmitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  বন্ধ করুন
                </button>
                <button
                  type="submit"
                  disabled={credSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{credSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'আইডি ও পিন সংরক্ষণ করুন'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

