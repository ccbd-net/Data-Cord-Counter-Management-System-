import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { browserDb } from '../services/browserDb.ts';
import { useDataSync } from '../hooks/useDataSync.ts';
import { toBengaliDigits } from '../utils/formatters.ts';
import type { SystemSettings } from '../types/index.ts';
import {
  Settings,
  Bell,
  Save,
  CheckCircle,
  AlertCircle,
  HardDrive,
  Download,
  Upload,
  Database,
  RefreshCw,
  AlertTriangle,
  X,
  KeyRound,
  Lock,
} from 'lucide-react';

type LocalBackupStats = Awaited<ReturnType<typeof browserDb.getLocalStorageStats>>;

export const SettingsPage: React.FC = () => {
  const { user, isMasterAdmin, isSuperAdmin, isCompanyAdmin, updateOwnCredentials } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({
    companyName: 'Counter Management System',
    subTitle: 'কাউন্টার বুকিং ও ট্রিপ ইনফরমেশন',
    hotline: '01711-000000',
    defaultFare: 550,
    noticeText: '',
    currency: '৳',
    timezone: 'Asia/Dhaka',
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Local Storage & Backup State
  const [localStats, setLocalStats] = useState<LocalBackupStats | null>(null);
  const [savingLocal, setSavingLocal] = useState<boolean>(false);
  const [exportingJson, setExportingJson] = useState<boolean>(false);
  const [cleaningOrphans, setCleaningOrphans] = useState<boolean>(false);
  const [pendingRestoreVault, setPendingRestoreVault] = useState<{
    fileName: string;
    vault: any;
    companiesCount: number;
    recordsCount: number;
  } | null>(null);
  const [restoringBackup, setRestoringBackup] = useState<boolean>(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  // Own Credentials (Login ID & PIN) Update State
  const [credCurrentPin, setCredCurrentPin] = useState<string>('');
  const [credNewLoginId, setCredNewLoginId] = useState<string>(user?.loginId || '');
  const [credNewPin, setCredNewPin] = useState<string>('');
  const [credConfirmPin, setCredConfirmPin] = useState<string>('');
  const [updatingCreds, setUpdatingCreds] = useState<boolean>(false);
  const [credError, setCredError] = useState<string>('');
  const [credSuccess, setCredSuccess] = useState<string>('');

  useEffect(() => {
    if (user?.loginId) {
      setCredNewLoginId(user.loginId);
    }
  }, [user?.loginId]);

  const loadLocalStats = useCallback(async () => {
    try {
      const stats = await browserDb.getLocalStorageStats();
      setLocalStats(stats);
    } catch {}
  }, []);

  useDataSync(loadLocalStats, [
    'BOOKING_CREATED',
    'BOOKING_CANCELLED',
    'SCHEDULE_CREATED',
    'SCHEDULE_UPDATED',
    'SCHEDULE_DELETED',
    'VEHICLE_UPDATED',
    'COUNTER_UPDATED',
    'ROUTE_UPDATED',
    'FUEL_ENTRY_CREATED',
    'COMPANY_CHANGED',
    'VAULT_REHYDRATED',
  ]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.getSettings();
        if (res.settings) {
          setSettings({
            companyName: res.settings.companyName || '',
            subTitle: res.settings.subTitle || '',
            hotline: res.settings.hotline || '',
            defaultFare: res.settings.defaultFare ?? 550,
            noticeText: res.settings.noticeText || '',
            currency: res.settings.currency || '৳',
            timezone: res.settings.timezone || 'Asia/Dhaka',
          });
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
    loadLocalStats();
  }, [loadLocalStats]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await api.updateSettings(settings);
      if (res.settings) {
        setSettings({
          companyName: res.settings.companyName || '',
          subTitle: res.settings.subTitle || '',
          hotline: res.settings.hotline || '',
          defaultFare: res.settings.defaultFare ?? 550,
          noticeText: res.settings.noticeText || '',
          currency: res.settings.currency || '৳',
          timezone: res.settings.timezone || 'Asia/Dhaka',
        });
      }
      setSuccessMsg('সিস্টেম সেটিংস সফলভাবে সংরক্ষিত হয়েছে!');
      await loadLocalStats();
    } catch (err: any) {
      setErrorMsg(err.message || 'সেটিংস সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError('');
    setCredSuccess('');

    if (!credCurrentPin.trim()) {
      setCredError('যাচাইয়ের জন্য আপনার বর্তমান পিন দিন।');
      return;
    }
    if (!credNewLoginId.trim() || credNewLoginId.trim().length < 3) {
      setCredError('লগইন আইডি কমপক্ষে ৩ অক্ষরের হতে হবে।');
      return;
    }
    if (credNewPin.trim()) {
      if (credNewPin.trim().length < 4 || credNewPin.trim().length > 6 || !/^\d+$/.test(credNewPin.trim())) {
        setCredError('নতুন পিন অবশ্যই ৪ থেকে ৬ ডিজিটের সংখ্যা হতে হবে।');
        return;
      }
      if (credNewPin.trim() !== credConfirmPin.trim()) {
        setCredError('নতুন পিন ও নিশ্চিতকরণ পিন মিলছে না।');
        return;
      }
    }

    setUpdatingCreds(true);
    try {
      const res = await updateOwnCredentials({
        currentPin: credCurrentPin.trim(),
        newLoginId: credNewLoginId.trim(),
        newPin: credNewPin.trim() || undefined,
      });
      setCredSuccess(res?.message || 'আপনার লগইন আইডি ও পিন সফলভাবে আপডেট হয়েছে!');
      setCredCurrentPin('');
      setCredNewPin('');
      setCredConfirmPin('');
    } catch (err: any) {
      setCredError(err.message || 'লগইন তথ্য আপডেট করা যায়নি।');
    } finally {
      setUpdatingCreds(false);
    }
  };

  const handleSaveLocalSnapshot = async () => {
    setSavingLocal(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const stats = await api.saveToLocalStorage();
      setLocalStats(stats);
      const sizeKb = Math.max(1, Math.round((stats.localStorageBytes || 0) / 1024));
      const scopeLabel = isSuperAdmin
        ? `${toBengaliDigits(stats.companies)} টি কোম্পানি · ${toBengaliDigits(sizeKb)} KB`
        : `${toBengaliDigits(sizeKb)} KB`;
      setSuccessMsg(
        `সম্পূর্ণ ডাটাবেইজ স্ন্যাপশট (${scopeLabel}) ব্রাউজারের লোকাল স্টোরেজ ও ইনডেক্সডডিবিতে সংরক্ষিত হয়েছে!`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'লোকাল স্টোরেজে সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setSavingLocal(false);
    }
  };

  const handleDownloadBackupJson = async () => {
    setExportingJson(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const vault = await api.exportFullBackup();
      const jsonStr = JSON.stringify(vault, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const todayStr = new Date().toISOString().split('T')[0];
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `counter-backup-${todayStr}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setSuccessMsg('সম্পূর্ণ ব্যাকআপ ফাইল (.json) ডাউনলোড শুরু হয়েছে!');
    } catch (err: any) {
      setErrorMsg(err.message || 'ব্যাকআপ ফাইল ডাউনলোড করা যায়নি।');
    } finally {
      setExportingJson(false);
    }
  };

  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg('');
    setSuccessMsg('');

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const vault = parsed?.vault || parsed;
        if (!vault || typeof vault !== 'object' || (!Array.isArray(vault.companies) && !Array.isArray(vault.vehicles))) {
          setErrorMsg('নির্বাচিত ফাইলটি সঠিক ব্যাকআপ (.json) ফরম্যাটে নেই।');
          return;
        }
        const companiesCount = Array.isArray(vault.companies) ? vault.companies.length : 0;
        const recordsCount =
          (vault.counters?.length || 0) +
          (vault.vehicles?.length || 0) +
          (vault.routes?.length || 0) +
          (vault.schedules?.length || 0) +
          (vault.bookings?.length || 0) +
          (vault.reconciliations?.length || 0) +
          (vault.fuelEntries?.length || 0);

        setPendingRestoreVault({
          fileName: file.name,
          vault,
          companiesCount,
          recordsCount,
        });
      } catch {
        setErrorMsg('ব্যাকআপ JSON ফাইলটি পড়া যায়নি। অনুগ্রহ করে সঠিক ফাইল নির্বাচন করুন।');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreVault) return;
    setRestoringBackup(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const result = await api.restoreFullBackup(pendingRestoreVault.vault);
      setPendingRestoreVault(null);
      await loadLocalStats();
      setSuccessMsg(
        `ব্যাকআপ থেকে ${toBengaliDigits(result.restoredCompanies)} টি কোম্পানি ও মোট ${toBengaliDigits(result.totalRestored)} টি রেকর্ড সফলভাবে রিস্টোর করা হয়েছে!`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'ব্যাকআপ রিস্টোর ব্যর্থ হয়েছে।');
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleCleanupOrphans = async () => {
    setCleaningOrphans(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.cleanupOrphans();
      await loadLocalStats();
      const total = (res.serverRemoved || 0) + (res.browserRemoved || 0);
      if (total > 0) {
        setSuccessMsg(
          `পূর্ববর্তী মুছে যাওয়া কোম্পানির অবশিষ্ট ${toBengaliDigits(total)} টি অরফান রেকর্ড পরিষ্কার করা হয়েছে!`
        );
      } else {
        setSuccessMsg('ডাটাবেইজ ও ব্রাউজার স্টোরেজ সম্পূর্ণ পরিষ্কার আছে — কোনো অরফান ডাটা পাওয়া যায়নি।');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'অরফান ডাটা পরিষ্কার ব্যর্থ হয়েছে।');
    } finally {
      setCleaningOrphans(false);
    }
  };

  const canManageBackup = isSuperAdmin || isCompanyAdmin || isMasterAdmin;
  const formattedLocalTime = localStats?.updatedAt
    ? new Date(localStats.updatedAt).toLocaleString('bn-BD', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'এখনো সংরক্ষিত হয়নি';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-600" />
          <span>সিস্টেম কনফিগারেশন ও সেটিংস</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          প্রতিষ্ঠানের নাম, সহায়তা হটলাইন, সার্বজনীন নোটিশ ও লোকাল স্টোরেজ ব্যাকআপ পরিচালনা করুন
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold border border-emerald-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold border border-red-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} className="text-red-700 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              প্রতিষ্ঠানের নাম (Company Brand)
            </label>
            <input
              type="text"
              value={settings.companyName ?? ''}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              disabled={loading}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              উপ-শিরোনাম (Sub Title)
            </label>
            <input
              type="text"
              value={settings.subTitle ?? ''}
              onChange={(e) => setSettings({ ...settings, subTitle: e.target.value })}
              disabled={loading}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              কেন্দ্রীয় সহায়তা হটলাইন
            </label>
            <input
              type="text"
              value={settings.hotline ?? ''}
              onChange={(e) => setSettings({ ...settings, hotline: e.target.value })}
              disabled={loading}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ডিফল্ট ট্রিপ ভাড়া (৳)
            </label>
            <input
              type="number"
              value={settings.defaultFare ?? ''}
              onChange={(e) => setSettings({ ...settings, defaultFare: Number(e.target.value) })}
              disabled={loading}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold tabular-nums outline-none focus:bg-white"
            />
          </div>
        </div>

        {/* Global Notice Text */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>কাউন্টার নোটিশ বোর্ড বার্তা</span>
          </label>
          <textarea
            value={settings.noticeText ?? ''}
            onChange={(e) => setSettings({ ...settings, noticeText: e.target.value })}
            disabled={loading}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white"
            rows={3}
            placeholder="কাউন্টার অপারেটরদের জন্য কোনো গুরুত্বপূর্ণ নোটিশ বা নির্দেশিকা..."
          />
        </div>

        {/* System Fixed Settings */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-500 font-medium">মুদ্রা প্রতীক (Currency):</span>
            <div className="font-bold text-slate-800 text-sm mt-0.5">৳ (বাংলাদেশি টাকা)</div>
          </div>
          <div>
            <span className="text-slate-500 font-medium">টাইমজোন (Timezone):</span>
            <div className="font-bold text-slate-800 text-sm mt-0.5">Asia/Dhaka (UTC+6)</div>
          </div>
        </div>

        {isMasterAdmin && (
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'সংরক্ষিত হচ্ছে...' : 'সেটিংস সংরক্ষণ করুন'}</span>
          </button>
        )}
      </form>

      {/* Own Account Security — Change Login ID & PIN */}
      <form onSubmit={handleUpdateCredentials} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-emerald-600" />
              <span>একাউন্ট নিরাপত্তা — লগইন আইডি ও পিন পরিবর্তন</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              আপনার ব্যক্তিগত লগইন আইডি ও গোপন পিন যেকোনো সময় পরিবর্তন করুন। পরিবর্তিত তথ্য সম্পূর্ণ এনক্রিপ্টেড ও গোপন থাকবে।
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold self-start sm:self-center">
            <Lock className="w-3.5 h-3.5" />
            <span>সুরক্ষিত</span>
          </span>
        </div>

        {credSuccess && (
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{credSuccess}</span>
          </div>
        )}

        {credError && (
          <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold border border-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{credError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              বর্তমান পিন কোড *
            </label>
            <input
              type="password"
              maxLength={6}
              value={credCurrentPin}
              onChange={(e) => setCredCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="আপনার বর্তমান পিন"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              লগইন আইডি *
            </label>
            <input
              type="text"
              value={credNewLoginId}
              onChange={(e) => setCredNewLoginId(e.target.value.replace(/\s+/g, ''))}
              placeholder="নতুন লগইন আইডি লিখুন"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              নতুন ৪-৬ ডিজিট পিন (ঐচ্ছিক)
            </label>
            <input
              type="password"
              maxLength={6}
              value={credNewPin}
              onChange={(e) => setCredNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="পিন না বদলালে খালি রাখুন"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              নতুন পিন নিশ্চিত করুন
            </label>
            <input
              type="password"
              maxLength={6}
              value={credConfirmPin}
              onChange={(e) => setCredConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="নতুন পিন পুনরায় লিখুন"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
              disabled={!credNewPin.trim()}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={updatingCreds}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4 text-emerald-400" />
          <span>{updatingCreds ? 'আপডেট হচ্ছে...' : 'লগইন আইডি ও পিন আপডেট করুন'}</span>
        </button>
      </form>

      {/* Local Storage & Backup Section */}
      {canManageBackup && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-emerald-600" />
                <span>লোকাল স্টোরেজ ও ব্যাকআপ সংরক্ষণ</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {isSuperAdmin
                  ? 'অফলাইন নিরাপত্তার জন্য সব কোম্পানির ডাটা ব্রাউজারের লোকাল স্টোরেজ (LocalStorage + IndexedDB) ও ফাইল ব্যাকআপে সংরক্ষণ করুন।'
                  : 'অফলাইন নিরাপত্তার জন্য আপনার প্রতিষ্ঠানের সকল ডাটা ব্রাউজারের লোকাল স্টোরেজ (LocalStorage + IndexedDB) ও ফাইল ব্যাকআপে সংরক্ষণ করুন।'}
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500 tabular-nums shrink-0">
              <div>শেষ সংরক্ষণ: {formattedLocalTime}</div>
              <div className="font-semibold text-slate-700 mt-0.5">
                {localStats?.hasLocalBackup
                  ? `সাইজ: ${toBengaliDigits(Math.max(1, Math.round((localStats.localStorageBytes || 0) / 1024)))} KB`
                  : 'লোকাল স্ন্যাপশট নেই'}
              </div>
            </div>
          </div>

          {/* Unboxed Inline Metadata Summary */}
          <div className="text-xs text-slate-600 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
            <span className="font-bold text-slate-800">সংরক্ষিত ডাটা:</span>
            {isSuperAdmin && (
              <>
                <span>কোম্পানি {toBengaliDigits(localStats?.companies || 0)}</span>
                <span className="text-slate-300">·</span>
              </>
            )}
            <span>গাড়ি {toBengaliDigits(localStats?.vehicles || 0)}</span>
            <span className="text-slate-300">·</span>
            <span>রুট {toBengaliDigits(localStats?.routes || 0)}</span>
            <span className="text-slate-300">·</span>
            <span>ট্রিপ {toBengaliDigits(localStats?.schedules || 0)}</span>
            <span className="text-slate-300">·</span>
            <span>বুকিং {toBengaliDigits(localStats?.bookings || 0)}</span>
            <span className="text-slate-300">·</span>
            <span>ট্রিপ সমন্বয় {toBengaliDigits(localStats?.reconciliations || 0)}</span>
            <span className="text-slate-300">·</span>
            <span>ফুয়েল লগ {toBengaliDigits(localStats?.fuelEntries || 0)}</span>
          </div>

          {/* Pending JSON Restore Confirmation Box */}
          {pendingRestoreVault && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>ব্যাকআপ ফাইল রিস্টোর নিশ্চিতকরণ ({pendingRestoreVault.fileName})</span>
                </div>
                <button
                  type="button"
                  onClick={() => !restoringBackup && setPendingRestoreVault(null)}
                  className="text-amber-700 hover:text-amber-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-amber-800 leading-relaxed tabular-nums">
                এই ব্যাকআপ ফাইলে <strong>{toBengaliDigits(pendingRestoreVault.companiesCount)} টি কোম্পানি</strong> ও সংশ্লিষ্ট{' '}
                <strong>{toBengaliDigits(pendingRestoreVault.recordsCount)} টি রেকর্ড</strong> রয়েছে। রিস্টোর করলে বর্তমান ডাটাবেইজের সাথে যুক্ত হবে এবং সুপার এডমিন অ্যাকাউন্ট সুরক্ষিত থাকবে।
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingRestoreVault(null)}
                  disabled={restoringBackup}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  disabled={restoringBackup}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{restoringBackup ? 'রিস্টোর হচ্ছে...' : 'এখনই রিস্টোর করুন'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSaveLocalSnapshot}
              disabled={savingLocal}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <HardDrive className={`w-4 h-4 ${savingLocal ? 'animate-pulse' : ''}`} />
              <span>{savingLocal ? 'জমা হচ্ছে...' : 'লোকাল স্টোরেজে ডাটা জমা করুন'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadBackupJson}
              disabled={exportingJson}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{exportingJson ? 'প্রস্তুত হচ্ছে...' : 'ব্যাকআপ ফাইল ডাউনলোড (.JSON)'}</span>
            </button>

            {isSuperAdmin && (
              <>
                <label className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer">
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>ফাইল থেকে রিস্টোর করুন</span>
                  <input
                    ref={restoreInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleSelectRestoreFile}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleCleanupOrphans}
                  disabled={cleaningOrphans}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  {cleaningOrphans ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                  ) : (
                    <Database className="w-4 h-4 text-slate-600" />
                  )}
                  <span>{cleaningOrphans ? 'পরিষ্কার হচ্ছে...' : 'অবশিষ্ট অরফান ডাটা পরিষ্কার'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

