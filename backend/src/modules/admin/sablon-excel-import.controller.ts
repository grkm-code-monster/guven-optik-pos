import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { SablonExcelKolonMap } from './sablon-excel-import.constants';
import {
  aktarSablonExcelImport,
  buildSablonExcelOrnekBuffer,
  dogrulaSablonExcelImport,
  parseSablonExcelUpload,
} from './sablon-excel-import.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/ornek-indir', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const buffer = await buildSablonExcelOrnekBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="urun-sablon-toplu-aktar-ornek.xlsx"');
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/yukle',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Excel dosyası (file) zorunlu' });
      }
      const parsed = await parseSablonExcelUpload(req.file.buffer);
      return res.json({ success: true, ...parsed });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/dogrula', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { satirlar, kolonMap } = req.body ?? {};
    if (!Array.isArray(satirlar) || !satirlar.length) {
      return res.status(400).json({ error: 'satirlar dizisi zorunlu' });
    }
    if (!kolonMap) {
      return res.status(400).json({ error: 'kolonMap zorunlu' });
    }
    const sonuc = await dogrulaSablonExcelImport(satirlar as string[][], kolonMap as SablonExcelKolonMap);
    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

router.post('/aktar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { satirlar, kolonMap } = req.body ?? {};
    if (!Array.isArray(satirlar) || !satirlar.length) {
      return res.status(400).json({ error: 'satirlar dizisi zorunlu' });
    }
    if (!kolonMap) {
      return res.status(400).json({ error: 'kolonMap zorunlu' });
    }
    const sonuc = await aktarSablonExcelImport(satirlar as string[][], kolonMap as SablonExcelKolonMap);
    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

export default router;
