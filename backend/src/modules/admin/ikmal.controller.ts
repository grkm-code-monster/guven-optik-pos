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
import { siparisDurum, siparisListesi, siparisOlustur, tedarikciler } from './satin-alma-siparis.service';
import { markaAnalizi, markaKartKaydet, markaListesi, okut } from './satin-alma-analiz.service';
import { kuralKaydet, kuralKopyala, kuralListesi, kuralSil, minMaxDegerlendir, seriListesi, seriOnizle } from './stok-seviye.service';

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

// ── Min-max (stok cam / lens / solüsyon) ──
router.get('/kurallar', async (req, res) => {
  try {
    return res.json({ data: await kuralListesi(req.query.lokasyon ? String(req.query.lokasyon) : undefined) });
  } catch (e) {
    return hata(res, e, 'Kurallar okunamadı');
  }
});

router.post('/kural', async (req, res) => {
  try {
    return res.json({ data: await kuralKaydet(req.body ?? {}) });
  } catch (e) {
    return hata(res, e, 'Kural kaydedilemedi');
  }
});

router.delete('/kural/:id', async (req, res) => {
  try {
    await kuralSil(req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return hata(res, e, 'Kural silinemedi');
  }
});

router.post('/kural-kopyala', async (req, res) => {
  try {
    const hedefler = Array.isArray(req.body?.hedefler) ? req.body.hedefler.map(String) : [];
    return res.json({ kopyalanan: await kuralKopyala(String(req.body?.kaynak ?? ''), hedefler) });
  } catch (e) {
    return hata(res, e, 'Kopyalanamadı');
  }
});

router.get('/seriler', async (_req, res) => {
  try {
    return res.json({ data: await seriListesi() });
  } catch (e) {
    return hata(res, e, 'Seri listesi okunamadı');
  }
});

router.get('/seri-onizle', async (req, res) => {
  try {
    return res.json(await seriOnizle(String(req.query.seri ?? '')));
  } catch (e) {
    return hata(res, e, 'Önizlenemedi');
  }
});

router.get('/minmax', async (req, res) => {
  try {
    return res.json(await minMaxDegerlendir(String(req.query.lokasyon ?? '')));
  } catch (e) {
    return hata(res, e, 'Min-max hesaplanamadı');
  }
});

// ── Satın alma siparişleri (firmadan mağazaya) ──
router.get('/tedarikciler', async (req, res) => {
  try {
    return res.json({ data: await tedarikciler(req.query.q ? String(req.query.q) : undefined) });
  } catch (e) {
    return hata(res, e, 'Tedarikçiler okunamadı');
  }
});

router.get('/siparisler', async (req, res) => {
  try {
    return res.json({ data: await siparisListesi({ lokasyon: req.query.lokasyon ? String(req.query.lokasyon) : undefined, durum: req.query.durum ? String(req.query.durum) : undefined }) });
  } catch (e) {
    return hata(res, e, 'Siparişler okunamadı');
  }
});

router.post('/siparis', async (req, res) => {
  try {
    const k = await kullanici(req);
    return res.json({ data: await siparisOlustur(req.body ?? {}, k.ad) });
  } catch (e) {
    return hata(res, e, 'Sipariş oluşturulamadı');
  }
});

router.post('/siparis/:id/durum', async (req, res) => {
  try {
    return res.json({ data: await siparisDurum(req.params.id, req.body?.durum) });
  } catch (e) {
    return hata(res, e, 'Durum değiştirilemedi');
  }
});


// ───────── Satın Alma (firma ziyareti) — 14.11.2026 ─────────
router.get('/satin-alma/markalar', async (req, res) => {
  try {
    return res.json(await markaListesi(req.query.yenile === '1'));
  } catch (e) {
    return hata(res, e, 'Markalar okunamadı');
  }
});

router.get('/satin-alma/marka', async (req, res) => {
  try {
    return res.json(await markaAnalizi(String(req.query.marka ?? '')));
  } catch (e) {
    return hata(res, e, 'Marka analizi okunamadı');
  }
});

router.get('/satin-alma/okut', async (req, res) => {
  try {
    return res.json({ data: await okut(String(req.query.kod ?? '')) });
  } catch (e) {
    return hata(res, e, 'Okunamadı');
  }
});

router.put('/satin-alma/marka-kart', async (req, res) => {
  try {
    return res.json({ data: await markaKartKaydet(req.body ?? {}) });
  } catch (e) {
    return hata(res, e, 'Kaydedilemedi');
  }
});

export default router;
