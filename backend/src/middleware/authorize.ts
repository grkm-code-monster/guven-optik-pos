import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import type { EkYetkiKey } from '../modules/admin/ek-yetki';
import { userHasAnyEkYetki } from '../modules/admin/ek-yetki';

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

/**
 * Rol listesinde değilse, ekYetkiler içinde ilgili anahtarlardan biri varsa geçirir.
 * yetkiler boşsa yalnızca rol kontrolü yapılır (authorize ile aynı).
 */
export function authorizeOrYetki(yetkiler: EkYetkiKey[], ...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Kimlik doğrulama gerekli.',
      });
      return;
    }
    if (roles.includes(req.user.role)) {
      next();
      return;
    }
    if (yetkiler.length > 0 && userHasAnyEkYetki(req.user, yetkiler)) {
      next();
      return;
    }
    res.status(403).json({
      error: 'INSUFFICIENT_PERMISSION',
      message: 'Bu işlem için yetkiniz yok.',
    });
  };
}
