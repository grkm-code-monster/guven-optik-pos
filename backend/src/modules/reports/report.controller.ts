import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize, authorizeOrYetki } from '../../middleware/authorize';
import { EK_YETKI } from '../admin/ek-yetki';
import * as reportService from './report.service';
import * as reportEngine from './report-engine.service';
import * as reportExport from './report-export.service';
import * as reportTemplate from './report-template.service';
import * as gunlukNot from './gunluk-not.service';
import { ReportExportInput, ReportQueryInput } from './report-engine.types';
import {
  CreateReportRequestInput,
  CreateReportScheduleInput,
  CreateReportTemplateInput,
} from './report-template.types';

const router = Router();

const gunlukNotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * "YYYY-MM-DD" formatındaki (saatsiz) tarih parametrelerini, TR sunucu yerel saatinde
 * günün başlangıcı/sonu olacak şekilde parse eder. Ham `new Date("YYYY-MM-DD")` UTC gece
 * yarısı olarak yorumlanır — TR (UTC+3) saatinde bu, günün 03:00'ü demektir; bitiş tarihi
 * için bu, o günün 03:00'ünden sonraki tüm satışların rapor aralığından sessizce
 * dışlanmasına yol açar. Saat bilgisi zaten varsa (ör. ISO datetime) dokunulmadan geçilir.
 */
function parseReportDateParam(value: unknown, endOfDay: boolean, fallback: () => Date): Date {
  if (!value) return fallback();
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  }
  return new Date(s);
}

function parseEkAliciEmail(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((e): e is string => typeof e === 'string');
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((e): e is string => typeof e === 'string');
        }
      } catch {
        // fall through to comma split
      }
    }
    return trimmed.split(/[,;\s]+/).filter(Boolean);
  }
  return [];
}
router.use(authenticate);

function handleReportEngineError(err: unknown, res: Response): boolean {
  if (err instanceof Error && 'code' in err && (err as Error & { code: string }).code === 'REPORT_VALIDATION_ERROR') {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message });
    return true;
  }
  return false;
}

function handleGunlukNotError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;
  if (code === 'FORBIDDEN') {
    res.status(403).json({ error: code, message: err.message });
    return true;
  }
  if (code === 'VALIDATION_ERROR' || code === 'EMAIL_FAILED') {
    res.status(400).json({ error: code, message: err.message });
    return true;
  }
  if (code === 'BRANCH_NOT_FOUND') {
    res.status(404).json({ error: code, message: err.message });
    return true;
  }
  return false;
}

function resolveBranchId(req: Request): string {
  const fromQuery = req.query.branchId ? String(req.query.branchId) : null;
  return fromQuery ?? req.user!.branchId;
}

function handleTemplateError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;
  if (code === 'REPORT_ACCESS_DENIED') {
    res.status(403).json({ error: code, message: err.message });
    return true;
  }
  if (code === 'REPORT_TEMPLATE_NOT_FOUND') {
    res.status(404).json({ error: code, message: err.message });
    return true;
  }
  if (code === 'REPORT_EMAIL_MISSING' || code === 'REPORT_EMAIL_FAILED') {
    res.status(400).json({ error: code, message: err.message });
    return true;
  }
  return false;
}

function parseDateParam(value: unknown) {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return { s, d };
}

async function runReportFromBody(
  req: Request,
): Promise<
  | {
      dimensions: string[];
      measures: string[];
      rows: Record<string, unknown>[];
      reportAdi?: string;
    }
  | { error: { status: number; message: string; code?: string } }
> {
  const parsed = ReportQueryInput.safeParse(req.body);
  if (!parsed.success) {
    return { error: { status: 400, message: 'Geçersiz istek gövdesi.' } };
  }

  const { userId, role } = req.user!;

  if (parsed.data.templateId) {
    if (role !== Role.ADMIN) {
      await reportTemplate.assertTemplateAccess(userId, role, parsed.data.templateId);
    }
    const result = await reportTemplate.runTemplateQuery(parsed.data.templateId);
    return {
      dimensions: result.dimensions,
      measures: result.measures,
      rows: result.rows,
      reportAdi: result.template.ad,
    };
  }

  if (role !== Role.ADMIN) {
    return {
      error: {
        status: 403,
        message: 'Özel sorgu yalnızca yöneticiler içindir. Şablon seçerek çalıştırın.',
        code: 'REPORT_ACCESS_DENIED',
      },
    };
  }

  if (!parsed.data.dimensions?.length || !parsed.data.measures?.length) {
    return { error: { status: 400, message: 'Boyut ve ölçü listesi gerekli.' } };
  }

  const filters = parsed.data.filters ?? {};
  const rows = await reportEngine.runReportQuery({
    dimensions: parsed.data.dimensions,
    measures: parsed.data.measures,
    filters: {
      tarihBaslangic: filters.tarihBaslangic ? new Date(filters.tarihBaslangic) : undefined,
      tarihBitis: filters.tarihBitis ? new Date(filters.tarihBitis) : undefined,
      subeId: filters.subeId,
    },
  });
  return {
    dimensions: parsed.data.dimensions,
    measures: parsed.data.measures,
    rows,
  };
}

router.get('/available-fields', authorize(Role.ADMIN), (_req: Request, res: Response) => {
  return res.status(200).json(reportEngine.getAvailableFields());
});

router.post('/query', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await runReportFromBody(req);
    if ('error' in result) {
      return res.status(result.error.status).json({
        error: result.error.code ?? 'VALIDATION_ERROR',
        message: result.error.message,
      });
    }
    return res.status(200).json({ rows: result.rows });
  } catch (err) {
    if (handleTemplateError(err, res)) return;
    if (handleReportEngineError(err, res)) return;
    next(err);
  }
});

router.post('/export/excel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await runReportFromBody(req);
    if ('error' in result) {
      return res.status(result.error.status).json({
        error: result.error.code ?? 'VALIDATION_ERROR',
        message: result.error.message,
      });
    }
    const buffer = await reportExport.exportReportExcel(result.rows, result.dimensions, result.measures);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="rapor-${stamp}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (err) {
    if (handleTemplateError(err, res)) return;
    if (handleReportEngineError(err, res)) return;
    next(err);
  }
});

router.post('/export/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exportParsed = ReportExportInput.safeParse(req.body);
    if (!exportParsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const result = await runReportFromBody(req);
    if ('error' in result) {
      return res.status(result.error.status).json({
        error: result.error.code ?? 'VALIDATION_ERROR',
        message: result.error.message,
      });
    }
    const buffer = await reportExport.exportReportPdf(
      result.rows,
      result.dimensions,
      result.measures,
      exportParsed.data.reportAdi ?? result.reportAdi ?? 'Rapor',
    );
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapor-${stamp}.pdf"`);
    return res.status(200).send(buffer);
  } catch (err) {
    if (handleTemplateError(err, res)) return;
    if (handleReportEngineError(err, res)) return;
    next(err);
  }
});

router.post('/templates', authorize(Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateReportTemplateInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const template = await reportTemplate.createReportTemplate(req.user!.userId, parsed.data);
    return res.status(201).json(template);
  } catch (err) {
    if (handleReportEngineError(err, res)) return;
    next(err);
  }
});

router.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await reportTemplate.listReportTemplates(req.user!.userId, req.user!.role);
    return res.status(200).json(templates);
  } catch (err) {
    next(err);
  }
});

router.post('/schedules', authorize(Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateReportScheduleInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const schedule = await reportTemplate.createReportSchedule(parsed.data);
    return res.status(201).json(schedule);
  } catch (err) {
    if (handleTemplateError(err, res)) return;
    next(err);
  }
});

router.get('/requests', authorize(Role.ADMIN), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const requests = await reportTemplate.listPendingReportRequests();
    return res.status(200).json(requests);
  } catch (err) {
    next(err);
  }
});

router.post('/requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateReportRequestInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const request = await reportTemplate.createReportRequest(req.user!.userId, parsed.data.istekMetni);
    return res.status(201).json(request);
  } catch (err) {
    next(err);
  }
});

router.post('/templates/:id/send-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await reportTemplate.sendTemplateReportEmail(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    return res.status(200).json(result);
  } catch (err) {
    if (handleTemplateError(err, res)) return;
    next(err);
  }
});

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

router.get(
  '/gunluk-not',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branchId = resolveBranchId(req);
      const tarih = req.query.tarih ? String(req.query.tarih) : new Date().toISOString().slice(0, 10);
      await gunlukNot.assertBranchAccess(branchId, req.user!.userId, req.user!.role);
      const result = await gunlukNot.getGunlukDurumNotu(branchId, tarih);
      return res.status(200).json(result);
    } catch (err) {
      if (handleGunlukNotError(err, res)) return;
      next(err);
    }
  },
);

router.put(
  '/gunluk-not',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { branchId: bodyBranchId, tarih, metin } = req.body ?? {};
      const branchId = bodyBranchId ? String(bodyBranchId) : req.user!.branchId;
      if (!tarih || typeof metin !== 'string') {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'branchId, tarih ve metin gerekli.' });
      }
      await gunlukNot.assertBranchAccess(branchId, req.user!.userId, req.user!.role);
      const result = await gunlukNot.upsertGunlukDurumNotu(
        branchId,
        String(tarih),
        metin,
        req.user!.userId,
      );
      return res.status(200).json(result);
    } catch (err) {
      if (handleGunlukNotError(err, res)) return;
      next(err);
    }
  },
);

router.post(
  '/gunluk-not/gonder',
  authorize(Role.STORE_MANAGER, Role.ADMIN),
  gunlukNotUpload.single('pdf'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { branchId: bodyBranchId, tarih } = req.body ?? {};
      const branchId = bodyBranchId ? String(bodyBranchId) : req.user!.branchId;
      if (!tarih) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'tarih gerekli.' });
      }
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'PDF dosyası gerekli.' });
      }
      await gunlukNot.assertBranchAccess(branchId, req.user!.userId, req.user!.role);
      const ekList = parseEkAliciEmail(req.body?.ekAliciEmail);
      const result = await gunlukNot.sendGunlukDurumNotuEmail(
        branchId,
        String(tarih),
        ekList,
        req.file.buffer,
      );
      return res.status(200).json(result);
    } catch (err) {
      if (handleGunlukNotError(err, res)) return;
      next(err);
    }
  },
);

router.get('/range', authorize(Role.STORE_MANAGER, Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startParsed = parseDateParam(req.query.start);
    const endParsed = parseDateParam(req.query.end);
    if (!startParsed || !endParsed) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz start/end parametresi.' });
    }
    if (startParsed.d.getTime() > endParsed.d.getTime()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Başlangıç tarihi bitişten sonra olamaz.' });
    }
    const report = await reportService.getRangeReport(
      req.user!.branchId,
      startParsed.d,
      endParsed.d,
    );
    return res.status(200).json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/personel-aylik', authorize(Role.STORE_MANAGER, Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ay = Number(req.query.ay);
    const yil = Number(req.query.yil);
    if (!Number.isInteger(ay) || !Number.isInteger(yil)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz ay/yil parametresi.' });
    }
    const rows = await reportService.getMonthlyPersonelBreakdown(req.user!.branchId, ay, yil);
    return res.status(200).json(rows);
  } catch (err) {
    next(err);
  }
});

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

router.get('/daily/excel', authorize(Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
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

router.get('/patron/ozet', authorizeOrYetki([EK_YETKI.PATRON_PANELI], Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getPatronOzet({
      baslangic: parseReportDateParam(baslangic, false, () => new Date(new Date().setDate(1))),
      bitis: parseReportDateParam(bitis, true, () => new Date()),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/personel', authorizeOrYetki([EK_YETKI.PATRON_PANELI], Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getPersonelPerformans({
      baslangic: parseReportDateParam(baslangic, false, () => new Date(new Date().setDate(1))),
      bitis: parseReportDateParam(bitis, true, () => new Date()),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/kategori', authorizeOrYetki([EK_YETKI.PATRON_PANELI], Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getKategoriBreakdown({
      baslangic: parseReportDateParam(baslangic, false, () => new Date(new Date().setDate(1))),
      bitis: parseReportDateParam(bitis, true, () => new Date()),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/kategori-alt', authorizeOrYetki([EK_YETKI.PATRON_PANELI], Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId, anaKategori } = req.query;
    if (!anaKategori || typeof anaKategori !== 'string') {
      return res.status(400).json({ error: 'anaKategori zorunlu' });
    }
    const result = await reportService.getKategoriAltKirilim({
      baslangic: parseReportDateParam(baslangic, false, () => new Date(new Date().setDate(1))),
      bitis: parseReportDateParam(bitis, true, () => new Date()),
      subeId: subeId ? String(subeId) : undefined,
      anaKategori,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/gunluk-seri', authorizeOrYetki([EK_YETKI.PATRON_PANELI], Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getGunlukSeri({
      baslangic: parseReportDateParam(baslangic, false, () => new Date(new Date().setDate(1))),
      bitis: parseReportDateParam(bitis, true, () => new Date()),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/sskf', authorizeOrYetki([EK_YETKI.PATRON_PANELI], Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId, temsilciId, paraBirimi } = req.query;
    const result = await reportService.getSskfRaporu({
      baslangic: parseReportDateParam(baslangic, false, () => new Date(new Date().setDate(1))),
      bitis: parseReportDateParam(bitis, true, () => new Date()),
      subeId: subeId ? String(subeId) : undefined,
      temsilciId: temsilciId ? String(temsilciId) : undefined,
      paraBirimi: paraBirimi === 'EUR' ? 'EUR' : 'USD',
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;

