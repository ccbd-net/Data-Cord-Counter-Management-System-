import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import type { AnalyticsSummary } from '../types/index.ts';
import { formatTaka, toBengaliDigits, getTodayDhakaDate, formatBengaliDate } from '../utils/formatters.ts';
import {
  Ticket,
  Armchair,
  Bus,
  BadgeDollarSign,
  AlertCircle,
  Calendar,
  Building2,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

export const DashboardPage: React.FC<{ onNavigateTo: (tab: any) => void }> = ({ onNavigateTo }) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDhakaDate());
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  const fetchAnalytics = async (dateStr: string) => {
    setLoading(true);
    try {
      const data = await api.getAnalyticsSummary(dateStr);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(selectedDate);
  }, [selectedDate]);

  return (
    <div className="space-y-6">
      {/* Top Bar: Title & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800">অপারেশন ড্যাশবোর্ড ও বিশ্লেষণ</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            আজকের সার্বিক বুকিং, আসন বিক্রয়, রাজস্ব কালেকশন ও গাড়ির ট্রিপ অগ্রগতি
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300 text-xs">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => fetchAnalytics(selectedDate)}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Bookings */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">মোট বুকিং</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {toBengaliDigits(summary?.totalBookings || 0)}
            </div>
            <span className="text-[11px] text-slate-400">টি সফল অর্ডার</span>
          </div>
        </div>

        {/* Seats Sold */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">বিক্রিত আসন</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Armchair className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-emerald-700">
              {toBengaliDigits(summary?.seatsSold || 0)}
            </div>
            <span className="text-[11px] text-slate-400">টি আসন নিশ্চিত</span>
          </div>
        </div>

        {/* Total Collections */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">মোট রাজস্ব আদায়</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <BadgeDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-teal-800">
              {formatTaka(summary?.totalCollections || 0)}
            </div>
            <span className="text-[11px] text-slate-400">আজকের ক্যাশ মোট</span>
          </div>
        </div>

        {/* Active Trips */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">সক্রিয় ট্রিপ</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Bus className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {toBengaliDigits(summary?.activeTrips || 0)}
            </div>
            <span className="text-[11px] text-slate-400">টি বাস শিডিউল</span>
          </div>
        </div>

        {/* Ticket Sales */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">টিকিট সেলস</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {toBengaliDigits(summary?.ticketSales || 0)}
            </div>
            <span className="text-[11px] text-slate-400">টি ভাউচার</span>
          </div>
        </div>

        {/* Unreconciled Trips */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">অসমন্বিত ট্রিপ</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-amber-700">
              {toBengaliDigits(summary?.unreconciledTrips || 0)}
            </div>
            <span className="text-[11px] text-slate-400">সমন্বয় বাকি</span>
          </div>
        </div>
      </div>

      {/* Main Charts & Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vehicle Wise Up/Down Collections Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b">
            <div>
              <h3 className="font-bold text-sm text-slate-800">গাড়ি-ভিত্তিক আপ ও ডাউন ট্রিপ রাজস্ব</h3>
              <p className="text-xs text-slate-500">প্রতিটি গাড়ির আপ এবং ডাউন কালেকশন তুলনা</p>
            </div>
            <button
              onClick={() => onNavigateTo('reconciliation')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>হিসাব সমন্বয় দেখুন</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {summary?.vehicleWiseCollections && summary.vehicleWiseCollections.length > 0 ? (
              summary.vehicleWiseCollections.map((veh) => {
                const maxCol = Math.max(
                  1,
                  ...summary.vehicleWiseCollections.map((v) => v.total)
                );
                const percent = Math.min(100, Math.round((veh.total / maxCol) * 100));

                return (
                  <div key={veh.regNo} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                      <span className="text-slate-800">{veh.regNo}</span>
                      <span className="text-emerald-700">{formatTaka(veh.total)}</span>
                    </div>

                    {/* Progress Bar Split into Up & Down */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
                      <div
                        className="bg-blue-600 h-full"
                        style={{
                          width: `${veh.total > 0 ? (veh.upCollection / veh.total) * percent : 0}%`,
                        }}
                        title={`আপ কালেকশন: ৳${veh.upCollection}`}
                      />
                      <div
                        className="bg-emerald-500 h-full"
                        style={{
                          width: `${veh.total > 0 ? (veh.downCollection / veh.total) * percent : 0}%`,
                        }}
                        title={`ডাউন কালেকশন: ৳${veh.downCollection}`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <span>আপ ট্রিপ: {formatTaka(veh.upCollection)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>ডাউন ট্রিপ: {formatTaka(veh.downCollection)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-xs text-slate-400">
                এই তারিখে কোনো ট্রিপ তথ্য পাওয়া যায়নি
              </div>
            )}
          </div>
        </div>

        {/* Counter Wise Seat Sales & Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b">
            <div>
              <h3 className="font-bold text-sm text-slate-800">কাউন্টার-ভিত্তিক আসন বিক্রয় ও রাজস্ব</h3>
              <p className="text-xs text-slate-500">কোন কাউন্টার কতটি আসন বুক করেছে ও মোট রাজস্ব</p>
            </div>
            <button
              onClick={() => onNavigateTo('counters')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>কাউন্টার তালিকা</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {summary?.counterWiseSales && summary.counterWiseSales.length > 0 ? (
              summary.counterWiseSales.map((cnt) => {
                const totalRev = summary.totalCollections || 1;
                const revShare = Math.round((cnt.totalRevenue / totalRev) * 100);

                return (
                  <div
                    key={cnt.counterCode}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-4 h-4 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: cnt.seatColor }}
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">{cnt.counterName}</div>
                        <div className="text-[11px] text-slate-500">
                          কোড: {cnt.counterCode} | বিক্রিত সিট:{' '}
                          <strong className="text-slate-700">{toBengaliDigits(cnt.seatsSold)} টি</strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-900">{formatTaka(cnt.totalRevenue)}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{toBengaliDigits(revShare)}% শেয়ার</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-xs text-slate-400">
                এই তারিখে কোনো কাউন্টার বিক্রয় পাওয়া যায়নি
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Access Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTo('seat_booking')}
          className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl shadow-md hover:shadow-lg transition-all text-left flex items-center justify-between group"
        >
          <div>
            <div className="text-xs text-emerald-100 font-medium">সরাসরি বুকিং</div>
            <div className="text-base font-bold mt-0.5">নতুন সিট বুকিং করুন</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
            <Armchair className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTo('daily_schedules')}
          className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-md hover:shadow-lg transition-all text-left flex items-center justify-between group"
        >
          <div>
            <div className="text-xs text-blue-100 font-medium">শিডিউল তালিকা</div>
            <div className="text-base font-bold mt-0.5">আপ ও ডাউন ট্রিপ দেখুন</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
            <Bus className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTo('ticket_print')}
          className="p-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-2xl shadow-md hover:shadow-lg transition-all text-left flex items-center justify-between group"
        >
          <div>
            <div className="text-xs text-slate-300 font-medium">রিসিট ও প্রিন্ট</div>
            <div className="text-base font-bold mt-0.5">৫৮ মিমি টিকিট প্রিন্ট করুন</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
            <Ticket className="w-5 h-5" />
          </div>
        </button>
      </div>
    </div>
  );
};
