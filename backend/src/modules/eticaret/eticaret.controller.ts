import { Router, type Request, type Response, type NextFunction } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { prisma } from '../../database/prisma';
import { ETICARET_DURUM } from './eticaret-siparis.service';

const router = Router();
router.use(authenticate);
router.use(authorize(Role.STORE_MANAGER, Role.ADMIN));

/**
 * Mağaza müdürü ekranı: kendi şubesine (secilenSubeId) düşen e-ticaret siparişlerini görür.
 * ADMIN tüm şubelerdeki siparişleri görebilir (isteğe bağlı ?subeId filtresi).
 */
router.get('/siparisler', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const durum = typeof req.query.durum === 'string' ? req.query.durum : undefined;

    const subeId =
      user.role === Role.STORE_MANAGER
        ? user.branchId
        : typeof req.query.subeId === 'string'
          ? req.query.subeId
          : undefined;

    const siparisler = await prisma.eticaretSiparis.findMany({
      where: {
        ...(subeId ? { secilenSubeId: subeId } : {}),
        ...(durum ? { durum } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        secilenSube: { select: { id: true, name: true, code: true } },
        sale: {
          select: {
            id: true,
            referansNo: true,
            netTotal: true,
            eFaturaDurum: true,
            odooSyncError: true,
            items: {
              where: { status: { not: 'VOID' } },
              select: { id: true, odooProductName: true, qty: true, unitPrice: true, product: { select: { name: true } } },
            },
          },
        },
      },
    });

    return res.json({ data: siparisler });
  } catch (err) {
    next(err);
  }
});

router.get('/siparisler/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const siparis = await prisma.eticaretSiparis.findUnique({
      where: { id: req.params.id },
      include: {
        secilenSube: { select: { id: true, name: true, code: true } },
        sale: {
          select: {
            id: true,
            referansNo: true,
            netTotal: true,
            eFaturaDurum: true,
            odooSyncError: true,
            items: {
              where: { status: { not: 'VOID' } },
              select: { id: true, odooProductName: true, qty: true, unitPrice: true, product: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!siparis) return res.status(404).json({ error: 'SIPARIS_NOT_FOUND', message: 'Sipariş bulunamadı.' });
    if (user.role === Role.STORE_MANAGER && siparis.secilenSubeId !== user.branchId) {
      return res.status(403).json({ error: 'INSUFFICIENT_PERMISSION', message: 'Bu sipariş şubenize ait değil.' });
    }
    return res.json({ data: siparis });
  } catch (err) {
    next(err);
  }
});

/** Mağaza müdürü siparişi kargoya verdiğinde işaretler. */
router.patch('/siparisler/:id/kargoya-ver', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const siparis = await prisma.eticaretSiparis.findUnique({ where: { id: req.params.id } });
    if (!siparis) return res.status(404).json({ error: 'SIPARIS_NOT_FOUND', message: 'Sipariş bulunamadı.' });
    if (user.role === Role.STORE_MANAGER && siparis.secilenSubeId !== user.branchId) {
      return res.status(403).json({ error: 'INSUFFICIENT_PERMISSION', message: 'Bu sipariş şubenize ait değil.' });
    }
    if (siparis.durum !== ETICARET_DURUM.HAZIRLANIYOR) {
      return res.status(409).json({ error: 'INVALID_STATE', message: 'Sipariş kargoya verilebilir durumda değil.' });
    }

    const kargoTakipNo = typeof req.body?.kargoTakipNo === 'string' ? req.body.kargoTakipNo.trim() || null : null;

    const updated = await prisma.eticaretSiparis.update({
      where: { id: siparis.id },
      data: {
        durum: ETICARET_DURUM.KARGOYA_VERILDI,
        kargoTakipNo,
        kargoyaVerildiTarihi: new Date(),
        partnerDurumBildirildi: false,
      },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
