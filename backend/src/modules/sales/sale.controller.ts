import { Router, type Request, type Response, type NextFunction } from 'express';
import { ItemStatus, Role, SaleStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  AddSaleItemInput,
  ConfirmSaleInput,
  CreateSaleInput,
  PersonelFiyatHesaplaInput,
  UpdateDraftMetaInput,
  VoidSaleInput,
} from './sale.types';
import * as saleService from './sale.service';
import * as labIncidentService from './lab-incident.service';
import { subeToSirketAyarId } from '../efatura/uyumsoft-efatura.service';
import { getOutboxInvoicePdf } from '../uyumsoft/uyumsoft.service';

const router = Router();
router.use(authenticate);

function handleSaleError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;

  const map: Record<string, { status: number; message: string }> = {
    SHIFT_NOT_OPEN: { status: 400, message: 'Vardiya açık olmalı.' },
    SALE_NOT_FOUND: { status: 404, message: 'Satış bulunamadı.' },
    SALE_ITEM_NOT_FOUND: { status: 404, message: 'Kalem bulunamadı.' },
    PRODUCT_NOT_FOUND: { status: 404, message: 'Ürün bulunamadı.' },
    SALE_NOT_EDITABLE: { status: 409, message: 'Satış düzenlenemez.' },
    SALE_ALREADY_PROCESSING: { status: 409, message: 'Satış zaten işleniyor veya onaylanmış.' },
    LENS_REQUIRES_FRAME_LINK: { status: 400, message: 'Cam kalemi bir çerçeveye bağlı olmalı.' },
    PAYMENT_AMOUNT_MISMATCH: { status: 400, message: 'Ödeme tutarı satış toplamı ile eşleşmiyor.' },
    PRODUCT_BARCODE_EXISTS: { status: 409, message: 'Bu barkod zaten kayıtlı.' },
    SALE_ALREADY_VOID: { status: 409, message: 'Satış zaten iptal.' },
    INSUFFICIENT_PERMISSION: { status: 403, message: 'Bu işlem için yetkiniz yok.' },
    FORBIDDEN_STATUS_TRANSITION: { status: 403, message: 'Bu durum geçişi için yetkiniz yok.' },
    ATOLYE_BRANCH_REQUIRED: { status: 400, message: 'Laboratuvara gönderim için atölye şubesi seçilmelidir.' },
    ATOLYE_BRANCH_INVALID: { status: 400, message: 'Seçilen şubenin atölyesi yok.' },
    NOT_LAB_ELIGIBLE_ITEM: { status: 400, message: 'Bu ürün laboratuvar sürecine tabi değil.' },
    FORBIDDEN_ATOLYE_BRANCH: { status: 403, message: 'Bu atölye kuyruğuna erişim yetkiniz yok.' },
    NOT_IN_ATOLYE: { status: 400, message: 'Kalem atölye kuyruğunda değil.' },
    INVALID_ITEM_STATUS: { status: 400, message: 'Kalem durumu sorun bildirimi için uygun değil.' },
    PRODUCT_ID_MISSING: { status: 400, message: 'Odoo ürün ID bulunamadı.' },
    LAB_INCIDENT_NOT_FOUND: { status: 404, message: 'Olay kaydı bulunamadı.' },
    INVALID_INCIDENT_TYPE: { status: 400, message: 'Geçersiz olay tipi.' },
    INCIDENT_ALREADY_RESOLVED: { status: 409, message: 'Olay zaten çözümlenmiş.' },
    ATOLYE_LOCATION_MISSING: { status: 400, message: 'Atölye lokasyonu tanımsız.' },
    TRANSFER_FAILED: { status: 502, message: 'Transfer başarısız.' },
    CARD_PAYMENT_FIELDS_REQUIRED: { status: 400, message: 'Kart ödemesi için bankId, posDeviceId ve installment zorunludur.' },
    COMMISSION_RATE_NOT_FOUND: { status: 400, message: 'Komisyon oranı bulunamadı.' },
  };

  const m = map[code];
  if (!m) return false;
  res.status(m.status).json({ error: code, message: m.message });
  return true;
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateSaleInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Geçersiz istek gövdesi.',
      details: parsed.error.errors,
    });
    const sale = await saleService.createSale(req.user!.userId, req.user!.branchId, parsed.data);
    return res.status(200).json(sale);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.post('/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = AddSaleItemInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Geçersiz istek gövdesi.',
      details: parsed.error.errors,
    });
    const result = await saleService.addSaleItem(req.params.id, parsed.data);
    return res.status(200).json(result);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.put('/:id/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = AddSaleItemInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Geçersiz istek gövdesi.',
      details: parsed.error.errors,
    });
    const updated = await saleService.updateSaleItem(req.params.itemId, parsed.data);
    return res.status(200).json(updated);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.delete('/:id/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await saleService.removeSaleItem(req.params.itemId);
    return res.status(200).json(result);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.patch('/:id/items/:itemId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.body?.status ?? req.query?.status) as ItemStatus | undefined;
    if (!status || !(Object.values(ItemStatus) as string[]).includes(status)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz status.' });
    }

    const deliveryDateRaw = req.body?.deliveryDate;
    let deliveryDate: Date | null | undefined = undefined;
    if (deliveryDateRaw === null) {
      deliveryDate = null;
    } else if (typeof deliveryDateRaw === 'string' && deliveryDateRaw) {
      const parsed = new Date(deliveryDateRaw);
      deliveryDate = Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    const updated = await saleService.updateSaleItemStatus(
      req.params.itemId,
      status,
      req.user!.role,
      req.user!.canWorkAtolye ?? false,
      {
        deliveryDate,
        atolyeBranchId: typeof req.body?.atolyeBranchId === 'string' ? req.body.atolyeBranchId : undefined,
        userId: req.user!.userId,
      },
    );
    return res.status(200).json(updated);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.patch('/:id/draft-meta', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateDraftMetaInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Geçersiz istek gövdesi.',
      details: parsed.error.errors,
    });
    const sale = await saleService.updateDraftMeta(req.params.id, parsed.data);
    return res.status(200).json(sale);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.post('/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ConfirmSaleInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Geçersiz istek gövdesi.',
      details: parsed.error.errors,
    });
    const result = await saleService.confirmSale(req.params.id, req.user!.userId, req.user!.role, parsed.data);
    return res.status(200).json(result);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

// Personel Fiyat Listesi: sadece Mağaza Müdürü ve üstü rolüyle giriş yapan kullanıcılar hesaplayabilir.
router.post(
  '/personel-fiyat-hesapla',
  authorize(Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = PersonelFiyatHesaplaInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Geçersiz istek gövdesi.',
        details: parsed.error.errors,
      });
      const result = await saleService.hesaplaPersonelFiyati(parsed.data.odooProductId);
      return res.status(200).json(result);
    } catch (err) {
      if (handleSaleError(err, res)) return;
      next(err);
    }
  },
);

router.post('/:id/void', authorize(Role.STORE_MANAGER, Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = VoidSaleInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Geçersiz istek gövdesi.',
      details: parsed.error.errors,
    });
    const sale = await saleService.voidSale(req.params.id, req.user!.userId, req.user!.role, parsed.data);
    return res.status(200).json(sale);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.get('/atolye-branches', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const branches = await saleService.getAtolyeBranches();
    return res.status(200).json({ success: true, data: branches });
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.get('/atolye-kuyruk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId.trim() : '';
    if (!branchId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'branchId zorunludur.' });
    }

    const durumRaw = typeof req.query.durum === 'string' ? req.query.durum.toUpperCase() : '';
    if (durumRaw !== ItemStatus.IN_LAB && durumRaw !== ItemStatus.READY) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'durum IN_LAB veya READY olmalıdır.',
      });
    }

    const items = await saleService.getAtolyeKuyruk(req.user!, branchId, durumRaw);
    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.post('/lab-incident', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const saleItemId = typeof req.body?.saleItemId === 'string' ? req.body.saleItemId.trim() : '';
    const incidentType = typeof req.body?.incidentType === 'string' ? req.body.incidentType.trim().toUpperCase() : '';
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

    if (!saleItemId || !incidentType) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'saleItemId ve incidentType zorunludur.' });
    }

    const result = await labIncidentService.reportLabIncident(req.user!, {
      saleItemId,
      incidentType: incidentType as labIncidentService.LabIncidentType,
      note,
    });
    return res.status(200).json(result);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.post('/lab-incident/:id/confirm-transfer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kaynakLokasyonId = Number(req.body?.kaynakLokasyonId);
    if (!Number.isFinite(kaynakLokasyonId) || kaynakLokasyonId <= 0) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'kaynakLokasyonId zorunludur.' });
    }

    const result = await labIncidentService.confirmLabIncidentTransfer(
      req.user!,
      req.params.id,
      kaynakLokasyonId,
    );
    return res.status(200).json(result);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.get('/delivery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId } = req.query;
    const sales = await prisma.sale.findMany({
      where: {
        status: SaleStatus.PAID,
        ...(branchId ? { branchId: String(branchId) } : {}),
        items: {
          some: {
            status: { in: [ItemStatus.ORDERED, ItemStatus.IN_LAB, ItemStatus.READY] },
          },
        },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: { product: { select: { name: true, category: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({ success: true, data: sales });
  } catch (err: any) {
    next(err);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sales = await saleService.getSales(req.user!.branchId, {
      status: req.query.status,
      customerId: req.query.customerId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    });
    return res.status(200).json(sales);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.get('/:id/fatura-pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
    });
    if (!sale) {
      return res.status(404).json({ error: 'SALE_NOT_FOUND', message: 'Satış bulunamadı.' });
    }
    if (sale.eFaturaDurum !== 'GONDERILDI' || !sale.eFaturaId) {
      return res.status(400).json({
        error: 'FATURA_NOT_READY',
        message: 'Fatura henüz hazır değil.',
      });
    }

    const fatura = await prisma.fatura.findUnique({ where: { id: sale.eFaturaId } });
    if (!fatura?.uuid) {
      return res.status(400).json({
        error: 'FATURA_NOT_READY',
        message: 'Fatura henüz hazır değil.',
      });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: sale.branchId },
      select: { code: true },
    });
    const branchCode = branch?.code ?? 'GVN1';
    const sirketId = subeToSirketAyarId(branchCode);
    const base64 = await getOutboxInvoicePdf(sirketId, fatura.uuid);
    const pdfBuffer = Buffer.from(base64, 'base64');

    if (!pdfBuffer.length) {
      return res.status(502).json({
        error: 'FATURA_PDF_EMPTY',
        message: 'Fatura PDF içeriği alınamadı.',
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="fatura-${fatura.faturaNo || fatura.uuid}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    if (err instanceof Error && err.message.includes('PDF')) {
      return res.status(502).json({ error: 'FATURA_PDF_ERROR', message: err.message });
    }
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await saleService.getSaleById(req.params.id);
    return res.status(200).json(sale);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

export default router;

