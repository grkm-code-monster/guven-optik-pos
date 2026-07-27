import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  DEFAULT_SIRKET_ID,
  getClient,
  getCredentialsForSirket,
  testConnection,
  getSystemDate,
  isEInvoiceUser,
  getUserAliasses,
} from './uyumsoft.service';
import {
  getDespatchClient,
  verifyDespatchConnection,
} from '../efatura/uyumsoft-irsaliye.service';

const router = Router();
router.use(authenticate);
router.use(authorize(Role.ADMIN));

function resolveSirketId(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_SIRKET_ID;
}

router.get('/test', async (req, res, next) => {
  try {
    const sirketId = resolveSirketId(req.query.sirketId);
    const result = await testConnection(sirketId);
    return res.json({ success: true, sirketId, result });
  } catch (err) {
    next(err);
  }
});

router.get('/tarih', async (req, res, next) => {
  try {
    const sirketId = resolveSirketId(req.query.sirketId);
    const tarih = await getSystemDate(sirketId);
    return res.json({ success: true, sirketId, tarih });
  } catch (err) {
    next(err);
  }
});

router.get('/efatura-kullanici/:vkn', async (req, res, next) => {
  try {
    const sirketId = resolveSirketId(req.query.sirketId);
    const sonuc = await isEInvoiceUser(req.params.vkn, sirketId);
    return res.json({ success: true, sirketId, efaturaKullanicisi: sonuc });
  } catch (err) {
    next(err);
  }
});

router.get('/alias/:vkn', async (req, res, next) => {
  try {
    const sirketId = resolveSirketId(req.query.sirketId);
    const result = await getUserAliasses(req.params.vkn, sirketId);
    return res.json({ success: true, sirketId, result });
  } catch (err) {
    next(err);
  }
});

router.get('/whoami', async (req, res, next) => {
  try {
    const sirketId = resolveSirketId(req.query.sirketId);
    const creds = await getCredentialsForSirket(sirketId);
    const c = await getClient(sirketId);
    const [result] = await c.WhoAmIAsync({
      userInfo: {
        attributes: {
          Username: creds.username,
          Password: creds.password,
        },
      },
    });
    return res.json({ success: true, sirketId, username: creds.username, result });
  } catch (err) {
    next(err);
  }
});

router.get('/irsaliye-test/:sirketId', async (req, res, next) => {
  try {
    const sirketId = resolveSirketId(req.params.sirketId);
    await getDespatchClient(sirketId);
    const baglanti = await verifyDespatchConnection(sirketId);
    return res.json({
      success: true,
      sirketId,
      servis: 'DespatchIntegration',
      yontem: baglanti.yontem,
      tarih: baglanti.yontem === 'GetSystemDate' ? baglanti.deger : undefined,
      kullanici: baglanti.yontem === 'UserInfoWithNoCheck' ? baglanti.deger : undefined,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
