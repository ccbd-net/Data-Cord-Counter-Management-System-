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
  FuelEntry,
  FuelSettings,
} from '../src/types/index.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface DatabaseSchema {
  companies: (Company & { adminPinHash: string; adminPinSalt: string })[];
  deletedCompanyIds?: string[];
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
  companySettings?: Record<string, SystemSettings>;
  fuelEntries?: FuelEntry[];
  fuelSettings?: Record<string, FuelSettings>;
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
      name: 'মাস্টার এডমিন (Data&Code)',
      role: 'super_admin',
      phone: '01700-000000',
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
    deletedCompanyIds: [],
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

export function getCompanyPrefix(companyName: string, companyId: string): string {
  const cname = (companyName || '').trim().toUpperCase();
  const en = cname.replace(/[^A-Z]/g, '');
  if (en.length >= 2) return en.slice(0, 3);
  const cid = (companyId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase();
  return cid || 'BUS';
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
          if (!Array.isArray(parsed.deletedCompanyIds)) parsed.deletedCompanyIds = [];
          if (!parsed.supervisors) parsed.supervisors = [];
          if (!parsed.drivers) parsed.drivers = [];
          if (!parsed.counters) parsed.counters = [];
          if (!parsed.vehicles) parsed.vehicles = [];
          if (!parsed.routes) parsed.routes = [];
          if (!parsed.schedules) parsed.schedules = [];
          if (!parsed.bookings) parsed.bookings = [];
          if (!parsed.reconciliations) parsed.reconciliations = [];
          if (!parsed.auditLogs) parsed.auditLogs = [];
          if (!parsed.fuelEntries) parsed.fuelEntries = [];
          if (!parsed.fuelSettings) parsed.fuelSettings = {};
          if (!parsed.companySettings) parsed.companySettings = {};

          // Migrate roles: ensure platform master admin is super_admin and company admins are company_admin
          parsed.users.forEach((u: any) => {
            if (u.loginId === 'admin' && !u.companyId) {
              u.role = 'super_admin';
            } else if (u.companyId && (u.role === 'master_admin' || !u.role)) {
              u.role = 'company_admin';
            }
          });

          parsed.settings = {
            companyName: parsed.settings?.companyName || 'Counter Management System',
            subTitle: parsed.settings?.subTitle || 'কাউন্টার বুকিং ও ট্রিপ ইনফরমেশন',
            hotline: parsed.settings?.hotline || '01711-000000',
            defaultFare: parsed.settings?.defaultFare ?? 550,
            noticeText: parsed.settings?.noticeText || '',
            currency: parsed.settings?.currency || '৳',
            timezone: parsed.settings?.timezone || 'Asia/Dhaka',
          };

          // Clean any orphaned records from deleted companies automatically on load
          const validIds = new Set((parsed.companies || []).map((c: any) => c.id));
          const deletedIds = new Set(parsed.deletedCompanyIds || []);
          const isOrphan = (cmpId?: string) => {
            if (!cmpId) return false;
            return deletedIds.has(cmpId) || !validIds.has(cmpId);
          };
          parsed.users = (parsed.users || []).filter(
            (u: any) => u.role === 'super_admin' || u.loginId?.toLowerCase() === 'admin' || (u.companyId && !isOrphan(u.companyId))
          );
          parsed.supervisors = (parsed.supervisors || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.drivers = (parsed.drivers || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.counters = (parsed.counters || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.vehicles = (parsed.vehicles || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.routes = (parsed.routes || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.schedules = (parsed.schedules || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.bookings = (parsed.bookings || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.reconciliations = (parsed.reconciliations || []).filter((x: any) => !isOrphan(x.companyId));
          parsed.fuelEntries = (parsed.fuelEntries || []).filter((x: any) => !isOrphan(x.companyId));
          if (parsed.companySettings) {
            for (const cmpKey of Object.keys(parsed.companySettings)) {
              if (!validIds.has(cmpKey) || deletedIds.has(cmpKey)) {
                delete parsed.companySettings[cmpKey];
              }
            }
          }

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
      const content = JSON.stringify(dataToSave, null, 2);
      // Keep a safety backup
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, `${DB_FILE}.bak`);
        } catch {
          // ignore backup write issue
        }
      }
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, content, 'utf-8');
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

    // Register company admin user
    const userSalt = generateSalt();
    this.data.users.push({
      id: `usr-${Date.now()}`,
      loginId: data.adminLoginId.trim(),
      name: `${data.name} এডমিন`,
      role: 'company_admin',
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
    if (data.adminLoginId) {
      comp.adminLoginId = data.adminLoginId.trim();
    }
    if (data.pin && data.pin.trim()) {
      const salt = generateSalt();
      comp.adminPinSalt = salt;
      comp.adminPinHash = hashPin(data.pin.trim(), salt);

      // Also update company_admin user
      const adminUser = this.data.users.find((u) => u.companyId === id && u.role === 'company_admin');
      if (adminUser) {
        if (data.adminLoginId) adminUser.loginId = data.adminLoginId.trim();
        adminUser.pinSalt = salt;
        adminUser.pinHash = hashPin(data.pin.trim(), salt);
      }
    } else if (data.adminLoginId) {
      const adminUser = this.data.users.find((u) => u.companyId === id && u.role === 'company_admin');
      if (adminUser) {
        adminUser.loginId = data.adminLoginId.trim();
      }
    }
    this.save();
    return comp;
  }

  public getCompanyStats(companyId: string) {
    return {
      users: this.data.users.filter((u) => u.companyId === companyId && u.role !== 'super_admin').length,
      counters: this.data.counters.filter((c) => c.companyId === companyId).length,
      vehicles: this.data.vehicles.filter((v) => v.companyId === companyId).length,
      routes: this.data.routes.filter((r) => r.companyId === companyId).length,
      supervisors: this.data.supervisors.filter((s) => s.companyId === companyId).length,
      drivers: this.data.drivers.filter((d) => d.companyId === companyId).length,
      schedules: this.data.schedules.filter((s) => s.companyId === companyId).length,
      bookings: this.data.bookings.filter((b) => b.companyId === companyId).length,
      reconciliations: (this.data.reconciliations || []).filter((r) => r.companyId === companyId).length,
      fuelEntries: (this.data.fuelEntries || []).filter((f) => f.companyId === companyId).length,
    };
  }

  public purgeOrphanedCompanyRecords(shouldSave: boolean = true): { removedCount: number } {
    const validIds = new Set(this.getCompanies().map((c) => c.id));
    if (!Array.isArray(this.data.deletedCompanyIds)) this.data.deletedCompanyIds = [];
    const deletedSet = new Set(this.data.deletedCompanyIds);

    let removedCount = 0;
    const filterTenant = <T extends { companyId?: string }>(arr?: T[]): T[] => {
      if (!Array.isArray(arr)) return [];
      const kept = arr.filter((item) => {
        if (!item.companyId) return false;
        if (deletedSet.has(item.companyId)) return false;
        return validIds.has(item.companyId);
      });
      removedCount += arr.length - kept.length;
      return kept;
    };

    const initialUserLen = this.data.users.length;
    this.data.users = this.data.users.filter(
      (u) =>
        u.role === 'super_admin' ||
        u.loginId.toLowerCase() === 'admin' ||
        (!!u.companyId && !deletedSet.has(u.companyId) && validIds.has(u.companyId))
    );
    removedCount += initialUserLen - this.data.users.length;

    this.data.counters = filterTenant(this.data.counters);
    this.data.vehicles = filterTenant(this.data.vehicles);
    this.data.routes = filterTenant(this.data.routes);
    this.data.supervisors = filterTenant(this.data.supervisors);
    this.data.drivers = filterTenant(this.data.drivers);
    this.data.schedules = filterTenant(this.data.schedules);
    this.data.bookings = filterTenant(this.data.bookings);
    this.data.reconciliations = filterTenant(this.data.reconciliations);
    this.data.fuelEntries = filterTenant(this.data.fuelEntries);

    if (this.data.fuelSettings) {
      for (const cmpKey of Object.keys(this.data.fuelSettings)) {
        if (cmpKey !== 'default' && (!validIds.has(cmpKey) || deletedSet.has(cmpKey))) {
          delete this.data.fuelSettings[cmpKey];
          removedCount++;
        }
      }
    }
    if (this.data.companySettings) {
      for (const cmpKey of Object.keys(this.data.companySettings)) {
        if (!validIds.has(cmpKey) || deletedSet.has(cmpKey)) {
          delete this.data.companySettings[cmpKey];
          removedCount++;
        }
      }
    }

    if (shouldSave && removedCount > 0) {
      this.save();
    }
    return { removedCount };
  }

  public deleteCompany(id: string): { deletedName: string; removedCount: number } {
    const companies = this.getCompanies();
    const index = companies.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('কোম্পানি খুঁজে পাওয়া যায়নি!');
    const deletedName = companies[index].name;
    companies.splice(index, 1);

    if (!Array.isArray(this.data.deletedCompanyIds)) {
      this.data.deletedCompanyIds = [];
    }
    if (!this.data.deletedCompanyIds.includes(id)) {
      this.data.deletedCompanyIds.push(id);
    }

    let removedCount = 1;
    const stripByCompany = <T extends { companyId?: string }>(arr?: T[]): T[] => {
      if (!Array.isArray(arr)) return [];
      const kept = arr.filter((item) => item.companyId !== id);
      removedCount += arr.length - kept.length;
      return kept;
    };

    // Cascade clean ONLY records belonging to this companyId (never affecting any other company)
    const prevUsersLen = this.data.users.length;
    this.data.users = this.data.users.filter(
      (u) => u.role === 'super_admin' || u.loginId.toLowerCase() === 'admin' || u.companyId !== id
    );
    removedCount += prevUsersLen - this.data.users.length;

    this.data.counters = stripByCompany(this.data.counters);
    this.data.vehicles = stripByCompany(this.data.vehicles);
    this.data.routes = stripByCompany(this.data.routes);
    this.data.supervisors = stripByCompany(this.data.supervisors);
    this.data.drivers = stripByCompany(this.data.drivers);
    this.data.schedules = stripByCompany(this.data.schedules);
    this.data.bookings = stripByCompany(this.data.bookings);
    this.data.reconciliations = stripByCompany(this.data.reconciliations);
    this.data.fuelEntries = stripByCompany(this.data.fuelEntries);
    if (this.data.fuelSettings && this.data.fuelSettings[id]) {
      delete this.data.fuelSettings[id];
      removedCount++;
    }
    if (this.data.companySettings && this.data.companySettings[id]) {
      delete this.data.companySettings[id];
      removedCount++;
    }

    const orphanRes = this.purgeOrphanedCompanyRecords(false);
    removedCount += orphanRes.removedCount;
    this.save();
    return { deletedName, removedCount };
  }

  // Routes Edit & Delete
  public updateRoute(id: string, data: Partial<RouteItem>) {
    const route = this.data.routes.find((r) => r.id === id);
    if (!route) throw new Error('রুট খুঁজে পাওয়া যায়নি!');
    if (data.routeNumber !== undefined) {
      const parsedNum = Number(data.routeNumber);
      route.routeNumber =
        data.routeNumber !== null && String(data.routeNumber).trim() !== '' && !isNaN(parsedNum) && parsedNum > 0
          ? parsedNum
          : undefined;
    }
    if (data.name) route.name = data.name.trim();
    if (data.origin) route.origin = data.origin.trim();
    if (data.destination) route.destination = data.destination.trim();
    if (data.intermediateStops) route.intermediateStops = data.intermediateStops;
    if (data.direction) route.direction = data.direction;
    if (data.baseFare !== undefined) route.baseFare = data.baseFare;
    if (data.distanceKm !== undefined) route.distanceKm = data.distanceKm;
    if (data.status) route.status = data.status;

    // Keep linked schedules in sync with routeNumber & routeName
    this.data.schedules.forEach((s) => {
      if (s.routeId === id) {
        if (data.routeNumber !== undefined) s.routeNumber = route.routeNumber;
        if (data.name) s.routeName = route.name;
      }
    });

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

  // Supervisors Directory (NO LOGIN, NAME ONLY)
  public getSupervisors(companyId?: string) {
    if (!this.data.supervisors) this.data.supervisors = [];
    if (!companyId) return this.data.supervisors;
    return this.data.supervisors.filter((s) => s.companyId === companyId);
  }

  public createSupervisor(data: { name: string; phone?: string; companyId?: string }) {
    const newSupervisor: Supervisor = {
      id: `sup-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      companyId: data.companyId,
      name: data.name.trim(),
      phone: '',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.getSupervisors().push(newSupervisor);
    this.save();
    return newSupervisor;
  }

  public createSupervisorsBulk(names: string[], companyId?: string) {
    const existingSet = new Set(
      this.getSupervisors(companyId).map((s) => s.name.trim().toLowerCase())
    );
    const created: Supervisor[] = [];
    let skippedCount = 0;
    const baseTs = Date.now();
    const nowIso = new Date().toISOString();

    for (let i = 0; i < names.length; i++) {
      const cleanName = names[i].trim();
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      if (existingSet.has(key)) {
        skippedCount++;
        continue;
      }
      existingSet.add(key);
      const item: Supervisor = {
        id: `sup-${baseTs}-${i}-${Math.floor(Math.random() * 1000)}`,
        companyId,
        name: cleanName,
        phone: '',
        status: 'active',
        createdAt: nowIso,
      };
      this.getSupervisors().push(item);
      created.push(item);
    }
    if (created.length > 0) {
      this.save();
    }
    return { created, skippedCount };
  }

  public updateSupervisor(id: string, data: Partial<Supervisor>) {
    const sup = this.getSupervisors().find((s) => s.id === id);
    if (!sup) throw new Error('সুপারভাইজার খুঁজে পাওয়া যায়নি!');
    if (data.name) sup.name = data.name.trim();
    sup.phone = '';
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
  public getDrivers(companyId?: string) {
    if (!this.data.drivers) this.data.drivers = [];
    if (!companyId) return this.data.drivers;
    return this.data.drivers.filter((d) => d.companyId === companyId);
  }

  public createDriver(data: { name: string; phone?: string; companyId?: string }) {
    const newDriver: Driver = {
      id: `drv-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      companyId: data.companyId,
      name: data.name.trim(),
      phone: '',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.getDrivers().push(newDriver);
    this.save();
    return newDriver;
  }

  public createDriversBulk(names: string[], companyId?: string) {
    const existingSet = new Set(
      this.getDrivers(companyId).map((d) => d.name.trim().toLowerCase())
    );
    const created: Driver[] = [];
    let skippedCount = 0;
    const baseTs = Date.now();
    const nowIso = new Date().toISOString();

    for (let i = 0; i < names.length; i++) {
      const cleanName = names[i].trim();
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      if (existingSet.has(key)) {
        skippedCount++;
        continue;
      }
      existingSet.add(key);
      const item: Driver = {
        id: `drv-${baseTs}-${i}-${Math.floor(Math.random() * 1000)}`,
        companyId,
        name: cleanName,
        phone: '',
        status: 'active',
        createdAt: nowIso,
      };
      this.getDrivers().push(item);
      created.push(item);
    }
    if (created.length > 0) {
      this.save();
    }
    return { created, skippedCount };
  }

  public updateDriver(id: string, data: Partial<Driver>) {
    const drv = this.getDrivers().find((d) => d.id === id);
    if (!drv) throw new Error('ড্রাইভার খুঁজে পাওয়া যায়নি!');
    if (data.name) drv.name = data.name.trim();
    drv.phone = '';
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
    if (user.role === 'super_admin' && this.data.users.filter((u) => u.role === 'super_admin').length <= 1) {
      throw new Error('সিস্টেমের একমাত্র মাস্টার এডমিন মুছে ফেলা সম্ভব নয়!');
    }
    this.data.users.splice(index, 1);
    this.save();
    return user;
  }

  public updateOwnCredentials(
    userId: string,
    params: { currentPin: string; newLoginId?: string; newPin?: string }
  ): User {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('ব্যবহারকারী খুঁজে পাওয়া যায়নি!');
    }

    const currentPin = (params.currentPin || '').toString().trim();
    if (!currentPin || !verifyPin(currentPin, user.pinHash, user.pinSalt)) {
      throw new Error('বর্তমান পিন কোড সঠিক নয়!');
    }

    const cleanLoginId = params.newLoginId !== undefined ? params.newLoginId.trim() : '';
    const cleanNewPin = params.newPin !== undefined ? params.newPin.trim() : '';

    if (!cleanLoginId && !cleanNewPin) {
      throw new Error('পরিবর্তনের জন্য নতুন লগইন আইডি অথবা নতুন পিন দিন।');
    }

    if (cleanLoginId && cleanLoginId.toLowerCase() !== user.loginId.toLowerCase()) {
      if (cleanLoginId.length < 3 || /\s/.test(cleanLoginId)) {
        throw new Error('লগইন আইডি কমপক্ষে ৩ অক্ষরের হতে হবে এবং কোনো স্পেস থাকা যাবে না।');
      }
      const duplicate = this.data.users.find(
        (u) => u.id !== userId && u.loginId.toLowerCase() === cleanLoginId.toLowerCase()
      );
      if (duplicate) {
        throw new Error('এই লগইন আইডি ইতিমধ্যেই ব্যবহৃত হচ্ছে। অন্য একটি ইউনিক আইডি দিন।');
      }
      user.loginId = cleanLoginId;
      // Do NOT mirror updated private loginId onto Company metadata so no cross-visibility happens
      if (user.companyId && (user.role === 'company_admin' || user.role === 'master_admin')) {
        const comp = this.getCompanies().find((c) => c.id === user.companyId);
        if (comp) {
          comp.adminLoginId = '';
        }
      }
    }

    if (cleanNewPin) {
      if (cleanNewPin.length < 4 || cleanNewPin.length > 6) {
        throw new Error('নতুন পিন কোড অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।');
      }
      const salt = generateSalt();
      user.pinSalt = salt;
      user.pinHash = hashPin(cleanNewPin, salt);
    }

    this.save();
    const { pinHash, pinSalt, ...safeUser } = user;
    return safeUser;
  }

  // Getters with Company Scoping
  public getUsers(companyId?: string) {
    if (!companyId) return this.data.users;
    return this.data.users.filter((u) => u.companyId === companyId && u.role !== 'super_admin');
  }

  public getCounters(companyId?: string) {
    if (!companyId) return this.data.counters;
    return this.data.counters.filter((c) => c.companyId === companyId);
  }

  public getVehicles(companyId?: string) {
    if (!companyId) return this.data.vehicles;
    return this.data.vehicles.filter((v) => v.companyId === companyId);
  }

  public getRoutes(companyId?: string) {
    if (!companyId) return this.data.routes;
    return this.data.routes.filter((r) => r.companyId === companyId);
  }

  public getSchedules(companyId?: string) {
    if (!companyId) return this.data.schedules;
    return this.data.schedules.filter((s) => s.companyId === companyId);
  }

  public getBookings(companyId?: string) {
    if (!companyId) return this.data.bookings;
    return this.data.bookings.filter((b) => b.companyId === companyId);
  }

  public getReconciliations(companyId?: string) {
    if (!companyId) return this.data.reconciliations;
    return this.data.reconciliations.filter((r) => r.companyId === companyId);
  }

  public getAuditLogs(companyId?: string) {
    if (!companyId) return this.data.auditLogs;
    return this.data.auditLogs.filter((l) => l.companyId === companyId);
  }

  public getSettings(companyId?: string): SystemSettings {
    if (!companyId) return this.data.settings;
    const saved = this.data.companySettings?.[companyId];
    const company = this.getCompanies().find((c) => c.id === companyId);
    if (saved) return saved;
    return {
      ...this.data.settings,
      companyName: company?.name || this.data.settings.companyName,
      hotline: company?.phone || this.data.settings.hotline,
    };
  }

  public updateSettings(newSettings: Partial<SystemSettings>, companyId?: string): SystemSettings {
    if (!companyId) {
      this.data.settings = { ...this.data.settings, ...newSettings };
      this.save();
      return this.data.settings;
    }
    if (!this.data.companySettings) this.data.companySettings = {};
    const current = this.getSettings(companyId);
    this.data.companySettings[companyId] = { ...current, ...newSettings };
    this.save();
    return this.data.companySettings[companyId];
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

  // ATOMIC SEAT BOOKING with Race-Condition Protection & Optional Cargo Fare
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
    seatFare?: number;
    cargoFare?: number;
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

    const cargoFare = Math.max(0, Number(params.cargoFare) || 0);
    const seatList = Array.isArray(params.seatNumbers) ? params.seatNumbers : [];

    if (seatList.length === 0 && cargoFare <= 0) {
      throw new Error('কমপক্ষে একটি সিট অথবা মালের ভাড়া প্রদান করুন।');
    }

    // 1. Validate seats against vehicle layout
    if (seatList.length > 0) {
      const validSeats = generateValidSeatList(schedule.seatCapacity);
      for (const seat of seatList) {
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

      const collidingSeats = seatList.filter((s) => alreadyBookedSeats.has(s));
      if (collidingSeats.length > 0) {
        throw new Error(
          `দুঃখিত! সিট ${collidingSeats.join(', ')} ইতিমধ্যেই অন্য কাউন্টার বা গ্রাহক দ্বারা বুক করা হয়েছে!`
        );
      }
    }

    // 3. Find Counter
    const counter = this.data.counters.find((c) => c.id === params.counterId);
    if (!counter) {
      throw new Error('কাউন্টার সনাক্ত করা যায়নি!');
    }

    // 4. Calculate Seat Fare + Cargo Fare = Total Fare (Supports manual fare & cargo-only)
    let seatFare = 0;
    let farePerSeat = 0;

    if (seatList.length === 0) {
      seatFare = 0;
      farePerSeat = 0;
    } else if (params.seatFare !== undefined && params.seatFare !== null && !isNaN(Number(params.seatFare))) {
      seatFare = Math.max(0, Number(params.seatFare));
      farePerSeat = Math.round(seatFare / seatList.length);
    } else if (params.customFarePerSeat !== undefined && params.customFarePerSeat !== null && !isNaN(Number(params.customFarePerSeat))) {
      farePerSeat = Math.max(0, Number(params.customFarePerSeat));
      seatFare = farePerSeat * seatList.length;
    } else if (params.customTotalFare !== undefined && params.customTotalFare !== null && !isNaN(Number(params.customTotalFare))) {
      seatFare = Math.max(0, Number(params.customTotalFare) - cargoFare);
      farePerSeat = Math.round(seatFare / seatList.length);
    } else {
      farePerSeat = schedule.fare || 0;
      seatFare = farePerSeat * seatList.length;
    }

    const totalFare = seatFare + cargoFare;

    // 5. Generate Ticket Number
    const dateNum = schedule.date.replace(/-/g, '');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketNo = `ZB-${schedule.direction}-${dateNum}-${randomHex}`;

    const newBooking: Booking = {
      id: `bkg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      companyId: schedule.companyId || counter.companyId,
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
      seatNumbers: seatList,
      totalSeats: seatList.length,
      farePerSeat,
      seatFare,
      cargoFare,
      totalFare,
      status: 'booked',
      bookedAt: new Date().toISOString(),
      printedCount: 0,
    };

    // 6. Commit booking and update schedule aggregate
    this.data.bookings.push(newBooking);
    schedule.totalBookedSeats = (schedule.totalBookedSeats || 0) + seatList.length;
    const prevSeatCollection =
      schedule.totalSeatCollection !== undefined
        ? schedule.totalSeatCollection
        : Math.max(0, (schedule.totalCollection || 0) - (schedule.totalCargoCollection || 0));
    const prevCargoCollection = schedule.totalCargoCollection || 0;
    schedule.totalSeatCollection = prevSeatCollection + seatFare;
    schedule.totalCargoCollection = prevCargoCollection + cargoFare;
    schedule.totalCollection = schedule.totalSeatCollection + schedule.totalCargoCollection;

    this.logAudit({
      userId: params.bookedByUserId,
      userName: params.bookedByUserName,
      role: 'booking_point',
      actionType: 'CREATE_BOOKING',
      entityType: 'BOOKING',
      entityId: newBooking.id,
      tripIdAffected: schedule.id,
      details: `${counter.name} থেকে টিকিট নং ${ticketNo} (${
        seatList.length > 0 ? `সিট: ${seatList.join(', ')}` : 'মালামাল বুকিং'
      }) বুক করা হয়েছে। সিট ভাড়া: ৳${seatFare}, মালের ভাড়া: ৳${cargoFare}, মোট: ৳${totalFare}`,
      newValues: { ticketNo, seats: seatList, seatFare, cargoFare, totalFare },
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
    const cargo = Math.max(0, Number(booking.cargoFare) || 0);
    const seat =
      booking.seatFare !== undefined && booking.seatFare !== null && !isNaN(Number(booking.seatFare))
        ? Math.max(0, Number(booking.seatFare))
        : Math.max(0, (booking.totalFare || 0) - cargo);

    const schedule = this.data.schedules.find((s) => s.id === booking.scheduleId);
    if (schedule) {
      schedule.totalBookedSeats = Math.max(0, (schedule.totalBookedSeats || 0) - booking.totalSeats);
      const prevSeatCollection =
        schedule.totalSeatCollection !== undefined
          ? schedule.totalSeatCollection
          : Math.max(0, (schedule.totalCollection || 0) - (schedule.totalCargoCollection || 0));
      const prevCargoCollection = schedule.totalCargoCollection || 0;
      schedule.totalSeatCollection = Math.max(0, prevSeatCollection - seat);
      schedule.totalCargoCollection = Math.max(0, prevCargoCollection - cargo);
      schedule.totalCollection = schedule.totalSeatCollection + schedule.totalCargoCollection;
    }

    this.logAudit({
      userId: user.id,
      userName: user.name,
      role: user.role,
      actionType: 'CANCEL_BOOKING',
      entityType: 'BOOKING',
      entityId: booking.id,
      tripIdAffected: booking.scheduleId,
      details: `টিকিট নং ${booking.ticketNo} (${
        booking.seatNumbers.length > 0 ? `সিট: ${booking.seatNumbers.join(', ')}` : 'মালামাল বুকিং'
      }) বাতিল করা হয়েছে। রিফান্ড পরিমাণ: ৳${booking.totalFare}`,
      previousValues: { status: 'booked', seats: booking.seatNumbers, seatFare: seat, cargoFare: cargo },
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

  // FUEL MANAGEMENT
  public getFuelEntries(companyId?: string): FuelEntry[] {
    if (!this.data.fuelEntries) this.data.fuelEntries = [];
    if (!companyId) return this.data.fuelEntries;
    return this.data.fuelEntries.filter((f) => !f.companyId || f.companyId === companyId);
  }

  public createFuelEntry(entry: Omit<FuelEntry, 'id' | 'createdAt'>): FuelEntry {
    if (!this.data.fuelEntries) this.data.fuelEntries = [];
    const newEntry: FuelEntry = {
      ...entry,
      id: `fuel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.fuelEntries.unshift(newEntry);
    this.save();
    return newEntry;
  }

  public updateFuelEntry(id: string, updates: Partial<FuelEntry>): FuelEntry | null {
    if (!this.data.fuelEntries) this.data.fuelEntries = [];
    const idx = this.data.fuelEntries.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    this.data.fuelEntries[idx] = { ...this.data.fuelEntries[idx], ...updates };
    this.save();
    return this.data.fuelEntries[idx];
  }

  public deleteFuelEntry(id: string): boolean {
    if (!this.data.fuelEntries) this.data.fuelEntries = [];
    const initialLen = this.data.fuelEntries.length;
    this.data.fuelEntries = this.data.fuelEntries.filter((f) => f.id !== id);
    if (this.data.fuelEntries.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public getFuelSettings(companyId?: string): FuelSettings {
    if (!this.data.fuelSettings) this.data.fuelSettings = {};
    const key = companyId || 'default';
    return (
      this.data.fuelSettings[key] || {
        commonMileage: 4,
        fuelPricePerLiter: 135.4,
      }
    );
  }

  public saveFuelSettings(settings: FuelSettings, companyId?: string): FuelSettings {
    if (!this.data.fuelSettings) this.data.fuelSettings = {};
    const key = companyId || 'default';
    this.data.fuelSettings[key] = {
      commonMileage: Number(settings.commonMileage) || 4,
      fuelPricePerLiter: Number(settings.fuelPricePerLiter) || 135.4,
    };
    this.save();
    return this.data.fuelSettings[key];
  }

  // VAULT SNAPSHOT & REHYDRATION (Zero-Loss Persistence Across Cold Restarts)
  public isEmptyFreshState(): boolean {
    return (
      (this.data.companies?.length || 0) === 0 &&
      (this.data.users?.length || 0) <= 1 &&
      (this.data.vehicles?.length || 0) === 0 &&
      (this.data.counters?.length || 0) === 0 &&
      (this.data.routes?.length || 0) === 0 &&
      (this.data.schedules?.length || 0) === 0 &&
      (this.data.bookings?.length || 0) === 0
    );
  }

  public getVaultSnapshot(): Partial<DatabaseSchema> {
    return {
      companies: this.data.companies || [],
      deletedCompanyIds: this.data.deletedCompanyIds || [],
      users: this.data.users || [],
      supervisors: this.data.supervisors || [],
      drivers: this.data.drivers || [],
      counters: this.data.counters || [],
      vehicles: this.data.vehicles || [],
      routes: this.data.routes || [],
      schedules: this.data.schedules || [],
      bookings: this.data.bookings || [],
      reconciliations: this.data.reconciliations || [],
      fuelEntries: this.data.fuelEntries || [],
      fuelSettings: this.data.fuelSettings || {},
      companySettings: this.data.companySettings || {},
      settings: this.data.settings,
    };
  }

  public getScopedVaultSnapshot(companyId: string): Partial<DatabaseSchema> {
    const company = this.getCompanies().find((c) => c.id === companyId);
    const safeCompanies = company
      ? [
          {
            id: company.id,
            name: company.name,
            logoUrl: company.logoUrl,
            address: company.address,
            phone: company.phone,
            subscriptionExpiry: company.subscriptionExpiry,
            adminLoginId: '',
            adminPinHash: '',
            adminPinSalt: '',
            status: company.status,
            createdAt: company.createdAt,
          },
        ]
      : [];

    const safeUsers = this.getUsers(companyId).map(({ pinHash, pinSalt, ...u }) => ({
      ...u,
      pinHash: '',
      pinSalt: '',
    }));

    return {
      companies: safeCompanies,
      deletedCompanyIds: [],
      users: safeUsers,
      supervisors: this.getSupervisors(companyId),
      drivers: this.getDrivers(companyId),
      counters: this.getCounters(companyId),
      vehicles: this.getVehicles(companyId),
      routes: this.getRoutes(companyId),
      schedules: this.getSchedules(companyId),
      bookings: this.getBookings(companyId),
      reconciliations: this.getReconciliations(companyId),
      fuelEntries: this.getFuelEntries(companyId),
      fuelSettings: { [companyId]: this.getFuelSettings(companyId) },
      settings: this.getSettings(companyId),
    };
  }

  public rehydrateFromVault(vault: Partial<DatabaseSchema>): { restoredCount: number } {
    if (!vault || typeof vault !== 'object') {
      return { restoredCount: 0 };
    }

    let restoredCount = 0;

    if (!Array.isArray(this.data.deletedCompanyIds)) {
      this.data.deletedCompanyIds = [];
    }
    if (Array.isArray(vault.deletedCompanyIds)) {
      for (const delId of vault.deletedCompanyIds) {
        if (delId && !this.data.deletedCompanyIds.includes(delId)) {
          this.data.deletedCompanyIds.push(delId);
        }
      }
    }
    const deletedSet = new Set(this.data.deletedCompanyIds);

    const mergeCollection = <T extends { id: string; companyId?: string }>(target: T[], source?: T[], isCompanyList = false) => {
      if (!Array.isArray(source)) return;
      const existingIds = new Set(target.map((item) => item.id));
      for (const item of source) {
        if (!item || !item.id || existingIds.has(item.id)) continue;
        if (isCompanyList && deletedSet.has(item.id)) continue;
        if (!isCompanyList && item.companyId && deletedSet.has(item.companyId)) continue;
        target.push(item);
        existingIds.add(item.id);
        restoredCount++;
      }
    };

    if (!this.data.companies) this.data.companies = [];
    mergeCollection(this.data.companies, vault.companies, true);

    if (Array.isArray(vault.users)) {
      const existingIds = new Set(this.data.users.map((u) => u.id));
      const existingLoginIds = new Set(this.data.users.map((u) => u.loginId.toLowerCase()));
      for (const u of vault.users) {
        if (
          u &&
          u.id &&
          u.loginId &&
          u.loginId.toLowerCase() !== 'admin' &&
          (!u.companyId || !deletedSet.has(u.companyId)) &&
          !existingIds.has(u.id) &&
          !existingLoginIds.has(u.loginId.toLowerCase())
        ) {
          this.data.users.push(u);
          existingIds.add(u.id);
          existingLoginIds.add(u.loginId.toLowerCase());
          restoredCount++;
        }
      }
    }

    if (!this.data.supervisors) this.data.supervisors = [];
    mergeCollection(this.data.supervisors, vault.supervisors);

    if (!this.data.drivers) this.data.drivers = [];
    mergeCollection(this.data.drivers, vault.drivers);

    if (!this.data.counters) this.data.counters = [];
    mergeCollection(this.data.counters, vault.counters);

    if (!this.data.vehicles) this.data.vehicles = [];
    mergeCollection(this.data.vehicles, vault.vehicles);

    if (!this.data.routes) this.data.routes = [];
    mergeCollection(this.data.routes, vault.routes);

    if (!this.data.schedules) this.data.schedules = [];
    mergeCollection(this.data.schedules, vault.schedules);

    if (!this.data.bookings) this.data.bookings = [];
    mergeCollection(this.data.bookings, vault.bookings);

    if (!this.data.reconciliations) this.data.reconciliations = [];
    mergeCollection(this.data.reconciliations, vault.reconciliations);

    if (!this.data.fuelEntries) this.data.fuelEntries = [];
    mergeCollection(this.data.fuelEntries, vault.fuelEntries);

    if (vault.fuelSettings && typeof vault.fuelSettings === 'object') {
      if (!this.data.fuelSettings) this.data.fuelSettings = {};
      for (const [cmpId, fsVal] of Object.entries(vault.fuelSettings)) {
        if (!deletedSet.has(cmpId) && !this.data.fuelSettings[cmpId] && fsVal) {
          this.data.fuelSettings[cmpId] = fsVal;
          restoredCount++;
        }
      }
    }

    if (vault.settings && typeof vault.settings === 'object') {
      this.data.settings = { ...this.data.settings, ...vault.settings };
    }

    this.purgeOrphanedCompanyRecords(false);
    if (restoredCount > 0) {
      this.save();
    }

    return { restoredCount };
  }

  public restoreFullBackup(vault: Partial<DatabaseSchema>): { restoredCompanies: number; totalRestored: number } {
    if (!vault || typeof vault !== 'object') {
      throw new Error('অবৈধ ব্যাকআপ ফাইল ফরম্যাট।');
    }

    if (Array.isArray(vault.companies)) {
      this.data.companies = vault.companies.filter((c) => c && c.id && c.name);
    }
    this.data.deletedCompanyIds = Array.isArray(vault.deletedCompanyIds) ? vault.deletedCompanyIds : [];

    // Always preserve existing super_admin login accounts so admin is never locked out
    const superAdmins = this.data.users.filter((u) => u.role === 'super_admin' || u.loginId.toLowerCase() === 'admin');
    const incomingUsers = Array.isArray(vault.users)
      ? vault.users.filter((u) => u && u.id && u.loginId && u.role !== 'super_admin' && u.loginId.toLowerCase() !== 'admin')
      : [];
    this.data.users = [...superAdmins, ...incomingUsers];

    if (Array.isArray(vault.supervisors)) this.data.supervisors = vault.supervisors;
    if (Array.isArray(vault.drivers)) this.data.drivers = vault.drivers;
    if (Array.isArray(vault.counters)) this.data.counters = vault.counters;
    if (Array.isArray(vault.vehicles)) this.data.vehicles = vault.vehicles;
    if (Array.isArray(vault.routes)) this.data.routes = vault.routes;
    if (Array.isArray(vault.schedules)) this.data.schedules = vault.schedules;
    if (Array.isArray(vault.bookings)) this.data.bookings = vault.bookings;
    if (Array.isArray(vault.reconciliations)) this.data.reconciliations = vault.reconciliations;
    if (Array.isArray(vault.fuelEntries)) this.data.fuelEntries = vault.fuelEntries;
    if (vault.fuelSettings && typeof vault.fuelSettings === 'object') {
      this.data.fuelSettings = vault.fuelSettings;
    }
    if (vault.companySettings && typeof vault.companySettings === 'object') {
      this.data.companySettings = vault.companySettings;
    }
    if (vault.settings && typeof vault.settings === 'object') {
      this.data.settings = { ...this.data.settings, ...vault.settings };
    }

    this.purgeOrphanedCompanyRecords(false);
    this.save();

    const totalRestored =
      (this.data.companies?.length || 0) +
      (this.data.vehicles?.length || 0) +
      (this.data.routes?.length || 0) +
      (this.data.schedules?.length || 0) +
      (this.data.bookings?.length || 0) +
      (this.data.fuelEntries?.length || 0);

    return {
      restoredCompanies: this.data.companies.length,
      totalRestored,
    };
  }
}

export const db = new Database();
