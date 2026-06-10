import { Router, type Request, type Response, type NextFunction } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { CreateCashMovementInput } from './cashMovement.types';
import * as cashMovementService from './cashMovement.service';

const router = Router();
router.use(authenticate);

function handleCashError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;
  if (code === 'SHIFT_NOT_OPEN') {
    res.status(400).json({ error: 'SHIFT_NOT_OPEN', message: 'Vardiya açık olmalı.' });
    return true;
  }
  return false;
}

router.post(
  '/',
  authorize(Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateCashMovementInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    if (!req.user?.shiftId) {
      return res.status(400).json({ error: 'SHIFT_NOT_OPEN', message: 'Vardiya açık olmalı.' });
    }
    const result = await cashMovementService.createCashMovement(
      req.user.userId,
      req.user.branchId,
      req.user.shiftId,
      parsed.data,
    );
    return res.status(200).json(result);
  } catch (err) {
    if (handleCashError(err, res)) return;
    next(err);
  }
  },
);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shiftId = String(req.query.shiftId || '');
    if (!shiftId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz sorgu parametreleri.' });
    }
    const result = await cashMovementService.getCashMovements(shiftId);
    return res.status(200).json(result);
  } catch (err) {
    if (handleCashError(err, res)) return;
    next(err);
  }
});

export default router;

