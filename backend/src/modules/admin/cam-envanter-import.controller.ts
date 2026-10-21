import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  buildCamEnvanterSablonBuffer,
  parseCamEnvanterExcel,
  previewCamEnvanterImport,
  type ParsedCamEnvanterRow,
} from './cam-envanter-import.service';
import {
  uygulaCamEnvanterImport,
  type CamEnvanterUygulaSatirSonuc,
} from './cam-envanter-import-uygula.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/sablon-indir', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const buffer = await buildCamEnvanterSablonBuffer();
    const filename = 'cam-lens-envanter-import-sablon.xlsx';
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
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Excel dosyası (file) zorunlu' });
      }

      const rows = await parseCamEnvanterExcel(req.file.buffer);
      if (!rows.length) {
        return res.status(400).json({ error: 'Excel dosyasında işlenecek satır yok' });
      }

      const onizleme = await previewCamEnvanterImport(rows);
      return res.json({ success: true, ...onizleme });
    } catch (err) {
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

    const parsed = satirlar as ParsedCamEnvanterRow[];

    // 21.10.2026 — ÖNCEDEN: tek bir satır bu şartı karşılamazsa TÜM istek
    // (chunk'ın TÜMÜ, ~15 satır) 400 ile reddediliyordu — chunk içindeki
    // geçerli diğer satırlar da gereksiz yere "başarısız" sayılıyordu
    // (frontend'de "Bu parça için istek yanıtı alınamadı" olarak görünüyor).
    // Artık sadece GERÇEKTEN eksik olan satır(lar) BASARISIZ raporlanıyor,
    // geçerli satırlar normal şekilde işleniyor.
    const gecersizSonuclar: CamEnvanterUygulaSatirSonuc[] = [];
    const gecerliSatirlar: ParsedCamEnvanterRow[] = [];
    for (const s of parsed) {
      // barkodOtomatikMu satırlarında barkod bilinçli olarak boş — apply
      // anında otomatik atanacak, bu yüzden bu satırlar kontrolden muaf.
      if (!s.satirNo || (!s.barkod?.trim() && !s.barkodOtomatikMu)) {
        gecersizSonuclar.push({
          satirNo: s.satirNo ?? 0,
          durum: 'BASARISIZ',
          mesaj: 'satirNo ve barkod zorunlu (barkod boş ve otomatik atama işaretli değil)',
        });
        continue;
      }
      gecerliSatirlar.push(s);
    }

    const sonuc = gecerliSatirlar.length
      ? await uygulaCamEnvanterImport({
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

export default router;
