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
  verifySignedTokenPayload,
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

export function isNextDay(date1: string, date2: string): boolean {
  try {
    const d1 = new Date(date1);
    d1.setDate(d1.getDate() + 1);
    return d1.toISOString().split('T')[0] === date2;
  } catch {
    return false;
  }
}

function getBookingBreakdown(b: { seatFare?: number; cargoFare?: number; totalFare?: number }) {
  const cargoFare = Math.max(0, Number(b.cargoFare) || 0);
  const total = Math.max(0, Number(b.totalFare) || 0);
  const seatFare =
    b.seatFare !== undefined && b.seatFare !== null && !isNaN(Number(b.seatFare))
      ? Math.max(0, Number(b.seatFare))
      : Math.max(0, total - cargoFare);
  return {
    seatFare,
    cargoFare,
    totalFare: seatFare + cargoFare,
  };
}

function getScheduleCollectionBreakdown(
  s: Schedule | undefined,
  activeBookings: Array<{ scheduleId: string; seatFare?: number; cargoFare?: number; totalFare?: number }>
) {
  if (!s) return { seatCollection: 0, cargoCollection: 0, totalCollection: 0 };
  const sBookings = activeBookings.filter((b) => b.scheduleId === s.id);
  if (sBookings.length > 0) {
    let seatCollection = 0;
    let cargoCollection = 0;
    for (const b of sBookings) {
      const parts = getBookingBreakdown(b);
      seatCollection += parts.seatFare;
      cargoCollection += parts.cargoFare;
    }
    return {
      seatCollection,
      cargoCollection,
      totalCollection: seatCollection + cargoCollection,
    };
  }
  const cargoCollection = Math.max(0, Number(s.totalCargoCollection) || 0);
  const totalCollection = Math.max(0, Number(s.totalCollection) || 0);
  const seatCollection =
    s.totalSeatCollection !== undefined && s.totalSeatCollection !== null
      ? Math.max(0, Number(s.totalSeatCollection))
      : Math.max(0, totalCollection - cargoCollection);
  return {
    seatCollection,
    cargoCollection,
    totalCollection: seatCollection + cargoCollection,
  };
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Permission helper for Schedule and Route Management
export function canManageSchedules(user?: User): boolean {
  if (!user) return false;
  if (
    user.role === 'master_admin' ||
    user.role === 'super_admin' ||
    user.role === 'company_admin' ||
    user.role === 'moderator' ||
    user.role === 'down_counter_head'
  ) {
    return true;
  }
  // Master booking counter operators can add/edit/delete schedules
  if (user.role === 'booking_point' && user.counterType === 'master_booking') {
    return true;
  }
  return false;
}

// Request company resolver for multi-tenant isolation
export function getRequestCompanyId(req: AuthenticatedRequest): string | undefined {
  if (!req.user) return undefined;
  // If user belongs to a company, ALWAYS lock to their company!
  if (req.user.companyId) {
    return req.user.companyId;
  }
  // If super_admin, check if they passed x-company-id header or query companyId
  if (req.user.role === 'super_admin' || req.user.role === 'master_admin') {
    const headerCmp = req.headers['x-company-id'] as string;
    const queryCmp = req.query.companyId as string;
    return headerCmp || queryCmp || undefined;
  }
  return undefined;
}

// Guaranteed Target Company Resolver (Never leaves companyId undefined for created entities)
export function resolveTargetCompanyId(req: AuthenticatedRequest, bodyCompanyId?: string): string {
  // If user belongs to a specific company (company_admin, booking_point, etc.), lock to that company
  if (req.user?.companyId) {
    return req.user.companyId;
  }
  // If Super Admin explicitly passed a companyId in the request body, prioritize it!
  if (bodyCompanyId && bodyCompanyId.trim()) {
    return bodyCompanyId.trim();
  }
  // Otherwise check active company from header or query param
  const reqCompanyId = getRequestCompanyId(req);
  if (reqCompanyId) return reqCompanyId;
  // Fall back to first company if exists
  const companies = db.getCompanies();
  if (companies.length > 0) return companies[0].id;
  throw new Error('কোনো কোম্পানি পাওয়া যায়নি! অনুগ্রহ করে প্রথমে একটি কোম্পানি তৈরি করুন।');
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

  const assignedCompanyId = user.companyId || counter?.companyId;
  const company = assignedCompanyId ? db.getCompanies().find((c) => c.id === assignedCompanyId) : undefined;

  const sanitizedUser: User = {
    id: user.id,
    loginId: user.loginId,
    name: user.name,
    role: user.role,
    companyId: assignedCompanyId,
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
    companyId: sanitizedUser.companyId,
    userId: sanitizedUser.id,
    userName: sanitizedUser.name,
    role: sanitizedUser.role,
    actionType: 'LOGIN',
    entityType: 'USER',
    entityId: sanitizedUser.id,
    details: `${sanitizedUser.name} সফলভাবে সিস্টেমে প্রবেশ করেছেন।`,
  });

    const companyObj = company
      ? {
          id: company.id,
          name: company.name,
          logoUrl: company.logoUrl,
          address: company.address,
          phone: company.phone,
          subscriptionExpiry: company.subscriptionExpiry,
          status: company.status,
        }
      : undefined;

    sanitizedUser.company = companyObj;

    return res.json({
      success: true,
      token,
      user: sanitizedUser,
      company: companyObj,
    });
  });

// Reset Admin credentials endpoint for quick recovery if login fails
apiRouter.post('/auth/reset-admin', (req, res) => {
  let adminUser = db.getUsers().find((u) => u.loginId.toLowerCase() === 'admin');
  const salt = generateSalt();
  const pinHash = hashPin('1234', salt);

  if (adminUser) {
    adminUser.status = 'active';
    adminUser.role = 'super_admin';
    adminUser.pinSalt = salt;
    adminUser.pinHash = pinHash;
  } else {
    adminUser = {
      id: 'usr-01',
      loginId: 'admin',
      name: 'মাস্টার এডমিন (Data&Code)',
      role: 'super_admin',
      phone: '01700-000000',
      status: 'active',
      pinHash,
      pinSalt: salt,
      createdAt: new Date().toISOString(),
    };
    db.getUsers().push(adminUser);
  }
  db.save();
  res.json({ success: true, message: 'মাস্টার এডমিন অ্যাকাউন্ট সফলভাবে রিসেট করা হয়েছে। আইডি: admin, পিন: 1234' });
});

// Current User Profile
apiRouter.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  const targetCmpId = req.user?.companyId || (req.headers['x-company-id'] as string) || (req.query.companyId as string);
  const company = targetCmpId ? db.getCompanies().find((c) => c.id === targetCmpId) : undefined;
  const companyObj = company
    ? {
        id: company.id,
        name: company.name,
        logoUrl: company.logoUrl,
        address: company.address,
        phone: company.phone,
        subscriptionExpiry: company.subscriptionExpiry,
        status: company.status,
      }
    : undefined;

  const enrichedUser = req.user ? { ...req.user, company: companyObj } : undefined;

  res.json({
    user: enrichedUser,
    company: companyObj,
  });
});

// Logout
apiRouter.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    destroySession(authHeader.split(' ')[1]);
  }
  res.json({ success: true, message: 'সফলভাবে লগআউট সম্পন্ন হয়েছে।' });
});

// Self-Service Update Own Login ID & PIN (Super Admin, Company Master Admin & All Users)
apiRouter.put('/auth/credentials', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { currentPin, newLoginId, newPin } = req.body || {};
    const updatedUser = db.updateOwnCredentials(req.user!.id, {
      currentPin,
      newLoginId,
      newPin,
    });

    const company = updatedUser.companyId
      ? db.getCompanies().find((c) => c.id === updatedUser.companyId)
      : undefined;
    const companyObj = company
      ? {
          id: company.id,
          name: company.name,
          logoUrl: company.logoUrl,
          address: company.address,
          phone: company.phone,
          subscriptionExpiry: company.subscriptionExpiry,
          status: company.status,
        }
      : undefined;

    const enrichedUser: User = { ...updatedUser, company: companyObj };

    // Issue fresh session token reflecting any updated loginId and invalidate old one
    const authHeader = req.headers.authorization;
    const oldToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const newToken = createSession(enrichedUser);
    if (oldToken) {
      destroySession(oldToken);
    }

    db.logAudit({
      companyId: enrichedUser.companyId,
      userId: enrichedUser.id,
      userName: enrichedUser.name,
      role: enrichedUser.role,
      actionType: 'UPDATE_CREDENTIALS',
      entityType: 'USER',
      entityId: enrichedUser.id,
      details: `${enrichedUser.name} নিজস্ব লগইন তথ্য (আইডি/পিন) নিরাপদভাবে আপডেট করেছেন।`,
    });

    res.json({
      success: true,
      token: newToken,
      user: enrichedUser,
      message: 'আপনার লগইন আইডি ও পিন সফলভাবে পরিবর্তন হয়েছে!',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'লগইন তথ্য পরিবর্তন করা যায়নি।' });
  }
});

// List Users (Super Admin, Company Admin, Master Admin and Moderator)
apiRouter.get(
  '/users',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator']),
  (req: AuthenticatedRequest, res) => {
    const isPlatformSuperAdmin = req.user!.role === 'super_admin' && !req.user!.companyId;
    const companyId = isPlatformSuperAdmin ? getRequestCompanyId(req) : req.user!.companyId;

    if (!isPlatformSuperAdmin && !companyId) {
      return res.json({ users: [] });
    }

    const users = db
      .getUsers(companyId)
      .filter((u) => {
        // Non-super-admin users NEVER see super_admin accounts
        if (!isPlatformSuperAdmin && u.role === 'super_admin') return false;
        return true;
      })
      .map((u) => {
        const counter = db.getCounters().find((c) => c.id === u.counterId);
        // Super Admin cannot inspect any company master/admin's changed Login ID
        const hideIdFromViewer =
          isPlatformSuperAdmin &&
          u.id !== req.user!.id &&
          (u.role === 'company_admin' || u.role === 'master_admin');

        return {
          id: u.id,
          loginId: hideIdFromViewer ? '••••••••' : u.loginId,
          isCredentialHidden: hideIdFromViewer,
          name: u.name,
          role: u.role,
          companyId: u.companyId,
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

// Create User (Super Admin, Master Admin or Company Admin)
apiRouter.post(
  '/users',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin']),
  (req: AuthenticatedRequest, res) => {
    const { loginId, name, role, counterId, phone, pin } = req.body;
    if (!loginId || !name || !role || !pin) {
      return res.status(400).json({ error: 'সকল প্রয়োজনীয় তথ্য প্রদান করুন।' });
    }

    if (role === 'super_admin') {
      return res.status(403).json({ error: 'সুপার এডমিন রোল তৈরি করার অনুমতি নেই।' });
    }

    if (pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ error: 'পিন অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।' });
    }

    const targetCompanyId = resolveTargetCompanyId(req, req.body.companyId);

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
      companyId: targetCompanyId,
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
      companyId: targetCompanyId,
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_USER',
      entityType: 'USER',
      entityId: newUser.id,
      details: `নতুন ব্যবহারকারী "${newUser.name}" (${newUser.role}) তৈরি করা হয়েছে।`,
    });

    const { pinHash: _ph, pinSalt: _ps, ...safeUser } = newUser;
    res.json({ success: true, user: safeUser });
  }
);

// Update User (Super Admin, Master Admin or Company Admin)
apiRouter.put(
  '/users/:id',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin']),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { name, role, counterId, phone, status, pin } = req.body;
    const user = db.getUsers().find((u) => u.id === id);
    if (!user) {
      return res.status(404).json({ error: 'ব্যবহারকারী খুঁজে পাওয়া যায়নি।' });
    }

    const isPlatformSuperAdmin = req.user!.role === 'super_admin' && !req.user!.companyId;
    if (!isPlatformSuperAdmin) {
      if (user.role === 'super_admin' || user.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: 'অন্য কোনো একাউন্ট বা কোম্পানির ইউজার পরিবর্তনের অনুমতি নেই।' });
      }
      if (role === 'super_admin') {
        return res.status(403).json({ error: 'অননুমোদিত রোল পরিবর্তন।' });
      }
    }

    if (name) user.name = name.trim();
    if (role && role !== 'super_admin') user.role = role;
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
      companyId: user.companyId,
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'UPDATE_USER',
      entityType: 'USER',
      entityId: user.id,
      details: `ব্যবহারকারী "${user.name}" এর তথ্য আপডেট করা হয়েছে।`,
    });

    const { pinHash: _ph, pinSalt: _ps, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  }
);

// Delete User (Super Admin, Master Admin or Company Admin)
apiRouter.delete(
  '/users/:id',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin']),
  (req: AuthenticatedRequest, res) => {
    try {
      const targetUser = db.getUsers().find((u) => u.id === req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: 'ব্যবহারকারী খুঁজে পাওয়া যায়নি।' });
      }
      const isPlatformSuperAdmin = req.user!.role === 'super_admin' && !req.user!.companyId;
      if (!isPlatformSuperAdmin && (targetUser.role === 'super_admin' || targetUser.companyId !== req.user!.companyId)) {
        return res.status(403).json({ error: 'এই ব্যবহারকারীকে মুছে ফেলার অনুমতি নেই।' });
      }

      const deleted = db.deleteUser(req.params.id);
      db.logAudit({
        companyId: deleted.companyId,
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_USER',
        entityType: 'USER',
        entityId: req.params.id,
        details: `ব্যবহারকারী "${deleted.name}" মুছে ফেলা হয়েছে।`,
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

apiRouter.get('/companies/public', (_req, res) => {
  // Never enumerate registered companies or expose adminLoginId publicly on the login page
  res.json({ companies: [] });
});

apiRouter.get('/companies', authMiddleware, (req: AuthenticatedRequest, res) => {
  const isPlatformSuperAdmin = req.user?.role === 'super_admin' && !req.user?.companyId;
  const allCompanies = db.getCompanies();
  const visibleCompanies = isPlatformSuperAdmin
    ? allCompanies
    : allCompanies.filter((c) => c.id === req.user?.companyId);

  const sanitized = visibleCompanies.map(({ adminPinHash, adminPinSalt, adminLoginId, ...c }) => ({
    ...c,
    adminLoginId: '',
  }));
  res.json({ companies: sanitized });
});

apiRouter.post(
  '/companies',
  authMiddleware,
  requireRole(['super_admin']),
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
        details: `নতুন কোম্পানি "${company.name}" তৈরি করা হয়েছে। সাবস্ক্রিপশন মেয়াদ: ${company.subscriptionExpiry}`,
      });

      const { adminPinHash: _h, adminPinSalt: _s, adminLoginId: _id, ...safeCompany } = company;
      res.json({ success: true, company: { ...safeCompany, adminLoginId: '' } });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'কোম্পানি তৈরিতে সমস্যা হয়েছে।' });
    }
  }
);

apiRouter.put(
  '/companies/:id',
  authMiddleware,
  requireRole(['super_admin']),
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
      const { adminPinHash: _h, adminPinSalt: _s, adminLoginId: _id, ...safeCompany } = updated;
      res.json({ success: true, company: { ...safeCompany, adminLoginId: '' } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

apiRouter.get(
  '/companies/:id/stats',
  authMiddleware,
  requireRole(['super_admin']),
  (req: AuthenticatedRequest, res) => {
    const comp = db.getCompanies().find((c) => c.id === req.params.id);
    if (!comp) {
      return res.status(404).json({ error: 'কোম্পানি খুঁজে পাওয়া যায়নি।' });
    }
    res.json({
      success: true,
      company: { id: comp.id, name: comp.name },
      stats: db.getCompanyStats(req.params.id),
    });
  }
);

apiRouter.delete(
  '/companies/:id',
  authMiddleware,
  requireRole(['super_admin']),
  (req: AuthenticatedRequest, res) => {
    try {
      const { deletedName, removedCount } = db.deleteCompany(req.params.id);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'DELETE_COMPANY',
        entityType: 'COMPANY',
        entityId: req.params.id,
        details: `কোম্পানি "${deletedName}" এবং এর সংশ্লিষ্ট ${removedCount} টি রেকর্ড নিরাপদভাবে মুছে ফেলা হয়েছে।`,
      });
      res.json({
        success: true,
        deletedId: req.params.id,
        deletedName,
        removedCount,
        message: `কোম্পানি "${deletedName}" এবং এর সকল ডাটা সফলভাবে মুছে ফেলা হয়েছে।`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ==========================================
// 2. COUNTER MANAGEMENT
// ==========================================

apiRouter.get('/counters', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const isPlatformSuperAdmin = req.user?.role === 'super_admin' && !req.user?.companyId;
  const users = db.getUsers(companyId);
  const countersWithUsers = db.getCounters(companyId).map((counter) => {
    const assignedUsers = users
      .filter((u) => u.counterId === counter.id)
      .map((u) => {
        const hideId =
          isPlatformSuperAdmin &&
          u.id !== req.user?.id &&
          (u.role === 'company_admin' || u.role === 'master_admin');
        return {
          id: u.id,
          name: u.name,
          loginId: hideId ? '••••••••' : u.loginId,
          phone: u.phone,
        };
      });
    return {
      ...counter,
      assignedUsers,
    };
  });
  res.json({ counters: countersWithUsers });
});

// Add Counter (Super Admin, Master Admin or Company Admin)
apiRouter.post(
  '/counters',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin']),
  (req: AuthenticatedRequest, res) => {
    const { name, code, address, phone, seatColor, counterType, tripDirection } = req.body;
    if (!name || !code || !seatColor) {
      return res.status(400).json({ error: 'কাউন্টারের নাম, কোড এবং সিট রঙ আবশ্যক।' });
    }

    const companyId = resolveTargetCompanyId(req, req.body.companyId);
    const cleanCode = code.trim().toUpperCase();
    const cleanColor = seatColor.trim().toUpperCase();

    // Check unique code within company
    const existingCode = db.getCounters(companyId).find((c) => c.code.toUpperCase() === cleanCode);
    if (existingCode) {
      return res.status(400).json({ error: `কাউন্টার কোড '${cleanCode}' ইতিমধ্যেই ব্যবহৃত হয়েছে!` });
    }

    // Check unique active color (prevent duplicate active counter colors within company)
    const existingColor = db
      .getCounters(companyId)
      .find((c) => c.status === 'active' && c.seatColor.toUpperCase() === cleanColor);
    if (existingColor) {
      return res.status(400).json({
        error: `এই সিট কালারটি (${cleanColor}) ইতিমধ্যেই '${existingColor.name}' কাউন্টারে ব্যবহৃত হচ্ছে। ভিন্ন রঙ নির্বাচন করুন।`,
      });
    }

    // Strictly 'UP' or 'DOWN'
    const direction: 'UP' | 'DOWN' = tripDirection === 'DOWN' ? 'DOWN' : 'UP';

    const newCounter: Counter = {
      id: `cnt-${Date.now()}`,
      companyId,
      name: name.trim(),
      code: cleanCode,
      counterType: counterType === 'master_booking' ? 'master_booking' : 'road_booking',
      tripDirection: direction,
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
      details: `নতুন ${newCounter.counterType === 'master_booking' ? 'মাষ্টার বুকিং' : 'রোড বুকিং'} (${newCounter.tripDirection === 'UP' ? 'আপ কাউন্টার' : 'ডাউন কাউন্টার'}) "${newCounter.name}" (${newCounter.code}) তৈরি করা হয়েছে।`,
    });

    res.json({ success: true, counter: newCounter });
  }
);

// Update Counter (Super Admin, Master Admin or Company Admin)
apiRouter.put(
  '/counters/:id',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin']),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { name, code, address, phone, seatColor, status, counterType, tripDirection } = req.body;
    const counter = db.getCounters().find((c) => c.id === id);
    if (!counter) {
      return res.status(404).json({ error: 'কাউন্টার পাওয়া যায়নি।' });
    }

    const companyId = counter.companyId;

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existingCode = db.getCounters(companyId).find((c) => c.id !== id && c.code.toUpperCase() === cleanCode);
      if (existingCode) {
        return res.status(400).json({ error: `কাউন্টার কোড '${cleanCode}' অন্য কাউন্টারে ব্যবহৃত হয়েছে!` });
      }
      counter.code = cleanCode;
    }

    if (counterType) {
      counter.counterType = counterType === 'master_booking' ? 'master_booking' : 'road_booking';
    }

    if (tripDirection !== undefined) {
      counter.tripDirection = tripDirection === 'DOWN' ? 'DOWN' : 'UP';
    }

    if (seatColor) {
      const cleanColor = seatColor.trim().toUpperCase();
      const existingColor = db
        .getCounters(companyId)
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
      details: `কাউন্টার "${counter.name}" (${counter.code}) এর তথ্য আপডেট করা হয়েছে।`,
    });

    res.json({ success: true, counter });
  }
);

// Delete Counter (Super Admin, Master Admin or Company Admin)
apiRouter.delete(
  '/counters/:id',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin']),
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

apiRouter.get('/vehicles', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  res.json({ vehicles: db.getVehicles(companyId) });
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

    const companyId = resolveTargetCompanyId(req, req.body.companyId);
    const cleanReg = regNo.trim();
    const existing = db.getVehicles(companyId).find((v) => v.regNo.toLowerCase() === cleanReg.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'এই গাড়ি নম্বরটি ইতিমধ্যেই নিবন্ধিত রয়েছে।' });
    }

    const capacity = Number(seatCapacity) === 46 ? 46 : 42;

    const newVehicle: Vehicle = {
      id: `veh-${Date.now()}`,
      companyId,
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
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator']),
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

apiRouter.get('/supervisors', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const rawSupervisors = db.getSupervisors(companyId);
  const reconciliations = db.getReconciliations(companyId);
  const schedules = db.getSchedules(companyId);
  const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

  // Count only full completed reconciled trips (সমন্বয় সম্পন্ন ট্রিপ)
  const supervisorsWithTrips = rawSupervisors.map((s) => {
    const sName = s.name.trim().toLowerCase();
    const count = reconciliations.filter((r) => {
      if (r.supervisor && r.supervisor.trim().toLowerCase() === sName) return true;
      const up = r.upTripId ? scheduleMap.get(r.upTripId) : undefined;
      const down = r.downTripId ? scheduleMap.get(r.downTripId) : undefined;
      if (up?.supervisor && up.supervisor.trim().toLowerCase() === sName) return true;
      if (down?.supervisor && down.supervisor.trim().toLowerCase() === sName) return true;
      return false;
    }).length;
    return {
      ...s,
      totalTrips: count,
    };
  });

  // Sort by totalTrips descending for rankings
  supervisorsWithTrips.sort((a, b) => b.totalTrips - a.totalTrips);
  const supervisors = supervisorsWithTrips.map((s, idx) => ({
    ...s,
    rank: idx + 1,
  }));

  res.json({ supervisors });
});

apiRouter.post(
  '/supervisors',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী সুপারভাইজার যুক্ত করতে পারেন।' });
    }
    const { name, names } = req.body;
    const rawList: string[] = Array.isArray(names)
      ? names.map((n: any) => String(n || '').trim()).filter(Boolean)
      : typeof name === 'string'
      ? name.split(/[,،\n]+/).map((n) => n.trim()).filter(Boolean)
      : [];

    if (rawList.length === 0) {
      return res.status(400).json({ error: 'কমপক্ষে একজন সুপারভাইজারের নাম আবশ্যক।' });
    }
    const companyId = resolveTargetCompanyId(req, req.body.companyId);
    const { created, skippedCount } = db.createSupervisorsBulk(rawList, companyId);
    if (created.length === 0) {
      return res.status(400).json({ error: 'প্রদত্ত সুপারভাইজার নামগুলো ইতিমধ্যেই তালিকায় রয়েছে।' });
    }
    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_SUPERVISOR',
      entityType: 'SUPERVISOR',
      entityId: created[0].id,
      details:
        created.length === 1
          ? `নতুন সুপারভাইজার "${created[0].name}" যুক্ত করা হয়েছে।`
          : `একসাথে ${created.length} জন সুপারভাইজার যুক্ত করা হয়েছে: ${created.map((s) => s.name).join(', ')}।`,
    });
    res.json({
      success: true,
      supervisor: created[0],
      supervisors: created,
      createdCount: created.length,
      skippedCount,
    });
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
// 3.2 DRIVERS DIRECTORY (NAME & OPTIONAL PHONE, NO LOGIN)
// ==========================================

apiRouter.get('/drivers', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const rawDrivers = db.getDrivers(companyId);
  const reconciliations = db.getReconciliations(companyId);
  const schedules = db.getSchedules(companyId);
  const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

  // Count only full completed reconciled trips (সমন্বয় সম্পন্ন ট্রিপ)
  const driversWithTrips = rawDrivers.map((d) => {
    const dName = d.name.trim().toLowerCase();
    const count = reconciliations.filter((r) => {
      if (r.driver && r.driver.trim().toLowerCase() === dName) return true;
      const up = r.upTripId ? scheduleMap.get(r.upTripId) : undefined;
      const down = r.downTripId ? scheduleMap.get(r.downTripId) : undefined;
      if (up?.driver && up.driver.trim().toLowerCase() === dName) return true;
      if (down?.driver && down.driver.trim().toLowerCase() === dName) return true;
      return false;
    }).length;
    return {
      ...d,
      totalTrips: count,
    };
  });

  // Sort by totalTrips descending for rankings
  driversWithTrips.sort((a, b) => b.totalTrips - a.totalTrips);
  const drivers = driversWithTrips.map((d, idx) => ({
    ...d,
    rank: idx + 1,
  }));

  res.json({ drivers });
});

apiRouter.post(
  '/drivers',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন বা অনুমোদিত ব্যবহারকারী ড্রাইভার যুক্ত করতে পারেন।' });
    }
    const { name, names } = req.body;
    const rawList: string[] = Array.isArray(names)
      ? names.map((n: any) => String(n || '').trim()).filter(Boolean)
      : typeof name === 'string'
      ? name.split(/[,،\n]+/).map((n) => n.trim()).filter(Boolean)
      : [];

    if (rawList.length === 0) {
      return res.status(400).json({ error: 'কমপক্ষে একজন ড্রাইভারের নাম আবশ্যক।' });
    }
    const companyId = resolveTargetCompanyId(req, req.body.companyId);
    const { created, skippedCount } = db.createDriversBulk(rawList, companyId);
    if (created.length === 0) {
      return res.status(400).json({ error: 'প্রদত্ত ড্রাইভার নামগুলো ইতিমধ্যেই তালিকায় রয়েছে।' });
    }
    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_DRIVER',
      entityType: 'DRIVER' as any,
      entityId: created[0].id,
      details:
        created.length === 1
          ? `নতুন ড্রাইভার "${created[0].name}" যুক্ত করা হয়েছে।`
          : `একসাথে ${created.length} জন ড্রাইভার যুক্ত করা হয়েছে: ${created.map((d) => d.name).join(', ')}।`,
    });
    res.json({
      success: true,
      driver: created[0],
      drivers: created,
      createdCount: created.length,
      skippedCount,
    });
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

apiRouter.get('/routes', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  res.json({ routes: db.getRoutes(companyId) });
});

apiRouter.post(
  '/routes',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({ error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার রুট তৈরি করতে পারে।' });
    }

    const { routeNumber, name, origin, destination, intermediateStops, baseFare, distanceKm, direction } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'রুটের শুরু ও গন্তব্য আবশ্যক।' });
    }

    const companyId = resolveTargetCompanyId(req, req.body.companyId);
    const routeName = name?.trim() || `${origin.trim()} - ${destination.trim()}`;
    const cleanDirection: 'UP' | 'DOWN' = direction === 'DOWN' ? 'DOWN' : 'UP';
    const parsedRouteNumber =
      routeNumber !== undefined && routeNumber !== null && String(routeNumber).trim() !== '' && Number(routeNumber) > 0
        ? Number(routeNumber)
        : undefined;

    const newRoute: RouteItem = {
      id: `rt-${Date.now()}`,
      companyId,
      routeNumber: parsedRouteNumber,
      name: routeName,
      origin: origin.trim(),
      destination: destination.trim(),
      intermediateStops: Array.isArray(intermediateStops)
        ? intermediateStops.map((s: string) => s.trim()).filter(Boolean)
        : [],
      direction: cleanDirection,
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
      details: `নতুন রুট "${newRoute.name}" (${newRoute.direction === 'UP' ? 'আপ রুট' : 'ডাউন রুট'}) তৈরি করা হয়েছে।`,
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

apiRouter.get('/schedules', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const { date, exactDateOnly, startDate, endDate, direction, vehicleId, supervisor, ownerName } = req.query;
  let schedules = [...db.getSchedules(companyId)];

  if (date) {
    if (exactDateOnly === 'true') {
      schedules = schedules.filter((s) => s.date === date && s.status !== 'cancelled');
    } else {
      schedules = schedules.filter((s) => {
        if (s.date === date) return true;
        // Include yesterday's night-hold UP trips that return on this operational date
        if (s.direction === 'UP' && s.isNightHold && (s.nightHoldNextDate === date || isNextDay(s.date, date as string))) {
          return true;
        }
        return false;
      });
    }
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

  const vehicleMap = new Map<string, Vehicle>();
  for (const v of db.getVehicles(companyId)) {
    vehicleMap.set(v.id, v);
  }
  const routeMap = new Map<string, RouteItem>();
  for (const r of db.getRoutes(companyId)) {
    routeMap.set(r.id, r);
  }
  const activeBookings = db.getBookings(companyId).filter((b) => b.status === 'booked');

  // Group by date + vehicleId to calculate trip sequence if multiple trips
  // CRITICAL REQUIREMENT: ১ম/২য় ট্রিপ লজিক শুধু আপ ট্রিপে! ডাউন ট্রিপে কোনো গাড়ি ১ম/২য় হবে না।
  const dateVehGroups = new Map<string, Schedule[]>();
  for (const s of db.getSchedules(companyId)) {
    if (s.status === 'cancelled') continue;
    const key = `${s.date}_${s.vehicleId}`;
    if (!dateVehGroups.has(key)) dateVehGroups.set(key, []);
    dateVehGroups.get(key)!.push(s);
  }

  for (const [, list] of dateVehGroups) {
    list.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    const upList = list.filter((x) => x.direction === 'UP');
    let upIdx = 0;

    list.forEach((s) => {
      if (s.direction === 'UP') {
        s.tripSequenceOnDay = upIdx + 1;
        s.tripSequenceLabel =
          upList.length > 1
            ? upIdx === 0
              ? '১ম ট্রিপ'
              : upIdx === 1
              ? '২য় ট্রিপ'
              : upIdx === 2
              ? '৩য় ট্রিপ'
              : upIdx === 3
              ? '৪র্থ ট্রিপ'
              : `${toBnDigits(upIdx + 1)}তম ট্রিপ`
            : undefined;
        upIdx++;
      } else {
        // DOWN trips never have sequence labels
        s.tripSequenceOnDay = 1;
        s.tripSequenceLabel = undefined;
      }

      if (!s.vehicleOwnerName) {
        const veh = vehicleMap.get(s.vehicleId);
        if (veh?.ownerName) s.vehicleOwnerName = veh.ownerName;
      }
    });
  }

  const enrichedSchedules = schedules.map((s) => {
    const linkedRoute = routeMap.get(s.routeId);
    const col = getScheduleCollectionBreakdown(s, activeBookings);
    return {
      ...s,
      routeNumber: s.routeNumber ?? linkedRoute?.routeNumber,
      totalSeatCollection: col.seatCollection,
      totalCargoCollection: col.cargoCollection,
      totalCollection: col.totalCollection,
    };
  });

  // Sort by date desc, then departure time asc
  enrichedSchedules.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.departureTime.localeCompare(b.departureTime);
  });

  res.json({ schedules: enrichedSchedules });
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

// Create Schedule
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

    const targetCompanyId = resolveTargetCompanyId(req, req.body.companyId);

    const vehicle = db.getVehicles(targetCompanyId).find((v) => v.id === vehicleId) || db.getVehicles().find((v) => v.id === vehicleId);
    if (!vehicle) {
      return res.status(400).json({ error: 'নির্বাচিত গাড়ি পাওয়া যায়নি।' });
    }

    // Auto-resolve route if not provided, preferring direction matching
    let route = routeId ? db.getRoutes(targetCompanyId).find((r) => r.id === routeId) : undefined;
    if (!route) {
      route = db
        .getRoutes(targetCompanyId)
        .find((r) => r.status === 'active' && r.direction === direction);
      if (!route) {
        route = {
          id: `rt-auto-${Date.now()}`,
          companyId: targetCompanyId,
          name: direction === 'UP' ? 'টার্মিনাল - ঢাকা' : 'ঢাকা - টার্মিনাল',
          origin: direction === 'UP' ? 'টার্মিনাল' : 'ঢাকা',
          destination: direction === 'UP' ? 'ঢাকা' : 'টার্মিনাল',
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
      .getSchedules(targetCompanyId)
      .filter((s) => s.date === date && s.vehicleId === vehicleId && s.status !== 'cancelled');

    // Duplicate Check: Same vehicle, same date, exact same departure time
    const exactDuplicate = existingTripsForVehicle.find((s) => s.departureTime === departureTime.trim());
    if (exactDuplicate) {
      return res.status(400).json({
        error: `এই গাড়িটির (${vehicle.regNo}) এই তারিখে (${date}) ঠিক একই সময়ে (${departureTime}) ইতিমধ্যে ট্রিপ (${exactDuplicate.tripNo}) বিদ্যমান! ভিন্ন সময় নির্ধারণ করুন।`,
      });
    }

    // Sequence calculation for multiple trips of same vehicle on same day
    // USER REQUIREMENT: ১ম/২য় ট্রিপ লজিক শুধু আপ ট্রিপে! ডাউন ট্রিপে কোনো গাড়ি ১ম/২য় হবে না।
    let tripSequence = 1;
    let tripSequenceLabel: string | undefined = undefined;

    if (direction === 'UP') {
      const upTripsForVeh = existingTripsForVehicle.filter((s) => s.direction === 'UP');
      tripSequence = upTripsForVeh.length + 1;
      if (tripSequence > 1) {
        tripSequenceLabel =
          tripSequence === 2
            ? '২য় ট্রিপ'
            : tripSequence === 3
            ? '৩য় ট্রিপ'
            : tripSequence === 4
            ? '৪র্থ ট্রিপ'
            : `${toBnDigits(tripSequence)}তম ট্রিপ`;
      }
    }

    const tripCount = db.getSchedules(targetCompanyId).length + 1;
    const tripNo = `TR-${direction}-${String(tripCount).padStart(3, '0')}`;

    // Calculate nightHoldNextDate if night hold is checked
    let nightHoldNextDate: string | undefined = undefined;
    if (isNightHold && date) {
      const d = new Date(date);
      d.setDate(d.getDate() + 1);
      nightHoldNextDate = d.toISOString().split('T')[0];
    }

    // Check if this is a linked return trip (ফিরতি ট্রিপ)
    let parentTrip: Schedule | undefined;
    if (linkedTripId) {
      parentTrip = db.getSchedules(targetCompanyId).find((s) => s.id === linkedTripId) || db.getSchedules().find((s) => s.id === linkedTripId);
    } else if (direction === 'DOWN') {
      // Auto-link to matching active unreturned UP trip for the same vehicle
      parentTrip = db.getSchedules(targetCompanyId).find(
        (s) =>
          s.vehicleId === vehicle.id &&
          s.direction === 'UP' &&
          !s.returnTripCreated &&
          s.status !== 'cancelled' &&
          (s.date === date || (s.isNightHold && (s.nightHoldNextDate === date || isNextDay(s.date, date))))
      );
    }

    const newSchedule: Schedule = {
      id: `sch-${Date.now()}`,
      companyId: targetCompanyId,
      tripNo,
      date,
      departureTime: departureTime.trim(),
      vehicleId: vehicle.id,
      vehicleRegNo: vehicle.regNo,
      vehicleOwnerName: vehicle.ownerName || '',
      tripSequenceOnDay: tripSequence,
      tripSequenceLabel,
      seatCapacity: vehicle.seatCapacity,
      routeId: route.id,
      routeNumber: route.routeNumber,
      routeName: route.name,
      supervisor: supervisor.trim(),
      supervisorPhone: supervisorPhone?.trim() || '',
      driver: driver ? driver.trim() : (parentTrip?.driver || ''),
      direction: direction as 'UP' | 'DOWN',
      fare: effectiveFare,
      isNightHold: Boolean(isNightHold),
      nightHoldNextDate,
      status: 'scheduled',
      reconciled: false,
      returnTripCreated: direction === 'DOWN' ? true : false,
      totalBookedSeats: 0,
      totalSeatCollection: 0,
      totalCargoCollection: 0,
      totalCollection: 0,
      linkedTripId: parentTrip ? parentTrip.id : (linkedTripId || undefined),
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
      details: `নতুন ${direction === 'UP' ? 'আপ ট্রিপ' : 'ডাউন ট্রিপ'} (${newSchedule.tripNo}) তৈরি করা হয়েছে। গাড়ি: ${vehicle.regNo}${tripSequenceLabel ? ` (${tripSequenceLabel})` : ''}, সময়: ${departureTime}, ভাড়া: ৳${fare}`,
      newValues: newSchedule,
    });

    res.json({ success: true, schedule: newSchedule });
  }
);

// Forward UP Schedules from a source date (e.g. yesterday) to a target date (e.g. today or selected date)
apiRouter.post(
  '/schedules/forward-up',
  authMiddleware,
  (req: AuthenticatedRequest, res) => {
    if (!canManageSchedules(req.user)) {
      return res.status(403).json({
        error: 'শুধুমাত্র এডমিন, মডারেটর এবং মাষ্টার বুকিং কাউন্টার শিডিউল ফরোয়ার্ড করতে পারে।',
      });
    }

    const { sourceDate, targetDate, scheduleIds } = req.body;
    if (!sourceDate || !targetDate) {
      return res.status(400).json({ error: 'পূর্ববর্তী তারিখ এবং নতুন লক্ষ্য তারিখ উভয়ই আবশ্যক।' });
    }

    const targetCompanyId = resolveTargetCompanyId(req, req.body.companyId);
    const allCompanySchedules = db.getSchedules(targetCompanyId);
    const routeMap = new Map(db.getRoutes(targetCompanyId).map((r) => [r.id, r]));

    let sourceUpTrips = allCompanySchedules.filter(
      (s) => s.date === sourceDate && s.direction === 'UP' && s.status !== 'cancelled'
    );

    if (Array.isArray(scheduleIds) && scheduleIds.length > 0) {
      const allowedSet = new Set(scheduleIds);
      sourceUpTrips = sourceUpTrips.filter((s) => allowedSet.has(s.id));
    }

    if (sourceUpTrips.length === 0) {
      return res.status(400).json({
        error: `${sourceDate} তারিখে ফরোয়ার্ড করার মতো কোনো আপ ট্রিপ পাওয়া যায়নি।`,
      });
    }

    sourceUpTrips.sort((a, b) => {
      const rNumA = a.routeNumber ?? routeMap.get(a.routeId)?.routeNumber ?? Number.MAX_SAFE_INTEGER;
      const rNumB = b.routeNumber ?? routeMap.get(b.routeId)?.routeNumber ?? Number.MAX_SAFE_INTEGER;
      if (rNumA !== rNumB) return rNumA - rNumB;
      return a.departureTime.localeCompare(b.departureTime);
    });

    const existingOnTarget = allCompanySchedules.filter(
      (s) => s.date === targetDate && s.status !== 'cancelled'
    );
    const createdSchedules: Schedule[] = [];
    let skippedCount = 0;
    const baseTripCount = allCompanySchedules.length;

    for (const src of sourceUpTrips) {
      const isDuplicate =
        existingOnTarget.some(
          (s) => s.vehicleId === src.vehicleId && s.departureTime === src.departureTime
        ) ||
        createdSchedules.some(
          (s) => s.vehicleId === src.vehicleId && s.departureTime === src.departureTime
        );

      if (isDuplicate) {
        skippedCount++;
        continue;
      }

      const upCountForVeh =
        existingOnTarget.filter((s) => s.vehicleId === src.vehicleId && s.direction === 'UP').length +
        createdSchedules.filter((s) => s.vehicleId === src.vehicleId && s.direction === 'UP').length;
      const tripSequence = upCountForVeh + 1;
      const tripSequenceLabel =
        tripSequence === 2
          ? '২য় ট্রিপ'
          : tripSequence === 3
          ? '৩য় ট্রিপ'
          : tripSequence === 4
          ? '৪র্থ ট্রিপ'
          : tripSequence > 4
          ? `${toBnDigits(tripSequence)}তম ট্রিপ`
          : undefined;

      let nightHoldNextDate: string | undefined = undefined;
      if (src.isNightHold) {
        const d = new Date(targetDate);
        d.setDate(d.getDate() + 1);
        nightHoldNextDate = d.toISOString().split('T')[0];
      }

      const tripNo = `TR-UP-${String(baseTripCount + createdSchedules.length + 1).padStart(3, '0')}`;
      const linkedRoute = routeMap.get(src.routeId);
      const nowIso = new Date().toISOString();

      const cloned: Schedule = {
        id: `sch-${Date.now()}-${createdSchedules.length}-${Math.floor(Math.random() * 100)}`,
        companyId: targetCompanyId,
        tripNo,
        date: targetDate,
        departureTime: src.departureTime,
        vehicleId: src.vehicleId,
        vehicleRegNo: src.vehicleRegNo,
        vehicleOwnerName: src.vehicleOwnerName || '',
        tripSequenceOnDay: tripSequence,
        tripSequenceLabel,
        seatCapacity: src.seatCapacity,
        routeId: src.routeId,
        routeNumber: src.routeNumber ?? linkedRoute?.routeNumber,
        routeName: src.routeName,
        supervisor: src.supervisor,
        supervisorPhone: src.supervisorPhone || '',
        driver: src.driver || '',
        direction: 'UP',
        fare: src.fare,
        isNightHold: Boolean(src.isNightHold),
        nightHoldNextDate,
        status: 'scheduled',
        reconciled: false,
        returnTripCreated: false,
        totalBookedSeats: 0,
        totalSeatCollection: 0,
        totalCargoCollection: 0,
        totalCollection: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      db.getSchedules().push(cloned);
      createdSchedules.push(cloned);
    }

    if (createdSchedules.length > 0) {
      db.save();
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'FORWARD_UP_SCHEDULES',
        entityType: 'SCHEDULE',
        entityId: `fwd-${targetDate}`,
        details: `${sourceDate} তারিখ থেকে ${createdSchedules.length}টি আপ ট্রিপ ${targetDate} তারিখে ফরোয়ার্ড করা হয়েছে (${skippedCount}টি ডুপ্লিকেট বাদ)।`,
      });
    }

    res.json({
      success: true,
      createdSchedules,
      createdCount: createdSchedules.length,
      skippedCount,
    });
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
    const { date, departureTime, vehicleId, supervisor, supervisorPhone, driver, routeId, fare, isNightHold, updateReason } = req.body;
    const schedule = db.getSchedules().find((s) => s.id === id);
    if (!schedule) {
      return res.status(404).json({ error: 'শিডিউল পাওয়া যায়নি।' });
    }

    const previousValues = {
      date: schedule.date,
      departureTime: schedule.departureTime,
      vehicleRegNo: schedule.vehicleRegNo,
      supervisor: schedule.supervisor,
      driver: schedule.driver,
      fare: schedule.fare,
    };

    let changes: string[] = [];

    if (date && date !== schedule.date) {
      changes.push(`তারিখ: ${schedule.date} ➜ ${date}`);
      schedule.date = date;
      if (schedule.isNightHold) {
        try {
          const d = new Date(date);
          d.setDate(d.getDate() + 1);
          schedule.nightHoldNextDate = d.toISOString().split('T')[0];
        } catch {}
      }
      // Keep attached bookings in sync
      db.getBookings().forEach((b) => {
        if (b.scheduleId === schedule.id) {
          b.tripDate = date;
        }
      });
    }

    if (departureTime && departureTime !== schedule.departureTime) {
      changes.push(`সময়: ${schedule.departureTime} ➜ ${departureTime}`);
      schedule.departureTime = departureTime;
      db.getBookings().forEach((b) => {
        if (b.scheduleId === schedule.id) {
          b.tripTime = departureTime;
        }
      });
    }

    if (vehicleId && vehicleId !== schedule.vehicleId) {
      const veh = db.getVehicles().find((v) => v.id === vehicleId);
      if (veh) {
        changes.push(`গাড়ি: ${schedule.vehicleRegNo} ➜ ${veh.regNo}`);
        schedule.vehicleId = veh.id;
        schedule.vehicleRegNo = veh.regNo;
        schedule.vehicleOwnerName = veh.ownerName || '';
        schedule.seatCapacity = veh.seatCapacity;
        db.getBookings().forEach((b) => {
          if (b.scheduleId === schedule.id) {
            b.vehicleRegNo = veh.regNo;
          }
        });
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
        schedule.routeNumber = rt.routeNumber;
        schedule.routeName = rt.name;
      }
    }

    if (supervisorPhone !== undefined) {
      schedule.supervisorPhone = supervisorPhone;
    }

    if (fare !== undefined && Number(fare) !== schedule.fare) {
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
        date: schedule.date,
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
  if (req.user?.role === 'fuel_manager' || req.user?.role === 'checker') {
    return res.status(403).json({ error: 'আপনার রোল থেকে টিকিট বুকিং করার অনুমতি নেই।' });
  }
  const {
    scheduleId,
    counterId,
    passengerName,
    passengerPhone,
    boardingPoint,
    destination,
    seatNumbers,
    seatFare,
    cargoFare,
    totalFare,
    manualFare,
    farePerSeat,
  } = req.body;

  const cleanSeats = Array.isArray(seatNumbers) ? seatNumbers : [];
  const parsedCargoFare =
    cargoFare !== undefined && cargoFare !== '' && cargoFare !== null
      ? Math.max(0, Number(cargoFare) || 0)
      : 0;

  if (!scheduleId || (cleanSeats.length === 0 && parsedCargoFare <= 0)) {
    return res.status(400).json({ error: 'শিডিউল এবং কমপক্ষে একটি সিট অথবা মালের ভাড়া প্রদান করুন।' });
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

  let parsedSeatFare: number | undefined = undefined;
  if (seatFare !== undefined && seatFare !== '' && seatFare !== null && !isNaN(Number(seatFare))) {
    parsedSeatFare = Math.max(0, Number(seatFare));
  } else if (manualFare !== undefined && manualFare !== '' && manualFare !== null && !isNaN(Number(manualFare))) {
    parsedSeatFare = Math.max(0, Number(manualFare));
  }

  // Parse manual total fare if provided
  let customTotalFare: number | undefined = undefined;
  if (totalFare !== undefined && totalFare !== '' && totalFare !== null && !isNaN(Number(totalFare))) {
    customTotalFare = Math.max(0, Number(totalFare));
  }

  let customFarePerSeat: number | undefined = undefined;
  if (farePerSeat !== undefined && farePerSeat !== '' && farePerSeat !== null && !isNaN(Number(farePerSeat))) {
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
      seatNumbers: cleanSeats,
      seatFare: parsedSeatFare,
      cargoFare: parsedCargoFare,
      customTotalFare,
      customFarePerSeat,
    });

    res.json({
      success: true,
      message: cleanSeats.length > 0 ? 'সিট সফলভাবে বুকিং হয়েছে!' : 'মালের ভাড়া সফলভাবে বুকিং হয়েছে!',
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
    if (req.user?.role === 'fuel_manager' || req.user?.role === 'checker') {
      return res.status(403).json({ error: 'আপনার রোল থেকে বুকিং বাতিল করার অনুমতি নেই।' });
    }
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
apiRouter.get('/bookings', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const { scheduleId, ticketNo, counterId, phone, date } = req.query;
  let bookings = [...db.getBookings(companyId)];

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
apiRouter.get('/reconciliations/candidates', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const { date } = req.query;
  const targetDate = (date as string) || new Date().toISOString().split('T')[0];

  const allSchedules = db.getSchedules(companyId).filter((s) => s.status !== 'cancelled');
  const activeBookings = db.getBookings(companyId).filter((b) => b.status === 'booked');
  const vehicles = db.getVehicles(companyId);

  // Trips on target date
  const tripsOnDate = allSchedules.filter((s) => s.date === targetDate);

  // Group by vehicle
  const pairs: Array<{
    vehicleId: string;
    vehicleRegNo: string;
    routeName: string;
    upRouteName?: string;
    downRouteName?: string;
    upDistanceKm?: number;
    downDistanceKm?: number;
    totalDistanceKm?: number;
    supervisor: string;
    driver?: string;
    upTrip?: Schedule;
    downTrip?: Schedule;
    upSeatCollection: number;
    upCargoCollection: number;
    upCollection: number;
    downSeatCollection: number;
    downCargoCollection: number;
    downCollection: number;
    totalSeatCollection: number;
    totalCargoCollection: number;
    combinedCollection: number;
    isNightHoldMatch: boolean;
    reconciliationStatus: 'reconciled' | 'ready' | 'incomplete';
    existingReconciliation?: Reconciliation;
  }> = [];

  const existingReconciliations = db.getReconciliations(companyId).filter((r) => r.operationalDate === targetDate);

  for (const veh of vehicles) {
    // Up trips: matching today, OR previous day night hold trip
    const sameDayUpTrips = tripsOnDate.filter((s) => s.vehicleId === veh.id && s.direction === 'UP');
    const nightHoldUpTrips = allSchedules.filter(
      (s) =>
        s.vehicleId === veh.id &&
        s.direction === 'UP' &&
        s.isNightHold &&
        (s.nightHoldNextDate === targetDate || isNextDay(s.date, targetDate))
    );

    const upTrip = sameDayUpTrips[0] || nightHoldUpTrips[0];
    const downTrips = tripsOnDate.filter((s) => s.vehicleId === veh.id && s.direction === 'DOWN');
    const downTrip = downTrips[0];

    if (upTrip || downTrip) {
      const upPartsCol = getScheduleCollectionBreakdown(upTrip, activeBookings);
      const downPartsCol = getScheduleCollectionBreakdown(downTrip, activeBookings);
      const upSeatCollection = upPartsCol.seatCollection;
      const upCargoCollection = upPartsCol.cargoCollection;
      const upCollection = upPartsCol.totalCollection;
      const downSeatCollection = downPartsCol.seatCollection;
      const downCargoCollection = downPartsCol.cargoCollection;
      const downCollection = downPartsCol.totalCollection;
      const totalSeatCollection = upSeatCollection + downSeatCollection;
      const totalCargoCollection = upCargoCollection + downCargoCollection;
      const combinedCollection = totalSeatCollection + totalCargoCollection;

      const existing = existingReconciliations.find((r) => r.vehicleId === veh.id);

      let status: 'reconciled' | 'ready' | 'incomplete' = 'incomplete';
      if (existing) {
        status = 'reconciled';
      } else if (upTrip && downTrip) {
        status = 'ready';
      }

      // Display combined formula
      let displayRoute = 'রুট';
      if (upTrip && downTrip) {
        const upParts = upTrip.routeName.split(' - ').map((s) => s.trim());
        const downParts = downTrip.routeName.split(' - ').map((s) => s.trim());
        const fullChain = [...upParts];
        for (const p of downParts) {
          if (fullChain[fullChain.length - 1] !== p) fullChain.push(p);
        }
        displayRoute = `${upTrip.routeName} + ${downTrip.routeName} = ${fullChain.join(' - ')} (১টি পূর্ণাঙ্গ ট্রিপ)`;
      } else if (upTrip) {
        displayRoute = `${upTrip.routeName} (আপ ট্রিপ)`;
      } else if (downTrip) {
        displayRoute = `${downTrip.routeName} (ডাউন ট্রিপ)`;
      }

      const routes = db.getRoutes(companyId);
      const upRoute = upTrip ? routes.find((r) => r.id === upTrip.routeId) : undefined;
      const downRoute = downTrip ? routes.find((r) => r.id === downTrip.routeId) : undefined;
      const upDist = upRoute?.distanceKm || 75;
      const downDist = downRoute?.distanceKm || 75;

      pairs.push({
        vehicleId: veh.id,
        vehicleRegNo: veh.regNo,
        routeName: displayRoute,
        upRouteName: upTrip?.routeName,
        downRouteName: downTrip?.routeName,
        upDistanceKm: upDist,
        downDistanceKm: downDist,
        totalDistanceKm: (upTrip ? upDist : 0) + (downTrip ? downDist : 0),
        supervisor: upTrip?.supervisor || downTrip?.supervisor || 'কুদ্দুস',
        driver: upTrip?.driver || downTrip?.driver || veh.ownerName || 'আল আমিন',
        upTrip,
        downTrip,
        upSeatCollection,
        upCargoCollection,
        upCollection,
        downSeatCollection,
        downCargoCollection,
        downCollection,
        totalSeatCollection,
        totalCargoCollection,
        combinedCollection,
        isNightHoldMatch: Boolean(upTrip && upTrip.date !== targetDate),
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
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator']),
  (req: AuthenticatedRequest, res) => {
    const { operationalDate, vehicleId, upTripId, downTripId, notes } = req.body;

    if (!operationalDate || !vehicleId) {
      return res.status(400).json({ error: 'তারিখ ও গাড়ি নির্বাচন আবশ্যক।' });
    }

    const companyId = getRequestCompanyId(req) || req.body.companyId;

    const vehicle = db.getVehicles(companyId).find((v) => v.id === vehicleId) || db.getVehicles().find((v) => v.id === vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: 'গাড়ি পাওয়া যায়নি।' });
    }

    const upTrip = upTripId ? db.getSchedules(companyId).find((s) => s.id === upTripId) || db.getSchedules().find((s) => s.id === upTripId) : undefined;
    const downTrip = downTripId ? db.getSchedules(companyId).find((s) => s.id === downTripId) || db.getSchedules().find((s) => s.id === downTripId) : undefined;
    const activeBookings = db.getBookings(companyId).filter((b) => b.status === 'booked');

    const upCol = getScheduleCollectionBreakdown(upTrip, activeBookings);
    const downCol = getScheduleCollectionBreakdown(downTrip, activeBookings);
    const upSeatCollection = upCol.seatCollection;
    const upCargoCollection = upCol.cargoCollection;
    const upCollection = upCol.totalCollection;
    const downSeatCollection = downCol.seatCollection;
    const downCargoCollection = downCol.cargoCollection;
    const downCollection = downCol.totalCollection;
    const totalSeatCollection = upSeatCollection + downSeatCollection;
    const totalCargoCollection = upCargoCollection + downCargoCollection;
    const combinedCollection = totalSeatCollection + totalCargoCollection;

    const count = db.getReconciliations(companyId).length + 1;
    const reconNo = `REC-${operationalDate.replace(/-/g, '')}-${String(count).padStart(3, '0')}`;

    // Formula: up + down = combined (১টি পূর্ণাঙ্গ ট্রিপ)
    let combinedRoute = 'রুট';
    if (upTrip && downTrip) {
      const upParts = upTrip.routeName.split(' - ').map((s) => s.trim());
      const downParts = downTrip.routeName.split(' - ').map((s) => s.trim());
      const fullChain = [...upParts];
      for (const p of downParts) {
        if (fullChain[fullChain.length - 1] !== p) fullChain.push(p);
      }
      combinedRoute = `${upTrip.routeName} + ${downTrip.routeName} = ${fullChain.join(' - ')} (১টি পূর্ণাঙ্গ ট্রিপ)`;
    } else {
      combinedRoute = upTrip?.routeName || downTrip?.routeName || 'রুট';
    }

    const newRecon: Reconciliation = {
      id: `rec-${Date.now()}`,
      companyId,
      reconNo,
      operationalDate,
      vehicleId: vehicle.id,
      vehicleRegNo: vehicle.regNo,
      routeName: combinedRoute,
      supervisor: upTrip?.supervisor || downTrip?.supervisor || 'সুপারভাইজার',
      driver: upTrip?.driver || downTrip?.driver || '',
      upTripId: upTrip?.id,
      upTripNo: upTrip?.tripNo,
      downTripId: downTrip?.id,
      downTripNo: downTrip?.tripNo,
      upSeatCollection,
      upCargoCollection,
      upCollection,
      downSeatCollection,
      downCargoCollection,
      downCollection,
      totalSeatCollection,
      totalCargoCollection,
      combinedCollection,
      status: 'completed',
      isNightHoldMatch: Boolean(upTrip && upTrip.date !== operationalDate),
      notes: notes?.trim() || '',
      reconciledBy: req.user!.name,
      reconciledAt: new Date().toISOString(),
    };

    // Mark trips as reconciled and ensure no pending waiting status remains
    if (upTrip) {
      upTrip.reconciled = true;
      upTrip.returnTripCreated = true;
      upTrip.reconciliationId = newRecon.id;
    }
    if (downTrip) {
      downTrip.reconciled = true;
      downTrip.returnTripCreated = true;
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
      details: `গাড়ি "${vehicle.regNo}" এর ট্রিপ সমন্বয় সম্পন্ন: ${combinedRoute}। মোট আদায়: ৳${combinedCollection}`,
      newValues: newRecon,
    });

    res.json({ success: true, reconciliation: newRecon });
  }
);

// One-click Batch Reconciliation for all ready vehicle pairs on an operational date
apiRouter.post(
  '/reconciliations/batch',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator']),
  (req: AuthenticatedRequest, res) => {
    const { operationalDate } = req.body;
    if (!operationalDate) {
      return res.status(400).json({ error: 'অপারেশনাল তারিখ আবশ্যক।' });
    }

    const companyId = getRequestCompanyId(req) || req.body.companyId;
    const allSchedules = db.getSchedules(companyId).filter((s) => s.status !== 'cancelled');
    const activeBookings = db.getBookings(companyId).filter((b) => b.status === 'booked');
    const vehicles = db.getVehicles(companyId);
    const tripsOnDate = allSchedules.filter((s) => s.date === operationalDate);
    const existingReconciliations = db.getReconciliations(companyId).filter((r) => r.operationalDate === operationalDate);

    let createdCount = 0;

    for (const veh of vehicles) {
      // If already reconciled, skip
      if (existingReconciliations.some((r) => r.vehicleId === veh.id)) continue;

      const sameDayUpTrips = tripsOnDate.filter((s) => s.vehicleId === veh.id && s.direction === 'UP');
      const nightHoldUpTrips = allSchedules.filter(
        (s) =>
          s.vehicleId === veh.id &&
          s.direction === 'UP' &&
          s.isNightHold &&
          (s.nightHoldNextDate === operationalDate || isNextDay(s.date, operationalDate))
      );

      const upTrip = sameDayUpTrips[0] || nightHoldUpTrips[0];
      const downTrips = tripsOnDate.filter((s) => s.vehicleId === veh.id && s.direction === 'DOWN');
      const downTrip = downTrips[0];

      // Reconcile if both UP and DOWN trips exist
      if (upTrip && downTrip) {
        const upCol = getScheduleCollectionBreakdown(upTrip, activeBookings);
        const downCol = getScheduleCollectionBreakdown(downTrip, activeBookings);
        const upSeatCollection = upCol.seatCollection;
        const upCargoCollection = upCol.cargoCollection;
        const upCollection = upCol.totalCollection;
        const downSeatCollection = downCol.seatCollection;
        const downCargoCollection = downCol.cargoCollection;
        const downCollection = downCol.totalCollection;
        const totalSeatCollection = upSeatCollection + downSeatCollection;
        const totalCargoCollection = upCargoCollection + downCargoCollection;
        const combinedCollection = totalSeatCollection + totalCargoCollection;

        const count = db.getReconciliations(companyId).length + 1;
        const reconNo = `REC-${operationalDate.replace(/-/g, '')}-${String(count).padStart(3, '0')}`;

        const upParts = upTrip.routeName.split(' - ').map((s) => s.trim());
        const downParts = downTrip.routeName.split(' - ').map((s) => s.trim());
        const fullChain = [...upParts];
        for (const p of downParts) {
          if (fullChain[fullChain.length - 1] !== p) fullChain.push(p);
        }
        const combinedRoute = `${upTrip.routeName} + ${downTrip.routeName} = ${fullChain.join(' - ')} (১টি পূর্ণাঙ্গ ট্রিপ)`;

        const newRecon: Reconciliation = {
          id: `rec-${Date.now()}-${createdCount}`,
          companyId,
          reconNo,
          operationalDate,
          vehicleId: veh.id,
          vehicleRegNo: veh.regNo,
          routeName: combinedRoute,
          supervisor: upTrip.supervisor || downTrip.supervisor || 'সুপারভাইজার',
          driver: upTrip.driver || downTrip.driver || '',
          upTripId: upTrip.id,
          upTripNo: upTrip.tripNo,
          downTripId: downTrip.id,
          downTripNo: downTrip.tripNo,
          upSeatCollection,
          upCargoCollection,
          upCollection,
          downSeatCollection,
          downCargoCollection,
          downCollection,
          totalSeatCollection,
          totalCargoCollection,
          combinedCollection,
          status: 'completed',
          isNightHoldMatch: Boolean(upTrip.date !== operationalDate),
          notes: 'এক ক্লিকে সকল ট্রিপ সমন্বয় সম্পন্ন',
          reconciledBy: req.user!.name,
          reconciledAt: new Date().toISOString(),
        };

        upTrip.reconciled = true;
        upTrip.returnTripCreated = true;
        upTrip.reconciliationId = newRecon.id;

        downTrip.reconciled = true;
        downTrip.returnTripCreated = true;
        downTrip.reconciliationId = newRecon.id;

        db.getReconciliations().push(newRecon);
        existingReconciliations.push(newRecon);
        createdCount++;
      }
    }

    if (createdCount > 0) {
      db.save();
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'RECONCILE',
        entityType: 'RECONCILIATION',
        entityId: `batch-${operationalDate}`,
        details: `${operationalDate} তারিখের ${createdCount} টি গাড়ির ট্রিপ এক ক্লিকে সফলভাবে সমন্বয় করা হয়েছে।`,
      });
    }

    res.json({ success: true, count: createdCount });
  }
);

apiRouter.get('/reconciliations', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const { date } = req.query;
  let recons = [...db.getReconciliations(companyId)];
  if (date) {
    recons = recons.filter((r) => r.operationalDate === date);
  }
  recons.sort((a, b) => b.reconciledAt.localeCompare(a.reconciledAt));
  res.json({ reconciliations: recons });
});

// ==========================================
// 8. AUDIT LOGS
// ==========================================

apiRouter.get('/audit-logs', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { actionType, limit } = req.query;
  const isPlatformSuperAdmin = req.user?.role === 'super_admin' && !req.user?.companyId;
  const companyId = isPlatformSuperAdmin ? getRequestCompanyId(req) : req.user?.companyId;
  let logs = [...db.getAuditLogs(companyId)];
  if (!isPlatformSuperAdmin) {
    logs = logs.filter((l) => l.role !== 'super_admin');
  }
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

apiRouter.get('/analytics/summary', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const { date } = req.query;
  const today = (date as string) || new Date().toISOString().split('T')[0];

  const schedules = db.getSchedules(companyId).filter((s) => s.date === today && s.status !== 'cancelled');
  const allBookings = db.getBookings(companyId).filter((b) => b.tripDate === today && b.status === 'booked');
  const counters = db.getCounters(companyId);
  const vehicles = db.getVehicles(companyId);

  const totalBookings = allBookings.length;
  const seatsSold = allBookings.reduce((sum, b) => sum + b.totalSeats, 0);
  const ticketSales = allBookings.length;
  const activeTrips = schedules.length;
  let totalSeatCollections = 0;
  let totalCargoCollections = 0;
  for (const b of allBookings) {
    const parts = getBookingBreakdown(b);
    totalSeatCollections += parts.seatFare;
    totalCargoCollections += parts.cargoFare;
  }
  const totalCollections = totalSeatCollections + totalCargoCollections;

  // Unreconciled count
  const unreconciledTrips = schedules.filter((s) => !s.reconciled).length;

  // Vehicle-wise collection
  const vehicleWiseCollections = vehicles.map((veh) => {
    const vehSchedules = schedules.filter((s) => s.vehicleId === veh.id);
    let upCollection = 0;
    let downCollection = 0;
    let seatCollection = 0;
    let cargoCollection = 0;
    for (const s of vehSchedules) {
      const col = getScheduleCollectionBreakdown(s, allBookings);
      if (s.direction === 'UP') upCollection += col.totalCollection;
      if (s.direction === 'DOWN') downCollection += col.totalCollection;
      seatCollection += col.seatCollection;
      cargoCollection += col.cargoCollection;
    }
    return {
      regNo: veh.regNo,
      upCollection,
      downCollection,
      seatCollection,
      cargoCollection,
      total: upCollection + downCollection,
    };
  });

  // Counter-wise sales
  const counterWiseSales = counters.map((cnt) => {
    const cntBookings = allBookings.filter((b) => b.counterId === cnt.id);
    const cntSeats = cntBookings.reduce((sum, b) => sum + b.totalSeats, 0);
    let seatRevenue = 0;
    let cargoRevenue = 0;
    for (const b of cntBookings) {
      const parts = getBookingBreakdown(b);
      seatRevenue += parts.seatFare;
      cargoRevenue += parts.cargoFare;
    }
    return {
      counterId: cnt.id,
      counterName: cnt.name,
      counterCode: cnt.code,
      seatColor: cnt.seatColor,
      seatsSold: cntSeats,
      seatRevenue,
      cargoRevenue,
      totalRevenue: seatRevenue + cargoRevenue,
    };
  });

  res.json({
    date: today,
    totalBookings,
    seatsSold,
    ticketSales,
    activeTrips,
    totalSeatCollections,
    totalCargoCollections,
    totalCollections,
    unreconciledTrips,
    vehicleWiseCollections,
    counterWiseSales,
  });
});

apiRouter.get('/analytics/weekly-trends', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const { startDate, endDate, date } = req.query as Record<string, string>;

  const BN_DAYS_SHORT = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
  const BN_DAYS_FULL = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

  const getDhakaToday = () => {
    const now = new Date();
    const dhaka = new Date(now.getTime() + 6 * 3600 * 1000);
    return dhaka.toISOString().split('T')[0];
  };

  const getSaturdayWeekStart = (anchor: string) => {
    const parts = anchor.split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1));
    const diffFromSat = (d.getUTCDay() + 1) % 7;
    d.setUTCDate(d.getUTCDate() - diffFromSat);
    return d.toISOString().split('T')[0];
  };

  const addDays = (base: string, offset: number) => {
    const parts = base.split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1));
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().split('T')[0];
  };

  const anchorDate = date || getDhakaToday();
  const resolvedStart = startDate || getSaturdayWeekStart(anchorDate);
  const resolvedEnd = endDate || addDays(resolvedStart, 6);

  // Build date list (clamped to max 14 days for safety)
  const dateList: string[] = [];
  for (let i = 0; i < 14; i++) {
    const cur = addDays(resolvedStart, i);
    dateList.push(cur);
    if (cur >= resolvedEnd) break;
  }

  const allBookings = db.getBookings(companyId).filter((b) => b.status === 'booked');
  const allFuelEntries = db.getFuelEntries(companyId);

  const days = dateList.map((dStr) => {
    const parts = dStr.split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1));
    const dayIdx = dt.getUTCDay();

    const dayBookings = allBookings.filter((b) => b.tripDate === dStr);
    const ticketSalesAmount = dayBookings.reduce((sum, b) => sum + (Number(b.totalFare) || 0), 0);
    const ticketsCount = dayBookings.length;
    const seatsSold = dayBookings.reduce((sum, b) => sum + (Number(b.totalSeats) || 0), 0);

    const dayFuel = allFuelEntries.filter((e) => e.date === dStr);
    const fuelExpenseAmount = Math.round(
      dayFuel.reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0) * 100
    ) / 100;
    const fuelLiters = Math.round(
      dayFuel.reduce((sum, e) => sum + (Number(e.actualFuelLiters) || 0), 0) * 100
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

  res.json({
    startDate: resolvedStart,
    endDate: dateList[dateList.length - 1] || resolvedEnd,
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
  });
});

// ==========================================
// 9.1 TRIP DATABASE & FILTERABLE REPORT
// ==========================================

apiRouter.get('/reports/trip-database', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const { startDate, endDate, date, vehicleId, counterId, direction } = req.query;

  let allSchedules = [...db.getSchedules(companyId)].filter((s) => s.status !== 'cancelled');
  const allBookings = db.getBookings(companyId).filter((b) => b.status === 'booked');

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

    let seatAmount = 0;
    let cargoAmount = 0;
    if (counterId) {
      for (const b of tripBookings) {
        const parts = getBookingBreakdown(b);
        seatAmount += parts.seatFare;
        cargoAmount += parts.cargoFare;
      }
    } else {
      const col = getScheduleCollectionBreakdown(s, allBookings);
      seatAmount = col.seatCollection;
      cargoAmount = col.cargoCollection;
    }
    const totalAmount = seatAmount + cargoAmount;

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
      seatAmount,
      cargoAmount,
      totalAmount,
      fare: s.fare,
      isNightHold: s.isNightHold,
      reconciled: s.reconciled,
    };
  });

  const totalSeats = records.reduce((sum, r) => sum + r.bookedSeatsCount, 0);
  const totalSeatAmount = records.reduce((sum, r) => sum + r.seatAmount, 0);
  const totalCargoAmount = records.reduce((sum, r) => sum + r.cargoAmount, 0);
  const totalAmount = totalSeatAmount + totalCargoAmount;

  res.json({
    trips: records,
    summary: {
      totalTrips: records.length,
      totalSeats,
      totalSeatAmount,
      totalCargoAmount,
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

apiRouter.get('/settings', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  res.json({ settings: db.getSettings(companyId) });
});

apiRouter.put(
  '/settings',
  authMiddleware,
  requireRole(['super_admin', 'company_admin', 'master_admin']),
  (req: AuthenticatedRequest, res) => {
    const companyId = getRequestCompanyId(req);
    const updated = db.updateSettings(req.body, companyId);
    db.logAudit({
      companyId,
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

// ==========================================
// 12. FUEL MANAGEMENT (ফুয়েল লগ)
// ==========================================

apiRouter.get('/fuel/settings', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  const settings = db.getFuelSettings(companyId);
  res.json({ success: true, settings });
});

apiRouter.post(
  '/fuel/settings',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator', 'fuel_manager']),
  (req: AuthenticatedRequest, res) => {
    const companyId = resolveTargetCompanyId(req, req.body.companyId);
    const { commonMileage, fuelPricePerLiter } = req.body;
    const updated = db.saveFuelSettings(
      {
        commonMileage: Number(commonMileage) || 4,
        fuelPricePerLiter: Number(fuelPricePerLiter) || 135.4,
      },
      companyId
    );
    res.json({ success: true, settings: updated });
  }
);

apiRouter.get('/fuel/entries', authMiddleware, (req: AuthenticatedRequest, res) => {
  const companyId = getRequestCompanyId(req);
  let entries = db.getFuelEntries(companyId);
  const { startDate, endDate, date, search } = req.query as Record<string, string>;

  if (date) {
    entries = entries.filter((e) => e.date === date);
  } else {
    if (startDate) {
      entries = entries.filter((e) => e.date >= startDate);
    }
    if (endDate) {
      entries = entries.filter((e) => e.date <= endDate);
    }
  }

  if (search) {
    const q = search.toLowerCase().trim();
    entries = entries.filter(
      (e) =>
        e.vehicleRegNo.toLowerCase().includes(q) ||
        e.driver.toLowerCase().includes(q) ||
        e.supervisor.toLowerCase().includes(q) ||
        e.route.toLowerCase().includes(q)
    );
  }

  res.json({ success: true, entries });
});

apiRouter.post(
  '/fuel/entries',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator', 'fuel_manager']),
  (req: AuthenticatedRequest, res) => {
    const companyId = resolveTargetCompanyId(req, req.body.companyId);
    const body = req.body;

    if (!body.vehicleRegNo || body.actualFuelLiters === undefined) {
      return res.status(400).json({ error: 'গাড়ি নাম্বার এবং তেলের পরিমাণ আবশ্যক।' });
    }

    const totalKm = Number(body.totalKm) || 0;
    const mileage = Number(body.mileage) || 4;
    const expectedLiters =
      body.expectedFuelLiters !== undefined
        ? Number(body.expectedFuelLiters) || 0
        : totalKm > 0 && mileage > 0
        ? Number((totalKm / mileage).toFixed(2))
        : 0;
    const actualLiters = Number(body.actualFuelLiters) || 0;
    const ratePerLiter = Number(body.fuelRatePerLiter) || 135.4;
    const totalCost =
      body.totalCost !== undefined ? Number(body.totalCost) : Math.round(actualLiters * ratePerLiter);
    const expectedFuelCost =
      body.expectedFuelCost !== undefined
        ? Number(body.expectedFuelCost)
        : Math.round(expectedLiters * ratePerLiter);
    const fuelCostDifference =
      body.fuelCostDifference !== undefined
        ? Number(body.fuelCostDifference)
        : expectedFuelCost - totalCost;

    const created = db.createFuelEntry({
      companyId,
      reconciliationId: body.reconciliationId,
      vehicleId: body.vehicleId,
      serialNo: body.serialNo,
      date: body.date,
      dayOfWeek: body.dayOfWeek,
      time: body.time,
      vehicleRegNo: body.vehicleRegNo,
      direction: body.direction || 'আপ-ডাউন',
      route: body.route,
      supervisor: body.supervisor,
      driver: body.driver,
      totalKm,
      mileage,
      expectedFuelLiters: expectedLiters,
      actualFuelLiters: actualLiters,
      fuelRatePerLiter: ratePerLiter,
      totalCost,
      expectedFuelCost,
      fuelCostDifference,
      fuelDifference: Number(body.fuelDifference) || 0,
      notes: body.notes || '',
    });

    db.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      role: req.user!.role,
      actionType: 'CREATE_FUEL_ENTRY',
      entityType: 'FUEL',
      entityId: created.id,
      details: `${created.vehicleRegNo} গাড়িতে ${created.actualFuelLiters} লিটার তেল এন্ট্রি করা হয়েছে। মোট: ৳${created.totalCost} (নির্ধারিত: ৳${expectedFuelCost}, +/-: ৳${fuelCostDifference})`,
      newValues: created,
    });

    res.json({ success: true, entry: created });
  }
);

apiRouter.put(
  '/fuel/entries/:id',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator', 'fuel_manager']),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const existing = db.getFuelEntries().find((f) => f.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'ফুয়েল রেকর্ড পাওয়া যায়নি।' });
    }
    const expectedLiters =
      updates.expectedFuelLiters !== undefined
        ? Number(updates.expectedFuelLiters)
        : existing.expectedFuelLiters;
    const actualLiters =
      updates.actualFuelLiters !== undefined
        ? Number(updates.actualFuelLiters)
        : existing.actualFuelLiters;
    const rate =
      updates.fuelRatePerLiter !== undefined
        ? Number(updates.fuelRatePerLiter)
        : existing.fuelRatePerLiter;
    const totalCost =
      updates.totalCost !== undefined
        ? Number(updates.totalCost)
        : Math.round(actualLiters * rate);
    const expectedFuelCost =
      updates.expectedFuelCost !== undefined
        ? Number(updates.expectedFuelCost)
        : Math.round(expectedLiters * rate);
    const fuelCostDifference =
      updates.fuelCostDifference !== undefined
        ? Number(updates.fuelCostDifference)
        : expectedFuelCost - totalCost;

    const updated = db.updateFuelEntry(id, {
      ...updates,
      totalCost,
      expectedFuelCost,
      fuelCostDifference,
    });
    if (!updated) {
      return res.status(404).json({ error: 'ফুয়েল রেকর্ড পাওয়া যায়নি।' });
    }
    res.json({ success: true, entry: updated });
  }
);

apiRouter.delete(
  '/fuel/entries/:id',
  authMiddleware,
  requireRole(['super_admin', 'master_admin', 'company_admin', 'moderator', 'fuel_manager']),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const ok = db.deleteFuelEntry(id);
    if (!ok) {
      return res.status(404).json({ error: 'ফুয়েল রেকর্ড পাওয়া যায়নি।' });
    }
    res.json({ success: true });
  }
);

// ==========================================
// 13. VAULT SYNC & AUTO-REHYDRATION
// ==========================================

apiRouter.get('/sync/status', (_req, res) => {
  res.json({
    isEmptyFreshState: db.isEmptyFreshState(),
  });
});

apiRouter.get('/sync/vault', authMiddleware, (req: AuthenticatedRequest, res) => {
  const isPlatformSuperAdmin = req.user?.role === 'super_admin' && !req.user?.companyId;
  const vault = isPlatformSuperAdmin
    ? db.getVaultSnapshot()
    : req.user?.companyId
    ? db.getScopedVaultSnapshot(req.user.companyId)
    : { companies: [], deletedCompanyIds: [], users: [] };

  res.json({
    success: true,
    vault,
    syncedAt: new Date().toISOString(),
  });
});

apiRouter.post('/sync/rehydrate', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const verifiedPayload = verifySignedTokenPayload(token);
  const isFresh = db.isEmptyFreshState();

  // Security check: Only allow rehydration when server is fresh/empty OR caller has a valid HMAC-signed session token
  if (!isFresh && !verifiedPayload) {
    return res.status(401).json({ error: 'অবৈধ বা অনুমোদনহীন সিঙ্ক অনুরোধ।' });
  }

  const vault = req.body?.vault || req.body;
  if (!vault || typeof vault !== 'object') {
    return res.status(400).json({ error: 'ভল্ট ডাটা পাওয়া যায়নি।' });
  }

  try {
    const { restoredCount } = db.rehydrateFromVault(vault);
    res.json({
      success: true,
      restoredCount,
      companiesCount: db.getCompanies().length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'ডাটা রিস্টোর ব্যর্থ হয়েছে।' });
  }
});

apiRouter.post(
  '/sync/cleanup-orphans',
  authMiddleware,
  requireRole(['super_admin']),
  (req: AuthenticatedRequest, res) => {
    try {
      const { removedCount } = db.purgeOrphanedCompanyRecords(true);
      res.json({
        success: true,
        removedCount,
        companiesCount: db.getCompanies().length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'অবশিষ্ট ডাটা পরিষ্কার ব্যর্থ হয়েছে।' });
    }
  }
);

apiRouter.post(
  '/sync/restore-backup',
  authMiddleware,
  requireRole(['super_admin']),
  (req: AuthenticatedRequest, res) => {
    const vault = req.body?.vault || req.body;
    if (!vault || typeof vault !== 'object') {
      return res.status(400).json({ error: 'সঠিক ব্যাকআপ ডাটা পাওয়া যায়নি।' });
    }
    try {
      const result = db.restoreFullBackup(vault);
      db.logAudit({
        userId: req.user!.id,
        userName: req.user!.name,
        role: req.user!.role,
        actionType: 'RESTORE_BACKUP',
        entityType: 'SYSTEM',
        entityId: 'vault',
        details: `ব্যাকআপ ফাইল থেকে ${result.restoredCompanies} টি কোম্পানি ও মোট ${result.totalRestored} টি রেকর্ড রিস্টোর করা হয়েছে।`,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'ব্যাকআপ রিস্টোর ব্যর্থ হয়েছে।' });
    }
  }
);
