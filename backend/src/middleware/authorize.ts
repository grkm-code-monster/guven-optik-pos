import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Kimlik doğrulama gerekli.',
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'INSUFFICIENT_PERMISSION',
        message: 'Bu işlem için yetkiniz yok.',
      });
      return;
    }
    next();
  };
}
