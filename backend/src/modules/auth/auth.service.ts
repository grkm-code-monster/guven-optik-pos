import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role, ShiftStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { hasTodayAttendance } from '../pdks/pdks.service';
import { ensureOpenShift } from '../shifts/shift.service';
import type { JwtPayload } from './auth.types';

export type PdksAttendanceStatus = 'found' | 'missing' | 'skipped';

const LOCK_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

type LockEntry = { lockedUntil: number };

const loginLockByUsername = new Map<string, LockEntry | { attempts: number }>();

function isLocked(usernameKey: string): boolean {
  const entry = loginLockByUsername.get(usernameKey);
  if (!entry) return false;
  if ('lockedUntil' in entry) {
    if (Date.now() < entry.lockedUntil) return true;
    loginLockByUsername.delete(usernameKey);
    return false;
  }
  return false;
}

function recordFailedAttempt(usernameKey: string): void {
  const entry = loginLockByUsername.get(usernameKey);
  let attempts = 0;
  if (entry && 'attempts' in entry) {
    attempts = entry.attempts;
  }
  attempts += 1;
  if (attempts >= MAX_ATTEMPTS) {
    loginLockByUsername.set(usernameKey, { lockedUntil: Date.now() + LOCK_MS });
    return;
  }
  loginLockByUsername.set(usernameKey, { attempts });
}

function clearLoginAttempts(usernameKey: string): void {
  loginLockByUsername.delete(usernameKey);
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' });
}

export async function login(username: string, pin: string) {
  const usernameKey = username.trim().toLowerCase();

  if (isLocked(usernameKey)) {
    const err = new Error('ACCOUNT_LOCKED') as Error & { code: string };
    err.code = 'ACCOUNT_LOCKED';
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { username: usernameKey },
    include: {
      branch: true,
      personel: { select: { pdksId: true } },
      personelByUser: { select: { pdksId: true } },
    },
  });

  if (!user) {
    recordFailedAttempt(usernameKey);
    const err = new Error('INVALID_CREDENTIALS') as Error & { code: string };
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('USER_INACTIVE') as Error & { code: string };
    err.code = 'USER_INACTIVE';
    throw err;
  }

  const pinOk = await bcrypt.compare(pin, user.pin);
  if (!pinOk) {
    recordFailedAttempt(usernameKey);
    const err = new Error('INVALID_CREDENTIALS') as Error & { code: string };
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  clearLoginAttempts(usernameKey);

  let openShift = await prisma.shift.findFirst({
    where: {
      branchId: user.branchId,
      status: ShiftStatus.OPEN,
    },
    orderBy: { openedAt: 'desc' },
  });

  const pdksEmployeeId = user.personel?.pdksId ?? user.personelByUser?.pdksId ?? null;
  let pdksAttendance: PdksAttendanceStatus = 'skipped';

  if (pdksEmployeeId) {
    const attendance = await hasTodayAttendance(pdksEmployeeId, user.branch.pdksPlaceId);
    if (attendance === true) {
      pdksAttendance = 'found';
      if (!openShift) {
        openShift = await ensureOpenShift(user.id, user.branchId);
      }
    } else if (attendance === false) {
      pdksAttendance = 'missing';
    }
  }

  const payload: JwtPayload = {
    userId: user.id,
    role: user.role,
    branchId: user.branchId,
    shiftId: openShift?.id ?? null,
  };

  const token = signToken(payload);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
    },
    shiftId: payload.shiftId,
    pdksAttendance,
  };
}

export async function continueWithoutPdks(userId: string, branchId: string) {
  const shift = await ensureOpenShift(userId, branchId);
  return { shiftId: shift.id };
}

export async function verifyManagerPin(pin: string, branchId: string) {
  const managers = await prisma.user.findMany({
    where: {
      branchId,
      isActive: true,
      role: { in: [Role.STORE_MANAGER, Role.ADMIN] },
    },
  });

  for (const u of managers) {
    const ok = await bcrypt.compare(pin, u.pin);
    if (ok) {
      return { valid: true as const, userId: u.id };
    }
  }

  const err = new Error('MANAGER_PIN_INVALID') as Error & { code: string };
  err.code = 'MANAGER_PIN_INVALID';
  throw err;
}
