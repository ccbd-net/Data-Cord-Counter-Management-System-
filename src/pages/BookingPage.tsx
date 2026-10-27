import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Schedule, Booking, Counter } from '../types/index.ts';
import { SeatMap } from '../components/SeatMap.tsx';
import { TripAlertBanner } from '../components/TripAlertBanner.tsx';
import { ThermalTicketModal } from '../components/ThermalTicketModal.tsx';
import { formatTaka, toBengaliDigits, getTodayDhakaDate, formatBengaliDate } from '../utils/formatters.ts';
import {
  Armchair,
  Bus,
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Printer,
  RefreshCw,
  Search,
  Check,
} from 'lucide-react';

export const BookingPage: React.FC = () => {
  const { user, isMasterAdmin, isModerator } = useAuth();

  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [currentSchedule, setCurrentSchedule] = useState<Schedule | null>(null);
  const [bookedSeats, setBookedSeats] = useState<Booking[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string>(user?.counterId || '');

  // Booking Form State
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [manualFare, setManualFare] = useState<string>('');
  const [passengerName, setPassengerName] = useState<string>('');
  const [passengerPhone, setPassengerPhone] = useState<string>('');
  const [boardingPoint, setBoardingPoint] = useState<string>('');
  const [destination, setDestination] = useState<string>('');

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [bookingInProgress, setBookingInProgress] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Thermal Print Modal State
  const [printedBooking, setPrintedBooking] = useState<Booking | null>(null);

  // Load active counters
  const fetchCounters = async () => {
    try {
      const res = await api.getCounters();
      setCounters(res.counters);
      if (!selectedCounterId && res.counters.length > 0) {
        setSelectedCounterId(user?.counterId || res.counters[0].id);
      }
    } catch (err) {
      console.error('Failed to load counters:', err);
    }
  };

  // Load schedules for date and direction
  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res = await api.getSchedules({ date, direction });
      setSchedules(res.schedules);
      if (res.schedules.length > 0) {
        // Auto select first schedule if current is not in list
        const exists = res.schedules.some((s) => s.id === selectedScheduleId);
        if (!exists) {
          setSelectedScheduleId(res.schedules[0].id);
        }
      } else {
        setSelectedScheduleId('');
        setCurrentSchedule(null);
        setBookedSeats([]);
      }
    } catch (err) {
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load details for selected schedule
  const fetchScheduleDetails = async (id: string) => {
    if (!id) return;
    try {
      const res = await api.getScheduleDetails(id);
      setCurrentSchedule(res.schedule);
      setBookedSeats(res.bookings);
      // Clean selected seats that might have been booked by someone else
      const bookedSet = new Set(res.bookings.flatMap((b) => b.seatNumbers));
      setSelectedSeats((prev) => prev.filter((s) => !bookedSet.has(s)));
    } catch (err) {
      console.error('Failed to load schedule details:', err);
    }
  };

  useEffect(() => {
    fetchCounters();
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [date, direction]);

  useEffect(() => {
    if (selectedScheduleId) {
      fetchScheduleDetails(selectedScheduleId);
      setSelectedSeats([]);
      setManualFare('');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [selectedScheduleId]);

  // Seat click toggle
  const handleSeatToggle = (seatId: string) => {
    setErrorMsg('');
    setSelectedSeats((prev) => {
      const next = prev.includes(seatId) ? prev.filter((s) => s !== seatId) : [...prev, seatId];
      // If user hasn't typed anything yet or wants a sensible starting suggestion
      return next;
    });
  };

  // Current counter color
  const activeCounter = counters.find((c) => c.id === selectedCounterId);
  const currentCounterColor = activeCounter?.seatColor || user?.counterColor || '#2563EB';

  // Handle Submit Booking with Manual Fare
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSchedule) {
      setErrorMsg('অনুগ্রহ করে একটি ট্রিপ শিডিউল নির্বাচন করুন।');
      return;
    }
    if (selectedSeats.length === 0) {
      setErrorMsg('কমপক্ষে একটি আসন নির্বাচন করুন!');
      return;
    }

    const parsedManualFare = Number(manualFare);
    if (manualFare.trim() === '' || isNaN(parsedManualFare) || parsedManualFare < 0) {
      setErrorMsg('অনুগ্রহ করে নির্বাচিত সিট বুকিংয়ের জন্য ভাড়ার পরিমাণ ম্যানুয়ালী যুক্ত করুন!');
      return;
    }

    setBookingInProgress(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.createBooking({
        scheduleId: currentSchedule.id,
        counterId: selectedCounterId,
        passengerName,
        passengerPhone,
        boardingPoint: boardingPoint || activeCounter?.name || '',
        destination: destination || (currentSchedule.direction === 'UP' ? 'ঢাকা' : 'মাদারীপুর'),
        seatNumbers: selectedSeats,
        manualFare: parsedManualFare,
      });

      setSuccessMsg(`সিট (${selectedSeats.join(', ')}) মোট ভাড়া ৳${parsedManualFare} হিসেবে সফলভাবে বুকিং সম্পন্ন হয়েছে!`);
      // Open thermal ticket modal immediately
      setPrintedBooking(res.booking);

      // Clear form
      setSelectedSeats([]);
      setManualFare('');
      setPassengerName('');
      setPassengerPhone('');

      // Refresh schedule
      await fetchScheduleDetails(currentSchedule.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'বুকিং সম্পন্ন করা সম্ভব হয়নি। সিটটি হয়তো অন্য কেউ নিয়ে নিয়েছে!');
      // Re-fetch to see latest collision
      if (currentSchedule) {
        await fetchScheduleDetails(currentSchedule.id);
      }
    } finally {
      setBookingInProgress(false);
    }
  };

  const currentTotalFare = manualFare !== '' && !isNaN(Number(manualFare)) ? Number(manualFare) : 0;

  return (
    <div className="space-y-6">
      {/* Top Controls: Date, Direction & Schedule Selector */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Armchair className="w-5 h-5 text-emerald-600" />
              <span>লাইভ বাস সিট বুকিং সিস্টেম</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ট্রিপ নির্বাচন করে ইন্টারঅ্যাক্টিভ বাস ম্যাপ থেকে আসন বুকিং ও তাৎক্ষণিক টিকিট প্রিন্ট করুন
            </p>
          </div>

          {/* Up / Down Tabs & Date */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Direction Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
              <button
                type="button"
                onClick={() => setDirection('UP')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  direction === 'UP'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                আপ ট্রিপ (মাদারীপুর ➜ ঢাকা)
              </button>
              <button
                type="button"
                onClick={() => setDirection('DOWN')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  direction === 'DOWN'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ডাউন ট্রিপ (ঢাকা ➜ মাদারীপুর)
              </button>
            </div>

            {/* Date Selector */}
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
              onClick={() => {
                fetchSchedules();
                if (selectedScheduleId) fetchScheduleDetails(selectedScheduleId);
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              title="রিফ্রেশ"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Trip Schedule Horizontal Carousel / Cards */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            আজকের নির্ধারিত ট্রিপ তালিকা ({toBengaliDigits(schedules.length)} টি ট্রিপ বিদ্যমান):
          </label>

          {schedules.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-200">
              নির্বাচিত তারিখে কোনো {direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ'} শিডিউল পাওয়া যায়নি। শিডিউল মেকার থেকে ট্রিপ যোগ করুন।
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {schedules.map((sch) => {
                const isSelected = sch.id === selectedScheduleId;
                const bookedCount = sch.totalBookedSeats || 0;
                const availableCount = sch.seatCapacity - bookedCount;

                return (
                  <button
                    key={sch.id}
                    type="button"
                    onClick={() => setSelectedScheduleId(sch.id)}
                    className={`p-3 rounded-2xl text-left border transition-all relative ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-md ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black text-slate-900">{sch.tripNo}</span>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                        {sch.departureTime}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span className="truncate">{sch.vehicleRegNo}</span>
                      {sch.tripSequenceLabel && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                          {sch.tripSequenceLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{sch.routeName}</div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        খালি: <strong className="text-emerald-700">{toBengaliDigits(availableCount)}</strong>/{toBengaliDigits(sch.seatCapacity)}
                      </span>
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                        ম্যানুয়াল ভাড়া
                      </span>
                    </div>

                    {sch.isNightHold && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.5 bg-purple-600 text-white text-[9px] font-bold rounded-md uppercase">
                        নাইট হোল্ড
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Layout: Left Bus Seat Map, Right Booking Form & Details */}
      {currentSchedule && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Seat Plan */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center">
            {/* Red Alert Banner if Trip Info Changed */}
            <div className="w-full">
              <TripAlertBanner schedule={currentSchedule} />
            </div>

            <div className="w-full flex items-center justify-between mb-4 pb-2 border-b">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800">{currentSchedule.vehicleRegNo}</h3>
                  {currentSchedule.tripSequenceLabel && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                      {currentSchedule.tripSequenceLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {currentSchedule.vehicleOwnerName ? `মালিক: ${currentSchedule.vehicleOwnerName} | ` : ''}
                  {currentSchedule.seatCapacity === 42 ? '৪২ সিট কনফিগারেশন' : '৪৬ সিট কনফিগারেশন'} | ছাড়ার সময়: {currentSchedule.departureTime}
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  ভাড়া: ম্যানুয়াল নির্ধারণ
                </span>
              </div>
            </div>

            <SeatMap
              seatCapacity={currentSchedule.seatCapacity}
              bookedSeats={bookedSeats}
              selectedSeats={selectedSeats}
              currentCounterColor={currentCounterColor}
              onSeatToggle={handleSeatToggle}
              counters={counters}
            />
          </div>

          {/* Right Column: Booking Form & Aggregated Summary */}
          <div className="lg:col-span-7 space-y-6">
            {/* Booking Form Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b">
                <div>
                  <h3 className="font-bold text-base text-slate-800">যাত্রী তথ্য ও বুকিং কনফার্মেশন</h3>
                  <p className="text-xs text-slate-500">আসন চূড়ান্ত করতে যাত্রীর তথ্য প্রদান করুন</p>
                </div>

                {/* Counter Selector (Disabled for normal booking_point users) */}
                <div className="text-right">
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    বুকিং কাউন্টার
                  </label>
                  {isMasterAdmin || isModerator ? (
                    <select
                      value={selectedCounterId}
                      onChange={(e) => setSelectedCounterId(e.target.value)}
                      className="text-xs font-bold p-1.5 bg-slate-50 border border-slate-300 rounded-xl"
                    >
                      {counters
                        .filter((c) => c.status === 'active')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                    </select>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-800">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: currentCounterColor }}
                      />
                      <span>{activeCounter?.name || user?.counterName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error & Success Messages */}
              {errorMsg && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{successMsg}</span>
                  </div>
                  {printedBooking && (
                    <button
                      type="button"
                      onClick={() => setPrintedBooking(printedBooking)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>প্রিন্ট ভিউ</span>
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleConfirmBooking} className="space-y-4">
                {/* Selected Seats Banner & Manual Fare Entry */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <span className="text-xs text-slate-500 font-semibold">নির্বাচিত আসন সমূহ:</span>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {selectedSeats.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {selectedSeats.map((s) => (
                              <span
                                key={s}
                                className="px-2.5 py-0.5 rounded-lg text-white text-xs font-bold shadow-xs"
                                style={{ backgroundColor: currentCounterColor }}
                              >
                                {s}
                              </span>
                            ))}
                            <span className="text-xs text-slate-500 font-bold ml-1">
                              (মোট {toBengaliDigits(selectedSeats.length)} টি আসন)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs font-normal">
                            বামপাশের বাস ম্যাপ থেকে আসন ক্লিক করুন
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-xs text-slate-500 font-semibold block">মোট প্রদেয় ভাড়া</span>
                      <div className="text-xl font-black text-emerald-700">
                        {selectedSeats.length > 0 && manualFare ? formatTaka(currentTotalFare) : '৳ ০'}
                      </div>
                    </div>
                  </div>

                  {/* Manual Fare Input Section - Counter Manager Sets Fare */}
                  <div className="bg-white p-3.5 rounded-xl border border-emerald-200/80 shadow-xs space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <label className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>ম্যানুয়াল ভাড়ার পরিমাণ যুক্ত করুন (৳) *</span>
                      </label>
                      <span className="text-[11px] text-slate-500 font-medium">
                        কোনো নির্দিষ্ট ভাড়া নেই (কাউন্টার ম্যানেজার ম্যানুয়াল ইনপুট)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-7 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-700 font-bold text-sm">
                          ৳
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={manualFare}
                          onChange={(e) => setManualFare(e.target.value)}
                          disabled={selectedSeats.length === 0}
                          placeholder={
                            selectedSeats.length === 0
                              ? 'আগে বামপাশ থেকে সিট নির্বাচন করুন'
                              : `যেমন: ${selectedSeats.length * (currentSchedule.fare || 550)} (মোট ভাড়া)`
                          }
                          className="w-full pl-8 pr-3 py-2 bg-emerald-50/30 border border-emerald-300 rounded-xl text-sm font-bold text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="sm:col-span-5 flex items-center gap-2">
                        {currentSchedule.fare > 0 && selectedSeats.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const refFare = currentSchedule.fare * selectedSeats.length;
                              setManualFare(String(refFare));
                            }}
                            className="px-2.5 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-xl text-[11px] font-bold transition-colors w-full text-center"
                            title="রেফারেন্স বেস ভাড়া স্বয়ংক্রিয়ভাবে ইনপুট বক্সে বসান"
                          >
                            রেফারেন্স: ৳{toBengaliDigits(currentSchedule.fare * selectedSeats.length)}
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedSeats.length > 0 && manualFare !== '' && (
                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                        <span>
                          আসন সংখ্যা: <strong>{toBengaliDigits(selectedSeats.length)}</strong> টি
                        </span>
                        <span>
                          প্রতি সিট গড় ভাড়া:{' '}
                          <strong className="text-emerald-700">
                            ৳{toBengaliDigits(Math.round(currentTotalFare / selectedSeats.length))}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      যাত্রীর নাম
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={passengerName}
                        onChange={(e) => setPassengerName(e.target.value)}
                        placeholder="যাত্রীর পূর্ণ নাম"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      মোবাইল নম্বর
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        value={passengerPhone}
                        onChange={(e) => setPassengerPhone(e.target.value)}
                        placeholder="০১৭xxxxxxxx"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      বোর্ডিং পয়েন্ট (উঠা)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={boardingPoint}
                        onChange={(e) => setBoardingPoint(e.target.value)}
                        placeholder={activeCounter?.name || 'কাউন্টার পয়েন্ট'}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      গন্তব্য (নামা)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder={currentSchedule.direction === 'UP' ? 'ঢাকা' : 'মাদারীপুর'}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    bookingInProgress ||
                    selectedSeats.length === 0 ||
                    manualFare.trim() === '' ||
                    isNaN(Number(manualFare)) ||
                    Number(manualFare) < 0
                  }
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {bookingInProgress ? (
                    'ডাটাবেজে সুরক্ষিত বুকিং নিশ্চিত করা হচ্ছে...'
                  ) : selectedSeats.length === 0 ? (
                    <span>প্রথমে এক বা একাধিক আসন নির্বাচন করুন</span>
                  ) : manualFare.trim() === '' ? (
                    <span>ভাড়ার পরিমাণ ম্যানুয়ালী যুক্ত করুন ({toBengaliDigits(selectedSeats.length)} আসন)</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        বুকিং কনফার্ম ও টিকিট প্রিন্ট করুন ({toBengaliDigits(selectedSeats.length)} আসন — {formatTaka(currentTotalFare)})
                      </span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Aggregated Booking Rows for this Trip */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b">
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    এই ট্রিপের বুকিং রেকর্ড ({toBengaliDigits(bookedSeats.length)} টি টিকিট)
                  </h3>
                  <p className="text-xs text-slate-500">
                    মোট বিক্রিত আসন: {toBengaliDigits(currentSchedule.totalBookedSeats || 0)} টি | আদায়: {formatTaka(currentSchedule.totalCollection || 0)}
                  </p>
                </div>
              </div>

              {bookedSeats.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  এখনও কোনো আসন বুকিং হয়নি।
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b">
                        <th className="py-2.5 px-3">টিকিট নং</th>
                        <th className="py-2.5 px-3">কাউন্টার</th>
                        <th className="py-2.5 px-3">যাত্রী ও ফোন</th>
                        <th className="py-2.5 px-3">সিট নম্বর</th>
                        <th className="py-2.5 px-3">মোট ভাড়া</th>
                        <th className="py-2.5 px-3 text-right">অ্যাকশন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bookedSeats.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {b.ticketNo}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: b.counterColor }}
                              />
                              <span className="font-semibold text-slate-800">{b.counterName}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-800">{b.passengerName}</div>
                            <div className="text-[10px] text-slate-400">{b.passengerPhone || 'নেই'}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {b.seatNumbers.map((s) => (
                                <span
                                  key={s}
                                  className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white"
                                  style={{ backgroundColor: b.counterColor }}
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {formatTaka(b.totalFare)}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1">
                            <button
                              type="button"
                              onClick={() => setPrintedBooking(b)}
                              className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
                              title="থার্মাল টিকিট প্রিন্ট করুন"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {(isMasterAdmin || isModerator || b.counterId === user?.counterId) && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`আপনি কি নিশ্চিত যে টিকিট নং ${b.ticketNo} বাতিল করতে চান?`)) {
                                    try {
                                      await api.cancelBooking(b.id);
                                      await fetchScheduleDetails(currentSchedule.id);
                                    } catch (err: any) {
                                      alert(err.message);
                                    }
                                  }
                                }}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors text-[10px] font-bold"
                                title="বাতিল করুন"
                              >
                                বাতিল
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Thermal Ticket Print Modal */}
      {printedBooking && (
        <ThermalTicketModal
          booking={printedBooking}
          onClose={() => setPrintedBooking(null)}
          onPrinted={() => {
            if (currentSchedule) fetchScheduleDetails(currentSchedule.id);
          }}
        />
      )}
    </div>
  );
};
