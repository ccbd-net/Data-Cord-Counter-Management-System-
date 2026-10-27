import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  User,
  Counter,
  Vehicle,
  RouteItem,
  Schedule,
  Booking,
  Reconciliation,
  AuditLog,
  SystemSettings,
  Company,
  Supervisor,
  Driver,
} from '../src/types/index.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface DatabaseSchema {
  companies: (Company & { adminPinHash: string; adminPinSalt: string })[];
  users: (User & { pinHash: string; pinSalt: string })[];
  supervisors: Supervisor[];
  drivers: Driver[];
  counters: Counter[];
  vehicles: Vehicle[];
  routes: RouteItem[];
  schedules: Schedule[];
  bookings: Booking[];
  reconciliations: Reconciliation[];
  auditLogs: AuditLog[];
  settings: SystemSettings;
}

export function hashPin(pin: string, salt: string): string {
  return crypto.pbkdf2Sync(pin, salt, 1000, 32, 'sha256').toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  const calculated = hashPin(pin, salt);
  return calculated === hash;
}

// Seat Generation Utility for 42 & 46 seats
export function generateValidSeatList(capacity: 42 | 46): string[] {
  const seats: string[] = [];
  if (capacity === 42) {
    // A to I (9 rows of 4 seats = 36)
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    for (const r of rows) {
      seats.push(`${r}1`, `${r}2`, `${r}3`, `${r}4`);
    }
    // J row has 5 seats (36 + 5 = 41)
    seats.push('J1', 'J2', 'J3', 'J4', 'J5');
    // plus EX-1 (41 + 1 = 42)
    seats.push('EX-1');
  } else {
    // 46 seats: A to J (10 rows of 4 seats = 40)
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    for (const r of rows) {
      seats.push(`${r}1`, `${r}2`, `${r}3`, `${r}4`);
    }
    // K row has 5 seats (40 + 5 = 45)
    seats.push('K1', 'K2', 'K3', 'K4', 'K5');
    // plus EX-1 (45 + 1 = 46)
    seats.push('EX-1');
  }
  return seats;
}

function getTodayDhakaDate(): string {
  // Asia/Dhaka is UTC+6
  const now = new Date();
  const dhakaTime = new Date(now.getTime() + 6 * 3600 * 1000);
  return dhakaTime.toISOString().split('T')[0];
}

function getInitialDatabase(): DatabaseSchema {
  const adminSalt = generateSalt();

  const users: (User & { pinHash: string; pinSalt: string })[] = [
    {
      id: 'usr-01',
      loginId: 'admin',
      name: 'Zayem Bhuiya / জায়িম ভুইয়া',
      role: 'master_admin',
      phone: '01700-111111',
      status: 'active',
      pinHash: hashPin('1234', adminSalt),
      pinSalt: adminSalt,
      createdAt: '2026-01-01T08:00:00Z',
    },
  ];

  const settings: SystemSettings = {
    companyName: 'Counter Management System',
    subTitle: 'কাউন্টার বুকিং ও ট্রিপ ইনফরমেশন',
    hotline: '01711-000000',
    defaultFare: 550,
    noticeText: 'সকল কাউন্টারকে দ্রুত বুকিং ও প্রিন্ট সেবা নিশ্চিত করতে অনুরোধ করা হচ্ছে।',
    currency: '৳',
    timezone: 'Asia/Dhaka',
  };

  return {
    companies: [],
    users,
    supervisors: [],
    drivers: [],
    counters: [],
    vehicles: [],
    routes: [],
    schedules: [],
    bookings: [],
    reconciliations: [],
    auditLogs: [],
    settings,
  };
}

class Database {
  private data: DatabaseSchema;
  private saveTimer: NodeJS.Timeout | null = null;
  private lock: boolean = false;

  constructor() {
    this.ensureDataDir();
    this.data = this.loadData();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed.users) {
          if (!parsed.companies) parsed.companies = [];
          if (!parsed.supervisors) parsed.supervisors = [];
          if (!parsed.drivers) parsed.drivers = [];
          if (!parsed.counters) parsed.counters = [];
          if (!parsed.vehicles) parsed.vehicles = [];
          if (!parsed.routes) parsed.routes = [];
          if (!parsed.schedules) parsed.schedules = [];
          if (!parsed.bookings) parsed.bookings = [];
          if (!parsed.reconciliations) parsed.reconciliations = [];
          if (!parsed.auditLogs) parsed.auditLogs = [];
          parsed.settings = {
            companyName: parsed.settings?.companyName || 'Counter Management System',
            subTitle: parsed.settings?.subTitle || 'কাউন্টার বুকিং ও ট্রিপ ইনফরমেশন',
            hotline: parsed.settings?.hotline || '01711-000000',
            defaultFare: parsed.settings?.defaultFare ?? 550,
            noticeText: parsed.settings?.noticeText || '',
            currency: parsed.settings?.currency || '৳',
            timezone: parsed.settings?.timezone || 'Asia/Dhaka',
          };
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load existing db.json, generating defaults:', err);
    }
    const initial = getInitialDatabase();
    this.persistSync(initial);
    return initial;
  }

  private persistSync(dataToSave: DatabaseSchema) {
    try {
      this.ensureDataDir();
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Error saving database to file:', err);
    }
  }

  public save() {
    // Immediate synchronous save to guarantee ACID persistence across restarts
    this.persistSync(this.data);
  }

  // Companies
  public getCompanies() {
    if (!this.data.companies) this.data.companies = [];
    return this.data.companies;
  }

  public createCompany(data: {
    name: string;
    logoUrl?: string;
    address: string;
    phone: string;
    subscriptionExpiry: string;
    adminLoginId: string;
    pin: string;
  }) {
    const salt = generateSalt();
    const pinHash = hashPin(data.pin, salt);
    const newCompany = {
      id: `cmp-${Date.now()}`,
      name: data.name.trim(),
      logoUrl: data.logoUrl || '',
      address: data.address.trim(),
      phone: data.phone.trim(),
      subscriptionExpiry: data.subscriptionExpiry,
      adminLoginId: data.adminLoginId.trim(),
      adminPinHash: pinHash,
      adminPinSalt: salt,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
    };
    this.getCompanies().push(newCompany);

    // Also register company admin user
    const userSalt = generateSalt();
    this.data.users.push({
      id: `usr-${Date.now()}`,
      loginId: data.adminLoginId.trim(),
      name: `${data.name} এডমিন`,
      role: 'master_admin',
      companyId: newCompany.id,
      phone: data.phone.trim(),
      status: 'active',
      pinHash: hashPin(data.pin, userSalt),
      pinSalt: userSalt,
      createdAt: new Date().toISOString(),
    });

    this.save();
    return newCompany;
  }

  public updateCompany(id: string, data: Partial<Company> & { pin?: string }) {
    const comp = this.getCompanies().find((c) => c.id === id);
    if (!comp) throw new Error('কোম্পানি খুঁজে পাওয়া যায়নি!');
    if (data.name) comp.name = data.name.trim();
    if (data.logoUrl !== undefined) comp.logoUrl = data.logoUrl;
    if (data.address !== undefined) comp.address = data.address.trim();
    if (data.phone !== undefined) comp.phone = data.phone.trim();
    if (data.subscriptionExpiry !== undefined) comp.subscriptionExpiry = data.subscriptionExpiry;
    if (data.status !== undefined) comp.status = data.status;
    if (data.pin && data.pin.trim()) {
      const salt = generateSalt();
      comp.adminPinSalt = salt;
      comp.adminPinHash = hashPin(data.pin.trim(), salt);
    }
    this.save();
    return comp;
  }

  public deleteCompany(id: string) {
    const index = this.getCompanies().findIndex((c) => c.id === id);
    if (index === -1) throw new Error('কোম্পানি খুঁজে পাওয়া যায়নি!');
    this.getCompanies().splice(index, 1);
    this.save();
  }

  // Routes Edit & Delete
  public updateRoute(id: string, data: Partial<RouteItem>) {
    const route = this.data.routes.find((r) => r.id === id);
    if (!route) throw new Error('রুট খুঁজে পাওয়া যায়নি!');
    if (data.name) route.name = data.name.trim();
    if (data.origin) route.origin = data.origin.trim();
    if (data.destination) route.destination = data.destination.trim();
    if (data.intermediateStops) route.intermediateStops = data.intermediateStops;
    if (data.direction) route.direction = data.direction;
    if (data.baseFare !== undefined) route.baseFare = data.baseFare;
    if (data.distanceKm !== undefined) route.distanceKm = data.distanceKm;
    if (data.status) route.status = data.status;
    this.save();
    return route;
  }

  public deleteRoute(id: string) {
    const index = this.data.routes.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('রুট খুঁজে পাওয়া যায়নি!');
    this.data.routes.splice(index, 1);
    this.save();
  }

  // Schedule Delete
  public deleteSchedule(id: string) {
    const index = this.data.schedules.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('ট্রিপ শিডিউল খুঁজে পাওয়া যায়নি!');
    // If has active bookings, throw error or warn
    const bookings = this.data.bookings.filter((b) => b.scheduleId === id && b.status === 'booked');
    if (bookings.length > 0) {
      throw new Error(`এই ট্রিপে ইতিমধ্যে ${bookings.length}টি সিট বুকিং রয়েছে! আগে বুকিং বাতিল করতে হবে।`);
    }
    this.data.schedules.splice(index, 1);
    this.save();
  }

  // Supervisors Directory (NO LOGIN)
  public getSupervisors() {
    if (!this.data.supervisors) this.data.supervisors = [];
    return this.data.supervisors;
  }

  public createSupervisor(data: { name: string; phone?: string }) {
    const newSupervisor: Supervisor = {
      id: `sup-${Date.now()}`,
      name: data.name.trim(),
      phone: data.phone?.trim() || '',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.getSupervisors().push(newSupervisor);
    this.save();
    return newSupervisor;
  }

  public updateSupervisor(id: string, data: Partial<Supervisor>) {
    const sup = this.getSupervisors().find((s) => s.id === id);
    if (!sup) throw new Error('সুপারভাইজার খুঁজে পাওয়া যায়নি!');
    if (data.name) sup.name = data.name.trim();
    if (data.phone !== undefined) sup.phone = data.phone.trim();
    if (data.status) sup.status = data.status;
    this.save();
    return sup;
  }

  public deleteSupervisor(id: string) {
    const index = this.getSupervisors().findIndex((s) => s.id === id);
    if (index === -1) throw new Error('সুপারভাইজার খুঁজে পাওয়া যায়নি!');
    this.getSupervisors().splice(index, 1);
    this.save();
  }

  // Drivers Directory (NO LOGIN, NAME ONLY)
  public getDrivers() {
    if (!this.data.drivers) this.data.drivers = [];
    return this.data.drivers;
  }

  public createDriver(data: { name: string }) {
    const newDriver: Driver = {
      id: `drv-${Date.now()}`,
      name: data.name.trim(),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.getDrivers().push(newDriver);
    this.save();
    return newDriver;
  }

  public updateDriver(id: string, data: Partial<Driver>) {
    const drv = this.getDrivers().find((d) => d.id === id);
    if (!drv) throw new Error('ড্রাইভার খুঁজে পাওয়া যায়নি!');
    if (data.name) drv.name = data.name.trim();
    if (data.status) drv.status = data.status;
    this.save();
    return drv;
  }

  public deleteDriver(id: string) {
    const index = this.getDrivers().findIndex((d) => d.id === id);
    if (index === -1) throw new Error('ড্রাইভার খুঁজে পাওয়া যায়নি!');
    this.getDrivers().splice(index, 1);
    this.save();
  }

  // Vehicles Delete
  public deleteVehicle(id: string) {
    const index = this.data.vehicles.findIndex((v) => v.id === id);
    if (index === -1) throw new Error('গাড়ি খুঁজে পাওয়া যায়নি!');
    const vehicle = this.data.vehicles[index];
    // Check if scheduled
    const active = this.data.schedules.filter(
      (s) => s.vehicleId === id && (s.status === 'scheduled' || s.status === 'running')
    );
    if (active.length > 0) {
      throw new Error(`এই গাড়ির বিপরীতে ${active.length}টি সক্রিয় ট্রিপ রয়েছে। আগে ট্রিপ পরিবর্তন বা বাতিল করুন।`);
    }
    this.data.vehicles.splice(index, 1);
    this.save();
    return vehicle;
  }

  // Counters Delete
  public deleteCounter(id: string) {
    const index = this.data.counters.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('কাউন্টার খুঁজে পাওয়া যায়নি!');
    const counter = this.data.counters[index];
    this.data.counters.splice(index, 1);
    this.save();
    return counter;
  }

  // Users Delete
  public deleteUser(id: string) {
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error('ব্যবহারকারী খুঁজে পাওয়া যায়নি!');
    const user = this.data.users[index];
    if (user.role === 'master_admin' && this.data.users.filter((u) => u.role === 'master_admin').length <= 1) {
      throw new Error('সিস্টেমের একমাত্র মাস্টার এডমিন মুছে ফেলা সম্ভব নয়!');
    }
    this.data.users.splice(index, 1);
    this.save();
    return user;
  }

  // Getters
  public getUsers() {
    return this.data.users;
  }

  public getCounters() {
    return this.data.counters;
  }

  public getVehicles() {
    return this.data.vehicles;
  }

  public getRoutes() {
    return this.data.routes;
  }

  public getSchedules() {
    return this.data.schedules;
  }

  public getBookings() {
    return this.data.bookings;
  }

  public getReconciliations() {
    return this.data.reconciliations;
  }

  public getAuditLogs() {
    return this.data.auditLogs;
  }

  public getSettings() {
    return this.data.settings;
  }

  public updateSettings(newSettings: Partial<SystemSettings>) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  // Audit Log Helper
  public logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const entry: AuditLog = {
      ...log,
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.auditLogs.unshift(entry);
    // Keep last 1000 logs
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 1000);
    }
    this.save();
    return entry;
  }

  // ATOMIC SEAT BOOKING with Race-Condition Protection
  public atomicBookSeats(params: {
    scheduleId: string;
    counterId: string;
    bookedByUserId: string;
    bookedByUserName: string;
    passengerName: string;
    passengerPhone: string;
    boardingPoint: string;
    destination: string;
    seatNumbers: string[];
    customTotalFare?: number;
    customFarePerSeat?: number;
  }): { booking: Booking; schedule: Schedule } {
    // Ensure thread-safety in Node.js event loop
    const schedule = this.data.schedules.find((s) => s.id === params.scheduleId);
    if (!schedule) {
      throw new Error('ট্রিপ শিডিউল খুঁজে পাওয়া যায়নি!');
    }

    if (schedule.status === 'cancelled') {
      throw new Error('এই ট্রিপটি বাতিল করা হয়েছে!');
    }

    // 1. Validate seats against vehicle layout
    const validSeats = generateValidSeatList(schedule.seatCapacity);
    for (const seat of params.seatNumbers) {
      if (!validSeats.includes(seat)) {
        throw new Error(`অবৈধ সিট নম্বর: ${seat}। এই গাড়িতে এই সিটটি নেই।`);
      }
    }

    // 2. Check collision with existing active bookings for this schedule
    const activeBookings = this.data.bookings.filter(
      (b) => b.scheduleId === params.scheduleId && b.status === 'booked'
    );

    const alreadyBookedSeats = new Set<string>();
    for (const b of activeBookings) {
      for (const s of b.seatNumbers) {
        alreadyBookedSeats.add(s);
      }
    }

    const collidingSeats = params.seatNumbers.filter((s) => alreadyBookedSeats.has(s));
    if (collidingSeats.length > 0) {
      throw new Error(
        `দুঃখিত! সিট ${collidingSeats.join(', ')} ইতিমধ্যেই অন্য কাউন্টার বা গ্রাহক দ্বারা বুক করা হয়েছে!`
      );
    }

    // 3. Find Counter
    const counter = this.data.counters.find((c) => c.id === params.counterId);
    if (!counter) {
      throw new Error('কাউন্টার সনাক্ত করা যায়নি!');
    }

    // 4. Calculate Fare (Supports manual fare set by counter manager)
    let totalFare: number;
    let farePerSeat: number;

    if (params.customTotalFare !== undefined && params.customTotalFare !== null && !isNaN(Number(params.customTotalFare))) {
      totalFare = Math.max(0, Number(params.customTotalFare));
      farePerSeat = params.seatNumbers.length > 0 ? Math.round(totalFare / params.seatNumbers.length) : totalFare;
    } else if (params.customFarePerSeat !== undefined && params.customFarePerSeat !== null && !isNaN(Number(params.customFarePerSeat))) {
      farePerSeat = Math.max(0, Number(params.customFarePerSeat));
      totalFare = farePerSeat * params.seatNumbers.length;
    } else {
      farePerSeat = schedule.fare || 0;
      totalFare = farePerSeat * params.seatNumbers.length;
    }

    // 5. Generate Ticket Number
    const dateNum = schedule.date.replace(/-/g, '');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketNo = `ZB-${schedule.direction}-${dateNum}-${randomHex}`;

    const newBooking: Booking = {
      id: `bkg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ticketNo,
      scheduleId: schedule.id,
      tripNo: schedule.tripNo,
      tripDate: schedule.date,
      tripTime: schedule.departureTime,
      vehicleRegNo: schedule.vehicleRegNo,
      routeName: schedule.routeName,
      direction: schedule.direction,
      counterId: counter.id,
      counterName: counter.name,
      counterCode: counter.code,
      counterColor: counter.seatColor,
      bookedByUserId: params.bookedByUserId,
      bookedByUserName: params.bookedByUserName,
      passengerName: params.passengerName || 'যাত্রী',
      passengerPhone: params.passengerPhone || '',
      boardingPoint: params.boardingPoint || counter.name,
      destination: params.destination || (schedule.direction === 'UP' ? 'ঢাকা' : 'মাদারীপুর'),
      seatNumbers: params.seatNumbers,
      totalSeats: params.seatNumbers.length,
      farePerSeat,
      totalFare,
      status: 'booked',
      bookedAt: new Date().toISOString(),
      printedCount: 0,
    };

    // 6. Commit booking and update schedule aggregate
    this.data.bookings.push(newBooking);
    schedule.totalBookedSeats = (schedule.totalBookedSeats || 0) + params.seatNumbers.length;
    schedule.totalCollection = (schedule.totalCollection || 0) + totalFare;

    this.logAudit({
      userId: params.bookedByUserId,
      userName: params.bookedByUserName,
      role: 'booking_point',
      actionType: 'CREATE_BOOKING',
      entityType: 'BOOKING',
      entityId: newBooking.id,
      tripIdAffected: schedule.id,
      details: `${counter.name} থেকে টিকিট নং ${ticketNo} এর অধীনে সিট ${params.seatNumbers.join(
        ', '
      )} সফলভাবে বুক করা হয়েছে। মোট ভাড়া: ৳${totalFare}`,
      newValues: { ticketNo, seats: params.seatNumbers, totalFare },
    });

    this.save();
    return { booking: newBooking, schedule };
  }

  // CANCEL BOOKING
  public cancelBooking(bookingId: string, user: { id: string; name: string; role: string }): Booking {
    const booking = this.data.bookings.find((b) => b.id === bookingId);
    if (!booking) {
      throw new Error('বুকিং খুঁজে পাওয়া যায়নি!');
    }
    if (booking.status === 'cancelled') {
      throw new Error('এই বুকিংটি ইতিমধ্যেই বাতিল করা হয়েছে!');
    }

    booking.status = 'cancelled';
    const schedule = this.data.schedules.find((s) => s.id === booking.scheduleId);
    if (schedule) {
      schedule.totalBookedSeats = Math.max(0, (schedule.totalBookedSeats || 0) - booking.totalSeats);
      schedule.totalCollection = Math.max(0, (schedule.totalCollection || 0) - booking.totalFare);
    }

    this.logAudit({
      userId: user.id,
      userName: user.name,
      role: user.role,
      actionType: 'CANCEL_BOOKING',
      entityType: 'BOOKING',
      entityId: booking.id,
      tripIdAffected: booking.scheduleId,
      details: `টিকিট নং ${booking.ticketNo} (সিট: ${booking.seatNumbers.join(
        ', '
      )}) বাতিল করা হয়েছে। রিফান্ড পরিমাণ: ৳${booking.totalFare}`,
      previousValues: { status: 'booked', seats: booking.seatNumbers },
      newValues: { status: 'cancelled' },
    });

    this.save();
    return booking;
  }

  // INCREMENT TICKET PRINT COUNT
  public incrementPrintCount(bookingId: string): Booking {
    const booking = this.data.bookings.find((b) => b.id === bookingId);
    if (!booking) {
      throw new Error('বুকিং খুঁজে পাওয়া যায়নি!');
    }
    booking.printedCount = (booking.printedCount || 0) + 1;
    booking.lastPrintedAt = new Date().toISOString();
    this.save();
    return booking;
  }
}

export const db = new Database();
