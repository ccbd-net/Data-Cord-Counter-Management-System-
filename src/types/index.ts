export interface Company {
  id: string;
  name: string;
  logoUrl?: string;
  address: string;
  phone: string;
  subscriptionExpiry: string; // YYYY-MM-DD
  adminLoginId: string;
  status: 'active' | 'expired' | 'suspended';
  createdAt: string;
}

export interface User {
  id: string;
  loginId: string;
  name: string;
  role: 'super_admin' | 'company_admin' | 'master_admin' | 'moderator' | 'booking_point' | 'down_counter_head';
  companyId?: string;
  company?: {
    id?: string;
    name: string;
    logoUrl?: string;
    address?: string;
    phone?: string;
    subscriptionExpiry?: string;
    status?: string;
  };
  counterId?: string;
  counterName?: string;
  counterCode?: string;
  counterColor?: string;
  counterType?: 'master_booking' | 'road_booking';
  phone: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface CompanySummaryStats {
  id: string;
  name: string;
  logoUrl?: string;
  phone: string;
  adminLoginId: string;
  subscriptionExpiry: string;
  status: 'active' | 'expired' | 'suspended';
  vehiclesCount: number;
  routesCount: number;
  supervisorsCount: number;
  driversCount: number;
  todayTripsCount: number;
}

// Supervisor is strictly a name/profile directory without login credentials
export interface Supervisor {
  id: string;
  companyId?: string;
  name: string;
  phone?: string;
  status: 'active' | 'inactive';
  totalTrips?: number; // Total completed/reconciled full trips
  rank?: number;
  createdAt: string;
}

// Driver is strictly a name/profile directory without login credentials
export interface Driver {
  id: string;
  companyId?: string;
  name: string;
  phone?: string;
  status: 'active' | 'inactive';
  totalTrips?: number; // Total completed/reconciled full trips
  rank?: number;
  createdAt: string;
}

export type CounterType = 'master_booking' | 'road_booking';
export type CounterDirection = 'UP' | 'DOWN'; // strictly UP (আপ কাউন্টার) or DOWN (ডাউন কাউন্টার)

export interface Counter {
  id: string;
  companyId?: string;
  name: string;
  code: string;
  counterType: CounterType; // 'master_booking' or 'road_booking'
  tripDirection: CounterDirection; // 'UP' (আপ ট্রিপ) or 'DOWN' (ডাউন ট্রিপ)
  address: string;
  phone: string;
  seatColor: string; // HEX color code
  status: 'active' | 'inactive';
  createdAt: string;
}

export type SeatCapacity = 42 | 46;

export interface Vehicle {
  id: string;
  companyId?: string;
  regNo: string;
  seatCapacity: SeatCapacity;
  ownerName: string; // গাড়ি মালিকের নাম
  ownerPhone?: string; // মালিকের ফোন নম্বর
  model?: string; // ঐচ্ছিক
  status: 'active' | 'maintenance' | 'inactive';
  notes?: string;
  createdAt: string;
}

export interface RouteItem {
  id: string;
  companyId?: string;
  name: string;
  origin: string;
  destination: string;
  intermediateStops: string[];
  direction: 'UP' | 'DOWN'; // strictly UP (আপ রুট) or DOWN (ডাউন রুট)
  baseFare?: number;
  distanceKm?: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export type TripDirection = 'UP' | 'DOWN'; // UP: Madaripur to Dest, DOWN: Dest to Madaripur

export interface Schedule {
  id: string;
  companyId?: string;
  tripNo: string;
  date: string; // YYYY-MM-DD
  departureTime: string; // e.g. "06:30 AM"
  vehicleId: string;
  vehicleRegNo: string;
  vehicleOwnerName?: string; // গাড়ি মালিকের নাম
  tripSequenceOnDay?: number; // একই দিনে এই গাড়ির ট্রিপ নম্বর (১, ২, ৩...)
  tripSequenceLabel?: string; // '১ম ট্রিপ', '২য় ট্রিপ', '৩য় ট্রিপ'...
  seatCapacity: SeatCapacity;
  routeId: string;
  routeName: string;
  supervisor: string;
  supervisorPhone?: string;
  driver?: string; // ড্রাইভারের নাম
  direction: TripDirection;
  fare: number;
  isNightHold: boolean;
  nightHoldNextDate?: string; // YYYY-MM-DD for linked next-day down trip
  status: 'scheduled' | 'running' | 'completed' | 'cancelled';
  reconciled: boolean;
  reconciliationId?: string;
  totalBookedSeats: number;
  totalCollection: number;
  linkedTripId?: string; // রাউন্ড ট্রিপ পেয়ার আইডি
  returnTripCreated?: boolean; // আপ ট্রিপের ফিরতি ট্রিপ তৈরি হয়েছে কিনা
  roundTripPairTripNo?: string; // পেয়ার করা ফিরতি ট্রিপের ট্রিপ নম্বর
  lastTripUpdateAt?: string;
  lastTripUpdateReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleDetail {
  schedule: Schedule;
  bookings: Booking[];
  validSeats?: string[];
  seats?: Record<string, any>;
}

export interface Booking {
  id: string;
  companyId?: string;
  ticketNo: string;
  scheduleId: string;
  tripNo: string;
  tripDate: string;
  tripTime: string;
  vehicleRegNo: string;
  routeName: string;
  direction: TripDirection;
  counterId: string;
  counterName: string;
  counterCode: string;
  counterColor: string;
  bookedByUserId: string;
  bookedByUserName: string;
  passengerName: string;
  passengerPhone: string;
  boardingPoint: string;
  destination: string;
  seatNumbers: string[];
  totalSeats: number;
  farePerSeat: number;
  totalFare: number;
  status: 'booked' | 'cancelled';
  bookedAt: string;
  printedCount: number;
  lastPrintedAt?: string;
}

export interface Reconciliation {
  id: string;
  companyId?: string;
  reconNo: string;
  operationalDate: string;
  vehicleId: string;
  vehicleRegNo: string;
  routeName: string;
  supervisor: string;
  driver?: string;
  upTripId?: string;
  upTripNo?: string;
  downTripId?: string;
  downTripNo?: string;
  upCollection: number;
  downCollection: number;
  combinedCollection: number; // upCollection + downCollection
  status: 'completed' | 'pending' | 'flagged';
  isNightHoldMatch: boolean;
  notes?: string;
  reconciledBy: string;
  reconciledAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  role: string;
  actionType: string;
  entityType: string;
  entityId: string;
  details: string;
  tripIdAffected?: string;
  previousValues?: any;
  newValues?: any;
}

export interface SystemSettings {
  companyName: string;
  subTitle: string;
  hotline: string;
  defaultFare: number;
  noticeText: string;
  currency: string;
  timezone: string;
}

export interface AnalyticsSummary {
  totalBookings: number;
  seatsSold: number;
  ticketSales: number;
  activeTrips: number;
  totalCollections: number;
  unreconciledTrips: number;
  vehicleWiseCollections: Array<{
    regNo: string;
    upCollection: number;
    downCollection: number;
    total: number;
  }>;
  counterWiseSales: Array<{
    counterId?: string;
    counterName: string;
    counterCode: string;
    seatColor: string;
    seatsSold: number;
    totalRevenue: number;
  }>;
}

export interface WeeklyTrendDay {
  date: string; // YYYY-MM-DD
  dayShortBn: string;
  dayFullBn: string;
  ticketSalesAmount: number;
  ticketsCount: number;
  seatsSold: number;
  fuelExpenseAmount: number;
  fuelLiters: number;
  netBalance: number;
}

export interface WeeklyTrendsSummary {
  startDate: string;
  endDate: string;
  days: WeeklyTrendDay[];
  totals: {
    totalTicketSales: number;
    totalFuelExpense: number;
    totalNetBalance: number;
    totalTicketsCount: number;
    totalSeatsSold: number;
    totalFuelLiters: number;
    fuelToSalesRatio: number;
  };
}

export interface FuelEntry {
  id: string;
  companyId?: string;
  reconciliationId?: string;
  vehicleId?: string;
  serialNo?: string;
  date: string;
  dayOfWeek: string;
  time: string;
  vehicleRegNo: string;
  direction: string;
  route: string;
  supervisor: string;
  driver: string;
  totalKm: number;
  mileage: number;
  expectedFuelLiters: number;
  actualFuelLiters: number;
  fuelRatePerLiter: number;
  totalCost: number;
  fuelDifference: number;
  notes?: string;
  createdAt: string;
}

export interface FuelSettings {
  commonMileage: number;
  fuelPricePerLiter: number;
}
