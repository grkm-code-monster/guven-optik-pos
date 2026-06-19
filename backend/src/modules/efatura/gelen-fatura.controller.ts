import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import {
  cekGelenFaturalar,
  getSutunEslestirme,
  listeleGelenFaturalar,
  onaylaUyumsoftAktarim,
  olusturUtsAlmaBildirimi,
  saveSutunEslestirme,
  urunGirisineAktar,
} from './gelen-fatura.service';

const router = Router();
router.use(authenticate);

router.get('/listele', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { durum, onlyUnread } = req.query;
    const data = await listeleGelenFaturalar({
      durum: typeof durum === 'string' ? durum : undefined,
      onlyUnread: onlyUnread === 'true',
    });
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/cek', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baslangic, bitis, onlyUnread, pageSize } = req.body ?? {};
    const sonuc = await cekGelenFaturalar({
      baslangic,
      bitis,
      onlyUnread: onlyUnread ?? true,
      pageSize,
    });
    const data = await listeleGelenFaturalar();
    return res.json({ ...sonuc, data });
  } catch (err) {
    next(err);
  }
});

router.get('/sutun-eslestirme', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tedarikciVkn, tedarikciAdi } = req.query;
    const sonuc = await getSutunEslestirme({
      tedarikciVkn: typeof tedarikciVkn === 'string' ? tedarikciVkn : undefined,
      tedarikciAdi: typeof tedarikciAdi === 'string' ? tedarikciAdi : undefined,
    });
    return res.json(sonuc);
  } catch (err) {
    next(err);
  }
});

router.put('/sutun-eslestirme', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tedarikciVkn, tedarikciAdi, kolonMap } = req.body ?? {};
    if (!kolonMap) {
      return res.status(400).json({ error: 'kolonMap zorunlu' });
    }
    await saveSutunEslestirme({ tedarikciVkn, tedarikciAdi, kolonMap });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/urun-girisine-aktar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hedefDepo } = req.body ?? {};
    const sonuc = await urunGirisineAktar(req.params.id, { hedefDepo });
    return res.json(sonuc);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/onayla-aktarim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await onaylaUyumsoftAktarim(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/uts-alma', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, kalemler, belgeNo, hemenGonder } = req.body ?? {};
    if (!branchId || !kalemler?.length) {
      return res.status(400).json({ error: 'branchId ve kalemler zorunlu' });
    }
    const sonuc = await olusturUtsAlmaBildirimi(req.params.id, {
      branchId,
      kalemler,
      belgeNo,
      hemenGonder,
    });
    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

export default router;
