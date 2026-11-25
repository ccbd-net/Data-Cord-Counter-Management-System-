import React, { useState, useEffect } from 'react';
import type { Booking } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatTaka, toBengaliDigits, formatBengaliDateTime } from '../utils/formatters.ts';
import { api } from '../services/api.ts';
import { getBookingFareParts } from '../utils/routeSort.ts';
import { downloadElementAsPDF, openPrintWindow } from '../utils/pdfGenerator.ts';
import {
  PrinterSettingsModal,
  getStoredPrinterSettings,
  type PrinterSettings,
} from './PrinterSettingsModal.tsx';
import {
  Printer,
  X,
  CheckCircle,
  Sliders,
  Download,
  Building2,
  Phone,
  MapPin,
  RefreshCw,
} from 'lucide-react';

interface ThermalTicketModalProps {
  booking: Booking | null;
  onClose: () => void;
  onPrinted?: () => void;
}

export type PrintMode = 'BOTH' | 'PASSENGER' | 'OFFICE';

export const ThermalTicketModal: React.FC<ThermalTicketModalProps> = ({
  booking,
  onClose,
  onPrinted,
}) => {
  const { user } = useAuth();
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(getStoredPrinterSettings());
  const [printMode, setPrintMode] = useState<PrintMode>(printerSettings.defaultCopy || 'BOTH');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [hasPrinted, setHasPrinted] = useState<boolean>(false);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const s = getStoredPrinterSettings();
    setPrinterSettings(s);
    setPrintMode(s.defaultCopy || 'BOTH');
  }, []);

  if (!booking) return null;

  const companyName = user?.company?.name || 'কাউন্টার টিকেটিং সার্ভিস';
  const companyLogo = user?.company?.logoUrl;
  const companyAddress = user?.company?.address || '';
  const companyPhone = user?.company?.phone || '';

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await api.recordTicketPrint(booking.id);
      setHasPrinted(true);
      if (onPrinted) onPrinted();

      const ticketElement = document.getElementById('printable-thermal-ticket');
      if (ticketElement) {
        openPrintWindow(
          ticketElement.innerHTML,
          `টিকিট — ${booking.ticketNo}`,
          printerSettings.paperSize
        );
      } else {
        window.print();
      }
    } catch (err) {
      console.error('Print tracking failed:', err);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await downloadElementAsPDF(
        'printable-thermal-ticket',
        `Ticket-${booking.ticketNo}.pdf`,
        'portrait',
        printerSettings.paperSize === '80mm' ? [80, 210] : [58, 220]
      );
    } catch (err) {
      console.error('PDF generation error:', err);
      // Fallback
      window.print();
    }
  };

  const renderSingleReceipt = (copyType: 'যাত্রী কপি (Passenger Copy)' | 'অফিস কপি (Office Copy)') => {
    const is80 = printerSettings.paperSize === '80mm';
    const containerStyle: React.CSSProperties = {
      maxWidth: is80 ? '360px' : '290px',
      margin: '0 auto',
      backgroundColor: '#ffffff',
      color: '#000000',
      padding: '10px 8px',
      fontFamily: "'Hind Siliguri', -apple-system, sans-serif",
      fontSize: '11px',
      lineHeight: '1.35',
      border: '1.5px solid #000000',
      borderRadius: '6px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    };

    return (
      <div style={containerStyle} className="receipt-content select-none">
        {/* Brand Header / Letterhead */}
        <div style={{ textAlign: 'center', paddingBottom: '6px', borderBottom: '2px solid #000000', marginBottom: '8px' }}>
          {companyLogo && printerSettings.showLogoOnTicket && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <img
                src={companyLogo}
                alt={companyName}
                style={{ maxHeight: '42px', maxWidth: '140px', objectFit: 'contain' }}
              />
            </div>
          )}
          <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#000000' }}>
            {companyName}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', marginTop: '1px' }}>
            কাউন্টার টিকিট ও জার্নি ভাউচার
          </div>
          <div style={{ fontSize: '10px', color: '#334155', marginTop: '2px' }}>{companyAddress}</div>
          <div style={{ fontSize: '10px', color: '#0f172a', fontWeight: 700 }}>হটলাইন: {companyPhone}</div>
          <div style={{
            display: 'inline-block',
            marginTop: '4px',
            padding: '2px 8px',
            border: '1.5px solid #000000',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 800,
            backgroundColor: '#f1f5f9',
            color: '#000000'
          }}>
            *** {copyType} ***
          </div>
        </div>

        {/* Section 1: Trip & Bus Details Table */}
        <div style={{
          border: '1.5px solid #000000',
          borderRadius: '4px',
          padding: '6px 8px',
          marginBottom: '6px',
          backgroundColor: '#ffffff'
        }}>
          <table className="receipt-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', fontWeight: 700, color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>টিকিট নং:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 900, fontSize: '11.5px', fontFamily: 'monospace', color: '#000000', padding: '2px 0' }}>{booking.ticketNo}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>ট্রিপ নং:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 700, color: '#000000', padding: '2px 0' }}>{booking.tripNo || '-'}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>যাত্রা তারিখ:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 700, color: '#000000', padding: '2px 0' }}>{booking.tripDate}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', fontWeight: 700, color: '#0f172a', padding: '2px 0', whiteSpace: 'nowrap' }}>ছাড়ার সময়:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 900, fontSize: '12px', color: '#000000', padding: '2px 0' }}>{booking.tripTime}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>গাড়ির নং:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 800, color: '#000000', padding: '2px 0' }}>{booking.vehicleRegNo}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>রুট:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 700, color: '#000000', padding: '2px 0', wordBreak: 'break-word' }}>{booking.routeName}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 2: Passenger Details Table */}
        <div style={{
          border: '1.5px solid #000000',
          borderRadius: '4px',
          padding: '6px 8px',
          marginBottom: '6px',
          backgroundColor: '#ffffff'
        }}>
          <table className="receipt-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>যাত্রীর নাম:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 800, color: '#000000', padding: '2px 0' }}>{booking.passengerName}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>মোবাইল:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 700, color: '#000000', padding: '2px 0' }}>{booking.passengerPhone || 'প্রযোজ্য নয়'}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>বোর্ডিং:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 700, color: '#000000', padding: '2px 0' }}>{booking.boardingPoint}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '42%', textAlign: 'left', color: '#1e293b', padding: '2px 0', whiteSpace: 'nowrap' }}>গন্তব্য:</td>
                <td className="val" style={{ width: '58%', textAlign: 'right', fontWeight: 800, color: '#000000', padding: '2px 0' }}>{booking.destination}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 3: Seat Numbers & Financials Box (Highlighted) */}
        {(() => {
          const fareParts = getBookingFareParts(booking);
          return (
            <div style={{
              border: '2px solid #000000',
              borderRadius: '5px',
              padding: '6px 8px',
              marginBottom: '6px',
              backgroundColor: '#f8fafc',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '10px', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                {booking.seatNumbers.length > 0 ? 'আসন নম্বর সমূহ (SEATS)' : 'বুকিং ধরন'}
              </div>
              <div style={{ fontSize: booking.seatNumbers.length > 0 ? '17px' : '14px', fontWeight: 900, letterSpacing: '1px', color: '#000000', margin: '2px 0' }}>
                {booking.seatNumbers.length > 0 ? booking.seatNumbers.join(', ') : 'মালামাল বুকিং (আসনবিহীন)'}
              </div>
              <div style={{ fontSize: '10.5px', color: '#1e293b', borderBottom: '1px dotted #000000', paddingBottom: '3px', marginBottom: '4px' }}>
                {booking.seatNumbers.length > 0 ? (
                  <>মোট আসন: <strong style={{ fontWeight: 900 }}>{toBengaliDigits(booking.totalSeats)} টি</strong></>
                ) : (
                  <>শুধুমাত্র মালের ভাড়া রসিদ</>
                )}
              </div>

              <table className="receipt-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <tbody>
                  <tr>
                    <td className="lbl" style={{ width: '48%', textAlign: 'left', color: '#1e293b', padding: '2px 0', fontSize: '11px', whiteSpace: 'nowrap' }}>সিট ভাড়া:</td>
                    <td className="val" style={{ width: '52%', textAlign: 'right', fontWeight: 700, color: '#000000', padding: '2px 0', fontSize: '11px' }}>
                      {formatTaka(fareParts.seatFare)}
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl" style={{ width: '48%', textAlign: 'left', color: '#1e293b', padding: '2px 0', fontSize: '11px', whiteSpace: 'nowrap' }}>মালের ভাড়া:</td>
                    <td className="val" style={{ width: '52%', textAlign: 'right', fontWeight: 700, color: '#000000', padding: '2px 0', fontSize: '11px' }}>
                      {formatTaka(fareParts.cargoFare)}
                    </td>
                  </tr>
                  <tr style={{ borderTop: '1.5px solid #000000' }}>
                    <td className="lbl" style={{ width: '48%', textAlign: 'left', fontWeight: 900, color: '#000000', paddingTop: '4px', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                      মোট টাকা (সিট+মাল):
                    </td>
                    <td className="val" style={{ width: '52%', textAlign: 'right', fontWeight: 900, color: '#000000', paddingTop: '4px', fontSize: '13.5px' }}>
                      {formatTaka(fareParts.totalFare)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Section 4: Counter Info & Verification */}
        <div style={{
          border: '1.5px dashed #000000',
          borderRadius: '4px',
          padding: '6px 8px',
          marginBottom: '6px',
          backgroundColor: '#ffffff'
        }}>
          <table className="receipt-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              <tr>
                <td className="lbl" style={{ width: '40%', textAlign: 'left', color: '#475569', fontSize: '10px', padding: '1.5px 0', whiteSpace: 'nowrap' }}>ইস্যুকৃত কাউন্টার:</td>
                <td className="val" style={{ width: '60%', textAlign: 'right', fontWeight: 700, color: '#0f172a', fontSize: '10px', padding: '1.5px 0' }}>
                  {booking.counterName} ({booking.counterCode})
                </td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '40%', textAlign: 'left', color: '#475569', fontSize: '10px', padding: '1.5px 0', whiteSpace: 'nowrap' }}>ইস্যুকারী:</td>
                <td className="val" style={{ width: '60%', textAlign: 'right', fontWeight: 600, color: '#0f172a', fontSize: '10px', padding: '1.5px 0' }}>
                  {booking.bookedByUserName || 'কাউন্টার অফিসার'}
                </td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: '40%', textAlign: 'left', color: '#475569', fontSize: '9.5px', padding: '1.5px 0', whiteSpace: 'nowrap' }}>প্রিন্ট সময়:</td>
                <td className="val" style={{ width: '60%', textAlign: 'right', color: '#475569', fontSize: '9.5px', padding: '1.5px 0' }}>
                  {formatBengaliDateTime(new Date().toISOString())}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Barcode representation */}
          <div style={{ textAlign: 'center', marginTop: '5px', paddingTop: '4px', borderTop: '1px dotted #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2px', height: '22px', overflow: 'hidden' }}>
              {Array.from({ length: 36 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#000000',
                    height: '100%',
                    width: idx % 3 === 0 ? '2.5px' : idx % 5 === 0 ? '1.5px' : '1px'
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: '8.5px', fontFamily: 'monospace', letterSpacing: '1px', marginTop: '2px' }}>
              {booking.ticketNo}
            </div>
          </div>
        </div>

        {/* Office Copy Signature Line */}
        {copyType.includes('Office') && (
          <div style={{ marginTop: '10px', paddingTop: '16px', borderTop: '1px solid #000000', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 700 }}>
              কাউন্টার সিল ও স্বাক্ষর : ________________________
            </div>
          </div>
        )}

        {/* Terms */}
        <div style={{ textAlign: 'center', fontSize: '8.5px', color: '#475569', lineHeight: '1.3', marginTop: '4px', borderTop: '1px dotted #94a3b8', paddingTop: '3px' }}>
          * গাড়ী ছাড়ার ১৫ মিনিট পূর্বে কাউন্টারে উপস্থিত থাকুন।
          <br />* টিকিটটি যাত্রাকালে সাথে রাখুন। আপনার যাত্রা শুভ ও নিরাপদ হোক।
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
          {/* Header */}
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  থার্মাল টিকিট প্রিন্ট ও PDF প্রিভিউ
                </h3>
                <div className="text-[11px] text-slate-300 flex items-center gap-2">
                  <span>{companyName}</span>
                  <span>•</span>
                  <span className="font-bold text-emerald-400">
                    {printerSettings.paperSize} রোল
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPrinterModalOpen(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                title="প্রিন্টার নির্বাচন ও সাইজ পরিবর্তন"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>এড / সিলেক্ট প্রিন্টার</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Copy Selector Tabs */}
          <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {[
                { id: 'BOTH', label: 'উভয় কপি (যাত্রী + অফিস)' },
                { id: 'PASSENGER', label: 'যাত্রী কপি' },
                { id: 'OFFICE', label: 'অফিস কপি' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPrintMode(tab.id as PrintMode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    printMode === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              টিকিট নং: {booking.ticketNo}
            </span>
          </div>

          {/* Printable Ticket Preview Canvas */}
          <div
            id="printable-thermal-ticket"
            className="p-4 sm:p-6 overflow-y-auto bg-slate-200/60 flex-1 space-y-4"
          >
            {(printMode === 'BOTH' || printMode === 'PASSENGER') && (
              <div>{renderSingleReceipt('যাত্রী কপি (Passenger Copy)')}</div>
            )}

            {printMode === 'BOTH' && (
              <div
                className="tear-divider"
                style={{
                  textAlign: 'center',
                  borderTop: '1.5px dashed #000000',
                  margin: '12px auto',
                  maxWidth: printerSettings.paperSize === '80mm' ? '360px' : '290px',
                  paddingTop: '6px',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: '#334155',
                }}
              >
                ✂ - - - - - - - - - - - কাটুন / TEAR HERE - - - - - - - - - - - ✂
              </div>
            )}

            {(printMode === 'BOTH' || printMode === 'OFFICE') && (
              <div>{renderSingleReceipt('অফিস কপি (Office Copy)')}</div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500 text-center sm:text-left">
              {hasPrinted ? (
                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                  <CheckCircle className="w-4 h-4" /> প্রিন্ট ট্র্যাক সফল হয়েছে
                </span>
              ) : (
                <span className="text-slate-600">
                  নির্বাচিত প্রিন্টার: <strong>{printerSettings.paperSize}</strong> (
                  {printerSettings.defaultCopy === 'BOTH'
                    ? 'উভয় কপি'
                    : printerSettings.defaultCopy === 'PASSENGER'
                    ? 'যাত্রী'
                    : 'অফিস'}
                  )
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                বন্ধ করুন
              </button>

              <button
                type="button"
                onClick={handleDownloadPDF}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>বাংলা PDF ডাউনলোড</span>
              </button>

              <button
                type="button"
                disabled={isPrinting}
                onClick={handlePrint}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {isPrinting
                    ? 'প্রিন্ট হচ্ছে...'
                    : `এখনই প্রিন্ট করুন (${printerSettings.paperSize})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printer Configuration Modal */}
      <PrinterSettingsModal
        isOpen={isPrinterModalOpen}
        onClose={() => setIsPrinterModalOpen(false)}
        onSave={(newSettings) => {
          setPrinterSettings(newSettings);
          setPrintMode(newSettings.defaultCopy);
        }}
      />
    </>
  );
};
