import { Router, type Request, type Response, type NextFunction } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as reportService from './report.service';
import * as reportEngine from './report-engine.service';
import * as reportExport from './report-export.service';
import * as reportTemplate from './report-template.service';
import { ReportExportInput, ReportQueryInput } from './report-engine.types';
import {
  CreateReportRequestInput,
  CreateReportScheduleInput,
  CreateReportTemplateInput,
} from './report-template.types';

const router = Router();
router.use(authenticate);

function handleReportEngineError(err: unknown, res: Response): boolean {
  if (err instanceof Error && 'code' in err && (err as Error & { code: string }).code === 'REPORT_VALIDATION_ERROR') {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message });
    return true;
  }
  return false;
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

router.get('/patron/ozet', authorize(Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
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

router.get('/patron/personel', authorize(Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, subeId } = req.query;
    const result = await reportService.getPersonelPerformans({
      baslangic: baslangic ? new Date(String(baslangic)) : new Date(new Date().setDate(1)),
      bitis: bitis ? new Date(String(bitis)) : new Date(),
      subeId: subeId ? String(subeId) : undefined,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/patron/kategori', authorize(Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
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

router.get('/patron/gunluk-seri', authorize(Role.ADMIN, Role.REGIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
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

