import { Router, type NextFunction, type Request, type Response } from 'express';
import { ItemStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { authenticate } from '../../middleware/authenticate';
import {
  eFaturaGonder,
  faturaNoUret,
  mukellefiyetSorgula,
  processFaturaKuyruk,
  satistenFaturaData,
  tetikleSatisEFatura,
} from './uyumsoft-efatura.service';

const router = Router();
router.use(authenticate);

router.get('/mukellef-sorgula', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vkn } = req.query;
    if (!vkn || typeof vkn !== 'string') {
      return res.status(400).json({ error: 'vkn gerekli' });
    }
    const sonuc = await mukellefiyetSorgula(vkn);
    return res.json(sonuc);
  } catch (err) {
    next(err);
  }
});

router.post('/gonder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { satisId, faturaNo: manuelNo } = req.body ?? {};
    if (!satisId) {
      return res.status(400).json({ error: 'satisId gerekli' });
    }

    const satis = await prisma.sale.findUnique({
      where: { id: satisId },
      include: {
        items: { include: { product: true }, where: { status: { not: ItemStatus.VOID } } },
        customer: true,
      },
    });
    if (!satis) {
      return res.status(404).json({ error: 'Satış bulunamadı' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: satis.branchId } });
    const branchCode = branch?.code ?? 'GVN1';

    let faturaNo = manuelNo as string | undefined;
    if (!faturaNo) {
      const count = await prisma.fatura.count({ where: { sube: branchCode } });
      faturaNo = faturaNoUret(branchCode, count + 1);
    }

    const faturaData = satistenFaturaData(satis, faturaNo, branchCode);
    const sonuc = await eFaturaGonder(faturaData, branch);

    if (sonuc.basarili) {
      const fatura = await prisma.fatura.create({
        data: {
          faturaNo: sonuc.faturaNo,
          uuid: sonuc.uuid,
          satisId,
          sube: branchCode,
          aliciVkn: faturaData.aliciVkn,
          aliciAdi: faturaData.aliciAdi,
          tutar: Number(satis.netTotal),
          durum: 'GONDERILDI',
          profileId: sonuc.profileId ?? 'EARSIVFATURA',
          gonderilenAt: new Date(),
        },
      });
      await prisma.sale.update({
        where: { id: satisId },
        data: { eFaturaId: fatura.id, eFaturaDurum: 'GONDERILDI' },
      });
    }

    return res.json(sonuc);
  } catch (err) {
    next(err);
  }
});

router.post('/satis-onay/:satisId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { satisId } = req.params;
    await tetikleSatisEFatura(satisId);
    const satis = await prisma.sale.findUnique({
      where: { id: satisId },
      select: { eFaturaDurum: true, eFaturaId: true },
    });
    return res.json({
      satisId,
      basarili: satis?.eFaturaDurum === 'GONDERILDI',
      eFaturaDurum: satis?.eFaturaDurum,
      eFaturaId: satis?.eFaturaId,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/liste', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sube, baslangic, bitis, durum } = req.query;
    const where: {
      sube?: string;
      durum?: string;
      gonderilenAt?: { gte?: Date; lte?: Date };
    } = {};

    if (typeof sube === 'string') where.sube = sube;
    if (typeof durum === 'string') where.durum = durum;
    if (baslangic || bitis) {
      where.gonderilenAt = {};
      if (typeof baslangic === 'string') where.gonderilenAt.gte = new Date(baslangic);
      if (typeof bitis === 'string') where.gonderilenAt.lte = new Date(bitis);
    }

    const faturalar = await prisma.fatura.findMany({
      where,
      orderBy: { gonderilenAt: 'desc' },
      take: 100,
    });

    return res.json(faturalar);
  } catch (err) {
    next(err);
  }
});

router.post('/kuyruk-isle', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sonuc = await processFaturaKuyruk();
    return res.json(sonuc);
  } catch (err) {
    next(err);
  }
});

export default router;
