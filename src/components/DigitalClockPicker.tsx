import React, { useState, useEffect } from 'react';
import { Clock, Check, Sparkles, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { toBengaliDigits } from '../utils/formatters.ts';

interface DigitalClockPickerProps {
  value: string; // e.g. "07:00 AM"
  onChange: (time: string) => void;
  label?: string;
  className?: string;
}

export const DigitalClockPicker: React.FC<DigitalClockPickerProps> = ({
  value,
  onChange,
  label = 'ছাড়ার সময় নির্ধারণ',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Parse value: e.g. "07:30 AM"
  const parseTime = (timeStr: string) => {
    const match = (timeStr || '07:00 AM').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      return {
        hour: parseInt(match[1], 10),
        minute: parseInt(match[2], 10),
        period: match[3].toUpperCase() as 'AM' | 'PM',
      };
    }
    return { hour: 7, minute: 0, period: 'AM' as 'AM' | 'PM' };
  };

  const parsed = parseTime(value);
  const [hour, setHour] = useState<number>(parsed.hour);
  const [minute, setMinute] = useState<number>(parsed.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.period);

  useEffect(() => {
    const p = parseTime(value);
    setHour(p.hour);
    setMinute(p.minute);
    setPeriod(p.period);
  }, [value]);

  const formatOutput = (h: number, m: number, p: 'AM' | 'PM') => {
    const formattedH = String(h).padStart(2, '0');
    const formattedM = String(m).padStart(2, '0');
    return `${formattedH}:${formattedM} ${p}`;
  };

  const updateTime = (newH: number, newM: number, newP: 'AM' | 'PM') => {
    setHour(newH);
    setMinute(newM);
    setPeriod(newP);
    onChange(formatOutput(newH, newM, newP));
  };

  const changeHour = (delta: number) => {
    let nextH = hour + delta;
    if (nextH > 12) nextH = 1;
    if (nextH < 1) nextH = 12;
    updateTime(nextH, minute, period);
  };

  const changeMinute = (delta: number) => {
    let nextM = minute + delta;
    if (nextM >= 60) nextM = 0;
    if (nextM < 0) nextM = 55;
    updateTime(hour, nextM, period);
  };

  const setExactMinute = (m: number) => {
    updateTime(hour, m, period);
  };

  const togglePeriod = (p: 'AM' | 'PM') => {
    updateTime(hour, minute, p);
  };

  const setNow = () => {
    const now = new Date();
    let h = now.getHours();
    const p: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    // Round to nearest 5 minutes
    const rawM = now.getMinutes();
    const m = Math.round(rawM / 5) * 5 % 60;
    updateTime(h, m, p);
  };

  const commonShortcuts = [
    { label: 'সকাল ০৬:০০', time: '06:00 AM' },
    { label: 'সকাল ০৬:৩০', time: '06:30 AM' },
    { label: 'সকাল ০৭:০০', time: '07:00 AM' },
    { label: 'সকাল ০৭:৩০', time: '07:30 AM' },
    { label: 'সকাল ০৮:০০', time: '08:00 AM' },
    { label: 'সকাল ০৯:৩০', time: '09:30 AM' },
    { label: 'সকাল ১১:৩০', time: '11:30 AM' },
    { label: 'দুপুর ০২:০০', time: '02:00 PM' },
    { label: 'বিকাল ০৪:০০', time: '04:00 PM' },
    { label: 'সন্ধ্যা ০৬:৩০', time: '06:30 PM' },
    { label: 'রাত ০৮:০০', time: '08:00 PM' },
    { label: 'রাত ০৯:৩০', time: '09:30 PM' },
  ];

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>অটো ডিজিটাল ঘড়ি</span>
          </span>
        </label>
      )}

      {/* Trigger Button displaying current digital clock */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl border border-slate-700 shadow-sm transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg group-hover:scale-105 transition-transform">
            <Clock className="w-4 h-4 animate-pulse" />
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
              ডিজিটাল সময়
            </div>
            <div className="text-base font-black tracking-widest font-mono text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
              {formatOutput(hour, minute, period)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {period === 'AM' ? 'সকাল/দুপুর (AM)' : 'বিকাল/রাত (PM)'}
          </span>
          <span className="text-slate-400 text-xs">▼</span>
        </div>
      </button>

      {/* Interactive Digital Clock Popover */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 mt-2 left-0 right-0 sm:right-auto sm:w-96 bg-slate-900 border-2 border-emerald-500/50 rounded-3xl p-5 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
            {/* Digital LED Display Header */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-inner flex flex-col items-center justify-center mb-4 relative overflow-hidden">
              <div className="absolute top-2 left-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[9px] uppercase tracking-widest font-mono text-slate-500 font-bold">
                  LIVE DIGITAL CLOCK
                </span>
              </div>

              {/* Huge glowing digital clock numbers */}
              <div className="flex items-center gap-2 mt-3 font-mono">
                {/* Hours */}
                <div className="flex flex-col items-center">
                  <span className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-wider">
                    {String(hour).padStart(2, '0')}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-0.5 font-bold">ঘণ্টা (HR)</span>
                </div>

                {/* Pulsing Colon */}
                <span className="text-3xl sm:text-4xl font-black text-emerald-500 animate-pulse pb-3">
                  :
                </span>

                {/* Minutes */}
                <div className="flex flex-col items-center">
                  <span className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-wider">
                    {String(minute).padStart(2, '0')}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-0.5 font-bold">মিনিট (MIN)</span>
                </div>

                {/* AM/PM Pill */}
                <div className="flex flex-col gap-1 ml-2">
                  <button
                    type="button"
                    onClick={() => togglePeriod('AM')}
                    className={`px-2.5 py-1 rounded-md text-xs font-black transition-all ${
                      period === 'AM'
                        ? 'bg-emerald-500 text-slate-950 shadow-md ring-1 ring-emerald-300'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePeriod('PM')}
                    className={`px-2.5 py-1 rounded-md text-xs font-black transition-all ${
                      period === 'PM'
                        ? 'bg-emerald-500 text-slate-950 shadow-md ring-1 ring-emerald-300'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>

            {/* Stepper Controls: Hour & Minute Up/Down */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Hour Adjusters */}
              <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 pl-1">ঘণ্টা:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => changeHour(-1)}
                    className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="১ ঘণ্টা কমান"
                  >
                    -
                  </button>
                  <span className="w-7 text-center font-mono font-bold text-sm text-emerald-400">
                    {hour}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeHour(1)}
                    className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="১ ঘণ্টা বাড়ান"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Minute Adjusters */}
              <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 pl-1">মিনিট:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => changeMinute(-5)}
                    className="px-2 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer transition-colors"
                    title="৫ মিনিট কমান"
                  >
                    -৫
                  </button>
                  <span className="w-7 text-center font-mono font-bold text-sm text-emerald-400">
                    {String(minute).padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeMinute(5)}
                    className="px-2 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer transition-colors"
                    title="৫ মিনিট বাড়ান"
                  >
                    +৫
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Minute Selection Chips */}
            <div className="mb-4">
              <div className="text-[10px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                <span>মিনিট শর্টকাট:</span>
                <button
                  type="button"
                  onClick={setNow}
                  className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>এখনকার সময়</span>
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 15, 30, 45].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExactMinute(m)}
                    className={`py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                      minute === m
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    :{String(m).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            {/* Popular Trip Schedule Shortcuts */}
            <div className="mb-4">
              <div className="text-[10px] font-semibold text-slate-400 mb-1.5">
                জনপ্রিয় ট্রিপ ছাড়ার সময়সমূহ:
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
                {commonShortcuts.map((sc) => {
                  const isCurrent = formatOutput(hour, minute, period) === sc.time;
                  return (
                    <button
                      key={sc.time}
                      type="button"
                      onClick={() => {
                        const p = parseTime(sc.time);
                        updateTime(p.hour, p.minute, p.period);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-bold text-left truncate transition-colors ${
                        isCurrent
                          ? 'bg-emerald-600 text-white font-extrabold ring-1 ring-emerald-300'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {sc.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Confirm & Close Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer transition-all"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>সময় চূড়ান্ত করুন ({formatOutput(hour, minute, period)})</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
