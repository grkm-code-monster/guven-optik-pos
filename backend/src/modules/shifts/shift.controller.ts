import { Router, type Request, type Response, type NextFunction } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { CloseShiftInput, OpenShiftInput } from './shift.types';
import * as shiftService from './shift.service';

const router = Router();

router.use(authenticate);

function handleShiftError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;

  if (code === 'SHIFT_ALREADY_OPEN') {
    res.status(409).json({ error: 'SHIFT_ALREADY_OPEN', message: 'Açık vardiya mevcut, önce kapatın.' });
    return true;
  }
  if (code === 'SHIFT_NOT_FOUND') {
    res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: 'Vardiya bulunamadı.' });
    return true;
  }
  if (code === 'SHIFT_ALREADY_CLOSED') {
    res.status(409).json({ error: 'SHIFT_ALREADY_CLOSED', message: 'Vardiya zaten kapalı.' });
    return true;
  }
  if (code === 'SHIFT_NOT_OPEN') {
    res.status(400).json({ error: 'SHIFT_NOT_OPEN', message: 'Açık vardiya yok.' });
    return true;
  }
  if (code === 'INSUFFICIENT_PERMISSION') {
    res.status(403).json({ error: 'INSUFFICIENT_PERMISSION', message: 'Bu işlem için yetkiniz yok.' });
    return true;
  }

  return false;
}

router.post(
  '/open',
  authorize(Role.STORE_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = OpenShiftInput.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
      }
      const userId = req.user!.userId;
      const branchId = req.user!.branchId;
      const shift = await shiftService.openShift(userId, branchId, parsed.data);
      return res.status(200).json(shift);
    } catch (err) {
      if (handleShiftError(err, res)) return;
      next(err);
    }
  },
);

router.post(
  '/close',
  authorize(Role.STORE_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CloseShiftInput.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
      }

      const branchId = req.user!.branchId;
      const current = await shiftService.getCurrentShift(branchId);
      if (!current) {
        const e = new Error('SHIFT_NOT_OPEN') as Error & { code: string };
        e.code = 'SHIFT_NOT_OPEN';
        throw e;
      }

      const updated = await shiftService.closeShift(current.id, req.user!.userId, req.user!.role, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      if (handleShiftError(err, res)) return;
      next(err);
    }
  },
);

router.get(
  '/current',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branchId = req.user!.branchId;
      const shift = await shiftService.getCurrentShift(branchId);
      return res.status(200).json(shift);
    } catch (err) {
      if (handleShiftError(err, res)) return;
      next(err);
    }
  },
);

export default router;

