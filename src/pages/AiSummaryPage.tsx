import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { getTodayDhakaDate, formatTaka, toBengaliDigits, formatBengaliDate } from '../utils/formatters.ts';
import {
  Sparkles,
  Calendar,
  RefreshCw,
  Printer,
  ShieldCheck,
  BrainCircuit,
  TrendingUp,
  AlertCircle,
  FileText,
  Bus,
} from 'lucide-react';

export const AiSummaryPage: React.FC = () => {
  const { isMasterAdmin } = useAuth();
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [loading, setLoading] = useState<boolean>(false);
  const [report, setReport] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [stats, setStats] = useState<{ trips: number; seats: number; revenue: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const generateReport = async (targetDate: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.getAiDailySummary(targetDate);
      setReport(res.summary);
      setSource(res.source);
      setStats(res.stats);
    } catch (err: any) {
      setErrorMsg(err.message || 'এআই সামারি তৈরিতে ত্রুটি হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateReport(date);
  }, [date]);

  if (!isMasterAdmin) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-red-200 text-center max-w-md mx-auto my-12">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="font-bold text-base text-slate-800">অননুমোদিত এক্সেস</h3>
        <p className="text-xs text-slate-500 mt-1">
          এআই দৈনিক এক্সিকিউটিভ রিপোর্টটি শুধুমাত্র মাস্টার অ্যাডমিনের জন্য সংরক্ষিত।
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <span>এআই দৈনিক সামারি ও অপারেশনাল ইনসাইটস</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gemini 3.8 Flash মডেল ও সার্ভার-সাইড ইঞ্জিন দ্বারা প্রকৃত বুকিং ও রাজস্ব ডেটার গভীর বুদ্ধিবৃত্তিক বিশ্লেষণ
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-purple-600" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => generateReport(date)}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'বিশ্লেষণ চলছে...' : 'রিপোর্ট রি-জেনারেট'}</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">বিশ্লেষিত সক্রিয় ট্রিপ</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {toBengaliDigits(stats.trips)} টি
            </div>
            <span className="text-[11px] text-slate-400">আপ ও ডাউন উভয় রুট</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">মোট বিক্রিত সিট সংখ্যা</span>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {toBengaliDigits(stats.seats)} টি
            </div>
            <span className="text-[11px] text-slate-400">লাইভ ডাটাবেজ কাউন্ট</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">মোট রাজস্ব কালেকশন</span>
            <div className="text-2xl font-black text-purple-700 mt-1">
              {formatTaka(stats.revenue)}
            </div>
            <span className="text-[11px] text-slate-400">কোনো কাল্পনিক ডেটা নয়</span>
          </div>
        </div>
      )}

      {/* Main AI Report Box */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                Counter Management System — এক্সিকিউটিভ এআই দৈনিক প্রতিবেদন ({formatBengaliDate(date)})
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>মডেল ইঞ্জিন: <strong>{source}</strong></span>
                <span>•</span>
                <span>নিরাপত্তা: সার্ভার সাইড প্রক্সি</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>প্রিন্ট করুন</span>
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-sm font-bold text-slate-700">
              Gemini 3.8 Flash আজকের অপারেশনাল ডেটা বিশ্লেষণ করছে...
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              কাউন্টারগুলোর সিট বুকিং গতি, রাজস্ব সংগ্রহ ও ট্রিপ ব্যালেন্স মূল্যায়ন করা হচ্ছে
            </p>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold border border-red-200">
            {errorMsg}
          </div>
        ) : (
          <div className="prose prose-slate max-w-none text-slate-800 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
            {report}
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>* এআই রিপোর্টটি Counter Management System এর লাইভ ডাটাবেজ মেট্রিক্স থেকে স্বয়ংক্রিয়ভাবে প্রক্রিয়াজাত।</span>
          <span className="font-semibold text-emerald-600">সুরক্ষিত ও পরীক্ষিত</span>
        </div>
      </div>
    </div>
  );
};
