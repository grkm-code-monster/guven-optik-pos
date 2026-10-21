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
      // 21.10.2026 — ÖNCEDEN: sadece s.barkodOtomatikMu bayrağına bakılıyordu.
      // Önizleme adımında bu bayrak doğru hesaplanıyor ama frontend/HTTP
      // turunda bazı satırlarda (gözlenen: barkod VE UTS ikisi de boş olan
      // satırlar) bu bayrak uygula isteğine taşınmıyor — gerçek neden ne
      // olursa olsun, barkod VE UTS'nin ikisi de boşsa parse zamanındaki
      // AYNI kuralla (bkz. parseCamEnvanterExcel: barkodOtomatikMu hesabı)
      // burada da otomatik atamaya izin veriyoruz; bayrağı burada da set
      // ediyoruz ki uygulaCamEnvanterImport içindeki generateNextTemsilciBarkod
      // yolu da doğru tetiklensin.
      const otomatikUygun = !s.barkod?.trim() && !s.utsKodu?.trim();
      if (otomatikUygun) s.barkodOtomatikMu = true;

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
