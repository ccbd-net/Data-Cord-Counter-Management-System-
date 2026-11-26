import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Schedule, Vehicle, RouteItem, Driver } from '../types/index.ts';
import { useDataSync } from '../hooks/useDataSync.ts';
import {
  formatTaka,
  toBengaliDigits,
  getTodayDhakaDate,
  formatBengaliDate,
} from '../utils/formatters.ts';
import {
  groupSchedulesByRouteNumber,
  sortRoutesByNumber,
  resolveRouteNumber,
  parseDepartureTimeToMinutes,
} from '../utils/routeSort.ts';
import { downloadDailyTripsPDF, printElementById } from '../utils/pdfGenerator.ts';
import { DigitalClockPicker } from '../components/DigitalClockPicker.tsx';
import { ForwardUpTripsModal } from '../components/ForwardUpTripsModal.tsx';
import { OwnerWhatsAppModal } from '../components/OwnerWhatsAppModal.tsx';
import { normalizeRegNo, type OwnerReportSummaryItem } from '../utils/whatsapp.ts';
import {
  WeeklyScheduleTimeline,
  getWeekStartSaturday,
  addDaysToDateStr,
} from '../components/WeeklyScheduleTimeline.tsx';
import {
  CalendarDays,
  Calendar,
  Bus,
  Clock,
  User,
  Phone,
  Armchair,
  Edit3,
  Moon,
  CheckCircle,
  RefreshCw,
  Search,
  ArrowRight,
  Trash2,
  Printer,
  FileSpreadsheet,
  Download,
  Filter,
  Layers,
  ArrowUpDown,
  TrendingUp,
  Forward,
  MessageCircle,
} from 'lucide-react';

export const DailySchedulesPage: React.FC<{ onSelectTripForBooking?: (tripId: string) => void }> = ({
  onSelectTripForBooking,
}) => {
  const { user, isMasterAdmin, isModerator, canManageTrips } = useAuth();

  // Filter States
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [startDate, setStartDate] = useState<string>(getTodayDhakaDate());
  const [endDate, setEndDate] = useState<string>(getTodayDhakaDate());
  const [directionTab, setDirectionTab] = useState<'ALL' | 'PENDING_RETURN' | 'UP' | 'DOWN'>('ALL');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [displayMode, setDisplayMode] = useState<'excel' | 'cards' | 'weekly'>('excel');
  const [weekStartDate, setWeekStartDate] = useState<string>(() => getWeekStartSaturday(getTodayDhakaDate()));

  // Data States
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string>('');

  // Edit Schedule Modal State
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editTime, setEditTime] = useState<string>('07:00 AM');
  const [editRouteId, setEditRouteId] = useState<string>('');
  const [editSupervisor, setEditSupervisor] = useState<string>('');
  const [editSupervisorPhone, setEditSupervisorPhone] = useState<string>('');
  const [editFare, setEditFare] = useState<number>(550);
  const [editReason, setEditReason] = useState<string>('');

  // Return Trip (ফিরতি ট্রিপ) Quick Modal State
  const [returnModalTrip, setReturnModalTrip] = useState<Schedule | null>(null);
  const [returnDate, setReturnDate] = useState<string>(getTodayDhakaDate());
  const [returnTime, setReturnTime] = useState<string>('08:30 PM');
  const [returnRouteId, setReturnRouteId] = useState<string>('');
  const [returnSupervisor, setReturnSupervisor] = useState<string>('');
  const [returnDriver, setReturnDriver] = useState<string>('');
  const [returnFare, setReturnFare] = useState<number>(550);
  const [creatingReturn, setCreatingReturn] = useState<boolean>(false);

  // Print / PDF Report Modal
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  // Forward Yesterday's UP Trips Modal
  const [showForwardModal, setShowForwardModal] = useState<boolean>(false);
  // Owner WhatsApp Modal
  const [showWhatsAppModal, setShowWhatsAppModal] = useState<boolean>(false);

  // Load vehicles, routes, supervisors and drivers list
  const [supervisorsList, setSupervisorsList] = useState<{ id: string; name: string }[]>([]);
  const [driversList, setDriversList] = useState<Driver[]>([]);
  const [routesList, setRoutesList] = useState<RouteItem[]>([]);

  const fetchPrereqs = useCallback(async () => {
    try {
      const [vList, sRes, rRes, dRes] = await Promise.all([
        api.getVehicles(),
        api.getSupervisors(),
        api.getRoutes(),
        api.getDrivers(),
      ]);
      setVehicles(vList.vehicles);
      setSupervisorsList(sRes.supervisors || []);
      setRoutesList(sortRoutesByNumber(rRes.routes || []));
      setDriversList(dRes.drivers || []);
    } catch (err) {
      console.error('Failed to load vehicles, routes or supervisors:', err);
    }
  }, []);

  useEffect(() => {
    fetchPrereqs();
  }, [fetchPrereqs]);

  // Fetch schedules with flexible filters
  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (displayMode === 'weekly') {
        params.startDate = weekStartDate;
        params.endDate = addDaysToDateStr(weekStartDate, 6);
      } else if (dateMode === 'single') {
        params.date = date;
      } else {
        params.startDate = startDate;
      }
      if (displayMode !== 'weekly' && dateMode === 'range' && endDate) {
        params.endDate = endDate;
      }
      if (directionTab === 'UP' || directionTab === 'DOWN') {
        params.direction = directionTab;
      }
      if (selectedVehicle !== 'ALL') {
        params.vehicleRegNo = selectedVehicle;
      }

      const res = await api.getSchedules(params);
      setSchedules(res.schedules);
    } catch (err) {
      console.error('Failed to load daily schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [displayMode, weekStartDate, dateMode, date, startDate, endDate, directionTab, selectedVehicle]);

  // Real-time synchronization across pages and tabs
  useDataSync(
    useCallback(() => {
      fetchSchedules();
      fetchPrereqs();
    }, [displayMode, weekStartDate, dateMode, date, startDate, endDate, directionTab, selectedVehicle, fetchPrereqs])
  );

  // Quick / Drag-and-drop reassignment handler for Weekly Timeline
  const handleReassignTrip = async (
    scheduleId: string,
    updates: {
      date?: string;
      vehicleId?: string;
      departureTime?: string;
      supervisor?: string;
      fare?: number;
      updateReason?: string;
    }
  ) => {
    try {
      const res = await api.updateSchedule(scheduleId, updates);
      if (res.success && res.schedule) {
        setActionSuccessMsg(
          `সফল! ট্রিপ ${res.schedule.tripNo} (${res.schedule.vehicleRegNo}, তারিখ: ${res.schedule.date}, সময়: ${res.schedule.departureTime}) সফলভাবে পুনর্বিন্যাস করা হয়েছে।`
        );
      }
      await fetchSchedules();
    } catch (err: any) {
      alert(err.message || 'ট্রিপ পুনর্বিন্যাস করতে সমস্যা হয়েছে।');
    }
  };

  const handleOpenReturnModal = (trip: Schedule) => {
    setReturnModalTrip(trip);
    let defaultReturnDate = trip.date || getTodayDhakaDate();
    if (trip.isNightHold) {
      if (trip.nightHoldNextDate) {
        defaultReturnDate = trip.nightHoldNextDate;
      } else {
        try {
          const d = new Date(trip.date);
          d.setDate(d.getDate() + 1);
          defaultReturnDate = d.toISOString().split('T')[0];
        } catch {}
      }
    }
    setReturnDate(defaultReturnDate);
    setReturnTime('08:30 PM');
    setReturnSupervisor(trip.supervisor || '');
    setReturnDriver(trip.driver || '');

    // Pick best matching DOWN route (prefer same route number if present, otherwise first active DOWN route)
    const activeDownRoutes = sortRoutesByNumber(
      routesList.filter((r) => r.status === 'active' && r.direction === 'DOWN')
    );
    const upNum = resolveRouteNumber(trip.routeNumber, trip.routeName);
    const matchingNumberRoute =
      upNum !== Number.MAX_SAFE_INTEGER
        ? activeDownRoutes.find((r) => resolveRouteNumber(r.routeNumber, r.name) === upNum)
        : undefined;
    const defaultRoute = matchingNumberRoute || activeDownRoutes[0] || routesList.find((r) => r.status === 'active');

    setReturnRouteId(defaultRoute?.id || '');
    setReturnFare(defaultRoute?.baseFare || trip.fare || 550);
    setActionSuccessMsg('');
  };

  const handleCreateReturnTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalTrip) return;
    setCreatingReturn(true);
    setActionSuccessMsg('');

    try {
      const res = await api.createSchedule({
        date: returnDate,
        departureTime: returnTime,
        vehicleId: returnModalTrip.vehicleId,
        routeId: returnRouteId || undefined,
        direction: 'DOWN',
        supervisor: returnSupervisor || returnModalTrip.supervisor,
        driver: returnDriver || returnModalTrip.driver || undefined,
        fare: returnFare || undefined,
        linkedTripId: returnModalTrip.id,
      });

      setActionSuccessMsg(
        `সফল! গাড়ি: ${returnModalTrip.vehicleRegNo} এর ফিরতি ট্রিপ (${res.schedule.tripNo}, রুট: ${res.schedule.routeName}) তৈরি হয়েছে। আপ ও ডাউন মিলে ১টি পূর্ণাঙ্গ ট্রিপ সম্পন্ন।`
      );
      setReturnModalTrip(null);
      await fetchSchedules();
      if (onSelectTripForBooking) {
        onSelectTripForBooking(res.schedule.id);
      }
    } catch (err: any) {
      alert(err.message || 'ফিরতি ট্রিপ তৈরিতে সমস্যা হয়েছে।');
    } finally {
      setCreatingReturn(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (sch: Schedule) => {
    setEditingSchedule(sch);
    setEditTime(sch.departureTime || '07:00 AM');
    setEditRouteId(sch.routeId || '');
    setEditSupervisor(sch.supervisor || '');
    setEditSupervisorPhone(sch.supervisorPhone || '');
    setEditFare(sch.fare || 0);
    setEditReason(sch.lastTripUpdateReason || '');
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;

    try {
      await api.updateSchedule(editingSchedule.id, {
        departureTime: editTime,
        routeId: editRouteId || undefined,
        supervisor: editSupervisor,
        supervisorPhone: editSupervisorPhone,
        fare: editFare,
        updateReason: editReason || 'সময়ানুবর্তিতা বা অপারেশনাল কারণে পরিবর্তন',
      });
      setEditingSchedule(null);
      await fetchSchedules();
    } catch (err: any) {
      alert(err.message || 'আপডেট ব্যর্থ হয়েছে');
    }
  };

  // Delete Trip
  const handleDeleteTrip = async (sch: Schedule) => {
    if (!window.confirm(`আপনি কি নিশ্চিতভাবে "${sch.tripNo}" (${sch.vehicleRegNo}) ট্রিপটি মুছে ফেলতে চান?`)) {
      return;
    }
    try {
      await api.deleteSchedule(sch.id);
      await fetchSchedules();
    } catch (err: any) {
      alert(err.message || 'ট্রিপ মোছা যায়নি।');
    }
  };

  // Pending Return Trips: All active UP trips where returnTripCreated is not true and not reconciled
  const pendingReturnTrips = schedules.filter(
    (s) => s.direction === 'UP' && !s.returnTripCreated && !s.reconciled && s.status !== 'cancelled'
  );

  // Client-side search filtering + route number & time sorting
  const filtered = schedules
    .filter((s) => {
      if (selectedVehicle !== 'ALL' && s.vehicleRegNo !== selectedVehicle) {
        return false;
      }
      if (directionTab === 'UP' && s.direction !== 'UP') return false;
      if (directionTab === 'DOWN' && s.direction !== 'DOWN') return false;
      if (directionTab === 'PENDING_RETURN' && !(s.direction === 'UP' && !s.returnTripCreated && !s.reconciled)) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        s.tripNo.toLowerCase().includes(term) ||
        s.vehicleRegNo.toLowerCase().includes(term) ||
        s.supervisor.toLowerCase().includes(term) ||
        s.routeName.toLowerCase().includes(term) ||
        (s.vehicleOwnerName && s.vehicleOwnerName.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      const rA = resolveRouteNumber(a.routeNumber, a.routeName);
      const rB = resolveRouteNumber(b.routeNumber, b.routeName);
      if (rA !== rB) return rA - rB;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return parseDepartureTimeToMinutes(a.departureTime) - parseDepartureTimeToMinutes(b.departureTime);
    });

  // Backward-compatible schedule fare breakdown helper (Seat Fare + Cargo Fare = Total)
  const getScheduleFares = (s: Schedule) => {
    const cargoCol = Math.max(0, Number(s.totalCargoCollection) || 0);
    const totalCol =
      s.totalCollection !== undefined && s.totalCollection !== null
        ? Math.max(0, Number(s.totalCollection) || 0)
        : (s.totalBookedSeats || 0) * (s.fare || 0);
    const seatCol =
      s.totalSeatCollection !== undefined && s.totalSeatCollection !== null
        ? Math.max(0, Number(s.totalSeatCollection) || 0)
        : Math.max(0, totalCol - cargoCol);
    return { seatCol, cargoCol, totalCol: seatCol + cargoCol };
  };

  // Calculate Metrics
  const upTrips = filtered.filter((s) => s.direction === 'UP');
  const downTrips = filtered.filter((s) => s.direction === 'DOWN');

  // Completed paired round trips (আপ + ডাউন মিলে ১টি পূর্ণাঙ্গ ট্রিপ)
  const pairedRoundTrips = filtered.filter((s) => s.direction === 'UP' && s.returnTripCreated).length;

  // Unique vehicle count for UP and DOWN
  const uniqueUpVehicles = new Set(upTrips.map((s) => s.vehicleRegNo)).size;
  const uniqueDownVehicles = new Set(downTrips.map((s) => s.vehicleRegNo)).size;
  const totalUniqueVehicles = new Set(filtered.map((s) => s.vehicleRegNo)).size;

  const totalBookedSeats = filtered.reduce((acc, s) => acc + (s.totalBookedSeats || 0), 0);
  const totalCapacity = filtered.reduce((acc, s) => acc + (s.seatCapacity || 40), 0);
  const totalSeatRevenue = filtered.reduce((acc, s) => acc + getScheduleFares(s).seatCol, 0);
  const totalCargoRevenue = filtered.reduce((acc, s) => acc + getScheduleFares(s).cargoCol, 0);
  const totalRevenue = totalSeatRevenue + totalCargoRevenue;

  // Group by vehicle for summary reporting
  const vehicleStatsMap: Record<
    string,
    {
      regNo: string;
      ownerName?: string;
      upTrips: number;
      downTrips: number;
      roundTrips: number;
      totalTrips: number;
      bookedSeats: number;
    }
  > = {};

  filtered.forEach((s) => {
    if (!vehicleStatsMap[s.vehicleRegNo]) {
      vehicleStatsMap[s.vehicleRegNo] = {
        regNo: s.vehicleRegNo,
        ownerName: s.vehicleOwnerName,
        upTrips: 0,
        downTrips: 0,
        roundTrips: 0,
        totalTrips: 0,
        bookedSeats: 0,
      };
    }
    if (s.direction === 'UP') {
      vehicleStatsMap[s.vehicleRegNo].upTrips += 1;
    } else {
      vehicleStatsMap[s.vehicleRegNo].downTrips += 1;
    }
    vehicleStatsMap[s.vehicleRegNo].totalTrips += 1;
    const ups = vehicleStatsMap[s.vehicleRegNo].upTrips;
    const downs = vehicleStatsMap[s.vehicleRegNo].downTrips;
    vehicleStatsMap[s.vehicleRegNo].roundTrips = Math.min(ups, downs) + (Math.abs(ups - downs) * 0.5);
    vehicleStatsMap[s.vehicleRegNo].bookedSeats += s.totalBookedSeats || 0;
  });

  const vehicleStatsList = Object.values(vehicleStatsMap);

  // Group trips by Route Number (1, 2, 3...) and sort chronologically by departure time
  type RouteTripGroup = ReturnType<typeof groupSchedulesByRouteNumber>[number];
  const upRouteGroups = groupSchedulesByRouteNumber(upTrips);
  const downRouteGroups = groupSchedulesByRouteNumber(downTrips);

  // Export CSV (Excel)
  const handleExportCSV = () => {
    const headers = [
      'তারিখ',
      'ট্রিপ নং',
      'দিক (Direction)',
      'ট্রিপ ক্রম (Sequence)',
      'ছাড়ার সময়',
      'গাড়ি নম্বর',
      'মালিকের নাম',
      'রুট',
      'সুপারভাইজার',
      'মোবাইল',
      'বুকড সিট',
      'মোট সিট',
      'টিকিট হার (৳)',
      'সিট ভাড়া আদায় (৳)',
      'মালের ভাড়া (৳)',
      'মোট টাকা (৳)',
      'স্ট্যাটাস',
    ];

    const rows = filtered.map((s) => {
      const fares = getScheduleFares(s);
      return [
        s.date,
        s.tripNo,
        s.direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ',
        s.tripSequenceLabel || '১ম ট্রিপ',
        s.departureTime,
        s.vehicleRegNo,
        s.vehicleOwnerName || 'সাধারণ',
        s.routeName,
        s.supervisor,
        s.supervisorPhone || '',
        s.totalBookedSeats || 0,
        s.seatCapacity || 40,
        s.fare,
        fares.seatCol,
        fares.cargoCol,
        fares.totalCol,
        s.status || 'scheduled',
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `trip_report_${dateMode === 'single' ? date : `${startDate}_to_${endDate}`}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const whatsappOwnerItems = useMemo<OwnerReportSummaryItem[]>(() => {
    const vehicleById = new Map<string, Vehicle>();
    const vehicleByReg = new Map<string, Vehicle>();
    vehicles.forEach((v) => {
      vehicleById.set(v.id, v);
      const norm = normalizeRegNo(v.regNo);
      if (norm) vehicleByReg.set(norm, v);
    });

    const map = new Map<string, OwnerReportSummaryItem & { _vehiclesSet: Set<string> }>();
    filtered.forEach((s) => {
      if (s.status === 'cancelled') return;
      const v = vehicleById.get(s.vehicleId) || vehicleByReg.get(normalizeRegNo(s.vehicleRegNo));
      const ownerName = (s.vehicleOwnerName || v?.ownerName || 'সাধারণ').trim();
      const ownerPhone = v?.ownerPhone || '';
      const fares = getScheduleFares(s);

      if (!map.has(ownerName)) {
        map.set(ownerName, {
          ownerName,
          ownerPhone,
          vehicles: [],
          tripCount: 0,
          bookedSeats: 0,
          seatFare: 0,
          cargoFare: 0,
          totalFare: 0,
          customLines: [],
          _vehiclesSet: new Set<string>(),
        });
      }

      const entry = map.get(ownerName)!;
      if (!entry.ownerPhone && ownerPhone) entry.ownerPhone = ownerPhone;
      if (s.vehicleRegNo) entry._vehiclesSet.add(s.vehicleRegNo);
      entry.tripCount += 1;
      entry.bookedSeats = (entry.bookedSeats || 0) + (s.totalBookedSeats || 0);
      entry.seatFare = (entry.seatFare || 0) + fares.seatCol;
      entry.cargoFare = (entry.cargoFare || 0) + fares.cargoCol;
      entry.totalFare += fares.totalCol;
      entry.customLines?.push(
        `${s.direction === 'UP' ? 'আপ' : 'ডাউন'} (${s.departureTime}) • ${s.vehicleRegNo} • ${s.routeName} • ${formatTaka(fares.totalCol)}`
      );
    });

    return Array.from(map.values()).map(({ _vehiclesSet, ...rest }) => ({
      ...rest,
      vehicles: Array.from(_vehiclesSet),
    }));
  }, [filtered, vehicles]);

  const handlePrint = () => {
    printElementById(
      'printable-trip-report',
      `দৈনিক ট্রিপ রিপোর্ট — ${dateMode === 'single' ? date : `${startDate}_to_${endDate}`}`,
      'A4-landscape'
    );
  };

  const renderPrintableTripReport = () => {
    const cellStyle: React.CSSProperties = {
      borderRight: '1px solid #475569',
      borderBottom: '1px solid #475569',
      padding: '7px 5px',
      lineHeight: 1.6,
      verticalAlign: 'middle',
      wordBreak: 'normal',
      overflowWrap: 'break-word',
    };
    const thStyle: React.CSSProperties = {
      ...cellStyle,
      padding: '8px 5px',
      lineHeight: 1.5,
      fontWeight: 800,
      backgroundColor: '#e2e8f0',
      color: '#0f172a',
    };
    const tableStyle: React.CSSProperties = {
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      borderTop: '1px solid #475569',
      borderLeft: '1px solid #475569',
      fontSize: '10px',
      lineHeight: 1.6,
      backgroundColor: '#ffffff',
      color: '#0f172a',
    };
    const dateRangeTitle =
      dateMode === 'single'
        ? `তারিখ: ${date} (${formatBengaliDate(date)})`
        : `তারিখ রেঞ্জ: ${formatBengaliDate(startDate)} হতে ${formatBengaliDate(endDate)}`;

    const renderDirectionRouteTable = (
      title: string,
      titleColor: string,
      groups: RouteTripGroup[],
      prefix: string
    ) =>
      groups.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: titleColor, marginBottom: '6px' }}>
            {title}
          </div>
          {groups.map((rg) => (
            <div key={`${prefix}-${rg.routeNumber}-${rg.routeName}`} style={{ marginBottom: '10px' }}>
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: '#0f172a',
                  backgroundColor: '#f1f5f9',
                  padding: '6px 8px',
                  borderTop: '1px solid #475569',
                  borderLeft: '1px solid #475569',
                  borderRight: '1px solid #475569',
                  lineHeight: 1.5,
                }}
              >
                {toBengaliDigits(rg.routeNumber)} নং রুট : {rg.routeName} (মোট {toBengaliDigits(rg.trips.length)} টি ট্রিপ)
              </div>
              <table className="report-table recon-compact-table" style={{ ...tableStyle, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '4.5%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '8.5%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '7.5%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9.5%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>ক্র.</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>ট্রিপ নং</th>
                    <th style={thStyle}>ছাড়ার সময়</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>গাড়ি নম্বর</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>মালিক</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>সুপারভাইজার</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>ড্রাইভার</th>
                    <th style={thStyle}>সিট</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>সিট ভাড়া</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>মালের ভাড়া</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>মোট টাকা</th>
                  </tr>
                </thead>
                <tbody>
                  {rg.trips.map((s, idx) => {
                    const fares = getScheduleFares(s);
                    return (
                      <tr key={s.id} style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                        <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700 }}>
                          {toBengaliDigits(s.serialInRoute)}
                        </td>
                        <td style={{ ...cellStyle, fontWeight: 800 }}>{s.tripNo}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700 }}>{s.departureTime}</td>
                        <td style={{ ...cellStyle, fontWeight: 700 }}>{s.vehicleRegNo}</td>
                        <td style={cellStyle}>{s.vehicleOwnerName || 'সাধারণ'}</td>
                        <td style={cellStyle}>{s.supervisor || '-'}</td>
                        <td style={cellStyle}>{s.driver || '-'}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700 }}>
                          {toBengaliDigits(s.totalBookedSeats || 0)}/{toBengaliDigits(s.seatCapacity)}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatTaka(fares.seatCol)}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatTaka(fares.cargoCol)}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                          {formatTaka(fares.totalCol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 800 }}>
                    <td colSpan={8} style={{ ...cellStyle, padding: '8px 6px', textAlign: 'right', backgroundColor: '#e2e8f0' }}>
                      রুট মোট ({toBengaliDigits(rg.trips.length)} টি ট্রিপ):
                    </td>
                    <td style={{ ...cellStyle, padding: '8px 5px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#e2e8f0' }}>
                      {formatTaka(rg.trips.reduce((sum, s) => sum + getScheduleFares(s).seatCol, 0))}
                    </td>
                    <td style={{ ...cellStyle, padding: '8px 5px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#e2e8f0' }}>
                      {formatTaka(rg.trips.reduce((sum, s) => sum + getScheduleFares(s).cargoCol, 0))}
                    </td>
                    <td style={{ ...cellStyle, padding: '8px 5px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#e2e8f0' }}>
                      {formatTaka(rg.trips.reduce((sum, s) => sum + getScheduleFares(s).totalCol, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      );

    return (
      <div
        id="printable-trip-report"
        className="p-4 sm:p-5 bg-white text-slate-900 font-sans"
        style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
      >
        <div
          className="recon-print-header"
          style={{
            textAlign: 'center',
            borderBottom: '1.5px solid #0f172a',
            paddingBottom: '8px',
            marginBottom: '10px',
          }}
        >
          <h1
            className="recon-company-name"
            style={{
              fontSize: '19px',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.35,
              margin: 0,
            }}
          >
            {user?.company?.name || 'কাউন্টার টিকেটিং'}
          </h1>
          <div
            className="recon-subtitle"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#334155',
              marginTop: '3px',
              lineHeight: 1.4,
            }}
          >
            দৈনিক ট্রিপ ও ফিরতি লগ ডাটা টেবিল • {dateRangeTitle} • মোট ট্রিপ: {toBengaliDigits(filtered.length)} টি • মোট আদায়: {formatTaka(totalRevenue)}
          </div>
        </div>

        {/* Table 1: Vehicle-wise Trip Counts */}
        {vehicleStatsList.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '5px' }}>
              ১. গাড়ি ও মালিকভিত্তিক ট্রিপ সংখ্যা সারসংক্ষেপ:
            </div>
            <table className="report-table recon-compact-table" style={{ ...tableStyle, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>ক্র.</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>গাড়ি নম্বর</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>গাড়ির মালিক</th>
                  <th style={thStyle}>আপ ট্রিপ</th>
                  <th style={thStyle}>ডাউন ট্রিপ</th>
                  <th style={thStyle}>মোট ট্রিপ</th>
                  <th style={thStyle}>বুকড সিট</th>
                </tr>
              </thead>
              <tbody>
                {vehicleStatsList.map((vs, idx) => (
                  <tr key={vs.regNo} style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                    <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700 }}>{toBengaliDigits(idx + 1)}</td>
                    <td style={{ ...cellStyle, fontWeight: 800 }}>{vs.regNo}</td>
                    <td style={cellStyle}>{vs.ownerName || 'সাধারণ'}</td>
                    <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700, color: '#1e40af' }}>
                      {toBengaliDigits(vs.upTrips)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700, color: '#065f46' }}>
                      {toBengaliDigits(vs.downTrips)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 800 }}>
                      {toBengaliDigits(vs.totalTrips)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700 }}>
                      {toBengaliDigits(vs.bookedSeats)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {renderDirectionRouteTable('২.১ আপ ট্রিপ রুটভিত্তিক তালিকা (সময় অনুযায়ী):', '#1e3a8a', upRouteGroups, 'print-up')}
        {renderDirectionRouteTable('২.২ ডাউন / ফিরতি ট্রিপ রুটভিত্তিক তালিকা (সময় অনুযায়ী):', '#065f46', downRouteGroups, 'print-dn')}

        {filtered.length === 0 && (
          <div style={{ padding: '18px', textAlign: 'center', color: '#64748b', border: '1px solid #475569', fontWeight: 600 }}>
            নির্বাচিত তারিখে কোনো ট্রিপ পাওয়া যায়নি।
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">
                দৈনিক ও তারিখভিত্তিক ট্রিপ শিডিউল এবং গাড়ি পর্যবেক্ষণ
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                আপ ও ডাউন ট্রিপে অংশগ্রহণকারী গাড়ির হিসাব, মাল্টি-ট্রিপ ট্র্যাকিং এবং পূর্ণাঙ্গ প্রিন্ট ও এক্সেল রিপোর্ট
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canManageTrips && (
            <button
              type="button"
              onClick={() => setShowForwardModal(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="গতকালের আপ ট্রিপ আজকের বা নির্ধারিত তারিখে ফরোয়ার্ড করুন"
            >
              <Forward className="w-4 h-4" />
              <span>গতকালের আপ ট্রিপ ফরোয়ার্ড</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchSchedules}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => downloadDailyTripsPDF(schedules, dateMode === 'single' ? date : `${startDate}_to_${endDate}`)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="শুধু ডাটা টেবিল পিডিএফ ডাউনলোড"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>টেবিল PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>এক্সেল (.CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowWhatsAppModal(true)}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="মালিকদের মোবাইলে হোয়াটসঅ্যাপে হিসাব পাঠান"
          >
            <MessageCircle className="w-4 h-4" />
            <span>হোয়াটসঅ্যাপ (মালিক)</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="শুধু টেবিল প্রিন্ট"
          >
            <Printer className="w-4 h-4" />
            <span>শুধু টেবিল প্রিন্ট</span>
          </button>

          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>প্রিন্ট ভিউ</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Bar (Single Date vs Date Range, Direction, Vehicle, Search) */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Mode Switch: Single Date vs Date-to-Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-emerald-600" />
              তারিখের ফিল্টার:
            </span>
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
              <button
                type="button"
                onClick={() => setDateMode('single')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateMode === 'single'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                একক তারিখ
              </button>
              <button
                type="button"
                onClick={() => setDateMode('range')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateMode === 'range'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                তারিখ টু তারিখ (রেঞ্জ)
              </button>
            </div>
          </div>

          {/* Direction Filter Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => setDirectionTab('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                directionTab === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              উভয় দিক (ALL)
            </button>
            <button
              type="button"
              onClick={() => setDirectionTab('UP')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                directionTab === 'UP'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              আপ ট্রিপ
            </button>
            <button
              type="button"
              onClick={() => setDirectionTab('DOWN')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                directionTab === 'DOWN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ডাউন ট্রিপ
            </button>
            <button
              type="button"
              onClick={() => setDirectionTab('PENDING_RETURN')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                directionTab === 'PENDING_RETURN'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>ফিরতি বাকি</span>
              {pendingReturnTrips.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    directionTab === 'PENDING_RETURN'
                      ? 'bg-white text-amber-700'
                      : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {toBengaliDigits(pendingReturnTrips.length)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Inputs row: Dates & Vehicle Select & Search */}
        <div className="flex flex-wrap items-center gap-3">
          {dateMode === 'single' ? (
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
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span className="text-slate-500 text-[11px]">শুরু:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
                />
              </div>
              <span className="text-xs text-slate-400 font-bold">হতে</span>
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span className="text-slate-500 text-[11px]">শেষ:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
                />
              </div>
            </div>
          )}

          {/* Vehicle Filter Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">
            <Bus className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 text-[11px]">গাড়ি ফিল্টার:</span>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold text-slate-800"
            >
              <option value="ALL">সকল গাড়ি ({vehicles.length} টি)</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.regNo}>
                  {v.regNo} ({v.ownerName || 'সাধারণ'})
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ট্রিপ নং, গাড়ি, মালিক বা সুপারভাইজার..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Up & Down Trip Analytics / KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* UP Trip KPI */}
        <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
              আপ ট্রিপ (UP Trips)
            </span>
            <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              UP
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(upTrips.length)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি ট্রিপ সম্পন্ন</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span>অংশগ্রহণকারী গাড়ি:</span>
            <strong className="text-blue-800 font-bold">{toBengaliDigits(uniqueUpVehicles)} টি অনন্য বাস</strong>
          </div>
        </div>

        {/* DOWN Trip KPI */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
              ডাউন ট্রিপ (DOWN Trips)
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              DN
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(downTrips.length)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি ট্রিপ সম্পন্ন</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span>অংশগ্রহণকারী গাড়ি:</span>
            <strong className="text-emerald-800 font-bold">{toBengaliDigits(uniqueDownVehicles)} টি অনন্য বাস</strong>
          </div>
        </div>

        {/* Overall Fleet Activity */}
        <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">
              মোট সক্রিয় গাড়ি ও ট্রিপ
            </span>
            <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
              <Bus className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(filtered.length)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি মোট ট্রিপ</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
            <span>চলমান মোট গাড়ি:</span>
            <strong className="text-purple-800 font-bold">{toBengaliDigits(totalUniqueVehicles)} টি গাড়ি</strong>
          </div>
        </div>

        {/* Passenger & Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
              যাত্রী ও মোট ভাড়া আদায়
            </span>
            <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{toBengaliDigits(totalBookedSeats)}</span>
            <span className="text-xs text-slate-500 font-semibold">টি বুকড সিট</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>মোট আদায় (সিট+মাল):</span>
              <strong className="text-emerald-800 font-black tabular-nums">{formatTaka(totalRevenue)}</strong>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>সিট: {formatTaka(totalSeatRevenue)}</span>
              <span>মাল: {formatTaka(totalCargoRevenue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Success Alert */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMsg('')}
            className="text-emerald-700 hover:text-emerald-900 font-black px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Arrived Vehicles with Pending Return Legs (ফিরতি বাকি — ঢাকায় আসা গাড়ি) */}
      {pendingReturnTrips.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200/90 shadow-xs overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-5 py-3.5 border-b border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <span>ফিরতি বাকি — ঢাকায় আসা গাড়ি</span>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                    {toBengaliDigits(pendingReturnTrips.length)} টি বাকি
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                &quot;ফিরতি ট্রিপ&quot; চেপে ডাউন রুট, তারিখ ও সময় দিন। আপ ও ডাউন মিলে ওই গাড়ির ১টি পূর্ণাঙ্গ ট্রিপ কাউন্ট হবে।
              </p>
            </div>
            <div className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 shrink-0">
              ১টি আপ + ১টি ডাউন = ১টি পূর্ণাঙ্গ ট্রিপ
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left">গাড়ি নম্বর ও মালিক</th>
                  <th className="px-4 py-2.5 text-left">আপ রুট ও ট্রিপ নং</th>
                  <th className="px-4 py-2.5 text-left">সুপারভাইজার</th>
                  <th className="px-4 py-2.5 text-center">আগমনের সময়</th>
                  <th className="px-4 py-2.5 text-center">স্ট্যাটাস</th>
                  <th className="px-4 py-2.5 text-right">পদক্ষেপ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingReturnTrips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-black text-slate-900">
                      <div>{trip.vehicleRegNo}</div>
                      {trip.vehicleOwnerName && (
                        <span className="text-[10px] text-slate-500 font-sans font-normal">
                          {trip.vehicleOwnerName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      <div className="font-semibold text-slate-800">{trip.routeName}</div>
                      <div className="text-[10px] text-blue-600 font-mono font-bold">{trip.tripNo}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {trip.supervisor}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 font-mono">
                      {trip.departureTime}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                        <span>ফিরতি বাকি</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenReturnModal(trip)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs hover:shadow-md transition-all inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>➔ ফিরতি ট্রিপ</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schedules Cards / Excel Table View */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <span>ট্রিপের পূর্ণাঙ্গ তালিকা</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {toBengaliDigits(filtered.length)} টি ট্রিপ
          </span>
        </h3>

        {/* View Toggle */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setDisplayMode('excel')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              displayMode === 'excel'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>এক্সেল শিট ভিউ</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('weekly')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              displayMode === 'weekly'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>সাপ্তাহিক ক্যালেন্ডার</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('cards')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              displayMode === 'cards'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>কার্ড ভিউ</span>
          </button>
        </div>
      </div>

      {/* WEEKLY CALENDAR TIMELINE VIEW */}
      {displayMode === 'weekly' ? (
        <WeeklyScheduleTimeline
          schedules={filtered}
          vehicles={vehicles}
          supervisorsList={supervisorsList}
          weekStartDate={weekStartDate}
          onChangeWeekStartDate={setWeekStartDate}
          canManageTrips={canManageTrips}
          loading={loading}
          onReassignTrip={handleReassignTrip}
          onSelectTripForBooking={onSelectTripForBooking}
        />
      ) : displayMode === 'excel' ? (
        <div className="space-y-8">
          {/* Helper function to render a route table */}
          {(() => {
            const renderRouteTable = (group: RouteTripGroup, direction: 'UP' | 'DOWN') => {
              const groupTotals = group.trips.reduce(
                (acc, sch) => {
                  const fares = getScheduleFares(sch);
                  acc.seats += sch.totalBookedSeats || 0;
                  acc.seatCol += fares.seatCol;
                  acc.cargoCol += fares.cargoCol;
                  acc.totalCol += fares.totalCol;
                  return acc;
                },
                { seats: 0, seatCol: 0, cargoCol: 0, totalCol: 0 }
              );

              return (
                <div
                  key={`${direction}-${group.routeNumber}`}
                  className="mb-6 bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden"
                >
                  {/* Route Header Banner */}
                  <div
                    className={`px-4 py-2.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      direction === 'UP'
                        ? 'bg-blue-50/90 border-blue-200 text-blue-900'
                        : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded text-xs font-black text-white shadow-2xs ${
                          direction === 'UP' ? 'bg-blue-700' : 'bg-emerald-700'
                        }`}
                      >
                        {toBengaliDigits(group.routeNumber)} নং রুট
                      </span>
                      <h4 className="font-bold text-sm tracking-wide">
                        {group.routeName}
                      </h4>
                    </div>
                    <div className="text-xs font-semibold flex items-center gap-2">
                      <span className="text-slate-500 font-normal">রুট ট্রিপ সংখ্যা:</span>
                      <strong className="px-2 py-0.5 bg-white rounded-md border border-slate-200 shadow-2xs">
                        {toBengaliDigits(group.trips.length)} টি
                      </strong>
                      <span className="text-[11px] text-slate-500 hidden sm:inline">(সময় অনুযায়ী ১, ২, ৩ ক্রমিক)</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[11px]">
                          <th className="py-2.5 px-2.5 border-r border-slate-300 text-center w-12">সিরিয়াল</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300">ট্রিপ নং</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300">ছাড়ার সময়</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300">গাড়ি নম্বর</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300">মালিকের নাম</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300">সুপারভাইজার</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300">ড্রাইভার</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300 text-center">সিট বুকিং</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300 text-right bg-blue-50/70">সিট ভাড়া</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300 text-right bg-amber-50/70">মালের ভাড়া</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300 text-right bg-emerald-50/80 font-black">মোট টাকা</th>
                          <th className="py-2.5 px-2.5 border-r border-slate-300 text-center">ফিরতি / সমন্বয়</th>
                          <th className="py-2.5 px-2.5 text-right">পদক্ষেপ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        {group.trips.map((sch) => {
                          const booked = sch.totalBookedSeats || 0;
                          const percent = Math.round((booked / sch.seatCapacity) * 100);
                          const fares = getScheduleFares(sch);

                          return (
                            <tr key={sch.id} className="hover:bg-blue-50/40 transition-colors">
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center font-mono font-bold text-slate-800 bg-slate-50/60">
                                {toBengaliDigits(sch.serialInRoute)}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 font-mono font-bold text-slate-900">
                                {sch.tripNo}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200">
                                <span className="font-bold text-slate-900 text-xs px-2 py-0.5 rounded bg-slate-100 font-mono">
                                  {sch.departureTime}
                                </span>
                                <span className="text-[10px] text-slate-500 block font-normal mt-0.5">
                                  {sch.date}
                                </span>
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 font-bold text-slate-900">
                                <div>{sch.vehicleRegNo}</div>
                                <span className="text-[10px] text-slate-500 font-normal">
                                  {toBengaliDigits(sch.seatCapacity)} সিট · ৳{toBengaliDigits(sch.fare)}
                                </span>
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700">
                                {sch.vehicleOwnerName || 'সাধারণ'}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-slate-800">
                                <div>{sch.supervisor || 'অনির্ধারিত'}</div>
                                {sch.supervisorPhone && (
                                  <div className="text-[10px] text-slate-500">{sch.supervisorPhone}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-slate-800">
                                {sch.driver || 'অনির্ধারিত'}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center">
                                <div className="font-bold text-slate-800">
                                  {toBengaliDigits(booked)}/{toBengaliDigits(sch.seatCapacity)}
                                </div>
                                <div className="text-[10px] text-slate-500 font-semibold">
                                  {toBengaliDigits(percent)}% পূর্ণ
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-right font-bold text-blue-800 bg-blue-50/20 tabular-nums whitespace-nowrap">
                                {formatTaka(fares.seatCol)}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-right font-bold text-amber-800 bg-amber-50/20 tabular-nums whitespace-nowrap">
                                {formatTaka(fares.cargoCol)}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-right font-black text-emerald-800 bg-emerald-50/30 tabular-nums whitespace-nowrap">
                                {formatTaka(fares.totalCol)}
                              </td>
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center">
                                {sch.direction === 'UP' && !sch.returnTripCreated && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReturnModal(sch)}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold shadow-xs cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <span>➔ ফিরতি ট্রিপ</span>
                                  </button>
                                )}
                                {sch.direction === 'UP' && sch.returnTripCreated && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                                    <span>১টি পূর্ণাঙ্গ ট্রিপ সম্পন্ন</span>
                                  </span>
                                )}
                                {sch.direction === 'DOWN' && sch.linkedTripId && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
                                    <ArrowRight className="w-3 h-3 text-blue-600" />
                                    <span>ফিরতি ডাউন (সমন্বয়কৃত)</span>
                                  </span>
                                )}
                                {sch.direction === 'DOWN' && !sch.linkedTripId && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                    স্বতন্ত্র ডাউন
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onSelectTripForBooking) onSelectTripForBooking(sch.id);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-xs cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Armchair className="w-3 h-3" />
                                    <span>বুকিং</span>
                                  </button>
                                  {canManageTrips && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEdit(sch)}
                                        className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                        title="এডিট"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTrip(sch)}
                                        className="p-1 text-rose-600 hover:bg-rose-100 rounded transition-colors"
                                        title="মুছে ফেলুন"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs text-slate-900">
                        <tr>
                          <td colSpan={7} className="py-2 px-3 border-r border-slate-300 text-right">
                            রুট মোট ({toBengaliDigits(group.trips.length)} টি ট্রিপ):
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-300 text-center tabular-nums">
                            {toBengaliDigits(groupTotals.seats)} সিট
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-300 text-right text-blue-900 bg-blue-50/70 tabular-nums whitespace-nowrap">
                            {formatTaka(groupTotals.seatCol)}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-300 text-right text-amber-900 bg-amber-50/70 tabular-nums whitespace-nowrap">
                            {formatTaka(groupTotals.cargoCol)}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-300 text-right text-emerald-950 bg-emerald-100/70 tabular-nums whitespace-nowrap">
                            {formatTaka(groupTotals.totalCol)}
                          </td>
                          <td colSpan={2} className="py-2 px-2.5 text-center text-[10px] text-slate-500">
                            সিট + মাল = মোট
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            };

            return (
              <>
                {/* 1. UP Trips List */}
                {(directionTab === 'ALL' || directionTab === 'UP') && (
                  <div>
                    <div className="flex items-center justify-between pb-2.5 mb-4 border-b-2 border-blue-600">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3.5 h-3.5 rounded-full bg-blue-600 shadow-xs" />
                        <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                          ১. আপ ট্রিপ পূর্ণাঙ্গ তালিকা
                        </h3>
                        <span className="px-3 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
                          {toBengaliDigits(upTrips.length)} টি ট্রিপ
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
                        রুট অনুযায়ী ১ নং, ২ নং ও ছাড়ার সময় অনুযায়ী ক্রমানুসারে (১, ২, ৩...)
                      </span>
                    </div>

                    {upRouteGroups.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
                        কোনো আপ ট্রিপ শিডিউল পাওয়া যায়নি।
                      </div>
                    ) : (
                      upRouteGroups.map((group) => renderRouteTable(group, 'UP'))
                    )}
                  </div>
                )}

                {/* 2. DOWN Trips List */}
                {(directionTab === 'ALL' || directionTab === 'DOWN') && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between pb-2.5 mb-4 border-b-2 border-emerald-600">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 shadow-xs" />
                        <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                          ২. ডাউন ট্রিপ পূর্ণাঙ্গ তালিকা
                        </h3>
                        <span className="px-3 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {toBengaliDigits(downTrips.length)} টি ট্রিপ
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
                        রুট অনুযায়ী ১ নং, ২ নং ও ছাড়ার সময় অনুযায়ী ক্রমানুসারে (১, ২, ৩...)
                      </span>
                    </div>

                    {downRouteGroups.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
                        কোনো ডাউন ট্রিপ শিডিউল পাওয়া যায়নি।
                      </div>
                    ) : (
                      downRouteGroups.map((group) => renderRouteTable(group, 'DOWN'))
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 text-xs text-slate-400">
              নির্বাচিত ফিল্টারে কোনো ট্রিপ শিডিউল পাওয়া যায়নি।
            </div>
          ) : (
            filtered.map((sch) => {
              const booked = sch.totalBookedSeats || 0;
              const available = sch.seatCapacity - booked;
              const percent = Math.round((booked / sch.seatCapacity) * 100);

              return (
                <div
                  key={sch.id}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* Top Header of Card */}
                    <div className="flex items-center justify-between pb-3 border-b">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-9 h-9 rounded-2xl font-black text-xs flex items-center justify-center text-white ${
                            sch.direction === 'UP' ? 'bg-blue-600' : 'bg-emerald-600'
                          }`}
                        >
                          {sch.direction}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-sm text-slate-900">{sch.tripNo}</h4>
                            {sch.direction === 'UP' && sch.tripSequenceLabel && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                {sch.tripSequenceLabel}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">তারিখ: {sch.date}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          <span>{sch.departureTime}</span>
                        </span>
                      </div>
                    </div>

                    {/* Details Body */}
                    <div className="py-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">গাড়ি নম্বর:</span>
                        <span className="font-black text-slate-900">{sch.vehicleRegNo}</span>
                      </div>

                      {sch.vehicleOwnerName && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">গাড়ির মালিক:</span>
                          <span className="font-semibold text-slate-800">{sch.vehicleOwnerName}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">রুট:</span>
                        <span className="font-semibold text-slate-700 truncate max-w-[190px]">
                          {sch.routeName}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">সুপারভাইজার:</span>
                        <span className="font-medium text-slate-800">
                          {sch.supervisor} {sch.supervisorPhone ? `(${sch.supervisorPhone})` : ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">টিকিট হার:</span>
                        <span className="font-bold text-slate-800">{formatTaka(sch.fare)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px]">
                        {(() => {
                          const fares = getScheduleFares(sch);
                          return (
                            <>
                              <div className="bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 text-center">
                                <span className="block text-[9.5px] text-blue-700">সিট ভাড়া</span>
                                <strong className="text-blue-900 font-bold tabular-nums">{formatTaka(fares.seatCol)}</strong>
                              </div>
                              <div className="bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 text-center">
                                <span className="block text-[9.5px] text-amber-700">মালের ভাড়া</span>
                                <strong className="text-amber-900 font-bold tabular-nums">{formatTaka(fares.cargoCol)}</strong>
                              </div>
                              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 text-center">
                                <span className="block text-[9.5px] text-emerald-700">মোট টাকা</span>
                                <strong className="text-emerald-900 font-black tabular-nums">{formatTaka(fares.totalCol)}</strong>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Return Trip / Round Trip Status Banner */}
                      {sch.direction === 'UP' && !sch.returnTripCreated && (
                        <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-2xl border border-amber-200">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <span>ফিরতি বাকি (ঢাকায় আসা)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenReturnModal(sch)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-black shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                          >
                            <span>➔ ফিরতি ট্রিপ</span>
                          </button>
                        </div>
                      )}

                      {sch.direction === 'UP' && sch.returnTripCreated && (
                        <div className="flex items-center gap-1.5 p-2 bg-emerald-50 text-emerald-800 rounded-2xl text-[11px] font-bold border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>১টি পূর্ণাঙ্গ রাউন্ড ট্রিপ সম্পন্ন (আপ + ফিরতি ডাউন)</span>
                        </div>
                      )}

                      {sch.direction === 'DOWN' && sch.linkedTripId && (
                        <div className="flex items-center gap-1.5 p-2 bg-blue-50 text-blue-800 rounded-2xl text-[11px] font-bold border border-blue-200">
                          <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                          <span>ফিরতি ডাউন ট্রিপ (পূর্ণাঙ্গ ট্রিপের অংশ)</span>
                        </div>
                      )}

                      {sch.isNightHold && (
                        <div className="flex items-center gap-1.5 p-2 bg-purple-50 text-purple-700 rounded-2xl text-[11px] font-semibold border border-purple-200">
                          <Moon className="w-3.5 h-3.5" />
                          <span>রাত্রীকালীন হোল্ড ট্রিপ</span>
                        </div>
                      )}
                    </div>

                    {/* Capacity Progress */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span>
                          বুকড: <strong>{toBengaliDigits(booked)}</strong>/{toBengaliDigits(sch.seatCapacity)} সিট
                        </span>
                        <span className="font-semibold">{toBengaliDigits(percent)}% পূর্ণ</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {canManageTrips && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(sch)}
                          className="px-2.5 py-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          title="ট্রিপ তথ্য পরিবর্তন করুন"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>এডিট</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTrip(sch)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          title="ট্রিপ মুছে ফেলুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectTripForBooking) {
                          onSelectTripForBooking(sch.id);
                        }
                      }}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Armchair className="w-3.5 h-3.5" />
                      <span>সিট বুকিং</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Return Trip Quick Modal (ফিরতি ট্রিপ তৈরি) */}
      {returnModalTrip && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  ফিরতি ট্রিপ তৈরি (ডাউন ট্রিপ)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  গাড়ি: <strong className="text-slate-900 font-mono">{returnModalTrip.vehicleRegNo}</strong> · আপ ট্রিপ: {returnModalTrip.tripNo} ({returnModalTrip.routeName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalTrip(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReturnTrip} className="space-y-4 mt-4">
              {/* 1. Return Route Selector (Essential because a bus can return via a different route) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ১. ফিরতি রুট নির্বাচন করুন (রুট নং অনুযায়ী) *
                </label>
                {routesList.filter((r) => r.status === 'active').length > 0 ? (
                  <select
                    value={returnRouteId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setReturnRouteId(nextId);
                      const chosen = routesList.find((r) => r.id === nextId);
                      if (chosen?.baseFare) {
                        setReturnFare(chosen.baseFare);
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">রুট নির্বাচন করুন</option>
                    {routesList.some((r) => r.status === 'active' && r.direction === 'DOWN') && (
                      <optgroup label="ডাউন রুটসমূহ (ঢাকা ➜ মাদারীপুর)">
                        {routesList
                          .filter((r) => r.status === 'active' && r.direction === 'DOWN')
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.routeNumber ? `${toBengaliDigits(r.routeNumber)} নং রুট — ` : ''}{r.name} {r.baseFare ? `(৳${toBengaliDigits(r.baseFare)})` : ''}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {routesList.some((r) => r.status === 'active' && r.direction !== 'DOWN') && (
                      <optgroup label="অন্যান্য সক্রিয় রুট (রুট পরিবর্তন হলে)">
                        {routesList
                          .filter((r) => r.status === 'active' && r.direction !== 'DOWN')
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.routeNumber ? `${toBengaliDigits(r.routeNumber)} নং রুট — ` : ''}{r.name} ({r.direction === 'UP' ? 'আপ' : r.direction})
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                ) : (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                    কোনো ডাউন রুট পাওয়া যায়নি; রুট ম্যানেজমেন্ট থেকে রুট যোগ করুন।
                  </div>
                )}
              </div>

              {/* 2. Return Date with Calendar & Quick Day Buttons */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>২. ফিরতি ট্রিপের তারিখ *</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReturnDate(getTodayDhakaDate())}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                        returnDate === getTodayDhakaDate()
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      আজকে
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnDate(addDaysToDateStr(getTodayDhakaDate(), 1))}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                        returnDate === addDaysToDateStr(getTodayDhakaDate(), 1)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      আগামীকাল
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300">
                  <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    required
                  />
                  <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap shrink-0">
                    {formatBengaliDate(returnDate)}
                  </span>
                </div>
              </div>

              {/* 3. Departure Time with Digital Clock */}
              <DigitalClockPicker
                value={returnTime}
                onChange={setReturnTime}
                label="৩. ফিরতি ছাড়ার সময় ও তারিখ নির্ধারণের ঘড়ি"
              />

              {/* 4. Supervisor & Driver */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    সুপারভাইজার
                  </label>
                  {supervisorsList.length > 0 ? (
                    <select
                      value={returnSupervisor}
                      onChange={(e) => setReturnSupervisor(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">সুপারভাইজার নির্বাচন করুন</option>
                      {supervisorsList.map((sup) => (
                        <option key={sup.id} value={sup.name}>
                          {sup.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={returnSupervisor}
                      onChange={(e) => setReturnSupervisor(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white"
                      placeholder="সুপারভাইজারের নাম"
                      required
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ড্রাইভার
                  </label>
                  {driversList.length > 0 ? (
                    <select
                      value={returnDriver}
                      onChange={(e) => setReturnDriver(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">ড্রাইভার নির্বাচন করুন</option>
                      {driversList.map((drv) => (
                        <option key={drv.id} value={drv.name}>
                          {drv.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={returnDriver}
                      onChange={(e) => setReturnDriver(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white"
                      placeholder="ড্রাইভারের নাম"
                    />
                  )}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-2xl border border-blue-200 text-xs text-blue-900 space-y-1">
                <div className="font-bold">১টি পূর্ণাঙ্গ ট্রিপ হিসাব</div>
                <p className="text-[11px] text-blue-800">
                  এই ডাউন ট্রিপটি তৈরি হলে পূর্ববর্তী আপ ট্রিপের সাথে সংযুক্ত হয়ে যাবে এবং ওই গাড়ির ১টি পূর্ণাঙ্গ ট্রিপ হিসেবে কাউন্ট হবে।
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setReturnModalTrip(null)}
                  className="px-4 py-2 border rounded-xl text-xs text-slate-600 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={creatingReturn}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {creatingReturn ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>তৈরি হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <span>ফিরতি ট্রিপ তৈরি ও বুকিং শুরু</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Schedule Modal (Using DigitalClockPicker!) */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              ট্রিপ তথ্য পরিবর্তন ({editingSchedule.tripNo})
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              পরিবর্তনটি পরিবর্তনের ইতিহাসে (Audit Log) সংরক্ষিত হবে এবং সকল বুকিং কাউন্টারে তাৎক্ষণিক আপডেট হবে।
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Auto Digital Clock Picker Component */}
              <DigitalClockPicker
                value={editTime}
                onChange={setEditTime}
                label="ছাড়ার সময় নির্ধারণ (অটো ডিজিটাল ঘড়ি)"
              />

              {routesList.filter((r) => r.status === 'active').length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">রুট পরিবর্তন</label>
                  <select
                    value={editRouteId}
                    onChange={(e) => setEditRouteId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white"
                  >
                    <option value="">বর্তমান রুট ({editingSchedule.routeName})</option>
                    {routesList
                      .filter((r) => r.status === 'active')
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.routeNumber ? `${toBengaliDigits(r.routeNumber)} নং রুট — ` : ''}{r.name} ({r.direction === 'UP' ? 'আপ' : 'ডাউন'})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">সুপারভাইজার</label>
                {supervisorsList.length > 0 ? (
                  <select
                    value={editSupervisor ?? ''}
                    onChange={(e) => setEditSupervisor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white"
                    required
                  >
                    <option value="">সুপারভাইজার নির্বাচন করুন</option>
                    {supervisorsList.map((sup) => (
                      <option key={sup.id} value={sup.name}>
                        {sup.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editSupervisor ?? ''}
                    onChange={(e) => setEditSupervisor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ভাড়া (৳)</label>
                <input
                  type="number"
                  value={editFare ?? ''}
                  onChange={(e) => setEditFare(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  পরিবর্তনের কারণ (কাউন্টারদের সতর্কতা দেখাতে)
                </label>
                <textarea
                  value={editReason ?? ''}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="যেমন: ট্রাফিক জ্যাম বা যান্ত্রিক কারণে সময় পরিবর্তন করা হয়েছে।"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="px-4 py-2 border rounded-xl text-xs text-slate-600 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* PDF & Printable Table-Only Report Modal */}
      {showReportModal ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-6xl w-full p-5 max-h-[92vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b print:hidden">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <span>দৈনিক ট্রিপ ও ফিরতি লগ — শুধু টেবিল প্রিভিউ</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadDailyTripsPDF(schedules, dateMode === 'single' ? date : `${startDate}_to_${endDate}`)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>টেবিল PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>শুধু টেবিল প্রিন্ট</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  বন্ধ
                </button>
              </div>
            </div>

            {renderPrintableTripReport()}
          </div>
        </div>
      ) : (
        <div className="hidden print:block">
          {renderPrintableTripReport()}
        </div>
      )}

      {/* Forward Yesterday's UP Trips Modal */}
      <ForwardUpTripsModal
        isOpen={showForwardModal}
        defaultTargetDate={dateMode === 'single' ? date : getTodayDhakaDate()}
        onClose={() => setShowForwardModal(false)}
        onForwarded={async (targetDate, createdCount) => {
          setDateMode('single');
          setDate(targetDate);
          setDirectionTab('ALL');
          setActionSuccessMsg(
            `সফল! ${formatBengaliDate(targetDate)} তারিখের জন্য ${toBengaliDigits(createdCount)}টি আপ ট্রিপ ফরোয়ার্ড করে যুক্ত করা হয়েছে।`
          );
          await fetchSchedules();
        }}
      />

      {/* Owner WhatsApp Reporting Modal */}
      <OwnerWhatsAppModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        companyName={user?.company?.name || 'কাউন্টার টিকেটিং'}
        reportTitle="দৈনিক ট্রিপ ও ফিরতি লগ"
        dateLabel={
          dateMode === 'single'
            ? `${date} (${formatBengaliDate(date)})`
            : `${startDate} হতে ${endDate}`
        }
        items={whatsappOwnerItems}
      />
    </div>
  );
};
