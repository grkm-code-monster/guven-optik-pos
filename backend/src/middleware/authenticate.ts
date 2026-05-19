import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { JwtPayload } from '../modules/auth/auth.types';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token gerekli.',
    });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({
      error: 'SERVER_CONFIG',
      message: 'Sunucu yapılandırması eksik.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Geçersiz veya süresi dolmuş token.',
    });
  }
}
