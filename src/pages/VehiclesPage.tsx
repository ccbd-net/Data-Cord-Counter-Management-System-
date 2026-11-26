import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Vehicle, SeatCapacity, Schedule } from '../types/index.ts';
import { toBengaliDigits, formatTaka, getTodayDhakaDate, formatBengaliDate } from '../utils/formatters.ts';
import {
  buildWhatsAppUrl,
  normalizeWhatsAppPhone,
  buildOwnerWhatsAppMessage,
} from '../utils/whatsapp.ts';
import { SeatMap } from '../components/SeatMap.tsx';
import {
  Bus,
  Plus,
  Edit,
  Eye,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  X,
  User,
  Phone,
  FileSpreadsheet,
  Printer,
  Layers,
  Trash2,
  MessageCircle,
} from 'lucide-react';

export const VehiclesPage: React.FC = () => {
  const { isMasterAdmin, isModerator, activeCompanyId, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // View Mode: 'fleet' (Vehicle list) or 'owners' (Owner fleet & trip report)
  const [viewTab, setViewTab] = useState<'fleet' | 'owners'>('fleet');
  const [fleetLayout, setFleetLayout] = useState<'table' | 'grid'>('table');
  const [reportDate, setReportDate] = useState<string>(getTodayDhakaDate());
  const [reportMonth, setReportMonth] = useState<string>(getTodayDhakaDate().substring(0, 7)); // YYYY-MM

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [regNo, setRegNo] = useState<string>('');
  const [seatCapacity, setSeatCapacity] = useState<SeatCapacity>(42);
  const [ownerName, setOwnerName] = useState<string>('');
  const [ownerPhone, setOwnerPhone] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'maintenance' | 'inactive'>('active');
  const [notes, setNotes] = useState<string>('');

  // Seat Layout Preview Modal
  const [previewVehicle, setPreviewVehicle] = useState<Vehicle | null>(null);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const fetchVehiclesAndSchedules = async () => {
    setLoading(true);
    try {
      const [vRes, sRes] = await Promise.all([
        api.getVehicles(),
        api.getSchedules(), // fetch all recent schedules to calculate owner trip counts
      ]);
      setVehicles(vRes.vehicles);
      setSchedules(sRes.schedules);
    } catch (err) {
      console.error('Failed to load vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehiclesAndSchedules();
  }, []);

  const openAddModal = () => {
    setEditingVehicle(null);
    setRegNo('');
    setSeatCapacity(42);
    setOwnerName('');
    setOwnerPhone('');
    setStatus('active');
    setNotes('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (v: Vehicle) => {
    setEditingVehicle(v);
    setRegNo(v.regNo || '');
    setSeatCapacity(v.seatCapacity || 42);
    setOwnerName(v.ownerName || '');
    setOwnerPhone(v.ownerPhone || '');
    setStatus(v.status || 'active');
    setNotes(v.notes || '');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!regNo.trim()) {
      setErrorMsg('গাড়ির রেজিস্ট্রেশন নম্বর আবশ্যক!');
      return;
    }
    if (!ownerName.trim()) {
      setErrorMsg('গাড়ির মালিকের নাম আবশ্যক!');
      return;
    }

    try {
      if (editingVehicle) {
        await api.updateVehicle(editingVehicle.id, {
          regNo: regNo.trim(),
          seatCapacity,
          ownerName: ownerName.trim(),
          ownerPhone: ownerPhone.trim(),
        });
        setSuccessMsg(`গাড়ি "${regNo}" এর তথ্য সফলভাবে আপডেট হয়েছে!`);
      } else {
        await api.createVehicle({
          regNo: regNo.trim(),
          seatCapacity,
          ownerName: ownerName.trim(),
          ownerPhone: ownerPhone.trim(),
          companyId: activeCompanyId || user?.companyId,
        });
        setSuccessMsg(`নতুন গাড়ি "${regNo}" (মালিক: ${ownerName}) সফলভাবে যুক্ত হয়েছে!`);
      }
      setIsModalOpen(false);
      await fetchVehiclesAndSchedules();
    } catch (err: any) {
      setErrorMsg(err.message || 'গাড়ি সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handleDeleteVehicle = async (v: Vehicle) => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে "${v.regNo}" (মালিক: ${v.ownerName}) গাড়িটি মুছে ফেলতে চান?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.deleteVehicle(v.id);
      setSuccessMsg(`গাড়ি "${v.regNo}" সফলভাবে মুছে ফেলা হয়েছে!`);
      await fetchVehiclesAndSchedules();
    } catch (err: any) {
      setErrorMsg(err.message || 'গাড়ি ডিলিট ব্যর্থ হয়েছে।');
    }
  };

  // Owner-wise Analytics Calculation
  const ownerStats = useMemo(() => {
    const map = new Map<
      string,
      {
        ownerName: string;
        ownerPhone: string;
        vehicles: Vehicle[];
        dailyTrips: Schedule[];
        monthlyTrips: Schedule[];
        allTrips: Schedule[];
      }
    >();

    // Index vehicles by owner
    for (const v of vehicles) {
      const oName = v.ownerName?.trim() || 'অনির্দিষ্ট মালিক';
      if (!map.has(oName)) {
        map.set(oName, {
          ownerName: oName,
          ownerPhone: v.ownerPhone || '',
          vehicles: [],
          dailyTrips: [],
          monthlyTrips: [],
          allTrips: [],
        });
      }
      const entry = map.get(oName)!;
      entry.vehicles.push(v);
      if (!entry.ownerPhone && v.ownerPhone) {
        entry.ownerPhone = v.ownerPhone;
      }
    }

    // Index schedules to owner's vehicles
    const vehicleToOwner = new Map<string, string>();
    for (const v of vehicles) {
      vehicleToOwner.set(v.id, v.ownerName?.trim() || 'অনির্দিষ্ট মালিক');
      vehicleToOwner.set(v.regNo, v.ownerName?.trim() || 'অনির্দিষ্ট মালিক');
    }

    for (const s of schedules) {
      if (s.status === 'cancelled') continue;
      const oName =
        s.vehicleOwnerName?.trim() ||
        vehicleToOwner.get(s.vehicleId) ||
        vehicleToOwner.get(s.vehicleRegNo);
      if (oName && map.has(oName)) {
        const entry = map.get(oName)!;
        entry.allTrips.push(s);
        if (s.date === reportDate) {
          entry.dailyTrips.push(s);
        }
        if (s.date && s.date.startsWith(reportMonth)) {
          entry.monthlyTrips.push(s);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.vehicles.length - a.vehicles.length);
  }, [vehicles, schedules, reportDate, reportMonth]);

  // Export Owner Trip Report to Excel/CSV
  const exportOwnerReportToExcel = () => {
    if (ownerStats.length === 0) {
      setErrorMsg('এক্সপোর্ট করার মতো মালিক তথ্য নেই!');
      return;
    }

    const headers = [
      'ক্রমিক',
      'মালিকের নাম',
      'মালিকের মোবাইল',
      'মালিকানাধীন গাড়ির সংখ্যা',
      'গাড়ির নম্বরসমূহ',
      `নির্বাচিত দিনে ট্রিপ সংখ্যা (${reportDate})`,
      `চলতি মাসে মোট ট্রিপ (${reportMonth})`,
      'চলতি মাসে সর্বমোট বিক্রিত আসন',
      'সিট ভাড়া আদায় (৳)',
      'মালের ভাড়া (৳)',
      'সর্বমোট টাকা (সিট+মাল) (৳)',
    ];

    const rows = ownerStats.map((o, idx) => {
      const monthlySeats = o.monthlyTrips.reduce((acc, t) => acc + (t.totalBookedSeats || 0), 0);
      const monthlyCargo = o.monthlyTrips.reduce((acc, t) => acc + (Number(t.totalCargoCollection) || 0), 0);
      const monthlyAmount = o.monthlyTrips.reduce((acc, t) => acc + (t.totalCollection || 0), 0);
      const monthlySeatFare = o.monthlyTrips.reduce((acc, t) => {
        const cargo = Math.max(0, Number(t.totalCargoCollection) || 0);
        const total = Math.max(0, Number(t.totalCollection) || 0);
        return acc + (t.totalSeatCollection !== undefined ? Number(t.totalSeatCollection) : Math.max(0, total - cargo));
      }, 0);
      return [
        idx + 1,
        `"${o.ownerName}"`,
        `"${o.ownerPhone || '-'}"`,
        o.vehicles.length,
        `"${o.vehicles.map((v) => v.regNo).join(', ')}"`,
        o.dailyTrips.length,
        o.monthlyTrips.length,
        monthlySeats,
        monthlySeatFare,
        monthlyCargo,
        monthlyAmount,
      ].join(',');
    });

    const csvContent =
      '\uFEFF' +
      [
        `"Counter Management System — গাড়ির মালিকভিত্তিক বহর ও ট্রিপ অডিট রিপোর্ট"`,
        `"তারিখ: ${reportDate} | মাস: ${reportMonth} | প্রিন্ট সময়: ${new Date().toLocaleString()}"`,
        headers.join(','),
        ...rows,
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Vehicle-Owner-Report-${reportMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Bus className="w-5 h-5 text-emerald-600" />
            <span>গাড়ি ও মালিক ব্যবস্থাপনা (Vehicle & Fleet Owners)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            মালিকের নাম যুক্তকরণ, কোন মালিকের কয়টা গাড়ি এবং দিনে বা মাসে কয় ট্রিপ পরিচালনা করেছে তার পূর্ণাঙ্গ হিসাব
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Tab Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => setViewTab('fleet')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewTab === 'fleet'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              গাড়ির বহর ({toBengaliDigits(vehicles.length)})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('owners')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewTab === 'owners'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              মালিকভিত্তিক হিসাব ও ট্রিপ ({toBengaliDigits(ownerStats.length)})
            </button>
          </div>

          <button
            type="button"
            onClick={fetchVehiclesAndSchedules}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {(isMasterAdmin || isModerator) && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন গাড়ি ও মালিক যুক্ত করুন</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold border border-emerald-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold border border-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tab 1: Standard Vehicles List View with Owner Names */}
      {viewTab === 'fleet' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-slate-600">
              মোট নিবন্ধিত গাড়ি: <strong>{toBengaliDigits(vehicles.length)}</strong> টি
            </span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFleetLayout('table')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  fleetLayout === 'table'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>এক্সেল শিট গ্রিড ভিউ</span>
              </button>
              <button
                type="button"
                onClick={() => setFleetLayout('grid')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  fleetLayout === 'grid'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>কার্ড ভিউ</span>
              </button>
            </div>
          </div>

          {fleetLayout === 'table' ? (
            <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[11px]">
                      <th className="py-2.5 px-3 border-r border-slate-300 text-center w-12">নং</th>
                      <th className="py-2.5 px-3 border-r border-slate-300">গাড়ির নম্বর (Reg No)</th>
                      <th className="py-2.5 px-3 border-r border-slate-300">মালিকের নাম</th>
                      <th className="py-2.5 px-3 border-r border-slate-300">মালিকের মোবাইল</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 text-center">আসন সংখ্যা</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 text-center bg-blue-50/50">আজকের ট্রিপ</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 text-center bg-emerald-50/50">চলতি মাসের ট্রিপ</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 text-center w-24">স্ট্যাটাস</th>
                      <th className="py-2.5 px-3 text-right">একশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {vehicles.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 border border-slate-300">
                          কোনো গাড়ি নিবন্ধিত নেই। "+ নতুন গাড়ি ও মালিক যুক্ত করুন" বাটনে ক্লিক করে যুক্ত করুন।
                        </td>
                      </tr>
                    ) : (
                      vehicles.map((v, idx) => {
                        const todayCount = schedules.filter(
                          (s) => s.vehicleId === v.id && s.date === reportDate && s.status !== 'cancelled'
                        ).length;
                        const monthCount = schedules.filter(
                          (s) => s.vehicleId === v.id && s.date && s.date.startsWith(reportMonth) && s.status !== 'cancelled'
                        ).length;

                        return (
                          <tr key={v.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="py-2.5 px-3 border-r border-slate-200 text-center font-mono font-bold text-slate-500">
                              {toBengaliDigits(idx + 1)}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-900 font-mono">
                              <div className="flex items-center gap-1.5">
                                <Bus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{v.regNo}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-800">
                              {v.ownerName || 'সাধারণ'}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-700">
                              {v.ownerPhone ? (
                                <div className="flex items-center gap-2">
                                  <a href={`tel:${v.ownerPhone}`} className="hover:text-emerald-700 flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    <span>{v.ownerPhone}</span>
                                  </a>
                                  {normalizeWhatsAppPhone(v.ownerPhone) && (
                                    <a
                                      href={buildWhatsAppUrl(
                                        v.ownerPhone,
                                        `*${user?.company?.name || 'কাউন্টার টিকেটিং'}*\nমালিক: ${v.ownerName || 'সাধারণ'}\nগাড়ি: ${v.regNo}\nআজ (${reportDate}) ট্রিপ: ${toBengaliDigits(todayCount)} টি\nচলতি মাস (${reportMonth}) ট্রিপ: ${toBengaliDigits(monthCount)} টি`
                                      )}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[10px] font-sans font-bold"
                                      title="হোয়াটসঅ্যাপে বার্তা পাঠান"
                                    >
                                      <MessageCircle className="w-3 h-3" />
                                      <span>WA</span>
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">প্রযোজ্য নয়</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                {toBengaliDigits(v.seatCapacity)} আসন ({v.seatCapacity === 42 ? '৪২ সিট' : '৪৬ সিট'})
                              </span>
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 text-center bg-blue-50/20 font-bold text-slate-900">
                              {toBengaliDigits(todayCount)} টি
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 text-center bg-emerald-50/20 font-bold text-emerald-700">
                              {toBengaliDigits(monthCount)} টি
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  v.status === 'active'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : v.status === 'maintenance'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {v.status === 'active' ? 'সক্রিয়' : v.status === 'maintenance' ? 'সার্ভিসিং' : 'নিষ্ক্রিয়'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPreviewVehicle(v)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="সিট ম্যাপ"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>সিট ম্যাপ</span>
                                </button>
                                {(isMasterAdmin || isModerator) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(v)}
                                      className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                      title="সম্পাদনা"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteVehicle(v)}
                                      className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                      title="মুছে ফেলুন"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vehicles.map((v) => {
                const todayCount = schedules.filter(
                  (s) => s.vehicleId === v.id && s.date === reportDate && s.status !== 'cancelled'
                ).length;
                const monthCount = schedules.filter(
                  (s) => s.vehicleId === v.id && s.date && s.date.startsWith(reportMonth) && s.status !== 'cancelled'
                ).length;

                return (
                  <div
                    key={v.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 hover:shadow-md transition-shadow relative space-y-3"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
                          <Bus className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">{v.regNo}</h3>
                          <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" />
                            <span>মালিক: {v.ownerName || 'সাধারণ'}</span>
                          </div>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          v.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : v.status === 'maintenance'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {v.status === 'active' ? 'সক্রিয়' : v.status === 'maintenance' ? 'সার্ভিসিং' : 'নিষ্ক্রিয়'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">আসন সংখ্যা:</span>
                        <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                          {toBengaliDigits(v.seatCapacity)} আসন ({v.seatCapacity === 42 ? '৪২ সিট' : '৪৬ সিট'})
                        </span>
                      </div>

                      {v.ownerPhone && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 font-medium">মালিকের মোবাইল:</span>
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${v.ownerPhone}`}
                              className="font-mono text-emerald-700 font-semibold hover:underline flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{v.ownerPhone}</span>
                            </a>
                            {normalizeWhatsAppPhone(v.ownerPhone) && (
                              <a
                                href={buildWhatsAppUrl(
                                  v.ownerPhone,
                                  `*${user?.company?.name || 'কাউন্টার টিকেটিং'}*\nমালিক: ${v.ownerName || 'সাধারণ'}\nগাড়ি: ${v.regNo}\nআজ (${reportDate}) ট্রিপ: ${toBengaliDigits(todayCount)} টি\nচলতি মাস (${reportMonth}) ট্রিপ: ${toBengaliDigits(monthCount)} টি`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold"
                                title="হোয়াটসঅ্যাপে বার্তা পাঠান"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>হোয়াটসঅ্যাপ</span>
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Trip Counts Today & Monthly */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-500">আজকের ট্রিপ</div>
                          <div className="text-sm font-black text-slate-800 mt-0.5">
                            {toBengaliDigits(todayCount)} টি
                          </div>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-500">চলতি মাসে ট্রিপ</div>
                          <div className="text-sm font-black text-emerald-700 mt-0.5">
                            {toBengaliDigits(monthCount)} টি
                          </div>
                        </div>
                      </div>

                      <div className="pt-1 text-slate-500 text-[11px] truncate">
                        {v.notes ? `নোট: ${v.notes}` : 'কোনো অতিরিক্ত নোট নেই'}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewVehicle(v)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>সিট ম্যাপ</span>
                      </button>

                      {(isMasterAdmin || isModerator) && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(v)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="সম্পাদনা"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>এডিট</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVehicle(v)}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>ডিলিট</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Owner-wise Fleet & Trip Audit View */}
      {viewTab === 'owners' && (
        <div className="space-y-4">
          {/* Filter Bar for Owner Report */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Daily Filter */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold">
                <span className="text-slate-500">দিন:</span>
                <input
                  type="date"
                  value={reportDate ?? ''}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer"
                />
              </div>

              {/* Month Filter */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold">
                <span className="text-slate-500">মাস:</span>
                <input
                  type="month"
                  value={reportMonth ?? ''}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-bold"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportOwnerReportToExcel}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>মালিক রিপোর্ট এক্সেল (.CSV)</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>প্রিন্ট</span>
              </button>
            </div>
          </div>

          {/* Owner Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ownerStats.map((o) => {
              const monthlySeats = o.monthlyTrips.reduce((acc, t) => acc + (t.totalBookedSeats || 0), 0);
              const monthlyCargo = o.monthlyTrips.reduce((acc, t) => acc + (Number(t.totalCargoCollection) || 0), 0);
              const monthlySeatFare = o.monthlyTrips.reduce((acc, t) => {
                const cargo = Math.max(0, Number(t.totalCargoCollection) || 0);
                const total = Math.max(0, Number(t.totalCollection) || 0);
                return acc + (t.totalSeatCollection !== undefined ? Number(t.totalSeatCollection) : Math.max(0, total - cargo));
              }, 0);
              const monthlyAmount = monthlySeatFare + monthlyCargo;
              const dailySeats = o.dailyTrips.reduce((acc, t) => acc + (t.totalBookedSeats || 0), 0);
              const dailyCargo = o.dailyTrips.reduce((acc, t) => acc + (Number(t.totalCargoCollection) || 0), 0);
              const dailySeatFare = o.dailyTrips.reduce((acc, t) => {
                const cargo = Math.max(0, Number(t.totalCargoCollection) || 0);
                const total = Math.max(0, Number(t.totalCollection) || 0);
                return acc + (t.totalSeatCollection !== undefined ? Number(t.totalSeatCollection) : Math.max(0, total - cargo));
              }, 0);
              const dailyAmount = dailySeatFare + dailyCargo;

              return (
                <div
                  key={o.ownerName}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 hover:shadow-md transition-shadow space-y-4"
                >
                  {/* Owner Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-slate-900">{o.ownerName}</h3>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{o.ownerPhone || 'মোবাইল নম্বর যুক্ত নেই'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        গাড়ির সংখ্যা
                      </span>
                      <span className="text-base font-black text-emerald-700">
                        {toBengaliDigits(o.vehicles.length)} টি গাড়ি
                      </span>
                    </div>
                  </div>

                  {/* Owned Vehicles Chips */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">
                      মালিকানাধীন গাড়িসমূহ:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {o.vehicles.map((v) => (
                        <span
                          key={v.id}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200 flex items-center gap-1"
                        >
                          <Bus className="w-3 h-3 text-slate-500" />
                          <span>{v.regNo}</span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            ({toBengaliDigits(v.seatCapacity)} সিট)
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Trip Statistics: Daily vs Monthly */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    {/* Selected Day Stats */}
                    <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-200/80">
                      <div className="text-[10px] font-bold text-blue-900 mb-1">
                        আজকের দিনে ({reportDate})
                      </div>
                      <div className="text-xl font-black text-blue-800">
                        {toBengaliDigits(o.dailyTrips.length)} <span className="text-xs font-semibold">টি ট্রিপ</span>
                      </div>
                      <div className="text-[11px] text-blue-700 mt-1">
                        যাত্রী: {toBengaliDigits(dailySeats)} | মোট: <strong>{formatTaka(dailyAmount)}</strong>
                      </div>
                      <div className="text-[10px] text-blue-600/90 mt-0.5">
                        সিট: {formatTaka(dailySeatFare)} | মাল: {formatTaka(dailyCargo)}
                      </div>
                    </div>

                    {/* Monthly Stats */}
                    <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200/80">
                      <div className="text-[10px] font-bold text-emerald-900 mb-1">
                        চলতি মাসে ({reportMonth})
                      </div>
                      <div className="text-xl font-black text-emerald-800">
                        {toBengaliDigits(o.monthlyTrips.length)} <span className="text-xs font-semibold">টি ট্রিপ</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-1">
                        যাত্রী: {toBengaliDigits(monthlySeats)} | মোট: <strong>{formatTaka(monthlyAmount)}</strong>
                      </div>
                      <div className="text-[10px] text-emerald-700/90 mt-0.5">
                        সিট: {formatTaka(monthlySeatFare)} | মাল: {formatTaka(monthlyCargo)}
                      </div>
                    </div>
                  </div>

                  {/* Direct WhatsApp Owner Report Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    {normalizeWhatsAppPhone(o.ownerPhone) ? (
                      <a
                        href={buildWhatsAppUrl(
                          o.ownerPhone,
                          buildOwnerWhatsAppMessage(
                            user?.company?.name || 'কাউন্টার টিকেটিং',
                            'মালিকভিত্তিক গাড়ির ট্রিপ ও আয় রিপোর্ট',
                            `${reportDate} (${formatBengaliDate(reportDate)})`,
                            {
                              ownerName: o.ownerName,
                              ownerPhone: o.ownerPhone,
                              vehicles: o.vehicles.map((v) => v.regNo),
                              tripCount: o.dailyTrips.length,
                              bookedSeats: dailySeats,
                              seatFare: dailySeatFare,
                              cargoFare: dailyCargo,
                              totalFare: dailyAmount,
                              customLines: [
                                `চলতি মাস (${reportMonth}) মোট ট্রিপ: ${toBengaliDigits(o.monthlyTrips.length)} টি`,
                                `মাসিক যাত্রী: ${toBengaliDigits(monthlySeats)} জন | মাসিক আয়: ${formatTaka(monthlyAmount)}`,
                              ],
                            }
                          )
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>হোয়াটসঅ্যাপে হিসাব পাঠান ({o.ownerPhone})</span>
                      </a>
                    ) : (
                      <div className="w-full py-2 px-3 bg-slate-100 text-slate-500 rounded-xl text-[11px] font-semibold text-center">
                        হোয়াটসঅ্যাপে পাঠাতে মালিকের সঠিক ১১ সংখ্যার মোবাইল নম্বর যুক্ত করুন
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Vehicle Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingVehicle ? 'গাড়ি ও মালিক তথ্য সম্পাদনা' : 'নতুন গাড়ি ও মালিক সংযোজন'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  গাড়ির রেজিস্ট্রেশন নম্বর *
                </label>
                <input
                  type="text"
                  value={regNo ?? ''}
                  onChange={(e) => setRegNo(e.target.value)}
                  placeholder="ঢাকা মেট্রো-ব-১৫-৪২০১"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Owner Name Input (Replaced Model as requested) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  গাড়ির মালিকের নাম *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={ownerName ?? ''}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="মালিকের পূর্ণ নাম"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  সিট প্ল্যান কনফিগারেশন (Seat Capacity) *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSeatCapacity(42)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      seatCapacity === 42
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">৪২ সিট বাস</div>
                    <div className="text-[10px] text-slate-500">A-I (৩৬) + J (৫) + EX-1 (১)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeatCapacity(46)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      seatCapacity === 46
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">৪৬ সিট বাস</div>
                    <div className="text-[10px] text-slate-500">A-J (৪০) + K (৫) + EX-1 (১)</div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
              >
                {editingVehicle ? 'গাড়ির তথ্য আপডেট করুন' : 'নতুন গাড়ি সংরক্ষণ করুন'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Seat Map Preview Modal */}
      {previewVehicle && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">{previewVehicle.regNo}</h3>
                <p className="text-xs text-slate-500">
                  মালিক: {previewVehicle.ownerName || 'সাধারণ'} | আসন সংখ্যা: {toBengaliDigits(previewVehicle.seatCapacity)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVehicle(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <SeatMap
              seatCapacity={previewVehicle.seatCapacity}
              bookedSeats={[]}
              selectedSeats={[]}
              onSeatToggle={() => {}}
              counters={[]}
              readOnly={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};
