import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { generateZpl, type EtiketInput } from './etiket.service';
import {
  generateZplBatchFromSablon,
  generateZplFromSablon,
  type CanvasElement,
  type EtiketVeri,
} from './etiket-zpl';
import * as sablonService from './etiket-sablon.service';

const router = Router();

router.use(authenticate);

router.get('/sablonlar', async (req: Request, res: Response) => {
  try {
    const kategori = typeof req.query.kategori === 'string' ? req.query.kategori : undefined;
    const data = await sablonService.listSablonlar(kategori);
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Şablonlar yüklenemedi' });
  }
});

router.post('/sablon', async (req: Request, res: Response) => {
  try {
    const { ad, kategori, elemanlar, etiketGenislik, etiketYukseklik } = req.body ?? {};
    if (!ad || !kategori || !elemanlar || !etiketGenislik || !etiketYukseklik) {
      return res.status(400).json({ error: 'ad, kategori, elemanlar, etiketGenislik, etiketYukseklik zorunlu' });
    }
    const data = await sablonService.createSablon({
      ad: String(ad),
      kategori: String(kategori),
      elemanlar,
      etiketGenislik: Number(etiketGenislik),
      etiketYukseklik: Number(etiketYukseklik),
    });
    return res.status(201).json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Şablon kaydedilemedi' });
  }
});

router.put('/sablon/:id', async (req: Request, res: Response) => {
  try {
    const data = await sablonService.updateSablon(req.params.id, req.body ?? {});
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Şablon güncellenemedi' });
  }
});

router.delete('/sablon/:id', async (req: Request, res: Response) => {
  try {
    const data = await sablonService.deleteSablon(req.params.id);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Şablon silinemedi' });
  }
});

router.post('/zpl', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    // Şablon tabanlı ZPL
    if (body.sablon || body.sablonId) {
      let elemanlar: CanvasElement[] = body.sablon?.elemanlar ?? [];
      let genislik = Number(body.sablon?.etiketGenislik ?? 100);
      let yukseklik = Number(body.sablon?.etiketYukseklik ?? 50);

      if (body.sablonId) {
        const kayit = await sablonService.getSablon(String(body.sablonId));
        if (!kayit) return res.status(404).json({ error: 'Şablon bulunamadı' });
        elemanlar = kayit.elemanlar as CanvasElement[];
        genislik = kayit.etiketGenislik;
        yukseklik = kayit.etiketYukseklik;
      }

      const rawVeriler = Array.isArray(body.etiketler) ? body.etiketler : [body.veri ?? {}];
      const veriler: EtiketVeri[] = rawVeriler.map((row: any) => ({
        urunAdi: row.urunAdi ?? row.ad,
        icReferans: row.icReferans ?? row.barkod ?? row.default_code,
        renkVaryant: row.renkVaryant ?? row.renk ?? row.varyant,
        fiyat: row.fiyat ?? row.price,
        seriNo: row.seriNo ?? row.lotNo,
        barkod: row.barkod ?? row.barcode,
        utsKodu: row.utsKodu,
        sonGuncelleme: row.sonGuncelleme,
      }));

      const zpl = generateZplBatchFromSablon(elemanlar, genislik, yukseklik, veriler);
      return res.json({ zpl, count: veriler.length });
    }

    // Önizleme: ham elemanlar + örnek veri
    if (body.elemanlar && Array.isArray(body.elemanlar)) {
      const elemanlar = body.elemanlar as CanvasElement[];
      const genislik = Number(body.etiketGenislik ?? 100);
      const yukseklik = Number(body.etiketYukseklik ?? 50);
      const veri: EtiketVeri = body.veri ?? {
        urunAdi: 'ÖRNEK ÜRÜN ADI',
        icReferans: 'REF001',
        renkVaryant: 'Siyah',
        fiyat: 999,
        seriNo: 'SN-123456',
        barkod: 'REF001',
      };
      const zpl = generateZplFromSablon(elemanlar, genislik, yukseklik, veri);
      return res.json({ zpl, count: 1 });
    }

    // Legacy sabit şablon
    const raw = Array.isArray(body) ? body : body.etiketler ?? body.items ?? [];
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: 'En az 1 etiket gerekli' });
    }

    const etiketler: EtiketInput[] = raw.map((row: any) => ({
      urunAdi: String(row.urunAdi ?? row.ad ?? ''),
      seriNo: String(row.seriNo ?? row.lotNo ?? ''),
      fiyat: row.fiyat ?? row.price ?? 0,
      barkod: row.barkod ?? row.barcode ?? null,
    }));

    const invalid = etiketler.find((e) => !e.urunAdi.trim());
    if (invalid) {
      return res.status(400).json({ error: 'Ürün adı zorunlu' });
    }

    const zpl = generateZpl(etiketler);
    return res.json({ zpl, count: etiketler.length });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'ZPL üretilemedi' });
  }
});

export default router;
