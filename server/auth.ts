import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from './db.ts';
import type { User } from '../src/types/index.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SECRET_KEY = process.env.SESSION_SECRET || 'zb-bus-counter-secure-key-2026-data-and-code';

// 30 days session duration so logins never randomly expire
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

interface SessionInfo {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

function loadSessionsFromFile(): Map<string, SessionInfo> {
  const map = new Map<string, SessionInfo>();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.token && item.expiresAt > Date.now()) {
            map.set(item.token, item);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error reading sessions.json:', err);
  }
  return map;
}

const memorySessions: Map<string, SessionInfo> = loadSessionsFromFile();

function persistSessionsToFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const arr = Array.from(memorySessions.values()).filter((s) => s.expiresAt > Date.now());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving sessions.json:', err);
  }
}

export function createSession(user: User): string {
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION;

  // 1. Generate Stateless HMAC Token that survives any server restart
  const payload = {
    uid: user.id,
    lid: user.loginId,
    role: user.role,
    cid: user.companyId || null,
    iat: now,
    exp: expiresAt,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payloadB64).digest('base64url');
  const token = `${payloadB64}.${signature}`;

  // 2. Also register in persisted sessions map for instant revocation / listing
  memorySessions.set(token, {
    token,
    userId: user.id,
    createdAt: now,
    expiresAt,
  });
  persistSessionsToFile();

  return token;
}

export function verifySignedTokenPayload(token?: string): { uid: string; lid?: string; role?: string; cid?: string | null } | null {
  if (!token || !token.includes('.')) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(payloadB64).digest('base64url');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload && payload.uid && payload.exp > Date.now()) {
      return payload;
    }
  } catch {
    // invalid token format
  }
  return null;
}

export function getSessionUser(token?: string): User | null {
  if (!token) return null;

  let targetUserId: string | null = null;

  // A. Check signed stateless HMAC token
  const payload = verifySignedTokenPayload(token);
  if (payload) {
    targetUserId = payload.uid;
  }

  // B. Fallback to persisted session map (for legacy tokens)
  if (!targetUserId) {
    const session = memorySessions.get(token);
    if (session && session.expiresAt > Date.now()) {
      targetUserId = session.userId;
    }
  }

  if (!targetUserId) return null;

  // Retrieve fresh user object from DB
  const rawUser = db.getUsers().find((u) => u.id === targetUserId && u.status === 'active');
  if (!rawUser) return null;

  const counter = rawUser.counterId ? db.getCounters().find((c) => c.id === rawUser.counterId) : undefined;
  const assignedCompanyId = rawUser.companyId || counter?.companyId;
  const company = assignedCompanyId ? db.getCompanies().find((c) => c.id === assignedCompanyId) : undefined;

  const user: User = {
    id: rawUser.id,
    loginId: rawUser.loginId,
    name: rawUser.name,
    role: rawUser.role,
    companyId: assignedCompanyId,
    company: company
      ? {
          id: company.id,
          name: company.name,
          logoUrl: company.logoUrl,
          subscriptionExpiry: company.subscriptionExpiry,
          status: company.status,
        }
      : undefined,
    counterId: rawUser.counterId,
    counterName: counter?.name || rawUser.counterName,
    counterCode: counter?.code || rawUser.counterCode,
    counterColor: counter?.seatColor || rawUser.counterColor,
    counterType: counter?.counterType || rawUser.counterType || (rawUser.counterId === 'cnt-01' ? 'master_booking' : 'road_booking'),
    phone: rawUser.phone,
    status: rawUser.status,
    createdAt: rawUser.createdAt,
  };

  return user;
}

export function destroySession(token?: string) {
  if (token) {
    memorySessions.delete(token);
    persistSessionsToFile();
  }
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'অনুগ্রহ করে সিস্টেমে লগইন করুন!' });
  }

  const token = authHeader.split(' ')[1];
  const user = getSessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'লগইন সেশনের মেয়াদ শেষ হয়েছে। আবার লগইন করুন।' });
  }

  req.user = user;
  next();
}

export function requireRole(allowedRoles: Array<User['role']>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'অননুমোদিত এক্সেস!' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'আপনার এই অপশন ব্যবহারের অনুমতি নেই!',
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }
    next();
  };
}
