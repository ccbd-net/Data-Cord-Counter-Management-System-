import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Schedule, Booking, Counter } from '../types/index.ts';
import { SeatMap } from '../components/SeatMap.tsx';
import { TripAlertBanner } from '../components/TripAlertBanner.tsx';
import { ThermalTicketModal } from '../components/ThermalTicketModal.tsx';
import { useDataSync } from '../hooks/useDataSync.ts';
import { formatTaka, toBengaliDigits, getTodayDhakaDate, formatBengaliDate } from '../utils/formatters.ts';
import { groupSchedulesByRouteNumber, getBookingFareParts } from '../utils/routeSort.ts';
import {
  Armchair,
  Calendar,
  User,
  Phone,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Printer,
  RefreshCw,
  Check,
  FileSpreadsheet,
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
  const [cargoFare, setCargoFare] = useState<string>('');
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
    } catch (err) {
      console.error('Failed to load counters:', err);
    }
  };

  const directionCounters = counters.filter((c) => c.status === 'active' && c.tripDirection === direction);

  useEffect(() => {
    if (directionCounters.length > 0) {
      const match = directionCounters.find((c) => c.id === selectedCounterId);
      if (!match) {
        setSelectedCounterId(directionCounters[0].id);
      }
    }
  }, [direction, counters]);

  // Load schedules strictly for selected calendar date and direction
  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res = await api.getSchedules({ date, direction, exactDateOnly: true });
      const exactMatches = (res.schedules || []).filter(
        (s) => s.date === date && s.status !== 'cancelled'
      );
      const grouped = groupSchedulesByRouteNumber(exactMatches);
      const orderedSchedules = grouped.flatMap((g) => g.trips);

      setSchedules(orderedSchedules);
      if (orderedSchedules.length > 0) {
        const exists = orderedSchedules.some((s) => s.id === selectedScheduleId);
        if (!exists) {
          setSelectedScheduleId(orderedSchedules[0].id);
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
      setCargoFare('');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [selectedScheduleId]);

  // Real-time synchronization across pages and tabs
  useDataSync(
    useCallback(() => {
      fetchSchedules();
      if (selectedScheduleId) {
        fetchScheduleDetails(selectedScheduleId);
      }
    }, [selectedScheduleId, date, direction])
  );

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

  const parsedSeatFare =
    selectedSeats.length > 0 && manualFare.trim() !== '' && !isNaN(Number(manualFare))
      ? Math.max(0, Number(manualFare))
      : 0;
  const parsedCargoFare =
    cargoFare.trim() !== '' && !isNaN(Number(cargoFare)) ? Math.max(0, Number(cargoFare)) : 0;
  const currentTotalFare = parsedSeatFare + parsedCargoFare;

  // Handle Submit Booking with Manual Seat Fare + Optional Cargo Fare
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSchedule) {
      setErrorMsg('অনুগ্রহ করে একটি ট্রিপ শিডিউল নির্বাচন করুন।');
      return;
    }

    if (selectedSeats.length === 0 && parsedCargoFare <= 0) {
      setErrorMsg('কমপক্ষে একটি আসন নির্বাচন করুন অথবা মালের ভাড়া প্রদান করুন!');
      return;
    }

    if (
      selectedSeats.length > 0 &&
      (manualFare.trim() === '' || isNaN(Number(manualFare)) || Number(manualFare) < 0)
    ) {
      setErrorMsg('অনুগ্রহ করে নির্বাচিত সিট বুকিংয়ের জন্য সিট ভাড়ার পরিমাণ ম্যানুয়ালী যুক্ত করুন!');
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
        seatFare: selectedSeats.length > 0 ? parsedSeatFare : 0,
        cargoFare: parsedCargoFare,
        totalFare: currentTotalFare,
      });

      setSuccessMsg(
        selectedSeats.length > 0
          ? `সিট (${selectedSeats.join(', ')}) — সিট ভাড়া ${formatTaka(parsedSeatFare)}${
              parsedCargoFare > 0 ? ` + মালের ভাড়া ${formatTaka(parsedCargoFare)}` : ''
            } = মোট ${formatTaka(currentTotalFare)} সফলভাবে বুকিং সম্পন্ন হয়েছে!`
          : `মালামাল বুকিং — মালের ভাড়া ${formatTaka(parsedCargoFare)} সফলভাবে সংরক্ষণ করা হয়েছে!`
      );
      // Open thermal ticket modal immediately
      setPrintedBooking(res.booking);

      // Clear form
      setSelectedSeats([]);
      setManualFare('');
      setCargoFare('');
      setPassengerName('');
      setPassengerPhone('');

      // Refresh schedule
      await fetchScheduleDetails(currentSchedule.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'বুকিং সম্পন্ন করা সম্ভব হয়নি। সিটটি হয়তো অন্য কেউ নিয়ে নিয়েছে!');
      if (currentSchedule) {
        await fetchScheduleDetails(currentSchedule.id);
      }
    } finally {
      setBookingInProgress(false);
    }
  };

  const todayDhaka = getTodayDhakaDate();
  const routeGroups = groupSchedulesByRouteNumber(schedules);

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
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
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
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  direction === 'DOWN'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ডাউন ট্রিপ (ঢাকা ➜ মাদারীপুর)
              </button>
            </div>

            {/* Date Selector (Defaults to Today) */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent outline-none cursor-pointer"
              />
            </div>

            {date !== todayDhaka && (
              <button
                type="button"
                onClick={() => setDate(todayDhaka)}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0"
              >
                আজকের তারিখ
              </button>
            )}

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

        {/* Excel-Sheet Style Trip Schedule Table (Grouped by Route 1/2/3 & Sorted by Time) */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>
                নির্ধারিত ট্রিপ তালিকা ({formatBengaliDate(date)} · {toBengaliDigits(schedules.length)} টি ট্রিপ)
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              রুট নং (১, ২, ৩...) ও ছাড়ার সময় অনুযায়ী সাজানো · বুকিং করতে সারিতে ক্লিক করুন
            </span>
          </div>

          {schedules.length === 0 ? (
            <div className="p-5 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-200">
              নির্বাচিত তারিখ ({formatBengaliDate(date)}) এ কোনো{' '}
              {direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ'} শিডিউল পাওয়া যায়নি। শিডিউল মেকার থেকে ট্রিপ যোগ করুন।
            </div>
          ) : (
            <div className="space-y-4">
              {routeGroups.map((group) => (
                <div
                  key={`${direction}-${group.routeName}`}
                  className="border border-slate-300 rounded-xl overflow-hidden bg-white"
                >
                  {/* Route Header Strip */}
                  <div
                    className={`px-3.5 py-2 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs ${
                      direction === 'UP'
                        ? 'bg-blue-50/90 text-blue-950'
                        : 'bg-emerald-50/90 text-emerald-950'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-black text-white tabular-nums ${
                          direction === 'UP' ? 'bg-blue-700' : 'bg-emerald-700'
                        }`}
                      >
                        {toBengaliDigits(group.routeNumber)} নং রুট
                      </span>
                      <span>{group.routeName}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                      মোট {toBengaliDigits(group.trips.length)} টি ট্রিপ · সময়ানুসারে ক্রমিক
                    </span>
                  </div>

                  {/* Excel Grid Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold text-[11px]">
                          <th className="py-2 px-2.5 border-r border-slate-300 text-center w-12">ক্রম</th>
                          <th className="py-2 px-2.5 border-r border-slate-300 whitespace-nowrap">তারিখ</th>
                          <th className="py-2 px-2.5 border-r border-slate-300 whitespace-nowrap">ট্রিপ নং</th>
                          <th className="py-2 px-2.5 border-r border-slate-300 whitespace-nowrap">ছাড়ার সময়</th>
                          <th className="py-2 px-2.5 border-r border-slate-300 whitespace-nowrap">গাড়ি নম্বর</th>
                          <th className="py-2 px-2.5 border-r border-slate-300 whitespace-nowrap">সুপারভাইজার</th>
                          <th className="py-2 px-2.5 border-r border-slate-300 text-center whitespace-nowrap">খালি আসন</th>
                          <th className="py-2 px-2.5 text-center whitespace-nowrap">বুকিং সিলেক্ট</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {group.trips.map((sch) => {
                          const isSelected = sch.id === selectedScheduleId;
                          const bookedCount = sch.totalBookedSeats || 0;
                          const availableCount = sch.seatCapacity - bookedCount;

                          return (
                            <tr
                              key={sch.id}
                              onClick={() => setSelectedScheduleId(sch.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-emerald-50/90 font-semibold'
                                  : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-2 px-2.5 border-r border-slate-200 text-center font-bold text-slate-700 bg-slate-50/60 tabular-nums">
                                {toBengaliDigits(sch.serialInRoute)}
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 text-slate-700 whitespace-nowrap tabular-nums">
                                {formatBengaliDate(sch.date)}
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                                <span>{sch.tripNo}</span>
                                {sch.tripSequenceLabel && (
                                  <span className="ml-1.5 text-[10px] font-sans font-bold text-amber-700">
                                    ({sch.tripSequenceLabel})
                                  </span>
                                )}
                                {sch.isNightHold && (
                                  <span className="ml-1.5 text-[10px] font-sans font-bold text-purple-700">
                                    · নাইট হোল্ড
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                                {sch.departureTime}
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap tabular-nums">
                                {sch.vehicleRegNo}
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 text-slate-800 whitespace-nowrap">
                                {sch.supervisor || 'অনির্ধারিত'}
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 text-center whitespace-nowrap tabular-nums">
                                <span className="font-bold text-emerald-700">
                                  {toBengaliDigits(availableCount)}
                                </span>
                                <span className="text-slate-400">
                                  /{toBengaliDigits(sch.seatCapacity)}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedScheduleId(sch.id);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                                  }`}
                                >
                                  {isSelected ? 'নির্বাচিত' : 'নির্বাচন করুন'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Layout: Left Bus Seat Map, Right Booking Form */}
      {currentSchedule && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Left Column: Interactive Seat Plan */}
            <div className="md:col-span-6 xl:col-span-5 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center">
              {/* Red Alert Banner if Trip Info Changed */}
              <div className="w-full">
                <TripAlertBanner schedule={currentSchedule} />
              </div>

              <div className="w-full flex items-center justify-between mb-4 pb-2 border-b gap-2">
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
                    {currentSchedule.seatCapacity === 42 ? '৪২ সিট' : '৪৬ সিট'} | ছাড়ার সময়: {currentSchedule.departureTime}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    ভাড়া: ম্যানুয়াল
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

            {/* Right Column: Booking Form */}
            <div className="md:col-span-6 xl:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b gap-2">
                <div>
                  <h3 className="font-bold text-base text-slate-800">যাত্রী তথ্য ও বুকিং কনফার্মেশন</h3>
                  <p className="text-xs text-slate-500">আসন ও মালের ভাড়া এন্ট্রি করে বুকিং সম্পন্ন করুন</p>
                </div>

                {/* Counter Selector */}
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
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>প্রিন্ট ভিউ</span>
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleConfirmBooking} className="space-y-4">
                {/* Selected Seats Banner & Seat + Cargo Fare Inputs */}
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
                        ) : parsedCargoFare > 0 ? (
                          <span className="text-amber-700 text-xs font-bold">
                            মালামাল বুকিং (আসনবিহীন · শুধুমাত্র মালের ভাড়া)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-normal">
                            বামপাশের বাস ম্যাপ থেকে আসন ক্লিক করুন অথবা মালের ভাড়া লিখুন
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-[11px] text-slate-500 font-semibold block">
                        সিট ({formatTaka(parsedSeatFare)}) + মাল ({formatTaka(parsedCargoFare)})
                      </span>
                      <div className="text-xl font-black text-emerald-700 tabular-nums">
                        মোট: {formatTaka(currentTotalFare)}
                      </div>
                    </div>
                  </div>

                  {/* Manual Seat Fare + Manual Cargo Fare Side by Side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Seat Fare Box */}
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-200/90 shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <label className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>সিট ভাড়া (ম্যানুয়াল ৳) {selectedSeats.length > 0 ? '*' : ''}</span>
                        </label>
                      </div>

                      <div className="relative">
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
                              ? 'সিট নিলে চালু হবে'
                              : `যেমন: ${selectedSeats.length * (currentSchedule.fare || 550)}`
                          }
                          className="w-full pl-8 pr-3 py-2 bg-emerald-50/30 border border-emerald-300 rounded-xl text-sm font-bold text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none disabled:bg-slate-100 disabled:cursor-not-allowed tabular-nums"
                        />
                      </div>

                      {currentSchedule.fare > 0 && selectedSeats.length > 0 && (
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              const refFare = currentSchedule.fare * selectedSeats.length;
                              setManualFare(String(refFare));
                            }}
                            className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                            title="রেফারেন্স বেস ভাড়া স্বয়ংক্রিয়ভাবে ইনপুট বক্সে বসান"
                          >
                            রেফারেন্স: {formatTaka(currentSchedule.fare * selectedSeats.length)}
                          </button>
                          {manualFare !== '' && (
                            <span className="text-[11px] text-slate-600 tabular-nums">
                              গড়: <strong className="text-emerald-700">{formatTaka(Math.round(parsedSeatFare / selectedSeats.length))}</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Cargo / Goods Fare Box */}
                    <div className="bg-white p-3.5 rounded-xl border border-amber-300/90 shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <label className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>মালের ভাড়া (ম্যানুয়াল ৳)</span>
                        </label>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          ঐচ্ছিক
                        </span>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-amber-700 font-bold text-sm">
                          ৳
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={cargoFare}
                          onChange={(e) => setCargoFare(e.target.value)}
                          placeholder="মালের ভাড়া লিখুন (যেমন: ২০০)"
                          className="w-full pl-8 pr-3 py-2 bg-amber-50/30 border border-amber-300 rounded-xl text-sm font-bold text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none tabular-nums"
                        />
                      </div>

                      <div className="text-[11px] text-slate-500">
                        সিট বুকিংয়ের সাথে বা শুধু মালের ভাড়া যোগ করা যাবে
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      যাত্রীর / প্রেরকের নাম
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={passengerName}
                        onChange={(e) => setPassengerName(e.target.value)}
                        placeholder="যাত্রী বা মালামাল প্রেরকের নাম"
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
                  {(isMasterAdmin || isModerator) && directionCounters.length > 1 && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        বুকিং ইস্যুকারী কাউন্টার ({direction === 'UP' ? 'আপ কাউন্টারসমূহ' : 'ডাউন কাউন্টারসমূহ'})
                      </label>
                      <select
                        value={selectedCounterId}
                        onChange={(e) => setSelectedCounterId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white outline-none"
                      >
                        {directionCounters.map((cnt) => (
                          <option key={cnt.id} value={cnt.id}>
                            {cnt.name} ({cnt.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={
                    bookingInProgress ||
                    (selectedSeats.length === 0 && parsedCargoFare <= 0) ||
                    (selectedSeats.length > 0 &&
                      (manualFare.trim() === '' ||
                        isNaN(Number(manualFare)) ||
                        Number(manualFare) < 0))
                  }
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {bookingInProgress ? (
                    'ডাটাবেজে সুরক্ষিত বুকিং নিশ্চিত করা হচ্ছে...'
                  ) : selectedSeats.length === 0 && parsedCargoFare <= 0 ? (
                    <span>সিট নির্বাচন করুন অথবা মালের ভাড়া লিখুন</span>
                  ) : selectedSeats.length > 0 && manualFare.trim() === '' ? (
                    <span>সিট ভাড়ার পরিমাণ ম্যানুয়ালী যুক্ত করুন ({toBengaliDigits(selectedSeats.length)} আসন)</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        {selectedSeats.length > 0
                          ? `বুকিং কনফার্ম ও টিকিট প্রিন্ট করুন (${toBengaliDigits(selectedSeats.length)} আসন — ${formatTaka(currentTotalFare)})`
                          : `মালামাল বুকিং কনফার্ম ও রসিদ প্রিন্ট করুন (${formatTaka(currentTotalFare)})`}
                      </span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Full-width Booking Records Table Below */}
          {(() => {
            const totals = bookedSeats.reduce(
              (acc, b) => {
                const p = getBookingFareParts(b);
                acc.seat += p.seatFare;
                acc.cargo += p.cargoFare;
                acc.total += p.totalFare;
                return acc;
              },
              { seat: 0, cargo: 0, total: 0 }
            );
            return (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800">
                      এই ট্রিপের বুকিং রেকর্ড ({toBengaliDigits(bookedSeats.length)} টি টিকিট/রসিদ)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      মোট বিক্রিত আসন: <strong>{toBengaliDigits(currentSchedule.totalBookedSeats || 0)} টি</strong> ·{' '}
                      সিট ভাড়া: <strong className="text-blue-700">{formatTaka(totals.seat)}</strong> ·{' '}
                      মালের ভাড়া: <strong className="text-amber-700">{formatTaka(totals.cargo)}</strong> ·{' '}
                      সর্বমোট আদায়: <strong className="text-emerald-700">{formatTaka(totals.total)}</strong>
                    </p>
                  </div>
                </div>

                {bookedSeats.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    এখনও কোনো আসন বা মালামাল বুকিং হয়নি।
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold">
                          <th className="py-2.5 px-3">টিকিট নং</th>
                          <th className="py-2.5 px-3">কাউন্টার</th>
                          <th className="py-2.5 px-3">যাত্রী ও ফোন</th>
                          <th className="py-2.5 px-3">সিট নম্বর / ধরন</th>
                          <th className="py-2.5 px-3 text-right">সিট ভাড়া</th>
                          <th className="py-2.5 px-3 text-right">মালের ভাড়া</th>
                          <th className="py-2.5 px-3 text-right">মোট টাকা</th>
                          <th className="py-2.5 px-3 text-right">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bookedSeats.map((b) => {
                          const fp = getBookingFareParts(b);
                          return (
                            <tr key={b.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {b.ticketNo}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
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
                                {b.seatNumbers.length > 0 ? (
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
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                    মালামাল বুকিং
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                                {formatTaka(fp.seatFare)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-amber-800 tabular-nums whitespace-nowrap">
                                {formatTaka(fp.cargoFare)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-black text-emerald-700 tabular-nums whitespace-nowrap">
                                {formatTaka(fp.totalFare)}
                              </td>
                              <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setPrintedBooking(b)}
                                  className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors cursor-pointer"
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
                                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors text-[10px] font-bold cursor-pointer"
                                    title="বাতিল করুন"
                                  >
                                    বাতিল
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-900">
                          <td colSpan={4} className="py-2.5 px-3 text-right">
                            সর্বমোট আদায় হিসাব:
                          </td>
                          <td className="py-2.5 px-3 text-right text-blue-800 tabular-nums whitespace-nowrap">
                            {formatTaka(totals.seat)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-800 tabular-nums whitespace-nowrap">
                            {formatTaka(totals.cargo)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-800 tabular-nums whitespace-nowrap">
                            {formatTaka(totals.total)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
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
