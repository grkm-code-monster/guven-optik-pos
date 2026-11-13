import { Router, type Request, type Response } from 'express';
import { prisma } from '../../database/prisma';
import {
  ikmalSatilanlar,
  sonSevkTarihi,
  taslakGonder,
  taslakGuncelle,
  taslakIptal,
  taslakListesi,
  taslakOlustur,
  taslakToplamaListesi,
  type IkmalTur,
} from './ikmal.service';

/** 13.11.2026 — Mağaza İkmali (Stok Yönetimi). Erişim: ek-yetki.ts kuralı. */
const router = Router();

async function kullanici(req: Request) {
  const id = req.user?.userId ?? null;
  if (!id) return { id: null, ad: null };
  const u = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return { id, ad: u?.name ?? null };
}
function hata(res: Response, err: unknown, varsayilan: string) {
  return res.status(400).json({ error: err instanceof Error ? err.message : varsayilan });
}

router.get('/son-sevk', async (req, res) => {
  try {
    return res.json({ tarih: await sonSevkTarihi(String(req.query.lokasyon ?? '')) });
  } catch (e) {
    return hata(res, e, 'Okunamadı');
  }
});

router.get('/satilanlar', async (req, res) => {
  try {
    return res.json(await ikmalSatilanlar({
      lokasyon: String(req.query.lokasyon ?? ''),
      bas: String(req.query.bas ?? ''),
      bit: String(req.query.bit ?? ''),
      tur: (String(req.query.tur ?? '') as IkmalTur),
    }));
  } catch (e) {
    return hata(res, e, 'Satışlar okunamadı');
  }
});

router.get('/taslaklar', async (req, res) => {
  try {
    return res.json({ data: await taslakListesi({ lokasyon: req.query.lokasyon ? String(req.query.lokasyon) : undefined, durum: req.query.durum ? String(req.query.durum) : undefined }) });
  } catch (e) {
    return hata(res, e, 'Taslaklar okunamadı');
  }
});

router.post('/taslak', async (req, res) => {
  try {
    return res.json({ data: await taslakOlustur(req.body ?? {}, await kullanici(req)) });
  } catch (e) {
    return hata(res, e, 'Taslak oluşturulamadı');
  }
});

router.put('/taslak/:id', async (req, res) => {
  try {
    return res.json({ data: await taslakGuncelle(req.params.id, req.body?.kalemler ?? [], req.body?.aciklama) });
  } catch (e) {
    return hata(res, e, 'Taslak güncellenemedi');
  }
});

router.post('/taslak/:id/iptal', async (req, res) => {
  try {
    return res.json({ data: await taslakIptal(req.params.id) });
  } catch (e) {
    return hata(res, e, 'İptal edilemedi');
  }
});

router.get('/taslak/:id/toplama', async (req, res) => {
  try {
    return res.json(await taslakToplamaListesi(req.params.id));
  } catch (e) {
    return hata(res, e, 'Toplama listesi hazırlanamadı');
  }
});

router.post('/taslak/:id/gonder', async (req, res) => {
  try {
    const k = await kullanici(req);
    const r = await taslakGonder(req.params.id, k.ad);
    return res.status(r.success ? 200 : 400).json(r);
  } catch (e) {
    return hata(res, e, 'Transfer başlatılamadı');
  }
});

export default router;
