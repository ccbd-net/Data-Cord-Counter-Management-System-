import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Schedule, Reconciliation, Vehicle } from '../types/index.ts';
import {
  formatTaka,
  toBengaliDigits,
  getTodayDhakaDate,
  formatBengaliDate,
} from '../utils/formatters.ts';
import {
  Database,
  Calendar,
  Clock,
  Bus,
  User,
  Search,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  MapPin,
  ArrowRight,
  Filter,
  CheckCircle2,
  Moon,
  Info,
} from 'lucide-react';

interface DatabaseRow {
  id: string;
  autoSerial: number;
  dateDisplay: string;
  isNightHold: boolean;
  vehicleRegNo: string;
  vehicleOwnerName?: string;
  upTime: string;
  downTime: string;
  timeDiffDisplay: string;
  timeDiffMinutes: number;
  routeMerged: string;
  supervisorDisplay: string;
  upTripNo?: string;
  downTripNo?: string;
  status: string;
}

// Convert "07:30 AM" or "04:00 PM" into minutes from 00:00
function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

// Calculate time difference between UP time and DOWN time
function calculateTimeDifference(upTime: string, downTime: string, isNightHold: boolean): { display: string; minutes: number } {
  if (!upTime || !downTime) {
    return { display: 'নির্ধারিত হয়নি', minutes: 0 };
  }

  const upMin = timeToMinutes(upTime);
  let downMin = timeToMinutes(downTime);

  let diffMinutes = 0;
  if (isNightHold) {
    // Night hold: Down trip is next day
    diffMinutes = (1440 + downMin) - upMin;
  } else {
    // Same day trip
    if (downMin >= upMin) {
      diffMinutes = downMin - upMin;
    } else {
      // Overnight or return later
      diffMinutes = (1440 + downMin) - upMin;
    }
  }

  if (diffMinutes < 0) diffMinutes = 0;

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  const display = `${toBengaliDigits(hours)} ঘণ্টা ${mins > 0 ? `${toBengaliDigits(mins)} মিনিট` : '০০ মিনিট'}`;
  return { display, minutes: diffMinutes };
}

// Intelligent Route Merging according to user instructions:
// (মাদারীপুর - গুলিস্থান + গুলিস্থান - মাদারীপুর = মাদারীপুর - গুলিস্থান - মাদারীপুর)
// (কালকিনি - সায়দাবাদ + গুলিস্থান - মাদারীপুর = কালকিনি - সায়দাবাদ - গুলিস্থান - মাদারীপুর)
function mergeRoutes(upRouteName: string, downRouteName: string): string {
  if (!upRouteName && !downRouteName) return 'রুট সমন্বয় অপেক্ষমাণ';
  if (!upRouteName) return downRouteName;
  if (!downRouteName) return upRouteName;

  // Clean parenthesis details like (ভায়া পদ্মা সেতু)
  const clean = (str: string) =>
    str.replace(/\([^)]*\)/g, '').trim();

  const upClean = clean(upRouteName);
  const downClean = clean(downRouteName);

  // Split by ' - ' or ' ➜ ' or '->'
  const splitStops = (str: string) => {
    return str
      .split(/[-➜→]/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const upStops = splitStops(upClean);
  const downStops = splitStops(downClean);

  if (upStops.length === 0 && downStops.length === 0) return 'মাদারীপুর - ঢাকা - মাদারীপুর';
  if (upStops.length === 0) return downStops.join(' - ');
  if (downStops.length === 0) return upStops.join(' - ');

  const upLast = upStops[upStops.length - 1];
  const downFirst = downStops[0];

  // If the last stop of UP is the same as first stop of DOWN (e.g. গুলিস্থান == গুলিস্থান)
  if (upLast.toLowerCase() === downFirst.toLowerCase()) {
    const merged = [...upStops, ...downStops.slice(1)];
    return merged.join(' - ');
  } else {
    // If different (e.g. সায়দাবাদ and গুলিস্থান) -> কালকিনি - সায়দাবাদ - গুলিস্থান - মাদারীপুর
    const merged = [...upStops, ...downStops];
    return merged.join(' - ');
  }
}

// Calculate yesterday's date
function getYesterdayDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export const DatabasePage: React.FC = () => {
  const { isMasterAdmin } = useAuth();
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [vehicleFilter, setVehicleFilter] = useState<string>('ALL');
  const [nightHoldFilter, setNightHoldFilter] = useState<'ALL' | 'NIGHT_HOLD' | 'REGULAR'>('ALL');

  // AI Insights State (Optional assist)
  const [aiReport, setAiReport] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);

  // Load schedules and vehicles
  const fetchData = async () => {
    setLoading(true);
    try {
      const [schRes, vehRes] = await Promise.all([
        api.getSchedules({ date }),
        api.getVehicles(),
      ]);
      setSchedules(schRes.schedules || []);
      setVehicles(vehRes.vehicles || []);
    } catch (err) {
      console.error('Failed to load database records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [date]);

  // Construct Data Table rows with Auto Serial, Date (yesterday + today for night hold),
  // Time (Up/Down), Time Difference, Route Consolidation, and Supervisor
  const tableRows: DatabaseRow[] = useMemo(() => {
    const rows: DatabaseRow[] = [];

    // Group schedules by vehicle
    const vehicleGroupMap: Record<string, { up: Schedule[]; down: Schedule[] }> = {};

    schedules.forEach((sch) => {
      const key = sch.vehicleRegNo;
      if (!vehicleGroupMap[key]) {
        vehicleGroupMap[key] = { up: [], down: [] };
      }
      if (sch.direction === 'UP') {
        vehicleGroupMap[key].up.push(sch);
      } else {
        vehicleGroupMap[key].down.push(sch);
      }
    });

    let autoSl = 1;

    // 1. Process paired vehicle trips
    Object.keys(vehicleGroupMap).forEach((vehReg) => {
      const { up, down } = vehicleGroupMap[vehReg];
      const maxPairs = Math.max(up.length, down.length);

      for (let i = 0; i < maxPairs; i++) {
        const upTrip = up[i];
        const downTrip = down[i];

        const isNightHold = Boolean(upTrip?.isNightHold || downTrip?.isNightHold);

        // Date calculation: if Night Hold is checked -> "গতকাল + আজ"
        let dateDisplay = '';
        if (isNightHold) {
          const yesterday = getYesterdayDate(date);
          dateDisplay = `${formatBengaliDate(yesterday)} + ${formatBengaliDate(date)} (নাইট হোল্ড)`;
        } else {
          dateDisplay = formatBengaliDate(date);
        }

        const upTime = upTrip?.departureTime || 'নির্ধারিত হয়নি';
        const downTime = downTrip?.departureTime || 'নির্ধারিত হয়নি';

        const { display: timeDiffDisplay, minutes: timeDiffMinutes } =
          upTrip && downTrip
            ? calculateTimeDifference(upTrip.departureTime, downTrip.departureTime, isNightHold)
            : { display: 'অপেক্ষমাণ', minutes: 0 };

        const upRoute = upTrip?.routeName || '';
        const downRoute = downTrip?.routeName || '';
        const routeMerged = mergeRoutes(upRoute, downRoute);

        // Supervisor display
        let supervisorDisplay = '';
        if (upTrip && downTrip) {
          if (upTrip.supervisor === downTrip.supervisor) {
            supervisorDisplay = `${upTrip.supervisor} (${upTrip.supervisorPhone || 'ফোন নেই'})`;
          } else {
            supervisorDisplay = `আপ: ${upTrip.supervisor} | ডাউন: ${downTrip.supervisor}`;
          }
        } else if (upTrip) {
          supervisorDisplay = `${upTrip.supervisor} (${upTrip.supervisorPhone || 'ফোন নেই'})`;
        } else if (downTrip) {
          supervisorDisplay = `${downTrip.supervisor} (${downTrip.supervisorPhone || 'ফোন নেই'})`;
        }

        const owner = upTrip?.vehicleOwnerName || downTrip?.vehicleOwnerName || 'সাধারণ';

        rows.push({
          id: `row-${autoSl}-${vehReg}`,
          autoSerial: autoSl++,
          dateDisplay,
          isNightHold,
          vehicleRegNo: vehReg,
          vehicleOwnerName: owner,
          upTime,
          downTime,
          timeDiffDisplay,
          timeDiffMinutes,
          routeMerged,
          supervisorDisplay,
          upTripNo: upTrip?.tripNo,
          downTripNo: downTrip?.tripNo,
          status: upTrip && downTrip ? 'সমন্বিত' : upTrip ? 'শুধুমাত্র আপ ট্রিপ' : 'শুধুমাত্র ডাউন ট্রিপ',
        });
      }
    });

    return rows;
  }, [schedules, date]);

  // Client Filtered Rows
  const filteredRows = tableRows.filter((row) => {
    if (vehicleFilter !== 'ALL' && row.vehicleRegNo !== vehicleFilter) return false;
    if (nightHoldFilter === 'NIGHT_HOLD' && !row.isNightHold) return false;
    if (nightHoldFilter === 'REGULAR' && row.isNightHold) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      row.vehicleRegNo.toLowerCase().includes(term) ||
      row.routeMerged.toLowerCase().includes(term) ||
      row.supervisorDisplay.toLowerCase().includes(term) ||
      (row.vehicleOwnerName && row.vehicleOwnerName.toLowerCase().includes(term))
    );
  });

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'সিরিয়াল',
      'তারিখ',
      'গাড়ি নম্বর',
      'মালিকের নাম',
      'আপ সময়',
      'ডাউন সময়',
      'সময় ব্যবধান',
      'রুট সমন্বয়',
      'সুপারভাইজার',
      'স্ট্যাটাস',
    ];

    const rows = filteredRows.map((r) => [
      r.autoSerial,
      r.dateDisplay,
      r.vehicleRegNo,
      r.vehicleOwnerName || 'সাধারণ',
      r.upTime,
      r.downTime,
      r.timeDiffDisplay,
      r.routeMerged,
      r.supervisorDisplay,
      r.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `database_trip_register_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate AI Summary optionally
  const handleGenerateAi = async () => {
    setAiLoading(true);
    setShowAiModal(true);
    try {
      const res = await api.getAiDailySummary(date);
      setAiReport(res.summary);
    } catch (err: any) {
      setAiReport('এআই বিশ্লেষণ লোড করা যায়নি: ' + (err.message || 'নেটওয়ার্ক সমস্যা'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 rounded-3xl shadow-lg border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-semibold border border-emerald-400/30 mb-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>সিস্টেম ডাটাবেইজ ও ট্রিপ সমন্বয় রেজিস্টার</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
            ডাটাবেইজ — ট্রিপ শিডিউল, রুট সমন্বয় ও সময় ব্যবধান
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            স্বয়ংক্রিয় সিরিয়াল, নাইট হোল্ড তারিখ সমন্বয় (গতকাল+আজ), আপ/ডাউন সময় ব্যবধান এবং পূর্ণাঙ্গ রুট মার্জিং পর্যবেক্ষণ করুন।
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors border border-slate-600"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>এক্সেল (.CSV)</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>প্রিন্ট / সেভ PDF</span>
          </button>

          <button
            type="button"
            onClick={handleGenerateAi}
            className="px-3.5 py-2 bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border border-purple-400/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="এআই বিশ্লেষণ"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span>এআই ইনসাইটস</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-500 text-[11px]">তারিখ:</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
            />
          </div>

          {/* Vehicle Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
            <Bus className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 text-[11px]">গাড়ি:</span>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
            >
              <option value="ALL">সকল গাড়ি</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.regNo}>
                  {v.regNo}
                </option>
              ))}
            </select>
          </div>

          {/* Night Hold Filter */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => setNightHoldFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                nightHoldFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              সব ট্রিপ
            </button>
            <button
              type="button"
              onClick={() => setNightHoldFilter('NIGHT_HOLD')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                nightHoldFilter === 'NIGHT_HOLD'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              নাইট হোল্ড
            </button>
            <button
              type="button"
              onClick={() => setNightHoldFilter('REGULAR')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                nightHoldFilter === 'REGULAR'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              রেগুলার ট্রিপ
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="গাড়ি, রুট বা সুপারভাইজার..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-medium"
          />
        </div>
      </div>

      {/* Main Database Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Card Header & Rule Note */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              {toBengaliDigits(filteredRows.length)}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                ডাটাবেইজ সমন্বয় তালিকা ({toBengaliDigits(filteredRows.length)} টি রেকর্ড)
              </h3>
              <p className="text-[11px] text-slate-500">
                কলাম: সিরিয়াল (অটো) | তারিখ (গতকাল+আজ যদি নাইট হোল্ড) | সময় (আপ/ডাউন) | সময় ব্যাবধান | রুট সমন্বয় | সুপারভাইজার
              </p>
            </div>
          </div>

          <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 bg-white px-3 py-1 rounded-xl border border-slate-200">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <span>সময় ব্যবধান = আপ টাইম হতে ডাউন টাইম বাদ (ঘণ্টা : মিনিট)</span>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            ডাটাবেইজ লোড হচ্ছে...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 px-6 text-center bg-white">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Database className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">ডাটাবেইজে কোনো ট্রিপ এন্ট্রি নেই</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              ডিফল্ট ডামি ডাটা মুছে ফেলা হয়েছে। আপনি যখন <strong>শিডিউল মেকার</strong> থেকে গাড়ি ও ট্রিপ যোগ করবেন, তখন স্বয়ংক্রিয়ভাবে এখানে আপ ও ডাউন রুট সমন্বয় এবং সময় ব্যবধান গণনা হয়ে ডাটাবেইজে সংরক্ষিত হবে।
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-center w-12">সিরিয়াল (অটো)</th>
                  <th className="px-4 py-3.5">তারিখ</th>
                  <th className="px-4 py-3.5">গাড়ি নম্বর ও মালিক</th>
                  <th className="px-4 py-3.5">সময় (আপ / ডাউন)</th>
                  <th className="px-4 py-3.5">সময় ব্যাবধান (ঘণ্টা : মিনিট)</th>
                  <th className="px-4 py-3.5">রুট সমন্বয়</th>
                  <th className="px-4 py-3.5">সুপারভাইজার</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Auto Serial */}
                    <td className="px-4 py-3.5 text-center font-black text-slate-900 bg-slate-50/50">
                      <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center justify-center font-bold">
                        {toBengaliDigits(row.autoSerial)}
                      </span>
                    </td>

                    {/* Date (Yesterday + Today if Night Hold) */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{row.dateDisplay}</div>
                      {row.isNightHold && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md mt-1 border border-purple-200">
                          <Moon className="w-3 h-3 text-purple-600" />
                          <span>নাইট হোল্ড টিক</span>
                        </span>
                      )}
                    </td>

                    {/* Vehicle Reg No & Owner */}
                    <td className="px-4 py-3.5">
                      <div className="font-black text-slate-900 font-mono flex items-center gap-1.5">
                        <Bus className="w-3.5 h-3.5 text-slate-400" />
                        <span>{row.vehicleRegNo}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        মালিক: <strong className="text-slate-700">{row.vehicleOwnerName || 'সাধারণ'}</strong>
                      </div>
                    </td>

                    {/* Time (UP / DOWN) */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 font-semibold">
                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] font-bold">
                          আপ: {row.upTime} {row.upTripNo ? `(${row.upTripNo})` : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-bold">
                          ডাউন: {row.downTime} {row.downTripNo ? `(${row.downTripNo})` : ''}
                        </span>
                      </div>
                    </td>

                    {/* Time Difference */}
                    <td className="px-4 py-3.5">
                      <div className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-50 text-amber-900 font-bold text-xs border border-amber-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{row.timeDiffDisplay}</span>
                      </div>
                    </td>

                    {/* Route Merged */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900 text-xs bg-slate-50 p-2 rounded-xl border border-slate-200 leading-relaxed">
                        {row.routeMerged}
                      </div>
                    </td>

                    {/* Supervisor */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-800 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{row.supervisorDisplay}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Sheet (hidden on screen, visible during window.print()) */}
      <div id="printable-database-report" className="hidden print:block p-6 bg-white text-slate-900 font-sans space-y-4">
        <div className="text-center border-b pb-4 space-y-1">
          <h2 className="text-2xl font-black text-slate-900">কাউন্টার বুকিং ও বাস সার্ভিস</h2>
          <p className="text-sm font-semibold text-slate-600">
            ডাটাবেইজ — ট্রিপ শিডিউল, রুট সমন্বয় ও সময় ব্যবধান রেজিস্টার
          </p>
          <div className="text-xs font-bold text-slate-700">
            তারিখ: {formatBengaliDate(date)} | মোট রেকর্ড: {toBengaliDigits(filteredRows.length)} টি
          </div>
        </div>

        <table className="w-full text-xs border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 font-bold border-b border-slate-300">
              <th className="border border-slate-300 p-2 text-center w-12">সিরিয়াল</th>
              <th className="border border-slate-300 p-2 text-left">তারিখ</th>
              <th className="border border-slate-300 p-2 text-left">গাড়ি নম্বর</th>
              <th className="border border-slate-300 p-2 text-left">সময় (আপ / ডাউন)</th>
              <th className="border border-slate-300 p-2 text-center">সময় ব্যাবধান</th>
              <th className="border border-slate-300 p-2 text-left">রুট সমন্বয়</th>
              <th className="border border-slate-300 p-2 text-left">সুপারভাইজার</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-b border-slate-200">
                <td className="border border-slate-300 p-2 text-center font-bold">
                  {toBengaliDigits(row.autoSerial)}
                </td>
                <td className="border border-slate-300 p-2">{row.dateDisplay}</td>
                <td className="border border-slate-300 p-2 font-bold font-mono">{row.vehicleRegNo}</td>
                <td className="border border-slate-300 p-2">
                  <div>আপ: {row.upTime}</div>
                  <div>ডাউন: {row.downTime}</div>
                </td>
                <td className="border border-slate-300 p-2 text-center font-bold">{row.timeDiffDisplay}</td>
                <td className="border border-slate-300 p-2 font-medium">{row.routeMerged}</td>
                <td className="border border-slate-300 p-2">{row.supervisorDisplay}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pt-12 grid grid-cols-3 gap-8 text-center text-xs font-semibold text-slate-700">
          <div className="border-t border-slate-400 pt-1">ডাটা এন্ট্রি সহকারী</div>
          <div className="border-t border-slate-400 pt-1">ট্রাফিক কন্ট্রোলার</div>
          <div className="border-t border-slate-400 pt-1">ম্যানেজার অনুমোদন</div>
        </div>
      </div>

      {/* AI Insights Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <span>এআই দৈনিক বিশ্লেষণ ও ইনসাইটস</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                বন্ধ
              </button>
            </div>

            {aiLoading ? (
              <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                এআই বিশ্লেষণ প্রস্তুত হচ্ছে...
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-line font-medium">
                {aiReport}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
