import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { generateZpl, type EtiketInput } from './etiket.service';

const router = Router();

router.use(authenticate);

router.post('/zpl', (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
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
