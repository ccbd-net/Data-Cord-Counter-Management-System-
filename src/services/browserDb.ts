import type {
  Company,
  User,
  Schedule,
  Booking,
  Vehicle,
  Counter,
  RouteItem,
  Supervisor,
  Driver,
  FuelEntry,
  FuelSettings,
  Reconciliation,
  SystemSettings,
} from '../types/index.ts';

const DB_NAME = 'BusCounterDB_v1';
const DB_VERSION = 2;
const SYNC_CHANNEL_NAME = 'zb_cross_page_sync';
const SYNC_STORAGE_KEY = 'zb_data_sync_timestamp';
const VAULT_LS_KEY = 'zb_primary_vault_backup_v1';

export interface FullVaultSnapshot {
  companies?: Company[];
  users?: any[];
  supervisors?: Supervisor[];
  drivers?: Driver[];
  counters?: Counter[];
  vehicles?: Vehicle[];
  routes?: RouteItem[];
  schedules?: Schedule[];
  bookings?: Booking[];
  reconciliations?: Reconciliation[];
  fuelEntries?: FuelEntry[];
  fuelSettings?: Record<string, FuelSettings>;
  settings?: SystemSettings;
  updatedAt?: string;
}

export interface SyncPayload {
  type:
    | 'BOOKING_CREATED'
    | 'BOOKING_CANCELLED'
    | 'SCHEDULE_CREATED'
    | 'SCHEDULE_UPDATED'
    | 'SCHEDULE_DELETED'
    | 'VEHICLE_UPDATED'
    | 'COUNTER_UPDATED'
    | 'ROUTE_UPDATED'
    | 'FUEL_ENTRY_CREATED'
    | 'COMPANY_CHANGED'
    | 'VAULT_REHYDRATED'
    | 'FORCE_REFRESH';
  companyId?: string | null;
  entityId?: string;
  timestamp: number;
}

// Global broadcast channel for cross-tab and cross-page real-time sync
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch {
    broadcastChannel = null;
  }
}

/**
 * Open or upgrade the client IndexedDB database
 */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Schedules store
      if (!db.objectStoreNames.contains('schedules')) {
        const schedStore = db.createObjectStore('schedules', { keyPath: 'id' });
        schedStore.createIndex('companyId', 'companyId', { unique: false });
        schedStore.createIndex('date', 'date', { unique: false });
        schedStore.createIndex('direction', 'direction', { unique: false });
        schedStore.createIndex('company_date', ['companyId', 'date'], { unique: false });
      }

      // 2. Bookings store
      if (!db.objectStoreNames.contains('bookings')) {
        const bookStore = db.createObjectStore('bookings', { keyPath: 'id' });
        bookStore.createIndex('companyId', 'companyId', { unique: false });
        bookStore.createIndex('scheduleId', 'scheduleId', { unique: false });
        bookStore.createIndex('tripDate', 'tripDate', { unique: false });
        bookStore.createIndex('ticketNo', 'ticketNo', { unique: false });
        bookStore.createIndex('company_date', ['companyId', 'tripDate'], { unique: false });
      }

      // 3. Vehicles store
      if (!db.objectStoreNames.contains('vehicles')) {
        const vehStore = db.createObjectStore('vehicles', { keyPath: 'id' });
        vehStore.createIndex('companyId', 'companyId', { unique: false });
      }

      // 4. Counters store
      if (!db.objectStoreNames.contains('counters')) {
        const cntStore = db.createObjectStore('counters', { keyPath: 'id' });
        cntStore.createIndex('companyId', 'companyId', { unique: false });
      }

      // 5. Routes store
      if (!db.objectStoreNames.contains('routes')) {
        const rtStore = db.createObjectStore('routes', { keyPath: 'id' });
        rtStore.createIndex('companyId', 'companyId', { unique: false });
      }

      // 6. Fuel entries
      if (!db.objectStoreNames.contains('fuelEntries')) {
        const fuelStore = db.createObjectStore('fuelEntries', { keyPath: 'id' });
        fuelStore.createIndex('companyId', 'companyId', { unique: false });
      }

      // 7. Supervisors & Drivers
      if (!db.objectStoreNames.contains('supervisors')) {
        const supStore = db.createObjectStore('supervisors', { keyPath: 'id' });
        supStore.createIndex('companyId', 'companyId', { unique: false });
      }

      if (!db.objectStoreNames.contains('drivers')) {
        const drvStore = db.createObjectStore('drivers', { keyPath: 'id' });
        drvStore.createIndex('companyId', 'companyId', { unique: false });
      }

      // 8. General Metadata & Settings
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }

      // 9. Companies store (v2)
      if (!db.objectStoreNames.contains('companies')) {
        db.createObjectStore('companies', { keyPath: 'id' });
      }

      // 10. Users store (v2)
      if (!db.objectStoreNames.contains('users')) {
        const usrStore = db.createObjectStore('users', { keyPath: 'id' });
        usrStore.createIndex('companyId', 'companyId', { unique: false });
      }

      // 11. Reconciliations store (v2)
      if (!db.objectStoreNames.contains('reconciliations')) {
        const recStore = db.createObjectStore('reconciliations', { keyPath: 'id' });
        recStore.createIndex('companyId', 'companyId', { unique: false });
      }

      // 12. Full Vault store (v2)
      if (!db.objectStoreNames.contains('vault')) {
        db.createObjectStore('vault', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * LocalStorage Fallback Helpers for Instant 0ms Synchronous Access
 */
function getStorageKey(entity: string, companyId?: string | null): string {
  return `zb_cache_${entity}_${companyId || 'all'}`;
}

function readLocalStorage<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalStorage<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`LocalStorage write error for ${key}:`, e);
  }
}

function mergeScopedLocalStorage<T extends { id: string; companyId?: string }>(
  entity: string,
  items: T[],
  companyId?: string | null
) {
  if (companyId) {
    writeLocalStorage(getStorageKey(entity, companyId), items);
    const globalKey = getStorageKey(entity, 'all');
    const existingAll = readLocalStorage<T>(globalKey);
    const withoutCompany = existingAll.filter((x) => x.companyId !== companyId);
    writeLocalStorage(globalKey, [...withoutCompany, ...items]);
  } else {
    writeLocalStorage(getStorageKey(entity, 'all'), items);
  }
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    return await new Promise<T[]>((res, rej) => {
      req.onsuccess = () => res((req.result as T[]) || []);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return [];
  }
}

async function idbPutMany<T>(storeName: string, items: T[]): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn(`IndexedDB write ${storeName} error:`, e);
  }
}

async function idbDeleteOne(storeName: string, id: string): Promise<void> {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

/**
 * Main Browser Database Service
 */
export const browserDb = {
  // Real-time Event Broadcaster across Pages, Windows & Tabs
  broadcastSync(payload: Omit<SyncPayload, 'timestamp'>) {
    const fullPayload: SyncPayload = {
      ...payload,
      timestamp: Date.now(),
    };

    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(fullPayload);
      } catch (e) {
        console.warn('BroadcastChannel postMessage error:', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zb:data-sync', { detail: fullPayload }));
      try {
        localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(fullPayload));
      } catch {}
    }
  },

  // Subscribe to real-time changes
  onSync(listener: (payload: SyncPayload) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const bcHandler = (ev: MessageEvent) => {
      if (ev.data && ev.data.type) {
        listener(ev.data as SyncPayload);
      }
    };

    const domHandler = (ev: Event) => {
      const customEv = ev as CustomEvent<SyncPayload>;
      if (customEv.detail) {
        listener(customEv.detail);
      }
    };

    const storageHandler = (ev: StorageEvent) => {
      if (ev.key === SYNC_STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          listener(parsed);
        } catch {}
      }
    };

    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', bcHandler);
    }
    window.addEventListener('zb:data-sync', domHandler);
    window.addEventListener('storage', storageHandler);

    return () => {
      if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', bcHandler);
      }
      window.removeEventListener('zb:data-sync', domHandler);
      window.removeEventListener('storage', storageHandler);
    };
  },

  // -------------------------------------------------------------
  // FULL VAULT SNAPSHOT (For 10-minute Restart & Cold Boot Rehydration)
  // -------------------------------------------------------------
  async saveFullVault(vault: FullVaultSnapshot): Promise<void> {
    const payload = {
      key: 'primary_vault',
      ...vault,
      updatedAt: new Date().toISOString(),
    };

    // 1. Write to IndexedDB (large capacity — handles logos cleanly)
    try {
      const db = await openIndexedDB();
      const tx = db.transaction('vault', 'readwrite');
      tx.objectStore('vault').put(payload);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IndexedDB vault write error:', e);
    }

    // 2. Also mirror individual stores
    if (vault.companies) await idbPutMany('companies', vault.companies);
    if (vault.users) await idbPutMany('users', vault.users);
    if (vault.counters) await idbPutMany('counters', vault.counters);
    if (vault.vehicles) await idbPutMany('vehicles', vault.vehicles);
    if (vault.routes) await idbPutMany('routes', vault.routes);
    if (vault.schedules) await idbPutMany('schedules', vault.schedules);
    if (vault.bookings) await idbPutMany('bookings', vault.bookings);
    if (vault.supervisors) await idbPutMany('supervisors', vault.supervisors);
    if (vault.drivers) await idbPutMany('drivers', vault.drivers);
    if (vault.reconciliations) await idbPutMany('reconciliations', vault.reconciliations);
    if (vault.fuelEntries) await idbPutMany('fuelEntries', vault.fuelEntries);

    // 3. Mirror to LocalStorage if within quota
    try {
      localStorage.setItem(VAULT_LS_KEY, JSON.stringify(payload));
    } catch {
      // If logos push localStorage over 5MB, save a compact vault without oversized base64 images
      try {
        const compactVault = {
          ...payload,
          companies: (payload.companies || []).map((c: any) => ({
            ...c,
            logoUrl: c.logoUrl && c.logoUrl.length > 50000 ? '' : c.logoUrl,
          })),
        };
        localStorage.setItem(VAULT_LS_KEY, JSON.stringify(compactVault));
      } catch {}
    }

    if (vault.companies) {
      writeLocalStorage(getStorageKey('companies', 'all'), vault.companies);
    }
  },

  async getFullVault(): Promise<FullVaultSnapshot | null> {
    // 1. Try IndexedDB primary_vault first
    try {
      const db = await openIndexedDB();
      const tx = db.transaction('vault', 'readonly');
      const req = tx.objectStore('vault').get('primary_vault');
      const result: any = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (result && ((result.companies?.length || 0) > 0 || (result.vehicles?.length || 0) > 0 || (result.schedules?.length || 0) > 0)) {
        return result as FullVaultSnapshot;
      }
    } catch {}

    // 2. Fallback to LocalStorage backup
    try {
      const raw = localStorage.getItem(VAULT_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && ((parsed.companies?.length || 0) > 0 || (parsed.vehicles?.length || 0) > 0 || (parsed.schedules?.length || 0) > 0)) {
          return parsed as FullVaultSnapshot;
        }
      }
    } catch {}

    // 3. Assemble from individual stores if primary_vault wasn't written yet
    const [companies, users, counters, vehicles, routes, schedules, bookings, supervisors, drivers, reconciliations, fuelEntries] =
      await Promise.all([
        this.getCompanies(),
        idbGetAll<User>('users'),
        this.getCounters(null),
        this.getVehicles(null),
        this.getRoutes(null),
        this.getSchedules(null),
        this.getBookings(null),
        this.getSupervisors(null),
        this.getDrivers(null),
        idbGetAll<Reconciliation>('reconciliations'),
        this.getFuelEntries(null),
      ]);

    if (
      companies.length === 0 &&
      vehicles.length === 0 &&
      counters.length === 0 &&
      routes.length === 0 &&
      schedules.length === 0
    ) {
      return null;
    }

    return {
      companies,
      users,
      counters,
      vehicles,
      routes,
      schedules,
      bookings,
      supervisors,
      drivers,
      reconciliations,
      fuelEntries,
    };
  },

  // -------------------------------------------------------------
  // COMPANIES
  // -------------------------------------------------------------
  async getCompanies(): Promise<Company[]> {
    const idbList = await idbGetAll<Company>('companies');
    if (idbList.length > 0) {
      writeLocalStorage(getStorageKey('companies', 'all'), idbList);
      return idbList;
    }
    return readLocalStorage<Company>(getStorageKey('companies', 'all'));
  },

  async saveCompanies(companies: Company[], broadcast: boolean = false): Promise<void> {
    try {
      const db = await openIndexedDB();
      const tx = db.transaction('companies', 'readwrite');
      const store = tx.objectStore('companies');
      store.clear();
      for (const c of companies) {
        store.put(c);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
    writeLocalStorage(getStorageKey('companies', 'all'), companies);

    if (broadcast) {
      this.broadcastSync({ type: 'COMPANY_CHANGED' });
    }
  },

  async saveCompany(company: Company, broadcast: boolean = true): Promise<void> {
    await idbPutMany('companies', [company]);
    const existing = readLocalStorage<Company>(getStorageKey('companies', 'all'));
    const idx = existing.findIndex((c) => c.id === company.id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...company };
    } else {
      existing.push(company);
    }
    writeLocalStorage(getStorageKey('companies', 'all'), existing);
    if (broadcast) {
      this.broadcastSync({ type: 'COMPANY_CHANGED', companyId: company.id });
    }
  },

  async deleteCompany(companyId: string): Promise<void> {
    await idbDeleteOne('companies', companyId);
    const existing = readLocalStorage<Company>(getStorageKey('companies', 'all')).filter(
      (c) => c.id !== companyId
    );
    writeLocalStorage(getStorageKey('companies', 'all'), existing);

    // Also strip company's items from cached vault
    const vault = await this.getFullVault();
    if (vault) {
      vault.companies = (vault.companies || []).filter((c) => c.id !== companyId);
      vault.users = (vault.users || []).filter((u) => u.companyId !== companyId);
      vault.counters = (vault.counters || []).filter((c) => c.companyId !== companyId);
      vault.vehicles = (vault.vehicles || []).filter((v) => v.companyId !== companyId);
      vault.routes = (vault.routes || []).filter((r) => r.companyId !== companyId);
      vault.supervisors = (vault.supervisors || []).filter((s) => s.companyId !== companyId);
      vault.drivers = (vault.drivers || []).filter((d) => d.companyId !== companyId);
      vault.schedules = (vault.schedules || []).filter((s) => s.companyId !== companyId);
      vault.bookings = (vault.bookings || []).filter((b) => b.companyId !== companyId);
      vault.fuelEntries = (vault.fuelEntries || []).filter((f) => f.companyId !== companyId);
      await this.saveFullVault(vault);
    }

    this.broadcastSync({ type: 'COMPANY_CHANGED', companyId });
  },

  // -------------------------------------------------------------
  // SCHEDULES
  // -------------------------------------------------------------
  async getSchedules(companyId?: string | null, date?: string, direction?: string): Promise<Schedule[]> {
    const lsKey = getStorageKey('schedules', companyId);
    let cached = readLocalStorage<Schedule>(lsKey);

    if (cached.length === 0 && companyId) {
      cached = readLocalStorage<Schedule>(getStorageKey('schedules', 'all')).filter(
        (s) => s.companyId === companyId
      );
    }

    const all = await idbGetAll<Schedule>('schedules');
    if (all.length > 0) {
      cached = companyId ? all.filter((s) => s.companyId === companyId) : all;
    }

    if (date) {
      cached = cached.filter((s) => s.date === date);
    }
    if (direction && direction !== 'ALL') {
      cached = cached.filter((s) => s.direction === direction);
    }

    return cached;
  },

  async saveSchedules(schedules: Schedule[], companyId?: string | null, broadcast: boolean = false): Promise<void> {
    if (!schedules || schedules.length === 0) return;

    const lsKey = getStorageKey('schedules', companyId);
    const existing = readLocalStorage<Schedule>(lsKey);
    const map = new Map<string, Schedule>();
    existing.forEach((s) => map.set(s.id, s));
    schedules.forEach((s) => map.set(s.id, s));
    writeLocalStorage(lsKey, Array.from(map.values()));

    const globalKey = getStorageKey('schedules', 'all');
    const globalExisting = readLocalStorage<Schedule>(globalKey);
    const globalMap = new Map<string, Schedule>();
    globalExisting.forEach((s) => globalMap.set(s.id, s));
    schedules.forEach((s) => globalMap.set(s.id, s));
    writeLocalStorage(globalKey, Array.from(globalMap.values()));

    await idbPutMany('schedules', schedules);

    if (broadcast) {
      this.broadcastSync({ type: 'SCHEDULE_CREATED', companyId });
    }
  },

  async saveSchedule(schedule: Schedule, broadcast: boolean = true): Promise<void> {
    await this.saveSchedules([schedule], schedule.companyId, broadcast);
  },

  async deleteSchedule(scheduleId: string, companyId?: string | null): Promise<void> {
    const lsKey = getStorageKey('schedules', companyId);
    writeLocalStorage(
      lsKey,
      readLocalStorage<Schedule>(lsKey).filter((s) => s.id !== scheduleId)
    );

    const globalKey = getStorageKey('schedules', 'all');
    writeLocalStorage(
      globalKey,
      readLocalStorage<Schedule>(globalKey).filter((s) => s.id !== scheduleId)
    );

    await idbDeleteOne('schedules', scheduleId);
    this.broadcastSync({ type: 'SCHEDULE_DELETED', companyId, entityId: scheduleId });
  },

  // -------------------------------------------------------------
  // BOOKINGS
  // -------------------------------------------------------------
  async getBookings(companyId?: string | null, date?: string, scheduleId?: string): Promise<Booking[]> {
    const lsKey = getStorageKey('bookings', companyId);
    let cached = readLocalStorage<Booking>(lsKey);

    if (cached.length === 0 && companyId) {
      cached = readLocalStorage<Booking>(getStorageKey('bookings', 'all')).filter(
        (b) => b.companyId === companyId
      );
    }

    const all = await idbGetAll<Booking>('bookings');
    if (all.length > 0) {
      cached = companyId ? all.filter((b) => b.companyId === companyId) : all;
    }

    if (date) {
      cached = cached.filter((b) => b.tripDate === date);
    }
    if (scheduleId) {
      cached = cached.filter((b) => b.scheduleId === scheduleId);
    }

    return cached;
  },

  async saveBookings(bookings: Booking[], companyId?: string | null, broadcast: boolean = false): Promise<void> {
    if (!bookings || bookings.length === 0) return;

    const lsKey = getStorageKey('bookings', companyId);
    const existing = readLocalStorage<Booking>(lsKey);
    const map = new Map<string, Booking>();
    existing.forEach((b) => map.set(b.id, b));
    bookings.forEach((b) => map.set(b.id, b));
    writeLocalStorage(lsKey, Array.from(map.values()));

    const globalKey = getStorageKey('bookings', 'all');
    const globalExisting = readLocalStorage<Booking>(globalKey);
    const globalMap = new Map<string, Booking>();
    globalExisting.forEach((b) => globalMap.set(b.id, b));
    bookings.forEach((b) => globalMap.set(b.id, b));
    writeLocalStorage(globalKey, Array.from(globalMap.values()));

    await idbPutMany('bookings', bookings);

    if (broadcast) {
      this.broadcastSync({ type: 'BOOKING_CREATED', companyId });
    }
  },

  async saveBooking(booking: Booking, broadcast: boolean = true): Promise<void> {
    await this.saveBookings([booking], booking.companyId, broadcast);
  },

  async cancelBooking(bookingId: string, companyId?: string | null): Promise<void> {
    const updateList = (list: Booking[]) =>
      list.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' as const } : b));

    const lsKey = getStorageKey('bookings', companyId);
    writeLocalStorage(lsKey, updateList(readLocalStorage<Booking>(lsKey)));

    const globalKey = getStorageKey('bookings', 'all');
    writeLocalStorage(globalKey, updateList(readLocalStorage<Booking>(globalKey)));

    try {
      const db = await openIndexedDB();
      const tx = db.transaction('bookings', 'readwrite');
      const store = tx.objectStore('bookings');
      const req = store.get(bookingId);
      req.onsuccess = () => {
        if (req.result) {
          store.put({ ...req.result, status: 'cancelled' });
        }
      };
    } catch {}

    this.broadcastSync({ type: 'BOOKING_CANCELLED', companyId, entityId: bookingId });
  },

  // -------------------------------------------------------------
  // COUNTERS & VEHICLES & ROUTES
  // -------------------------------------------------------------
  async getCounters(companyId?: string | null): Promise<Counter[]> {
    const all = await idbGetAll<Counter>('counters');
    if (all.length > 0) {
      return companyId ? all.filter((c) => c.companyId === companyId) : all;
    }
    const lsKey = getStorageKey('counters', companyId);
    let list = readLocalStorage<Counter>(lsKey);
    if (list.length === 0 && companyId) {
      list = readLocalStorage<Counter>(getStorageKey('counters', 'all')).filter(
        (c) => c.companyId === companyId
      );
    }
    return list;
  },

  async saveCounters(counters: Counter[], companyId?: string | null): Promise<void> {
    mergeScopedLocalStorage('counters', counters, companyId);
    await idbPutMany('counters', counters);
  },

  async deleteCounter(id: string, companyId?: string | null): Promise<void> {
    await idbDeleteOne('counters', id);
    if (companyId) {
      const lsKey = getStorageKey('counters', companyId);
      writeLocalStorage(lsKey, readLocalStorage<Counter>(lsKey).filter((c) => c.id !== id));
    }
    const globalKey = getStorageKey('counters', 'all');
    writeLocalStorage(globalKey, readLocalStorage<Counter>(globalKey).filter((c) => c.id !== id));
  },

  async getVehicles(companyId?: string | null): Promise<Vehicle[]> {
    const all = await idbGetAll<Vehicle>('vehicles');
    if (all.length > 0) {
      return companyId ? all.filter((v) => v.companyId === companyId) : all;
    }
    const lsKey = getStorageKey('vehicles', companyId);
    let list = readLocalStorage<Vehicle>(lsKey);
    if (list.length === 0 && companyId) {
      list = readLocalStorage<Vehicle>(getStorageKey('vehicles', 'all')).filter(
        (v) => v.companyId === companyId
      );
    }
    return list;
  },

  async saveVehicles(vehicles: Vehicle[], companyId?: string | null): Promise<void> {
    mergeScopedLocalStorage('vehicles', vehicles, companyId);
    await idbPutMany('vehicles', vehicles);
  },

  async deleteVehicle(id: string, companyId?: string | null): Promise<void> {
    await idbDeleteOne('vehicles', id);
    if (companyId) {
      const lsKey = getStorageKey('vehicles', companyId);
      writeLocalStorage(lsKey, readLocalStorage<Vehicle>(lsKey).filter((v) => v.id !== id));
    }
    const globalKey = getStorageKey('vehicles', 'all');
    writeLocalStorage(globalKey, readLocalStorage<Vehicle>(globalKey).filter((v) => v.id !== id));
  },

  async getRoutes(companyId?: string | null): Promise<RouteItem[]> {
    const all = await idbGetAll<RouteItem>('routes');
    if (all.length > 0) {
      return companyId ? all.filter((r) => r.companyId === companyId) : all;
    }
    const lsKey = getStorageKey('routes', companyId);
    let list = readLocalStorage<RouteItem>(lsKey);
    if (list.length === 0 && companyId) {
      list = readLocalStorage<RouteItem>(getStorageKey('routes', 'all')).filter(
        (r) => r.companyId === companyId
      );
    }
    return list;
  },

  async saveRoutes(routes: RouteItem[], companyId?: string | null): Promise<void> {
    mergeScopedLocalStorage('routes', routes, companyId);
    await idbPutMany('routes', routes);
  },

  async deleteRoute(id: string, companyId?: string | null): Promise<void> {
    await idbDeleteOne('routes', id);
    if (companyId) {
      const lsKey = getStorageKey('routes', companyId);
      writeLocalStorage(lsKey, readLocalStorage<RouteItem>(lsKey).filter((r) => r.id !== id));
    }
    const globalKey = getStorageKey('routes', 'all');
    writeLocalStorage(globalKey, readLocalStorage<RouteItem>(globalKey).filter((r) => r.id !== id));
  },

  // -------------------------------------------------------------
  // SUPERVISORS & DRIVERS
  // -------------------------------------------------------------
  async getSupervisors(companyId?: string | null): Promise<Supervisor[]> {
    const all = await idbGetAll<Supervisor>('supervisors');
    if (all.length > 0) {
      return companyId ? all.filter((s) => s.companyId === companyId) : all;
    }
    return readLocalStorage<Supervisor>(getStorageKey('supervisors', companyId));
  },

  async saveSupervisors(supervisors: Supervisor[], companyId?: string | null): Promise<void> {
    mergeScopedLocalStorage('supervisors', supervisors, companyId);
    await idbPutMany('supervisors', supervisors);
  },

  async deleteSupervisor(id: string, companyId?: string | null): Promise<void> {
    await idbDeleteOne('supervisors', id);
    if (companyId) {
      const lsKey = getStorageKey('supervisors', companyId);
      writeLocalStorage(lsKey, readLocalStorage<Supervisor>(lsKey).filter((s) => s.id !== id));
    }
  },

  async getDrivers(companyId?: string | null): Promise<Driver[]> {
    const all = await idbGetAll<Driver>('drivers');
    if (all.length > 0) {
      return companyId ? all.filter((d) => d.companyId === companyId) : all;
    }
    return readLocalStorage<Driver>(getStorageKey('drivers', companyId));
  },

  async saveDrivers(drivers: Driver[], companyId?: string | null): Promise<void> {
    mergeScopedLocalStorage('drivers', drivers, companyId);
    await idbPutMany('drivers', drivers);
  },

  async deleteDriver(id: string, companyId?: string | null): Promise<void> {
    await idbDeleteOne('drivers', id);
    if (companyId) {
      const lsKey = getStorageKey('drivers', companyId);
      writeLocalStorage(lsKey, readLocalStorage<Driver>(lsKey).filter((d) => d.id !== id));
    }
  },

  // -------------------------------------------------------------
  // FUEL ENTRIES
  // -------------------------------------------------------------
  async getFuelEntries(companyId?: string | null): Promise<FuelEntry[]> {
    const all = await idbGetAll<FuelEntry>('fuelEntries');
    if (all.length > 0) {
      return companyId ? all.filter((f) => f.companyId === companyId) : all;
    }
    const lsKey = getStorageKey('fuelEntries', companyId);
    let list = readLocalStorage<FuelEntry>(lsKey);
    if (list.length === 0 && companyId) {
      list = readLocalStorage<FuelEntry>(getStorageKey('fuelEntries', 'all')).filter(
        (f) => f.companyId === companyId
      );
    }
    return list;
  },

  async saveFuelEntries(entries: FuelEntry[], companyId?: string | null, broadcast: boolean = false): Promise<void> {
    mergeScopedLocalStorage('fuelEntries', entries, companyId);
    await idbPutMany('fuelEntries', entries);

    if (broadcast) {
      this.broadcastSync({ type: 'FUEL_ENTRY_CREATED', companyId });
    }
  },

  async deleteFuelEntry(id: string, companyId?: string | null): Promise<void> {
    await idbDeleteOne('fuelEntries', id);
    if (companyId) {
      const lsKey = getStorageKey('fuelEntries', companyId);
      writeLocalStorage(lsKey, readLocalStorage<FuelEntry>(lsKey).filter((f) => f.id !== id));
    }
  },

  async clearAllCache(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('zb_db_') || k.startsWith('zb_cache_') || k.startsWith('BusCounter') || k.startsWith('zb_offline') || k === VAULT_LS_KEY) {
          localStorage.removeItem(k);
        }
      });
      const db = await openIndexedDB();
      const stores = [
        'companies',
        'users',
        'schedules',
        'bookings',
        'vehicles',
        'counters',
        'routes',
        'fuelEntries',
        'supervisors',
        'drivers',
        'reconciliations',
        'vault',
      ];
      const existingStores = stores.filter((s) => db.objectStoreNames.contains(s));
      if (existingStores.length > 0) {
        const tx = db.transaction(existingStores, 'readwrite');
        for (const st of existingStores) {
          tx.objectStore(st).clear();
        }
      }
    } catch (e) {
      console.warn('Error clearing browserDb cache:', e);
    }
  },
};
