import React from 'react';
import type { Booking, Counter, SeatCapacity } from '../types/index.ts';
import { toBengaliDigits } from '../utils/formatters.ts';

interface SeatMapProps {
  seatCapacity: SeatCapacity;
  bookedSeats: Booking[];
  selectedSeats: string[];
  currentCounterColor?: string;
  onSeatToggle: (seatId: string) => void;
  counters: Counter[];
  readOnly?: boolean;
}

export const SeatMap: React.FC<SeatMapProps> = ({
  seatCapacity,
  bookedSeats,
  selectedSeats,
  currentCounterColor = '#2563EB',
  onSeatToggle,
  counters,
  readOnly = false,
}) => {
  // Map seat id -> booking info
  const seatBookingMap = React.useMemo(() => {
    const map = new Map<string, { booking: Booking; color: string; counterName: string }>();
    for (const b of bookedSeats) {
      if (b.status === 'booked') {
        const counter = counters.find((c) => c.id === b.counterId);
        const color = counter?.seatColor || b.counterColor || '#64748B';
        const counterName = counter?.name || b.counterName || 'কাউন্টার';
        for (const s of b.seatNumbers) {
          map.set(s, { booking: b, color, counterName });
        }
      }
    }
    return map;
  }, [bookedSeats, counters]);

  // Determine standard rows and rear row based on capacity
  const standardRowLetters =
    seatCapacity === 42
      ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
      : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']; // Note: 10 rows for 46 seats

  const rearRowLetter = seatCapacity === 42 ? 'J' : 'K';
  const rearRowSeats = [`${rearRowLetter}1`, `${rearRowLetter}2`, `${rearRowLetter}3`, `${rearRowLetter}4`, `${rearRowLetter}5`];

  const renderSeat = (seatId: string, label?: string) => {
    const isBookedInfo = seatBookingMap.get(seatId);
    const isBooked = Boolean(isBookedInfo);
    const isSelected = selectedSeats.includes(seatId);

    let bgColor = 'bg-white hover:bg-emerald-50 text-slate-700 border-slate-300 shadow-sm';
    let borderColor = 'border-slate-300';
    let customStyle: React.CSSProperties = {};

    if (isBooked && isBookedInfo) {
      bgColor = 'text-white font-semibold cursor-not-allowed shadow-md';
      borderColor = 'border-transparent';
      customStyle = { backgroundColor: isBookedInfo.color };
    } else if (isSelected) {
      bgColor = 'text-white font-bold ring-2 ring-emerald-500 shadow-md transform scale-105';
      borderColor = 'border-emerald-600';
      customStyle = { backgroundColor: currentCounterColor };
    }

    const tooltipText = isBooked && isBookedInfo
      ? `সিট: ${seatId} | কাউন্টার: ${isBookedInfo.counterName} | যাত্রী: ${isBookedInfo.booking.passengerName} (${isBookedInfo.booking.passengerPhone || 'ফোন নেই'}) | টিকিট: ${isBookedInfo.booking.ticketNo}`
      : `সিট: ${seatId} (বুকিং করতে ক্লিক করুন)`;

    return (
      <button
        key={seatId}
        type="button"
        title={tooltipText}
        disabled={isBooked || readOnly}
        onClick={() => !readOnly && !isBooked && onSeatToggle(seatId)}
        style={customStyle}
        className={`relative flex flex-col items-center justify-center w-11 h-12 rounded-lg border text-xs transition-all duration-150 ${bgColor} ${borderColor} ${
          isBooked ? 'opacity-90' : 'cursor-pointer hover:border-emerald-400'
        }`}
      >
        <span className="text-[11px] font-bold tracking-tight">{label || seatId}</span>
        {/* Seat cushion visual outline */}
        <div className={`w-7 h-1 mt-0.5 rounded-full ${isBooked || isSelected ? 'bg-white/40' : 'bg-slate-200'}`} />
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center">
      {/* Bus Container */}
      <div className="w-full max-w-[340px] bg-slate-100 rounded-3xl p-5 border-2 border-slate-300 shadow-inner relative">
        {/* Front Cabin: Driver on Right, EX-1 on Left directly in front of A1 */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-slate-300 mb-3 px-1">
          {/* Left: EX-1 directly aligned in front of A1 seat */}
          <div className="flex items-center gap-2">
            <div>
              <div className="text-[9px] text-slate-500 font-bold mb-0.5 text-center">A1 এর সামনে</div>
              {renderSeat('EX-1', 'EX-1')}
            </div>
          </div>

          {/* Central Aisle label */}
          <div className="w-6 text-center text-[10px] text-blue-700 font-bold bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
            সামনে
          </div>

          {/* Right: Driver Indicator */}
          <div className="flex flex-col items-center justify-center w-24 h-12 bg-slate-800 text-white rounded-xl shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span>চালক</span>
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v18M3 12h18" />
              </svg>
            </div>
            <span className="text-[9px] text-slate-300">Driver Cabin</span>
          </div>
        </div>

        {/* Standard Rows (2 Left - Aisle - 2 Right) */}
        <div className="space-y-2.5">
          {standardRowLetters.map((row) => (
            <div key={row} className="flex items-center justify-between">
              {/* Left Side: 2 Seats */}
              <div className="flex items-center gap-2">
                {renderSeat(`${row}1`)}
                {renderSeat(`${row}2`)}
              </div>

              {/* Central Aisle */}
              <div className="w-6 text-center text-[10px] text-slate-400 font-mono select-none">
                {row}
              </div>

              {/* Right Side: 2 Seats */}
              <div className="flex items-center gap-2">
                {renderSeat(`${row}3`)}
                {renderSeat(`${row}4`)}
              </div>
            </div>
          ))}
        </div>

        {/* Rear Row: 5 Seats */}
        <div className="mt-4 pt-3 border-t border-slate-300">
          <div className="text-[10px] text-center text-slate-400 mb-1 font-medium">পেছনের শেষ সারি ({rearRowLetter})</div>
          <div className="flex items-center justify-between gap-1">
            {rearRowSeats.map((seatId) => renderSeat(seatId))}
          </div>
        </div>
      </div>

      {/* Seat Status Summary & Color Legend */}
      <div className="w-full max-w-md mt-5 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 border-b pb-1.5 flex items-center justify-between">
          <span>সিট স্ট্যাটাস ও কাউন্টার কালার লিজেন্ড</span>
          <span className="text-[11px] text-slate-500 font-normal">
            বুকড: {toBengaliDigits(seatBookingMap.size)} / {toBengaliDigits(seatCapacity)}
          </span>
        </h4>

        {/* State Badges */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-slate-300 bg-white shadow-xs"></div>
            <span className="text-slate-600">খালি আসন</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded shadow-xs"
              style={{ backgroundColor: currentCounterColor }}
            ></div>
            <span className="text-slate-600 font-medium">আপনার নির্বাচিত সিট</span>
          </div>
        </div>

        {/* Active Counters Legend */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500">সক্রিয় কাউন্টার রঙ:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {counters
              .filter((c) => c.status === 'active')
              .map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs p-1 rounded-md hover:bg-slate-50">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-1 ring-black/10"
                    style={{ backgroundColor: c.seatColor }}
                  />
                  <span className="truncate text-slate-700 font-medium">{c.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({c.code})</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
