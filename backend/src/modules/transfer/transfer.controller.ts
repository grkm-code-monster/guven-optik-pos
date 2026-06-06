import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { isDevMockEnabled } from './transfer.mock';
import * as transferService from './transfer.service';

const router = Router();

router.use(authenticate);

function odooErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'faultString' in err) return String((err as { faultString: unknown }).faultString);
  return String(err);
}

function handleOdooFailure(res: Response, err: unknown) {
  const detail = odooErrMessage(err);
  console.error('[Odoo Hatası]', detail);
  if (isDevMockEnabled()) {
    return res.status(503).json({
      error: 'Odoo bağlantısı kurulamadı',
      detail,
      hint: 'NODE_ENV=development — mock verisi endpoint içinde döndürülür',
    });
  }
  return res.status(503).json({
    error: 'Odoo bağlantısı kurulamadı',
    detail,
  });
}

router.get('/urun-ara', async (req, res) => {
  try {
    const q = String(req.query.q ?? '');
    const yontem = String(req.query.yontem ?? 'barkod');
    const lokasyon = String(req.query.lokasyon ?? '');
    const kategori = typeof req.query.kategori === 'string' && req.query.kategori.trim() ? req.query.kategori.trim() : undefined;
    const kategoriIdRaw = req.query.kategoriId;
    let kategoriId: number | undefined;
    if (kategoriIdRaw != null && String(kategoriIdRaw).trim() !== '') {
      const n = Number(kategoriIdRaw);
      if (Number.isFinite(n) && n > 0) kategoriId = n;
    }
    const kategoriIdsRaw = req.query.kategoriIds
    let kategoriIds: number[] | undefined
    if (kategoriIdsRaw && typeof kategoriIdsRaw === 'string') {
      const parsed = kategoriIdsRaw.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
      if (parsed.length > 0) kategoriIds = parsed
    }
    const rows = await transferService.searchUrun(q, yontem, lokasyon, { kategori, kategoriId, kategoriIds });
    return res.status(200).json(rows);
  } catch (err) {
    return handleOdooFailure(res, err);
  }
});

router.get('/urun-ara-akilli', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const lokasyon = String(req.query.lokasyon ?? '')
    const sirketId = req.query.sirketId ? Number(req.query.sirketId) : undefined
    if (!q || !lokasyon) return res.json([])
    const { results, yontem } = await transferService.searchUrunAkilli(q, lokasyon, sirketId)
    res.json({ results, yontem })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/olustur', async (req, res) => {
  try {
    const result = await transferService.createTransfer(req.body);
    if (result && 'success' in result && result.success === false) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return handleOdooFailure(res, err);
  }
});

router.get('/bekleyen', async (req, res) => {
  try {
    const lokasyon = String(req.query.lokasyon ?? 'GVN1');
    const rows = await transferService.listBekleyen(lokasyon);
    return res.status(200).json(rows);
  } catch (err) {
    return handleOdooFailure(res, err);
  }
});

router.post('/kabul', async (req, res) => {
  try {
    const { transferId, sayimlar } = req.body ?? {};
    const result = await transferService.acceptTransfer(String(transferId ?? ''), sayimlar ?? []);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return handleOdooFailure(res, err);
  }
});

router.post('/sorun', async (req, res) => {
  try {
    const { transferId, not } = req.body ?? {};
    const result = await transferService.reportTransferIssue(String(transferId ?? ''), not ?? '');
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return handleOdooFailure(res, err);
  }
});

router.get('/debug/lokasyonlar', async (_req, res, next) => {
  try {
    const map = await transferService.debugLokasyonMap();
    return res.status(200).json(map);
  } catch (err) {
    next(err);
  }
});

export default router;
