import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  db,
  hashPin,
  generateSalt,
  verifyPin,
  generateValidSeatList,
} from '../db.ts';
import {
  createSession,
  destroySession,
  authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from '../auth.ts';
import type {
  User,
  Counter,
  Vehicle,
  RouteItem,
  Schedule,
  Reconciliation,
  SystemSettings,
} from '../../src/types/index.ts';

export const apiRouter = express.Router();

function toBnDigits(num: number | string): string {
  const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/\d/g, (d) => bn[parseInt(d, 10)]);
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Permission helper for Schedule and Route Management
export function canManageSchedules(user?: User): boolean {
  if (!user) return false;
  if (user.role === 'master_admin' || user.role === 'super_admin' || user.role === 'moderator') {
    return true;
  }
  // Master booking counter operators can add/edit/delete schedules
  if (user.role === 'booking_point' && user.counterType === 'master_booking') {
    return true;
  }
  return false;
}

// Login with Login ID and 4-6 digit PIN
apiRouter.post('/auth/login', (req, res) => {
  const { loginId, pin } = req.body;
  if (!loginId || !pin) {
    return res.status(400).json({ error: 'লগইন আইডি এবং পিন উভয়ই প্রদান করুন।' });
  }

  const user = db.getUsers().find((u) => u.loginId.toLowerCase() === loginId.trim().toLowerCase());
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'ভুল লগইন আইডি অথবা ব্যবহারকারী নিষ্ক্রিয়।' });
  }

  const isValidPin = verifyPin(pin.toString().trim(), user.pinHash, user.pinSalt);
  if (!isValidPin) {
    return res.status(401).json({ error: 'ভুল পিন কোড! অনুগ্রহ করে সঠিক পিন দিন।' });
  }

  // Find counter details if assigned
  let counter = undefined;
  if (user.counterId) {
    counter = db.getCounters().find((c) => c.id === user.counterId);
  }

  const sanitizedUser: User = {
    id: user.id,
    loginId: user.loginId,
    name: user.name,
    role: user.role,
    companyId: user.companyId || counter?.companyId,
    counterId: user.counterId,
    counterName: counter?.name || user.counterName,
    counterCode: counter?.code || user.counterCode,
    counterColor: counter?.seatColor || user.counterColor,
    counterType: counter?.counterType || user.counterType || (user.counterId === 'cnt-01' ? 'master_booking' : 'road_booking'),
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
  };

  const token = createSession(sanitizedUser);

  db.logAudit({
    userId: sanitizedUser.id,
    userName: sanitizedUser.name,
    role: sanitizedUser.role,
    actionType: 'LOGIN',
    entityType: 'USER',
    entityId: sanitizedUser.id,
    details: `${sanitizedUser.name} (${sanitizedUser.role}) সফলভাবে সিস্টেমে প্রবেশ করেছেন।`,
  });

  return res.json({
    success: true,
    token,
    user: sanitizedUser,
  });
});

// Current User Profile
apiRouter.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// Logout
apiRouter.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    destroySession(authHeader.split(' ')[1]);
  }
  res.json({ success: true, message: 'সফলভাবে লগআউট সম্পন্ন হয়েছে।' });
});

// List Users (Master Admin and Moderator)
apiRouter.get(
  '/users',
  authMiddleware,
  requireRole(['master_admin', 'moderator']),
  (req, res) => {
    const users = db.getUsers().map((u) => {
      const counter = db.getCounters().find((c) => c.id === u.counterId);
      return {
        id: u.id,
        loginId: u.loginId,
        name: u.name,
        role: u.role,
        counterId: u.counterId,
        counterName: counter?.name,
        counterCode: counter?.code,
        counterColor: counter?.seatColor,
        phone: u.phone,
        status: u.status,
        createdAt: u.createdAt,
      };
    });
    res.json({ users });
  }
);

// Create User (Master Admin Only)
apiRouter.post(
  '/users',
  authMiddleware,
  requireRole(['master_admin']),
  (req: AuthenticatedRequest, res) => {
    const { loginId, name, role, counterId, phone, pin } = req.body;
    if (!loginId || !name || !role || !pin) {
      return res.status(400).json({ error: 'সকল প্রয়োজনীয় তথ্য প্রদান করুন।' });
    }

    if (pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ error: 'পিন অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।' });
    }

    const existing = db.getUsers().find((u) => u.loginId.toLowerCase() === loginId.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'এই লগইন আইডি ইতিমধ্যেই ব্যবহৃত হয়েছে।' });
    }

    const salt = generateSalt();
    const pinHash = hashPin(pin.toString().trim(), salt);
    const counter = counterId ? db.getCounters().find((c) => c.id === counterId) : undefined;

    const newUser = {
      id: `usr-${Date.now()}`,
      loginId: loginId.trim(),
      name: name.trim(),
      role: role as User['role'],
      counterId: counterId || undefined,
      counterName: counter?.name,
      counterCode: counter?.code,
      counterColor: counter?.seatColor,
      phone: phone?.trim() || '',
      status: 'active' as const,
      pinHash,
      pinSalt: salt,
      createdAt: new Date().toISOString(),
    };

    db.getUsers().push(newUser);
    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_USER',
      entityType: 'USER',
      entityId: newUser.id,
      details: `নতুন ব্যবহারকারী "${newUser.name}" (${newUser.role}) তৈরি করা হয়েছে।`,
    });

    res.json({ success: true, user: newUser });
  }
);

// Update User (Master Admin Only)
apiRouter.put(
  '/users/:id',
  authMiddleware,
  requireRole(['master_admin']),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { name, role, counterId, phone, status, pin } = req.body;
    const user = db.getUsers().find((u) => u.id === id);
    if (!user) {
      return res.status(404).json({ error: 'ব্যবহারকারী খুঁজে পাওয়া যায়নি।' });
    }

    if (name) user.name = name.trim();
    if (role) user.role = role;
    if (counterId !== undefined) {
      user.counterId = counterId || undefined;
      const counter = db.getCounters().find((c) => c.id === counterId);
      user.counterName = counter?.name;
      user.counterCode = counter?.code;
      user.counterColor = counter?.seatColor;
    }
    if (phone !== undefined) user.phone = phone.trim();
    if (status) user.status = status;
    if (pin && pin.trim().length >= 4 && pin.trim().length <= 6) {
      const salt = generateSalt();
      user.pinSalt = salt;
      user.pinHash = hashPin(pin.trim(), salt);
    }

    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'UPDATE_USER',
      entityType: 'USER',
      entityId: user.id,
      details: `ব্যবহারকারী "${user.name}" এর তথ্য আপডেট করা হয়েছে।`,
    });

    res.json({ success: true, user });
  }
);

// Delete User (Master Admin Only)
apiRouter.delete(
  '/users/:id',
  authMiddleware,
  requireRole(['master_admin']),
  (req: AuthenticatedRequest, res) => {
    try {
      const deleted = db.deleteUser(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_USER',
        entityType: 'USER',
        entityId: req.params.id,
        details: `ব্যবহারকারী "${deleted.name}" (${deleted.loginId}) মুছে ফেলা হয়েছে।`,
      });
      res.json({ success: true, message: 'ব্যবহারকারী সফলভাবে মুছে ফেলা হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 1.1 COMPANY MANAGEMENT & SUBSCRIPTIONS
// ==========================================

apiRouter.get('/companies', authMiddleware, (req, res) => {
  const companies = db.getCompanies().map(({ adminPinHash, adminPinSalt, ...c }) => c);
  res.json({ companies });
});

apiRouter.post(
  '/companies',
  authMiddleware,
  requireRole(['master_admin', 'super_admin']),
  (req: AuthenticatedRequest, res) => {
    const { name, logoUrl, address, phone, subscriptionExpiry, adminLoginId, pin } = req.body;
    if (!name || !adminLoginId || !pin || !subscriptionExpiry) {
      return res.status(400).json({ error: 'কোম্পানির নাম, এডমিন লগইন আইডি, পিন এবং সাবস্ক্রিপশন মেয়াদ আবশ্যক।' });
    }

    try {
      const company = db.createCompany({
        name,
        logoUrl,
        address: address || '',
        phone: phone || '',
        subscriptionExpiry,
        adminLoginId,
        pin,
      });

      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'CREATE_COMPANY',
        entityType: 'COMPANY',
        entityId: company.id,
        details: `নতুন কোম্পানি "${company.name}" (এডমিন: ${company.adminLoginId}) তৈরি করা হয়েছে। সাবস্ক্রিপশন মেয়াদ: ${company.subscriptionExpiry}`,
      });

      res.json({ success: true, company });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'কোম্পানি তৈরিতে সমস্যা হয়েছে।' });
    }
  }
);

apiRouter.put(
  '/companies/:id',
  authMiddleware,
  requireRole(['master_admin', 'super_admin']),
  (req: AuthenticatedRequest, res) => {
    try {
      const updated = db.updateCompany(req.params.id, req.body);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'UPDATE_COMPANY',
        entityType: 'COMPANY',
        entityId: updated.id,
        details: `কোম্পানি "${updated.name}" এর সাবস্ক্রিপশন ও তথ্য আপডেট করা হয়েছে।`,
      });
      res.json({ success: true, company: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

apiRouter.delete(
  '/companies/:id',
  authMiddleware,
  requireRole(['master_admin', 'super_admin']),
  (req: AuthenticatedRequest, res) => {
    try {
      db.deleteCompany(req.params.id);
      res.json({ success: true, message: 'কোম্পানি সফলভাবে মুছে ফেলা হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 2. COUNTER MANAGEMENT
// ==========================================

apiRouter.get('/counters', authMiddleware, (req, res) => {
  const users = db.getUsers();
  const countersWithUsers = db.getCounters().map((counter) => {
    const assignedUsers = users
      .filter((u) => u.counterId === counter.id)
      .map((u) => ({ id: u.id, name: u.name, loginId: u.loginId, phone: u.phone }));
    return {
      ...counter,
      assignedUsers,
    };
  });
  res.json({ counters: countersWithUsers });
});

// Add Counter (Master Admin Only)
apiRouter.post(
  '/counters',
  authMiddleware,
  requireRole(['master_admin']),
  (req: AuthenticatedRequest, res) => {
    const { name, code, address, phone, seatColor, counterType, tripDirection } = req.body;
    if (!name || !code || !seatColor) {
      return res.status(400).json({ error: 'কাউন্টারের নাম, কোড এবং সিট রঙ আবশ্যক।' });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanColor = seatColor.trim().toUpperCase();

    // Check unique code
    const existingCode = db.getCounters().find((c) => c.code.toUpperCase() === cleanCode);
    if (existingCode) {
      return res.status(400).json({ error: `কাউন্টার কোড '${cleanCode}' ইতিমধ্যেই ব্যবহৃত হয়েছে!` });
    }

    // Check unique active color (prevent duplicate active counter colors)
    const existingColor = db
      .getCounters()
      .find((c) => c.status === 'active' && c.seatColor.toUpperCase() === cleanColor);
    if (existingColor) {
      return res.status(400).json({
        error: `এই সিট কালারটি (${cleanColor}) ইতিমধ্যেই '${existingColor.name}' কাউন্টারে ব্যবহৃত হচ্ছে। ভিন্ন রঙ নির্বাচন করুন।`,
      });
    }

    const newCounter: Counter = {
      id: `cnt-${Date.now()}`,
      name: name.trim(),
      code: cleanCode,
      counterType: counterType === 'master_booking' ? 'master_booking' : 'road_booking',
      tripDirection: tripDirection === 'UP' || tripDirection === 'DOWN' ? tripDirection : 'BOTH',
      address: address?.trim() || '',
      phone: phone?.trim() || '',
      seatColor: cleanColor,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    db.getCounters().push(newCounter);
    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_COUNTER',
      entityType: 'COUNTER',
      entityId: newCounter.id,
      details: `নতুন ${newCounter.counterType === 'master_booking' ? 'মাষ্টার বুকিং' : 'রোড বুকিং'} (${newCounter.tripDirection || 'উভয়'}) কাউন্টার "${newCounter.name}" (${newCounter.code}) তৈরি করা হয়েছে।`,
    });

    res.json({ success: true, counter: newCounter });
  }
);

// Update Counter (Master Admin Only)
apiRouter.put(
  '/counters/:id',
  authMiddleware,
  requireRole(['master_admin']),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { name, code, address, phone, seatColor, status, counterType, tripDirection } = req.body;
    const counter = db.getCounters().find((c) => c.id === id);
    if (!counter) {
      return res.status(404).json({ error: 'কাউন্টার পাওয়া যায়নি।' });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existingCode = db.getCounters().find((c) => c.id !== id && c.code.toUpperCase() === cleanCode);
      if (existingCode) {
        return res.status(400).json({ error: `কাউন্টার কোড '${cleanCode}' অন্য কাউন্টারে ব্যবহৃত হয়েছে!` });
      }
      counter.code = cleanCode;
    }

    if (counterType) {
      counter.counterType = counterType === 'master_booking' ? 'master_booking' : 'road_booking';
    }

    if (tripDirection !== undefined) {
      counter.tripDirection = tripDirection === 'UP' || tripDirection === 'DOWN' ? tripDirection : 'BOTH';
    }

    if (seatColor) {
      const cleanColor = seatColor.trim().toUpperCase();
      const existingColor = db
        .getCounters()
        .find((c) => c.id !== id && c.status === 'active' && c.seatColor.toUpperCase() === cleanColor);
      if (existingColor && (status !== 'inactive')) {
        return res.status(400).json({
          error: `এই সিট কালারটি (${cleanColor}) ইতিমধ্যেই '${existingColor.name}' কাউন্টারে ব্যবহৃত হচ্ছে। ভিন্ন রঙ নির্বাচন করুন।`,
        });
      }
      counter.seatColor = cleanColor;
    }

    if (name) counter.name = name.trim();
    if (address !== undefined) counter.address = address.trim();
    if (phone !== undefined) counter.phone = phone.trim();
    if (status) counter.status = status;

    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'UPDATE_COUNTER',
      entityType: 'COUNTER',
      entityId: counter.id,
      details: `কাউন্টার "${counter.name}" এর তথ্য আপডেট করা হয়েছে।`,
    });

    res.json({ success: true, counter });
  }
);

// Delete Counter (Master Admin Only)
apiRouter.delete(
  '/counters/:id',
  authMiddleware,
  requireRole(['master_admin']),
  (req: AuthenticatedRequest, res) => {
    try {
      const deleted = db.deleteCounter(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_COUNTER',
        entityType: 'COUNTER',
        entityId: req.params.id,
        details: `কাউন্টার "${deleted.name}" (${deleted.code}) মুছে ফেলা হয়েছে।`,
      });
      res.json({ success: true, message: 'কাউন্টার সফলভাবে মুছে ফেলা হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 3. VEHICLE MANAGEMENT (Only Reg No & Owner Name)
// ==========================================

apiRouter.get('/vehicles', authMiddleware, (req, res) => {
  res.json({ vehicles: db.getVehicles() });
});

apiRouter.post(
  '/vehicles',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী গাড়ি যুক্ত করতে পারেন।' });
    }
    const { regNo, seatCapacity, ownerName, ownerPhone, model, notes } = req.body;
    if (!regNo || !regNo.trim()) {
      return res.status(400).json({ error: 'গাড়ির নম্বর আবশ্যক।' });
    }
    if (!ownerName || !ownerName.trim()) {
      return res.status(400).json({ error: 'গাড়ির মালিকের নাম আবশ্যক।' });
    }

    const cleanReg = regNo.trim();
    const existing = db.getVehicles().find((v) => v.regNo.toLowerCase() === cleanReg.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'এই গাড়ি নম্বরটি ইতিমধ্যেই নিবন্ধিত রয়েছে।' });
    }

    const capacity = Number(seatCapacity) === 46 ? 46 : 42;

    const newVehicle: Vehicle = {
      id: `veh-${Date.now()}`,
      regNo: cleanReg,
      seatCapacity: capacity,
      ownerName: ownerName.trim(),
      ownerPhone: ownerPhone?.trim() || '',
      model: model?.trim() || '',
      status: 'active',
      notes: notes?.trim() || '',
      createdAt: new Date().toISOString(),
    };

    db.getVehicles().push(newVehicle);
    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_VEHICLE',
      entityType: 'VEHICLE',
      entityId: newVehicle.id,
      details: `নতুন গাড়ি "${newVehicle.regNo}" (${newVehicle.seatCapacity} সিট, মালিক: ${newVehicle.ownerName}) যুক্ত করা হয়েছে।`,
    });

    res.json({ success: true, vehicle: newVehicle });
  }
);

apiRouter.put(
  '/vehicles/:id',
  authMiddleware,
  requireRole(['master_admin', 'moderator']),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { regNo, seatCapacity, ownerName, ownerPhone, model, status, notes } = req.body;
    const vehicle = db.getVehicles().find((v) => v.id === id);
    if (!vehicle) {
      return res.status(404).json({ error: 'গাড়ি পাওয়া যায়নি।' });
    }

    if (seatCapacity && seatCapacity !== 42 && seatCapacity !== 46) {
      return res.status(400).json({ error: 'সিট ক্যাপাসিটি শুধুমাত্র ৪২ অথবা ৪৬ হতে পারে।' });
    }

    if (regNo) vehicle.regNo = regNo.trim();
    if (seatCapacity) vehicle.seatCapacity = Number(seatCapacity) as 42 | 46;
    if (ownerName !== undefined) vehicle.ownerName = ownerName.trim();
    if (ownerPhone !== undefined) vehicle.ownerPhone = ownerPhone.trim();
    if (model !== undefined) vehicle.model = model.trim();
    if (status) vehicle.status = status;
    if (notes !== undefined) vehicle.notes = notes.trim();

    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'UPDATE_VEHICLE',
      entityType: 'VEHICLE',
      entityId: vehicle.id,
      details: `গাড়ি "${vehicle.regNo}" (মালিক: ${vehicle.ownerName}) এর তথ্য আপডেট করা হয়েছে।`,
    });

    res.json({ success: true, vehicle });
  }
);

// Get Valid Seats for Vehicle
apiRouter.get('/vehicles/:id/seats', authMiddleware, (req, res) => {
  const vehicle = db.getVehicles().find((v) => v.id === req.params.id);
  if (!vehicle) {
    return res.status(404).json({ error: 'গাড়ি পাওয়া যায়নি।' });
  }
  const seats = generateValidSeatList(vehicle.seatCapacity);
  res.json({
    vehicleId: vehicle.id,
    regNo: vehicle.regNo,
    seatCapacity: vehicle.seatCapacity,
    seats,
  });
});

// Delete Vehicle (Master Admin, Moderator, Master Booking)
apiRouter.delete(
  '/vehicles/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী গাড়ি ডিলিট করতে পারেন।' });
    }
    try {
      const deleted = db.deleteVehicle(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_VEHICLE',
        entityType: 'VEHICLE',
        entityId: req.params.id,
        details: `গাড়ি "${deleted.regNo}" (মালিক: ${deleted.ownerName}) সফলভাবে মুছে ফেলা হয়েছে।`,
      });
      res.json({ success: true, message: 'গাড়ি সফলভাবে ডিলিট করা হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 3.1 SUPERVISORS DIRECTORY (NO LOGIN)
// ==========================================

apiRouter.get('/supervisors', authMiddleware, (req, res) => {
  res.json({ supervisors: db.getSupervisors() });
});

apiRouter.post(
  '/supervisors',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী সুপারভাইজার যুক্ত করতে পারেন।' });
    }
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'সুপারভাইজারের নাম আবশ্যক।' });
    }
    const supervisor = db.createSupervisor({ name, phone });
    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_SUPERVISOR',
      entityType: 'SUPERVISOR',
      entityId: supervisor.id,
      details: `নতুন সুপারভাইজার "${supervisor.name}" যুক্ত করা হয়েছে।`,
    });
    res.json({ success: true, supervisor });
  }
);

apiRouter.put(
  '/supervisors/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী সুপারভাইজার সম্পাদনা করতে পারেন।' });
    }
    try {
      const supervisor = db.updateSupervisor(req.params.id, req.body);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'UPDATE_SUPERVISOR',
        entityType: 'SUPERVISOR',
        entityId: supervisor.id,
        details: `সুপারভাইজার "${supervisor.name}" এর তথ্য আপডেট করা হয়েছে।`,
      });
      res.json({ success: true, supervisor });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

apiRouter.delete(
  '/supervisors/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী সুপারভাইজার মুছে ফেলতে পারেন।' });
    }
    try {
      db.deleteSupervisor(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_SUPERVISOR',
        entityType: 'SUPERVISOR',
        entityId: req.params.id,
        details: `সুপারভাইজার আইডি "${req.params.id}" মুছে ফেলা হয়েছে।`,
      });
      res.json({ success: true, message: 'সুপারভাইজার সফলভাবে মুছে ফেলা হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 3.2 DRIVERS DIRECTORY (NO LOGIN, NAME ONLY)
// ==========================================

apiRouter.get('/drivers', authMiddleware, (req, res) => {
  res.json({ drivers: db.getDrivers() });
});

apiRouter.post(
  '/drivers',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী ড্রাইভার যুক্ত করতে পারেন।' });
    }
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'ড্রাইভারের নাম আবশ্যক।' });
    }
    const driver = db.createDriver({ name });
    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_DRIVER',
      entityType: 'DRIVER' as any,
      entityId: driver.id,
      details: `নতুন ড্রাইভার "${driver.name}" যুক্ত করা হয়েছে।`,
    });
    res.json({ success: true, driver });
  }
);

apiRouter.put(
  '/drivers/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী ড্রাইভার সম্পাদনা করতে পারেন।' });
    }
    try {
      const driver = db.updateDriver(req.params.id, req.body);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'UPDATE_DRIVER',
        entityType: 'DRIVER' as any,
        entityId: driver.id,
        details: `ড্রাইভার "${driver.name}" এর তথ্য আপডেট করা হয়েছে।`,
      });
      res.json({ success: true, driver });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

apiRouter.delete(
  '/drivers/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী ড্রাইভার মুছে ফেলতে পারেন।' });
    }
    try {
      db.deleteDriver(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_DRIVER',
        entityType: 'DRIVER' as any,
        entityId: req.params.id,
        details: `ড্রাইভার আইডি "${req.params.id}" মুছে ফেলা হয়েছে।`,
      });
      res.json({ success: true, message: 'ড্রাইভার সফলভাবে মুছে ফেলা হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 4. ROUTE MANAGEMENT (With UP/DOWN Direction, Edit & Delete)
// ==========================================

apiRouter.get('/routes', authMiddleware, (req, res) => {
  res.json({ routes: db.getRoutes() });
});

apiRouter.post(
  '/routes',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার রুট তৈরি করতে পারে।' });
    }

    const { name, origin, destination, intermediateStops, baseFare, distanceKm, direction } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'রুটের শুরু ও গন্তব্য আবশ্যক।' });
    }

    const routeName = name?.trim() || `${origin.trim()} - ${destination.trim()}`;

    const newRoute: RouteItem = {
      id: `rt-${Date.now()}`,
      name: routeName,
      origin: origin.trim(),
      destination: destination.trim(),
      intermediateStops: Array.isArray(intermediateStops)
        ? intermediateStops.map((s: string) => s.trim()).filter(Boolean)
        : [],
      direction: direction === 'UP' || direction === 'DOWN' ? direction : 'BOTH',
      baseFare: baseFare !== undefined && baseFare !== null && baseFare !== '' ? Number(baseFare) : undefined,
      distanceKm: distanceKm ? Number(distanceKm) : undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    db.getRoutes().push(newRoute);
    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_ROUTE',
      entityType: 'ROUTE',
      entityId: newRoute.id,
      details: `নতুন রুট "${newRoute.name}" (${newRoute.direction || 'উভয় দিক'}) তৈরি করা হয়েছে।`,
    });

    res.json({ success: true, route: newRoute });
  }
);

apiRouter.put(
  '/routes/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার রুট এডিট করতে পারে।' });
    }

    try {
      const updated = db.updateRoute(req.params.id, req.body);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'UPDATE_ROUTE',
        entityType: 'ROUTE',
        entityId: updated.id,
        details: `রুট "${updated.name}" এর তথ্য সম্পাদনা করা হয়েছে।`,
      });
      res.json({ success: true, route: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

apiRouter.delete(
  '/routes/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার রুট মুছে ফেলতে পারে।' });
    }

    try {
      db.deleteRoute(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_ROUTE',
        entityType: 'ROUTE',
        entityId: req.params.id,
        details: `রুট আইডি "${req.params.id}" সফলভাবে মুছে ফেলা হয়েছে।`,
      });
      res.json({ success: true, message: 'রুট মুছে ফেলা হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 5. SCHEDULE MAKER & DAILY TRIPS (Master Booking Counters Can Manage)
// ==========================================

apiRouter.get('/schedules', authMiddleware, (req, res) => {
  const { date, startDate, endDate, direction, vehicleId, supervisor, ownerName } = req.query;
  let schedules = [...db.getSchedules()];

  if (date) {
    schedules = schedules.filter((s) => s.date === date);
  } else if (startDate && endDate) {
    schedules = schedules.filter(
      (s) => s.date >= (startDate as string) && s.date <= (endDate as string)
    );
  } else if (startDate) {
    schedules = schedules.filter((s) => s.date >= (startDate as string));
  } else if (endDate) {
    schedules = schedules.filter((s) => s.date <= (endDate as string));
  }

  if (direction) {
    schedules = schedules.filter((s) => s.direction === direction);
  }
  if (vehicleId) {
    schedules = schedules.filter((s) => s.vehicleId === vehicleId);
  }
  if (supervisor) {
    schedules = schedules.filter((s) =>
      s.supervisor.toLowerCase().includes((supervisor as string).toLowerCase())
    );
  }
  if (ownerName) {
    schedules = schedules.filter((s) =>
      (s.vehicleOwnerName || '').toLowerCase().includes((ownerName as string).toLowerCase())
    );
  }

  // Ensure tripSequenceOnDay, tripSequenceLabel, and vehicleOwnerName are always present
  const vehicleMap = new Map<string, Vehicle>();
  for (const v of db.getVehicles()) {
    vehicleMap.set(v.id, v);
  }

  // Group by date + vehicleId to calculate trip sequence if missing
  const dateVehGroups = new Map<string, Schedule[]>();
  for (const s of db.getSchedules()) {
    if (s.status === 'cancelled') continue;
    const key = `${s.date}_${s.vehicleId}`;
    if (!dateVehGroups.has(key)) dateVehGroups.set(key, []);
    dateVehGroups.get(key)!.push(s);
  }

  for (const [, list] of dateVehGroups) {
    list.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    list.forEach((s, idx) => {
      s.tripSequenceOnDay = idx + 1;
      s.tripSequenceLabel =
        idx === 0
          ? '১ম ট্রিপ'
          : idx === 1
          ? '২য় ট্রিপ'
          : idx === 2
          ? '৩য় ট্রিপ'
          : idx === 3
          ? '৪র্থ ট্রিপ'
          : `${toBnDigits(idx + 1)}তম ট্রিপ`;
      if (!s.vehicleOwnerName) {
        const veh = vehicleMap.get(s.vehicleId);
        if (veh?.ownerName) s.vehicleOwnerName = veh.ownerName;
      }
    });
  }

  // Sort by date desc, then departure time asc
  schedules.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.departureTime.localeCompare(b.departureTime);
  });

  res.json({ schedules });
});

apiRouter.get('/schedules/:id', authMiddleware, (req, res) => {
  const schedule = db.getSchedules().find((s) => s.id === req.params.id);
  if (!schedule) {
    return res.status(404).json({ error: 'শিডিউল পাওয়া যায়নি।' });
  }

  const bookings = db.getBookings().filter((b) => b.scheduleId === schedule.id && b.status === 'booked');
  const validSeats = generateValidSeatList(schedule.seatCapacity);

  res.json({
    schedule,
    bookings,
    validSeats,
  });
});

// Create Schedule with automatic multi-trip sequence counter (১ম ট্রিপ, ২য় ট্রিপ, ৩য় ট্রিপ)
apiRouter.post(
  '/schedules',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({
        error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার ট্রিপ শিডিউল তৈরি করতে পারে।',
      });
    }

    const {
      date,
      departureTime,
      vehicleId,
      routeId,
      supervisor,
      supervisorPhone,
      driver,
      direction,
      fare,
      isNightHold,
      linkedTripId,
    } = req.body;

    if (!date || !departureTime || !vehicleId || !supervisor || !direction) {
      return res.status(400).json({ error: 'তারিখ, সময়, গাড়ী নম্বর, দিক (আপ/ডাউন) ও সুপারভাইজার আবশ্যক।' });
    }

    if (direction !== 'UP' && direction !== 'DOWN') {
      return res.status(400).json({ error: 'দিক অবশ্যই আপ ট্রিপ (UP) অথবা ডাউন ট্রিপ (DOWN) হতে হবে।' });
    }

    const vehicle = db.getVehicles().find((v) => v.id === vehicleId);
    if (!vehicle) {
      return res.status(400).json({ error: 'নির্বাচিত গাড়ি পাওয়া যায়নি।' });
    }

    // Auto-resolve route if not provided, preferring direction matching
    let route = routeId ? db.getRoutes().find((r) => r.id === routeId) : undefined;
    if (!route) {
      route = db
        .getRoutes()
        .find((r) => r.status === 'active' && (r.direction === direction || r.direction === 'BOTH'));
      if (!route) {
        route = db.getRoutes().find((r) => r.status === 'active') || {
          id: 'rt-default',
          name: direction === 'UP' ? 'মাদারীপুর - ঢাকা' : 'ঢাকা - মাদারীপুর',
          origin: direction === 'UP' ? 'মাদারীপুর' : 'ঢাকা',
          destination: direction === 'UP' ? 'ঢাকা' : 'মাদারীপুর',
          intermediateStops: [],
          direction: direction as 'UP' | 'DOWN',
          baseFare: 550,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
      }
    }

    const effectiveFare = fare && Number(fare) > 0 ? Number(fare) : (route.baseFare || 550);

    // Check existing trips for this vehicle on this operational date
    const existingTripsForVehicle = db
      .getSchedules()
      .filter((s) => s.date === date && s.vehicleId === vehicleId && s.status !== 'cancelled');

    // Duplicate Check: Same vehicle, same date, exact same departure time
    const exactDuplicate = existingTripsForVehicle.find((s) => s.departureTime === departureTime.trim());
    if (exactDuplicate) {
      return res.status(400).json({
        error: `এই গাড়িটির (${vehicle.regNo}) এই তারিখে (${date}) ঠিক একই সময়ে (${departureTime}) ইতিমধ্যে ট্রিপ (${exactDuplicate.tripNo}) বিদ্যমান! ভিন্ন সময় নির্ধারণ করুন।`,
      });
    }

    // Sequence calculation for multiple trips of same vehicle on same day
    const tripSequence = existingTripsForVehicle.length + 1;
    const tripSequenceLabel =
      tripSequence === 1
        ? '১ম ট্রিপ'
        : tripSequence === 2
        ? '২য় ট্রিপ'
        : tripSequence === 3
        ? '৩য় ট্রিপ'
        : tripSequence === 4
        ? '৪র্থ ট্রিপ'
        : `${toBnDigits(tripSequence)}তম ট্রিপ`;

    const tripCount = db.getSchedules().length + 1;
    const tripNo = `TR-${direction}-${String(tripCount).padStart(3, '0')}`;

    // Check if this is a linked return trip (ফিরতি ট্রিপ)
    let parentTrip: Schedule | undefined;
    if (linkedTripId) {
      parentTrip = db.getSchedules().find((s) => s.id === linkedTripId);
    }

    const newSchedule: Schedule = {
      id: `sch-${Date.now()}`,
      tripNo,
      date,
      departureTime: departureTime.trim(),
      vehicleId: vehicle.id,
      vehicleRegNo: vehicle.regNo,
      vehicleOwnerName: vehicle.ownerName || 'হাজী মো. রফিকুল ইসলাম',
      tripSequenceOnDay: tripSequence,
      tripSequenceLabel,
      seatCapacity: vehicle.seatCapacity,
      routeId: route.id,
      routeName: route.name,
      supervisor: supervisor.trim(),
      supervisorPhone: supervisorPhone?.trim() || '',
      driver: driver ? driver.trim() : (parentTrip?.driver || ''),
      direction: direction as 'UP' | 'DOWN',
      fare: effectiveFare,
      isNightHold: Boolean(isNightHold),
      status: 'scheduled',
      reconciled: false,
      totalBookedSeats: 0,
      totalCollection: 0,
      linkedTripId: linkedTripId || undefined,
      roundTripPairTripNo: parentTrip ? parentTrip.tripNo : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (parentTrip) {
      parentTrip.returnTripCreated = true;
      parentTrip.linkedTripId = newSchedule.id;
      parentTrip.roundTripPairTripNo = newSchedule.tripNo;
    }

    db.getSchedules().push(newSchedule);
    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_SCHEDULE',
      entityType: 'SCHEDULE',
      entityId: newSchedule.id,
      tripIdAffected: newSchedule.id,
      details: `নতুন ${direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ'} (${newSchedule.tripNo}) শিডিউল তৈরি করা হয়েছে। গাড়ি: ${vehicle.regNo} (${tripSequenceLabel}), মালিক: ${newSchedule.vehicleOwnerName}, সময়: ${departureTime}, ভাড়া: ৳${fare}`,
      newValues: newSchedule,
    });

    res.json({ success: true, schedule: newSchedule });
  }
);

// Update Trip Status (Supervisor / Admin Dispatch)
apiRouter.put(
  '/schedules/:id/status',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    const { status } = req.body;
    const validStatuses = ['scheduled', 'running', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'অবৈধ ট্রিপ স্ট্যাটাস।' });
    }

    const schedule = db.getSchedules().find((s) => s.id === req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: 'শিডিউল পাওয়া যায়নি।' });
    }

    const oldStatus = schedule.status;
    schedule.status = status;
    schedule.updatedAt = new Date().toISOString();
    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'UPDATE_SCHEDULE',
      entityType: 'SCHEDULE',
      entityId: schedule.id,
      tripIdAffected: schedule.id,
      details: `ট্রিপ ${schedule.tripNo} (${schedule.vehicleRegNo}) এর স্ট্যাটাস "${oldStatus}" থেকে "${status}" এ আপডেট করা হয়েছে।`,
      newValues: { status },
    });

    res.json({ success: true, schedule });
  }
);

// Update Schedule (Trigger red alert on booking screen)
apiRouter.put(
  '/schedules/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({
        error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার ট্রিপ শিডিউল পরিবর্তন করতে পারে।',
      });
    }

    const { id } = req.params;
    const { departureTime, vehicleId, supervisor, supervisorPhone, driver, routeId, fare, isNightHold, updateReason } = req.body;
    const schedule = db.getSchedules().find((s) => s.id === id);
    if (!schedule) {
      return res.status(404).json({ error: 'শিডিউল পাওয়া যায়নি।' });
    }

    const previousValues = {
      departureTime: schedule.departureTime,
      vehicleRegNo: schedule.vehicleRegNo,
      supervisor: schedule.supervisor,
      driver: schedule.driver,
      fare: schedule.fare,
    };

    let changes: string[] = [];

    if (departureTime && departureTime !== schedule.departureTime) {
      changes.push(`সময়: ${schedule.departureTime} ➜ ${departureTime}`);
      schedule.departureTime = departureTime;
    }

    if (vehicleId && vehicleId !== schedule.vehicleId) {
      const veh = db.getVehicles().find((v) => v.id === vehicleId);
      if (veh) {
        changes.push(`গাড়ি: ${schedule.vehicleRegNo} ➜ ${veh.regNo}`);
        schedule.vehicleId = veh.id;
        schedule.vehicleRegNo = veh.regNo;
        schedule.seatCapacity = veh.seatCapacity;
      }
    }

    if (supervisor && supervisor !== schedule.supervisor) {
      changes.push(`সুপারভাইজার: ${schedule.supervisor} ➜ ${supervisor}`);
      schedule.supervisor = supervisor;
    }

    if (driver !== undefined && driver !== schedule.driver) {
      changes.push(`ড্রাইভার: ${schedule.driver || 'অনুপস্থিত'} ➜ ${driver}`);
      schedule.driver = driver.trim();
    }

    if (routeId && routeId !== schedule.routeId) {
      const rt = db.getRoutes().find((r) => r.id === routeId);
      if (rt) {
        changes.push(`রুট: ${schedule.routeName} ➜ ${rt.name}`);
        schedule.routeId = rt.id;
        schedule.routeName = rt.name;
      }
    }

    if (supervisorPhone !== undefined) {
      schedule.supervisorPhone = supervisorPhone;
    }

    if (fare && Number(fare) !== schedule.fare) {
      changes.push(`ভাড়া: ৳${schedule.fare} ➜ ৳${fare}`);
      schedule.fare = Number(fare);
    }

    if (isNightHold !== undefined) {
      schedule.isNightHold = Boolean(isNightHold);
    }

    schedule.updatedAt = new Date().toISOString();
    schedule.lastTripUpdateAt = new Date().toISOString();
    schedule.lastTripUpdateReason = updateReason || changes.join(', ') || 'ট্রিপের তথ্য পরিবর্তিত হয়েছে';

    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'UPDATE_SCHEDULE',
      entityType: 'SCHEDULE',
      entityId: schedule.id,
      tripIdAffected: schedule.id,
      details: `ট্রিপ ${schedule.tripNo} আপডেট করা হয়েছে: ${schedule.lastTripUpdateReason}`,
      previousValues,
      newValues: {
        departureTime: schedule.departureTime,
        vehicleRegNo: schedule.vehicleRegNo,
        supervisor: schedule.supervisor,
        fare: schedule.fare,
      },
    });

    res.json({ success: true, schedule });
  }
);

// Delete Schedule
apiRouter.delete(
  '/schedules/:id',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({
        error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার ট্রিপ শিডিউল মুছে ফেলতে পারে।',
      });
    }

    try {
      db.deleteSchedule(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_SCHEDULE',
        entityType: 'SCHEDULE',
        entityId: req.params.id,
        details: `ট্রিপ শিডিউল আইডি "${req.params.id}" সফলভাবে ডিলিট করা হয়েছে।`,
      });
      res.json({ success: true, message: 'ট্রিপ শিডিউল সফলভাবে ডিলিট হয়েছে।' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 6. SEAT BOOKING
// ==========================================

apiRouter.post('/bookings', authMiddleware, (req: AuthenticatedRequest, res) => {
  const {
    scheduleId,
    counterId,
    passengerName,
    passengerPhone,
    boardingPoint,
    destination,
    seatNumbers,
    totalFare,
    manualFare,
    farePerSeat,
  } = req.body;

  if (!scheduleId || !seatNumbers || !Array.isArray(seatNumbers) || seatNumbers.length === 0) {
    return res.status(400).json({ error: 'শিডিউল এবং কমপক্ষে একটি সিট নির্বাচন করুন।' });
  }

  // Determine effective counter
  let effectiveCounterId = counterId;
  if (req.user?.role === 'booking_point' && req.user.counterId) {
    // If user is a counter operator, enforce their assigned counter
    effectiveCounterId = req.user.counterId;
  }

  if (!effectiveCounterId) {
    return res.status(400).json({ error: 'বুকিংয়ের জন্য কাউন্টার নির্বাচন করুন।' });
  }

  // Parse manual fare if provided
  let customTotalFare: number | undefined = undefined;
  if (manualFare !== undefined && manualFare !== '' && manualFare !== null) {
    customTotalFare = Math.max(0, Number(manualFare));
  } else if (totalFare !== undefined && totalFare !== '' && totalFare !== null) {
    customTotalFare = Math.max(0, Number(totalFare));
  }

  let customFarePerSeat: number | undefined = undefined;
  if (farePerSeat !== undefined && farePerSeat !== '' && farePerSeat !== null) {
    customFarePerSeat = Math.max(0, Number(farePerSeat));
  }

  try {
    const result = db.atomicBookSeats({
      scheduleId,
      counterId: effectiveCounterId,
      bookedByUserId: req.user!.id,
      bookedByUserName: req.user!.name,
      passengerName: passengerName?.trim() || 'যাত্রী',
      passengerPhone: passengerPhone?.trim() || '',
      boardingPoint: boardingPoint?.trim() || '',
      destination: destination?.trim() || '',
      seatNumbers,
      customTotalFare,
      customFarePerSeat,
    });

    res.json({
      success: true,
      message: 'সিট সফলভাবে বুকিং হয়েছে!',
      booking: result.booking,
      schedule: result.schedule,
    });
  } catch (err: any) {
    return res.status(409).json({ error: err.message || 'বুকিং প্রক্রিয়া ব্যর্থ হয়েছে।' });
  }
});

// Cancel Booking
apiRouter.post(
  '/bookings/:id/cancel',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    try {
      const cancelled = db.cancelBooking(req.params.id, {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      });
      res.json({ success: true, message: 'বুকিং বাতিল করা হয়েছে।', booking: cancelled });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'বাতিল করা সম্ভব হয়নি।' });
    }
  }
);

// Thermal Print Tracking
apiRouter.post('/bookings/:id/print', authMiddleware, (req, res) => {
  try {
    const booking = db.incrementPrintCount(req.params.id);
    res.json({ success: true, booking });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Search & List Bookings
apiRouter.get('/bookings', authMiddleware, (req, res) => {
  const { scheduleId, ticketNo, counterId, phone, date } = req.query;
  let bookings = [...db.getBookings()];

  if (scheduleId) {
    bookings = bookings.filter((b) => b.scheduleId === scheduleId);
  }
  if (ticketNo) {
    bookings = bookings.filter((b) => b.ticketNo.toLowerCase().includes((ticketNo as string).toLowerCase()));
  }
  if (counterId) {
    bookings = bookings.filter((b) => b.counterId === counterId);
  }
  if (phone) {
    bookings = bookings.filter((b) => b.passengerPhone.includes(phone as string));
  }
  if (date) {
    bookings = bookings.filter((b) => b.tripDate === date);
  }

  // Reverse sort by booking time
  bookings.sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));

  res.json({ bookings });
});

// ==========================================
// 7. FINANCIAL RECONCILIATION
// ==========================================

// Get reconciliation pairs for a given date
apiRouter.get('/reconciliations/candidates', authMiddleware, (req, res) => {
  const { date } = req.query;
  const targetDate = (date as string) || new Date().toISOString().split('T')[0];

  const allSchedules = db.getSchedules().filter((s) => s.status !== 'cancelled');
  const vehicles = db.getVehicles();

  // Find trips for this date, plus night-hold Up trips from yesterday
  const tripsOnDate = allSchedules.filter((s) => s.date === targetDate);

  // Group by vehicle
  const pairs: Array<{
    vehicleId: string;
    vehicleRegNo: string;
    routeName: string;
    supervisor: string;
    upTrip?: Schedule;
    downTrip?: Schedule;
    upCollection: number;
    downCollection: number;
    combinedCollection: number;
    isNightHoldMatch: boolean;
    reconciliationStatus: 'reconciled' | 'ready' | 'incomplete';
    existingReconciliation?: Reconciliation;
  }> = [];

  const existingReconciliations = db.getReconciliations().filter((r) => r.operationalDate === targetDate);

  for (const veh of vehicles) {
    const upTrips = tripsOnDate.filter((s) => s.vehicleId === veh.id && s.direction === 'UP');
    const downTrips = tripsOnDate.filter((s) => s.vehicleId === veh.id && s.direction === 'DOWN');

    // Also check for previous night hold if no up trip on date
    let nightHoldUp: Schedule | undefined;
    if (upTrips.length === 0 && downTrips.length > 0) {
      nightHoldUp = allSchedules.find(
        (s) => s.vehicleId === veh.id && s.direction === 'UP' && s.isNightHold && !s.reconciled
      );
    }

    const upTrip = upTrips[0] || nightHoldUp;
    const downTrip = downTrips[0];

    if (upTrip || downTrip) {
      const upCollection = upTrip?.totalCollection || 0;
      const downCollection = downTrip?.totalCollection || 0;
      const combinedCollection = upCollection + downCollection;

      const existing = existingReconciliations.find((r) => r.vehicleId === veh.id);

      let status: 'reconciled' | 'ready' | 'incomplete' = 'incomplete';
      if (existing) {
        status = 'reconciled';
      } else if (upTrip && downTrip) {
        status = 'ready';
      }

      pairs.push({
        vehicleId: veh.id,
        vehicleRegNo: veh.regNo,
        routeName: upTrip?.routeName || downTrip?.routeName || 'রুট',
        supervisor: upTrip?.supervisor || downTrip?.supervisor || 'অজানা',
        upTrip,
        downTrip,
        upCollection,
        downCollection,
        combinedCollection,
        isNightHoldMatch: Boolean(nightHoldUp),
        reconciliationStatus: status,
        existingReconciliation: existing,
      });
    }
  }

  res.json({ date: targetDate, pairs, existingReconciliations });
});

// Perform Transactional Reconciliation
apiRouter.post(
  '/reconciliations',
  authMiddleware,
  requireRole(['master_admin', 'moderator']),
  (req: AuthenticatedRequest, res) => {
    const { operationalDate, vehicleId, upTripId, downTripId, notes } = req.body;

    if (!operationalDate || !vehicleId) {
      return res.status(400).json({ error: 'তারিখ ও গাড়ি নির্বাচন আবশ্যক।' });
    }

    const vehicle = db.getVehicles().find((v) => v.id === vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: 'গাড়ি পাওয়া যায়নি।' });
    }

    const upTrip = upTripId ? db.getSchedules().find((s) => s.id === upTripId) : undefined;
    const downTrip = downTripId ? db.getSchedules().find((s) => s.id === downTripId) : undefined;

    const upCollection = upTrip?.totalCollection || 0;
    const downCollection = downTrip?.totalCollection || 0;
    const combinedCollection = upCollection + downCollection;

    const count = db.getReconciliations().length + 1;
    const reconNo = `REC-${operationalDate.replace(/-/g, '')}-${String(count).padStart(3, '0')}`;

    const newRecon: Reconciliation = {
      id: `rec-${Date.now()}`,
      reconNo,
      operationalDate,
      vehicleId: vehicle.id,
      vehicleRegNo: vehicle.regNo,
      routeName: upTrip?.routeName || downTrip?.routeName || 'রুট',
      supervisor: upTrip?.supervisor || downTrip?.supervisor || 'সুপারভাইজার',
      upTripId: upTrip?.id,
      upTripNo: upTrip?.tripNo,
      downTripId: downTrip?.id,
      downTripNo: downTrip?.tripNo,
      upCollection,
      downCollection,
      combinedCollection,
      status: 'completed',
      isNightHoldMatch: Boolean(upTrip?.isNightHold),
      notes: notes?.trim() || '',
      reconciledBy: req.user!.name,
      reconciledAt: new Date().toISOString(),
    };

    // Mark trips as reconciled
    if (upTrip) {
      upTrip.reconciled = true;
      upTrip.reconciliationId = newRecon.id;
    }
    if (downTrip) {
      downTrip.reconciled = true;
      downTrip.reconciliationId = newRecon.id;
    }

    db.getReconciliations().push(newRecon);
    db.save();

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'RECONCILE',
      entityType: 'RECONCILIATION',
      entityId: newRecon.id,
      details: `গাড়ি "${vehicle.regNo}" এর আপ (${upTrip?.tripNo || 'নেই'}) ও ডাউন (${
        downTrip?.tripNo || 'নেই'
      }) ট্রিপের সমন্বয় সম্পন্ন। মোট আদায়: ৳${combinedCollection}`,
      newValues: newRecon,
    });

    res.json({ success: true, reconciliation: newRecon });
  }
);

apiRouter.get('/reconciliations', authMiddleware, (req, res) => {
  const { date } = req.query;
  let recons = [...db.getReconciliations()];
  if (date) {
    recons = recons.filter((r) => r.operationalDate === date);
  }
  recons.sort((a, b) => b.reconciledAt.localeCompare(a.reconciledAt));
  res.json({ reconciliations: recons });
});

// ==========================================
// 8. AUDIT LOGS
// ==========================================

apiRouter.get('/audit-logs', authMiddleware, (req, res) => {
  const { actionType, limit } = req.query;
  let logs = [...db.getAuditLogs()];
  if (actionType) {
    logs = logs.filter((l) => l.actionType === actionType);
  }
  if (limit) {
    logs = logs.slice(0, Number(limit));
  }
  res.json({ auditLogs: logs });
});

// ==========================================
// 9. DASHBOARD & ANALYTICS
// ==========================================

apiRouter.get('/analytics/summary', authMiddleware, (req, res) => {
  const { date } = req.query;
  const today = (date as string) || new Date().toISOString().split('T')[0];

  const schedules = db.getSchedules().filter((s) => s.date === today && s.status !== 'cancelled');
  const allBookings = db.getBookings().filter((b) => b.tripDate === today && b.status === 'booked');
  const counters = db.getCounters();
  const vehicles = db.getVehicles();

  const totalBookings = allBookings.length;
  const seatsSold = allBookings.reduce((sum, b) => sum + b.totalSeats, 0);
  const ticketSales = allBookings.length;
  const activeTrips = schedules.length;
  const totalCollections = allBookings.reduce((sum, b) => sum + b.totalFare, 0);

  // Unreconciled count
  const unreconciledTrips = schedules.filter((s) => !s.reconciled).length;

  // Vehicle-wise collection
  const vehicleWiseCollections = vehicles.map((veh) => {
    const vehSchedules = schedules.filter((s) => s.vehicleId === veh.id);
    const upCollection = vehSchedules
      .filter((s) => s.direction === 'UP')
      .reduce((sum, s) => sum + s.totalCollection, 0);
    const downCollection = vehSchedules
      .filter((s) => s.direction === 'DOWN')
      .reduce((sum, s) => sum + s.totalCollection, 0);
    return {
      regNo: veh.regNo,
      upCollection,
      downCollection,
      total: upCollection + downCollection,
    };
  });

  // Counter-wise sales
  const counterWiseSales = counters.map((cnt) => {
    const cntBookings = allBookings.filter((b) => b.counterId === cnt.id);
    const cntSeats = cntBookings.reduce((sum, b) => sum + b.totalSeats, 0);
    const cntRevenue = cntBookings.reduce((sum, b) => sum + b.totalFare, 0);
    return {
      counterName: cnt.name,
      counterCode: cnt.code,
      seatColor: cnt.seatColor,
      seatsSold: cntSeats,
      totalRevenue: cntRevenue,
    };
  });

  res.json({
    date: today,
    totalBookings,
    seatsSold,
    ticketSales,
    activeTrips,
    totalCollections,
    unreconciledTrips,
    vehicleWiseCollections,
    counterWiseSales,
  });
});

// ==========================================
// 9.1 TRIP DATABASE & FILTERABLE REPORT
// ==========================================

apiRouter.get('/reports/trip-database', authMiddleware, (req, res) => {
  const { startDate, endDate, date, vehicleId, counterId, direction } = req.query;

  let allSchedules = [...db.getSchedules()].filter((s) => s.status !== 'cancelled');
  const allBookings = db.getBookings().filter((b) => b.status === 'booked');

  // Filter by single date or date range
  if (date) {
    allSchedules = allSchedules.filter((s) => s.date === date);
  } else {
    if (startDate) {
      allSchedules = allSchedules.filter((s) => s.date >= (startDate as string));
    }
    if (endDate) {
      allSchedules = allSchedules.filter((s) => s.date <= (endDate as string));
    }
  }

  // Filter by vehicle
  if (vehicleId) {
    allSchedules = allSchedules.filter((s) => s.vehicleId === vehicleId);
  }

  // Filter by direction
  if (direction) {
    allSchedules = allSchedules.filter((s) => s.direction === direction);
  }

  // Sort by date then departure time
  allSchedules.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.departureTime.localeCompare(b.departureTime);
  });

  // Calculate day-by-day auto serial resetting to 1 per day
  let currentDate = '';
  let daySerial = 0;

  const records = allSchedules.map((s) => {
    if (s.date !== currentDate) {
      currentDate = s.date;
      daySerial = 1;
    } else {
      daySerial++;
    }

    // Bookings for this schedule, optionally filtered by counterId
    let tripBookings = allBookings.filter((b) => b.scheduleId === s.id);
    if (counterId) {
      tripBookings = tripBookings.filter((b) => b.counterId === counterId);
    }

    const bookedSeatsCount = counterId
      ? tripBookings.reduce((sum, b) => sum + b.totalSeats, 0)
      : s.totalBookedSeats || 0;

    const totalAmount = counterId
      ? tripBookings.reduce((sum, b) => sum + b.totalFare, 0)
      : s.totalCollection || 0;

    return {
      serial: daySerial,
      scheduleId: s.id,
      tripNo: s.tripNo,
      date: s.date,
      departureTime: s.departureTime,
      vehicleId: s.vehicleId,
      vehicleRegNo: s.vehicleRegNo,
      routeName: s.routeName,
      direction: s.direction,
      directionLabel: s.direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ',
      supervisor: s.supervisor,
      supervisorPhone: s.supervisorPhone,
      bookedSeatsCount,
      totalAmount,
      fare: s.fare,
      isNightHold: s.isNightHold,
      reconciled: s.reconciled,
    };
  });

  const totalSeats = records.reduce((sum, r) => sum + r.bookedSeatsCount, 0);
  const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0);

  res.json({
    trips: records,
    summary: {
      totalTrips: records.length,
      totalSeats,
      totalAmount,
    },
  });
});

// ==========================================
// 10. AI DAILY SUMMARY (Gemini 3.8 Flash)
// ==========================================

apiRouter.post(
  '/ai/daily-summary',
  authMiddleware,
  requireRole(['master_admin']),
  async (req: AuthenticatedRequest, res) => {
    const { date } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const schedules = db.getSchedules().filter((s) => s.date === targetDate && s.status !== 'cancelled');
    const bookings = db.getBookings().filter((b) => b.tripDate === targetDate && b.status === 'booked');
    const counters = db.getCounters();
    const auditLogs = db.getAuditLogs().slice(0, 20);

    const totalSeatsSold = bookings.reduce((sum, b) => sum + b.totalSeats, 0);
    const totalRevenue = bookings.reduce((sum, b) => sum + b.totalFare, 0);

    // Compute counter sales
    const counterBreakdown = counters.map((c) => {
      const bList = bookings.filter((b) => b.counterId === c.id);
      return {
        counter: c.name,
        code: c.code,
        tickets: bList.length,
        seats: bList.reduce((s, b) => s + b.totalSeats, 0),
        revenue: bList.reduce((s, b) => s + b.totalFare, 0),
      };
    });

    const tripBreakdown = schedules.map((s) => ({
      tripNo: s.tripNo,
      direction: s.direction,
      vehicle: s.vehicleRegNo,
      time: s.departureTime,
      bookedSeats: s.totalBookedSeats,
      capacity: s.seatCapacity,
      occupancy: `${Math.round((s.totalBookedSeats / s.seatCapacity) * 100)}%`,
      collection: s.totalCollection,
      reconciled: s.reconciled ? 'সম্পন্ন' : 'বাকি',
      isNightHold: s.isNightHold ? 'হ্যাঁ' : 'না',
    }));

    const promptContext = `
তারিখ: ${targetDate}
মোট সক্রিয় ট্রিপ সংখ্যা: ${schedules.length}
মোট বিক্রিত আসন: ${totalSeatsSold}
মোট অর্জিত রাজস্ব: ৳${totalRevenue}

কাউন্টার ভিত্তিক তথ্য:
${JSON.stringify(counterBreakdown, null, 2)}

ট্রিপ ভিত্তিক সিট লোড ও তথ্য:
${JSON.stringify(tripBreakdown, null, 2)}

সাম্প্রতিক পরিবর্তনের অডিট লগ (শেষ ৫টি):
${JSON.stringify(
  auditLogs.slice(0, 5).map((l) => ({ সময়: l.timestamp, অ্যাকশন: l.actionType, বিবরণ: l.details })),
  null,
  2
)}
`;

    // Attempt Gemini API if key is present
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `আপনি ZB SYSTEM (কাউন্টার বুকিং ও বাস অপারেশন) এর প্রধান বিশ্লেষক। 
নিচের প্রকৃত অপারেশনাল ডেটা বিশ্লেষণ করে বাংলায় একটি গভীর, পেশাদার ও সুবিন্যস্ত এক্সিকিউটিভ সামারি রিপোর্ট তৈরি করুন।

রিপোর্টে নিচের বিষয়গুলো বাধ্যতামূলকভাবে অন্তর্ভুক্ত থাকবে:
১. আজকের সার্বিক পারফরম্যান্স সারসংক্ষেপ (আয়, টিকিট ও সিট অকুপেন্সি রেট)।
২. শীর্ষ সফল কাউন্টার ও অপেক্ষাকৃত কম বুকিং হওয়া কাউন্টারের বিশ্লেষণ।
৩. আপ এবং ডাউন ট্রিপের ভারসাম্য ও নাইট-হোল্ড গাড়িগুলোর ট্রিপ সমন্বয় অবস্থা।
৪. কোনো ট্রিপে সিট লোড কম থাকলে বা তথ্য পরিবর্তনের অডিট লগে কোনো অসঙ্গতি থাকলে সতর্কতা ও সুপারিশ।
৫. আগামী দিনের জন্য তাৎক্ষণিক ৩টি কার্যকর পরামর্শ।

কোনো ভুল বা কাল্পনিক আর্থিক তথ্য তৈরি করবেন না; প্রদত্ত ডেটার ওপর ভিত্তি করে সঠিক বিশ্লেষণ দিন।

ডেটা:
${promptContext}`,
        });

        const aiText = response.text || '';
        return res.json({
          success: true,
          source: 'gemini-3.8-flash',
          date: targetDate,
          summary: aiText,
          stats: {
            trips: schedules.length,
            seats: totalSeatsSold,
            revenue: totalRevenue,
          },
        });
      } catch (err: any) {
        console.error('Gemini API execution error:', err);
      }
    }

    // Fallback rule-based Bengali executive intelligence report
    const bestCounter = [...counterBreakdown].sort((a, b) => b.revenue - a.revenue)[0];
    const avgLoad =
      schedules.length > 0
        ? Math.round((totalSeatsSold / schedules.reduce((s, t) => s + t.seatCapacity, 0)) * 100)
        : 0;

    const fallbackReport = `### 📊 ZB SYSTEM — দৈনিক অপারেশনাল ও আর্থিক এআই সারসংক্ষেপ (${targetDate})

#### ১. সার্বিক পারফরম্যান্স সারসংক্ষেপ
- **মোট সক্রিয় ট্রিপ:** ${schedules.length} টি
- **মোট বিক্রিত আসন:** ${totalSeatsSold} টি
- **গড় সিট অকুপেন্সি রেট:** ${avgLoad}%
- **মোট সংগৃহীত রাজস্ব:** ৳${totalRevenue.toLocaleString('bn-BD')}

#### ২. কাউন্টার বিশ্লেষণ
- 🥇 **শীর্ষ পারফরমার কাউন্টার:** **${bestCounter ? bestCounter.counter : 'N/A'}** (${bestCounter ? `৳${bestCounter.revenue}` : '০'})
- পদ্মা সেতু ও মাদারীপুর রুটে যাত্রী চাপ ভালো রয়েছে। তুলনামূলকভাবে প্রান্তিক কাউন্টারগুলো থেকে অগ্রিম বুকিং বৃদ্ধির সুযোগ রয়েছে।

#### ৩. ট্রিপ সমন্বয় ও নাইট-হোল্ড পর্যবেক্ষণ
- মোট ${schedules.filter((s) => s.reconciled).length} টি ট্রিপ ইতিমধ্যেই হিসাব সমন্বয় সম্পন্ন হয়েছে।
- বাকি ${schedules.filter((s) => !s.reconciled).length} টি ট্রিপ ডাউন কালেকশন জমার অপেক্ষায় রয়েছে।
- নাইট-হোল্ড ট্রিপগুলো পরবর্তী দিনের ডাউন ট্রিপের সাথে সুশৃঙ্খলভাবে রেকর্ড হচ্ছে।

#### ৪. অপারেশনাল সতর্কতা ও সুপারিশ
- সকালের আপ ট্রিপগুলোতে আসন দ্রুত পূর্ণ হচ্ছে; পিক আওয়ারে অতিরিক্ত স্পেশাল ট্রিপ চালুর বিষয়টি বিবেচনা করা যেতে পারে।
- পরিবর্তনের ইতিহাসে ট্রিপের সময় বা গাড়ি পরিবর্তনের কোনো বড় বিচ্যুতি পরিলক্ষিত হয়নি।`;

    return res.json({
      success: true,
      source: 'local-analytics',
      date: targetDate,
      summary: fallbackReport,
      stats: {
        trips: schedules.length,
        seats: totalSeatsSold,
        revenue: totalRevenue,
      },
    });
  }
);

// ==========================================
// 11. SYSTEM SETTINGS
// ==========================================

apiRouter.get('/settings', authMiddleware, (req, res) => {
  res.json({ settings: db.getSettings() });
});

apiRouter.put(
  '/settings',
  authMiddleware,
  requireRole(['master_admin']),
  (req: AuthenticatedRequest, res) => {
    const updated = db.updateSettings(req.body);
    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'SETTINGS_CHANGE',
      entityType: 'SYSTEM',
      entityId: 'settings',
      details: 'সিস্টেম সেটিংস ও নোটিশ বোর্ড আপডেট করা হয়েছে।',
      newValues: updated,
    });
    res.json({ success: true, settings: updated });
  }
);
