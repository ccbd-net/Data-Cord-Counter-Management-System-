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
  AnalyticsSummary,
  WeeklyTrendsSummary,
  Company,
  Supervisor,
  Driver,
  FuelEntry,
  FuelSettings,
} from '../types/index.ts';
import { browserDb } from './browserDb.ts';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('zb_auth_token');
  const activeCompanyId = localStorage.getItem('zb_active_company_id');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (activeCompanyId) headers['x-company-id'] = activeCompanyId;
  return headers;
}

let activeRehydrateLock: Promise<boolean> | null = null;
let lastSyncTime = 0;

async function performVaultRehydration(): Promise<boolean> {
  if (activeRehydrateLock) {
    return activeRehydrateLock;
  }

  activeRehydrateLock = (async () => {
    try {
      const vault = await browserDb.getFullVault();
      if (!vault) return false;

      const hasData =
        (vault.companies?.length || 0) > 0 ||
        (vault.vehicles?.length || 0) > 0 ||
        (vault.counters?.length || 0) > 0 ||
        (vault.routes?.length || 0) > 0 ||
        (vault.schedules?.length || 0) > 0;

      if (!hasData) return false;

      const res = await fetch(`${API_BASE}/sync/rehydrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ vault }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.restoredCount > 0) {
          browserDb.broadcastSync({ type: 'VAULT_REHYDRATED' });
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      activeRehydrateLock = null;
    }
  })();

  return activeRehydrateLock;
}

async function fetchWithAutoRehydrate(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    const token = localStorage.getItem('zb_auth_token');
    if (token) {
      const rehydrated = await performVaultRehydration();
      if (rehydrated) {
        const retryHeaders = {
          ...(init?.headers || {}),
          ...getAuthHeader(),
        };
        return fetch(url, { ...init, headers: retryHeaders });
      }
    }
  }
  return res;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.error || data.message || `অনুরোধ ব্যর্থ হয়েছে (${res.status})`;
    const err = new Error(errorMsg) as any;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  // Vault Sync & Rehydration
  async ensureServerHydrated(forceCheck: boolean = false): Promise<boolean> {
    const now = Date.now();
    if (!forceCheck && now - lastSyncTime < 5000) {
      return false;
    }
    try {
      const res = await fetch(`${API_BASE}/sync/status`);
      if (!res.ok) return false;
      const status = await res.json();
      lastSyncTime = Date.now();
      if (status.isEmptyFreshState || status.companiesCount === 0) {
        return await performVaultRehydration();
      }
      return false;
    } catch {
      return false;
    }
  },

  async syncVaultSnapshot(options?: { force?: boolean }): Promise<void> {
    const token = localStorage.getItem('zb_auth_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/sync/vault`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && data.vault) {
        const serverHasData =
          (data.vault.companies?.length || 0) > 0 ||
          (data.vault.vehicles?.length || 0) > 0 ||
          (data.vault.schedules?.length || 0) > 0;

        if (serverHasData || options?.force) {
          await browserDb.saveFullVault(data.vault);
        }
      }
    } catch {}
  },

  // Auth
  async login(loginId: string, pin: string): Promise<{ success: boolean; token: string; user: User }> {
    await api.ensureServerHydrated(true);
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, pin }),
    });
    const result = await handleResponse<{ success: boolean; token: string; user: User }>(res);
    if (result.success) {
      setTimeout(() => {
        api.syncVaultSnapshot().catch(() => {});
      }, 100);
    }
    return result;
  },

  async getMe(): Promise<{ user: User }> {
    await api.ensureServerHydrated();
    const res = await fetchWithAutoRehydrate(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ user: User }>(res);
    if (result.user) {
      api.syncVaultSnapshot().catch(() => {});
    }
    return result;
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    }).catch(() => {});
    localStorage.removeItem('zb_auth_token');
  },

  // Users
  async getUsers(): Promise<{ users: User[] }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/users`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createUser(data: any): Promise<{ success: boolean; user: User }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; user: User }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async updateUser(id: string, data: any): Promise<{ success: boolean; user: User }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; user: User }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/users/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  // Counters
  async getCounters(): Promise<{ counters: (Counter & { assignedUsers?: any[] })[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/counters`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ counters: (Counter & { assignedUsers?: any[] })[] }>(res);
      if (data && data.counters && data.counters.length > 0) {
        browserDb.saveCounters(data.counters, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getCounters(activeCompanyId);
      if (cached && cached.length > 0) {
        return { counters: cached };
      }
      throw err;
    }
  },

  async createCounter(data: Partial<Counter>): Promise<{ success: boolean; counter: Counter }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/counters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; counter: Counter }>(res);
    if (result.success && result.counter) {
      const activeCompanyId = result.counter.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getCounters(activeCompanyId);
      await browserDb.saveCounters([...current.filter((c) => c.id !== result.counter.id), result.counter], activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'COUNTER_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  async updateCounter(id: string, data: Partial<Counter>): Promise<{ success: boolean; counter: Counter }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/counters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; counter: Counter }>(res);
    if (result.success && result.counter) {
      const activeCompanyId = result.counter.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getCounters(activeCompanyId);
      const updated = current.map((c) => (c.id === id ? { ...c, ...result.counter } : c));
      await browserDb.saveCounters(updated, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'COUNTER_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  async deleteCounter(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/counters/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      const activeCompanyId = localStorage.getItem('zb_active_company_id');
      await browserDb.deleteCounter(id, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'COUNTER_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  // Vehicles
  async getVehicles(): Promise<{ vehicles: Vehicle[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/vehicles`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ vehicles: Vehicle[] }>(res);
      if (data && data.vehicles && data.vehicles.length > 0) {
        browserDb.saveVehicles(data.vehicles, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getVehicles(activeCompanyId);
      if (cached && cached.length > 0) {
        return { vehicles: cached };
      }
      throw err;
    }
  },

  async createVehicle(data: Partial<Vehicle>): Promise<{ success: boolean; vehicle: Vehicle }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; vehicle: Vehicle }>(res);
    if (result.success && result.vehicle) {
      const activeCompanyId = result.vehicle.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getVehicles(activeCompanyId);
      await browserDb.saveVehicles([...current.filter((v) => v.id !== result.vehicle.id), result.vehicle], activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'VEHICLE_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  async updateVehicle(id: string, data: Partial<Vehicle>): Promise<{ success: boolean; vehicle: Vehicle }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/vehicles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; vehicle: Vehicle }>(res);
    if (result.success && result.vehicle) {
      const activeCompanyId = result.vehicle.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getVehicles(activeCompanyId);
      const updated = current.map((v) => (v.id === id ? { ...v, ...result.vehicle } : v));
      await browserDb.saveVehicles(updated, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'VEHICLE_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  async deleteVehicle(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/vehicles/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      const activeCompanyId = localStorage.getItem('zb_active_company_id');
      await browserDb.deleteVehicle(id, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'VEHICLE_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  async getVehicleSeats(id: string): Promise<{ vehicleId: string; regNo: string; seatCapacity: 42 | 46; seats: string[] }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/vehicles/${id}/seats`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Supervisors (Strictly directory - NO LOGIN)
  async getSupervisors(): Promise<{ supervisors: Supervisor[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/supervisors`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ supervisors: Supervisor[] }>(res);
      if (data && data.supervisors && data.supervisors.length > 0) {
        browserDb.saveSupervisors(data.supervisors, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getSupervisors(activeCompanyId);
      if (cached && cached.length > 0) {
        return { supervisors: cached };
      }
      throw err;
    }
  },

  async createSupervisor(data: { name: string; phone?: string; companyId?: string }): Promise<{ success: boolean; supervisor: Supervisor }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/supervisors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; supervisor: Supervisor }>(res);
    if (result.success && result.supervisor) {
      const activeCompanyId = result.supervisor.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getSupervisors(activeCompanyId);
      await browserDb.saveSupervisors([...current.filter((s) => s.id !== result.supervisor.id), result.supervisor], activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async updateSupervisor(id: string, data: Partial<Supervisor>): Promise<{ success: boolean; supervisor: Supervisor }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/supervisors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; supervisor: Supervisor }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async deleteSupervisor(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/supervisors/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      const activeCompanyId = localStorage.getItem('zb_active_company_id');
      await browserDb.deleteSupervisor(id, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  // Drivers (Strictly name directory - NO LOGIN)
  async getDrivers(): Promise<{ drivers: Driver[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/drivers`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ drivers: Driver[] }>(res);
      if (data && data.drivers && data.drivers.length > 0) {
        browserDb.saveDrivers(data.drivers, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getDrivers(activeCompanyId);
      if (cached && cached.length > 0) {
        return { drivers: cached };
      }
      throw err;
    }
  },

  async createDriver(data: { name: string; phone?: string; companyId?: string }): Promise<{ success: boolean; driver: Driver }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/drivers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; driver: Driver }>(res);
    if (result.success && result.driver) {
      const activeCompanyId = result.driver.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getDrivers(activeCompanyId);
      await browserDb.saveDrivers([...current.filter((d) => d.id !== result.driver.id), result.driver], activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async updateDriver(id: string, data: Partial<Driver>): Promise<{ success: boolean; driver: Driver }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/drivers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; driver: Driver }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async deleteDriver(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/drivers/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      const activeCompanyId = localStorage.getItem('zb_active_company_id');
      await browserDb.deleteDriver(id, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  // Companies
  async getPublicCompanies(): Promise<{ companies: Partial<Company>[] }> {
    await api.ensureServerHydrated();
    try {
      const res = await fetch(`${API_BASE}/companies/public`);
      const data = await handleResponse<{ companies: Partial<Company>[] }>(res);
      if ((!data.companies || data.companies.length === 0)) {
        const cached = await browserDb.getCompanies();
        if (cached.length > 0) {
          const restored = await performVaultRehydration();
          if (restored) {
            const retryRes = await fetch(`${API_BASE}/companies/public`);
            return handleResponse(retryRes);
          }
          return { companies: cached };
        }
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getCompanies();
      if (cached.length > 0) {
        return { companies: cached };
      }
      throw err;
    }
  },

  async getCompanies(): Promise<{ companies: Company[] }> {
    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/companies`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ companies: Company[] }>(res);
      if (data.companies && data.companies.length > 0) {
        browserDb.saveCompanies(data.companies, false).catch(() => {});
        return data;
      }

      // If server returned empty list, check if we have saved companies in IndexedDB vault
      const cached = await browserDb.getCompanies();
      if (cached && cached.length > 0) {
        const rehydrated = await performVaultRehydration();
        if (rehydrated) {
          const retryRes = await fetch(`${API_BASE}/companies`, {
            headers: { ...getAuthHeader() },
          });
          const retryData = await handleResponse<{ companies: Company[] }>(retryRes);
          if (retryData.companies && retryData.companies.length > 0) {
            browserDb.saveCompanies(retryData.companies, false).catch(() => {});
          }
          return retryData;
        }
        return { companies: cached };
      }

      return data;
    } catch (err) {
      const cached = await browserDb.getCompanies();
      if (cached && cached.length > 0) {
        return { companies: cached };
      }
      throw err;
    }
  },

  async createCompany(data: any): Promise<{ success: boolean; company: Company }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; company: Company }>(res);
    if (result.success && result.company) {
      await browserDb.saveCompany(result.company, true);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async updateCompany(id: string, data: any): Promise<{ success: boolean; company: Company }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/companies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; company: Company }>(res);
    if (result.success && result.company) {
      await browserDb.saveCompany(result.company, true);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async deleteCompany(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/companies/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      await browserDb.deleteCompany(id);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  // Routes
  async getRoutes(): Promise<{ routes: RouteItem[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/routes`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ routes: RouteItem[] }>(res);
      if (data && data.routes && data.routes.length > 0) {
        browserDb.saveRoutes(data.routes, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getRoutes(activeCompanyId);
      if (cached && cached.length > 0) {
        return { routes: cached };
      }
      throw err;
    }
  },

  async createRoute(data: Partial<RouteItem>): Promise<{ success: boolean; route: RouteItem }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; route: RouteItem }>(res);
    if (result.success && result.route) {
      const activeCompanyId = result.route.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getRoutes(activeCompanyId);
      await browserDb.saveRoutes([...current.filter((r) => r.id !== result.route.id), result.route], activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'ROUTE_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  async updateRoute(id: string, data: Partial<RouteItem>): Promise<{ success: boolean; route: RouteItem }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/routes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; route: RouteItem }>(res);
    if (result.success && result.route) {
      const activeCompanyId = result.route.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getRoutes(activeCompanyId);
      const updated = current.map((r) => (r.id === id ? { ...r, ...result.route } : r));
      await browserDb.saveRoutes(updated, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'ROUTE_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  async deleteRoute(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/routes/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      const activeCompanyId = localStorage.getItem('zb_active_company_id');
      await browserDb.deleteRoute(id, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'ROUTE_UPDATED', companyId: activeCompanyId });
    }
    return result;
  },

  // Schedules
  async getSchedules(params?: {
    date?: string;
    exactDateOnly?: boolean;
    startDate?: string;
    endDate?: string;
    direction?: string;
    vehicleId?: string;
    supervisor?: string;
    ownerName?: string;
  }): Promise<{ schedules: Schedule[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    const searchParams = new URLSearchParams();
    if (params?.date) searchParams.set('date', params.date);
    if (params?.exactDateOnly) searchParams.set('exactDateOnly', 'true');
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.direction) searchParams.set('direction', params.direction);
    if (params?.vehicleId) searchParams.set('vehicleId', params.vehicleId);
    if (params?.supervisor) searchParams.set('supervisor', params.supervisor);
    if (params?.ownerName) searchParams.set('ownerName', params.ownerName);

    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/schedules?${searchParams.toString()}`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ schedules: Schedule[] }>(res);
      if (data && data.schedules && data.schedules.length > 0) {
        browserDb.saveSchedules(data.schedules, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getSchedules(activeCompanyId, params?.date, params?.direction);
      if (cached && cached.length > 0) {
        return { schedules: cached };
      }
      throw err;
    }
  },

  async getScheduleDetails(id: string): Promise<{ schedule: Schedule; bookings: Booking[]; validSeats: string[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/schedules/${id}`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ schedule: Schedule; bookings: Booking[]; validSeats: string[] }>(res);
      if (data?.schedule) {
        browserDb.saveSchedule(data.schedule, false).catch(() => {});
      }
      if (data?.bookings && data.bookings.length > 0) {
        browserDb.saveBookings(data.bookings, activeCompanyId, false).catch(() => {});
      }
      return data;
    } catch (err) {
      const allSchedules = await browserDb.getSchedules(activeCompanyId);
      const schedule = allSchedules.find((s) => s.id === id);
      if (schedule) {
        const bookings = await browserDb.getBookings(activeCompanyId, undefined, id);
        return { schedule, bookings, validSeats: [] };
      }
      throw err;
    }
  },

  async createSchedule(data: any): Promise<{ success: boolean; schedule: Schedule }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; schedule: Schedule }>(res);
    if (result.success && result.schedule) {
      await browserDb.saveSchedule(result.schedule, true);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async updateSchedule(id: string, data: any): Promise<{ success: boolean; schedule: Schedule }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; schedule: Schedule }>(res);
    if (result.success && result.schedule) {
      await browserDb.saveSchedule(result.schedule, true);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async updateScheduleStatus(id: string, status: 'scheduled' | 'running' | 'completed' | 'cancelled'): Promise<{ success: boolean; schedule: Schedule }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/schedules/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status }),
    });
    const result = await handleResponse<{ success: boolean; schedule: Schedule }>(res);
    if (result.success && result.schedule) {
      await browserDb.saveSchedule(result.schedule, true);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async deleteSchedule(id: string): Promise<{ success: boolean; message: string }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    const res = await fetchWithAutoRehydrate(`${API_BASE}/schedules/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string }>(res);
    if (result.success) {
      await browserDb.deleteSchedule(id, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  // Trip Database & Reports
  async getTripDatabaseReport(params?: {
    startDate?: string;
    endDate?: string;
    date?: string;
    vehicleId?: string;
    counterId?: string;
    direction?: string;
  }): Promise<{
    trips: Array<{
      serial: number;
      scheduleId: string;
      tripNo: string;
      date: string;
      departureTime: string;
      vehicleId: string;
      vehicleRegNo: string;
      routeName: string;
      direction: 'UP' | 'DOWN';
      directionLabel: string;
      supervisor: string;
      supervisorPhone: string;
      bookedSeatsCount: number;
      totalAmount: number;
      fare: number;
      isNightHold: boolean;
      reconciled: boolean;
    }>;
    summary: {
      totalTrips: number;
      totalSeats: number;
      totalAmount: number;
    };
  }> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.date) searchParams.set('date', params.date);
    if (params?.vehicleId) searchParams.set('vehicleId', params.vehicleId);
    if (params?.counterId) searchParams.set('counterId', params.counterId);
    if (params?.direction) searchParams.set('direction', params.direction);

    const res = await fetchWithAutoRehydrate(`${API_BASE}/reports/trip-database?${searchParams.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Bookings
  async createBooking(data: {
    scheduleId: string;
    counterId?: string;
    passengerName: string;
    passengerPhone: string;
    boardingPoint: string;
    destination: string;
    seatNumbers: string[];
    manualFare?: number;
    totalFare?: number;
    farePerSeat?: number;
  }): Promise<{ success: boolean; message: string; booking: Booking; schedule: Schedule }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; message: string; booking: Booking; schedule: Schedule }>(res);
    if (result.success) {
      if (result.booking) {
        await browserDb.saveBooking(result.booking, false);
      }
      if (result.schedule) {
        await browserDb.saveSchedule(result.schedule, false);
      }
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({
        type: 'BOOKING_CREATED',
        companyId: result.booking?.companyId || result.schedule?.companyId,
        entityId: result.booking?.id,
      });
    }
    return result;
  },

  async cancelBooking(bookingId: string): Promise<{ success: boolean; message: string; booking: Booking }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    const res = await fetchWithAutoRehydrate(`${API_BASE}/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean; message: string; booking: Booking }>(res);
    if (result.success) {
      await browserDb.cancelBooking(bookingId, activeCompanyId);
      if (result.booking?.scheduleId) {
        try {
          const schedRes = await api.getScheduleDetails(result.booking.scheduleId);
          if (schedRes?.schedule) {
            await browserDb.saveSchedule(schedRes.schedule, false);
          }
        } catch {}
      }
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({
        type: 'BOOKING_CANCELLED',
        companyId: activeCompanyId,
        entityId: bookingId,
      });
    }
    return result;
  },

  async recordTicketPrint(bookingId: string): Promise<{ success: boolean; booking: Booking }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/bookings/${bookingId}/print`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getBookings(params?: {
    scheduleId?: string;
    ticketNo?: string;
    counterId?: string;
    phone?: string;
    date?: string;
  }): Promise<{ bookings: Booking[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    const searchParams = new URLSearchParams();
    if (params?.scheduleId) searchParams.set('scheduleId', params.scheduleId);
    if (params?.ticketNo) searchParams.set('ticketNo', params.ticketNo);
    if (params?.counterId) searchParams.set('counterId', params.counterId);
    if (params?.phone) searchParams.set('phone', params.phone);
    if (params?.date) searchParams.set('date', params.date);

    try {
      const res = await fetchWithAutoRehydrate(`${API_BASE}/bookings?${searchParams.toString()}`, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ bookings: Booking[] }>(res);
      if (data && data.bookings && data.bookings.length > 0) {
        browserDb.saveBookings(data.bookings, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getBookings(activeCompanyId, params?.date, params?.scheduleId);
      if (cached && cached.length > 0) {
        return { bookings: cached };
      }
      throw err;
    }
  },

  // Reconciliations
  async getReconciliationCandidates(date: string): Promise<{
    date: string;
    pairs: any[];
    existingReconciliations: Reconciliation[];
  }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/reconciliations/candidates?date=${date}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async saveReconciliation(data: {
    operationalDate: string;
    vehicleId: string;
    upTripId?: string;
    downTripId?: string;
    notes?: string;
  }): Promise<{ success: boolean; reconciliation: Reconciliation }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/reconciliations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; reconciliation: Reconciliation }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async batchReconcile(operationalDate: string): Promise<{ success: boolean; count: number }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/reconciliations/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ operationalDate }),
    });
    const result = await handleResponse<{ success: boolean; count: number }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async getReconciliations(date?: string): Promise<{ reconciliations: Reconciliation[] }> {
    const url = date ? `${API_BASE}/reconciliations?date=${date}` : `${API_BASE}/reconciliations`;
    const res = await fetchWithAutoRehydrate(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Audit Logs
  async getAuditLogs(params?: { actionType?: string; limit?: number }): Promise<{ auditLogs: AuditLog[] }> {
    const searchParams = new URLSearchParams();
    if (params?.actionType) searchParams.set('actionType', params.actionType);
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const res = await fetchWithAutoRehydrate(`${API_BASE}/audit-logs?${searchParams.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Analytics
  async getAnalyticsSummary(date?: string): Promise<AnalyticsSummary & { date: string }> {
    const url = date ? `${API_BASE}/analytics/summary?date=${date}` : `${API_BASE}/analytics/summary`;
    const res = await fetchWithAutoRehydrate(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getWeeklyTrends(params?: {
    startDate?: string;
    endDate?: string;
    date?: string;
  }): Promise<WeeklyTrendsSummary> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    const qs = new URLSearchParams();
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.date) qs.set('date', params.date);
    const queryStr = qs.toString();
    const url = queryStr ? `${API_BASE}/analytics/weekly-trends?${queryStr}` : `${API_BASE}/analytics/weekly-trends`;

    try {
      const res = await fetchWithAutoRehydrate(url, {
        headers: { ...getAuthHeader() },
      });
      return await handleResponse<WeeklyTrendsSummary>(res);
    } catch (err) {
      // Offline / IndexedDB fallback calculation
      const [bookings, fuelEntries] = await Promise.all([
        browserDb.getBookings(activeCompanyId).catch(() => []),
        browserDb.getFuelEntries(activeCompanyId).catch(() => []),
      ]);

      const BN_DAYS_SHORT = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
      const BN_DAYS_FULL = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

      const addDays = (base: string, offset: number) => {
        const p = base.split('-').map(Number);
        const d = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().split('T')[0];
      };

      const getSatStart = (anchor: string) => {
        const p = anchor.split('-').map(Number);
        const d = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
        const diff = (d.getUTCDay() + 1) % 7;
        d.setUTCDate(d.getUTCDate() - diff);
        return d.toISOString().split('T')[0];
      };

      const anchor = params?.date || new Date(Date.now() + 6 * 3600 * 1000).toISOString().split('T')[0];
      const start = params?.startDate || getSatStart(anchor);
      const end = params?.endDate || addDays(start, 6);

      const dateList: string[] = [];
      for (let i = 0; i < 14; i++) {
        const cur = addDays(start, i);
        dateList.push(cur);
        if (cur >= end) break;
      }

      const activeBookings = bookings.filter((b) => b.status === 'booked');
      const days = dateList.map((dStr) => {
        const p = dStr.split('-').map(Number);
        const dt = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
        const dayIdx = dt.getUTCDay();

        const dayBookings = activeBookings.filter((b) => b.tripDate === dStr);
        const ticketSalesAmount = dayBookings.reduce((sum, b) => sum + (Number(b.totalFare) || 0), 0);
        const ticketsCount = dayBookings.length;
        const seatsSold = dayBookings.reduce((sum, b) => sum + (Number(b.totalSeats) || 0), 0);

        const dayFuel = fuelEntries.filter((f) => f.date === dStr);
        const fuelExpenseAmount = Math.round(
          dayFuel.reduce((sum, f) => sum + (Number(f.totalCost) || 0), 0) * 100
        ) / 100;
        const fuelLiters = Math.round(
          dayFuel.reduce((sum, f) => sum + (Number(f.actualFuelLiters) || 0), 0) * 100
        ) / 100;

        return {
          date: dStr,
          dayShortBn: BN_DAYS_SHORT[dayIdx] || '',
          dayFullBn: BN_DAYS_FULL[dayIdx] || '',
          ticketSalesAmount,
          ticketsCount,
          seatsSold,
          fuelExpenseAmount,
          fuelLiters,
          netBalance: Math.round((ticketSalesAmount - fuelExpenseAmount) * 100) / 100,
        };
      });

      const totalTicketSales = days.reduce((s, d) => s + d.ticketSalesAmount, 0);
      const totalFuelExpense = Math.round(days.reduce((s, d) => s + d.fuelExpenseAmount, 0) * 100) / 100;
      const totalTicketsCount = days.reduce((s, d) => s + d.ticketsCount, 0);
      const totalSeatsSold = days.reduce((s, d) => s + d.seatsSold, 0);
      const totalFuelLiters = Math.round(days.reduce((s, d) => s + d.fuelLiters, 0) * 100) / 100;
      const totalNetBalance = Math.round((totalTicketSales - totalFuelExpense) * 100) / 100;
      const fuelToSalesRatio =
        totalTicketSales > 0 ? Math.round((totalFuelExpense / totalTicketSales) * 1000) / 10 : 0;

      if (bookings.length > 0 || fuelEntries.length > 0) {
        return {
          startDate: start,
          endDate: dateList[dateList.length - 1] || end,
          days,
          totals: {
            totalTicketSales,
            totalFuelExpense,
            totalNetBalance,
            totalTicketsCount,
            totalSeatsSold,
            totalFuelLiters,
            fuelToSalesRatio,
          },
        };
      }
      throw err;
    }
  },

  // AI Daily Summary
  async getAiDailySummary(date?: string): Promise<{
    success: boolean;
    source: string;
    date: string;
    summary: string;
    stats: { trips: number; seats: number; revenue: number };
  }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/ai/daily-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ date }),
    });
    return handleResponse(res);
  },

  // Settings
  async getSettings(): Promise<{ settings: SystemSettings }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/settings`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<{ success: boolean; settings: SystemSettings }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings),
    });
    const result = await handleResponse<{ success: boolean; settings: SystemSettings }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  // Fuel Management (ফুয়েল লগ)
  async getFuelSettings(): Promise<{ success: boolean; settings: FuelSettings }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/fuel/settings`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async saveFuelSettings(settings: FuelSettings): Promise<{ success: boolean; settings: FuelSettings }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/fuel/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings),
    });
    const result = await handleResponse<{ success: boolean; settings: FuelSettings }>(res);
    if (result.success) {
      await api.syncVaultSnapshot({ force: true });
    }
    return result;
  },

  async getFuelEntries(params?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<{ success: boolean; entries: FuelEntry[] }> {
    const activeCompanyId = localStorage.getItem('zb_active_company_id');
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    const url = qs ? `${API_BASE}/fuel/entries?${qs}` : `${API_BASE}/fuel/entries`;
    try {
      const res = await fetchWithAutoRehydrate(url, {
        headers: { ...getAuthHeader() },
      });
      const data = await handleResponse<{ success: boolean; entries: FuelEntry[] }>(res);
      if (data && data.entries && data.entries.length > 0) {
        browserDb.saveFuelEntries(data.entries, activeCompanyId).catch(() => {});
      }
      return data;
    } catch (err) {
      const cached = await browserDb.getFuelEntries(activeCompanyId);
      if (cached && cached.length > 0) {
        return { success: true, entries: cached };
      }
      throw err;
    }
  },

  async createFuelEntry(entry: Partial<FuelEntry>): Promise<{ success: boolean; entry: FuelEntry }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/fuel/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(entry),
    });
    const result = await handleResponse<{ success: boolean; entry: FuelEntry }>(res);
    if (result.success && result.entry) {
      const activeCompanyId = result.entry.companyId || localStorage.getItem('zb_active_company_id');
      const current = await browserDb.getFuelEntries(activeCompanyId);
      await browserDb.saveFuelEntries([result.entry, ...current.filter((f) => f.id !== result.entry.id)], activeCompanyId, true);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'FUEL_ENTRY_CREATED', companyId: activeCompanyId, entityId: result.entry.id });
    }
    return result;
  },

  async updateFuelEntry(id: string, entry: Partial<FuelEntry>): Promise<{ success: boolean; entry: FuelEntry }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/fuel/entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(entry),
    });
    const result = await handleResponse<{ success: boolean; entry: FuelEntry }>(res);
    if (result.success) {
      const activeCompanyId = result.entry?.companyId || localStorage.getItem('zb_active_company_id');
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'FUEL_ENTRY_CREATED', companyId: activeCompanyId, entityId: id });
    }
    return result;
  },

  async deleteFuelEntry(id: string): Promise<{ success: boolean }> {
    const res = await fetchWithAutoRehydrate(`${API_BASE}/fuel/entries/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<{ success: boolean }>(res);
    if (result.success) {
      const activeCompanyId = localStorage.getItem('zb_active_company_id');
      await browserDb.deleteFuelEntry(id, activeCompanyId);
      await api.syncVaultSnapshot({ force: true });
      browserDb.broadcastSync({ type: 'FUEL_ENTRY_CREATED', companyId: activeCompanyId, entityId: id });
    }
    return result;
  },
};
