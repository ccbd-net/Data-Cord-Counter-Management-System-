import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { SystemSettings } from '../types/index.ts';
import {
  Settings,
  Building,
  Phone,
  BadgeDollarSign,
  Globe,
  Bell,
  Save,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { isMasterAdmin } = useAuth();
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
  }, []);

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
    } catch (err: any) {
      setErrorMsg(err.message || 'সেটিংস সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-600" />
          <span>সিস্টেম কনফিগারেশন ও সেটিংস</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          প্রতিষ্ঠানের নাম, সহায়তা হটলাইন, সার্বজনীন নোটিশ ও আঞ্চলিক প্যারামিটার নির্ধারণ করুন
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold border border-emerald-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              প্রতিষ্ঠানের নাম (Company Brand)
            </label>
            <input
              type="text"
              value={settings.companyName ?? ''}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              className="w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:bg-white"
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
              className="w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
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
              className="w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-xs font-mono outline-none focus:bg-white"
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
              className="w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:bg-white"
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
            className="w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
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
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'সংরক্ষিত হচ্ছে...' : 'সেটিংস সংরক্ষণ করুন'}</span>
          </button>
        )}
      </form>
    </div>
  );
};
