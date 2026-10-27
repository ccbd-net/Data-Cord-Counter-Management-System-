import React, { useState } from 'react';
import type { Booking } from '../types/index.ts';
import { formatTaka, toBengaliDigits, formatBengaliDateTime } from '../utils/formatters.ts';
import { api } from '../services/api.ts';
import { downloadTicketPDF } from '../utils/pdfGenerator.ts';
import { Printer, X, CheckCircle, Copy, AlertTriangle, Download } from 'lucide-react';

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
  const [printMode, setPrintMode] = useState<PrintMode>('BOTH');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [hasPrinted, setHasPrinted] = useState<boolean>(false);

  if (!booking) return null;

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await api.recordTicketPrint(booking.id);
      setHasPrinted(true);
      if (onPrinted) onPrinted();
      // Invoke native browser print
      setTimeout(() => {
        window.print();
        setIsPrinting(false);
      }, 150);
    } catch (err) {
      console.error('Print tracking failed:', err);
      window.print();
      setIsPrinting(false);
    }
  };

  const renderSingleReceipt = (copyType: 'যাত্রী কপি (Passenger Copy)' | 'অফিস কপি (Office Copy)') => {
    return (
      <div className="receipt-content bg-white text-black p-3.5 font-mono text-[11px] leading-tight border border-slate-300 rounded shadow-xs max-w-[280px] mx-auto select-none">
        {/* Brand Header */}
        <div className="text-center pb-2 border-b border-black">
          <div className="text-sm font-extrabold tracking-wider">Counter Management System</div>
          <div className="text-[10px] font-semibold text-slate-700">কাউন্টার ম্যানেজমেন্ট বাস সার্ভিস</div>
          <div className="text-[9px] mt-0.5">মাদারীপুর ⇌ ঢাকা (ভায়া পদ্মা সেতু)</div>
          <div className="inline-block mt-1 px-2 py-0.5 border border-black rounded text-[9px] font-bold">
            *** {copyType} ***
          </div>
        </div>

        {/* Ticket & Trip Details */}
        <div className="py-2 border-b border-dashed border-black space-y-1">
          <div className="flex justify-between">
            <span className="font-bold">টিকিট নং:</span>
            <span className="font-extrabold">{booking.ticketNo}</span>
          </div>
          <div className="flex justify-between">
            <span>ট্রিপ নং:</span>
            <span>{booking.tripNo}</span>
          </div>
          <div className="flex justify-between">
            <span>যাত্রা তারিখ:</span>
            <span className="font-semibold">{booking.tripDate}</span>
          </div>
          <div className="flex justify-between">
            <span>সময়:</span>
            <span className="font-bold text-xs">{booking.tripTime}</span>
          </div>
          <div className="flex justify-between">
            <span>গাড়ির নং:</span>
            <span className="font-semibold">{booking.vehicleRegNo}</span>
          </div>
          <div className="flex justify-between">
            <span>রুট:</span>
            <span className="truncate max-w-[170px] text-right">{booking.routeName}</span>
          </div>
        </div>

        {/* Passenger Info */}
        <div className="py-2 border-b border-dashed border-black space-y-1">
          <div className="flex justify-between">
            <span>যাত্রীর নাম:</span>
            <span className="font-semibold">{booking.passengerName}</span>
          </div>
          <div className="flex justify-between">
            <span>মোবাইল:</span>
            <span>{booking.passengerPhone || 'প্রযোজ্য নয়'}</span>
          </div>
          <div className="flex justify-between">
            <span>বোর্ডিং:</span>
            <span>{booking.boardingPoint}</span>
          </div>
          <div className="flex justify-between">
            <span>গন্তব্য:</span>
            <span className="font-semibold">{booking.destination}</span>
          </div>
        </div>

        {/* Seat Numbers Highlight */}
        <div className="my-2 p-1.5 bg-slate-100 border border-black text-center rounded">
          <div className="text-[10px] text-slate-600">আসন নম্বর সমূহ:</div>
          <div className="text-base font-black tracking-widest text-black">
            {booking.seatNumbers.join(', ')}
          </div>
          <div className="text-[10px] text-slate-700">
            মোট আসন: <span className="font-bold">{toBengaliDigits(booking.totalSeats)} টি</span>
          </div>
        </div>

        {/* Financials */}
        <div className="py-1.5 border-b border-black space-y-1 text-xs">
          <div className="flex justify-between">
            <span>ভাড়া (প্রতি সিট):</span>
            <span>{formatTaka(booking.farePerSeat)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm pt-1 border-t border-dotted border-black">
            <span>মোট ভাড়া:</span>
            <span>{formatTaka(booking.totalFare)}</span>
          </div>
        </div>

        {/* Counter Info & Barcode Visual */}
        <div className="pt-2 text-center text-[9px] space-y-1">
          <div>
            ইস্যুকৃত কাউন্টার: <span className="font-bold">{booking.counterName} ({booking.counterCode})</span>
          </div>
          <div>অপারেটর: {booking.bookedByUserName}</div>
          <div className="text-[8px] text-slate-500">প্রিন্ট সময়: {formatBengaliDateTime(new Date().toISOString())}</div>

          {/* Pseudo Barcode Representation */}
          <div className="py-1 flex justify-center items-center gap-[2px] opacity-80 h-7 overflow-hidden">
            {Array.from({ length: 42 }).map((_, idx) => (
              <div
                key={idx}
                className={`bg-black h-full ${
                  idx % 3 === 0 ? 'w-[2.5px]' : idx % 5 === 0 ? 'w-[1.5px]' : 'w-[1px]'
                }`}
              />
            ))}
          </div>
          <div className="text-[8px] font-mono tracking-widest">{booking.ticketNo}</div>

          {/* Terms */}
          <div className="pt-1.5 border-t border-dotted border-black text-[8px] text-slate-600 text-left leading-tight">
            * যাত্রার ১৫ মিনিট পূর্বে কাউন্টারে উপস্থিত থাকুন।
            <br />* টিকিট হারালে কোনো রিফান্ড দেয়া হবে না। শুভ যাত্রা!
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      {/* Modal Container */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 print:shadow-none print:border-none print:max-w-none print:w-auto">
        {/* Modal Top Header (Hidden when printing) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm">৫৮ মিমি থার্মাল টিকিট প্রিন্ট</h3>
              <p className="text-xs text-slate-400">টিকিট নং: {booking.ticketNo}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Print Option Switcher (Hidden when printing) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 print:hidden space-y-3">
          <label className="text-xs font-semibold text-slate-700 block">প্রিন্ট অপশন নির্বাচন করুন:</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPrintMode('BOTH')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                printMode === 'BOTH'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              উভয় কপি (উভয়)
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('PASSENGER')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                printMode === 'PASSENGER'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              শুধু যাত্রী কপি
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('OFFICE')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                printMode === 'OFFICE'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              শুধু অফিস কপি
            </button>
          </div>

          {booking.printedCount > 0 && (
            <div className="flex items-center gap-1.5 p-2 bg-amber-50 text-amber-800 rounded-lg text-xs border border-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                এই টিকিটটি পূর্বে <strong>{toBengaliDigits(booking.printedCount)} বার</strong> প্রিন্ট করা হয়েছে। পুনর্মুদ্রণ করলে কোনো ডুপ্লিকেট বুকিং তৈরি হবে না।
              </span>
            </div>
          )}
        </div>

        {/* Thermal Receipt Preview Area (Visible on screen and directly printed) */}
        <div
          id="printable-thermal-ticket"
          className="p-6 max-h-[60vh] overflow-y-auto bg-slate-100 print:bg-white print:p-0 print:max-h-none print:overflow-visible"
        >
          {/* Passenger Copy */}
          {(printMode === 'BOTH' || printMode === 'PASSENGER') && (
            <div className="mb-4 print:mb-2">
              {renderSingleReceipt('যাত্রী কপি (Passenger Copy)')}
            </div>
          )}

          {/* Cutting Line if both */}
          {printMode === 'BOTH' && (
            <div className="my-4 text-center select-none text-[10px] text-slate-500 font-mono tracking-widest py-1 print:my-2">
              ✂ -----------------------------------------
            </div>
          )}

          {/* Office Copy */}
          {(printMode === 'BOTH' || printMode === 'OFFICE') && (
            <div className="mt-4 print:mt-2">
              {renderSingleReceipt('অফিস কপি (Office Copy)')}
            </div>
          )}
        </div>

        {/* Modal Footer (Hidden when printing) */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-500">
            {hasPrinted ? (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle className="w-4 h-4" /> প্রিন্ট ট্র্যাক সফল
              </span>
            ) : (
              '৫৮ মিমি থার্মাল রোলে নিখুঁত সাইজ'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              বন্ধ করুন
            </button>
            <button
              type="button"
              onClick={() => downloadTicketPDF(booking)}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>পিডিএফ (PDF)</span>
            </button>
            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all"
            >
              <Printer className="w-4 h-4" />
              {isPrinting ? 'প্রিন্ট হচ্ছে...' : 'এখনই প্রিন্ট করুন (POS 58mm)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
