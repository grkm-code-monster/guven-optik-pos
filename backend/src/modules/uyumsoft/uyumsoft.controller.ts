import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { getClient, USER_INFO, testConnection, getSystemDate, isEInvoiceUser, getUserAliasses } from './uyumsoft.service';

const router = Router();
router.use(authenticate);
router.use(authorize(Role.ADMIN));

router.get('/test', async (req, res, next) => {
  try {
    const result = await testConnection();
    return res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

router.get('/tarih', async (req, res, next) => {
  try {
    const tarih = await getSystemDate();
    return res.json({ success: true, tarih });
  } catch (err) {
    next(err);
  }
});

router.get('/efatura-kullanici/:vkn', async (req, res, next) => {
  try {
    const sonuc = await isEInvoiceUser(req.params.vkn);
    return res.json({ success: true, efaturaKullanicisi: sonuc });
  } catch (err) {
    next(err);
  }
});

router.get('/alias/:vkn', async (req, res, next) => {
  try {
    const result = await getUserAliasses(req.params.vkn);
    return res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

router.get('/whoami', async (req, res, next) => {
  try {
    const c = await getClient();
    const [result] = await c.WhoAmIAsync({ userInfo: USER_INFO });
    return res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

export default router;
