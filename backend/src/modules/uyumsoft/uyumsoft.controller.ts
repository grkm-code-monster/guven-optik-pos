import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as uyumsoftService from './uyumsoft.service';

const router = Router();
router.use(authenticate);
router.use(authorize(Role.ADMIN));

router.get('/test', async (req, res, next) => {
  try {
    const result = await uyumsoftService.testConnection();
    return res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

router.get('/tarih', async (req, res, next) => {
  try {
    const tarih = await uyumsoftService.getSystemDate();
    return res.json({ success: true, tarih });
  } catch (err) {
    next(err);
  }
});

router.get('/efatura-kullanici/:vkn', async (req, res, next) => {
  try {
    const sonuc = await uyumsoftService.isEInvoiceUser(req.params.vkn);
    return res.json({ success: true, efaturaKullanicisi: sonuc });
  } catch (err) {
    next(err);
  }
});

export default router;
