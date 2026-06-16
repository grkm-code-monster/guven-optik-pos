import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { Role } from '@prisma/client';
import * as pdksService from './pdks.service';

const router = Router();
router.use(authenticate);
router.use(authorize(Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN));

router.get('/personeller', async (req, res, next) => {
  try {
    const data = await pdksService.getPersoneller();
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/girisler', async (req, res, next) => {
  try {
    const data = await pdksService.getGirisler({
      baslangic: req.query.baslangic as string,
      bitis: req.query.bitis as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/konumlar', async (req, res, next) => {
  try {
    const data = await pdksService.getKonumlar();
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/user/:userId/girisler', async (req, res, next) => {
  try {
    const data = await pdksService.getUserGirisler(req.params.userId, {
      baslangic: req.query.baslangic as string,
      bitis: req.query.bitis as string,
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/puantaj', async (req, res, next) => {
  try {
    const data = await pdksService.getPuantaj({
      baslangic: req.query.baslangic as string,
      bitis: req.query.bitis as string,
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
