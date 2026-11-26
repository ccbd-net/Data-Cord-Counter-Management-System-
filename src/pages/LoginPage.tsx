import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import {
  KeyRound,
  User as UserIcon,
  ShieldAlert,
  ArrowRight,
  Lock,
  Zap,
} from 'lucide-react';
import { PWAInstallBanner } from '../components/PWAInstallBanner.tsx';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId.trim() || !pin.trim()) {
      setError('অনুগ্রহ করে লগইন আইডি এবং পিন কোড প্রদান করুন।');
      return;
    }

    if (pin.length < 4 || pin.length > 6) {
      setError('পিন কোড অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।');
      return;
    }

    setLoading(true);
    try {
      await login(loginId.trim(), pin.trim());
    } catch (err: any) {
      setError(err.message || 'ভুল লগইন তথ্য! অনুগ্রহ করে সঠিক তথ্য প্রদান করুন।');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdminLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await api.resetAdmin();
      await login('admin', '1234');
    } catch (err: any) {
      setError(err.message || 'ডেমো লগইন ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex flex-col justify-between">
      <PWAInstallBanner />

      {/* Container */}
      <div className="w-full max-w-md mx-auto my-auto p-4">
        {/* App Logo & Header */}
        <div className="text-center mb-6">
          <img
            src="/assets/aistudio/1795612353186_f79fafda.jpg"
            alt="Data Code Logo"
            className="w-24 h-24 rounded-3xl object-cover shadow-2xl border-2 border-emerald-400/50 mx-auto mb-3 bg-slate-900"
          />
          <h1 className="text-2xl font-black text-white tracking-wide">
            Counter Management System
          </h1>
          <p className="text-emerald-400 font-bold text-sm mt-1">
            স্মার্ট বাস ও কাউন্টার টিকেটিং ম্যানেজমেন্ট
          </p>
          <div className="inline-block mt-2 px-3 py-1 bg-white/10 rounded-full text-slate-300 text-xs backdrop-blur-xs font-medium">
            Powered By Data&Code
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100">
          <div className="mb-6 border-b pb-4">
            <h2 className="text-lg font-bold text-slate-900">সিস্টেম ও কাউন্টার লগইন</h2>
            <p className="text-xs text-slate-500 mt-1">
              আপনার ব্যক্তিগত লগইন আইডি ও ৪-৬ ডিজিট সিকিউর পিন দিয়ে প্রবেশ করুন
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold flex items-center gap-2 border border-red-200">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                লগইন আইডি (Login ID)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="আপনার লগইন আইডি লিখুন"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-mono"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                সিকিউর পিন কোড (৪-৬ ডিজিট)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="আপনার পিন কোড লিখুন"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-950/20 hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                'যাচাই করা হচ্ছে...'
              ) : (
                <>
                  <span>লগইন করুন</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={handleQuickAdminLogin}
              disabled={loading}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span>⚡ ১-ক্লিকে মাস্টার এডমিন লগইন (ID: admin, PIN: 1234)</span>
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>সার্ভার-সাইড হ্যাশ ও সিকিউর পিন ভেরিফিকেশন সচল</span>
        </div>
      </div>
    </div>
  );
};

