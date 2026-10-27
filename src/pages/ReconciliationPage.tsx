import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Reconciliation, Schedule } from '../types/index.ts';
import { formatTaka, toBengaliDigits, getTodayDhakaDate, formatBengaliDateTime, formatBengaliDate } from '../utils/formatters.ts';
import {
  Scale,
  Calendar,
  CheckCircle,
  AlertCircle,
  Bus,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  Check,
  Download,
  FileSpreadsheet,
  Printer,
  FileText,
  X,
} from 'lucide-react';

export const ReconciliationPage: React.FC = () => {
  const { user, isMasterAdmin, isModerator } = useAuth();
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [loading, setLoading] = useState<boolean>(true);
  const [pairs, setPairs] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [reconcilingVehicleId, setReconcilingVehicleId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  const fetchReconciliationData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.getReconciliationCandidates(date);
      setPairs(res.pairs);
      setReconciliations(res.existingReconciliations || []);
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
    if (!isMasterAdmin && !isModerator) {
      alert('আপনার ট্রিপ সমন্বয় করার অনুমতি নেই!');
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

      setSuccessMsg(`গাড়ি "${pair.vehicleRegNo}" এর আপ ও ডাউন ট্রিপের আর্থিক সমন্বয় সফল হয়েছে!`);
      await fetchReconciliationData();
    } catch (err: any) {
      setErrorMsg(err.message || 'সমন্বয় ব্যর্থ হয়েছে।');
    } finally {
      setReconcilingVehicleId(null);
    }
  };

  // Export as downloadable Excel (CSV with UTF-8 BOM)
  const exportToExcel = () => {
    if (pairs.length === 0) {
      alert('এক্সপোর্ট করার জন্য কোনো ট্রিপ তথ্য পাওয়া যায়নি!');
      return;
    }

    const headers = [
      'ক্রমিক',
      'গাড়ির নম্বর',
      'রুট',
      'সুপারভাইজার',
      'আপ ট্রিপ নং',
      'আপ ছাড়ার সময়',
      'আপ বুকড সিট',
      'আপ আদায় (৳)',
      'ডাউন ট্রিপ নং',
      'ডাউন ছাড়ার সময়',
      'ডাউন বুকড সিট',
      'ডাউন আদায় (৳)',
      'মোট কম্বাইন্ড কালেকশন (৳)',
      'সমন্বয় স্ট্যাটাস',
      'অনুমোদনকারী',
    ];

    const rows = pairs.map((p, idx) => {
      const isReconciled = p.reconciliationStatus === 'reconciled';
      const statusText = isReconciled ? 'সমন্বিত (Reconciled)' : p.reconciliationStatus === 'ready' ? 'প্রস্তুত' : 'অপেক্ষমান';
      return [
        idx + 1,
        `"${p.vehicleRegNo || ''}"`,
        `"${p.routeName || ''}"`,
        `"${p.supervisor || ''}"`,
        `"${p.upTrip?.tripNo || 'নেই'}"`,
        `"${p.upTrip?.departureTime || '-'}"`,
        p.upTrip?.totalBookedSeats || 0,
        p.upCollection || 0,
        `"${p.downTrip?.tripNo || 'নেই'}"`,
        `"${p.downTrip?.departureTime || '-'}"`,
        p.downTrip?.totalBookedSeats || 0,
        p.downCollection || 0,
        p.combinedCollection || 0,
        `"${statusText}"`,
        `"${p.existingReconciliation?.reconciledBy || '-'}"`,
      ].join(',');
    });

    // Summary row
    const totalUp = pairs.reduce((sum, p) => sum + (p.upCollection || 0), 0);
    const totalDown = pairs.reduce((sum, p) => sum + (p.downCollection || 0), 0);
    const totalAll = pairs.reduce((sum, p) => sum + (p.combinedCollection || 0), 0);

    const summaryRow = [
      'সর্বমোট',
      `"${pairs.length} টি গাড়ি"`,
      '""',
      '""',
      '""',
      '""',
      '""',
      totalUp,
      '""',
      '""',
      '""',
      totalDown,
      totalAll,
      '""',
      '""',
    ].join(',');

    const csvContent =
      '\uFEFF' +
      [
        `"Counter Management System — দৈনিক ট্রিপ হিসাব সমন্বয় ও আর্থিক অডিট রিপোর্ট"`,
        `"অপারেশনাল তারিখ: ${date} | এক্সপোর্ট সময়: ${new Date().toLocaleString()}"`,
        headers.join(','),
        ...rows,
        summaryRow,
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Trip-Reconciliation-Financial-Report-${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Grand totals
  const totalCombinedCollection = pairs.reduce((sum, p) => sum + p.combinedCollection, 0);
  const totalUpCollection = pairs.reduce((sum, p) => sum + (p.upCollection || 0), 0);
  const totalDownCollection = pairs.reduce((sum, p) => sum + (p.downCollection || 0), 0);
  const reconciledCount = pairs.filter((p) => p.reconciliationStatus === 'reconciled').length;

  return (
    <div className="space-y-6">
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
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="পিডিএফ / প্রিন্ট প্রিভিউ দেখুন"
          >
            <Printer className="w-4 h-4" />
            <span>পিডিএফ / প্রিন্ট</span>
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
          <span className="text-xs font-semibold text-slate-500">মোট কম্বাইন্ড আদায় (Up + Down)</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {formatTaka(totalCombinedCollection)}
          </div>
          <span className="text-[11px] text-slate-400">ফর্মুলা: আপ কালেকশন + ডাউন কালেকশন</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">সমন্বিত গাড়ি সংখ্যা</span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {toBengaliDigits(reconciledCount)} / {toBengaliDigits(pairs.length)}
          </div>
          <span className="text-[11px] text-slate-400">অনুমোদিত সমন্বয় সম্পন্ন হয়েছে</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">অসমন্বিত বা অপেক্ষমান ট্রিপ</span>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {toBengaliDigits(pairs.length - reconciledCount)}
          </div>
          <span className="text-[11px] text-slate-400">ডাউন বা আপ ট্রিপ অপেক্ষমান</span>
        </div>
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

        {pairs.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            এই তারিখে কোনো গাড়ির ট্রিপ রেকর্ড নেই।
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="py-3 px-4 font-bold">গাড়ির নম্বর ও রুট</th>
                  <th className="py-3 px-4 font-bold">আপ ট্রিপ (Up Collection)</th>
                  <th className="py-3 px-4 font-bold">ডাউন ট্রিপ (Down Collection)</th>
                  <th className="py-3 px-4 font-bold">মোট সমন্বয় আদায় (Up + Down)</th>
                  <th className="py-3 px-4 font-bold text-center">স্ট্যাটাস</th>
                  <th className="py-3 px-4 font-bold text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pairs.map((p) => {
                  const isReconciled = p.reconciliationStatus === 'reconciled';
                  const isReady = p.reconciliationStatus === 'ready';

                  return (
                    <tr key={p.vehicleId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Bus className="w-4 h-4 text-slate-500" />
                          <span>{p.vehicleRegNo}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{p.routeName}</div>
                        <div className="text-[10px] text-slate-400">সুপারভাইজার: {p.supervisor}</div>
                      </td>

                      {/* Up Trip */}
                      <td className="py-3 px-4">
                        {p.upTrip ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {p.upTrip.tripNo} ({p.upTrip.departureTime})
                            </div>
                            <div className="font-bold text-blue-700 text-xs">
                              {formatTaka(p.upCollection)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              সিট বুকড: {toBengaliDigits(p.upTrip.totalBookedSeats || 0)}
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
                            <div className="font-bold text-emerald-700 text-xs">
                              {formatTaka(p.downCollection)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              সিট বুকড: {toBengaliDigits(p.downTrip.totalBookedSeats || 0)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">কোনো ডাউন ট্রিপ নেই</span>
                        )}
                      </td>

                      {/* Combined Collection */}
                      <td className="py-3 px-4">
                        <div className="text-sm font-black text-slate-900">
                          {formatTaka(p.combinedCollection)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          ({formatTaka(p.upCollection)} + {formatTaka(p.downCollection)})
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {isReconciled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            <span>সমন্বিত (Reconciled)</span>
                          </span>
                        ) : isReady ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-full">
                            <Clock className="w-3 h-3" />
                            <span>সমন্বয়ের জন্য প্রস্তুত</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full">
                            <AlertCircle className="w-3 h-3" />
                            <span>অসম্পূর্ণ ট্রিপ</span>
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        {isReconciled ? (
                          <div className="text-[10px] text-slate-400">
                            অনুমোদন করেছেন: {p.existingReconciliation?.reconciledBy}
                          </div>
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
            </table>
          </div>
        )}
      </div>

      {/* PDF / Printable Daily Financial Reconciliation Report Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header & Controls (hidden in print) */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">দৈনিক ট্রিপ আর্থিক রিপোর্ট — প্রিন্ট ও PDF প্রিভিউ</h3>
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
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>প্রিন্ট / PDF সংরক্ষণ</span>
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

            {/* Printable Document Body */}
            <div
              id="printable-reconciliation-report"
              className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white text-slate-900 font-sans"
            >
              {/* Document Header */}
              <div className="border-b-2 border-slate-800 pb-4 mb-4 text-center">
                <h1 className="text-xl font-black text-slate-900 tracking-wide uppercase">
                  Counter Management System
                </h1>
                <p className="text-xs text-slate-600 font-semibold mt-0.5">
                  কাউন্টার বুকিং ও ট্রিপ ইনফরমেশন সিস্টেম
                </p>
                <div className="inline-block mt-2 px-3 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-800">
                  দৈনিক ট্রিপ হিসাব সমন্বয় ও আর্থিক অডিট রিপোর্ট
                </div>
                <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 mt-3 pt-2 border-t border-slate-200">
                  <span>
                    অপারেশনাল তারিখ: <strong className="text-slate-800">{date}</strong> ({formatBengaliDate(date)})
                  </span>
                  <span>
                    রিপোর্ট তৈরির সময়: <strong className="text-slate-800">{formatBengaliDateTime(new Date().toISOString())}</strong>
                  </span>
                  <span>
                    প্রস্তুতকারক: <strong className="text-slate-800">{user?.name} ({user?.role})</strong>
                  </span>
                </div>
              </div>

              {/* Financial KPI Summary Cards */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl text-center">
                  <div className="text-[11px] text-slate-500 font-semibold">আপ ট্রিপ মোট কালেকশন</div>
                  <div className="text-lg font-black text-blue-700 mt-0.5">
                    {formatTaka(totalUpCollection)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl text-center">
                  <div className="text-[11px] text-slate-500 font-semibold">ডাউন ট্রিপ মোট কালেকশন</div>
                  <div className="text-lg font-black text-emerald-700 mt-0.5">
                    {formatTaka(totalDownCollection)}
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-center">
                  <div className="text-[11px] text-emerald-800 font-semibold">সর্বমোট কম্বাইন্ড আদায়</div>
                  <div className="text-lg font-black text-emerald-900 mt-0.5">
                    {formatTaka(totalCombinedCollection)}
                  </div>
                </div>
              </div>

              {/* Table Breakdown */}
              <table className="w-full text-left text-[11px] border-collapse border border-slate-300 mb-6">
                <thead>
                  <tr className="bg-slate-100 text-slate-800">
                    <th className="border border-slate-300 p-2 font-bold text-center w-8">ক্র.</th>
                    <th className="border border-slate-300 p-2 font-bold">গাড়ির নম্বর ও রুট</th>
                    <th className="border border-slate-300 p-2 font-bold">সুপারভাইজার</th>
                    <th className="border border-slate-300 p-2 font-bold">আপ ট্রিপ (সময়)</th>
                    <th className="border border-slate-300 p-2 font-bold text-right">আপ আদায় (৳)</th>
                    <th className="border border-slate-300 p-2 font-bold">ডাউন ট্রিপ (সময়)</th>
                    <th className="border border-slate-300 p-2 font-bold text-right">ডাউন আদায় (৳)</th>
                    <th className="border border-slate-300 p-2 font-bold text-right">মোট আদায় (৳)</th>
                    <th className="border border-slate-300 p-2 font-bold text-center">স্ট্যাটাস</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p, idx) => (
                    <tr key={p.vehicleId} className="even:bg-slate-50/50">
                      <td className="border border-slate-300 p-2 text-center font-mono">{idx + 1}</td>
                      <td className="border border-slate-300 p-2 font-semibold">
                        {p.vehicleRegNo}
                        <div className="text-[9.5px] text-slate-500 font-normal">{p.routeName}</div>
                      </td>
                      <td className="border border-slate-300 p-2">{p.supervisor}</td>
                      <td className="border border-slate-300 p-2">
                        {p.upTrip ? `${p.upTrip.tripNo} (${p.upTrip.departureTime})` : '-'}
                        {p.isNightHoldMatch && <span className="block text-[9px] text-purple-700 font-bold">(নাইট হোল্ড)</span>}
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-blue-800">
                        {formatTaka(p.upCollection)}
                      </td>
                      <td className="border border-slate-300 p-2">
                        {p.downTrip ? `${p.downTrip.tripNo} (${p.downTrip.departureTime})` : '-'}
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-emerald-800">
                        {formatTaka(p.downCollection)}
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-black text-slate-900 bg-slate-50">
                        {formatTaka(p.combinedCollection)}
                      </td>
                      <td className="border border-slate-300 p-2 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            p.reconciliationStatus === 'reconciled'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.reconciliationStatus === 'ready'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.reconciliationStatus === 'reconciled'
                            ? 'সমন্বিত'
                            : p.reconciliationStatus === 'ready'
                            ? 'প্রস্তুত'
                            : 'অপেক্ষমান'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Grand Total Row */}
                  <tr className="bg-slate-200 font-black text-slate-900">
                    <td colSpan={4} className="border border-slate-300 p-2 text-right">
                      সর্বমোট ({toBengaliDigits(pairs.length)} টি গাড়ি):
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono">
                      {formatTaka(totalUpCollection)}
                    </td>
                    <td className="border border-slate-300 p-2 text-right">
                      -
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono">
                      {formatTaka(totalDownCollection)}
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono text-emerald-900">
                      {formatTaka(totalCombinedCollection)}
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-[10px]">
                      {toBengaliDigits(reconciledCount)}টি সমন্বিত
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Sign-off Section */}
              <div className="grid grid-cols-3 gap-6 pt-12 mt-6 border-t border-slate-300 text-center text-xs">
                <div>
                  <div className="border-t border-dotted border-slate-600 pt-1.5 font-bold text-slate-800">
                    কাউন্টার সুপারভাইজার / ইনচার্জ
                  </div>
                  <span className="text-[10px] text-slate-500">স্বাক্ষর ও সিল</span>
                </div>
                <div>
                  <div className="border-t border-dotted border-slate-600 pt-1.5 font-bold text-slate-800">
                    হিসাবরক্ষণ কর্মকর্তা
                  </div>
                  <span className="text-[10px] text-slate-500">স্বাক্ষর ও তারিখ</span>
                </div>
                <div>
                  <div className="border-t border-dotted border-slate-600 pt-1.5 font-bold text-slate-800">
                    অডিট ও প্রশাসন অনুমোদন
                  </div>
                  <span className="text-[10px] text-slate-500">অনুমোদিত স্বাক্ষর</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
