import { Router, type Request, type Response } from 'express';
import {
  etiketMerkeziAra,
  etiketMerkeziLokasyonlar,
  etiketMerkeziOkut,
  type EtiketMerkeziFiltre,
} from './etiket-merkezi.service';

/** 13.11.2026 — Etiket Merkezi (yalnız yönetim paneli; erişim ek-yetki.ts kuralıyla). */
const router = Router();

router.get('/lokasyonlar', async (_req: Request, res: Response) => {
  try {
    return res.json({ data: await etiketMerkeziLokasyonlar() });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Konumlar okunamadı' });
  }
});

router.post('/ara', async (req: Request, res: Response) => {
  try {
    const f = (req.body ?? {}) as EtiketMerkeziFiltre;
    return res.json(await etiketMerkeziAra(f));
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Arama yapılamadı' });
  }
});

router.post('/okut', async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const sonuc = await etiketMerkeziOkut(
      String(b.kod ?? ''),
      String(b.lokasyon ?? ''),
      Array.isArray(b.haricLotIds) ? b.haricLotIds.map(Number) : [],
      Array.isArray(b.haricQuantIds) ? b.haricQuantIds.map(Number) : [],
    );
    return res.json(sonuc);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Okutma çözülemedi' });
  }
});

export default router;
