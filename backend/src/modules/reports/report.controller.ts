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

router.get(
  '/personal',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dateParam = req.query.date ? String(req.query.date) : null;
      const parsed = dateParam ? parseDateParam(dateParam) : null;
      const date = parsed ? parsed.d : new Date();
      const result = await reportService.getPersonalDailyReport(
        req.user!.userId,
        req.user!.branchId,
        date,
      );
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

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

router.get('/patron/ozet', authorize(Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getPatronOzet({
      baslangic: baslangic ? new Date(String(baslangic)) : new Date(new Date().setDate(1)),
      bitis: bitis ? new Date(String(bitis)) : new Date(),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/personel', authorize(Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis } = req.query;
    const result = await reportService.getPersonelPerformans({
      baslangic: baslangic ? new Date(String(baslangic)) : new Date(new Date().setDate(1)),
      bitis: bitis ? new Date(String(bitis)) : new Date(),
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/kategori', authorize(Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getKategoriBreakdown({
      baslangic: baslangic ? new Date(String(baslangic)) : new Date(new Date().setDate(1)),
      bitis: bitis ? new Date(String(bitis)) : new Date(),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/gunluk-seri', authorize(Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getGunlukSeri({
      baslangic: baslangic ? new Date(String(baslangic)) : new Date(new Date().setDate(1)),
      bitis: bitis ? new Date(String(bitis)) : new Date(),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;

