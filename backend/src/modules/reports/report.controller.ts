import { Router, type Request, type Response, type NextFunction } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as reportService from './report.service';

const router = Router();
router.use(authenticate);

function parseDateParam(value: unknown) {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return { s, d };
}

router.get('/daily', authorize(Role.STORE_MANAGER, Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = parseDateParam(req.query.date);
    if (!parsed) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz date parametresi.' });
    }
    const report = await reportService.getDailyReport(req.user!.branchId, parsed.d);
    return res.status(200).json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/daily/excel', authorize(Role.STORE_MANAGER, Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = parseDateParam(req.query.date);
    if (!parsed) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz date parametresi.' });
    }
    const buffer = await reportService.generateDailyExcel(req.user!.branchId, parsed.d);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=\"gunluk-kasa-${parsed.s}.xlsx\"`,
    );
    return res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;

