import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Schedule, Vehicle } from '../types/index.ts';
import {
  formatTaka,
  toBengaliDigits,
  getTodayDhakaDate,
  formatBengaliDate,
} from '../utils/formatters.ts';
import { downloadDailyTripsPDF } from '../utils/pdfGenerator.ts';
import { DigitalClockPicker } from '../components/DigitalClockPicker.tsx';
import {
  CalendarDays,
  Calendar,
  Bus,
  Clock,
  User,
  Phone,
  Armchair,
  Edit3,
  Moon,
  CheckCircle,
  RefreshCw,
  Search,
  ArrowRight,
  Trash2,
  Printer,
  FileSpreadsheet,
  Download,
  Filter,
  Layers,
  ArrowUpDown,
  TrendingUp,
} from 'lucide-react';

export const DailySchedulesPage: React.FC<{ onSelectTripForBooking?: (tripId: string) => void }> = ({
  onSelectTripForBooking,
}) => {
  const { isMasterAdmin, isModerator, canManageTrips } = useAuth();

  // Filter States
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [startDate, setStartDate] = useState<string>(getTodayDhakaDate());
  const [endDate, setEndDate] = useState<string>(getTodayDhakaDate());
  const [directionTab, setDirectionTab] = useState<'ALL' | 'PENDING_RETURN' | 'UP' | 'DOWN'>('ALL');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Data States
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string>('');

  // Edit Schedule Modal State
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editTime, setEditTime] = useState<string>('07:00 AM');
  const [editSupervisor, setEditSupervisor] = useState<string>('');
  const [editSupervisorPhone, setEditSupervisorPhone] = useState<string>('');
  const [editFare, setEditFare] = useState<number>(550);
  const [editReason, setEditReason] = useState<string>('');

  // Return Trip (ফিরতি দিন) Quick Modal State
  const [returnModalTrip, setReturnModalTrip] = useState<Schedule | null>(null);
  const [returnDate, setReturnDate] = useState<string>(getTodayDhakaDate());
  const [returnTime, setReturnTime] = useState<string>('08:30 PM');
  const [returnSupervisor, setReturnSupervisor] = useState<string>('');
  const [creatingReturn, setCreatingReturn] = useState<boolean>(false);

  // Print / PDF Report Modal
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Load vehicles and supervisors list
  const [supervisorsList, setSupervisorsList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchPrereqs = async () => {
      try {
        const [vList, sRes] = await Promise.all([
          api.getVehicles(),
          api.getSupervisors(),
        ]);
        setVehicles(vList.vehicles);
        setSupervisorsList(sRes.supervisors || []);
      } catch (err) {
        console.error('Failed to load vehicles or supervisors:', err);
      }
    };
    fetchPrereqs();
  }, []);

  // Fetch schedules with flexible filters
  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateMode === 'single') {
        params.date = date;
      } else {
        params.startDate = startDate;
      }
      if (dateMode === 'range' && endDate) {
        params.endDate = endDate;
      }
      if (directionTab === 'UP' || directionTab === 'DOWN') {
        params.direction = directionTab;
      }
      if (selectedVehicle !== 'ALL') {
        params.vehicleRegNo = selectedVehicle;
      }

      const res = await api.getSchedules(params);
      setSchedules(res.schedules);
    } catch (err) {
      console.error('Failed to load daily schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [dateMode, date, startDate, endDate, directionTab, selectedVehicle]);

  const handleOpenReturnModal = (trip: Schedule) => {
    setReturnModalTrip(trip);
    setReturnDate(trip.date || getTodayDhakaDate());
    setReturnTime('08:30 PM');
    setReturnSupervisor(trip.supervisor || '');
    setActionSuccessMsg('');
  };

  const handleCreateReturnTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalTrip) return;
    setCreatingReturn(true);
    setActionSuccessMsg('');

    try {
      const res = await api.createSchedule({
        date: returnDate,
        departureTime: returnTime,
        vehicleId: returnModalTrip.vehicleId,
        direction: 'DOWN',
        supervisor: returnSupervisor || returnModalTrip.supervisor,
        linkedTripId: returnModalTrip.id,
      });

      setActionSuccessMsg(
        `সফল! গাড়ি: ${returnModalTrip.vehicleRegNo} এর ফিরতি ডাউন ট্রিপ (${res.schedule.tripNo}) শিডিউল তৈরি হয়েছে। আপ ও ডাউন মিলে ১টি পূর্ণাঙ্গ ট্রিপ সম্পন্ন।`
      );
      setReturnModalTrip(null);
      await fetchSchedules();
      if (onSelectTripForBooking) {
        onSelectTripForBooking(res.schedule.id);
      }
    } catch (err: any) {
      alert(err.message || 'ফিরতি ট্রিপ তৈরিতে সমস্যা হয়েছে।');
    } finally {
      setCreatingReturn(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (sch: Schedule) => {
    setEditingSchedule(sch);
    setEditTime(sch.departureTime || '07:00 AM');
    setEditSupervisor(sch.supervisor || '');
    setEditSupervisorPhone(sch.supervisorPhone || '');
    setEditFare(sch.fare || 0);
    setEditReason(sch.lastTripUpdateReason || '');
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;

    try {
      await api.updateSchedule(editingSchedule.id, {
        departureTime: editTime,
        supervisor: editSupervisor,
        supervisorPhone: editSupervisorPhone,
        fare: editFare,
        updateReason: editReason || 'সময়ানুবর্তিতা বা অপারেশনাল কারণে পরিবর্তন',
      });
      setEditingSchedule(null);
      await fetchSchedules();
    } catch (err: any) {
      alert(err.message || 'আপডেট ব্যর্থ হয়েছে');
    }
  };

  // Delete Trip
  const handleDeleteTrip = async (sch: Schedule) => {
    if (!window.confirm(`আপনি কি নিশ্চিতভাবে "${sch.tripNo}" (${sch.vehicleRegNo}) ট্রিপটি মুছে ফেলতে চান?`)) {
      return;
    }
    try {
      await api.deleteSchedule(sch.id);
      await fetchSchedules();
    } catch (err: any) {
      alert(err.message || 'ট্রিপ মোছা যায়নি।');
    }
  };

  // Pending Return Trips: All active UP trips where returnTripCreated is not true
  const pendingReturnTrips = schedules.filter(
    (s) => s.direction === 'UP' && !s.returnTripCreated && s.status !== 'cancelled'
  );

  // Client-side search filtering
  const filtered = schedules.filter((s) => {
    if (selectedVehicle !== 'ALL' && s.vehicleRegNo !== selectedVehicle) {
      return false;
    }
    if (directionTab === 'UP' && s.direction !== 'UP') return false;
    if (directionTab === 'DOWN' && s.direction !== 'DOWN') return false;
    if (directionTab === 'PENDING_RETURN' && !(s.direction === 'UP' && !s.returnTripCreated)) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.tripNo.toLowerCase().includes(term) ||
      s.vehicleRegNo.toLowerCase().includes(term) ||
      s.supervisor.toLowerCase().includes(term) ||
      s.routeName.toLowerCase().includes(term) ||
      (s.vehicleOwnerName && s.vehicleOwnerName.toLowerCase().includes(term))
    );
  });

  // Calculate Metrics
  const upTrips = filtered.filter((s) => s.direction === 'UP');
  const downTrips = filtered.filter((s) => s.direction === 'DOWN');

  // Completed paired round trips (আপ + ডাউন মিলে ১টি পূর্ণাঙ্গ ট্রিপ)
  const pairedRoundTrips = filtered.filter((s) => s.direction === 'UP' && s.returnTripCreated).length;

  // Unique vehicle count for UP and DOWN
  const uniqueUpVehicles = new Set(upTrips.map((s) => s.vehicleRegNo)).size;
  const uniqueDownVehicles = new Set(downTrips.map((s) => s.vehicleRegNo)).size;
  const totalUniqueVehicles = new Set(filtered.map((s) => s.vehicleRegNo)).size;

  const totalBookedSeats = filtered.reduce((acc, s) => acc + (s.totalBookedSeats || 0), 0);
  const totalCapacity = filtered.reduce((acc, s) => acc + (s.seatCapacity || 40), 0);
  const totalRevenue = filtered.reduce((acc, s) => acc + (s.totalCollection || (s.totalBookedSeats || 0) * s.fare), 0);

  // Group by vehicle for summary reporting
  const vehicleStatsMap: Record<
    string,
    {
      regNo: string;
      ownerName?: string;
      upTrips: number;
      downTrips: number;
      roundTrips: number;
      totalTrips: number;
      bookedSeats: number;
    }
  > = {};

  filtered.forEach((s) => {
    if (!vehicleStatsMap[s.vehicleRegNo]) {
      vehicleStatsMap[s.vehicleRegNo] = {
        regNo: s.vehicleRegNo,
        ownerName: s.vehicleOwnerName,
        upTrips: 0,
        downTrips: 0,
        roundTrips: 0,
        totalTrips: 0,
        bookedSeats: 0,
      };
    }
    if (s.direction === 'UP') {
      vehicleStatsMap[s.vehicleRegNo].upTrips += 1;
    } else {
      vehicleStatsMap[s.vehicleRegNo].downTrips += 1;
    }
    vehicleStatsMap[s.vehicleRegNo].totalTrips += 1;
    const ups = vehicleStatsMap[s.vehicleRegNo].upTrips;
    const downs = vehicleStatsMap[s.vehicleRegNo].downTrips;
    vehicleStatsMap[s.vehicleRegNo].roundTrips = Math.min(ups, downs) + (Math.abs(ups - downs) * 0.5);
    vehicleStatsMap[s.vehicleRegNo].bookedSeats += s.totalBookedSeats || 0;
  });

  const vehicleStatsList = Object.values(vehicleStatsMap);

  // Export CSV (Excel)
  const handleExportCSV = () => {
    const headers = [
      'তারিখ',
      'ট্রিপ নং',
      'দিক (Direction)',
      'ট্রিপ ক্রম (Sequence)',
      'ছাড়ার সময়',
      'গাড়ি নম্বর',
      'মালিকের নাম',
      'রুট',
      'সুপারভাইজার',
      'মোবাইল',
      'বুকড সিট',
      'মোট সিট',
      'ভাড়া (৳)',
      'স্ট্যাটাস',
    ];

    const rows = filtered.map((s) => [
      s.date,
      s.tripNo,
      s.direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ',
      s.tripSequenceLabel || '১ম ট্রিপ',
      s.departureTime,
      s.vehicleRegNo,
      s.vehicleOwnerName || 'সাধারণ',
      s.routeName,
      s.supervisor,
      s.supervisorPhone || '',
      s.totalBookedSeats || 0,
      s.seatCapacity || 40,
      s.fare,
      s.status || 'scheduled',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `trip_report_${dateMode === 'single' ? date : `${startDate}_to_${endDate}`}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">
                দৈনিক ও তারিখভিত্তিক ট্রিপ শিডিউল এবং গাড়ি পর্যবেক্ষণ
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                আপ ও ডাউন ট্রিপে অংশগ্রহণকারী গাড়ির হিসাব, মাল্টি-ট্রিপ ট্র্যাকিং এবং পূর্ণাঙ্গ প্রিন্ট ও এক্সেল রিপোর্ট
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSchedules}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => downloadDailyTripsPDF(schedules, dateMode === 'single' ? date : `${startDate}_to_${endDate}`)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="দৈনিক ট্রিপ শিডিউল পিডিএফ ডাউনলোড"
          >
            <Download className="w-4 h-4 text-blue-200" />
            <span>পিডিএফ (PDF)</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>এক্সেল (.CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>প্রিন্ট ভিউ</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Bar (Single Date vs Date Range, Direction, Vehicle, Search) */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Mode Switch: Single Date vs Date-to-Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-emerald-600" />
              তারিখের ফিল্টার:
            </span>
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
              <button
                type="button"
                onClick={() => setDateMode('single')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateMode === 'single'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                একক তারিখ
              </button>
              <button
                type="button"
                onClick={() => setDateMode('range')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateMode === 'range'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                তারিখ টু তারিখ (রেঞ্জ)
              </button>
            </div>
          </div>

          {/* Direction Filter Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => setDirectionTab('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                directionTab === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              উভয় দিক (ALL)
            </button>
            <button
              type="button"
              onClick={() => setDirectionTab('UP')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                directionTab === 'UP'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              আপ ট্রিপ
            </button>
            <button
              type="button"
              onClick={() => setDirectionTab('DOWN')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                directionTab === 'DOWN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ডাউন ট্রিপ
            </button>
            <button
              type="button"
              onClick={() => setDirectionTab('PENDING_RETURN')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                directionTab === 'PENDING_RETURN'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>ফিরতি বাকি</span>
              {pendingReturnTrips.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    directionTab === 'PENDING_RETURN'
                      ? 'bg-white text-amber-700'
                      : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {toBengaliDigits(pendingReturnTrips.length)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Inputs row: Dates & Vehicle Select & Search */}
        <div className="flex flex-wrap items-center gap-3">
          {dateMode === 'single' ? (
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
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span className="text-slate-500 text-[11px]">শুরু:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
                />
              </div>
              <span className="text-xs text-slate-400 font-bold">হতে</span>
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span className="text-slate-500 text-[11px]">শেষ:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
                />
              </div>
            </div>
          )}

          {/* Vehicle Filter Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
            <Bus className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 text-[11px]">গাড়ি ফিল্টার:</span>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
            >
              <option value="ALL">সকল গাড়ি ({vehicles.length} টি)</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.regNo}>
                  {v.regNo} ({v.ownerName || 'সাধারণ'})
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ট্রিপ নং, গাড়ি, মালিক বা সুপারভাইজার..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Up & Down Trip Analytics / KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* UP Trip KPI */}
        <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
              আপ ট্রিপ (UP Trips)
            </span>
            <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              UP
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(upTrips.length)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি ট্রিপ সম্পন্ন</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span>অংশগ্রহণকারী গাড়ি:</span>
            <strong className="text-blue-800 font-bold">{toBengaliDigits(uniqueUpVehicles)} টি অনন্য বাস</strong>
          </div>
        </div>

        {/* DOWN Trip KPI */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
              ডাউন ট্রিপ (DOWN Trips)
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              DN
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(downTrips.length)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি ট্রিপ সম্পন্ন</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span>অংশগ্রহণকারী গাড়ি:</span>
            <strong className="text-emerald-800 font-bold">{toBengaliDigits(uniqueDownVehicles)} টি অনন্য বাস</strong>
          </div>
        </div>

        {/* Overall Fleet Activity */}
        <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">
              মোট সক্রিয় গাড়ি ও ট্রিপ
            </span>
            <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
              <Bus className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(filtered.length)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি মোট ট্রিপ</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span>চলমান মোট গাড়ি:</span>
            <strong className="text-purple-800 font-bold">{toBengaliDigits(totalUniqueVehicles)} টি গাড়ি</strong>
          </div>
        </div>

        {/* Passenger & Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
              যাত্রী ও মোট ভাড়া আদায়
            </span>
            <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(totalBookedSeats)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি বুকড সিট</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span>মোট আদায়কৃত ভাড়া:</span>
            <strong className="text-emerald-800 font-bold">{formatTaka(totalRevenue)}</strong>
          </div>
        </div>
      </div>

      {/* Action Success Alert */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMsg('')}
            className="text-emerald-700 hover:text-emerald-900 font-black px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Arrived Vehicles with Pending Return Legs (ফিরতি বাকি — ঢাকায় আসা গাড়ি) */}
      {pendingReturnTrips.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200/90 shadow-xs overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-5 py-3.5 border-b border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <span>ফিরতি বাকি — ঢাকায় আসা গাড়ি</span>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                    {toBengaliDigits(pendingReturnTrips.length)} টি বাকি
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                &quot;ফিরতি দিন&quot; চেপে ডাউন রুট ও সময় দিন। আপ ও ডাউন মিলে ওই গাড়ির ১টি পূর্ণাঙ্গ ট্রিপ কাউন্ট হবে।
              </p>
            </div>
            <div className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 shrink-0">
              ১টি আপ + ১টি ডাউন = ১টি পূর্ণাঙ্গ ট্রিপ
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left">গাড়ি নম্বর ও মালিক</th>
                  <th className="px-4 py-2.5 text-left">আপ রুট ও ট্রিপ নং</th>
                  <th className="px-4 py-2.5 text-left">সুপারভাইজার</th>
                  <th className="px-4 py-2.5 text-center">আগমনের সময়</th>
                  <th className="px-4 py-2.5 text-center">স্ট্যাটাস</th>
                  <th className="px-4 py-2.5 text-right">পদক্ষেপ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingReturnTrips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-black text-slate-900">
                      <div>{trip.vehicleRegNo}</div>
                      {trip.vehicleOwnerName && (
                        <span className="text-[10px] text-slate-500 font-sans font-normal">
                          {trip.vehicleOwnerName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      <div className="font-semibold text-slate-800">{trip.routeName}</div>
                      <div className="text-[10px] text-blue-600 font-mono font-bold">{trip.tripNo}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {trip.supervisor}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 font-mono">
                      {trip.departureTime}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                        <span>ফিরতি বাকি</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenReturnModal(trip)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs hover:shadow-md transition-all inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>➔ ফিরতি দিন</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schedules Cards / Grid */}
      <div className="flex items-center justify-between pt-2">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <span>ট্রিপের তালিকা</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {toBengaliDigits(filtered.length)}
          </span>
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 text-xs text-slate-400">
            নির্বাচিত ফিল্টারে কোনো ট্রিপ শিডিউল পাওয়া যায়নি।
          </div>
        ) : (
          filtered.map((sch) => {
            const booked = sch.totalBookedSeats || 0;
            const available = sch.seatCapacity - booked;
            const percent = Math.round((booked / sch.seatCapacity) * 100);

            return (
              <div
                key={sch.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Top Header of Card */}
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-9 h-9 rounded-2xl font-black text-xs flex items-center justify-center text-white ${
                          sch.direction === 'UP' ? 'bg-blue-600' : 'bg-emerald-600'
                        }`}
                      >
                        {sch.direction}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-sm text-slate-900">{sch.tripNo}</h4>
                          {sch.tripSequenceLabel && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                              {sch.tripSequenceLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">তারিখ: {sch.date}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        <span>{sch.departureTime}</span>
                      </span>
                    </div>
                  </div>

                  {/* Details Body */}
                  <div className="py-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">গাড়ি নম্বর:</span>
                      <span className="font-black text-slate-900">{sch.vehicleRegNo}</span>
                    </div>

                    {sch.vehicleOwnerName && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">গাড়ির মালিক:</span>
                        <span className="font-semibold text-slate-800">{sch.vehicleOwnerName}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">রুট:</span>
                      <span className="font-semibold text-slate-700 truncate max-w-[190px]">
                        {sch.routeName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">সুপারভাইজার:</span>
                      <span className="font-medium text-slate-800">
                        {sch.supervisor} {sch.supervisorPhone ? `(${sch.supervisorPhone})` : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">টিকিট ভাড়া:</span>
                      <span className="font-bold text-emerald-700 text-sm">{formatTaka(sch.fare)}</span>
                    </div>

                    {/* Return Trip / Round Trip Status Banner */}
                    {sch.direction === 'UP' && !sch.returnTripCreated && (
                      <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-2xl border border-amber-200">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          <span>ফিরতি বাকি (ঢাকায় আসা)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenReturnModal(sch)}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-black shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                        >
                          <span>➔ ফিরতি দিন</span>
                        </button>
                      </div>
                    )}

                    {sch.direction === 'UP' && sch.returnTripCreated && (
                      <div className="flex items-center gap-1.5 p-2 bg-emerald-50 text-emerald-800 rounded-2xl text-[11px] font-bold border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>১টি পূর্ণাঙ্গ রাউন্ড ট্রিপ সম্পন্ন (আপ + ফিরতি ডাউন)</span>
                      </div>
                    )}

                    {sch.direction === 'DOWN' && sch.linkedTripId && (
                      <div className="flex items-center gap-1.5 p-2 bg-blue-50 text-blue-800 rounded-2xl text-[11px] font-bold border border-blue-200">
                        <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                        <span>ফিরতি ডাউন ট্রিপ (পূর্ণাঙ্গ ট্রিপের অংশ)</span>
                      </div>
                    )}

                    {sch.isNightHold && (
                      <div className="flex items-center gap-1.5 p-2 bg-purple-50 text-purple-700 rounded-2xl text-[11px] font-semibold border border-purple-200">
                        <Moon className="w-3.5 h-3.5" />
                        <span>রাত্রীকালীন হোল্ড ট্রিপ</span>
                      </div>
                    )}
                  </div>

                  {/* Capacity Progress */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                      <span>
                        বুকড: <strong>{toBengaliDigits(booked)}</strong>/{toBengaliDigits(sch.seatCapacity)} সিট
                      </span>
                      <span className="font-semibold">{toBengaliDigits(percent)}% পূর্ণ</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {canManageTrips && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(sch)}
                        className="px-2.5 py-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="ট্রিপ তথ্য পরিবর্তন করুন"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>এডিট</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTrip(sch)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="ট্রিপ মুছে ফেলুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectTripForBooking) {
                        onSelectTripForBooking(sch.id);
                      }
                    }}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Armchair className="w-3.5 h-3.5" />
                    <span>সিট বুকিং</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Return Trip Quick Modal (ফিরতি দিন) */}
      {returnModalTrip && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>ফিরতি ট্রিপ তৈরি (ডাউন ট্রিপ)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  গাড়ি: <strong className="text-slate-900 font-mono">{returnModalTrip.vehicleRegNo}</strong> (আপ ট্রিপ: {returnModalTrip.tripNo})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalTrip(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReturnTrip} className="space-y-4 mt-4">
              {/* Return Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ফিরতি ট্রিপের তারিখ
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Departure Time with Digital Clock */}
              <DigitalClockPicker
                value={returnTime}
                onChange={setReturnTime}
                label="ফিরতি ছাড়ার সময় (অটো ডিজিটাল ঘড়ি)"
              />

              {/* Supervisor Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  সুপারভাইজার
                </label>
                {supervisorsList.length > 0 ? (
                  <select
                    value={returnSupervisor}
                    onChange={(e) => setReturnSupervisor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">সুপারভাইজার নির্বাচন করুন</option>
                    {supervisorsList.map((sup) => (
                      <option key={sup.id} value={sup.name}>
                        {sup.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={returnSupervisor}
                    onChange={(e) => setReturnSupervisor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white"
                    placeholder="সুপারভাইজারের নাম"
                    required
                  />
                )}
              </div>

              <div className="bg-blue-50 p-3 rounded-2xl border border-blue-200 text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <span>ℹ️</span>
                  <span>১টি পূর্ণাঙ্গ ট্রিপ হিসাব:</span>
                </div>
                <p className="text-[11px] text-blue-800">
                  এই ডাউন ট্রিপটি তৈরি হলে পূর্ববর্তী আপ ট্রিপের সাথে সংযুক্ত হয়ে যাবে এবং ওই গাড়ির ১টি পূর্ণাঙ্গ ট্রিপ হিসেবে কাউন্ট হবে। তৈরি হওয়ার পর সরাসরি সিট বুকিং শুরু করা যাবে।
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setReturnModalTrip(null)}
                  className="px-4 py-2 border rounded-xl text-xs text-slate-600 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={creatingReturn}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {creatingReturn ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>তৈরি হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <span>ডাউন ট্রিপ তৈরি ও বুকিং শুরু</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Schedule Modal (Using DigitalClockPicker!) */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              ট্রিপ তথ্য পরিবর্তন ({editingSchedule.tripNo})
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              পরিবর্তনটি পরিবর্তনের ইতিহাসে (Audit Log) সংরক্ষিত হবে এবং সকল বুকিং কাউন্টারে তাৎক্ষণিক আপডেট হবে।
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Auto Digital Clock Picker Component */}
              <DigitalClockPicker
                value={editTime}
                onChange={setEditTime}
                label="ছাড়ার সময় নির্ধারণ (অটো ডিজিটাল ঘড়ি)"
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">সুপারভাইজার</label>
                {supervisorsList.length > 0 ? (
                  <select
                    value={editSupervisor ?? ''}
                    onChange={(e) => setEditSupervisor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white"
                    required
                  >
                    <option value="">সুপারভাইজার নির্বাচন করুন</option>
                    {supervisorsList.map((sup) => (
                      <option key={sup.id} value={sup.name}>
                        {sup.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editSupervisor ?? ''}
                    onChange={(e) => setEditSupervisor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ভাড়া (৳)</label>
                <input
                  type="number"
                  value={editFare ?? ''}
                  onChange={(e) => setEditFare(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  পরিবর্তনের কারণ (কাউন্টারদের সতর্কতা দেখাতে)
                </label>
                <textarea
                  value={editReason ?? ''}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="যেমন: ট্রাফিক জ্যাম বা যান্ত্রিক কারণে সময় পরিবর্তন করা হয়েছে।"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="px-4 py-2 border rounded-xl text-xs text-slate-600 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF & Printable Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <span>ট্রিপ শিডিউল ও গাড়ির ট্রিপ সারাংশ রিপোর্ট</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>প্রিন্ট / সেভ অ্যাজ পিডিএফ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  বন্ধ
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div id="printable-trip-report" className="p-6 border border-slate-300 rounded-2xl bg-white text-slate-900 font-sans space-y-5">
              {/* Header */}
              <div className="text-center border-b pb-4 space-y-1">
                <h2 className="text-2xl font-black text-slate-900">কাউন্টার বুকিং ও বাস পরিবহন</h2>
                <p className="text-sm font-semibold text-slate-600">
                  দৈনিক ও রেঞ্জভিত্তিক ট্রিপ অপারেশন এবং গাড়ি পারফর্মেন্স রিপোর্ট
                </p>
                <div className="inline-block px-4 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-800">
                  {dateMode === 'single'
                    ? `তারিখ: ${formatBengaliDate(date)}`
                    : `তারিখ রেঞ্জ: ${formatBengaliDate(startDate)} হতে ${formatBengaliDate(endDate)}`}
                </div>
              </div>

              {/* KPI Summary Block */}
              <div className="grid grid-cols-4 gap-3 text-center border p-3 rounded-xl bg-slate-50 text-xs">
                <div>
                  <span className="text-slate-500 block">আপ ট্রিপ সংখ্যা:</span>
                  <strong className="text-blue-800 font-bold text-sm">
                    {toBengaliDigits(upTrips.length)} টি ({toBengaliDigits(uniqueUpVehicles)} টি গাড়ি)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">ডাউন ট্রিপ সংখ্যা:</span>
                  <strong className="text-emerald-800 font-bold text-sm">
                    {toBengaliDigits(downTrips.length)} টি ({toBengaliDigits(uniqueDownVehicles)} টি গাড়ি)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">মোট ট্রিপ ও গাড়ি:</span>
                  <strong className="text-purple-800 font-bold text-sm">
                    {toBengaliDigits(filtered.length)} ট্রিপ ({toBengaliDigits(totalUniqueVehicles)} টি গাড়ি)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">মোট আদায়কৃত ভাড়া:</span>
                  <strong className="text-slate-900 font-bold text-sm">{formatTaka(totalRevenue)}</strong>
                </div>
              </div>

              {/* Table 1: Vehicle-wise Trip Counts (কয়টা গাড়ী কয় ট্রিপ করেছে) */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">
                  ১. গাড়ি ও মালিকভিত্তিক ট্রিপ সংখ্যা সারসংক্ষেপ:
                </h4>
                <table className="w-full text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 font-bold border-b border-slate-300">
                      <th className="border border-slate-300 p-2 text-center w-10">ক্র.</th>
                      <th className="border border-slate-300 p-2 text-left">গাড়ি নম্বর</th>
                      <th className="border border-slate-300 p-2 text-left">গাড়ির মালিক</th>
                      <th className="border border-slate-300 p-2 text-center">আপ ট্রিপ</th>
                      <th className="border border-slate-300 p-2 text-center">ডাউন ট্রিপ</th>
                      <th className="border border-slate-300 p-2 text-center">মোট ট্রিপ সংখ্যা</th>
                      <th className="border border-slate-300 p-2 text-center">বুকড সিট</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleStatsList.map((vs, idx) => (
                      <tr key={vs.regNo} className="border-b border-slate-200">
                        <td className="border border-slate-300 p-2 text-center">{toBengaliDigits(idx + 1)}</td>
                        <td className="border border-slate-300 p-2 font-bold font-mono">{vs.regNo}</td>
                        <td className="border border-slate-300 p-2">{vs.ownerName || 'সাধারণ'}</td>
                        <td className="border border-slate-300 p-2 text-center text-blue-700 font-bold">
                          {toBengaliDigits(vs.upTrips)}
                        </td>
                        <td className="border border-slate-300 p-2 text-center text-emerald-700 font-bold">
                          {toBengaliDigits(vs.downTrips)}
                        </td>
                        <td className="border border-slate-300 p-2 text-center font-black">
                          {toBengaliDigits(vs.totalTrips)}
                        </td>
                        <td className="border border-slate-300 p-2 text-center">{toBengaliDigits(vs.bookedSeats)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table 2: Detailed Trip List with Sequence badges */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">
                  ২. ট্রিপসমূহের পূর্ণাঙ্গ বিবরণ (শিডিউল ও সিকোয়েন্স):
                </h4>
                <table className="w-full text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 font-bold border-b border-slate-300">
                      <th className="border border-slate-300 p-2 text-left">ট্রিপ নং</th>
                      <th className="border border-slate-300 p-2 text-left">তারিখ ও সময়</th>
                      <th className="border border-slate-300 p-2 text-left">গাড়ি ও ট্রিপ ক্রম</th>
                      <th className="border border-slate-300 p-2 text-left">রুট</th>
                      <th className="border border-slate-300 p-2 text-left">সুপারভাইজার</th>
                      <th className="border border-slate-300 p-2 text-center">সিট বুকড</th>
                      <th className="border border-slate-300 p-2 text-right">আদায় (৳)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id} className="border-b border-slate-200">
                        <td className="border border-slate-300 p-2 font-bold">{s.tripNo}</td>
                        <td className="border border-slate-300 p-2">
                          <div>{s.date}</div>
                          <div className="text-[10px] text-slate-500 font-semibold">{s.departureTime}</div>
                        </td>
                        <td className="border border-slate-300 p-2 font-semibold">
                          <div>{s.vehicleRegNo}</div>
                          <span className="text-[10px] text-amber-800 font-bold">
                            {s.tripSequenceLabel || '১ম ট্রিপ'}
                          </span>
                        </td>
                        <td className="border border-slate-300 p-2">{s.routeName}</td>
                        <td className="border border-slate-300 p-2">{s.supervisor}</td>
                        <td className="border border-slate-300 p-2 text-center font-bold">
                          {toBengaliDigits(s.totalBookedSeats || 0)}/{toBengaliDigits(s.seatCapacity)}
                        </td>
                        <td className="border border-slate-300 p-2 text-right font-bold">
                          {formatTaka(s.totalCollection || (s.totalBookedSeats || 0) * s.fare)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="pt-12 grid grid-cols-3 gap-8 text-center text-xs font-semibold text-slate-700">
                <div className="border-t border-slate-400 pt-1">হিসাব সহকারী স্বাক্ষর</div>
                <div className="border-t border-slate-400 pt-1">ট্রাফিক ইনচার্জ স্বাক্ষর</div>
                <div className="border-t border-slate-400 pt-1">ম্যানেজার অনুমোদন</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
