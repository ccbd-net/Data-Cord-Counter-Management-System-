import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Vehicle, RouteItem, Schedule } from '../types/index.ts';
import { getTodayDhakaDate, toBengaliDigits } from '../utils/formatters.ts';
import { DigitalClockPicker } from '../components/DigitalClockPicker.tsx';
import {
  CalendarPlus,
  Bus,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  User,
  Sparkles,
} from 'lucide-react';

export const ScheduleMakerPage: React.FC<{ onScheduleCreated?: () => void }> = ({
  onScheduleCreated,
}) => {
  const { user } = useAuth();

  // Exactly the 5 requested fields:
  // ১. তারিখ (Date)
  // ২. সময় (Time)
  // ৩. গাড়ী নাম্বার (Vehicle Number)
  // ৪. আপ ট্রিপ / ডাউন ট্রিপ (Direction)
  // ৫. সুপারভাইজার (Supervisor)
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [departureTime, setDepartureTime] = useState<string>('07:00 AM');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
  const [supervisor, setSupervisor] = useState<string>('');

  // Lists
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<{ id: string; name: string }[]>([]);
  const [existingDateSchedules, setExistingDateSchedules] = useState<Schedule[]>([]);

  // State
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    const loadPrerequisites = async () => {
      try {
        const [vRes, sRes] = await Promise.all([
          api.getVehicles(),
          api.getSupervisors(),
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
      } catch (err) {
        console.error('Failed to load vehicles or supervisors:', err);
      }
    };
    loadPrerequisites();
  }, []);

  // Fetch existing schedules for selected date
  useEffect(() => {
    const loadDaySchedules = async () => {
      try {
        const res = await api.getSchedules({ date });
        setExistingDateSchedules(res.schedules);
      } catch (err) {
        console.error('Failed to load date schedules:', err);
      }
    };
    loadDaySchedules();
  }, [date]);

  // Calculate this vehicle's trip count for selected date
  const vehicleTripsToday = existingDateSchedules.filter(
    (s) => s.vehicleId === vehicleId && s.status !== 'cancelled'
  );
  const nextTripSeqNumber = vehicleTripsToday.length + 1;
  const nextTripSeqLabel =
    nextTripSeqNumber === 1
      ? '১ম ট্রিপ'
      : nextTripSeqNumber === 2
      ? '২য় ট্রিপ'
      : nextTripSeqNumber === 3
      ? '৩য় ট্রিপ'
      : nextTripSeqNumber === 4
      ? '৪র্থ ট্রিপ'
      : `${toBengaliDigits(nextTripSeqNumber)}তম ট্রিপ`;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !departureTime || !vehicleId || !supervisor || !direction) {
      setErrorMsg('অনুগ্রহ করে তারিখ, সময়, গাড়ী নম্বর, আপ/ডাউন দিক ও সুপারভাইজার নির্বাচন করুন।');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.createSchedule({
        date,
        departureTime,
        vehicleId,
        direction,
        supervisor,
      });

      setSuccessMsg(
        `অভিনন্দন! ${direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ'} (${res.schedule.tripNo}) শিডিউল সফলভাবে তৈরি হয়েছে। গাড়ি: ${res.schedule.vehicleRegNo} (${res.schedule.tripSequenceLabel || nextTripSeqLabel}), সময়: ${res.schedule.departureTime}`
      );
      if (onScheduleCreated) onScheduleCreated();
    } catch (err: any) {
      setErrorMsg(err.message || 'শিডিউল তৈরিতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
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
              তারিখ, সময়, গাড়ী নাম্বার, আপ/ডাউন ট্রিপ এবং সুপারভাইজার দিয়ে নতুন ট্রিপ শুরু করুন।
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
              <div className="font-black text-sm">আপ ট্রিপ (UP TRIP)</div>
              <div className={`text-[11px] mt-0.5 ${direction === 'UP' ? 'text-blue-100' : 'text-slate-500'}`}>
                কাউন্টার ➔ ঢাকা অভিমুখী
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
              <div className="font-black text-sm">ডাউন ট্রিপ (DOWN TRIP)</div>
              <div className={`text-[11px] mt-0.5 ${direction === 'DOWN' ? 'text-emerald-100' : 'text-slate-500'}`}>
                ঢাকা ➔ কাউন্টার অভিমুখী (ফিরতি ট্রিপ)
              </div>
            </button>
          </div>
        </div>

        {/* 2 & 3. Date & Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>২. ট্রিপের তারিখ *</span>
            </label>
            <input
              type="date"
              value={date ?? ''}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </div>

          <div>
            <DigitalClockPicker
              value={departureTime || '07:00 AM'}
              onChange={setDepartureTime}
              label="৩. টার্মিনাল থেকে ছাড়ার সময় (ঘড়ি নির্বাচন) *"
            />
          </div>
        </div>

        {/* 4. Vehicle Selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Bus className="w-4 h-4 text-blue-600" />
              <span>৪. গাড়ী নাম্বার (Vehicle Number) *</span>
            </label>
            {vehicleTripsToday.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md border border-indigo-200">
                {nextTripSeqLabel} হিসেবে কাউন্ট হবে
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
                গাড়ি: {v.regNo} ({toBengaliDigits(v.seatCapacity)} আসন) — মালিক: {v.ownerName || 'সাধারণ'}
              </option>
            ))}
          </select>
          {vehicleTripsToday.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-1.5 font-medium">
              ℹ️ এই গাড়িটির {date} তারিখে ইতিমধ্যে {toBengaliDigits(vehicleTripsToday.length)}টি ট্রিপ রয়েছে। এটি গাড়িটির <strong>{nextTripSeqLabel}</strong> হিসেবে যুক্ত হবে।
            </p>
          )}
        </div>

        {/* 5. Supervisor Selection (Only Name) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <User className="w-4 h-4 text-purple-600" />
            <span>৫. সুপারভাইজার নির্বাচন (তালিকা থেকে) *</span>
          </label>
          {supervisorsList.length > 0 ? (
            <select
              value={supervisor ?? ''}
              onChange={(e) => setSupervisor(e.target.value)}
              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
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
    </div>
  );
};
