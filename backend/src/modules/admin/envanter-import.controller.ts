import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  buildEnvanterSablonBuffer,
  parseEnvanterExcel,
  previewEnvanterImport,
  type ParsedEnvanterRow,
} from './envanter-import.service';
import { uygulaEnvanterImport } from './envanter-import-uygula.service';

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
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Excel dosyası (file) zorunlu' });
      }

      const rows = await parseEnvanterExcel(req.file.buffer);
      if (!rows.length) {
        return res.status(400).json({ error: 'Excel dosyasında işlenecek satır yok' });
      }

      const onizleme = await previewEnvanterImport(rows);
      return res.json({ success: true, ...onizleme });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/uygula', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lokasyonKodu, satirlar } = req.body ?? {};

    if (!lokasyonKodu?.trim()) {
      return res.status(400).json({ error: 'lokasyonKodu zorunlu' });
    }
    if (!Array.isArray(satirlar) || satirlar.length === 0) {
      return res.status(400).json({ error: 'satirlar dizisi zorunlu' });
    }

    const parsed = satirlar as ParsedEnvanterRow[];
    for (const s of parsed) {
      if (!s.satirNo || !s.barkod?.trim()) {
        return res.status(400).json({ error: 'Her satırda satirNo ve barkod zorunlu' });
      }
    }

    const sonuc = await uygulaEnvanterImport({
      lokasyonKodu: String(lokasyonKodu),
      satirlar: parsed,
    });

    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

export default router;
