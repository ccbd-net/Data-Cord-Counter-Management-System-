import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { FuelEntry, FuelSettings, Vehicle } from '../types/index.ts';
import {
  toBengaliDigits,
  getTodayDhakaDate,
  formatTaka,
} from '../utils/formatters.ts';
import {
  combineRouteNames,
  downloadElementAsPDF,
  printElementById,
} from '../utils/pdfGenerator.ts';
import {
  buildOwnerWhatsAppMessage,
  buildWhatsAppUrl,
  formatSignedFuelCostDiff,
  normalizeRegNo,
  type OwnerReportSummaryItem,
} from '../utils/whatsapp.ts';
import { OwnerWhatsAppModal } from '../components/OwnerWhatsAppModal.tsx';
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
  Bus,
  Save,
  Check,
  MessageCircle,
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesList, setVehiclesList] = useState<{ id: string; regNo: string }[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<string[]>([]);
  const [driversList, setDriversList] = useState<string[]>([]);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState<boolean>(false);

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
  const [modalError, setModalError] = useState<string>('');

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
        setVehicles(vehRes.vehicles);
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

  const computedExpectedCost = useMemo(() => {
    const rate = fuelSettings.fuelPricePerLiter || 135.4;
    return Math.round(computedExpectedLiters * rate);
  }, [computedExpectedLiters, fuelSettings.fuelPricePerLiter]);

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

  const computedCostDifference = useMemo(() => {
    // নির্ধারিত মূল্য - প্রদানকৃত মূল্য = +/- মূল্য
    return computedExpectedCost - computedTotalMoney;
  }, [computedExpectedCost, computedTotalMoney]);

  const getFuelEntryCosts = (entry: FuelEntry) => {
    const rate = Number(entry.fuelRatePerLiter) || fuelSettings.fuelPricePerLiter || 135.4;
    const expectedCost =
      entry.expectedFuelCost !== undefined && entry.expectedFuelCost !== null
        ? Math.round(Number(entry.expectedFuelCost))
        : Math.round((Number(entry.expectedFuelLiters) || 0) * rate);
    const actualCost =
      Number(entry.totalCost) || Math.round((Number(entry.actualFuelLiters) || 0) * rate);
    const costDiff =
      entry.fuelCostDifference !== undefined && entry.fuelCostDifference !== null
        ? Math.round(Number(entry.fuelCostDifference))
        : expectedCost - actualCost;
    return { expectedCost, actualCost, costDiff };
  };

  // Save Modal Form
  const handleSaveModalEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    const actualLitersNum = parseFloat(formActualLiters);
    if (isNaN(actualLitersNum) || actualLitersNum <= 0) {
      setModalError('অনুগ্রহ করে তেলের সঠিক পরিমাণ (লিটার) লিখুন।');
      return;
    }

    const dayName = getBengaliDayOfWeek(formDate);
    const rate = fuelSettings.fuelPricePerLiter || 135.4;
    const totalCost = Math.round(actualLitersNum * rate);
    const expectedFuelCost = Math.round(computedExpectedLiters * rate);
    const fuelCostDifference = expectedFuelCost - totalCost;
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
          fuelRatePerLiter: rate,
          totalCost,
          expectedFuelCost,
          fuelCostDifference,
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
          fuelRatePerLiter: rate,
          totalCost,
          expectedFuelCost,
          fuelCostDifference,
          fuelDifference: fuelDiff,
        });
        showToast(`গাড়ি ${formVehicleRegNo} এ ${actualLitersNum} লিটার তেল সফলভাবে যুক্ত হয়েছে!`);
      }

      setIsModalOpen(false);
      fetchFuelData();
    } catch (err) {
      console.error('Failed to save fuel entry:', err);
      setModalError('এন্ট্রি সংরক্ষণ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
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

  const fuelTotals = useMemo(() => {
    return filteredFuelEntries.reduce(
      (acc, entry) => {
        const costs = getFuelEntryCosts(entry);
        acc.km += Number(entry.totalKm) || 0;
        acc.expectedLiters += Number(entry.expectedFuelLiters) || 0;
        acc.actualLiters += Number(entry.actualFuelLiters) || 0;
        acc.expectedCost += costs.expectedCost;
        acc.actualCost += costs.actualCost;
        acc.costDiff += costs.costDiff;
        return acc;
      },
      { km: 0, expectedLiters: 0, actualLiters: 0, expectedCost: 0, actualCost: 0, costDiff: 0 }
    );
  }, [filteredFuelEntries, fuelSettings.fuelPricePerLiter]);

  const ownerMapByReg = useMemo(() => {
    const m = new Map<string, Vehicle>();
    vehicles.forEach((v) => m.set(normalizeRegNo(v.regNo), v));
    return m;
  }, [vehicles]);

  const whatsappOwnerItems: OwnerReportSummaryItem[] = useMemo(() => {
    const grouped = new Map<
      string,
      {
        ownerName: string;
        ownerPhone: string;
        vehicles: Set<string>;
        tripCount: number;
        expectedCost: number;
        actualCost: number;
        costDiff: number;
        lines: string[];
      }
    >();

    filteredFuelEntries.forEach((entry) => {
      const veh = ownerMapByReg.get(normalizeRegNo(entry.vehicleRegNo));
      const ownerName = veh?.ownerName?.trim() || 'সাধারণ মালিক';
      const ownerPhone = veh?.ownerPhone || '';
      const costs = getFuelEntryCosts(entry);

      if (!grouped.has(ownerName)) {
        grouped.set(ownerName, {
          ownerName,
          ownerPhone,
          vehicles: new Set(),
          tripCount: 0,
          expectedCost: 0,
          actualCost: 0,
          costDiff: 0,
          lines: [],
        });
      }
      const g = grouped.get(ownerName)!;
      g.vehicles.add(entry.vehicleRegNo);
      if (!g.ownerPhone && ownerPhone) g.ownerPhone = ownerPhone;
      g.tripCount += 1;
      g.expectedCost += costs.expectedCost;
      g.actualCost += costs.actualCost;
      g.costDiff += costs.costDiff;
      g.lines.push(
        `${entry.vehicleRegNo} (${toBengaliDigits(entry.date)}): নির্ধারিত ${formatTaka(costs.expectedCost)}, প্রদান ${formatTaka(costs.actualCost)}, +/- ${formatSignedFuelCostDiff(costs.costDiff)}`
      );
    });

    return Array.from(grouped.values()).map((g) => ({
      ownerName: g.ownerName,
      ownerPhone: g.ownerPhone,
      vehicles: Array.from(g.vehicles),
      tripCount: g.tripCount,
      totalFare: g.actualCost,
      fuelExpectedCost: g.expectedCost,
      fuelActualCost: g.actualCost,
      fuelCostDiff: g.costDiff,
      customLines: g.lines,
    }));
  }, [filteredFuelEntries, ownerMapByReg, fuelSettings.fuelPricePerLiter]);

  // Handle Export / Print
  const handlePrint = () => {
    printElementById('printable-fuel-log-sheet', `ফুয়েল লগ — ${startDate}`, 'A4-landscape');
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
      printElementById('printable-fuel-log-sheet', `ফুয়েল লগ — ${startDate}`, 'A4-landscape');
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
      <div className="space-y-5 print:hidden">
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
              {user?.role === 'super_admin'
                ? 'সুপার এডমিন'
                : user?.role === 'company_admin'
                ? 'মাস্টার এডমিন'
                : user?.role === 'fuel_manager'
                ? 'ফুয়েল ম্যানেজার'
                : user?.role === 'moderator'
                ? 'মডারেটর'
                : 'মাস্টার এডমিন'}
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

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowWhatsAppModal(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="মালিকদের হোয়াটসঅ্যাপে পাঠান"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>হোয়াটসঅ্যাপ (মালিক)</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 border border-slate-300 transition-colors cursor-pointer"
            title="শুধু টেবিল প্রিন্ট করুন"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>শুধু টেবিল প্রিন্ট</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
            title="শুধু টেবিল পিডিএফ ডাউনলোড"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>টেবিল PDF</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-lg border border-slate-300 transition-colors cursor-pointer"
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
          <table className="w-full text-xs text-left border-collapse min-w-[1120px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-2.5 text-center">ক্রমিক নং</th>
                <th className="p-2.5 text-center">তারিখ</th>
                <th className="p-2.5 text-center">বার</th>
                <th className="p-2.5 text-center">সময়</th>
                <th className="p-2.5 text-center">গাড়ি নাম্বার</th>
                <th className="p-2.5">রুট</th>
                <th className="p-2.5">সুপারভাইজার</th>
                <th className="p-2.5">ড্রাইভার</th>
                <th className="p-2.5 text-center">মোট কিমি</th>
                <th className="p-2.5 text-center">নির্ধারিত (লি.)</th>
                <th className="p-2.5 text-center">প্রদানকৃত (লি.)</th>
                <th className="p-2.5 text-right bg-slate-200/60">নির্ধারিত মূল্য</th>
                <th className="p-2.5 text-right bg-blue-50/70">প্রদানকৃত মূল্য</th>
                <th className="p-2.5 text-right bg-amber-50/80">+/- মূল্য</th>
                <th className="p-2.5 text-center">ফুয়েল +/- (লি.)</th>
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
                  const costs = getFuelEntryCosts(entry);
                  const costDiffColor =
                    costs.costDiff > 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : costs.costDiff < 0
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200';
                  const vehOwner = ownerMapByReg.get(normalizeRegNo(entry.vehicleRegNo));
                  const ownerWaUrl = vehOwner?.ownerPhone
                    ? buildWhatsAppUrl(
                        vehOwner.ownerPhone,
                        buildOwnerWhatsAppMessage(
                          user?.company?.name || 'পরিবহন সার্ভিস',
                          'ফুয়েল লগ হিসাব',
                          toBengaliDigits(entry.date),
                          {
                            ownerName: vehOwner.ownerName || 'মালিক',
                            ownerPhone: vehOwner.ownerPhone,
                            vehicles: [entry.vehicleRegNo],
                            tripCount: 1,
                            totalFare: costs.actualCost,
                            fuelExpectedCost: costs.expectedCost,
                            fuelActualCost: costs.actualCost,
                            fuelCostDiff: costs.costDiff,
                            customLines: [
                              `রুট: ${entry.route}`,
                              `মোট কিমি: ${toBengaliDigits(entry.totalKm)} কিমি`,
                              `নির্ধারিত ফুয়েল: ${toBengaliDigits(entry.expectedFuelLiters)} লি.`,
                              `প্রদানকৃত ফুয়েল: ${toBengaliDigits(entry.actualFuelLiters)} লি.`,
                            ],
                          }
                        )
                      )
                    : '';

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 text-center font-mono font-bold text-slate-500">
                        {serialBn}
                      </td>
                      <td className="p-2.5 text-center font-medium whitespace-nowrap">
                        {toBengaliDigits(entry.date)}
                      </td>
                      <td className="p-2.5 text-center text-slate-600 whitespace-nowrap">
                        {entry.dayOfWeek || getBengaliDayOfWeek(entry.date)}
                      </td>
                      <td className="p-2.5 text-center text-slate-600 whitespace-nowrap">
                        {formatBengaliTime(entry.time)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Bus className="w-3.5 h-3.5 text-blue-600" />
                          <span>{entry.vehicleRegNo}</span>
                        </span>
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
                      <td className="p-2.5 text-right font-mono font-semibold text-slate-700 bg-slate-50/70 tabular-nums whitespace-nowrap">
                        {formatTaka(costs.expectedCost)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 bg-blue-50/30 tabular-nums whitespace-nowrap">
                        {formatTaka(costs.actualCost)}
                      </td>
                      <td className="p-2.5 text-right font-mono bg-amber-50/30 tabular-nums whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${costDiffColor}`}
                        >
                          {formatSignedFuelCostDiff(costs.costDiff)}
                        </span>
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
                          {ownerWaUrl && (
                            <a
                              href={ownerWaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title={`মালিককে (${vehOwner?.ownerName || ''}) হোয়াটসঅ্যাপে পাঠান`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleEditEntry(entry)}
                            className="p-1 text-slate-500 hover:text-blue-600 rounded transition-colors cursor-pointer"
                            title="সম্পাদনা করুন"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(entry.id, entry.vehicleRegNo)}
                            className="p-1 text-slate-500 hover:text-rose-600 rounded transition-colors cursor-pointer"
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
                  <td colSpan={16} className="p-8 text-center text-slate-400 text-xs">
                    কোনো ফুয়েল এন্ট্রি পাওয়া যায়নি।
                  </td>
                </tr>
              )}
            </tbody>
            {filteredFuelEntries.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                  <td colSpan={8} className="p-2.5 text-right">
                    সর্বমোট ({toBengaliDigits(filteredFuelEntries.length)} টি এন্ট্রি):
                  </td>
                  <td className="p-2.5 text-center font-mono">{toBengaliDigits(fuelTotals.km)}</td>
                  <td className="p-2.5 text-center font-mono">{toBengaliDigits(fuelTotals.expectedLiters.toFixed(1))}</td>
                  <td className="p-2.5 text-center font-mono text-blue-800">{toBengaliDigits(fuelTotals.actualLiters.toFixed(1))}</td>
                  <td className="p-2.5 text-right font-mono tabular-nums whitespace-nowrap">{formatTaka(fuelTotals.expectedCost)}</td>
                  <td className="p-2.5 text-right font-mono text-blue-900 tabular-nums whitespace-nowrap">{formatTaka(fuelTotals.actualCost)}</td>
                  <td className={`p-2.5 text-right font-mono tabular-nums whitespace-nowrap ${fuelTotals.costDiff > 0 ? 'text-emerald-700' : fuelTotals.costDiff < 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                    {formatSignedFuelCostDiff(fuelTotals.costDiff)}
                  </td>
                  <td colSpan={2} className="p-2.5 text-center text-[11px] text-slate-600">
                    নির্ধারিত - প্রদানকৃত = +/- মূল্য
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            মোট <span className="font-bold text-slate-800">{toBengaliDigits(filteredFuelEntries.length)}</span> টি এন্ট্রি
          </div>
          <div className="text-slate-600 font-medium">
            হিসাব সূত্র: নির্ধারিত তেলের মূল্য − প্রদানকৃত তেলের মূল্য = +/- মূল্য
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
              <div className="bg-slate-100/90 border border-slate-200 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10.5px] text-slate-500 block font-semibold">
                    নির্ধারিত মূল্য
                  </span>
                  <span className="text-sm font-extrabold text-slate-800 font-mono">
                    {formatTaka(computedExpectedCost)}
                  </span>
                </div>

                <div>
                  <span className="text-[10.5px] text-slate-500 block font-semibold">
                    প্রদানকৃত মূল্য
                  </span>
                  <span className="text-sm font-extrabold text-blue-800 font-mono">
                    {formatTaka(computedTotalMoney)}
                  </span>
                </div>

                <div>
                  <span className="text-[10.5px] text-slate-500 block font-semibold">
                    +/- মূল্য
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${
                      computedCostDifference > 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : computedCostDifference < 0
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {formatSignedFuelCostDiff(computedCostDifference)}
                  </span>
                </div>
              </div>

              {modalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
                  {modalError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>এন্ট্রি সংরক্ষণ করুন</span>
              </button>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* ======================================================== */}
      {/* Hidden Print Template for Clean Table-Only Bengali Print & PDF */}
      {/* ======================================================== */}
      <div id="printable-fuel-log-sheet" className="hidden print:block">
        <div
          style={{
            fontFamily: "'Hind Siliguri', sans-serif",
            padding: '10px',
            backgroundColor: '#ffffff',
            color: '#0f172a',
          }}
        >
          {/* Company Name + Date Only Header */}
          <div
            className="recon-print-header"
            style={{
              textAlign: 'center',
              borderBottom: '1.5px solid #0f172a',
              paddingBottom: '8px',
              marginBottom: '10px',
            }}
          >
            <h1
              className="recon-company-name"
              style={{ fontSize: '19px', fontWeight: 800, margin: 0, color: '#0f172a', lineHeight: 1.35 }}
            >
              {user?.company?.name || 'কাউন্টার টিকেটিং'}
            </h1>
            <div
              className="recon-subtitle"
              style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: '#334155', lineHeight: 1.4 }}
            >
              দৈনিক ট্রিপ ফুয়েল লগ ডাটাবেইজ • তারিখ: {toBengaliDigits(startDate)} থেকে {toBengaliDigits(endDate)}
            </div>
          </div>

          {/* Table with separate borders and generous cell breathing room */}
          <table
            className="report-table recon-compact-table"
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0,
              borderTop: '1px solid #475569',
              borderLeft: '1px solid #475569',
              fontSize: '10px',
              lineHeight: 1.6,
              backgroundColor: '#ffffff',
              color: '#0f172a',
            }}
          >
            <colgroup>
              <col style={{ width: '3.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>ক্র.</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>তারিখ ও বার</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>সময়</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>গাড়ি</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5, textAlign: 'left' }}>রুট</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>সুপারভাইজার</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>ড্রাইভার</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>কিমি</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>নির্ধারিত (লি.)</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>প্রদান (লি.)</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5, textAlign: 'right' }}>নির্ধারিত মূল্য</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5, textAlign: 'right' }}>প্রদানকৃত মূল্য</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5, textAlign: 'right' }}>+/- মূল্য</th>
                <th style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.5 }}>ফুয়েল +/-</th>
              </tr>
            </thead>
            <tbody>
              {filteredFuelEntries.map((entry, idx) => {
                const costs = getFuelEntryCosts(entry);
                return (
                  <tr
                    key={entry.id}
                    style={{
                      textAlign: 'center',
                      backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff',
                      color: '#0f172a',
                    }}
                  >
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6, fontWeight: 700 }}>
                      {toBengaliDigits(idx + 1)}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6 }}>
                      <div>{toBengaliDigits(entry.date)}</div>
                      <div style={{ fontSize: '9px', color: '#475569' }}>{entry.dayOfWeek || getBengaliDayOfWeek(entry.date)}</div>
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6 }}>
                      {formatBengaliTime(entry.time)}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6, fontWeight: 800 }}>
                      {entry.vehicleRegNo}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6, textAlign: 'left', fontWeight: 600 }}>
                      {entry.route}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6 }}>
                      {entry.supervisor}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6 }}>
                      {entry.driver}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6, fontWeight: 700 }}>
                      {toBengaliDigits(entry.totalKm)}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6 }}>
                      {toBengaliDigits(entry.expectedFuelLiters)}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6, fontWeight: 800 }}>
                      {toBengaliDigits(entry.actualFuelLiters)}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatTaka(costs.expectedCost)}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatTaka(costs.actualCost)}
                    </td>
                    <td
                      style={{
                        borderRight: '1px solid #475569',
                        borderBottom: '1px solid #475569',
                        padding: '7px 5px',
                        lineHeight: 1.6,
                        textAlign: 'right',
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        color: costs.costDiff > 0 ? '#065f46' : costs.costDiff < 0 ? '#b91c1c' : '#0f172a',
                      }}
                    >
                      {formatSignedFuelCostDiff(costs.costDiff)}
                    </td>
                    <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '7px 5px', lineHeight: 1.6 }}>
                      {toBengaliDigits(entry.fuelDifference > 0 ? `+${entry.fuelDifference}` : entry.fuelDifference)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 800, textAlign: 'center', color: '#0f172a' }}>
                <td colSpan={7} style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 6px', lineHeight: 1.6, textAlign: 'right' }}>
                  সর্বমোট ({toBengaliDigits(filteredFuelEntries.length)} টি এন্ট্রি):
                </td>
                <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.6 }}>
                  {toBengaliDigits(fuelTotals.km)} কিমি
                </td>
                <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.6 }}>
                  {toBengaliDigits(fuelTotals.expectedLiters.toFixed(1))} লি.
                </td>
                <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.6 }}>
                  {toBengaliDigits(fuelTotals.actualLiters.toFixed(1))} লি.
                </td>
                <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTaka(fuelTotals.expectedCost)}
                </td>
                <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTaka(fuelTotals.actualCost)}
                </td>
                <td
                  style={{
                    borderRight: '1px solid #475569',
                    borderBottom: '1px solid #475569',
                    padding: '8px 5px',
                    lineHeight: 1.6,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: fuelTotals.costDiff > 0 ? '#065f46' : fuelTotals.costDiff < 0 ? '#b91c1c' : '#0f172a',
                  }}
                >
                  {formatSignedFuelCostDiff(fuelTotals.costDiff)}
                </td>
                <td style={{ borderRight: '1px solid #475569', borderBottom: '1px solid #475569', padding: '8px 5px', lineHeight: 1.6 }}>
                  -
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <OwnerWhatsAppModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        companyName={user?.company?.name || 'কাউন্টার টিকেটিং'}
        reportTitle="ফুয়েল লগ ও +/- মূল্য হিসাব"
        dateLabel={`${toBengaliDigits(startDate)} থেকে ${toBengaliDigits(endDate)}`}
        items={whatsappOwnerItems}
      />
    </div>
  );
};
