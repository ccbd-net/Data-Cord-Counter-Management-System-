import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { FuelEntry, FuelSettings } from '../types/index.ts';
import {
  toBengaliDigits,
  getTodayDhakaDate,
  formatTaka,
} from '../utils/formatters.ts';
import {
  combineRouteNames,
  downloadElementAsPDF,
  openPrintWindow,
} from '../utils/pdfGenerator.ts';
import {
  Fuel,
  Calendar,
  Search,
  RefreshCw,
  Printer,
  Download,
  Share2,
  Plus,
  X,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Bus,
  Save,
  Check,
  Building2,
} from 'lucide-react';

interface PendingTrip {
  reconciliationId?: string;
  vehicleId: string;
  vehicleRegNo: string;
  operationalDate: string;
  fullRoute: string;
  totalKm: number;
  mileage: number;
  expectedFuelLiters: number;
  supervisor: string;
  driver: string;
  isNightHoldMatch?: boolean;
}

// Helper to get Bengali day of week
function getBengaliDayOfWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const days = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
    const idx = isNaN(d.getDay()) ? 0 : d.getDay();
    return days[idx];
  } catch {
    return 'সোমবার';
  }
}

// Helper to format 12h time with Bengali AM/PM
function formatBengaliTime(timeStr?: string): string {
  if (!timeStr) return 'সকাল ১০:১৩';
  const upper = timeStr.toUpperCase();
  if (upper.includes('AM')) {
    const clean = timeStr.replace(/AM/i, '').trim();
    return `সকাল ${toBengaliDigits(clean)}`;
  }
  if (upper.includes('PM')) {
    const clean = timeStr.replace(/PM/i, '').trim();
    const hour = parseInt(clean.split(':')[0] || '1', 10);
    const prefix = hour >= 6 ? 'রাত' : hour >= 3 ? 'বিকাল' : 'দুপুর';
    return `${prefix} ${toBengaliDigits(clean)}`;
  }
  return toBengaliDigits(timeStr);
}

export const FuelManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Settings
  const [fuelSettings, setFuelSettings] = useState<FuelSettings>({
    commonMileage: 4,
    fuelPricePerLiter: 135.4,
  });
  const [tempMileage, setTempMileage] = useState<number>(4);
  const [tempFuelPrice, setTempFuelPrice] = useState<number>(135.4);
  const [settingsSaving, setSettingsSaving] = useState<boolean>(false);

  // Dates & Filter
  const [startDate, setStartDate] = useState<string>('2026-11-01');
  const [endDate, setEndDate] = useState<string>(getTodayDhakaDate());
  const [quickFilter, setQuickFilter] = useState<string>('today');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Data
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [pendingTrips, setPendingTrips] = useState<PendingTrip[]>([]);
  const [vehiclesList, setVehiclesList] = useState<{ id: string; regNo: string }[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<string[]>([]);
  const [driversList, setDriversList] = useState<string[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Modal Form State
  const [formDate, setFormDate] = useState<string>(getTodayDhakaDate());
  const [formTime, setFormTime] = useState<string>('7:14 PM');
  const [formVehicleRegNo, setFormVehicleRegNo] = useState<string>('');
  const [formSupervisor, setFormSupervisor] = useState<string>('');
  const [formDriver, setFormDriver] = useState<string>('');
  const [formRoute, setFormRoute] = useState<string>('মাদারীপুর - ঢাকা - মাদারীপুর');
  const [formTotalKm, setFormTotalKm] = useState<number>(255);
  const [formMileage, setFormMileage] = useState<number>(4);
  const [formActualLiters, setFormActualLiters] = useState<string>('');
  const [formReconciliationId, setFormReconciliationId] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string>('');

  const printSheetRef = useRef<HTMLDivElement>(null);

  // Clock in header
  const [currentTimeBST, setCurrentTimeBST] = useState<string>('19:14:15 BST');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const bst = new Date(now.getTime() + 6 * 3600 * 1000);
      const hours = String(bst.getUTCHours()).padStart(2, '0');
      const minutes = String(bst.getUTCMinutes()).padStart(2, '0');
      const seconds = String(bst.getUTCSeconds()).padStart(2, '0');
      setCurrentTimeBST(`${hours}:${minutes}:${seconds} BST`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Load Settings, Vehicles, Supervisors, Drivers
  const loadInitialMeta = async () => {
    try {
      const [settRes, vehRes, supRes, drvRes] = await Promise.all([
        api.getFuelSettings(),
        api.getVehicles(),
        api.getSupervisors(),
        api.getDrivers(),
      ]);

      if (settRes?.settings) {
        setFuelSettings(settRes.settings);
        setTempMileage(settRes.settings.commonMileage || 4);
        setTempFuelPrice(settRes.settings.fuelPricePerLiter || 135.4);
      }

      if (vehRes?.vehicles) {
        setVehiclesList(
          vehRes.vehicles.map((v) => ({
            id: v.id,
            regNo: v.regNo.replace('ঢাকা মেট্রো-ব ', '').trim(),
          }))
        );
      }

      if (supRes?.supervisors) {
        setSupervisorsList(supRes.supervisors.map((s) => s.name.split('(')[0].trim()));
      }

      if (drvRes?.drivers) {
        setDriversList(drvRes.drivers.map((d) => d.name.split('(')[0].trim()));
      }
    } catch (err) {
      console.error('Failed to load initial fuel metadata:', err);
    }
  };

  // Fetch Fuel Entries & Reconciled Candidates
  const fetchFuelData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Fuel Entries
      const entryRes = await api.getFuelEntries({
        startDate: quickFilter === 'all' ? undefined : startDate,
        endDate: quickFilter === 'all' ? undefined : endDate,
      });
      const entries = entryRes?.entries || [];
      setFuelEntries(entries);

      // 2. Fetch Reconciled Pairs for endDate (target operational day)
      const reconRes = await api.getReconciliationCandidates(endDate);
      const pairs = reconRes?.pairs || [];

      // Filter only reconciled full trips
      const fullTrips = pairs.filter(
        (p: any) => p.reconciliationStatus === 'reconciled' || (p.upTrip && p.downTrip)
      );

      // A trip is pending fuel if no fuel entry matches its vehicleRegNo and date
      const existingVehicleFuelDates = new Set(
        entries.map((e) => `${e.vehicleRegNo}_${e.date}`)
      );

      const pendingList: PendingTrip[] = [];
      fullTrips.forEach((p: any) => {
        const cleanRegNo = p.vehicleRegNo.replace('ঢাকা মেট্রো-ব ', '').trim();
        const tripDate = p.existingReconciliation?.operationalDate || endDate;
        const key = `${cleanRegNo}_${tripDate}`;

        // Also check raw regNo
        const keyRaw = `${p.vehicleRegNo}_${tripDate}`;

        if (!existingVehicleFuelDates.has(key) && !existingVehicleFuelDates.has(keyRaw)) {
          const upDist = p.upDistanceKm || 125;
          const downDist = p.downDistanceKm || 130;
          const totalKm = p.totalDistanceKm || (upDist + downDist);
          const fullRoute = combineRouteNames(p.upRouteName, p.downRouteName);
          const mileage = fuelSettings.commonMileage || 4;
          const expectedLiters = Number((totalKm / mileage).toFixed(1));

          pendingList.push({
            reconciliationId: p.existingReconciliation?.id || `recon-${cleanRegNo}`,
            vehicleId: p.vehicleId,
            vehicleRegNo: cleanRegNo,
            operationalDate: tripDate,
            fullRoute,
            totalKm,
            mileage,
            expectedFuelLiters: expectedLiters,
            supervisor: p.supervisor || 'রিয়াজ',
            driver: p.driver || 'মামুন শরীফ',
            isNightHoldMatch: p.isNightHoldMatch,
          });
        }
      });

      setPendingTrips(pendingList);
    } catch (err) {
      console.error('Failed to fetch fuel data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadInitialMeta();
  }, []);

  useEffect(() => {
    fetchFuelData();
  }, [startDate, endDate, quickFilter]);

  // Quick Filter Handler
  const handleQuickFilterChange = (filter: string) => {
    setQuickFilter(filter);
    const today = getTodayDhakaDate();
    if (filter === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (filter === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split('T')[0];
      setStartDate(yesterday);
      setEndDate(yesterday);
    } else if (filter === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (filter === 'month') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (filter === 'all') {
      setStartDate('2026-01-01');
      setEndDate(today);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      const res = await api.saveFuelSettings({
        commonMileage: Number(tempMileage) || 4,
        fuelPricePerLiter: Number(tempFuelPrice) || 135.4,
      });
      if (res?.settings) {
        setFuelSettings(res.settings);
        showToast('তেলের নির্ধারিত মাইলেজ ও মূল্য সংরক্ষিত হয়েছে!');
        fetchFuelData();
      }
    } catch (err) {
      console.error('Failed to save fuel settings:', err);
      showToast('সেটিংস সংরক্ষণ ব্যর্থ হয়েছে!');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Open Modal for "লিটার দিন" on a Reconciled Trip
  const handleOpenFuelModalForPendingTrip = (trip: PendingTrip) => {
    setEditingEntryId(null);
    setFormDate(trip.operationalDate);
    setFormTime('7:14 PM');
    setFormVehicleRegNo(trip.vehicleRegNo);
    setFormSupervisor(trip.supervisor);
    setFormDriver(trip.driver);
    setFormRoute(trip.fullRoute);
    setFormTotalKm(trip.totalKm);
    setFormMileage(trip.mileage || fuelSettings.commonMileage || 4);
    setFormActualLiters('');
    setFormReconciliationId(trip.reconciliationId);
    setIsModalOpen(true);
  };

  // Open Modal for New Custom Entry (+ ফুয়েল এন্ট্রি button)
  const handleOpenNewEntryModal = () => {
    setEditingEntryId(null);
    setFormDate(endDate || getTodayDhakaDate());
    setFormTime('7:14 PM');
    setFormVehicleRegNo(vehiclesList[0]?.regNo || '০১৬৩');
    setFormSupervisor(supervisorsList[0] || 'রিয়াজ');
    setFormDriver(driversList[0] || 'মামুন শরীফ');
    setFormRoute('মাদারীপুর - ঢাকা - মাদারীপুর');
    setFormTotalKm(250);
    setFormMileage(fuelSettings.commonMileage || 4);
    setFormActualLiters('');
    setFormReconciliationId(undefined);
    setIsModalOpen(true);
  };

  // Open Modal for Editing an existing entry
  const handleEditEntry = (entry: FuelEntry) => {
    setEditingEntryId(entry.id);
    setFormDate(entry.date);
    setFormTime(entry.time || '10:13 AM');
    setFormVehicleRegNo(entry.vehicleRegNo);
    setFormSupervisor(entry.supervisor);
    setFormDriver(entry.driver);
    setFormRoute(entry.route);
    setFormTotalKm(entry.totalKm);
    setFormMileage(entry.mileage || fuelSettings.commonMileage || 4);
    setFormActualLiters(String(entry.actualFuelLiters));
    setFormReconciliationId(entry.reconciliationId);
    setIsModalOpen(true);
  };

  // Delete Entry
  const handleDeleteEntry = async (id: string, regNo: string) => {
    if (!window.confirm(`আপনি কি নিশ্চিতভাবে ${regNo} গাড়ির ফুয়েল রেকর্ডটি মুছে ফেলতে চান?`)) {
      return;
    }
    try {
      await api.deleteFuelEntry(id);
      showToast(`${regNo} গাড়ির ফুয়েল এন্ট্রি মুছে ফেলা হয়েছে।`);
      fetchFuelData();
    } catch (err) {
      console.error('Error deleting entry:', err);
      showToast('এন্ট্রি মুছতে সমস্যা হয়েছে!');
    }
  };

  // Dynamic calculations inside modal
  const computedExpectedLiters = useMemo(() => {
    const km = Number(formTotalKm) || 0;
    const mil = Number(formMileage) || 1;
    return Number((km / mil).toFixed(1));
  }, [formTotalKm, formMileage]);

  const computedTotalMoney = useMemo(() => {
    const liters = parseFloat(formActualLiters) || 0;
    const rate = fuelSettings.fuelPricePerLiter || 135.4;
    return Math.round(liters * rate);
  }, [formActualLiters, fuelSettings.fuelPricePerLiter]);

  const computedFuelDifference = useMemo(() => {
    const liters = parseFloat(formActualLiters) || 0;
    const diff = liters - computedExpectedLiters;
    return Number(diff.toFixed(1));
  }, [formActualLiters, computedExpectedLiters]);

  // Save Modal Form
  const handleSaveModalEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const actualLitersNum = parseFloat(formActualLiters);
    if (isNaN(actualLitersNum) || actualLitersNum <= 0) {
      alert('অনুগ্রহ করে তেলের সঠিক পরিমাণ (লিটার) লিখুন।');
      return;
    }

    const dayName = getBengaliDayOfWeek(formDate);
    const totalCost = Math.round(actualLitersNum * (fuelSettings.fuelPricePerLiter || 135.4));
    const fuelDiff = Number((actualLitersNum - computedExpectedLiters).toFixed(1));

    try {
      if (editingEntryId) {
        await api.updateFuelEntry(editingEntryId, {
          date: formDate,
          dayOfWeek: dayName,
          time: formTime,
          vehicleRegNo: formVehicleRegNo,
          direction: 'আপ-ডাউন',
          route: formRoute,
          supervisor: formSupervisor,
          driver: formDriver,
          totalKm: formTotalKm,
          mileage: formMileage,
          expectedFuelLiters: computedExpectedLiters,
          actualFuelLiters: actualLitersNum,
          fuelRatePerLiter: fuelSettings.fuelPricePerLiter,
          totalCost,
          fuelDifference: fuelDiff,
        });
        showToast('ফুয়েল এন্ট্রি সফলভাবে আপডেট হয়েছে!');
      } else {
        const nextSerial = toBengaliDigits(String(fuelEntries.length + 1).padStart(2, '0'));
        await api.createFuelEntry({
          companyId: user?.companyId,
          reconciliationId: formReconciliationId,
          serialNo: nextSerial,
          date: formDate,
          dayOfWeek: dayName,
          time: formTime,
          vehicleRegNo: formVehicleRegNo,
          direction: 'আপ-ডাউন',
          route: formRoute,
          supervisor: formSupervisor,
          driver: formDriver,
          totalKm: formTotalKm,
          mileage: formMileage,
          expectedFuelLiters: computedExpectedLiters,
          actualFuelLiters: actualLitersNum,
          fuelRatePerLiter: fuelSettings.fuelPricePerLiter,
          totalCost,
          fuelDifference: fuelDiff,
        });
        showToast(`গাড়ি ${formVehicleRegNo} এ ${actualLitersNum} লিটার তেল সফলভাবে যুক্ত হয়েছে!`);
      }

      setIsModalOpen(false);
      fetchFuelData();
    } catch (err) {
      console.error('Failed to save fuel entry:', err);
      alert('এন্ট্রি সংরক্ষণ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    }
  };

  // Filtered Fuel Entries for search
  const filteredFuelEntries = useMemo(() => {
    if (!searchTerm.trim()) return fuelEntries;
    const q = searchTerm.toLowerCase().trim();
    return fuelEntries.filter(
      (e) =>
        e.vehicleRegNo.toLowerCase().includes(q) ||
        e.driver.toLowerCase().includes(q) ||
        e.supervisor.toLowerCase().includes(q) ||
        e.route.toLowerCase().includes(q)
    );
  }, [fuelEntries, searchTerm]);

  // Handle Export / Print
  const handlePrint = () => {
    openPrintWindow('printable-fuel-log-sheet', 'A4-landscape');
  };

  const handleDownloadPDF = async () => {
    try {
      await downloadElementAsPDF(
        'printable-fuel-log-sheet',
        `Fuel-Logbook-${startDate}-to-${endDate}.pdf`,
        'landscape'
      );
    } catch (err) {
      console.error('PDF error:', err);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      showToast('ফুয়েল লগের লিংক কপি করা হয়েছে!');
    }
  };

  return (
    <div className="p-3 sm:p-5 max-w-7xl mx-auto space-y-5 text-slate-800 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 border border-emerald-500 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span className="font-semibold text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="text-xs text-slate-500 font-medium flex items-center gap-2 mb-1">
            <span>ওয়্যার্কস্পেস</span>
            <span>/</span>
            <span className="text-slate-800 font-semibold">ফুয়েল লগ</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600 font-mono text-[11px]">{currentTimeBST}</span>
            <span className="text-slate-300">|</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">বাংলা</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
              {user?.role === 'super_admin' ? 'সুপার এডমিন' : 'কোম্পানি এডমিন'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <Fuel className="w-7 h-7 text-blue-600 shrink-0" />
            <span>ফুয়েল লগ</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            তেলের ব্যবহার ও খরচের সঠিক হিসাব।
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchFuelData();
            }}
            disabled={refreshing}
            className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 transition-colors"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenNewEntryModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>+ ফুয়েল এন্ট্রি</span>
          </button>
        </div>
      </div>

      {/* Date Filter & Export Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setQuickFilter('custom');
              }}
              className="bg-transparent border-none text-xs focus:outline-hidden font-medium"
            />
            <span className="text-slate-400 font-bold">থেকে</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setQuickFilter('custom');
              }}
              className="bg-transparent border-none text-xs focus:outline-hidden font-medium"
            />
          </div>

          <select
            value={quickFilter}
            onChange={(e) => handleQuickFilterChange(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-semibold focus:outline-hidden"
          >
            <option value="today">আজ</option>
            <option value="yesterday">গতকাল</option>
            <option value="week">এই সপ্তাহ</option>
            <option value="month">এই মাস</option>
            <option value="all">সকল</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 border border-slate-300 transition-colors"
            title="প্রিন্ট করুন"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>প্রিন্ট</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 border border-slate-300 transition-colors"
            title="পিডিএফ ডাউনলোড"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>পিডিএফ</span>
          </button>
          <button
            onClick={handleShare}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-lg border border-slate-300 transition-colors"
            title="শেয়ার"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* "তেলের নির্ধারিত হিসাব" Configuration Card */}
      <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3.5 sm:p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-700">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">তেলের নির্ধারিত হিসাব</h2>
              <p className="text-xs text-slate-500">
                সকল সমন্বিত ট্রিপে তেলের প্রাক্কলন ও মূল্য গণনায় ব্যবহৃত হবে।
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                কমন মাইলেজ (কিমি/লিটার)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={tempMileage}
                onChange={(e) => setTempMileage(parseFloat(e.target.value) || 0)}
                className="w-28 sm:w-32 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                তেলের মূল্য (৳ / লিটার)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={tempFuelPrice}
                onChange={(e) => setTempFuelPrice(parseFloat(e.target.value) || 0)}
                className="w-32 sm:w-36 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="pt-5 sm:pt-4">
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
              >
                {settingsSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>সংরক্ষণ</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: "সমন্বিত ট্রিপ — তেল দেওয়া বাকি" */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">
                সমন্বিত ট্রিপ — তেল দেওয়া বাকি
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold font-mono">
                {toBengaliDigits(pendingTrips.length)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              শুধু লিটার বসান; টাকা ও অতিরিক্ত তেল অটো হিসাব হবে।
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[750px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-2.5 text-center">তারিখ</th>
                <th className="p-2.5 text-center">গাড়ি নাম্বার</th>
                <th className="p-2.5">পূর্ণ রুট</th>
                <th className="p-2.5 text-center">মোট কিমি</th>
                <th className="p-2.5 text-center">মাইলেজ</th>
                <th className="p-2.5 text-center">নির্ধারিত ফুয়েল</th>
                <th className="p-2.5">সুপারভাইজার</th>
                <th className="p-2.5">ড্রাইভার</th>
                <th className="p-2.5 text-center">স্ট্যাটাস</th>
                <th className="p-2.5 text-center">একশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingTrips.length > 0 ? (
                pendingTrips.map((trip) => (
                  <tr key={trip.vehicleId || trip.vehicleRegNo} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 text-center font-medium text-slate-700">
                      {toBengaliDigits(trip.operationalDate)}
                    </td>
                    <td className="p-2.5 text-center font-bold text-slate-900">
                      {trip.vehicleRegNo}
                    </td>
                    <td className="p-2.5 font-semibold text-slate-800">
                      {trip.fullRoute}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                      {toBengaliDigits(trip.totalKm)}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                      {toBengaliDigits(trip.mileage)}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-blue-700">
                      {toBengaliDigits(trip.expectedFuelLiters)} লিটার
                    </td>
                    <td className="p-2.5 text-slate-700 font-medium">{trip.supervisor}</td>
                    <td className="p-2.5 text-slate-700 font-medium">{trip.driver}</td>
                    <td className="p-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                        সমন্বিত
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handleOpenFuelModalForPendingTrip(trip)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1 mx-auto transition-colors"
                      >
                        <Fuel className="w-3.5 h-3.5" />
                        <span>লিটার দিন</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-400 text-xs">
                    কোনো সমন্বিত ট্রিপে তেল দেওয়া বাকি নেই। সকল গাড়িতে তেল এন্ট্রি সম্পন্ন হয়েছে।
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: "ফুয়েল এন্ট্রি" Table (Saved Entries) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900">ফুয়েল এন্ট্রি</h2>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold font-mono">
              {toBengaliDigits(filteredFuelEntries.length)}
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="গাড়ি বা নাম দিয়ে খুঁজুন..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-2.5 text-center">ক্রমিক নং</th>
                <th className="p-2.5 text-center">তারিখ</th>
                <th className="p-2.5 text-center">বার</th>
                <th className="p-2.5 text-center">সময়</th>
                <th className="p-2.5 text-center">গাড়ি নাম্বার</th>
                <th className="p-2.5 text-center">দিক</th>
                <th className="p-2.5">রুট</th>
                <th className="p-2.5">সুপারভাইজার</th>
                <th className="p-2.5">ড্রাইভার</th>
                <th className="p-2.5 text-center">মোট কিমি</th>
                <th className="p-2.5 text-center">নির্ধারিত ফুয়েল</th>
                <th className="p-2.5 text-center">প্রদানকৃত ফুয়েল</th>
                <th className="p-2.5 text-right">মোট টাকা</th>
                <th className="p-2.5 text-center">ফুয়েল +/-</th>
                <th className="p-2.5 text-center">একশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredFuelEntries.length > 0 ? (
                filteredFuelEntries.map((entry, idx) => {
                  const serialBn = entry.serialNo || toBengaliDigits(String(idx + 1).padStart(2, '0'));
                  const diff = entry.fuelDifference;
                  const diffColor =
                    diff > 0
                      ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : diff < 0
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-blue-50 text-blue-600 border-blue-200';
                  const diffText = diff > 0 ? `+${diff}` : `${diff}`;

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 text-center font-mono font-bold text-slate-500">
                        {serialBn}
                      </td>
                      <td className="p-2.5 text-center font-medium">
                        {toBengaliDigits(entry.date)}
                      </td>
                      <td className="p-2.5 text-center text-slate-600">
                        {entry.dayOfWeek || getBengaliDayOfWeek(entry.date)}
                      </td>
                      <td className="p-2.5 text-center text-slate-600">
                        {formatBengaliTime(entry.time)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          <Bus className="w-3.5 h-3.5 text-blue-600" />
                          <span>{entry.vehicleRegNo}</span>
                        </span>
                      </td>
                      <td className="p-2.5 text-center text-slate-600">
                        {entry.direction || 'আপ-ডাউন'}
                      </td>
                      <td className="p-2.5 font-semibold text-slate-800">
                        {entry.route}
                      </td>
                      <td className="p-2.5 text-slate-700">{entry.supervisor}</td>
                      <td className="p-2.5 text-slate-700">{entry.driver}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                        {toBengaliDigits(entry.totalKm)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                        {toBengaliDigits(entry.expectedFuelLiters)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-extrabold text-blue-700">
                        {toBengaliDigits(entry.actualFuelLiters)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {formatTaka(entry.totalCost)}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${diffColor}`}
                        >
                          {toBengaliDigits(diffText)}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditEntry(entry)}
                            className="p-1 text-slate-500 hover:text-blue-600 rounded transition-colors"
                            title="সম্পাদনা করুন"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(entry.id, entry.vehicleRegNo)}
                            className="p-1 text-slate-500 hover:text-rose-600 rounded transition-colors"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-slate-400 text-xs">
                    কোনো ফুয়েল এন্ট্রি পাওয়া যায়নি।
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            মোট <span className="font-bold text-slate-800">{toBengaliDigits(filteredFuelEntries.length)}</span> টি এন্ট্রি
          </div>
          <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>ক্লাউডে সংরক্ষিত</span>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="text-center text-xs text-slate-400 pt-2 pb-6">
        © 2026 Trip & Fuel Logbook &nbsp;•&nbsp; Powered by Data&Code
      </div>

      {/* ======================================================== */}
      {/* "নতুন ফুয়েল এন্ট্রি" Modal (Exact match with Screenshot 1) */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 my-8">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Fuel className="w-5 h-5 text-blue-600" />
                <span>{editingEntryId ? 'ফুয়েল এন্ট্রি পরিবর্তন করুন' : 'নতুন ফুয়েল এন্ট্রি'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveModalEntry} className="p-4 sm:p-5 space-y-4 text-xs text-slate-700">
              {/* Row 1: Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">তারিখ</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">সময়</label>
                  <input
                    type="text"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    placeholder="e.g. 7:14 PM"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Bengali Day Name */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-800 text-xs">
                বার: {getBengaliDayOfWeek(formDate)}
              </div>

              {/* Row 3: Vehicle Number */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">গাড়ি নাম্বার</label>
                <select
                  value={formVehicleRegNo}
                  onChange={(e) => setFormVehicleRegNo(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {vehiclesList.length > 0 ? (
                    vehiclesList.map((v) => (
                      <option key={v.id} value={v.regNo}>
                        {v.regNo}
                      </option>
                    ))
                  ) : (
                    <option value={formVehicleRegNo}>{formVehicleRegNo}</option>
                  )}
                </select>
              </div>

              {/* Row 4: Supervisor */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">সুপারভাইজার</label>
                <select
                  value={formSupervisor}
                  onChange={(e) => setFormSupervisor(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {supervisorsList.length > 0 ? (
                    supervisorsList.map((s, idx) => (
                      <option key={idx} value={s}>
                        {s}
                      </option>
                    ))
                  ) : (
                    <option value={formSupervisor}>{formSupervisor}</option>
                  )}
                </select>
              </div>

              {/* Row 5: Driver */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ড্রাইভার</label>
                <select
                  value={formDriver}
                  onChange={(e) => setFormDriver(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {driversList.length > 0 ? (
                    driversList.map((d, idx) => (
                      <option key={idx} value={d}>
                        {d}
                      </option>
                    ))
                  ) : (
                    <option value={formDriver}>{formDriver}</option>
                  )}
                </select>
              </div>

              {/* Row 6: 4 Boxes in 2x2 grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Box 1: Full Route */}
                <div className="bg-slate-100 rounded-lg p-2.5 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">
                    পূর্ণ রুট
                  </span>
                  <span className="font-extrabold text-slate-900 text-xs truncate block">
                    {formRoute}
                  </span>
                </div>

                {/* Box 2: Total Km */}
                <div className="bg-slate-100 rounded-lg p-2.5 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">
                    মোট কিমি
                  </span>
                  <span className="font-extrabold text-slate-900 text-xs block font-mono">
                    {toBengaliDigits(formTotalKm)}
                  </span>
                </div>

                {/* Box 3: Mileage */}
                <div className="bg-slate-100 rounded-lg p-2.5 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">
                    মাইলেজ
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={formMileage}
                    onChange={(e) => setFormMileage(parseFloat(e.target.value) || 1)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-0.5 font-mono font-bold text-xs"
                  />
                </div>

                {/* Box 4: Expected Fuel */}
                <div className="bg-slate-100 rounded-lg p-2.5 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold mb-0.5">
                    নির্ধারিত ফুয়েল
                  </span>
                  <span className="font-extrabold text-slate-900 text-xs block font-mono">
                    {toBengaliDigits(computedExpectedLiters)} লিটার
                  </span>
                </div>
              </div>

              {/* Row 7: Actual Fuel Given (Input field) */}
              <div>
                <label className="block font-bold text-slate-900 mb-1">
                  তেলের পরিমাণ (লিটার)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="তেলের পরিমাণ লিখুন..."
                  value={formActualLiters}
                  onChange={(e) => setFormActualLiters(e.target.value)}
                  className="w-full bg-white border-2 border-blue-400 rounded-xl px-3.5 py-2.5 text-sm font-extrabold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  autoFocus
                  required
                />
              </div>

              {/* Row 8: Auto Calculation Card */}
              <div className="bg-slate-100/90 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 block font-semibold">
                    মোট টাকা
                  </span>
                  <span className="text-sm font-extrabold text-slate-900 font-mono">
                    {formatTaka(computedTotalMoney)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-semibold">
                    ফুয়েল +/-
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border ${
                      computedFuelDifference > 0
                        ? 'bg-rose-50 text-rose-600 border-rose-200'
                        : computedFuelDifference < 0
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-blue-50 text-blue-600 border-blue-200'
                    }`}
                  >
                    {toBengaliDigits(
                      computedFuelDifference > 0
                        ? `+${computedFuelDifference}`
                        : `${computedFuelDifference}`
                    )}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>এন্ট্রি সংরক্ষণ করুন</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Hidden Print Template for High-Res Bengali Unicode Print  */}
      {/* ======================================================== */}
      <div id="printable-fuel-log-sheet" className="hidden">
        <div style={{ fontFamily: "'Hind Siliguri', sans-serif", padding: '12px' }}>
          {/* Company Letterhead */}
          <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '10px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {user?.company?.logoUrl && (
                  <img
                    src={user.company.logoUrl}
                    alt="Company Logo"
                    style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'contain', background: '#ffffff', border: '1px solid #cbd5e1' }}
                  />
                )}
                <div>
                  <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0', color: '#0f172a' }}>
                    {user?.company?.name || 'কাউন্টার ট্রিপ ফুয়েল লগ'}
                  </h1>
                  <div style={{ fontSize: '11px', color: '#475569' }}>
                    {user?.company?.address ? `${user.company.address} | ` : ''}{user?.company?.phone ? `হটলাইন: ${user.company.phone}` : ''}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-block', padding: '4px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 'bold', fontSize: '12px' }}>
                  দৈনিক ট্রিপ ফুয়েল ও ডিজেল ব্যবহারের বিবরণী
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px', color: '#334155' }}>
                  তারিখ: <strong>{toBengaliDigits(startDate)}</strong> থেকে <strong>{toBengaliDigits(endDate)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '20px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'center' }}>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>ক্রমিক</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>তারিখ</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>বার</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>সময়</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>গাড়ি নাম্বার</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>দিক</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px', textAlign: 'left' }}>রুট</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>সুপারভাইজার</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>ড্রাইভার</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>মোট কিমি</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>নির্ধারিত</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>প্রদানকৃত</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px', textAlign: 'right' }}>মোট টাকা</th>
                <th style={{ border: '1px solid #94a3b8', padding: '5px' }}>ফুয়েল +/-</th>
              </tr>
            </thead>
            <tbody>
              {filteredFuelEntries.map((entry, idx) => (
                <tr key={entry.id} style={{ textAlign: 'center' }}>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{toBengaliDigits(idx + 1)}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{toBengaliDigits(entry.date)}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{entry.dayOfWeek}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{entry.time}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px', fontWeight: 'bold' }}>{entry.vehicleRegNo}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{entry.direction}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px', textAlign: 'left' }}>{entry.route}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{entry.supervisor}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{entry.driver}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px', fontWeight: 'bold' }}>{toBengaliDigits(entry.totalKm)}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{toBengaliDigits(entry.expectedFuelLiters)}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px', fontWeight: 'bold' }}>{toBengaliDigits(entry.actualFuelLiters)}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>৳{toBengaliDigits(entry.totalCost)}</td>
                  <td style={{ border: '1px solid #94a3b8', padding: '4px' }}>{toBengaliDigits(entry.fuelDifference)}</td>
                </tr>
              ))}
              <tr style={{ background: '#e2e8f0', fontWeight: 'bold', textAlign: 'center' }}>
                <td colSpan={9} style={{ border: '1px solid #94a3b8', padding: '6px', textAlign: 'right' }}>
                  সর্বমোট ({toBengaliDigits(filteredFuelEntries.length)} টি গাড়ি):
                </td>
                <td style={{ border: '1px solid #94a3b8', padding: '6px' }}>
                  {toBengaliDigits(filteredFuelEntries.reduce((acc, c) => acc + c.totalKm, 0))} কিমি
                </td>
                <td style={{ border: '1px solid #94a3b8', padding: '6px' }}>-</td>
                <td style={{ border: '1px solid #94a3b8', padding: '6px' }}>
                  {toBengaliDigits(filteredFuelEntries.reduce((acc, c) => acc + c.actualFuelLiters, 0).toFixed(1))} লিটার
                </td>
                <td style={{ border: '1px solid #94a3b8', padding: '6px', textAlign: 'right' }}>
                  ৳{toBengaliDigits(filteredFuelEntries.reduce((acc, c) => acc + c.totalCost, 0))}
                </td>
                <td style={{ border: '1px solid #94a3b8', padding: '6px' }}>-</td>
              </tr>
            </tbody>
          </table>

          {/* Footer Signature */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', paddingTop: '15px', borderTop: '1px solid #cbd5e1' }}>
            <div style={{ fontSize: '10px', color: '#64748b' }}>
              প্রিন্ট সময়: {new Date().toLocaleString('bn-BD')}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ borderTop: '2px solid #0f172a', display: 'inline-block', minWidth: '220px', textAlign: 'center', paddingTop: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                প্রত্যায়নকারী : ____________________
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
