import { Router, type Request, type Response, type NextFunction } from 'express';
import { ItemStatus, Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  AddSaleItemInput,
  ConfirmSaleInput,
  CreateSaleInput,
  VoidSaleInput,
} from './sale.types';
import * as saleService from './sale.service';

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
    LENS_REQUIRES_FRAME_LINK: { status: 400, message: 'Cam kalemi bir çerçeveye bağlı olmalı.' },
    PAYMENT_AMOUNT_MISMATCH: { status: 400, message: 'Ödeme tutarı satış toplamı ile eşleşmiyor.' },
    PRODUCT_BARCODE_EXISTS: { status: 409, message: 'Bu barkod zaten kayıtlı.' },
    SALE_ALREADY_VOID: { status: 409, message: 'Satış zaten iptal.' },
    INSUFFICIENT_PERMISSION: { status: 403, message: 'Bu işlem için yetkiniz yok.' },
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
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
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
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
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
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
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
    const updated = await saleService.updateSaleItemStatus(req.params.itemId, status);
    return res.status(200).json(updated);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.post('/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ConfirmSaleInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    const result = await saleService.confirmSale(req.params.id, req.user!.userId, req.user!.role, parsed.data);
    return res.status(200).json(result);
  } catch (err) {
    if (handleSaleError(err, res)) return;
    next(err);
  }
});

router.post('/:id/void', authorize(Role.STORE_MANAGER, Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = VoidSaleInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    const sale = await saleService.voidSale(req.params.id, req.user!.userId, req.user!.role, parsed.data);
    return res.status(200).json(sale);
  } catch (err) {
    if (handleSaleError(err, res)) return;
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

