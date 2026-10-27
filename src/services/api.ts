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
  Company,
  Supervisor,
  Driver,
} from '../types/index.ts';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('zb_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  // Auth
  async login(loginId: string, pin: string): Promise<{ success: boolean; token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, pin }),
    });
    return handleResponse(res);
  },

  async getMe(): Promise<{ user: User }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
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
    const res = await fetch(`${API_BASE}/users`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createUser(data: any): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateUser(id: string, data: any): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Counters
  async getCounters(): Promise<{ counters: (Counter & { assignedUsers?: any[] })[] }> {
    const res = await fetch(`${API_BASE}/counters`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createCounter(data: Partial<Counter>): Promise<{ success: boolean; counter: Counter }> {
    const res = await fetch(`${API_BASE}/counters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateCounter(id: string, data: Partial<Counter>): Promise<{ success: boolean; counter: Counter }> {
    const res = await fetch(`${API_BASE}/counters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteCounter(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/counters/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Vehicles
  async getVehicles(): Promise<{ vehicles: Vehicle[] }> {
    const res = await fetch(`${API_BASE}/vehicles`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createVehicle(data: Partial<Vehicle>): Promise<{ success: boolean; vehicle: Vehicle }> {
    const res = await fetch(`${API_BASE}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateVehicle(id: string, data: Partial<Vehicle>): Promise<{ success: boolean; vehicle: Vehicle }> {
    const res = await fetch(`${API_BASE}/vehicles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteVehicle(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/vehicles/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getVehicleSeats(id: string): Promise<{ vehicleId: string; regNo: string; seatCapacity: 42 | 46; seats: string[] }> {
    const res = await fetch(`${API_BASE}/vehicles/${id}/seats`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Supervisors (Strictly directory - NO LOGIN)
  async getSupervisors(): Promise<{ supervisors: Supervisor[] }> {
    const res = await fetch(`${API_BASE}/supervisors`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createSupervisor(data: { name: string; phone?: string }): Promise<{ success: boolean; supervisor: Supervisor }> {
    const res = await fetch(`${API_BASE}/supervisors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateSupervisor(id: string, data: Partial<Supervisor>): Promise<{ success: boolean; supervisor: Supervisor }> {
    const res = await fetch(`${API_BASE}/supervisors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteSupervisor(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/supervisors/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Drivers (Strictly name directory - NO LOGIN)
  async getDrivers(): Promise<{ drivers: Driver[] }> {
    const res = await fetch(`${API_BASE}/drivers`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createDriver(data: { name: string }): Promise<{ success: boolean; driver: Driver }> {
    const res = await fetch(`${API_BASE}/drivers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateDriver(id: string, data: Partial<Driver>): Promise<{ success: boolean; driver: Driver }> {
    const res = await fetch(`${API_BASE}/drivers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteDriver(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/drivers/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Companies
  async getCompanies(): Promise<{ companies: Company[] }> {
    const res = await fetch(`${API_BASE}/companies`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createCompany(data: any): Promise<{ success: boolean; company: Company }> {
    const res = await fetch(`${API_BASE}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateCompany(id: string, data: any): Promise<{ success: boolean; company: Company }> {
    const res = await fetch(`${API_BASE}/companies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteCompany(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/companies/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Routes
  async getRoutes(): Promise<{ routes: RouteItem[] }> {
    const res = await fetch(`${API_BASE}/routes`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createRoute(data: Partial<RouteItem>): Promise<{ success: boolean; route: RouteItem }> {
    const res = await fetch(`${API_BASE}/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateRoute(id: string, data: Partial<RouteItem>): Promise<{ success: boolean; route: RouteItem }> {
    const res = await fetch(`${API_BASE}/routes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteRoute(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/routes/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Schedules
  async getSchedules(params?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    direction?: string;
    vehicleId?: string;
    supervisor?: string;
    ownerName?: string;
  }): Promise<{ schedules: Schedule[] }> {
    const searchParams = new URLSearchParams();
    if (params?.date) searchParams.set('date', params.date);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.direction) searchParams.set('direction', params.direction);
    if (params?.vehicleId) searchParams.set('vehicleId', params.vehicleId);
    if (params?.supervisor) searchParams.set('supervisor', params.supervisor);
    if (params?.ownerName) searchParams.set('ownerName', params.ownerName);

    const res = await fetch(`${API_BASE}/schedules?${searchParams.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getScheduleDetails(id: string): Promise<{ schedule: Schedule; bookings: Booking[]; validSeats: string[] }> {
    const res = await fetch(`${API_BASE}/schedules/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createSchedule(data: any): Promise<{ success: boolean; schedule: Schedule }> {
    const res = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateSchedule(id: string, data: any): Promise<{ success: boolean; schedule: Schedule }> {
    const res = await fetch(`${API_BASE}/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateScheduleStatus(id: string, status: 'scheduled' | 'running' | 'completed' | 'cancelled'): Promise<{ success: boolean; schedule: Schedule }> {
    const res = await fetch(`${API_BASE}/schedules/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status }),
    });
    return handleResponse(res);
  },

  async deleteSchedule(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/schedules/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
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

    const res = await fetch(`${API_BASE}/reports/trip-database?${searchParams.toString()}`, {
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
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async cancelBooking(bookingId: string): Promise<{ success: boolean; message: string; booking: Booking }> {
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async recordTicketPrint(bookingId: string): Promise<{ success: boolean; booking: Booking }> {
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/print`, {
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
    const searchParams = new URLSearchParams();
    if (params?.scheduleId) searchParams.set('scheduleId', params.scheduleId);
    if (params?.ticketNo) searchParams.set('ticketNo', params.ticketNo);
    if (params?.counterId) searchParams.set('counterId', params.counterId);
    if (params?.phone) searchParams.set('phone', params.phone);
    if (params?.date) searchParams.set('date', params.date);

    const res = await fetch(`${API_BASE}/bookings?${searchParams.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Reconciliations
  async getReconciliationCandidates(date: string): Promise<{
    date: string;
    pairs: any[];
    existingReconciliations: Reconciliation[];
  }> {
    const res = await fetch(`${API_BASE}/reconciliations/candidates?date=${date}`, {
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
    const res = await fetch(`${API_BASE}/reconciliations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getReconciliations(date?: string): Promise<{ reconciliations: Reconciliation[] }> {
    const url = date ? `${API_BASE}/reconciliations?date=${date}` : `${API_BASE}/reconciliations`;
    const res = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Audit Logs
  async getAuditLogs(params?: { actionType?: string; limit?: number }): Promise<{ auditLogs: AuditLog[] }> {
    const searchParams = new URLSearchParams();
    if (params?.actionType) searchParams.set('actionType', params.actionType);
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const res = await fetch(`${API_BASE}/audit-logs?${searchParams.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Analytics
  async getAnalyticsSummary(date?: string): Promise<AnalyticsSummary & { date: string }> {
    const url = date ? `${API_BASE}/analytics/summary?date=${date}` : `${API_BASE}/analytics/summary`;
    const res = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // AI Daily Summary
  async getAiDailySummary(date?: string): Promise<{
    success: boolean;
    source: string;
    date: string;
    summary: string;
    stats: { trips: number; seats: number; revenue: number };
  }> {
    const res = await fetch(`${API_BASE}/ai/daily-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ date }),
    });
    return handleResponse(res);
  },

  // Settings
  async getSettings(): Promise<{ settings: SystemSettings }> {
    const res = await fetch(`${API_BASE}/settings`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<{ success: boolean; settings: SystemSettings }> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings),
    });
    return handleResponse(res);
  },
};
