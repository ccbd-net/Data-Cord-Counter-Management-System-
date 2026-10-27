import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db, verifyPin } from './db.ts';
import type { User } from '../src/types/index.ts';

// In-memory active session tokens mapped to user info
interface SessionInfo {
  token: string;
  user: User;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, SessionInfo>();

// 24 hour session duration
const SESSION_DURATION = 24 * 60 * 60 * 1000;

export function createSession(user: User): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    token,
    user,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
  });
  return token;
}

export function getSessionUser(token?: string): User | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.user;
}

export function destroySession(token?: string) {
  if (token) {
    sessions.delete(token);
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
