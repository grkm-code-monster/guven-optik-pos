import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  buildEnvanterSablonBuffer,
  parseEnvanterExcel,
  previewEnvanterImport,
  type ParsedEnvanterRow,
} from './envanter-import.service';
import {
  uygulaEnvanterImport,
  type EnvanterUygulaSatirSonuc,
} from './envanter-import-uygula.service';
import { tespitEskiHatalıKayitlar, odooBaglantiTeshis } from './envanter-import-diagnostik.service';
import { onarEskiUtsKayitlari } from './envanter-import-onarim.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/sablon-indir', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const buffer = await buildEnvanterSablonBuffer();
    const filename = 'envanter-import-sablon.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/onizle',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    const t0 = Date.now();
    console.log(`[envanter-onizle] İSTEK BAŞLADI ts=${new Date().toISOString()}`);
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Excel dosyası (file) zorunlu' });
      }
      console.log(`[envanter-onizle] dosya alındı +${Date.now() - t0}ms boyut=${req.file.buffer.length}`);

      const rows = await parseEnvanterExcel(req.file.buffer);
      console.log(`[envanter-onizle] parse tamam +${Date.now() - t0}ms satır=${rows.length}`);
      if (!rows.length) {
        return res.status(400).json({ error: 'Excel dosyasında işlenecek satır yok' });
      }

      const onizleme = await previewEnvanterImport(rows);
      console.log(`[envanter-onizle] preview tamam +${Date.now() - t0}ms`);
      return res.json({ success: true, ...onizleme });
    } catch (err) {
      console.error(`[envanter-onizle] HATA +${Date.now() - t0}ms:`, err);
      next(err);
    }
  },
);

router.post('/uygula', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lokasyonKodu, satirlar, aktarimKimligi } = req.body ?? {};

    if (!lokasyonKodu?.trim()) {
      return res.status(400).json({ error: 'lokasyonKodu zorunlu' });
    }
    if (!Array.isArray(satirlar) || satirlar.length === 0) {
      return res.status(400).json({ error: 'satirlar dizisi zorunlu' });
    }

    const parsed = satirlar as ParsedEnvanterRow[];

    // 21.10.2026 — cam-envanter-import.controller.ts'teki aynı düzeltme:
    // ÖNCEDEN tek bir satır satirNo/barkod'u eksikse TÜM istek (chunk'ın
    // TÜMÜ) 400 ile reddediliyordu — chunk'taki geçerli diğer satırlar da
    // gereksiz yere "başarısız" sayılıyordu. Artık sadece gerçekten eksik
    // olan satır(lar) BASARISIZ raporlanıyor, geçerli satırlar işleniyor.
    const gecersizSonuclar: EnvanterUygulaSatirSonuc[] = [];
    const gecerliSatirlar: ParsedEnvanterRow[] = [];
    for (const s of parsed) {
      if (!s.satirNo || !s.barkod?.trim()) {
        gecersizSonuclar.push({
          satirNo: s.satirNo ?? 0,
          durum: 'BASARISIZ',
          mesaj: 'satirNo ve barkod zorunlu',
        });
        continue;
      }
      gecerliSatirlar.push(s);
    }

    const sonuc = gecerliSatirlar.length
      ? await uygulaEnvanterImport({
          lokasyonKodu: String(lokasyonKodu),
          satirlar: gecerliSatirlar,
          aktarimKimligi: typeof aktarimKimligi === 'string' ? aktarimKimligi : undefined,
        })
      : { ozet: { basarili: 0, basarisiz: 0 }, satirlar: [] };

    const birlesikSatirlar = [...gecersizSonuclar, ...sonuc.satirlar];
    const birlesikOzet = {
      basarili: sonuc.ozet.basarili,
      basarisiz: sonuc.ozet.basarisiz + gecersizSonuclar.length,
    };

    return res.json({ success: true, ozet: birlesikOzet, satirlar: birlesikSatirlar });
  } catch (err) {
    next(err);
  }
});

router.get('/odoo-baglanti-teshis', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sonuc = await odooBaglantiTeshis();
    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

router.get('/eski-kayitlar-tespit', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sonuc = await tespitEskiHatalıKayitlar();
    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

router.post('/eski-kayitlar-onar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { perBarkodUts, mode } = req.body ?? {};
    if (!perBarkodUts || typeof perBarkodUts !== 'object') {
      return res.status(400).json({ error: 'perBarkodUts zorunlu (barkod -> UTS kodu dizisi)' });
    }
    const m = mode === 'apply' ? 'apply' : 'preview';
    const sonuc = await onarEskiUtsKayitlari(perBarkodUts, m);
    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

export default router;
