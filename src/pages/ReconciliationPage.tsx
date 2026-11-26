import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Reconciliation, Vehicle, FuelEntry } from '../types/index.ts';
import { formatTaka, toBengaliDigits, getTodayDhakaDate, formatBengaliDate } from '../utils/formatters.ts';
import {
  downloadElementAsPDF,
  printElementById,
  combineRouteNames,
  calculateTimeDifference,
} from '../utils/pdfGenerator.ts';
import { OwnerWhatsAppModal } from '../components/OwnerWhatsAppModal.tsx';
import { normalizeRegNo, type OwnerReportSummaryItem } from '../utils/whatsapp.ts';
import {
  Scale,
  Calendar,
  CheckCircle,
  AlertCircle,
  Bus,
  RefreshCw,
  Clock,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  Printer,
  FileText,
  X,
  MessageCircle,
} from 'lucide-react';

export const ReconciliationPage: React.FC = () => {
  const { user, isSuperAdmin, isCompanyAdmin, isMasterAdmin, isModerator } = useAuth();
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [loading, setLoading] = useState<boolean>(true);
  const [pairs, setPairs] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [reconcilingVehicleId, setReconcilingVehicleId] = useState<string | null>(null);
  const [batchReconciling, setBatchReconciling] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'RECONCILED' | 'PENDING'>('ALL');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState<boolean>(false);

  const fetchReconciliationData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [res, vRes, fRes] = await Promise.all([
        api.getReconciliationCandidates(date),
        api.getVehicles().catch(() => ({ vehicles: [] as Vehicle[] })),
        api.getFuelEntries({ date }).catch(() => ({ entries: [] as FuelEntry[] })),
      ]);
      setPairs(res.pairs);
      setReconciliations(res.existingReconciliations || []);
      setVehicles(vRes.vehicles || []);
      setFuelEntries(fRes.entries || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'সমন্বয় তথ্য লোড ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliationData();
  }, [date]);

  const handleReconcile = async (pair: any) => {
    if (!isMasterAdmin && !isModerator && !isCompanyAdmin && !isSuperAdmin) {
      setErrorMsg('আপনার ট্রিপ সমন্বয় করার অনুমতি নেই!');
      return;
    }

    setReconcilingVehicleId(pair.vehicleId);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await api.saveReconciliation({
        operationalDate: date,
        vehicleId: pair.vehicleId,
        upTripId: pair.upTrip?.id,
        downTripId: pair.downTrip?.id,
        notes: pair.isNightHoldMatch ? 'নাইট-হোল্ড আপ ট্রিপের সাথে ডাউন ট্রিপ সমন্বয়' : '',
      });

      setSuccessMsg(`গাড়ি "${pair.vehicleRegNo}" এর আপ ও ডাউন ট্রিপের আর্থিক সমন্বয় সফল হয়েছে! ট্রিপ পূর্ণাঙ্গ রূপ পেয়েছে।`);
      await fetchReconciliationData();
    } catch (err: any) {
      setErrorMsg(err.message || 'সমন্বয় ব্যর্থ হয়েছে।');
    } finally {
      setReconcilingVehicleId(null);
    }
  };

  // Reconcile all ready pairs in one click
  const handleBatchReconcile = async () => {
    if (!isMasterAdmin && !isModerator && !isCompanyAdmin && !isSuperAdmin) {
      setErrorMsg('আপনার ট্রিপ সমন্বয় করার অনুমতি নেই!');
      return;
    }

    setBatchReconciling(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.batchReconcile(date);
      setSuccessMsg(`এক ক্লিকে ${toBengaliDigits(res.count)} টি প্রস্তুত ট্রিপের সমন্বয় সফলভাবে সম্পন্ন হয়েছে! কোনো অপেক্ষমান ট্রিপ নেই।`);
      await fetchReconciliationData();
    } catch (err: any) {
      setErrorMsg(err.message || 'ব্যাচ সমন্বয় ব্যর্থ হয়েছে।');
    } finally {
      setBatchReconciling(false);
    }
  };

  // Export as downloadable Excel (CSV with UTF-8 BOM)
  const exportToExcel = () => {
    if (pairs.length === 0) {
      setErrorMsg('এক্সপোর্ট করার জন্য কোনো ট্রিপ তথ্য পাওয়া যায়নি!');
      return;
    }

    const headers = [
      'ক্রমিক নং',
      'তারিখ',
      'গাড়ি নাম্বার',
      'নাইট হোল্ড / রেগুলার ট্রিপ',
      'সময় আপ ও ডাউন',
      'সময়ের ব্যবধান (আপ সময় - ডাউন সময় = রেজাল্ট)',
      'রুট (রেজাল্ট)',
      'মোট কিলোমিটার (আপ কিমি + ডাউন কিমি = রেজাল্ট)',
      'সিট ভাড়া আদায় (৳)',
      'মালের ভাড়া (৳)',
      'মোট টাকা (সিট+মাল) (৳)',
      'সুপারভাইজার',
      'ড্রাইভার',
    ];

    const rows = pairs.map((p, idx) => {
      const upTime = p.upTrip?.departureTime || '-';
      const downTime = p.downTrip?.departureTime || '-';
      const timeDiff = calculateTimeDifference(p.upTrip?.departureTime, p.downTrip?.departureTime, p.isNightHoldMatch);
      const combinedRoute = combineRouteNames(p.upRouteName, p.downRouteName);
      const totalKm = (p.upDistanceKm || 75) + (p.downDistanceKm || 75);
      const pf = getPairFares(p);

      return [
        idx + 1,
        `"${date}"`,
        `"${p.vehicleRegNo || ''}"`,
        p.isNightHoldMatch ? '"নাইট হোল্ড ট্রিপ"' : '"রেগুলার ট্রিপ"',
        `"আপ: ${upTime} | ডাউন: ${downTime}"`,
        `"${timeDiff}"`,
        `"${combinedRoute}"`,
        `"${p.upDistanceKm || 75} + ${p.downDistanceKm || 75} = ${totalKm} কিমি"`,
        pf.totalSeat,
        pf.totalCargo,
        pf.combinedTotal,
        `"${p.supervisor || ''}"`,
        `"${p.driver || p.upTrip?.driver || p.downTrip?.driver || '-'}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DailyReconciliation-${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Backward-compatible seat/cargo fare breakdown helper per pair
  const getPairFares = (p: any) => {
    const upCargo = Math.max(0, Number(p.upCargoCollection) || 0);
    const upTotal = Math.max(0, Number(p.upCollection) || 0);
    const upSeat =
      p.upSeatCollection !== undefined && p.upSeatCollection !== null
        ? Math.max(0, Number(p.upSeatCollection) || 0)
        : Math.max(0, upTotal - upCargo);

    const downCargo = Math.max(0, Number(p.downCargoCollection) || 0);
    const downTotal = Math.max(0, Number(p.downCollection) || 0);
    const downSeat =
      p.downSeatCollection !== undefined && p.downSeatCollection !== null
        ? Math.max(0, Number(p.downSeatCollection) || 0)
        : Math.max(0, downTotal - downCargo);

    const totalSeat = upSeat + downSeat;
    const totalCargo = upCargo + downCargo;
    const combinedTotal = totalSeat + totalCargo;
    return { upSeat, upCargo, upTotal: upSeat + upCargo, downSeat, downCargo, downTotal: downSeat + downCargo, totalSeat, totalCargo, combinedTotal };
  };

  // Grand totals & status counts
  const totalSeatCollection = pairs.reduce((sum, p) => sum + getPairFares(p).totalSeat, 0);
  const totalCargoCollection = pairs.reduce((sum, p) => sum + getPairFares(p).totalCargo, 0);
  const totalCombinedCollection = totalSeatCollection + totalCargoCollection;
  const totalUpCollection = pairs.reduce((sum, p) => sum + getPairFares(p).upTotal, 0);
  const totalDownCollection = pairs.reduce((sum, p) => sum + getPairFares(p).downTotal, 0);
  const reconciledCount = pairs.filter((p) => p.reconciliationStatus === 'reconciled').length;
  const readyCount = pairs.filter((p) => p.reconciliationStatus === 'ready').length;
  const pendingCount = pairs.filter((p) => p.reconciliationStatus === 'incomplete').length;

  const filteredPairs = pairs.filter((p) => {
    if (filterTab === 'RECONCILED') return p.reconciliationStatus === 'reconciled';
    if (filterTab === 'PENDING') return p.reconciliationStatus === 'incomplete';
    return true;
  });

  const whatsappOwnerItems = useMemo<OwnerReportSummaryItem[]>(() => {
    const vehicleById = new Map<string, Vehicle>();
    const vehicleByReg = new Map<string, Vehicle>();
    vehicles.forEach((v) => {
      vehicleById.set(v.id, v);
      const norm = normalizeRegNo(v.regNo);
      if (norm) vehicleByReg.set(norm, v);
    });

    const fuelByReg = new Map<string, { expected: number; actual: number }>();
    fuelEntries.forEach((f) => {
      const norm = normalizeRegNo(f.vehicleRegNo);
      if (!norm) return;
      const rate = Number(f.fuelRatePerLiter) || 0;
      const expected =
        f.expectedFuelCost !== undefined && f.expectedFuelCost !== null
          ? Number(f.expectedFuelCost) || 0
          : Math.round((Number(f.expectedFuelLiters) || 0) * rate);
      const actual = Number(f.totalCost) || Math.round((Number(f.actualFuelLiters) || 0) * rate);
      const cur = fuelByReg.get(norm) || { expected: 0, actual: 0 };
      cur.expected += expected;
      cur.actual += actual;
      fuelByReg.set(norm, cur);
    });

    const map = new Map<
      string,
      OwnerReportSummaryItem & { _vehiclesSet: Set<string>; _hasFuel: boolean }
    >();

    pairs.forEach((p) => {
      const v = vehicleById.get(p.vehicleId) || vehicleByReg.get(normalizeRegNo(p.vehicleRegNo));
      const ownerName =
        (v?.ownerName || p.upTrip?.vehicleOwnerName || p.downTrip?.vehicleOwnerName || 'সাধারণ').trim();
      const ownerPhone = v?.ownerPhone || '';
      const pf = getPairFares(p);
      const tripSeats = (Number(p.upTrip?.totalBookedSeats) || 0) + (Number(p.downTrip?.totalBookedSeats) || 0);
      const tripCount = (p.upTrip ? 1 : 0) + (p.downTrip ? 1 : 0);

      if (!map.has(ownerName)) {
        map.set(ownerName, {
          ownerName,
          ownerPhone,
          vehicles: [],
          tripCount: 0,
          bookedSeats: 0,
          seatFare: 0,
          cargoFare: 0,
          totalFare: 0,
          fuelExpectedCost: 0,
          fuelActualCost: 0,
          fuelCostDiff: null,
          customLines: [],
          _vehiclesSet: new Set<string>(),
          _hasFuel: false,
        });
      }

      const entry = map.get(ownerName)!;
      if (!entry.ownerPhone && ownerPhone) entry.ownerPhone = ownerPhone;
      if (p.vehicleRegNo) entry._vehiclesSet.add(p.vehicleRegNo);
      entry.tripCount += tripCount;
      entry.bookedSeats = (entry.bookedSeats || 0) + tripSeats;
      entry.seatFare = (entry.seatFare || 0) + pf.totalSeat;
      entry.cargoFare = (entry.cargoFare || 0) + pf.totalCargo;
      entry.totalFare += pf.combinedTotal;

      const routeLine = combineRouteNames(p.upRouteName, p.downRouteName);
      entry.customLines?.push(
        `${p.vehicleRegNo}: ${routeLine} | আপ: ${p.upTrip?.departureTime || '-'}, ডাউন: ${p.downTrip?.departureTime || '-'} (${formatTaka(pf.combinedTotal)})`
      );

      const fuelSum = fuelByReg.get(normalizeRegNo(p.vehicleRegNo));
      if (fuelSum && (fuelSum.actual > 0 || fuelSum.expected > 0)) {
        entry._hasFuel = true;
        entry.fuelExpectedCost = (entry.fuelExpectedCost || 0) + fuelSum.expected;
        entry.fuelActualCost = (entry.fuelActualCost || 0) + fuelSum.actual;
      }
    });

    return Array.from(map.values()).map(({ _vehiclesSet, _hasFuel, ...rest }) => ({
      ...rest,
      vehicles: Array.from(_vehiclesSet),
      fuelCostDiff: _hasFuel ? (rest.fuelExpectedCost || 0) - (rest.fuelActualCost || 0) : null,
      fuelExpectedCost: _hasFuel ? rest.fuelExpectedCost : undefined,
      fuelActualCost: _hasFuel ? rest.fuelActualCost : undefined,
    }));
  }, [pairs, vehicles, fuelEntries]);

  const handleDownloadTablePDF = async () => {
    try {
      await downloadElementAsPDF(
        'printable-reconciliation-report',
        `Trip-Reconciliation-${date}.pdf`,
        'landscape',
        'a4'
      );
    } catch (err) {
      console.error('PDF generation error:', err);
      printElementById('printable-reconciliation-report', `দৈনিক ট্রিপ রিপোর্ট — ${date}`, 'A4-landscape');
    }
  };

  const handlePrintTableOnly = () => {
    printElementById('printable-reconciliation-report', `দৈনিক ট্রিপ রিপোর্ট — ${date}`, 'A4-landscape');
  };

  const cellBorderStyle: React.CSSProperties = {
    borderRight: '1px solid #475569',
    borderBottom: '1px solid #475569',
    padding: '7px 5px',
    lineHeight: 1.6,
    verticalAlign: 'middle',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellBorderStyle,
    padding: '8px 5px',
    lineHeight: 1.5,
    fontWeight: 800,
    backgroundColor: '#e2e8f0',
    color: '#0f172a',
  };

  const renderPrintableTableNode = () => (
    <div
      id="printable-reconciliation-report"
      className="p-4 sm:p-5 overflow-y-auto flex-1 font-sans"
      style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
    >
      {/* Company Name Only Header */}
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
          style={{
            fontSize: '19px',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.35,
            margin: 0,
          }}
        >
          {user?.company?.name || 'কাউন্টার টিকেটিং'}
        </h1>
        <div
          className="recon-subtitle"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#334155',
            marginTop: '3px',
            lineHeight: 1.4,
          }}
        >
          দৈনিক ট্রিপ হিসাব সমন্বয় ডাটাবেইজ • তারিখ: {date} ({formatBengaliDate(date)})
        </div>
      </div>

      {/* All 13 Database Columns Compressed Cleanly With Zero Text/Border Overlap */}
      <div className="overflow-x-auto">
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
            <col style={{ width: '6.5%' }} />
            <col style={{ width: '7.5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '14.5%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7.5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '6.5%' }} />
            <col style={{ width: '6.5%' }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: '#e2e8f0', color: '#0f172a', textAlign: 'center', fontWeight: 800 }}>
              <th style={headerCellStyle}>ক্রমিক</th>
              <th style={headerCellStyle}>তারিখ</th>
              <th style={headerCellStyle}>গাড়ি</th>
              <th style={headerCellStyle}>ট্রিপ ধরন</th>
              <th style={headerCellStyle}>সময় (আপ/ডাউন)</th>
              <th style={headerCellStyle}>ব্যবধান</th>
              <th style={headerCellStyle}>রুট (রেজাল্ট)</th>
              <th style={headerCellStyle}>কিমি</th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>সিট ভাড়া</th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>মালের ভাড়া</th>
              <th style={{ ...headerCellStyle, textAlign: 'right' }}>মোট টাকা</th>
              <th style={headerCellStyle}>সুপারভাইজার</th>
              <th style={headerCellStyle}>ড্রাইভার</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, idx) => {
              const upTime = p.upTrip?.departureTime || '-';
              const downTime = p.downTrip?.departureTime || '-';
              const timeDiff = calculateTimeDifference(p.upTrip?.departureTime, p.downTrip?.departureTime, p.isNightHoldMatch);
              const combinedRoute = combineRouteNames(p.upRouteName, p.downRouteName);
              const upDist = p.upDistanceKm || 75;
              const downDist = p.downDistanceKm || 75;
              const totalKm = upDist + downDist;
              const pf = getPairFares(p);

              return (
                <tr
                  key={p.vehicleId}
                  style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff', color: '#0f172a' }}
                >
                  <td style={{ ...cellBorderStyle, textAlign: 'center', fontWeight: 700 }}>
                    {toBengaliDigits(idx + 1)}
                  </td>
                  <td style={{ ...cellBorderStyle, textAlign: 'center', fontWeight: 600 }}>
                    {date}
                  </td>
                  <td style={{ ...cellBorderStyle, fontWeight: 800, color: '#0f172a' }}>
                    {p.vehicleRegNo}
                  </td>
                  <td style={{ ...cellBorderStyle, textAlign: 'center', fontWeight: 700 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 6px',
                        lineHeight: 1.4,
                        borderRadius: '4px',
                        backgroundColor: p.isNightHoldMatch ? '#f3e8ff' : '#f1f5f9',
                        color: p.isNightHoldMatch ? '#581c87' : '#334155',
                      }}
                    >
                      {p.isNightHoldMatch ? 'নাইট হোল্ড' : 'রেগুলার'}
                    </span>
                  </td>
                  <td style={{ ...cellBorderStyle, fontWeight: 700 }}>
                    <div style={{ color: '#1e3a8a', marginBottom: '2px' }}>আপ: {upTime}</div>
                    <div style={{ color: '#064e3b' }}>ডা: {downTime}</div>
                  </td>
                  <td style={{ ...cellBorderStyle, textAlign: 'center', fontWeight: 700 }}>
                    {timeDiff}
                  </td>
                  <td style={{ ...cellBorderStyle, fontWeight: 700 }}>
                    {combinedRoute}
                  </td>
                  <td style={{ ...cellBorderStyle, textAlign: 'center', fontWeight: 700 }}>
                    {toBengaliDigits(upDist)}+{toBengaliDigits(downDist)}={toBengaliDigits(totalKm)}
                  </td>
                  <td style={{ ...cellBorderStyle, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTaka(pf.totalSeat)}
                  </td>
                  <td style={{ ...cellBorderStyle, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTaka(pf.totalCargo)}
                  </td>
                  <td style={{ ...cellBorderStyle, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTaka(pf.combinedTotal)}
                  </td>
                  <td style={{ ...cellBorderStyle, fontWeight: 600 }}>
                    {p.supervisor || '-'}
                  </td>
                  <td style={{ ...cellBorderStyle, fontWeight: 600 }}>
                    {p.driver || p.upTrip?.driver || p.downTrip?.driver || '-'}
                  </td>
                </tr>
              );
            })}

            {pairs.length === 0 && (
              <tr>
                <td
                  colSpan={13}
                  style={{
                    ...cellBorderStyle,
                    padding: '18px',
                    textAlign: 'center',
                    color: '#64748b',
                    fontWeight: 600,
                  }}
                >
                  এই তারিখে প্রদর্শনের জন্য কোনো ট্রিপ সমন্বয় ডাটা পাওয়া যায়নি।
                </td>
              </tr>
            )}
          </tbody>
          {pairs.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 800, color: '#0f172a' }}>
                <td colSpan={8} style={{ ...cellBorderStyle, padding: '8px 6px', textAlign: 'right', backgroundColor: '#e2e8f0' }}>
                  সর্বমোট আদায় (সিট + মাল):
                </td>
                <td style={{ ...cellBorderStyle, padding: '8px 5px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#e2e8f0' }}>
                  {formatTaka(totalSeatCollection)}
                </td>
                <td style={{ ...cellBorderStyle, padding: '8px 5px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#e2e8f0' }}>
                  {formatTaka(totalCargoCollection)}
                </td>
                <td style={{ ...cellBorderStyle, padding: '8px 5px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#e2e8f0' }}>
                  {formatTaka(totalCombinedCollection)}
                </td>
                <td colSpan={2} style={{ ...cellBorderStyle, padding: '8px 5px', textAlign: 'center', backgroundColor: '#e2e8f0' }}>
                  মোট: {toBengaliDigits(pairs.length)} টি ট্রিপ
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-600" />
            <span>ট্রিপ হিসাব সমন্বয় (আপ + ডাউন কালেকশন)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            প্রতিটি গাড়ির আপ ও ডাউন ট্রিপ ক্যাশ সংগ্রহ ম্যাচিং, আর্থিক অডিট ও ডাউনলোড
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={fetchReconciliationData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Export Buttons */}
          <button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="এক্সেল ফাইল (.csv) হিসেবে ডাউনলোড করুন"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>এক্সেল (Excel)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTablePDF}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="শুধু ডাটা টেবিল পিডিএফ ডাউনলোড করুন"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>টেবিল PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setShowWhatsAppModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="মালিকদের মোবাইলে হোয়াটসঅ্যাপে হিসাব পাঠান"
          >
            <MessageCircle className="w-4 h-4" />
            <span>হোয়াটসঅ্যাপ (মালিক)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="শুধু টেবিল প্রিন্ট / পিডিএফ প্রিভিউ দেখুন"
          >
            <Printer className="w-4 h-4" />
            <span>প্রিন্ট / প্রিভিউ</span>
          </button>
        </div>
      </div>

      {/* Alert Messages */}
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

      {/* Summary Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">মোট কম্বাইন্ড আদায় (সিট + মাল)</span>
          <div className="text-2xl font-black text-emerald-700 mt-1 tabular-nums">
            {formatTaka(totalCombinedCollection)}
          </div>
          <span className="text-[11px] text-slate-500 font-semibold block">
            সিট: {formatTaka(totalSeatCollection)} | মাল: {formatTaka(totalCargoCollection)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">সমন্বিত গাড়ি সংখ্যা</span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {toBengaliDigits(reconciledCount)} / {toBengaliDigits(pairs.length)}
          </div>
          <span className="text-[11px] text-slate-400">অনুমোদিত সমন্বয় সম্পন্ন হয়েছে</span>
        </div>

        <div className={`p-4 rounded-2xl border shadow-xs transition-colors ${
          pendingCount === 0 ? 'bg-emerald-50/70 border-emerald-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">অসমন্বিত বা অপেক্ষমান ট্রিপ</span>
            {pendingCount === 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                সব সমন্বিত
              </span>
            )}
          </div>
          <div className={`text-2xl font-black mt-1 ${pendingCount === 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
            {toBengaliDigits(pendingCount)} {pendingCount === 0 && <span className="text-xs font-bold text-emerald-600">টি (কোনো অপেক্ষমান নেই)</span>}
          </div>
          <span className="text-[11px] text-slate-400">
            {pendingCount === 0 ? 'আজকের সকল ট্রিপের সমন্বয় সম্পন্ন হয়েছে' : 'ডাউন বা আপ ট্রিপ অপেক্ষমান'}
          </span>
        </div>
      </div>

      {/* Filter Tabs and Quick Batch Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
          <button
            type="button"
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              filterTab === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            সকল ট্রিপ ({toBengaliDigits(pairs.length)})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('RECONCILED')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              filterTab === 'RECONCILED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>সমন্বিত ({toBengaliDigits(reconciledCount)})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('PENDING')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              filterTab === 'PENDING'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>অপেক্ষমান ({toBengaliDigits(pendingCount)})</span>
          </button>
        </div>

        {readyCount > 0 && (
          <button
            type="button"
            disabled={batchReconciling}
            onClick={handleBatchReconcile}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-200" />
            <span>
              {batchReconciling
                ? 'সমন্বয় হচ্ছে...'
                : `এক ক্লিকে সকল প্রস্তুত ট্রিপ সমন্বয় অনুমোদন (${toBengaliDigits(readyCount)}টি)`}
            </span>
          </button>
        )}
      </div>

      {/* Pairs Reconciliation Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">
            গাড়িভিত্তিক আপ ও ডাউন ট্রিপ পেয়ারিং তালিকা
          </h3>
          <span className="text-xs text-slate-500">
            নাইট-হোল্ড ট্রিপ স্বয়ংক্রিয়ভাবে রিটার্ন ট্রিপের সাথে সংযুক্ত হয়
          </span>
        </div>

        {filteredPairs.length === 0 ? (
          <div className="text-center py-12 px-4">
            {filterTab === 'PENDING' ? (
              <div className="max-w-md mx-auto p-6 bg-emerald-50 rounded-2xl border border-emerald-200">
                <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h4 className="font-bold text-sm text-emerald-950">কোনো ট্রিপ অপেক্ষমান নেই!</h4>
                <p className="text-xs text-emerald-700 mt-1">
                  আজকের সকল গাড়ির আপ ও ডাউন ট্রিপ সফলভাবে সমন্বয় করা হয়েছে।
                </p>
              </div>
            ) : filterTab === 'RECONCILED' ? (
              <div className="text-xs text-slate-400">এখনো কোনো ট্রিপ সমন্বয় করা হয়নি।</div>
            ) : (
              <div className="text-xs text-slate-400">এই তারিখে কোনো গাড়ির ট্রিপ রেকর্ড নেই।</div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="py-3 px-4 font-bold">গাড়ির নম্বর ও রুট</th>
                  <th className="py-3 px-4 font-bold">আপ ট্রিপ (Up Collection)</th>
                  <th className="py-3 px-4 font-bold">ডাউন ট্রিপ (Down Collection)</th>
                  <th className="py-3 px-3 font-bold text-right bg-blue-50/50">সিট ভাড়া</th>
                  <th className="py-3 px-3 font-bold text-right bg-amber-50/50">মালের ভাড়া</th>
                  <th className="py-3 px-3 font-bold text-right bg-emerald-50/70">মোট টাকা</th>
                  <th className="py-3 px-4 font-bold text-center">স্ট্যাটাস</th>
                  <th className="py-3 px-4 font-bold text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPairs.map((p) => {
                  const isReconciled = p.reconciliationStatus === 'reconciled';
                  const isReady = p.reconciliationStatus === 'ready';
                  const pf = getPairFares(p);

                  return (
                    <tr key={p.vehicleId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Bus className="w-4 h-4 text-slate-500" />
                          <span>{p.vehicleRegNo}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex flex-wrap gap-2 mt-0.5">
                          <span>সুপারভাইজার: <strong className="text-slate-700">{p.supervisor}</strong></span>
                          {(p.driver || p.upTrip?.driver || p.downTrip?.driver) && (
                            <span>| ড্রাইভার: <strong className="text-slate-700">{p.driver || p.upTrip?.driver || p.downTrip?.driver}</strong></span>
                          )}
                        </div>
                      </td>

                      {/* Up Trip */}
                      <td className="py-3 px-4">
                        {p.upTrip ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {p.upTrip.tripNo} ({p.upTrip.departureTime})
                            </div>
                            <div className="font-bold text-blue-700 text-xs tabular-nums">
                              {formatTaka(pf.upTotal)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              সিট বুকড: {toBengaliDigits(p.upTrip.totalBookedSeats || 0)}
                              {pf.upCargo > 0 && ` | সিট: ${formatTaka(pf.upSeat)} + মাল: ${formatTaka(pf.upCargo)}`}
                            </div>
                            {p.isNightHoldMatch && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[9px] rounded font-bold">
                                নাইট হোল্ড আপ
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">কোনো আপ ট্রিপ নেই</span>
                        )}
                      </td>

                      {/* Down Trip */}
                      <td className="py-3 px-4">
                        {p.downTrip ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {p.downTrip.tripNo} ({p.downTrip.departureTime})
                            </div>
                            <div className="font-bold text-emerald-700 text-xs tabular-nums">
                              {formatTaka(pf.downTotal)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              সিট বুকড: {toBengaliDigits(p.downTrip.totalBookedSeats || 0)}
                              {pf.downCargo > 0 && ` | সিট: ${formatTaka(pf.downSeat)} + মাল: ${formatTaka(pf.downCargo)}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">কোনো ডাউন ট্রিপ নেই</span>
                        )}
                      </td>

                      {/* Seat Fare */}
                      <td className="py-3 px-3 text-right font-bold text-blue-800 bg-blue-50/20 tabular-nums whitespace-nowrap">
                        {formatTaka(pf.totalSeat)}
                      </td>

                      {/* Cargo Fare */}
                      <td className="py-3 px-3 text-right font-bold text-amber-800 bg-amber-50/20 tabular-nums whitespace-nowrap">
                        {formatTaka(pf.totalCargo)}
                      </td>

                      {/* Combined Total */}
                      <td className="py-3 px-3 text-right bg-emerald-50/30 tabular-nums whitespace-nowrap">
                        <div className="text-sm font-black text-emerald-900">
                          {formatTaka(pf.combinedTotal)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          ({formatTaka(pf.upTotal)} + {formatTaka(pf.downTotal)})
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {isReconciled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>সমন্বিত (১টি পূর্ণাঙ্গ ট্রিপ)</span>
                          </span>
                        ) : isReady ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-full">
                            <Clock className="w-3 h-3 text-blue-600" />
                            <span>সমন্বয়ের জন্য প্রস্তুত</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>অসম্পূর্ণ ট্রিপ (অপেক্ষমান)</span>
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        {isReconciled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>অনুমোদিত: {p.existingReconciliation?.reconciledBy || 'এডমিন'}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={reconcilingVehicleId === p.vehicleId}
                            onClick={() => handleReconcile(p)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {reconcilingVehicleId === p.vehicleId ? 'সমন্বয় হচ্ছে...' : 'হিসাব অনুমোদন করুন'}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs text-slate-900">
                <tr>
                  <td colSpan={3} className="py-2.5 px-4 text-right">
                    সর্বমোট ({toBengaliDigits(filteredPairs.length)} টি গাড়ি):
                  </td>
                  <td className="py-2.5 px-3 text-right text-blue-900 bg-blue-50/60 tabular-nums whitespace-nowrap">
                    {formatTaka(filteredPairs.reduce((sum, p) => sum + getPairFares(p).totalSeat, 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-amber-900 bg-amber-50/60 tabular-nums whitespace-nowrap">
                    {formatTaka(filteredPairs.reduce((sum, p) => sum + getPairFares(p).totalCargo, 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-950 bg-emerald-100/70 tabular-nums whitespace-nowrap">
                    {formatTaka(filteredPairs.reduce((sum, p) => sum + getPairFares(p).combinedTotal, 0))}
                  </td>
                  <td colSpan={2} className="py-2.5 px-4 text-center text-[10px] text-slate-500">
                    সিট + মাল = মোট
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      </div>

      {/* Off-screen printable table anchor when modal is closed so direct PDF/Print exports ONLY the table */}
      {!showPrintModal && (
        <div className="hidden print:block">
          {renderPrintableTableNode()}
        </div>
      )}

      {/* PDF / Printable Daily Financial Reconciliation Report Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
            {/* Modal Header & Action Controls (hidden in print) */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm sm:text-base">দৈনিক ট্রিপ সমন্বয় ডাটা টেবিল — ল্যান্ডস্কেপ প্রিভিউ</h3>
                  <div className="text-[11px] text-slate-300">
                    {user?.company?.name || 'কাউন্টার টিকেটিং'} • তারিখ: {date}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportToExcel}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>এক্সেল ডাউনলোড</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTablePDF}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700 shadow-xs"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>টেবিল PDF ডাউনলোড</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintTableOnly}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>শুধু টেবিল প্রিন্ট (Landscape)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title="বন্ধ করুন"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {renderPrintableTableNode()}
          </div>
        </div>
      )}

      <OwnerWhatsAppModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        companyName={user?.company?.name || 'কাউন্টার টিকেটিং'}
        reportTitle="দৈনিক ট্রিপ হিসাব সমন্বয়"
        dateLabel={`${date} (${formatBengaliDate(date)})`}
        items={whatsappOwnerItems}
      />
    </div>
  );
};
