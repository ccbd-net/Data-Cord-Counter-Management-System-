import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Vehicle, RouteItem, Schedule, Driver } from '../types/index.ts';
import { useDataSync } from '../hooks/useDataSync.ts';
import { getTodayDhakaDate, toBengaliDigits } from '../utils/formatters.ts';
import { sortRoutesByNumber } from '../utils/routeSort.ts';
import { DigitalClockPicker } from '../components/DigitalClockPicker.tsx';
import {
  CalendarPlus,
  Bus,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle,
  User,
  Moon,
  MapPin,
} from 'lucide-react';

export const ScheduleMakerPage: React.FC<{ onScheduleCreated?: () => void }> = ({
  onScheduleCreated,
}) => {
  const { user } = useAuth();

  // Requested fields:
  // ১. ট্রিপ ধরন (আপ ট্রিপ / ডাউন ট্রিপ)
  // ২. তারিখ (Date)
  // ৩. নাইট হোল্ড চেকবক্স (Night Hold)
  // ৪. সময় (Departure Time)
  // ৫. গাড়ি নাম্বার (Vehicle Number)
  // ৬. রুট (Route - direction-specific)
  // ৭. সুপারভাইজার (Supervisor - name directory)
  // ৮. ড্রাইভার (Driver - name directory)
  const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [isNightHold, setIsNightHold] = useState<boolean>(false);
  const [departureTime, setDepartureTime] = useState<string>('07:00 AM');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [routeId, setRouteId] = useState<string>('');
  const [supervisor, setSupervisor] = useState<string>('');
  const [driver, setDriver] = useState<string>('');

  // Lists
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<{ id: string; name: string }[]>([]);
  const [driversList, setDriversList] = useState<Driver[]>([]);
  const [existingDateSchedules, setExistingDateSchedules] = useState<Schedule[]>([]);

  // State
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [showConfirmDoubleTrip, setShowConfirmDoubleTrip] = useState<boolean>(false);

  useEffect(() => {
    const loadPrerequisites = async () => {
      try {
        const [vRes, sRes, dRes, rRes] = await Promise.all([
          api.getVehicles(),
          api.getSupervisors(),
          api.getDrivers(),
          api.getRoutes(),
        ]);
        const activeVehicles = vRes.vehicles.filter((v) => v.status === 'active');
        setVehicles(activeVehicles);
        if (activeVehicles.length > 0) {
          setVehicleId(activeVehicles[0].id);
        }

        const activeSupervisors = sRes.supervisors || [];
        setSupervisorsList(activeSupervisors);
        if (activeSupervisors.length > 0) {
          setSupervisor(activeSupervisors[0].name);
        }

        const activeDrivers = dRes.drivers || [];
        setDriversList(activeDrivers);
        if (activeDrivers.length > 0) {
          setDriver(activeDrivers[0].name);
        }

        const activeRoutes = rRes.routes || [];
        setRoutes(activeRoutes);
      } catch (err) {
        console.error('Failed to load prerequisites:', err);
      }
    };
    loadPrerequisites();
  }, []);

  // Direction-specific routes sorted by route number (1, 2, 3...)
  const availableRoutes = sortRoutesByNumber(
    routes.filter((r) => r.status === 'active' && r.direction === direction)
  );

  useEffect(() => {
    if (availableRoutes.length > 0) {
      setRouteId(availableRoutes[0].id);
    } else {
      setRouteId('');
    }
  }, [direction, routes]);

  // Fetch existing schedules for selected date
  const loadDaySchedules = useCallback(async () => {
    try {
      const res = await api.getSchedules({ date });
      setExistingDateSchedules(res.schedules);
    } catch (err) {
      console.error('Failed to load date schedules:', err);
    }
  }, [date]);

  useEffect(() => {
    loadDaySchedules();
  }, [loadDaySchedules]);

  // Real-time synchronization
  useDataSync(loadDaySchedules);

  // Calculate this vehicle's UP trip count for selected date (২য়/৩য় ট্রিপ শুধুমাত্র আপ ট্রিপে প্রযোজ্য)
  const vehicleUpTripsToday = existingDateSchedules.filter(
    (s) => s.vehicleId === vehicleId && s.direction === 'UP' && s.status !== 'cancelled'
  );
  const nextTripSeqNumber = direction === 'UP' ? vehicleUpTripsToday.length + 1 : 1;
  const nextTripSeqLabel =
    direction === 'UP' && nextTripSeqNumber > 1
      ? nextTripSeqNumber === 2
        ? '২য় ট্রিপ'
        : nextTripSeqNumber === 3
        ? '৩য় ট্রিপ'
        : nextTripSeqNumber === 4
        ? '৪র্থ ট্রিপ'
        : `${toBengaliDigits(nextTripSeqNumber)}তম ট্রিপ`
      : undefined;

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  // Compute next day for night hold
  const calculateNextDay = (baseDate: string): string => {
    try {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const executeCreate = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setShowConfirmDoubleTrip(false);

    try {
      const res = await api.createSchedule({
        date,
        departureTime,
        vehicleId,
        direction,
        routeId: routeId || undefined,
        supervisor,
        driver: driver || undefined,
        isNightHold,
      });

      const tripLabel = res.schedule.tripSequenceLabel ? ` (${res.schedule.tripSequenceLabel})` : '';
      setSuccessMsg(
        `অভিনন্দন! ${direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ'} (${res.schedule.tripNo}) শিডিউল সফলভাবে তৈরি হয়েছে। গাড়ি: ${res.schedule.vehicleRegNo}${tripLabel}, রুট: ${res.schedule.routeName}, সময়: ${res.schedule.departureTime}`
      );
      if (onScheduleCreated) onScheduleCreated();
    } catch (err: any) {
      setErrorMsg(err.message || 'শিডিউল তৈরিতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !departureTime || !vehicleId || !supervisor || !direction) {
      setErrorMsg('অনুগ্রহ করে তারিখ, সময়, গাড়ী নম্বর, দিক ও সুপারভাইজার নির্বাচন করুন।');
      return;
    }

    // If creating an UP trip and vehicle already has an UP trip today, show confirmation dialog first
    if (direction === 'UP' && vehicleUpTripsToday.length > 0) {
      setShowConfirmDoubleTrip(true);
      return;
    }

    executeCreate();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold shadow-xs">
            <CalendarPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">
              শিডিউল মেকার — নতুন ট্রিপ সংযোজন
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              তারিখ, সময়, গাড়ী নম্বর, রুট, সুপারভাইজার ও ড্রাইভার দিয়ে ট্রিপ শুরু করুন।
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-900 rounded-2xl text-xs font-semibold border border-emerald-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold border border-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleCreate} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        {/* 1. Trip Direction (আপ ট্রিপ / ডাউন ট্রিপ) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            ১. ট্রিপ টাইপ (আপ ট্রিপ / ডাউন ট্রিপ) *
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDirection('UP')}
              className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                direction === 'UP'
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md ring-2 ring-blue-500/30'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="font-black text-sm">১. আপ ট্রিপ (UP TRIP)</div>
              <div className={`text-[11px] mt-0.5 ${direction === 'UP' ? 'text-blue-100' : 'text-slate-500'}`}>
                মাদারীপুর / প্রান্তিক পয়েন্ট ➔ ঢাকা অভিমুখী
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDirection('DOWN')}
              className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                direction === 'DOWN'
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-md ring-2 ring-emerald-500/30'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="font-black text-sm">২. ডাউন ট্রিপ (DOWN TRIP)</div>
              <div className={`text-[11px] mt-0.5 ${direction === 'DOWN' ? 'text-emerald-100' : 'text-slate-500'}`}>
                ঢাকা ➔ মাদারীপুর অভিমুখী (ফিরতি ট্রিপ)
              </div>
            </button>
          </div>
        </div>

        {/* 2. Date & Night Hold */}
        <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>২. ট্রিপের তারিখ *</span>
              </label>
              <input
                type="date"
                value={date ?? ''}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>

            {/* Night Hold Checkbox */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Moon className="w-4 h-4 text-indigo-600" />
                <span>নাইট হোল্ড (রাত্রিযাপন)</span>
              </label>
              <label className="flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-300 rounded-xl cursor-pointer hover:bg-indigo-50/40 transition-colors">
                <input
                  type="checkbox"
                  checked={isNightHold}
                  onChange={(e) => setIsNightHold(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  নাইট হোল্ড ট্রিপ হিসেবে চিহ্নিত করুন
                </span>
              </label>
            </div>
          </div>

          {isNightHold && (
            <div className="p-2.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-xl text-xs flex items-start gap-2">
              <Moon className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5" />
              <div>
                <strong>নাইট হোল্ড সক্রিয়:</strong> এই গাড়িটি রাতে গন্তব্যে অবস্থান করবে। এর ফিরতি ডাউন ট্রিপ পরবর্তী দিন (<strong>{calculateNextDay(date)}</strong>) কাউন্ট হবে এবং ট্রিপ সমন্বয়ে <strong>{calculateNextDay(date)}</strong> তারিখের রিপোর্টে ২টি ট্রিপ মিলে ১টি পূর্ণাঙ্গ ট্রিপ হিসেবে প্রদর্শিত হবে।
              </div>
            </div>
          )}
        </div>

        {/* 3. Departure Time Picker */}
        <div>
          <DigitalClockPicker
            value={departureTime || '07:00 AM'}
            onChange={setDepartureTime}
            label="৩. টার্মিনাল থেকে ছাড়ার সময় (ঘড়ি নির্বাচন) *"
          />
        </div>

        {/* 4. Vehicle Selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Bus className="w-4 h-4 text-blue-600" />
              <span>৪. গাড়ী নাম্বার (Vehicle Number) *</span>
            </label>
            {direction === 'UP' && vehicleUpTripsToday.length > 0 && nextTripSeqLabel && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md border border-amber-200">
                আজকের {nextTripSeqLabel}
              </span>
            )}
          </div>
          <select
            value={vehicleId ?? ''}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            required
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                গাড়ি: {v.regNo} ({toBengaliDigits(v.seatCapacity)} আসন)
              </option>
            ))}
          </select>

          {direction === 'UP' && vehicleUpTripsToday.length > 0 && nextTripSeqLabel && (
            <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                এই গাড়িটির ({selectedVehicle?.regNo}) {date} তারিখে ইতিমধ্যে {toBengaliDigits(vehicleUpTripsToday.length)}টি আপ ট্রিপ নির্ধারিত আছে। নতুন ট্রিপ যুক্ত করলে এটি গাড়িটির <strong>{nextTripSeqLabel}</strong> হিসেবে যুক্ত হবে।
              </span>
            </div>
          )}
        </div>

        {/* 5. Route Selection (Filtered strictly by UP or DOWN) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>৫. রুট নির্বাচন ({direction === 'UP' ? 'আপ রুট' : 'ডাউন রুট'}) *</span>
          </label>
          {availableRoutes.length > 0 ? (
            <select
              value={routeId ?? ''}
              onChange={(e) => setRouteId(e.target.value)}
              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            >
              {availableRoutes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.baseFare ? `— ৳${r.baseFare}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs">
              এই ট্রিপ টাইপের ({direction === 'UP' ? 'আপ' : 'ডাউন'}) জন্য কোনো সক্রিয় রুট পাওয়া যায়নি। রুট ব্যবস্থাপনা পেজ থেকে রুট তৈরি করতে পারেন।
            </div>
          )}
        </div>

        {/* 6 & 7. Supervisor & Driver (Scrollable dropdowns from name directory) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Supervisor */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-4 h-4 text-purple-600" />
              <span>৬. সুপারভাইজার নির্বাচন (তালিকা থেকে) *</span>
            </label>
            {supervisorsList.length > 0 ? (
              <select
                value={supervisor ?? ''}
                onChange={(e) => setSupervisor(e.target.value)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none max-h-48 overflow-y-auto"
                required
              >
                <option value="">-- সুপারভাইজার নির্বাচন করুন --</option>
                {supervisorsList.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={supervisor ?? ''}
                onChange={(e) => setSupervisor(e.target.value)}
                placeholder="সুপারভাইজারের নাম লিখুন"
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            )}
          </div>

          {/* Driver */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-600" />
              <span>৭. ড্রাইভার নির্বাচন (তালিকা থেকে)</span>
            </label>
            {driversList.length > 0 ? (
              <select
                value={driver ?? ''}
                onChange={(e) => setDriver(e.target.value)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none max-h-48 overflow-y-auto"
              >
                <option value="">-- ড্রাইভার নির্বাচন করুন (ঐচ্ছিক) --</option>
                {driversList.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={driver ?? ''}
                onChange={(e) => setDriver(e.target.value)}
                placeholder="ড্রাইভারের নাম লিখুন (ঐচ্ছিক)"
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>{loading ? 'শিডিউল তৈরি হচ্ছে...' : 'নতুন ট্রিপ শিডিউল সংরক্ষণ করুন'}</span>
          </button>
        </div>
      </form>

      {/* Confirmation Modal for Vehicle Multi-Trip on same day */}
      {showConfirmDoubleTrip && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">
                {nextTripSeqLabel} তৈরির সতর্কতা ও নিশ্চিতকরণ
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                গাড়ি নম্বর <strong className="text-slate-900">{selectedVehicle?.regNo}</strong> এর আজকের দিনে ({date}) ইতিমধ্যে <strong className="text-blue-700">{toBengaliDigits(vehicleUpTripsToday.length)}টি আপ ট্রিপ</strong> বিদ্যমান রয়েছে।
              </p>
              <div className="mt-2 p-2 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs font-semibold">
                আপনি কি নিশ্চিতভাবে এই গাড়ির জন্য <strong>&ldquo;{nextTripSeqLabel}&rdquo;</strong> তৈরি করতে চান?
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDoubleTrip(false)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                বাতিল করুন
              </button>
              <button
                type="button"
                onClick={executeCreate}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                হ্যাঁ, {nextTripSeqLabel} নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
