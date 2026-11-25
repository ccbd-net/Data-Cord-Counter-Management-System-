import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Schedule, Vehicle, RouteItem } from '../types/index.ts';
import {
  formatTaka,
  toBengaliDigits,
  getTodayDhakaDate,
  formatBengaliDate,
} from '../utils/formatters.ts';
import {
  Database,
  Calendar,
  Clock,
  Bus,
  User,
  Search,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  MapPin,
  CheckCircle2,
  Moon,
  Info,
  Route as RouteIcon,
  ShieldCheck,
  TrendingUp,
  Award,
} from 'lucide-react';

export interface DatabaseRow {
  id: string;
  autoSerial: number;
  dateDisplay: string;
  operationalDate: string; // The date when the trip is counted
  isNightHold: boolean;
  vehicleRegNo: string;
  vehicleOwnerName?: string;
  upTime: string;
  upTripNo?: string;
  downTime: string;
  downTripNo?: string;
  timeDiffDisplay: string;
  timeDiffMinutes: number;
  routeMerged: string;
  distanceKmDisplay: string;
  totalDistanceKm: number;
  upSeatsAndFare: string;
  upBookedSeats: number;
  upSeatFare: number;
  upCargoFare: number;
  upFare: number;
  downSeatsAndFare: string;
  downBookedSeats: number;
  downSeatFare: number;
  downCargoFare: number;
  downFare: number;
  totalSeatsAndFare: string;
  combinedSeats: number;
  combinedSeatFare: number;
  combinedCargoFare: number;
  combinedFare: number;
  supervisorDisplay: string;
  driverDisplay: string;
  isFullTrip: boolean; // True when UP + DOWN paired and completed
  status: string;
}

// Convert "07:30 AM" or "04:00 PM" into minutes from 00:00
function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

// Calculate time difference between UP time and DOWN time
function calculateTimeDifference(upTime: string, downTime: string, isNightHold: boolean): { display: string; minutes: number } {
  if (!upTime || !downTime || downTime.includes('অপেক্ষমাণ') || downTime.includes('আগামীকাল')) {
    return { display: 'নির্ধারিত হয়নি', minutes: 0 };
  }

  const upMin = timeToMinutes(upTime);
  let downMin = timeToMinutes(downTime);

  let diffMinutes = 0;
  if (isNightHold) {
    // Night hold: Down trip is next day
    diffMinutes = (1440 + downMin) - upMin;
  } else {
    // Same day trip
    if (downMin >= upMin) {
      diffMinutes = downMin - upMin;
    } else {
      // Overnight or return later
      diffMinutes = (1440 + downMin) - upMin;
    }
  }

  if (diffMinutes < 0) diffMinutes = 0;

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  const display = `${toBengaliDigits(hours)} ঘণ্টা ${mins > 0 ? `${toBengaliDigits(mins)} মিনিট` : '০০ মিনিট'}`;
  return { display, minutes: diffMinutes };
}

// Clean up parenthesis details like (ভায়া পদ্মা সেতু)
function cleanRouteName(str: string): string {
  if (!str) return '';
  return str.replace(/\([^)]*\)/g, '').trim();
}

// Intelligent Route Merging according to user instructions:
// (মাদারীপুর - গুলিস্থান + গুলিস্থান - মাদারীপুর = মাদারীপুর - গুলিস্থান - মাদারীপুর ১টি পুর্নাঙ্গ ট্রিপ)
// (কালকিনি - কদমতলী + গুলিস্থান - মাদারীপুর = কালকিনি - কদমতলী - গুলিস্থান - মাদারীপুর ১টি পুর্নাঙ্গ ট্রিপ)
function mergeRoutes(upRouteName: string, downRouteName: string): string {
  if (!upRouteName && !downRouteName) return 'রুট সমন্বয় অপেক্ষমাণ';
  if (!upRouteName) return `${downRouteName} (ডাউন ট্রিপ)`;
  if (!downRouteName) return `${upRouteName} (আপ ট্রিপ - ফিরতি অপেক্ষমাণ)`;

  const upClean = cleanRouteName(upRouteName);
  const downClean = cleanRouteName(downRouteName);

  const splitStops = (str: string) => {
    return str
      .split(/[-➜→]/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const upStops = splitStops(upClean);
  const downStops = splitStops(downClean);

  if (upStops.length === 0 && downStops.length === 0) return 'মাদারীপুর - ঢাকা - মাদারীপুর (১টি পূর্ণাঙ্গ ট্রিপ)';
  if (upStops.length === 0) return downStops.join(' - ');
  if (downStops.length === 0) return upStops.join(' - ');

  const upLast = upStops[upStops.length - 1];
  const downFirst = downStops[0];

  let consolidated = '';
  // If the last stop of UP is the same as first stop of DOWN (e.g. গুলিস্থান == গুলিস্থান)
  if (upLast.toLowerCase() === downFirst.toLowerCase()) {
    const merged = [...upStops, ...downStops.slice(1)];
    consolidated = merged.join(' - ');
  } else {
    // If different (e.g. কদমতলী and গুলিস্থান) -> কালকিনি - কদমতলী - গুলিস্থান - মাদারীপুর
    const merged = [...upStops, ...downStops];
    consolidated = merged.join(' - ');
  }

  return `${upClean} + ${downClean} = ${consolidated} (১টি পূর্ণাঙ্গ ট্রিপ)`;
}

// Calculate yesterday's date
function getYesterdayDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Calculate tomorrow's date
function getTomorrowDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// Helper to determine route distance in KM
function getRouteDistance(routes: RouteItem[], routeId?: string, routeName?: string): number {
  if (routeId) {
    const found = routes.find((r) => r.id === routeId);
    if (found?.distanceKm && found.distanceKm > 0) return found.distanceKm;
  }
  if (routeName) {
    const found = routes.find((r) => r.name.toLowerCase() === routeName.toLowerCase());
    if (found?.distanceKm && found.distanceKm > 0) return found.distanceKm;
    const name = routeName.toLowerCase();
    if (name.includes('কালকিনি') || name.includes('সাহেবরামপুর')) return 125;
    if (name.includes('মাদারীপুর') && (name.includes('ঢাকা') || name.includes('গুলিস্তান') || name.includes('সায়দাবাদ') || name.includes('কদমতলী'))) return 110;
    if (name.includes('বরিশাল')) return 180;
  }
  return 110; // Default realistic distance in KM
}

function getScheduleFareBreakdown(s?: Schedule): { seat: number; cargo: number; total: number } {
  if (!s) return { seat: 0, cargo: 0, total: 0 };
  const cargo = Math.max(0, Number(s.totalCargoCollection) || 0);
  const total = Math.max(0, Number(s.totalCollection) || 0);
  const seat =
    s.totalSeatCollection !== undefined && s.totalSeatCollection !== null
      ? Math.max(0, Number(s.totalSeatCollection) || 0)
      : Math.max(0, total - cargo);
  return { seat, cargo, total: seat + cargo };
}

export const DatabasePage: React.FC = () => {
  const { isMasterAdmin } = useAuth();
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [vehicleFilter, setVehicleFilter] = useState<string>('ALL');
  const [tripTypeFilter, setTripTypeFilter] = useState<'ALL' | 'FULL_TRIPS' | 'NIGHT_HOLD' | 'PENDING'>('ALL');

  // AI Insights State
  const [aiReport, setAiReport] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);

  // Load schedules, vehicles, and routes
  const fetchData = async () => {
    setLoading(true);
    try {
      const [schRes, vehRes, routeRes] = await Promise.all([
        api.getSchedules({ date }),
        api.getVehicles(),
        api.getRoutes(),
      ]);
      setSchedules(schRes.schedules || []);
      setVehicles(vehRes.vehicles || []);
      setRoutes(routeRes.routes || []);
    } catch (err) {
      console.error('Failed to load database records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [date]);

  // Construct Data Table rows implementing the exact Night Hold logic:
  // - If an UP trip (e.g. 1-11-26) has isNightHold: true, its round trip completes on return day (2-11-26).
  // - Therefore, on 2-11-26, it is counted as a completed full round trip!
  // - On 1-11-26, it is marked as awaiting return next day and does NOT count as a completed full trip.
  // - Exactly 13 specified columns:
  //   তারিখ - গাড়ি নাম্বার - নাইট হোল্ড - আপ ট্রিপ সময় - ডাউন ট্রিপ সময় - সময় ব্যবধান (আপ সময় - ডাউন সময়) -
  //   রুট (আপ ট্রিপ রুট + ডাউন ট্রিপ রুট) - মোট দুরত্ব (আপ রুট কিমি + ডাউন ট্রিপ কিমি) -
  //   আপ ট্রিপ সিট বুকিং সংখ্যা + মোট ভাড়া - ডাউন ট্রিপ সিট বুকিং সংখ্যা + মোট ভাড়া -
  //   মোট সিট বুকিং ও মোট ভাড়ার টাকা - সুপারভাইজার - ড্রাইভার
  const tableRows: DatabaseRow[] = useMemo(() => {
    const rows: DatabaseRow[] = [];
    const yesterday = getYesterdayDate(date);
    const tomorrow = getTomorrowDate(date);

    // Group schedules by vehicle
    const vehicleGroups = new Map<string, {
      yesterdayNightHoldUp: Schedule[];
      todayUpRegular: Schedule[];
      todayUpNightHold: Schedule[];
      todayDown: Schedule[];
    }>();

    schedules.forEach((sch) => {
      const reg = sch.vehicleRegNo;
      if (!vehicleGroups.has(reg)) {
        vehicleGroups.set(reg, {
          yesterdayNightHoldUp: [],
          todayUpRegular: [],
          todayUpNightHold: [],
          todayDown: [],
        });
      }
      const group = vehicleGroups.get(reg)!;

      if (sch.direction === 'UP') {
        if (sch.isNightHold) {
          if (sch.date === yesterday || sch.date < date) {
            // Yesterday's night-hold UP trip returning on this operational date
            group.yesterdayNightHoldUp.push(sch);
          } else {
            // Initiated today, returns tomorrow
            group.todayUpNightHold.push(sch);
          }
        } else {
          group.todayUpRegular.push(sch);
        }
      } else {
        // DOWN trips for this date
        if (sch.date === date) {
          group.todayDown.push(sch);
        }
      }
    });

    let autoSl = 1;

    vehicleGroups.forEach((group, vehReg) => {
      // 1. Process yesterday's Night Hold UP trips that return today
      // Rule: Tripped counted on today (return day)
      group.yesterdayNightHoldUp.forEach((upTrip) => {
        const downTrip = group.todayDown.shift();
        const isNightHold = true;
        const isFullTrip = Boolean(downTrip);

        const dateDisplay = downTrip
          ? `${formatBengaliDate(yesterday)} (আপ) + ${formatBengaliDate(date)} (ডাউন)`
          : `${formatBengaliDate(yesterday)} (আপ) [আজ ${formatBengaliDate(date)} ডাউন অপেক্ষমাণ]`;

        const upTime = `${upTrip.departureTime} ${upTrip.tripSequenceLabel ? `(${upTrip.tripSequenceLabel})` : ''}`;
        const downTime = downTrip ? `${downTrip.departureTime}` : 'ডাউন ট্রিপ অপেক্ষমাণ';

        const { display: timeDiffDisplay, minutes: timeDiffMinutes } =
          downTrip
            ? calculateTimeDifference(upTrip.departureTime, downTrip.departureTime, isNightHold)
            : { display: 'নির্ধারিত হয়নি', minutes: 0 };

        const upRoute = upTrip.routeName || '';
        const downRoute = downTrip?.routeName || '';
        const routeMerged = mergeRoutes(upRoute, downRoute);

        // Distance in KM
        const upKm = getRouteDistance(routes, upTrip.routeId, upTrip.routeName);
        const downKm = downTrip ? getRouteDistance(routes, downTrip.routeId, downTrip.routeName) : 0;
        const totalDistanceKm = upKm + downKm;
        const distanceKmDisplay = downTrip
          ? `${toBengaliDigits(upKm)} কিমি + ${toBengaliDigits(downKm)} কিমি = ${toBengaliDigits(totalDistanceKm)} কিমি`
          : `${toBengaliDigits(upKm)} কিমি`;

        // Seats & Fares (Seat + Cargo = Total)
        const upBookedSeats = upTrip.totalBookedSeats || 0;
        const upFares = getScheduleFareBreakdown(upTrip);
        const downBookedSeats = downTrip?.totalBookedSeats || 0;
        const downFares = getScheduleFareBreakdown(downTrip);
        const combinedSeats = upBookedSeats + downBookedSeats;
        const combinedSeatFare = upFares.seat + downFares.seat;
        const combinedCargoFare = upFares.cargo + downFares.cargo;
        const combinedFare = combinedSeatFare + combinedCargoFare;

        const upSeatsAndFare = `${toBengaliDigits(upBookedSeats)} সিট | ${formatTaka(upFares.total)}`;
        const downSeatsAndFare = downTrip
          ? `${toBengaliDigits(downBookedSeats)} সিট | ${formatTaka(downFares.total)}`
          : '-';
        const totalSeatsAndFare = `${toBengaliDigits(combinedSeats)} সিট | ${formatTaka(combinedFare)}`;

        // Supervisor
        const upSup = upTrip.supervisor || '';
        const downSup = downTrip?.supervisor || '';
        let supervisorDisplay = '';
        if (downTrip && upSup && downSup) {
          supervisorDisplay = upSup === downSup ? upSup : `আপ: ${upSup} | ডাউন: ${downSup}`;
        } else {
          supervisorDisplay = upSup || downSup || '-';
        }

        // Driver
        const upDrv = upTrip.driver || '';
        const downDrv = downTrip?.driver || '';
        let driverDisplay = '';
        if (downTrip && upDrv && downDrv) {
          driverDisplay = upDrv === downDrv ? upDrv : `আপ: ${upDrv} | ডাউন: ${downDrv}`;
        } else {
          driverDisplay = upDrv || downDrv || '-';
        }

        const owner = upTrip.vehicleOwnerName || downTrip?.vehicleOwnerName || 'সাধারণ';

        rows.push({
          id: `row-nh-${autoSl}-${vehReg}`,
          autoSerial: autoSl++,
          dateDisplay,
          operationalDate: date,
          isNightHold: true,
          vehicleRegNo: vehReg,
          vehicleOwnerName: owner,
          upTime,
          upTripNo: upTrip.tripNo,
          downTime,
          downTripNo: downTrip?.tripNo,
          timeDiffDisplay,
          timeDiffMinutes,
          routeMerged,
          distanceKmDisplay,
          totalDistanceKm,
          upSeatsAndFare,
          upBookedSeats,
          upSeatFare: upFares.seat,
          upCargoFare: upFares.cargo,
          upFare: upFares.total,
          downSeatsAndFare,
          downBookedSeats,
          downSeatFare: downFares.seat,
          downCargoFare: downFares.cargo,
          downFare: downFares.total,
          totalSeatsAndFare,
          combinedSeats,
          combinedSeatFare,
          combinedCargoFare,
          combinedFare,
          supervisorDisplay,
          driverDisplay,
          isFullTrip,
          status: isFullTrip ? 'সমন্বিত (নাইট হোল্ড পূর্ণাঙ্গ ট্রিপ)' : 'ডাউন ট্রিপ অপেক্ষমাণ',
        });
      });

      // 2. Process Regular same-day UP trips paired with remaining today DOWN trips
      const regularPairsCount = Math.max(group.todayUpRegular.length, group.todayDown.length);
      for (let i = 0; i < regularPairsCount; i++) {
        const upTrip = group.todayUpRegular[i];
        const downTrip = group.todayDown[i];
        const isFullTrip = Boolean(upTrip && downTrip);
        const isNightHold = false;

        const dateDisplay = formatBengaliDate(date);
        const upTime = upTrip
          ? `${upTrip.departureTime} ${upTrip.tripSequenceLabel ? `(${upTrip.tripSequenceLabel})` : ''}`
          : '-';
        const downTime = downTrip ? `${downTrip.departureTime}` : 'ডাউন ট্রিপ অপেক্ষমাণ';

        const { display: timeDiffDisplay, minutes: timeDiffMinutes } =
          upTrip && downTrip
            ? calculateTimeDifference(upTrip.departureTime, downTrip.departureTime, isNightHold)
            : { display: 'নির্ধারিত হয়নি', minutes: 0 };

        const upRoute = upTrip?.routeName || '';
        const downRoute = downTrip?.routeName || '';
        const routeMerged = mergeRoutes(upRoute, downRoute);

        // Distance in KM
        const upKm = upTrip ? getRouteDistance(routes, upTrip.routeId, upTrip.routeName) : 0;
        const downKm = downTrip ? getRouteDistance(routes, downTrip.routeId, downTrip.routeName) : 0;
        const totalDistanceKm = upKm + downKm;
        const distanceKmDisplay =
          upTrip && downTrip
            ? `${toBengaliDigits(upKm)} কিমি + ${toBengaliDigits(downKm)} কিমি = ${toBengaliDigits(totalDistanceKm)} কিমি`
            : `${toBengaliDigits(upKm || downKm)} কিমি`;

        // Seats & Fares (Seat + Cargo = Total)
        const upBookedSeats = upTrip?.totalBookedSeats || 0;
        const upFares = getScheduleFareBreakdown(upTrip);
        const downBookedSeats = downTrip?.totalBookedSeats || 0;
        const downFares = getScheduleFareBreakdown(downTrip);
        const combinedSeats = upBookedSeats + downBookedSeats;
        const combinedSeatFare = upFares.seat + downFares.seat;
        const combinedCargoFare = upFares.cargo + downFares.cargo;
        const combinedFare = combinedSeatFare + combinedCargoFare;

        const upSeatsAndFare = upTrip ? `${toBengaliDigits(upBookedSeats)} সিট | ${formatTaka(upFares.total)}` : '-';
        const downSeatsAndFare = downTrip ? `${toBengaliDigits(downBookedSeats)} সিট | ${formatTaka(downFares.total)}` : '-';
        const totalSeatsAndFare = `${toBengaliDigits(combinedSeats)} সিট | ${formatTaka(combinedFare)}`;

        // Supervisor
        const upSup = upTrip?.supervisor || '';
        const downSup = downTrip?.supervisor || '';
        let supervisorDisplay = '';
        if (upTrip && downTrip && upSup && downSup) {
          supervisorDisplay = upSup === downSup ? upSup : `আপ: ${upSup} | ডাউন: ${downSup}`;
        } else {
          supervisorDisplay = upSup || downSup || '-';
        }

        // Driver
        const upDrv = upTrip?.driver || '';
        const downDrv = downTrip?.driver || '';
        let driverDisplay = '';
        if (upTrip && downTrip && upDrv && downDrv) {
          driverDisplay = upDrv === downDrv ? upDrv : `আপ: ${upDrv} | ডাউন: ${downDrv}`;
        } else {
          driverDisplay = upDrv || downDrv || '-';
        }

        const owner = upTrip?.vehicleOwnerName || downTrip?.vehicleOwnerName || 'সাধারণ';

        rows.push({
          id: `row-reg-${autoSl}-${vehReg}-${i}`,
          autoSerial: autoSl++,
          dateDisplay,
          operationalDate: date,
          isNightHold: false,
          vehicleRegNo: vehReg,
          vehicleOwnerName: owner,
          upTime,
          upTripNo: upTrip?.tripNo,
          downTime,
          downTripNo: downTrip?.tripNo,
          timeDiffDisplay,
          timeDiffMinutes,
          routeMerged,
          distanceKmDisplay,
          totalDistanceKm,
          upSeatsAndFare,
          upBookedSeats,
          upSeatFare: upFares.seat,
          upCargoFare: upFares.cargo,
          upFare: upFares.total,
          downSeatsAndFare,
          downBookedSeats,
          downSeatFare: downFares.seat,
          downCargoFare: downFares.cargo,
          downFare: downFares.total,
          totalSeatsAndFare,
          combinedSeats,
          combinedSeatFare,
          combinedCargoFare,
          combinedFare,
          supervisorDisplay,
          driverDisplay,
          isFullTrip,
          status: isFullTrip
            ? 'সমন্বিত (রেগুলার পূর্ণাঙ্গ ট্রিপ)'
            : upTrip
            ? 'ডাউন ট্রিপ অপেক্ষমাণ'
            : 'শুধুমাত্র ডাউন ট্রিপ',
        });
      }

      // 3. Process today's Night Hold UP trips (initiated today, returning tomorrow)
      // Rule: Will be counted tomorrow, shown today with awaiting tag
      group.todayUpNightHold.forEach((upTrip) => {
        const isNightHold = true;
        const isFullTrip = false; // Returns tomorrow!
        const dateDisplay = `${formatBengaliDate(date)} (আপ) [ফিরতি দিন: ${formatBengaliDate(tomorrow)}]`;
        const upTime = `${upTrip.departureTime} ${upTrip.tripSequenceLabel ? `(${upTrip.tripSequenceLabel})` : ''}`;
        const downTime = `আগামীকাল ফিরতি ট্রিপ (${formatBengaliDate(tomorrow)})`;
        const timeDiffDisplay = 'আগামীকাল গণনা হবে';

        const upRoute = upTrip.routeName || '';
        const routeMerged = `${cleanRouteName(upRoute)} (নাইট হোল্ড আপ - ফিরতি দিন ট্রিপ সমন্বয়)`;

        const upKm = getRouteDistance(routes, upTrip.routeId, upTrip.routeName);
        const distanceKmDisplay = `${toBengaliDigits(upKm)} কিমি (আপ)`;

        const upBookedSeats = upTrip.totalBookedSeats || 0;
        const upFares = getScheduleFareBreakdown(upTrip);

        const upSeatsAndFare = `${toBengaliDigits(upBookedSeats)} সিট | ${formatTaka(upFares.total)}`;
        const downSeatsAndFare = '-';
        const totalSeatsAndFare = `${toBengaliDigits(upBookedSeats)} সিট | ${formatTaka(upFares.total)}`;

        rows.push({
          id: `row-today-nh-${autoSl}-${vehReg}`,
          autoSerial: autoSl++,
          dateDisplay,
          operationalDate: date,
          isNightHold: true,
          vehicleRegNo: vehReg,
          vehicleOwnerName: upTrip.vehicleOwnerName || 'সাধারণ',
          upTime,
          upTripNo: upTrip.tripNo,
          downTime,
          downTripNo: undefined,
          timeDiffDisplay,
          timeDiffMinutes: 0,
          routeMerged,
          distanceKmDisplay,
          totalDistanceKm: upKm,
          upSeatsAndFare,
          upBookedSeats,
          upSeatFare: upFares.seat,
          upCargoFare: upFares.cargo,
          upFare: upFares.total,
          downSeatsAndFare,
          downBookedSeats: 0,
          downSeatFare: 0,
          downCargoFare: 0,
          downFare: 0,
          totalSeatsAndFare,
          combinedSeats: upBookedSeats,
          combinedSeatFare: upFares.seat,
          combinedCargoFare: upFares.cargo,
          combinedFare: upFares.total,
          supervisorDisplay: upTrip.supervisor || '-',
          driverDisplay: upTrip.driver || '-',
          isFullTrip: false, // Counts on tomorrow's date!
          status: 'নাইট হোল্ড (আগামীকাল ফিরতি দিনে ট্রিপ কাউন্ট হবে)',
        });
      });
    });

    return rows;
  }, [schedules, routes, date]);

  // Client Filtered Rows
  const filteredRows = tableRows.filter((row) => {
    if (vehicleFilter !== 'ALL' && row.vehicleRegNo !== vehicleFilter) return false;
    if (tripTypeFilter === 'FULL_TRIPS' && !row.isFullTrip) return false;
    if (tripTypeFilter === 'NIGHT_HOLD' && !row.isNightHold) return false;
    if (tripTypeFilter === 'PENDING' && row.isFullTrip) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      row.vehicleRegNo.toLowerCase().includes(term) ||
      row.routeMerged.toLowerCase().includes(term) ||
      row.supervisorDisplay.toLowerCase().includes(term) ||
      row.driverDisplay.toLowerCase().includes(term) ||
      (row.vehicleOwnerName && row.vehicleOwnerName.toLowerCase().includes(term))
    );
  });

  // KPI Calculations
  const stats = useMemo(() => {
    const fullTrips = tableRows.filter((r) => r.isFullTrip).length;
    const nightHoldTrips = tableRows.filter((r) => r.isNightHold && r.isFullTrip).length;
    const pendingTrips = tableRows.filter((r) => !r.isFullTrip).length;
    const totalSeats = tableRows.reduce((sum, r) => sum + r.combinedSeats, 0);
    const totalSeatFare = tableRows.reduce((sum, r) => sum + r.combinedSeatFare, 0);
    const totalCargoFare = tableRows.reduce((sum, r) => sum + r.combinedCargoFare, 0);
    const totalFare = totalSeatFare + totalCargoFare;
    const totalDistance = tableRows.reduce((sum, r) => sum + r.totalDistanceKm, 0);

    return {
      fullTrips,
      nightHoldTrips,
      pendingTrips,
      totalSeats,
      totalSeatFare,
      totalCargoFare,
      totalFare,
      totalDistance,
    };
  }, [tableRows]);

  // Filtered rows totals for the table footer
  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.fullTrips += r.isFullTrip ? 1 : 0;
        acc.distance += r.totalDistanceKm;
        acc.upSeats += r.upBookedSeats;
        acc.upFare += r.upFare;
        acc.downSeats += r.downBookedSeats;
        acc.downFare += r.downFare;
        acc.totalSeats += r.combinedSeats;
        acc.totalSeatFare += r.combinedSeatFare;
        acc.totalCargoFare += r.combinedCargoFare;
        acc.totalFare += r.combinedFare;
        return acc;
      },
      {
        fullTrips: 0,
        distance: 0,
        upSeats: 0,
        upFare: 0,
        downSeats: 0,
        downFare: 0,
        totalSeats: 0,
        totalSeatFare: 0,
        totalCargoFare: 0,
        totalFare: 0,
      }
    );
  }, [filteredRows]);

  // Export CSV with UTF-8 BOM containing Seat + Cargo + Total columns
  const handleExportCSV = () => {
    const headers = [
      'সিরিয়াল',
      'তারিখ',
      'গাড়ি নাম্বার',
      'নাইট হোল্ড',
      'আপ ট্রিপ সময়',
      'ডাউন ট্রিপ সময়',
      'সময় ব্যবধান (আপ-ডাউন)',
      'রুট (আপ ট্রিপ + ডাউন ট্রিপ)',
      'মোট দূরত্ব (কিমি)',
      'আপ ট্রিপ সিট বুকিং ও ভাড়া',
      'ডাউন ট্রিপ সিট বুকিং ও ভাড়া',
      'মোট সিট সংখ্যা',
      'সিট বুকিং টাকা (৳)',
      'মালের ভাড়া (৳)',
      'মোট টাকা (সিট+মাল) (৳)',
      'সুপারভাইজার',
      'ড্রাইভার',
      'স্ট্যাটাস',
    ];

    const rows = filteredRows.map((r) => [
      r.autoSerial,
      r.dateDisplay,
      r.vehicleRegNo,
      r.isNightHold ? 'হ্যাঁ' : 'না',
      r.upTime,
      r.downTime,
      r.timeDiffDisplay,
      `"${r.routeMerged}"`,
      `"${r.distanceKmDisplay}"`,
      `"${r.upSeatsAndFare}"`,
      `"${r.downSeatsAndFare}"`,
      r.combinedSeats,
      r.combinedSeatFare,
      r.combinedCargoFare,
      r.combinedFare,
      `"${r.supervisorDisplay}"`,
      `"${r.driverDisplay}"`,
      `"${r.status}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `trip_database_report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate AI Summary optionally
  const handleGenerateAi = async () => {
    setAiLoading(true);
    setShowAiModal(true);
    try {
      const res = await api.getAiDailySummary(date);
      setAiReport(res.summary);
    } catch (err: any) {
      setAiReport('এআই বিশ্লেষণ লোড করা যায়নি: ' + (err.message || 'নেটওয়ার্ক সমস্যা'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 rounded-3xl shadow-lg border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-semibold border border-emerald-400/30 mb-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>সিস্টেম ডাটাবেইজ ও ট্রিপ সমন্বয় রেজিস্টার</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
            ডাটাবেইজ — ট্রিপ সমন্বয়, নাইট হোল্ড ও পুর্নাঙ্গ রিপোর্ট
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            মুল লক্ষ্য: আপ ও ডাউন ট্রিপ মিলে কয়টি ট্রিপ হলো তার নির্ভুল হিসাব। নাইট হোল্ড ট্রিপের ফিরতি দিনে ট্রিপ কাউন্ট, আপ-ডাউন সময় ব্যবধান, কিমি দূরত্ব এবং সিট ও ভাড়া সমষ্টিক হিসাব।
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors border border-slate-600 cursor-pointer"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="১৩টি কলাম সহ এক্সেল ডাউনলোড"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>এক্সেল (.CSV)</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            title="পিডিএফ সংরক্ষণ বা প্রিন্ট করুন"
          >
            <Printer className="w-4 h-4" />
            <span>প্রিন্ট / সেভ PDF</span>
          </button>

          <button
            type="button"
            onClick={handleGenerateAi}
            className="px-3.5 py-2 bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border border-purple-400/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="এআই বিশ্লেষণ"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span>এআই ইনসাইটস</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Full Trips Count - PRIMARY OBJECTIVE */}
        <div className="bg-emerald-50 border border-emerald-300 p-3.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 text-[11px] font-bold">
            <span>আজকের পূর্ণাঙ্গ ট্রিপ</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-950 mt-1">
            {toBengaliDigits(stats.fullTrips)} <span className="text-xs font-medium">টি</span>
          </div>
          <div className="text-[10px] text-emerald-700 mt-0.5">
            আপ+ডাউন মিলে ১ ট্রিপ কাউন্ট
          </div>
        </div>

        {/* Night Hold Trips */}
        <div className="bg-purple-50 border border-purple-300 p-3.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-purple-800 text-[11px] font-bold">
            <span>নাইট হোল্ড ট্রিপ</span>
            <Moon className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-950 mt-1">
            {toBengaliDigits(stats.nightHoldTrips)} <span className="text-xs font-medium">টি</span>
          </div>
          <div className="text-[10px] text-purple-700 mt-0.5">
            আজ সম্পন্ন ফিরতি ট্রিপ
          </div>
        </div>

        {/* Total Booked Seats */}
        <div className="bg-blue-50 border border-blue-300 p-3.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-blue-800 text-[11px] font-bold">
            <span>মোট সিট বুকিং</span>
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-950 mt-1">
            {toBengaliDigits(stats.totalSeats)} <span className="text-xs font-medium">টি</span>
          </div>
          <div className="text-[10px] text-blue-700 mt-0.5">
            আপ ও ডাউন উভয় ট্রিপ
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold">
            <span>মোট আদায় (সিট + মাল)</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-950 mt-1 tabular-nums">
            {formatTaka(stats.totalFare)}
          </div>
          <div className="text-[10px] text-amber-800 mt-0.5 font-semibold">
            সিট: {formatTaka(stats.totalSeatFare)} | মাল: {formatTaka(stats.totalCargoFare)}
          </div>
        </div>

        {/* Total Distance */}
        <div className="bg-indigo-50 border border-indigo-300 p-3.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-indigo-800 text-[11px] font-bold">
            <span>মোট অতিক্রান্ত দূরত্ব</span>
            <RouteIcon className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-950 mt-1">
            {toBengaliDigits(stats.totalDistance)} <span className="text-xs font-medium">কিমি</span>
          </div>
          <div className="text-[10px] text-indigo-700 mt-0.5">
            আপ রুট + ডাউন রুট কিমি
          </div>
        </div>

        {/* Pending Trips */}
        <div className={`p-3.5 rounded-2xl border shadow-xs transition-colors ${
          stats.pendingTrips === 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-100 border-slate-300'
        }`}>
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className={stats.pendingTrips === 0 ? 'text-emerald-800' : 'text-slate-700'}>
              ফিরতি অপেক্ষমাণ
            </span>
            <Clock className={`w-4 h-4 ${stats.pendingTrips === 0 ? 'text-emerald-600' : 'text-slate-500'}`} />
          </div>
          <div className={`text-2xl font-black mt-1 ${stats.pendingTrips === 0 ? 'text-emerald-950' : 'text-slate-800'}`}>
            {toBengaliDigits(stats.pendingTrips)} <span className="text-xs font-medium">টি</span>
          </div>
          <div className={`text-[10px] mt-0.5 ${stats.pendingTrips === 0 ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
            {stats.pendingTrips === 0 ? 'সকল ট্রিপ সমন্বিত (কোনো অপেক্ষমাণ নেই)' : 'ডাউন ট্রিপ এখনো তৈরি হয়নি'}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-500 text-[11px]">তারিখ:</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
            />
          </div>

          {/* Vehicle Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
            <Bus className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 text-[11px]">গাড়ি:</span>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
            >
              <option value="ALL">সকল গাড়ি</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.regNo}>
                  {v.regNo}
                </option>
              ))}
            </select>
          </div>

          {/* Trip Type Filter */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => setTripTypeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                tripTypeFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              সব ট্রিপ ({toBengaliDigits(tableRows.length)})
            </button>
            <button
              type="button"
              onClick={() => setTripTypeFilter('FULL_TRIPS')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                tripTypeFilter === 'FULL_TRIPS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              পূর্ণাঙ্গ ট্রিপ ({toBengaliDigits(stats.fullTrips)})
            </button>
            <button
              type="button"
              onClick={() => setTripTypeFilter('NIGHT_HOLD')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                tripTypeFilter === 'NIGHT_HOLD'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              নাইট হোল্ড ({toBengaliDigits(stats.nightHoldTrips)})
            </button>
            <button
              type="button"
              onClick={() => setTripTypeFilter('PENDING')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                tripTypeFilter === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ফিরতি বাকি ({toBengaliDigits(stats.pendingTrips)})
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="গাড়ি, রুট, সুপারভাইজার বা ড্রাইভার..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-medium"
          />
        </div>
      </div>

      {/* Main Database Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Card Header & Rule Note */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              {toBengaliDigits(filteredRows.length)}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                ডাটাবেইজ সমন্বয় রেজিস্টার ({toBengaliDigits(filteredRows.length)} টি রেকর্ড প্রদর্শিত)
              </h3>
              <p className="text-[11px] text-slate-500">
                ১৩টি কলাম: তারিখ | গাড়ি নম্বর | নাইট হোল্ড | আপ সময় | ডাউন সময় | সময় ব্যবধান | রুট সমন্বয় | মোট দূরত্ব | আপ সিট ও ভাড়া | ডাউন সিট ও ভাড়া | মোট সিট ও ভাড়া | সুপারভাইজার | ড্রাইভার
              </p>
            </div>
          </div>

          <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>লজিক: আপ ও ডাউন ট্রিপ মিলে ওই গাড়ির ১টি পূর্ণাঙ্গ ট্রিপ কাউন্ট হবে। নাইট হোল্ড ট্রিপ ফিরতি দিনে গণনা হয়।</span>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            ডাটাবেইজ লোড হচ্ছে...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 px-6 text-center bg-white">
            {tripTypeFilter === 'PENDING' ? (
              <div className="max-w-md mx-auto p-6 bg-emerald-50 rounded-2xl border border-emerald-200">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-emerald-950">কোনো ট্রিপ অপেক্ষমাণ নেই!</h4>
                <p className="text-xs text-emerald-700 mt-1">
                  আজকের সকল গাড়ির আপ ও ডাউন ট্রিপ সফলভাবে সমন্বয় করা হয়েছে।
                </p>
              </div>
            ) : (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Database className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">ডাটাবেইজে কোনো ট্রিপ এন্ট্রি নেই</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  শিডিউল মেকার থেকে আপ ট্রিপ ও ডাউন কাউন্টার থেকে ফিরতি ট্রিপ তৈরি হলে স্বয়ংক্রিয়ভাবে এখানে পুর্নাঙ্গ সমন্বিত ডাটা প্রদর্শিত হবে।
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Excel Spreadsheet Grid Table with 13 columns */}
            <table className="w-full text-xs text-left border-collapse border border-slate-300">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 sticky top-0 z-10">
                <tr>
                  <th className="px-2.5 py-2.5 text-center w-10 border-r border-slate-300">ক্রমিক</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[120px]">তারিখ</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[130px]">গাড়ি নাম্বার</th>
                  <th className="px-2.5 py-2.5 text-center border-r border-slate-300 min-w-[80px]">নাইট হোল্ড</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[110px]">আপ ট্রিপ সময়</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[110px]">ডাউন ট্রিপ সময়</th>
                  <th className="px-2.5 py-2.5 text-center border-r border-slate-300 min-w-[110px]">সময় ব্যবধান (আপ-ডাউন)</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[200px]">রুট (আপ + ডাউন)</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[130px]">মোট দূরত্ব (কিমি)</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[130px] bg-blue-50/50">আপ সিট ও ভাড়া</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[130px] bg-emerald-50/50">ডাউন সিট ও ভাড়া</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[110px] text-right bg-blue-50/70">সিট বুকিং টাকা</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[100px] text-right bg-amber-50/70">মালের ভাড়া</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[115px] text-right bg-emerald-100/70 font-black">মোট টাকা</th>
                  <th className="px-2.5 py-2.5 border-r border-slate-300 min-w-[100px]">সুপারভাইজার</th>
                  <th className="px-2.5 py-2.5 min-w-[100px]">ড্রাইভার</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-blue-50/40 transition-colors ${
                      row.isFullTrip ? 'bg-white' : 'bg-slate-50/60'
                    }`}
                  >
                    {/* 1. ক্রমিক */}
                    <td className="px-2.5 py-2 text-center font-bold text-slate-800 border-r border-slate-300">
                      <span className="w-5 h-5 rounded bg-slate-100 text-slate-700 border border-slate-300 inline-flex items-center justify-center font-mono text-[11px]">
                        {toBengaliDigits(row.autoSerial)}
                      </span>
                    </td>

                    {/* 2. তারিখ */}
                    <td className="px-2.5 py-2 border-r border-slate-300">
                      <div className="font-bold text-slate-900 leading-tight">{row.dateDisplay}</div>
                      {row.isNightHold && (
                        <span className="inline-flex items-center gap-0.5 text-[9.5px] text-purple-700 font-bold bg-purple-50 px-1 rounded border border-purple-200 mt-0.5">
                          <Moon className="w-2.5 h-2.5 text-purple-600" />
                          <span>নাইট হোল্ড রিটার্ন</span>
                        </span>
                      )}
                    </td>

                    {/* 3. গাড়ি নাম্বার */}
                    <td className="px-2.5 py-2 border-r border-slate-300">
                      <div className="font-black text-slate-900 font-mono flex items-center gap-1">
                        <Bus className="w-3 h-3 text-slate-400" />
                        <span>{row.vehicleRegNo}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        মালিক: <span className="font-semibold text-slate-700">{row.vehicleOwnerName || 'সাধারণ'}</span>
                      </div>
                    </td>

                    {/* 4. নাইট হোল্ড */}
                    <td className="px-2.5 py-2 text-center border-r border-slate-300">
                      {row.isNightHold ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                          <Moon className="w-3 h-3" />
                          <span>হ্যাঁ</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs font-semibold">না</span>
                      )}
                    </td>

                    {/* 5. আপ ট্রিপ সময় */}
                    <td className="px-2.5 py-2 border-r border-slate-300">
                      <div className="font-bold text-blue-900">{row.upTime}</div>
                      {row.upTripNo && (
                        <div className="text-[10px] text-blue-600 font-mono">{row.upTripNo}</div>
                      )}
                    </td>

                    {/* 6. ডাউন ট্রিপ সময় */}
                    <td className="px-2.5 py-2 border-r border-slate-300">
                      <div className={`font-bold ${row.downTime.includes('অপেক্ষমাণ') || row.downTime.includes('আগামীকাল') ? 'text-amber-700' : 'text-emerald-900'}`}>
                        {row.downTime}
                      </div>
                      {row.downTripNo && (
                        <div className="text-[10px] text-emerald-600 font-mono">{row.downTripNo}</div>
                      )}
                    </td>

                    {/* 7. সময় ব্যবধান (আপ সময় - ডাউন সময়) */}
                    <td className="px-2.5 py-2 text-center border-r border-slate-300">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-bold text-[11px] border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{row.timeDiffDisplay}</span>
                      </div>
                    </td>

                    {/* 8. রুট (আপ ট্রিপ রুট + ডাউন ট্রিপ রুট) */}
                    <td className="px-2.5 py-2 border-r border-slate-300">
                      <div className="font-semibold text-slate-900 text-[11px] leading-snug">
                        {row.routeMerged}
                      </div>
                    </td>

                    {/* 9. মোট দূরত্ব (আপ রুট কিমি + ডাউন ট্রিপ কিমি) */}
                    <td className="px-2.5 py-2 border-r border-slate-300 font-semibold text-slate-800">
                      <div className="flex items-center gap-1 font-mono text-[11px]">
                        <RouteIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span>{row.distanceKmDisplay}</span>
                      </div>
                    </td>

                    {/* 10. আপ ট্রিপ সিট বুকিং সংখ্যা + মোট ভাড়া */}
                    <td className="px-2.5 py-2 border-r border-slate-300 bg-blue-50/30">
                      <div className="font-bold text-blue-900 text-xs">{row.upSeatsAndFare}</div>
                      {row.upCargoFare > 0 && (
                        <div className="text-[10px] text-amber-700 font-semibold">
                          সিট: {formatTaka(row.upSeatFare)} | মাল: {formatTaka(row.upCargoFare)}
                        </div>
                      )}
                    </td>

                    {/* 11. ডাউন ট্রিপ সিট বুকিং সংখ্যা + মোট ভাড়া */}
                    <td className="px-2.5 py-2 border-r border-slate-300 bg-emerald-50/30">
                      <div className="font-bold text-emerald-900 text-xs">{row.downSeatsAndFare}</div>
                      {row.downCargoFare > 0 && (
                        <div className="text-[10px] text-amber-700 font-semibold">
                          সিট: {formatTaka(row.downSeatFare)} | মাল: {formatTaka(row.downCargoFare)}
                        </div>
                      )}
                    </td>

                    {/* 12. সিট বুকিং টাকা */}
                    <td className="px-2.5 py-2 border-r border-slate-300 text-right bg-blue-50/30 tabular-nums whitespace-nowrap">
                      <div className="font-bold text-blue-900 text-xs">{formatTaka(row.combinedSeatFare)}</div>
                      <div className="text-[10px] text-slate-500">{toBengaliDigits(row.combinedSeats)} সিট</div>
                    </td>

                    {/* 13. মালের ভাড়া */}
                    <td className="px-2.5 py-2 border-r border-slate-300 text-right bg-amber-50/30 tabular-nums whitespace-nowrap">
                      <div className="font-bold text-amber-800 text-xs">{formatTaka(row.combinedCargoFare)}</div>
                    </td>

                    {/* 14. মোট টাকা (সিট + মাল) */}
                    <td className="px-2.5 py-2 border-r border-slate-300 text-right bg-emerald-50/60 tabular-nums whitespace-nowrap">
                      <div className="font-black text-emerald-950 text-xs">{formatTaka(row.combinedFare)}</div>
                    </td>

                    {/* 15. সুপারভাইজার */}
                    <td className="px-2.5 py-2 border-r border-slate-300 font-semibold text-slate-800">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{row.supervisorDisplay}</span>
                      </div>
                    </td>

                    {/* 16. ড্রাইভার */}
                    <td className="px-2.5 py-2 font-semibold text-slate-800">
                      <span>{row.driverDisplay}</span>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Table Summary Footer */}
              <tfoot className="bg-slate-200 text-slate-900 font-black border-t-2 border-slate-400 text-xs">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 border-r border-slate-300 text-left font-bold">
                    সর্বমোট: {toBengaliDigits(filteredRows.length)} টি রেকর্ড | পূর্ণাঙ্গ ট্রিপ: {toBengaliDigits(filteredTotals.fullTrips)} টি
                  </td>
                  <td className="px-2 py-2.5 border-r border-slate-300 text-center">-</td>
                  <td className="px-2 py-2.5 border-r border-slate-300 text-center">-</td>
                  <td className="px-2 py-2.5 border-r border-slate-300 text-center">-</td>
                  <td className="px-2 py-2.5 border-r border-slate-300 text-center">-</td>
                  <td className="px-2 py-2.5 border-r border-slate-300 text-center">-</td>
                  <td className="px-2.5 py-2.5 border-r border-slate-300 font-mono text-indigo-900">
                    {toBengaliDigits(filteredTotals.distance)} কিমি
                  </td>
                  <td className="px-2.5 py-2.5 border-r border-slate-300 text-blue-900">
                    {toBengaliDigits(filteredTotals.upSeats)} সিট | {formatTaka(filteredTotals.upFare)}
                  </td>
                  <td className="px-2.5 py-2.5 border-r border-slate-300 text-emerald-900">
                    {toBengaliDigits(filteredTotals.downSeats)} সিট | {formatTaka(filteredTotals.downFare)}
                  </td>
                  <td className="px-2.5 py-2.5 border-r border-slate-300 text-right text-blue-950 bg-blue-100/70 tabular-nums whitespace-nowrap">
                    {formatTaka(filteredTotals.totalSeatFare)}
                  </td>
                  <td className="px-2.5 py-2.5 border-r border-slate-300 text-right text-amber-950 bg-amber-100/70 tabular-nums whitespace-nowrap">
                    {formatTaka(filteredTotals.totalCargoFare)}
                  </td>
                  <td className="px-2.5 py-2.5 border-r border-slate-300 text-right text-emerald-950 font-black bg-emerald-100 tabular-nums whitespace-nowrap">
                    {formatTaka(filteredTotals.totalFare)}
                  </td>
                  <td colSpan={2} className="px-3 py-2.5 text-center text-[11px] text-slate-600">
                    সমন্বয় সম্পন্ন
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Printable Sheet (hidden on screen, visible during window.print()) */}
      <div id="printable-database-report" className="hidden print:block p-4 sm:p-6 bg-white text-slate-900 font-sans space-y-4">
        <div className="text-center border-b-2 border-slate-800 pb-4 space-y-1">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-wide">
            কাউন্টার ম্যানেজমেন্ট সিস্টেম ও বাস সার্ভিস
          </h2>
          <p className="text-xs font-bold text-slate-700">
            ডাটাবেইজ — দৈনিক ট্রিপ শিডিউল, নাইট হোল্ড সমন্বয় ও পূর্ণাঙ্গ ট্রিপ রেজিস্টার
          </p>
          <div className="flex justify-between items-center text-xs font-bold text-slate-700 pt-2 border-t border-slate-200 mt-2">
            <span>অপারেশনাল তারিখ: {formatBengaliDate(date)} ({date})</span>
            <span>মোট পূর্ণাঙ্গ ট্রিপ: {toBengaliDigits(stats.fullTrips)} টি</span>
            <span>সর্বমোট আদায়: {formatTaka(stats.totalFare)}</span>
          </div>
        </div>

        {/* Print 13-Column Table */}
        <table className="w-full text-[10px] border-collapse border border-slate-400">
          <thead>
            <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-400">
              <th className="border border-slate-400 p-1 text-center w-7">ক্র.</th>
              <th className="border border-slate-400 p-1 text-left">তারিখ</th>
              <th className="border border-slate-400 p-1 text-left">গাড়ি নাম্বার</th>
              <th className="border border-slate-400 p-1 text-center">নাইট হোল্ড</th>
              <th className="border border-slate-400 p-1 text-left">আপ সময়</th>
              <th className="border border-slate-400 p-1 text-left">ডাউন সময়</th>
              <th className="border border-slate-400 p-1 text-center">ব্যবধান</th>
              <th className="border border-slate-400 p-1 text-left">রুট (আপ + ডাউন)</th>
              <th className="border border-slate-400 p-1 text-left">মোট দূরত্ব</th>
              <th className="border border-slate-400 p-1 text-left">আপ সিট ও ভাড়া</th>
              <th className="border border-slate-400 p-1 text-left">ডাউন সিট ও ভাড়া</th>
              <th className="border border-slate-400 p-1 text-right">সিট টাকা</th>
              <th className="border border-slate-400 p-1 text-right">মালের ভাড়া</th>
              <th className="border border-slate-400 p-1 text-right font-black">মোট টাকা</th>
              <th className="border border-slate-400 p-1 text-left">সুপারভাইজার</th>
              <th className="border border-slate-400 p-1 text-left">ড্রাইভার</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-b border-slate-300">
                <td className="border border-slate-400 p-1 text-center font-bold">
                  {toBengaliDigits(row.autoSerial)}
                </td>
                <td className="border border-slate-400 p-1 font-semibold">{row.dateDisplay}</td>
                <td className="border border-slate-400 p-1 font-bold font-mono">{row.vehicleRegNo}</td>
                <td className="border border-slate-400 p-1 text-center font-bold">
                  {row.isNightHold ? 'হ্যাঁ' : 'না'}
                </td>
                <td className="border border-slate-400 p-1">{row.upTime}</td>
                <td className="border border-slate-400 p-1">{row.downTime}</td>
                <td className="border border-slate-400 p-1 text-center font-bold">{row.timeDiffDisplay}</td>
                <td className="border border-slate-400 p-1 font-medium">{row.routeMerged}</td>
                <td className="border border-slate-400 p-1 font-mono">{row.distanceKmDisplay}</td>
                <td className="border border-slate-400 p-1">{row.upSeatsAndFare}</td>
                <td className="border border-slate-400 p-1">{row.downSeatsAndFare}</td>
                <td className="border border-slate-400 p-1 text-right font-semibold tabular-nums">{formatTaka(row.combinedSeatFare)}</td>
                <td className="border border-slate-400 p-1 text-right font-semibold tabular-nums">{formatTaka(row.combinedCargoFare)}</td>
                <td className="border border-slate-400 p-1 text-right font-bold tabular-nums">{formatTaka(row.combinedFare)}</td>
                <td className="border border-slate-400 p-1">{row.supervisorDisplay}</td>
                <td className="border border-slate-400 p-1">{row.driverDisplay}</td>
              </tr>
            ))}
            {/* Grand Totals */}
            <tr className="bg-slate-200 font-bold border-t-2 border-slate-500">
              <td colSpan={3} className="border border-slate-400 p-1.5 text-left font-black">
                সর্বমোট: {toBengaliDigits(filteredTotals.fullTrips)} টি পূর্ণাঙ্গ ট্রিপ
              </td>
              <td colSpan={6} className="border border-slate-400 p-1.5 text-right font-black">
                মোট দূরত্ব: {toBengaliDigits(filteredTotals.distance)} কিমি
              </td>
              <td className="border border-slate-400 p-1.5 font-bold font-mono">
                {toBengaliDigits(filteredTotals.upSeats)} সিট | {formatTaka(filteredTotals.upFare)}
              </td>
              <td className="border border-slate-400 p-1.5 font-bold font-mono">
                {toBengaliDigits(filteredTotals.downSeats)} সিট | {formatTaka(filteredTotals.downFare)}
              </td>
              <td className="border border-slate-400 p-1.5 text-right font-bold font-mono tabular-nums">
                {formatTaka(filteredTotals.totalSeatFare)}
              </td>
              <td className="border border-slate-400 p-1.5 text-right font-bold font-mono tabular-nums">
                {formatTaka(filteredTotals.totalCargoFare)}
              </td>
              <td className="border border-slate-400 p-1.5 text-right font-black font-mono tabular-nums">
                {formatTaka(filteredTotals.totalFare)}
              </td>
              <td colSpan={2} className="border border-slate-400 p-1.5 text-center text-[9px]">
                অডিট সম্পন্ন
              </td>
            </tr>
          </tbody>
        </table>

        {/* Authorization Signatures */}
        <div className="pt-12 grid grid-cols-3 gap-8 text-center text-xs font-semibold text-slate-700">
          <div className="border-t border-slate-400 pt-1">ডাটা এন্ট্রি সহকারী</div>
          <div className="border-t border-slate-400 pt-1">ট্রাফিক কন্ট্রোলার</div>
          <div className="border-t border-slate-400 pt-1">ম্যানেজার অনুমোদন</div>
        </div>
      </div>

      {/* AI Insights Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <span>এআই দৈনিক বিশ্লেষণ ও ইনসাইটস</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                বন্ধ
              </button>
            </div>

            {aiLoading ? (
              <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                এআই বিশ্লেষণ প্রস্তুত হচ্ছে...
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-line font-medium">
                {aiReport}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
