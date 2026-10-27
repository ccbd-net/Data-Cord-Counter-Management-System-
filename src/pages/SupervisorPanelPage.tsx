import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Schedule, Booking, Supervisor } from '../types/index.ts';
import { downloadWaybillPDF } from '../utils/pdfGenerator.ts';
import {
  formatTaka,
  toBengaliDigits,
  getTodayDhakaDate,
  formatBengaliDate,
} from '../utils/formatters.ts';
import {
  ShieldCheck,
  Calendar,
  Clock,
  Bus,
  User,
  Phone,
  Search,
  Printer,
  RefreshCw,
  FileText,
  MapPin,
  Download,
  Info,
} from 'lucide-react';

export const SupervisorPanelPage: React.FC = () => {
  const { user } = useAuth();
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('all');
  const [direction, setDirection] = useState<'ALL' | 'UP' | 'DOWN'>('ALL');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<Supervisor[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [scheduleBookings, setScheduleBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);

  // Load supervisors from dedicated directory (no login accounts)
  useEffect(() => {
    const loadSupervisors = async () => {
      try {
        const res = await api.getSupervisors();
        setSupervisorsList(res.supervisors || []);
      } catch (err) {
        console.error('Failed to load supervisors:', err);
      }
    };
    loadSupervisors();
  }, []);

  // Load schedules
  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const params: any = { date };
      if (direction !== 'ALL') params.direction = direction;
      if (selectedSupervisor !== 'all') params.supervisor = selectedSupervisor;

      const res = await api.getSchedules(params);
      setSchedules(res.schedules);

      // Select first trip if none or current selection is not in list
      if (res.schedules.length > 0) {
        const exists = res.schedules.some((s) => s.id === selectedScheduleId);
        if (!exists) {
          setSelectedScheduleId(res.schedules[0].id);
        }
      } else {
        setSelectedScheduleId(null);
        setScheduleBookings([]);
      }
    } catch (err) {
      console.error('Failed to load schedules for supervisor:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [date, direction, selectedSupervisor]);

  // Load schedule details (manifest / bookings)
  useEffect(() => {
    if (!selectedScheduleId) {
      setScheduleBookings([]);
      return;
    }
    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const detail = await api.getScheduleDetails(selectedScheduleId);
        setScheduleBookings(detail.bookings || []);
      } catch (err) {
        console.error('Failed to fetch schedule manifest:', err);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selectedScheduleId]);

  // Update trip status (En route, completed, etc.)
  const handleUpdateStatus = async (newStatus: 'scheduled' | 'running' | 'completed' | 'cancelled') => {
    if (!selectedScheduleId) return;
    setStatusUpdating(true);
    try {
      await api.updateScheduleStatus(selectedScheduleId, newStatus);
      await fetchSchedules();
    } catch (err: any) {
      alert(err.message || 'স্ট্যাটাস আপডেট ব্যর্থ হয়েছে।');
    } finally {
      setStatusUpdating(false);
    }
  };

  // Passenger list filter
  const filteredBookings = scheduleBookings.filter((b: Booking) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      b.passengerName.toLowerCase().includes(term) ||
      b.passengerPhone.toLowerCase().includes(term) ||
      b.ticketNo.toLowerCase().includes(term) ||
      b.boardingPoint.toLowerCase().includes(term) ||
      b.destination.toLowerCase().includes(term) ||
      b.seatNumbers.some((s: string) => s.toLowerCase().includes(term))
    );
  });

  // Calculate manifest summary
  const totalBookedSeats = scheduleBookings.reduce((sum: number, b: Booking) => sum + b.seatNumbers.length, 0);
  const totalRevenue = scheduleBookings.reduce((sum: number, b: Booking) => sum + b.totalFare, 0);
  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-3xl shadow-lg border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold border border-indigo-400/30 mb-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>সুপারভাইজার ডিউটি ও ট্রিপ ম্যানেজমেন্ট প্যানেল</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
            যাত্রী তালিকা ও ট্রিপ মনিটরিং (Waybill Manifest)
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            সুপারভাইজারদের দায়িত্বপ্রাপ্ত ট্রিপের যাত্রীদের সিট নম্বর, ফোন, বোর্ডিং পয়েন্ট এবং গাড়ির যাত্রা স্টেটাস পর্যবেক্ষণ করুন।
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSchedules}
            className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-600 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>রিফ্রেশ</span>
          </button>

          {selectedSchedule && (
            <>
              <button
                type="button"
                onClick={() => downloadWaybillPDF(selectedSchedule, scheduleBookings)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                title="ওয়েবিল চালান পিডিএফ আকারে ডাউনলোড করুন"
              >
                <Download className="w-4 h-4 text-blue-200" />
                <span>পিডিএফ ডাউনলোড (PDF)</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>চালান / ওয়েবিল প্রিন্ট</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Waybill / Manifest Explained Card */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-2xl p-4.5 text-xs text-slate-800 space-y-2">
        <div className="flex items-center gap-2 font-black text-emerald-900 text-sm">
          <Info className="w-4 h-4 text-emerald-700" />
          <span>সুপারভাইজার প্যানেলে ওয়েবিল ম্যানুফেস্টের (Waybill Manifest) কাজ ও প্রয়োজনীয়তা:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-700 leading-relaxed">
          <div className="p-3 bg-white/80 rounded-xl border border-emerald-100 shadow-2xs">
            <strong className="block text-emerald-800 mb-0.5">১. যাত্রী তালিকা যাচাইকরণ:</strong>
            গাড়ি ছাড়ার পূর্বে টিকিট নং, সিট নম্বর, যাত্রীর নাম, মোবাইল ও বোর্ডিং পয়েন্টের সঠিক তালিকা ড্রাইভার ও সুপারভাইজারের হাতে তুলে দেওয়া।
          </div>
          <div className="p-3 bg-white/80 rounded-xl border border-emerald-100 shadow-2xs">
            <strong className="block text-emerald-800 mb-0.5">২. কাউন্টার ভিত্তিক আর্থিক হিসাব:</strong>
            কোন কাউন্টার থেকে কতজন যাত্রী উঠেছে এবং মোট কত টাকা ক্যাশ বা অনলাইন বুকিং হয়েছে তার নির্ভুল যোগফল ও হিসাব নিশ্চিত করা।
          </div>
          <div className="p-3 bg-white/80 rounded-xl border border-emerald-100 shadow-2xs">
            <strong className="block text-emerald-800 mb-0.5">৩. অফিশিয়াল স্বাক্ষর ও ট্রিপ ছাড়পত্র:</strong>
            কাউন্টার মাস্টার ও সুপারভাইজারের যৌথ স্বাক্ষরে ট্রিপের ছাড়পত্র হিসেবে এটি গাড়িতে সংরক্ষণ করা হয়। এক ক্লিকে প্রিন্ট বা পিডিএফ ডাউনলোড করা যায়।
          </div>
        </div>
      </div>

      {/* Filter Bar: Date, Direction, Supervisor */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
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

          {/* Direction Filter */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => setDirection('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                direction === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              সব ট্রিপ ({toBengaliDigits(schedules.length)})
            </button>
            <button
              type="button"
              onClick={() => setDirection('UP')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                direction === 'UP'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              আপ ট্রিপ
            </button>
            <button
              type="button"
              onClick={() => setDirection('DOWN')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                direction === 'DOWN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ডাউন ট্রিপ
            </button>
          </div>

          {/* Supervisor Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs">
            <User className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 text-[11px] font-semibold">সুপারভাইজার:</span>
            <select
              value={selectedSupervisor}
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              className="bg-transparent outline-none font-bold text-slate-800 cursor-pointer"
            >
              <option value="all">সকল সুপারভাইজার</option>
              {supervisorsList.map((sup) => (
                <option key={sup.id} value={sup.name}>
                  {sup.name} {sup.phone ? `(${sup.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          মোট ট্রিপ: <strong className="text-slate-800 font-bold">{toBengaliDigits(schedules.length)}</strong> টি
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Trip Selector Cards */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              নির্ধারিত ট্রিপসমূহ ({toBengaliDigits(schedules.length)})
            </h3>
            <span className="text-[11px] text-slate-400">ক্লিক করে সিলেক্ট করুন</span>
          </div>

          {schedules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-xs">
              নির্বাচিত তারিখে কোনো ট্রিপ শিডিউল পাওয়া যায়নি।
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
              {schedules.map((sch) => {
                const isSelected = sch.id === selectedScheduleId;
                const booked = sch.totalBookedSeats || 0;
                const capacity = sch.seatCapacity || 40;

                return (
                  <div
                    key={sch.id}
                    onClick={() => setSelectedScheduleId(sch.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-md ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase text-white ${
                            sch.direction === 'UP' ? 'bg-blue-600' : 'bg-emerald-600'
                          }`}
                        >
                          {sch.direction}
                        </span>
                        <span className="font-black text-sm text-slate-900">{sch.tripNo}</span>
                      </div>

                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {sch.departureTime}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Bus className="w-3.5 h-3.5 text-slate-500" />
                          {sch.vehicleRegNo}
                        </span>
                        {sch.tripSequenceLabel && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                            {sch.tripSequenceLabel}
                          </span>
                        )}
                      </div>

                      {sch.vehicleOwnerName && (
                        <div className="text-[11px] text-slate-500">
                          মালিক: <strong className="text-slate-700">{sch.vehicleOwnerName}</strong>
                        </div>
                      )}

                      <div className="text-[11px] text-slate-600 truncate">{sch.routeName}</div>

                      <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          {sch.supervisor}
                        </span>
                        <span className="font-bold text-indigo-700">
                          {toBengaliDigits(booked)}/{toBengaliDigits(capacity)} সিট
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">স্ট্যাটাস:</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          sch.status === 'running'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : sch.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : sch.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {sch.status === 'running'
                          ? 'চলমান (En Route)'
                          : sch.status === 'completed'
                          ? 'গন্তব্যে পৌঁছেছে'
                          : sch.status === 'cancelled'
                          ? 'বাতিল'
                          : 'নির্ধারিত'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Trip Manifest & Status Controls */}
        <div className="lg:col-span-8 space-y-4">
          {selectedSchedule && (
            <>
              {/* Trip Overview & Status Update Card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        ট্রিপ: {selectedSchedule.tripNo} — {selectedSchedule.routeName}
                      </h2>
                      {selectedSchedule.tripSequenceLabel && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          {selectedSchedule.tripSequenceLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      তারিখ: {formatBengaliDate(selectedSchedule.date)} | ছাড়ার সময়: {selectedSchedule.departureTime}
                    </p>
                  </div>

                  {/* Operational Status Control Buttons */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
                      যাত্রা স্ট্যাটাস পরিবর্তন:
                    </span>
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
                      <button
                        type="button"
                        disabled={statusUpdating}
                        onClick={() => handleUpdateStatus('scheduled')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          selectedSchedule.status === 'scheduled' || !selectedSchedule.status
                            ? 'bg-slate-800 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        নির্ধারিত
                      </button>
                      <button
                        type="button"
                        disabled={statusUpdating}
                        onClick={() => handleUpdateStatus('running')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          selectedSchedule.status === 'running'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        যাত্রা শুরু
                      </button>
                      <button
                        type="button"
                        disabled={statusUpdating}
                        onClick={() => handleUpdateStatus('completed')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          selectedSchedule.status === 'completed'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        সম্পন্ন
                      </button>
                    </div>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-400 text-[11px] block">গাড়ি ও মালিক</span>
                    <strong className="text-slate-900 font-bold block">{selectedSchedule.vehicleRegNo}</strong>
                    <span className="text-[10px] text-slate-500">
                      মালিক: {selectedSchedule.vehicleOwnerName || 'সাধারণ'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-400 text-[11px] block">দায়িত্বপ্রাপ্ত সুপারভাইজার</span>
                    <strong className="text-slate-900 font-bold block">{selectedSchedule.supervisor}</strong>
                    <a
                      href={`tel:${selectedSchedule.supervisorPhone}`}
                      className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <Phone className="w-2.5 h-2.5" />
                      {selectedSchedule.supervisorPhone || 'নম্বর নেই'}
                    </a>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <span className="text-emerald-700 text-[11px] block">বুকড আসন</span>
                    <strong className="text-emerald-900 font-bold text-sm block">
                      {toBengaliDigits(totalBookedSeats)} / {toBengaliDigits(selectedSchedule.seatCapacity)}
                    </strong>
                    <span className="text-[10px] text-emerald-700">
                      খালি: {toBengaliDigits(selectedSchedule.seatCapacity - totalBookedSeats)} টি
                    </span>
                  </div>

                  <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                    <span className="text-indigo-700 text-[11px] block">মোট ভাড়া আদায়</span>
                    <strong className="text-indigo-900 font-bold text-sm block">
                      {formatTaka(totalRevenue)}
                    </strong>
                    <span className="text-[10px] text-indigo-700">
                      কাউন্টার বুকিং হিসাব
                    </span>
                  </div>
                </div>
              </div>

              {/* Passenger Manifest / Waybill Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-800">
                      যাত্রীদের ওয়েবিল ও বিস্তারিত তালিকা ({toBengaliDigits(filteredBookings.length)} জন যাত্রী)
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Passenger Search */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="যাত্রীর নাম, ফোন, সিট বা টিকিট..."
                        className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 w-52"
                      />
                    </div>
                  </div>
                </div>

                {detailLoading ? (
                  <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    যাত্রী তালিকা লোড হচ্ছে...
                  </div>
                ) : filteredBookings.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    {searchTerm ? 'অনুসন্ধানে কোনো যাত্রী মেলেনি।' : 'এই ট্রিপে এখনও কোনো সিট বুকিং হয়নি।'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">সিট নং</th>
                          <th className="px-4 py-3">যাত্রীর নাম ও মোবাইল</th>
                          <th className="px-4 py-3">বোর্ডিং পয়েন্ট</th>
                          <th className="px-4 py-3">গন্তব্য</th>
                          <th className="px-4 py-3">ভাড়ার পরিমাণ</th>
                          <th className="px-4 py-3">কাউন্টার ও টিকিট</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredBookings.map((b: Booking) => (
                          <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 font-black text-slate-900">
                              <div className="flex flex-wrap gap-1">
                                {b.seatNumbers.map((s: string) => (
                                  <span
                                    key={s}
                                    className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-xs"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-800">{b.passengerName}</div>
                              <a
                                href={`tel:${b.passengerPhone}`}
                                className="text-indigo-600 font-semibold hover:underline flex items-center gap-1 mt-0.5"
                              >
                                <Phone className="w-3 h-3" />
                                {b.passengerPhone}
                              </a>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 text-slate-700 font-medium">
                                <MapPin className="w-3 h-3 text-emerald-600" />
                                {b.boardingPoint || 'কাউন্টার'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {b.destination || (selectedSchedule.direction === 'UP' ? 'ঢাকা' : 'মাদারীপুর')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{formatTaka(b.totalFare)}</div>
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold">
                                পেইড
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-700">{b.counterName}</div>
                              <div className="text-[10px] font-mono text-slate-400">{b.ticketNo}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Printable Passenger Manifest / Waybill Modal */}
      {printModalOpen && selectedSchedule && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                <span>যাত্রী চালান ও ওয়েবিল প্রিন্ট প্রিভিউ</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadWaybillPDF(selectedSchedule, scheduleBookings)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4 text-blue-200" />
                  <span>পিডিএফ ডাউনলোড (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>প্রিন্ট করুন</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  বন্ধ
                </button>
              </div>
            </div>

            {/* Actual Printable Waybill Sheet */}
            <div id="printable-supervisor-waybill" className="p-6 border border-slate-300 rounded-xl bg-white text-slate-900 font-sans space-y-4">
              {/* Waybill Header */}
              <div className="text-center border-b pb-3 space-y-1">
                <h2 className="text-xl font-black text-slate-900">কাউন্টার বুকিং ও বাস সার্ভিস</h2>
                <p className="text-xs font-semibold text-slate-600">
                  অফিসিয়াল যাত্রী চালান ও ট্রিপ ওয়েবিল (Passenger Trip Sheet)
                </p>
                <div className="inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-800">
                  ট্রিপ নং: {selectedSchedule.tripNo} {selectedSchedule.tripSequenceLabel ? `(${selectedSchedule.tripSequenceLabel})` : ''} — {selectedSchedule.direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ'}
                </div>
              </div>

              {/* Waybill Info Meta */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-b pb-3">
                <div>
                  <span className="text-slate-500 block">তারিখ:</span>
                  <strong>{formatBengaliDate(selectedSchedule.date)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">ছাড়ার সময়:</span>
                  <strong>{selectedSchedule.departureTime}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">গাড়ি নম্বর:</span>
                  <strong>{selectedSchedule.vehicleRegNo}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">গাড়ির মালিক:</span>
                  <strong>{selectedSchedule.vehicleOwnerName || 'সাধারণ'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">রুট:</span>
                  <strong>{selectedSchedule.routeName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">সুপারভাইজার:</span>
                  <strong>{selectedSchedule.supervisor} ({selectedSchedule.supervisorPhone})</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">মোট আসন:</span>
                  <strong>{toBengaliDigits(selectedSchedule.seatCapacity)} টি</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">বুকড যাত্রী সংখ্যা:</span>
                  <strong>{toBengaliDigits(totalBookedSeats)} জন</strong>
                </div>
              </div>

              {/* Manifest Table */}
              <table className="w-full text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="border border-slate-300 p-2 text-center w-10">ক্র.</th>
                    <th className="border border-slate-300 p-2 text-center">সিট নং</th>
                    <th className="border border-slate-300 p-2 text-left">যাত্রীর নাম</th>
                    <th className="border border-slate-300 p-2 text-left">মোবাইল নম্বর</th>
                    <th className="border border-slate-300 p-2 text-left">বোর্ডিং পয়েন্ট</th>
                    <th className="border border-slate-300 p-2 text-left">গন্তব্য</th>
                    <th className="border border-slate-300 p-2 text-right">ভাড়া (৳)</th>
                    <th className="border border-slate-300 p-2 text-center">কাউন্টার</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleBookings.map((b: Booking, idx: number) => (
                    <tr key={b.id} className="border-b border-slate-200">
                      <td className="border border-slate-300 p-2 text-center">{toBengaliDigits(idx + 1)}</td>
                      <td className="border border-slate-300 p-2 text-center font-bold font-mono">
                        {b.seatNumbers.join(', ')}
                      </td>
                      <td className="border border-slate-300 p-2 font-medium">{b.passengerName}</td>
                      <td className="border border-slate-300 p-2 font-mono">{b.passengerPhone}</td>
                      <td className="border border-slate-300 p-2">{b.boardingPoint || 'কাউন্টার'}</td>
                      <td className="border border-slate-300 p-2">{b.destination || (selectedSchedule.direction === 'UP' ? 'ঢাকা' : 'মাদারীপুর')}</td>
                      <td className="border border-slate-300 p-2 text-right font-bold">{formatTaka(b.totalFare)}</td>
                      <td className="border border-slate-300 p-2 text-center text-[10px]">{b.counterName}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={6} className="border border-slate-300 p-2 text-right">
                      মোট আদায়কৃত ভাড়া:
                    </td>
                    <td className="border border-slate-300 p-2 text-right text-emerald-800">
                      {formatTaka(totalRevenue)}
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-xs">
                      {toBengaliDigits(totalBookedSeats)} সিট
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signature Blocks */}
              <div className="pt-12 grid grid-cols-3 gap-8 text-center text-xs font-semibold text-slate-700">
                <div className="border-t border-slate-400 pt-1">কাউন্টার মাস্টার স্বাক্ষর</div>
                <div className="border-t border-slate-400 pt-1">সুপারভাইজার স্বাক্ষর</div>
                <div className="border-t border-slate-400 pt-1">যানবাহন ইনচার্জ স্বাক্ষর</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
