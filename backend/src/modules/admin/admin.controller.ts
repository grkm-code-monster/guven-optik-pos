import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import axios from 'axios';
import { Prisma, Role, SaleStatus, ShiftStatus, SyncStatus } from '@prisma/client';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../../database/prisma';
import { authenticate } from '../../middleware/authenticate';
import { authorize, authorizeOrYetki } from '../../middleware/authorize';
import { resolveAdminRouteAccess } from './ek-yetki';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import {
  findExistingCategoryMatch,
  OdooCategoryMatchError,
  resolveOrCreateCategoryId,
} from '../odoo/odoo-category.util';
import { getAnaDepoLocationId, getCompanyIdFromLokasyon, LOKASYON_ID_MAP } from '../odoo/odooLocations';
import { ODOO_OPTIK_CAM_CATEGORY_IDS } from '../sales/sale-item-lab.util';
import { getOrCreateFaturasizCari } from '../odoo/faturasiz-cari.util';
import * as pdksService from '../pdks/pdks.service';
import * as stokYonetimi from './stok-yonetimi.service';
import * as stokExport from './stok-export.service';
import { buildUtsDuzeltmeSablonBuffer } from './envanter-uts-duzeltme-export.service';
import {
  ptavKey,
  temizleImportSonrasiVaryantlar,
} from './varyant-import-temizlik.service';
import * as bildirimService from '../bildirim/bildirim.service';
import {
  getOzelSiparisLoglari,
  getOzelSiparisStokGirisDetay,
  stokaAlOzelSiparis,
  updateOzelSiparisDurum,
  createOzelSiparis,
} from '../ozel-siparis/ozel-siparis.service';
import { olusturTransfer } from './transfer-olustur.service';
import { kabulEtTransfer } from '../transfer/transfer-core.service';
import { listTransferAksiyonLogs } from '../transfer/transfer-aksiyon-log.service';
import {
  bildirimOlusturVeGonder,
  extractUtsHataDetay,
  gondermeBildiriminiYap,
  resolveUtsSubeForSubeKodu,
  sirketIdToReferansSube,
  sorgulaAlmaBekleyenler,
  sorgulaBelgeNoIleAlmaBekleyenler,
  almakIstemiyorumOlarakIsaretle,
  bekleyenAlmaTopluBildir,
  listGonderilenUtsBildirimler,
  listUrunGirisiBekleyenler,
  markUtsUrunGirisiTamamlandi,
  testUtsSubeToken,
  urunGirisiBekleyenSayac,
} from '../uts/uts.service';
import envanterImportRouter from './envanter-import.controller';
import sablonExcelImportRouter from './sablon-excel-import.controller';
import deployRouter from './deploy.controller';
import { sendReportEmail } from '../mail/mail.service';
import { applyStockAdjustment } from './stock-adjustment.service';
import { getOrCreateStockLot, isLotAvailableForReceipt } from './stock-lot.service';
import { getOrFetchTodayRate } from './doviz-kuru.service';
import { syncPersonelSubeFromUserId, syncOdooEmployeeIdFromPersonel, syncOdooEmployeeIdFromUser, syncEkYetkilerFromPersonel } from './personel-sube-sync';
import { filterSecilebilirEkYetkiler } from './ek-yetki';

const ODOO_ALL_COMPANIES_KWARGS = {
  context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] },
};

const router = Router();

router.get('/public/personel-belge-form/:personelId', async (req, res, next) => {
  try {
    const personel = await prisma.personel.findUnique({
      where: { id: req.params.personelId },
      select: {
        id: true,
        ad: true,
        soyad: true,
        belgeler: {
          select: { tip: true, ad: true, onaylandi: true },
        },
      },
    });
    if (!personel) {
      return res.status(404).json({ error: 'Personel bulunamadı' });
    }
    return res.json({ success: true, data: personel });
  } catch (err) { next(err); }
});

router.post('/public/personel-belge-yukle/:personelId', async (req, res, next) => {
  try {
    const { tip, ad, base64, mimeType, notlar, dosyaAdi } = req.body;
    if (!tip || !ad || !base64) {
      return res.status(400).json({ error: 'tip, ad ve base64 zorunlu' });
    }
    const boyut = Math.floor((String(base64).length * 3) / 4);
    if (boyut > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Dosya 5MB'dan büyük olamaz" });
    }
    const personel = await prisma.personel.findUnique({
      where: { id: req.params.personelId },
      select: { id: true },
    });
    if (!personel) {
      return res.status(404).json({ error: 'Personel bulunamadı' });
    }
    const belge = await prisma.personelBelge.create({
      data: {
        personelId: req.params.personelId,
        tip,
        ad,
        dosyaAdi: dosyaAdi || ad,
        icerik: base64,
        mimeType: mimeType || 'application/octet-stream',
        boyut,
        yukleyenId: 'PUBLIC',
        notlar: notlar || null,
        onaylandi: false,
      },
    });
    return res.json({ success: true, id: belge.id });
  } catch (err) { next(err); }
});

// ── PERSONEL BİLGİ FORMU (CV) — public ────────────────────────────
const OZGECMIS_ALANLAR = [
  'tcKimlikNo', 'dogumTarihi', 'dogumYeri', 'cinsiyet', 'medeniDurum', 'uyruk', 'kanGrubu',
  'alternatifTelefon', 'ikametAdresi', 'il', 'ilce', 'postaKodu',
  'acilYakinlikDerecesi', 'acilAdSoyad', 'acilTelefon', 'acilAlternatifTelefon',
  'ehliyetSinifi', 'ehliyetVerilisTarihi', 'aktifAracKullaniyor',
  'askerlikDurumu', 'tecilTarihi', 'kisaOzgecmis',
  'sigaraKullaniyor', 'seyahatEngeliVar', 'vardiyaliCalisabilir',
  'kullanilanProgramlar', 'hobiler', 'digerAciklamalar',
  'egitimler', 'isDeneyimleri', 'yabanciDiller', 'bilgisayarBilgileri', 'referanslar',
] as const;

function ozgecmisVeriTemizle(body: Record<string, any>) {
  const data: Record<string, any> = {};
  for (const alan of OZGECMIS_ALANLAR) {
    if (body[alan] === undefined) continue;
    if (alan === 'dogumTarihi' || alan === 'ehliyetVerilisTarihi' || alan === 'tecilTarihi') {
      data[alan] = body[alan] ? new Date(body[alan]) : null;
    } else {
      data[alan] = body[alan];
    }
  }
  return data;
}

router.get('/public/personel-ozgecmis/:personelId', async (req, res, next) => {
  try {
    const personel = await prisma.personel.findUnique({
      where: { id: req.params.personelId },
      select: { id: true, ad: true, soyad: true, telefon: true, email: true },
    });
    if (!personel) return res.status(404).json({ error: 'Personel bulunamadı' });
    const [ozgecmis, sertifikalar] = await Promise.all([
      prisma.personelOzgecmis.findUnique({ where: { personelId: req.params.personelId } }),
      prisma.personelSertifika.findMany({
        where: { personelId: req.params.personelId },
        select: { id: true, ad: true, kurum: true, tarih: true, dosyaAdi: true, mimeType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return res.json({ success: true, data: { personel, ozgecmis, sertifikalar } });
  } catch (err) { next(err); }
});

router.post('/public/personel-ozgecmis/:personelId', async (req, res, next) => {
  try {
    const personel = await prisma.personel.findUnique({ where: { id: req.params.personelId }, select: { id: true } });
    if (!personel) return res.status(404).json({ error: 'Personel bulunamadı' });
    const data = ozgecmisVeriTemizle(req.body ?? {});
    const ozgecmis = await prisma.personelOzgecmis.upsert({
      where: { personelId: req.params.personelId },
      create: { personelId: req.params.personelId, ...data },
      update: data,
    });
    return res.json({ success: true, data: ozgecmis });
  } catch (err) { next(err); }
});

router.post('/public/personel-sertifika-yukle/:personelId', async (req, res, next) => {
  try {
    const { ad, kurum, tarih, base64, mimeType, dosyaAdi } = req.body ?? {};
    if (!ad) return res.status(400).json({ error: 'ad zorunlu' });
    const personel = await prisma.personel.findUnique({ where: { id: req.params.personelId }, select: { id: true } });
    if (!personel) return res.status(404).json({ error: 'Personel bulunamadı' });
    const sertifika = await prisma.personelSertifika.create({
      data: {
        personelId: req.params.personelId,
        ad,
        kurum: kurum || null,
        tarih: tarih ? new Date(tarih) : null,
        dosyaAdi: dosyaAdi || null,
        mimeType: mimeType || null,
        icerik: base64 || null,
      },
    });
    return res.json({ success: true, id: sertifika.id });
  } catch (err) { next(err); }
});

router.delete('/public/personel-sertifika/:sertifikaId', async (req, res, next) => {
  try {
    await prisma.personelSertifika.delete({ where: { id: req.params.sertifikaId } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ── BELGE KATEGORİLERİ — public (yalnızca aktif olanlar) ──────────
router.get('/public/belge-kategorileri', async (req, res, next) => {
  try {
    const kategoriler = await prisma.personelBelgeKategorisi.findMany({
      where: { aktif: true },
      orderBy: [{ grup: 'asc' }, { siraNo: 'asc' }],
    });
    return res.json({ success: true, data: kategoriler });
  } catch (err) { next(err); }
});

// ── SÖZLEŞMELER — public (personelin indir/imzala/yükle akışı) ────
router.get('/public/personel-sozlesmeler/:personelId', async (req, res, next) => {
  try {
    const sozlesmeler = await prisma.personelSozlesme.findMany({
      where: { personelId: req.params.personelId },
      select: {
        id: true, sablonAdi: true, sablonVersiyon: true, durum: true,
        indirilmeTarihi: true, yuklenmeTarihi: true, onayTarihi: true, aciklama: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: sozlesmeler });
  } catch (err) { next(err); }
});

router.get('/public/sozlesme-dosya/:sozlesmeId', async (req, res, next) => {
  try {
    const sozlesme = await prisma.personelSozlesme.findUnique({
      where: { id: req.params.sozlesmeId },
      include: { sablon: true },
    });
    if (!sozlesme) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!sozlesme.indirilmeTarihi) {
      await prisma.personelSozlesme.update({
        where: { id: sozlesme.id },
        data: { indirilmeTarihi: new Date() },
      });
    }
    return res.json({
      success: true,
      data: {
        dosyaAdi: sozlesme.sablon.dosyaAdi,
        mimeType: sozlesme.sablon.mimeType,
        icerik: sozlesme.sablon.icerik,
      },
    });
  } catch (err) { next(err); }
});

router.post('/public/personel-sozlesme-yukle/:sozlesmeId', async (req, res, next) => {
  try {
    const { base64, mimeType, dosyaAdi } = req.body ?? {};
    if (!base64) return res.status(400).json({ error: 'base64 zorunlu' });
    const sozlesme = await prisma.personelSozlesme.update({
      where: { id: req.params.sozlesmeId },
      data: {
        yuklenenIcerik: base64,
        yuklenenMimeType: mimeType || 'application/octet-stream',
        yuklenenDosyaAdi: dosyaAdi || 'sozlesme.pdf',
        durum: 'YUKLENDI',
        yuklenmeTarihi: new Date(),
      },
    });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: sozlesme.personelId,
        sozlesmeId: sozlesme.id,
        islem: 'YUKLENDI',
        yapanId: 'PUBLIC',
        aciklama: `Sözleşme yüklendi: ${sozlesme.sablonAdi}`,
      },
    });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

router.use(authenticate);

router.get('/campaigns/branch/:branchId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId } = req.params;
    const now = new Date();
    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      include: {
        branchOverrides: { where: { branchId } },
      },
      orderBy: [{ priority: 'asc' }],
    });
    const result = campaigns
      .map((c) => {
        const ov = c.branchOverrides[0];
        if (!ov) return { ...c, branchOverrides: undefined };
        if (ov.isActive === false) return null;
        return {
          ...c,
          isActive: ov.isActive ?? c.isActive,
          discountPct: ov.discountPct ?? c.discountPct,
          discountTL: ov.discountTL ?? c.discountTL,
          startDate: ov.startDate ?? c.startDate,
          endDate: ov.endDate ?? c.endDate,
          autoApply: ov.autoApply ?? c.autoApply,
          branchOverrides: undefined,
        };
      })
      .filter(Boolean);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/prim-kazanimlar',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req, res) => {
    try {
      const { personelId, odendi, baslangic } = req.query
      const where: Prisma.PrimKazanimWhereInput = {}
      if (personelId) where.personelId = String(personelId)
      if (odendi !== undefined) where.odendi = odendi === 'true'
      if (baslangic) where.donemBaslangic = { gte: new Date(String(baslangic)) }
      const kazanimlar = await prisma.primKazanim.findMany({
        where,
        orderBy: { donemBaslangic: 'desc' },
        include: { personel: true, primKural: true },
        take: 200,
      })
      return res.json({ data: kazanimlar })
    } catch (err: any) {
      return res.status(500).json({ error: err?.message })
    }
  },
)

// Personel listesi — personel kendi kaydını da görebilir (Dashboard Profilim)
router.get(
  '/personeller',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subeId, sirketId, aktif } = req.query;
      const where: Prisma.PersonelWhereInput = {};
      if (req.user!.role !== Role.ADMIN) {
        where.userId = req.user!.userId;
      } else {
        if (subeId) where.subeId = String(subeId);
        if (sirketId) where.sirketId = Number(sirketId);
        if (aktif === 'hepsi') {
          // tüm personeller (aktif + pasif)
        } else if (aktif !== undefined) where.aktif = aktif === 'true';
        else where.aktif = true;
      }
      const personeller = await prisma.personel.findMany({
        where,
        orderBy: [{ subeAdi: 'asc' }, { ad: 'asc' }],
      });
      return res.json({ data: personeller });
    } catch (err) {
      next(err);
    }
  },
);

async function assertPersonelBelgeAccess(req: Request, personelId: string): Promise<boolean> {
  if (req.user!.role === Role.ADMIN) return true;
  const personel = await prisma.personel.findUnique({ where: { id: personelId } });
  return personel?.userId === req.user!.userId;
}

// Belge listesi + yükleme — personel kendi belgelerini görebilir/yükleyebilir
router.get(
  '/personel/:id/belgeler',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await assertPersonelBelgeAccess(req, req.params.id))) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu personel kaydına erişim yok.' });
      }
      const belgeler = await prisma.personelBelge.findMany({
        where: { personelId: req.params.id },
        select: {
          id: true,
          tip: true,
          ad: true,
          dosyaAdi: true,
          mimeType: true,
          boyut: true,
          onaylandi: true,
          durum: true,
          versiyon: true,
          onayTarihi: true,
          notlar: true,
          createdAt: true,
          yukleyenId: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ data: belgeler });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/personel/:id/belge-yukle',
  authorize(Role.SALES_STAFF, Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await assertPersonelBelgeAccess(req, req.params.id))) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu personel kaydına erişim yok.' });
      }
      const { tip, ad, dosyaAdi, icerik, mimeType, boyut, notlar } = req.body;
      if (!tip || !ad || !dosyaAdi || !icerik || !mimeType) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'tip, ad, dosyaAdi, icerik, mimeType zorunlu',
        });
      }
      const boyutNum = Number(boyut) || 0;
      if (boyutNum > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'FILE_TOO_LARGE', message: "Dosya 5MB'dan büyük olamaz" });
      }
      const belge = await prisma.personelBelge.create({
        data: {
          personelId: req.params.id,
          tip,
          ad,
          dosyaAdi,
          icerik,
          mimeType,
          boyut: boyutNum,
          yukleyenId: req.user!.userId,
          notlar: notlar || null,
        },
      });
      const { icerik: _icerik, ...belgeSafe } = belge;
      return res.json({ success: true, data: belgeSafe });
    } catch (err) {
      next(err);
    }
  },
);

// Görevli & vekalet — dashboard erişimi (ADMIN middleware öncesi)
router.get('/gorevli/bugun', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.user!.branchId;
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        yedekSorumluId: true,
        yedekSorumlu: { select: { id: true, name: true, role: true } },
      },
    });

    const gorevli = await prisma.gorevli.findFirst({
      where: {
        branchId,
        tarih: bugun,
        aktif: true,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (gorevli) {
      return res.json({
        tip: 'GUNLUK',
        user: gorevli.user,
        baslangic: gorevli.baslangic,
        bitis: gorevli.bitis,
        notlar: gorevli.notlar,
        yedekSorumlu: branch?.yedekSorumlu ?? null,
      });
    }

    if (branch?.yedekSorumlu) {
      return res.json({
        tip: 'YEDEK',
        user: branch.yedekSorumlu,
        yedekSorumlu: branch.yedekSorumlu,
      });
    }

    return res.json({ tip: 'YOK', user: null, yedekSorumlu: null });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/gorevli/ata',
  authorize(Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, tarih, baslangic, bitis, notlar } = req.body;
      const branchId = req.user!.branchId;

      if (!userId || !tarih) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'userId ve tarih zorunlu',
        });
      }

      const tarihDate = new Date(tarih);
      tarihDate.setHours(0, 0, 0, 0);

      await prisma.gorevli.updateMany({
        where: { branchId, tarih: tarihDate, aktif: true },
        data: { aktif: false },
      });

      const gorevli = await prisma.gorevli.create({
        data: {
          branchId,
          userId,
          atayaUserId: req.user!.userId,
          tarih: tarihDate,
          baslangic: baslangic || null,
          bitis: bitis || null,
          notlar: notlar || null,
        },
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
      });

      return res.json({ success: true, data: gorevli });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/branch/:branchId/personeller',
  authorize(Role.STORE_MANAGER, Role.REGIONAL_MANAGER, Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { branchId } = req.params;
      if (
        req.user!.role === Role.STORE_MANAGER &&
        req.user!.branchId !== branchId
      ) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu şubeye erişim yok.' });
      }
      const users = await prisma.user.findMany({
        where: {
          branchId,
          isActive: true,
        },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      });
      return res.json({ data: users });
    } catch (err) {
      next(err);
    }
  },
);

router.use((req: Request, res: Response, next: NextFunction) => {
  const { yetkiler, roles } = resolveAdminRouteAccess(req.path);
  return authorizeOrYetki(yetkiler, ...roles)(req, res, next);
});

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

function handleAdminError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;

  if (code === 'USER_USERNAME_EXISTS') {
    res.status(409).json({ error: 'USER_USERNAME_EXISTS', message: 'Bu kullanıcı adı zaten kayıtlı.' });
    return true;
  }
  if (code === 'BANK_NOT_FOUND') {
    res.status(404).json({ error: 'BANK_NOT_FOUND', message: 'Banka bulunamadı.' });
    return true;
  }
  if (code === 'RATE_NOT_FOUND') {
    res.status(404).json({ error: 'RATE_NOT_FOUND', message: 'Oran bulunamadı.' });
    return true;
  }
  if (code === 'USER_NOT_FOUND') {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return true;
  }
  if (code === 'SALE_NOT_FOUND') {
    res.status(404).json({ error: 'SALE_NOT_FOUND', message: 'Satış bulunamadı.' });
    return true;
  }
  return false;
}

// BANKA YÖNETİMİ
router.get('/banks', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const banks = await prisma.bank.findMany({
      include: { posDevices: true, rates: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(banks);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.post('/banks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const bank = await prisma.bank.create({ data: { name, isActive: true } });
    return res.status(200).json(bank);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.post('/banks/:id/pos-devices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bankId = req.params.id;
    const bank = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!bank) throw codeError('BANK_NOT_FOUND', 'Banka bulunamadı.');

    const name = String(req.body?.name ?? '').trim();
    const branchId = String(req.body?.branchId ?? '').trim();
    if (!name || !branchId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }

    const pos = await prisma.posDevice.create({
      data: { bankId, branchId, name, isActive: true },
    });
    return res.status(200).json(pos);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.post('/banks/:id/rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bankId = req.params.id;
    const bank = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!bank) throw codeError('BANK_NOT_FOUND', 'Banka bulunamadı.');

    const installment = Number(req.body?.installment);
    const commissionRate = String(req.body?.commissionRate ?? '').trim();
    const startDate = String(req.body?.startDate ?? '').trim();
    const endDate = req.body?.endDate ? String(req.body.endDate).trim() : undefined;
    if (!installment || !commissionRate || !startDate) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }

    const rate = await prisma.installmentRate.create({
      data: {
        bankId,
        installment,
        commissionRate: new Prisma.Decimal(commissionRate),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
    return res.status(200).json(rate);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.put('/banks/:id/rates/:rateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bankId = req.params.id;
    const rateId = req.params.rateId;

    const existing = await prisma.installmentRate.findUnique({ where: { id: rateId } });
    if (!existing || existing.bankId !== bankId) throw codeError('RATE_NOT_FOUND', 'Oran bulunamadı.');

    const installment = req.body?.installment !== undefined ? Number(req.body.installment) : undefined;
    const commissionRate = req.body?.commissionRate !== undefined ? String(req.body.commissionRate).trim() : undefined;
    const startDate = req.body?.startDate !== undefined ? String(req.body.startDate).trim() : undefined;
    const endDate = req.body?.endDate !== undefined ? String(req.body.endDate).trim() : undefined;

    const updated = await prisma.installmentRate.update({
      where: { id: rateId },
      data: {
        installment: installment ?? undefined,
        commissionRate: commissionRate ? new Prisma.Decimal(commissionRate) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
    return res.status(200).json(updated);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

// KULLANICI YÖNETİMİ
router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        branchId: true,
        isActive: true,
        canWorkAtolye: true,
        createdAt: true,
        personelId: true,
        odooEmployeeId: true,
        personel: {
          select: {
            id: true,
            ad: true,
            soyad: true,
            pozisyon: true,
            subeId: true,
            aylikHedef: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json(users);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const pin = String(req.body?.pin ?? '');
    const role = req.body?.role as Role | undefined;
    const branchId = String(req.body?.branchId ?? '').trim();
    const personelId = req.body?.personelId ?? null;
    const odooEmployeeId = req.body?.odooEmployeeId ? Number(req.body.odooEmployeeId) : null;
    const canWorkAtolye = req.body?.canWorkAtolye === true;
    if (!name || !username || !pin || !role || !branchId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) throw codeError('USER_USERNAME_EXISTS', 'Bu kullanıcı adı zaten kayıtlı.');

    const pinHash = await bcrypt.hash(pin, 10);

    const user = await prisma.user.create({
      data: { name, username, pin: pinHash, role, branchId, isActive: true, personelId, odooEmployeeId, canWorkAtolye },
    });

    return res.status(200).json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      isActive: user.isActive,
      canWorkAtolye: user.canWorkAtolye,
      createdAt: user.createdAt,
    });
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.put('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw codeError('USER_NOT_FOUND', 'Kullanıcı bulunamadı.');

    const data: any = {};
    if (req.body?.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body?.username !== undefined) data.username = String(req.body.username).trim().toLowerCase();
    if (req.body?.role !== undefined) data.role = req.body.role as Role;
    if (req.body?.branchId !== undefined) data.branchId = String(req.body.branchId).trim();
    if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body?.pin !== undefined) {
      const pinHash = await bcrypt.hash(String(req.body.pin), 10);
      data.pin = pinHash;
    }
    if (req.body?.personelId !== undefined) data.personelId = req.body.personelId || null;
    if (req.body?.odooEmployeeId !== undefined) {
      data.odooEmployeeId = req.body.odooEmployeeId ? Number(req.body.odooEmployeeId) : null;
    }
    if (req.body?.canWorkAtolye !== undefined) {
      data.canWorkAtolye = Boolean(req.body.canWorkAtolye);
    }

    if (data.username && data.username !== existing.username) {
      const u = await prisma.user.findUnique({ where: { username: data.username } });
      if (u) throw codeError('USER_USERNAME_EXISTS', 'Bu kullanıcı adı zaten kayıtlı.');
    }

    const user = await prisma.user.update({ where: { id }, data });

    return res.status(200).json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      isActive: user.isActive,
      canWorkAtolye: user.canWorkAtolye,
      createdAt: user.createdAt,
    });
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.post('/users/:id/link-employee', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.id;
    const odooEmployeeId = Number(req.body?.odooEmployeeId);

    if (!odooEmployeeId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'odooEmployeeId zorunlu',
      });
    }

    const employees = await execute(
      'hr.employee',
      'search_read',
      [[['id', '=', odooEmployeeId]]],
      { fields: ['id', 'name', 'job_id', 'department_id', 'job_title', 'company_id'] },
    );

    if (!employees?.length) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Odoo çalışanı bulunamadı',
      });
    }

    const emp = employees[0];
    const { personelSynced } = await syncOdooEmployeeIdFromUser(userId, odooEmployeeId);

    const updated = await prisma.user.findUnique({ where: { id: userId } });

    return res.json({
      success: true,
      user: updated,
      odooEmployee: emp,
      personelLinked: personelSynced,
    });
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.get('/odoo-employees', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await execute(
      'hr.employee',
      'search_read',
      [[['active', '=', true]]],
      {
        fields: ['id', 'name', 'job_id', 'department_id', 'job_title', 'company_id'],
        limit: 100,
      },
    );
    return res.json({ data: employees });
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.patch('/users/:id/deactivate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw codeError('USER_NOT_FOUND', 'Kullanıcı bulunamadı.');

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return res.status(200).json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

// SYNC YÖNETİMİ
router.get('/sync-logs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.status(200).json(logs);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.get('/sync-errors', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { syncStatus: { in: [SyncStatus.ERROR, SyncStatus.CONFLICT] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.status(200).json(sales);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.post('/sync-retry/:saleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const saleId = req.params.saleId;
    const existing = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!existing) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');

    const sale = await prisma.sale.update({
      where: { id: saleId },
      data: { syncStatus: SyncStatus.PENDING },
    });
    return res.status(200).json(sale);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.post('/sync-override/:saleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const saleId = req.params.saleId;
    const existing = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!existing) throw codeError('SALE_NOT_FOUND', 'Satış bulunamadı.');

    const sale = await prisma.sale.update({
      where: { id: saleId },
      data: { syncStatus: SyncStatus.SYNCED },
    });
    return res.status(200).json(sale);
  } catch (err) {
    if (handleAdminError(err, res)) return;
    next(err);
  }
});

router.get('/branch-list', async (req: Request, res: Response) => {
  try {
    const tumu = req.query.tumu === '1' || req.query.tumu === 'true'
    const branches = await prisma.branch.findMany({
      where: tumu ? {} : { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        hasAtolye: true,
        sirketId: true,
        sirketAdi: true,
        vkn: true,
        odooLocationId: true,
        pdksPlaceId: true,
        adres: true,
        il: true,
        ilce: true,
        telefon: true,
        yedekSorumluId: true,
      },
      orderBy: { code: 'asc' },
    });
    return res.json({ success: true, data: branches });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Şube oluştur
router.post('/branch', authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const { name, code, sirketId, sirketAdi, vkn,
      odooLocationId, pdksPlaceId, adres, il, ilce, telefon, hasAtolye } = req.body;
    if (!name?.trim() || !code?.trim()) {
      return res.status(400).json({ error: 'name ve code zorunlu' });
    }
    const branch = await prisma.branch.create({
      data: {
        name: name.trim(), code: code.trim().toUpperCase(),
        isActive: true,
        hasAtolye: Boolean(hasAtolye),
        sirketId: sirketId ? Number(sirketId) : null,
        sirketAdi: sirketAdi || null, vkn: vkn || null,
        odooLocationId: odooLocationId ? Number(odooLocationId) : null,
        pdksPlaceId: pdksPlaceId ? Number(pdksPlaceId) : null,
        adres: adres || null,
        il: il?.trim() || null,
        ilce: ilce?.trim() || null,
        telefon: telefon || null,
      },
    });
    return res.json({ success: true, data: branch });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: 'Bu kod zaten kayıtlı' });
    }
    next(err);
  }
});

// Şube güncelle
router.put('/branch/:id', authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const data: any = {};
    const strFields = ['name', 'sirketAdi', 'vkn', 'adres', 'il', 'ilce', 'telefon'];
    const numFields = ['sirketId', 'odooLocationId', 'pdksPlaceId'];
    for (const f of strFields) {
      if (req.body[f] !== undefined) data[f] = req.body[f] || null;
    }
    for (const f of numFields) {
      if (req.body[f] !== undefined) data[f] = req.body[f] ? Number(req.body[f]) : null;
    }
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.hasAtolye !== undefined) data.hasAtolye = Boolean(req.body.hasAtolye);
    const branch = await prisma.branch.update({ where: { id: req.params.id }, data });
    return res.json({ success: true, data: branch });
  } catch (err) { next(err); }
});

// PDKS places
router.get('/pdks-places', authenticate, authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const r = await axios.get(
      `https://app.patronpdks.com/api/v4/organizations/${process.env.PDKS_ORG_ID}/places`,
      { headers: { Token: process.env.PDKS_TOKEN, 'Content-Type': 'application/json; charset=UTF-8', 'Accept-Language': 'tr' } },
    );
    return res.json({ success: true, data: r.data?.data ?? [] });
  } catch (err) { next(err); }
});

router.patch('/branch/:branchId/yedek-sorumlu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { yedekSorumluId } = req.body;
    const branch = await prisma.branch.update({
      where: { id: req.params.branchId },
      data: { yedekSorumluId: yedekSorumluId || null },
      select: {
        id: true,
        name: true,
        code: true,
        yedekSorumluId: true,
        yedekSorumlu: { select: { id: true, name: true, role: true } },
      },
    });
    return res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
});

// Odoo'dan şubeleri çek (POS stok sorgu — tüm şubeler)
router.get('/branches', async (_req: Request, res: Response) => {
  try {
    const dbBranches = await prisma.branch.findMany({
      where: { odooLocationId: { not: null } },
      select: { name: true, code: true, odooLocationId: true },
      orderBy: { name: 'asc' },
    });

    // NOT: Önceden sadece bilinen ID'ler (LOKASYON_ID_MAP + zaten bağlı şubeler)
    // sorgulanıyordu — Odoo'da yeni oluşturulan bir lokasyon (henüz kod/DB'ye
    // eklenmemiş) hiçbir zaman bu listede görünmüyordu. Artık Odoo'daki TÜM
    // aktif iç lokasyonlar çekiliyor, yeni bir şube lokasyonu Odoo'da
    // oluşturulduğu an otomatik olarak burada seçilebilir hale geliyor.
    const odooLocations = (await execute(
      'stock.location',
      'search_read',
      [[['usage', '=', 'internal'], ['active', '=', true]]],
      { fields: ['id', 'name', 'complete_name', 'company_id'], limit: 300, ...ODOO_ALL_COMPANIES_KWARGS },
    )) as Array<{ id: number; name: string; complete_name?: string; company_id?: [number, string] }>;

    const byId = new Map(odooLocations.map((loc) => [loc.id, loc]));
    for (const b of dbBranches) {
      if (b.odooLocationId && !byId.has(b.odooLocationId)) {
        byId.set(b.odooLocationId, {
          id: b.odooLocationId,
          name: b.name,
          complete_name: b.code ? `${b.code} — ${b.name}` : b.name,
        });
      }
    }

    const data = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stock', async (req: Request, res: Response) => {
  try {
    const { locationId, search } = req.query;
    const inStockOnly = req.query.inStockOnly !== '0';

    const domain: any[] = [['location_id.usage', '=', 'internal']];

    if (inStockOnly) {
      domain.push(['quantity', '>', 0]);
    }
    if (locationId) {
      domain.push(['location_id', '=', Number(locationId)]);
    }

    const searchTerm = search ? String(search).trim() : '';
    if (searchTerm) {
      // Ürün adı + model (default_code) + nitelik/varyant değeri (ör. "C1", renk kodu)
      // hepsini kapsayan tek arama kutusu. Nitelik eşleşmesi için önce eşleşen
      // product.template.attribute.value id'lerini bulup, o değerlere sahip
      // varyantların id'lerini domain'e ekliyoruz.
      const ptavs = (await execute(
        'product.template.attribute.value',
        'search_read',
        [[['name', 'ilike', searchTerm]]],
        { fields: ['id'], limit: 200, ...ODOO_ALL_COMPANIES_KWARGS },
      )) ?? [];
      const ptavIds = ptavs.map((p: { id: number }) => p.id).filter(Boolean);
      let ptavProductIds: number[] = [];
      if (ptavIds.length) {
        const prods = (await execute(
          'product.product',
          'search_read',
          [[['product_template_attribute_value_ids', 'in', ptavIds]]],
          { fields: ['id'], limit: 3000, ...ODOO_ALL_COMPANIES_KWARGS },
        )) ?? [];
        ptavProductIds = prods.map((p: { id: number }) => p.id);
      }
      domain.push(
        '|', '|',
        ['product_id.name', 'ilike', searchTerm],
        ['product_id.default_code', 'ilike', searchTerm],
        ['product_id', 'in', ptavProductIds.length ? ptavProductIds : [-1]],
      );
    }

    const quants = (await execute(
      'stock.quant',
      'search_read',
      [domain],
      {
        fields: ['id', 'product_id', 'location_id', 'quantity', 'reserved_quantity', 'product_categ_id', 'lot_id'],
        limit: 3000,
        order: 'product_id asc',
        ...ODOO_ALL_COMPANIES_KWARGS,
      },
    )) ?? [];

    const lotIds = [
      ...new Set(
        quants
          .map((q: { lot_id?: [number, string] | false }) => (Array.isArray(q.lot_id) ? q.lot_id[0] : null))
          .filter((id: number | null): id is number => id != null),
      ),
    ];
    const lotMap = new Map<number, { name: string; utsKodu?: string }>();
    if (lotIds.length) {
      const lots = (await execute(
        'stock.lot',
        'read',
        [lotIds],
        { fields: ['id', 'name', 'x_uts_kodu'] },
      )) ?? [];
      for (const l of lots as Array<{ id: number; name?: string; x_uts_kodu?: string }>) {
        lotMap.set(l.id, { name: l.name || '', utsKodu: l.x_uts_kodu || undefined });
      }
    }

    type Loc = {
      quantId: number;
      locationId: number | null;
      locationName: string;
      quantity: number;
      reservedQuantity: number;
      lotNo?: string;
      utsKodu?: string;
    };
    type Grp = {
      productId: number;
      productName: string;
      categName: string | null;
      totalQuantity: number;
      totalReserved: number;
      locations: Loc[];
    };
    const groups = new Map<number, Grp>();
    for (const q of quants as Array<{
      id: number;
      product_id: [number, string] | false;
      location_id: [number, string] | false;
      quantity: number;
      reserved_quantity: number;
      product_categ_id?: [number, string] | false;
      lot_id?: [number, string] | false;
    }>) {
      if (!Array.isArray(q.product_id)) continue;
      const pid = q.product_id[0];
      if (!groups.has(pid)) {
        groups.set(pid, {
          productId: pid,
          productName: q.product_id[1],
          categName: Array.isArray(q.product_categ_id) ? q.product_categ_id[1] : null,
          totalQuantity: 0,
          totalReserved: 0,
          locations: [],
        });
      }
      const g = groups.get(pid)!;
      const qty = Number(q.quantity) || 0;
      const reserved = Number(q.reserved_quantity) || 0;
      g.totalQuantity += qty;
      g.totalReserved += reserved;
      const lotId = Array.isArray(q.lot_id) ? q.lot_id[0] : null;
      const lotInfo = lotId != null ? lotMap.get(lotId) : undefined;
      g.locations.push({
        quantId: q.id,
        locationId: Array.isArray(q.location_id) ? q.location_id[0] : null,
        locationName: Array.isArray(q.location_id) ? q.location_id[1] : '—',
        quantity: qty,
        reservedQuantity: reserved,
        lotNo: lotInfo?.name || undefined,
        utsKodu: lotInfo?.utsKodu,
      });
    }

    const data = Array.from(groups.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);

    return res.json({ success: true, data, truncated: quants.length >= 3000 });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
router.post('/stock-adjustment', async (req: Request, res: Response) => {
  try {
    const { productId, locationCode, qty, quantId } = req.body ?? {};
    const result = await applyStockAdjustment({
      productId: Number(productId),
      locationCode: String(locationCode ?? ''),
      qty: Number(qty),
      quantId: quantId != null && quantId !== '' ? Number(quantId) : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const msg = odooErrText(err);
    console.error('[stock-adjustment hata]', msg);
    return res.status(400).json({ success: false, error: msg });
  }
});

// Odoo'dan kullanıcıları çek
router.get('/odoo-users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await execute(
      'res.users',
      'search_read',
      [[['active', '=', true]]],
      { fields: ['id', 'name', 'login', 'email', 'company_id'], limit: 100 },
    );
    return res.json({ success: true, data: users });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POS + Odoo'ya birlikte kullanıcı ekle
router.post('/users-sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, username, pin, role, branchId, email } = req.body;
    if (!name || !username || !pin || !role) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
    }

    const existing = await prisma.user.findUnique({
      where: { username: String(username).trim().toLowerCase() },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Bu kullanıcı adı zaten kayıtlı.' });
    }

    const hashedPin = await bcrypt.hash(String(pin), 10);
    const posUser = await prisma.user.create({
      data: {
        name: String(name).trim(),
        username: String(username).trim().toLowerCase(),
        pin: hashedPin,
        role: role as Role,
        branchId: String(branchId ?? '').trim(),
        isActive: true,
      },
    });

    try {
      const odooUserId = await execute('res.users', 'create', [
        {
          name: String(name).trim(),
          login: email || username,
          email: email || `${username}@guvenoptik.com`,
          password: String(pin),
          company_id: 1,
        },
      ]);
      console.log('[Admin] Odoo kullanıcı oluşturuldu:', odooUserId);
    } catch (odooErr) {
      console.error('[Admin] Odoo kullanıcı hatası:', odooErr);
    }

    return res.json({
      success: true,
      data: {
        id: posUser.id,
        name: posUser.name,
        username: posUser.username,
        role: posUser.role,
        branchId: posUser.branchId,
        isActive: posUser.isActive,
        createdAt: posUser.createdAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Odoo personel listesi
router.get('/employees', async (_req: Request, res: Response) => {
  try {
    const employees = await execute(
      'hr.employee',
      'search_read',
      [[['active', '=', true]]],
      {
        fields: [
          'id',
          'name',
          'work_email',
          'mobile_phone',
          'job_title',
          'department_id',
          'company_id',
          'ssnid',
          'birthday',
        ],
        limit: 200,
      },
    );
    return res.json({ success: true, data: employees });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Odoo departmanları
router.get('/departments', async (_req: Request, res: Response) => {
  try {
    const departments = await execute(
      'hr.department',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'company_id'], limit: 100 },
    );
    return res.json({ success: true, data: departments });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Personel oluştur (Odoo + POS)
router.post('/employees', async (req: Request, res: Response) => {
  try {
    const {
      name,
      workEmail,
      mobilePhone,
      jobTitle,
      departmentId,
      companyId,
      tcKimlik,
      dogumTarihi,
      username,
      pin,
      role,
      branchId,
    } = req.body;

    if (!name) return res.status(400).json({ success: false, error: 'Ad zorunlu' });

    const employeeId = await execute('hr.employee', 'create', [
      {
        name: String(name).trim(),
        work_email: workEmail || '',
        mobile_phone: mobilePhone || '',
        job_title: jobTitle || '',
        department_id: departmentId || false,
        company_id: companyId || 1,
        ssnid: tcKimlik || '',
        birthday: dogumTarihi || false,
      },
    ]);

    let posUser = null;
    if (username && pin) {
      const hashedPin = await bcrypt.hash(String(pin), 10);
      posUser = await prisma.user.create({
        data: {
          name: String(name).trim(),
          username: String(username).trim().toLowerCase(),
          pin: hashedPin,
          role: (role as Role) || Role.SALES_STAFF,
          branchId: String(branchId ?? '').trim(),
          isActive: true,
        },
      });
    }

    return res.json({ success: true, data: { employeeId, posUser } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function serializeCampaign(row: {
  discountPct: Prisma.Decimal | null;
  discountTL: Prisma.Decimal | null;
  minBasket: Prisma.Decimal | null;
  formulMultiplier: Prisma.Decimal | null;
  formulExtra: Prisma.Decimal | null;
  formulMargin: Prisma.Decimal | null;
  branchOverrides?: Array<{
    discountPct: Prisma.Decimal | null;
    discountTL: Prisma.Decimal | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}) {
  const mapDec = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
  return {
    ...row,
    discountPct: mapDec(row.discountPct),
    discountTL: mapDec(row.discountTL),
    minBasket: mapDec(row.minBasket),
    formulMultiplier: mapDec(row.formulMultiplier),
    formulExtra: mapDec(row.formulExtra),
    formulMargin: mapDec(row.formulMargin),
    branchOverrides: row.branchOverrides?.map((o) => ({
      ...o,
      discountPct: mapDec(o.discountPct),
      discountTL: mapDec(o.discountTL),
    })),
  };
}

router.get('/campaigns', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.campaign.findMany({
      include: { branchOverrides: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return res.json({ success: true, data: rows.map(serializeCampaign) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const row = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { branchOverrides: true },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });
    return res.json({ success: true, data: serializeCampaign(row) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/campaigns', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const name = String(body.name ?? '').trim();
    const type = String(body.type ?? 'KASA').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Kampanya adı zorunlu' });

    const overrides = Array.isArray(body.branchOverrides) ? body.branchOverrides : [];
    const row = await prisma.campaign.create({
      data: {
        name,
        description: body.description ? String(body.description).trim() : null,
        type: type as any,
        scope: (body.scope as any) || 'ALL',
        scopeValue: body.scopeValue ? String(body.scopeValue) : null,
        discountPct: numOrNull(body.discountPct),
        discountTL: numOrNull(body.discountTL),
        minBasket: numOrNull(body.minBasket),
        minQty: intOrNull(body.minQty) ?? 0,
        formulMultiplier: numOrNull(body.formulMultiplier),
        formulExtra: numOrNull(body.formulExtra),
        formulMargin: numOrNull(body.formulMargin),
        comboConfig: body.comboConfig ?? null,
        startDate: dateOrNull(body.startDate),
        endDate: dateOrNull(body.endDate),
        priority: intOrNull(body.priority) ?? 10,
        autoApply: body.autoApply !== false,
        manualAlso: !!body.manualAlso,
        oodooPricelistId: intOrNull(body.oodooPricelistId),
        isActive: body.isActive !== false,
        branchOverrides: {
          create: overrides.map((o: any) => ({
            branchId: String(o.branchId ?? ''),
            branchCode: String(o.branchCode ?? ''),
            isActive: o.isActive == null ? null : !!o.isActive,
            discountPct: numOrNull(o.discountPct),
            discountTL: numOrNull(o.discountTL),
            startDate: dateOrNull(o.startDate),
            endDate: dateOrNull(o.endDate),
            autoApply: o.autoApply == null ? null : !!o.autoApply,
          })),
        },
      },
      include: { branchOverrides: true },
    });
    return res.json({ success: true, data: serializeCampaign(row) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });

    const body = req.body ?? {};
    const overrides = Array.isArray(body.branchOverrides) ? body.branchOverrides : null;

    const row = await prisma.$transaction(async (tx) => {
      if (overrides) {
        await tx.campaignBranchOverride.deleteMany({ where: { campaignId: id } });
      }
      return tx.campaign.update({
        where: { id },
        data: {
          name: body.name != null ? String(body.name).trim() : undefined,
          description: body.description !== undefined ? (body.description ? String(body.description).trim() : null) : undefined,
          type: body.type != null ? (String(body.type) as any) : undefined,
          scope: body.scope != null ? (body.scope as any) : undefined,
          scopeValue: body.scopeValue !== undefined ? (body.scopeValue ? String(body.scopeValue) : null) : undefined,
          discountPct: body.discountPct !== undefined ? numOrNull(body.discountPct) : undefined,
          discountTL: body.discountTL !== undefined ? numOrNull(body.discountTL) : undefined,
          minBasket: body.minBasket !== undefined ? numOrNull(body.minBasket) : undefined,
          minQty: body.minQty !== undefined ? intOrNull(body.minQty) ?? 0 : undefined,
          formulMultiplier: body.formulMultiplier !== undefined ? numOrNull(body.formulMultiplier) : undefined,
          formulExtra: body.formulExtra !== undefined ? numOrNull(body.formulExtra) : undefined,
          formulMargin: body.formulMargin !== undefined ? numOrNull(body.formulMargin) : undefined,
          comboConfig: body.comboConfig !== undefined ? body.comboConfig : undefined,
          startDate: body.startDate !== undefined ? dateOrNull(body.startDate) : undefined,
          endDate: body.endDate !== undefined ? dateOrNull(body.endDate) : undefined,
          priority: body.priority !== undefined ? intOrNull(body.priority) ?? 10 : undefined,
          autoApply: body.autoApply !== undefined ? !!body.autoApply : undefined,
          manualAlso: body.manualAlso !== undefined ? !!body.manualAlso : undefined,
          oodooPricelistId: body.oodooPricelistId !== undefined ? intOrNull(body.oodooPricelistId) : undefined,
          isActive: body.isActive !== undefined ? !!body.isActive : undefined,
          branchOverrides: overrides
            ? {
                create: overrides.map((o: any) => ({
                  branchId: String(o.branchId ?? ''),
                  branchCode: String(o.branchCode ?? ''),
                  isActive: o.isActive == null ? null : !!o.isActive,
                  discountPct: numOrNull(o.discountPct),
                  discountTL: numOrNull(o.discountTL),
                  startDate: dateOrNull(o.startDate),
                  endDate: dateOrNull(o.endDate),
                  autoApply: o.autoApply == null ? null : !!o.autoApply,
                })),
              }
            : undefined,
        },
        include: { branchOverrides: true },
      });
    });
    return res.json({ success: true, data: serializeCampaign(row) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const body = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.priority !== undefined) data.priority = intOrNull(body.priority) ?? 10;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'Güncellenecek alan yok' });
    }
    const row = await prisma.campaign.update({
      where: { id },
      data,
      include: { branchOverrides: true },
    });
    return res.json({ success: true, data: serializeCampaign(row) });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    await prisma.campaign.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── ÜRÜN ARA (Odoo product.template) ──────────────────────────────
router.get('/urun-ara', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q || q.length < 1) return res.json({ data: [] });

    const domain: any[] = [
      ['active', '=', true],
      ['type', 'in', ['product', 'consu']],
      '|', '|', '|',
      ['name', 'ilike', q],
      ['attribute_line_ids.value_ids.name', 'ilike', q],
      ['barcode', 'ilike', q],
      ['default_code', 'ilike', q],
    ];

    const products = await execute(
      'product.template',
      'search_read',
      [domain],
      {
        fields: ['id', 'name', 'default_code', 'barcode', 'type', 'list_price', 'standard_price', 'tracking'],
        limit: 500,
        order: 'name asc',
      },
    );

    return res.json({ data: products });
  } catch (err: any) {
    console.error('[urun-ara hata]', err?.message ?? err);
    return res.json({ data: [] });
  }
});

// ── YENİ ÜRÜN ŞABLONU OLUŞTUR (Odoo product.template) ─────────────
router.post('/urun-olustur', async (req: Request, res: Response) => {
  try {
    const {
      name,
      default_code,
      barcode,
      categ_name,
      standard_price,
      list_price,
    } = req.body ?? {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Ürün adı zorunlu' });
    }

    let categId: number | null = null;
    if (categ_name?.trim()) {
      try {
        const resolved = await resolveOrCreateCategoryId(categ_name);
        categId = resolved.id;
      } catch (err) {
        if (err instanceof OdooCategoryMatchError) {
          return res.status(400).json({
            error: err.message,
            code: err.code,
            candidates: err.candidates.map((c) => ({
              id: c.id,
              name: c.name,
              complete_name: c.complete_name,
            })),
          });
        }
        throw err;
      }
    }

    const vals: Record<string, any> = {
      name: name.trim(),
      type: 'product',
      tracking: 'serial',
      sale_ok: true,
      purchase_ok: true,
    };
    if (default_code?.trim()) vals.default_code = default_code.trim();
    if (barcode?.trim()) vals.barcode = barcode.trim();
    if (categId) vals.categ_id = categId;
    if (standard_price != null && !isNaN(Number(standard_price))) vals.standard_price = Number(standard_price);
    if (list_price != null && !isNaN(Number(list_price))) vals.list_price = Number(list_price);

    const newId = await execute('product.template', 'create', [vals]);

    // Nitelikleri ekle
    const nitelikler: Array<{ attributeId: number; valueIds: number[] }> = req.body.nitelikler ?? [];
    for (const n of nitelikler) {
      if (!n.attributeId || !n.valueIds?.length) continue;
      try {
        await execute(
          'product.template.attribute.line',
          'create',
          [[{
            product_tmpl_id: newId,
            attribute_id: n.attributeId,
            value_ids: [[6, 0, n.valueIds]],
          }]],
        );
      } catch (attrErr: any) {
        console.warn('[nitelik ekle uyarı]', attrErr?.message ?? attrErr);
      }
    }

    const created = await execute(
      'product.template',
      'read',
      [[newId]],
      { fields: ['id', 'name', 'default_code', 'barcode', 'type', 'list_price', 'standard_price'] },
    );

    return res.json({ success: true, data: created?.[0] ?? { id: newId, name: name.trim() } });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[urun-olustur hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── CARİ ARA (Odoo res.partner) ────────────────────────────────────
router.get('/cari-ara', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q || q.length < 2) return res.json({ data: [] });

    const digitsOnly = q.replace(/\D/g, '');
    const isVknQuery = /^\d{10,11}$/.test(digitsOnly);

    const domain: unknown[] = [['active', '=', true]];
    if (isVknQuery) {
      domain.push(['vat', 'ilike', digitsOnly]);
    } else {
      domain.push(['is_company', '=', true]);
      domain.push('|');
      domain.push(['name', 'ilike', q]);
      domain.push(['vat', 'ilike', q]);
    }

    const partners = await execute(
      'res.partner',
      'search_read',
      [domain],
      { fields: ['id', 'name', 'vat', 'phone', 'email'], limit: 20, order: 'name asc' },
    );

    const data = (Array.isArray(partners) ? partners : []).map((p: any) => ({
      id: p.id,
      name: p.name,
      tip: 'cari' as const,
      vat: p.vat || '',
    }));

    return res.json({ data });
  } catch (err: any) {
    console.error('[cari-ara hata]', err?.message ?? err);
    return res.json({ data: [] });
  }
});

// ── CARİ OLUŞTUR (Odoo res.partner) ────────────────────────────────
router.post('/cari-olustur', async (req: Request, res: Response) => {
  try {
    const {
      name,
      vkn,
      vergiDairesi,
      adres,
      il,
      ilce,
      telefon,
      email,
      tip,
      sirketId,
    } = req.body ?? {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Firma adı zorunlu' });
    }

    const isCompany = tip !== 'gercek';
    const partnerVals: Record<string, unknown> = {
      name: String(name).trim(),
      is_company: isCompany,
      supplier_rank: 1,
    };

    if (vkn && String(vkn).trim()) partnerVals.vat = String(vkn).trim();
    if (adres && String(adres).trim()) partnerVals.street = String(adres).trim();
    if (ilce && String(ilce).trim()) partnerVals.street2 = String(ilce).trim();
    if (il && String(il).trim()) partnerVals.city = String(il).trim();
    if (telefon && String(telefon).trim()) partnerVals.phone = String(telefon).trim();
    if (email && String(email).trim()) partnerVals.email = String(email).trim();

    if (vergiDairesi && String(vergiDairesi).trim()) {
      partnerVals.comment = `Vergi Dairesi: ${String(vergiDairesi).trim()}`;
    }

    const companyId = sirketId ? Number(sirketId) : undefined;
    const partnerId = await execute(
      'res.partner',
      'create',
      [partnerVals],
      {},
      companyId,
    );

    const created = await execute(
      'res.partner',
      'read',
      [[partnerId]],
      { fields: ['id', 'name', 'vat', 'phone', 'email'] },
      companyId,
    );

    const p = created[0] as { id: number; name: string; vat?: string };
    return res.json({
      data: {
        id: p.id,
        name: p.name,
        tip: 'cari' as const,
        vat: p.vat || '',
      },
    });
  } catch (err: any) {
    console.error('[cari-olustur hata]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Cari oluşturulamadı' });
  }
});

// ── KATEGORİ LİSTESİ (Odoo product.category) ──────────────────────
router.get('/kategori-listesi', async (_req: Request, res: Response) => {
  try {
    const cats = await execute(
      'product.category',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'complete_name'], order: 'complete_name asc', limit: 200 },
    );
    return res.json({ data: cats });
  } catch (err: any) {
    console.error('[kategori-listesi hata]', err?.message ?? err);
    return res.json({
      data: [
        { id: 1, name: 'Tümü', complete_name: 'Tümü' },
        { id: 2, name: 'Camlar', complete_name: 'Tümü / Camlar' },
        { id: 3, name: 'Çerçeveler', complete_name: 'Tümü / Çerçeveler' },
        { id: 4, name: 'Kontakt Lensler', complete_name: 'Tümü / Kontakt Lensler' },
        { id: 5, name: 'Güneş Gözlükleri', complete_name: 'Tümü / Güneş Gözlükleri' },
        { id: 6, name: 'Aksesuarlar', complete_name: 'Tümü / Aksesuarlar' },
      ],
    });
  }
});

// ── KATEGORİ ARŞİV KONTROLÜ (Optik Cam/Çerçeve kayboldu mu teşhisi) ─
// Geçici teşhis uç noktası — "Optik Çerçeve" (id 6) ve "Optik Cam" (id 4 + alt
// kategorileri 10-44) aktif listede görünmüyor. Bu uç nokta, o ID'leri
// active_test:false context'iyle (arşivlenmiş kayıtlar dahil) sorgulayıp
// gerçekten silinmiş mi yoksa sadece arşivlenmiş mi olduğunu ayırt eder.
router.get('/kategori-arsiv-kontrol', async (_req: Request, res: Response) => {
      const targetIds = Array.from(new Set<number>([4, 6, ...ODOO_OPTIK_CAM_CATEGORY_IDS]));
          try {
                // read() ID bazlı çalışır ve search_read'in aksine active=false kayıtları
                      // context olmadan da döndürür; var olmayan ID'ler sonuçtan sessizce
                            // düşer (hata fırlatmaz) — bu yüzden search_read+active_test yerine
                                  // read() kullanıyoruz.
                                        const rows = await execute(
                                                'product.category',
                                                        'read',
                                                                [targetIds],
                                                                        { fields: ['id', 'name', 'complete_name', 'active'] },
                                                                              );
                                                                                    const bulunanIds = new Set((rows ?? []).map((r: any) => r.id));
                                                                                          const hicYok = targetIds.filter((id) => !bulunanIds.has(id));
                                                                                                const arsivde = (rows ?? []).filter((r: any) => r.active === false);
                                                                                                      const aktif = (rows ?? []).filter((r: any) => r.active === true);

                                                                                                            return res.json({
                                                                                                                    ozet: {
                                                                                                                              aranan: targetIds.length,
                                                                                                                                        aktifBulundu: aktif.length,
                                                                                                                                                  arsivdeBulundu: arsivde.length,
                                                                                                                                                            hicBulunamadi: hicYok.length,
                                                                                                                                                                    },
                                                                                                                                                                            hicBulunamadiIdler: hicYok,
                                                                                                                                                                                    arsivdekiler: arsivde,
                                                                                                                                                                                            aktifOlanlar: aktif,
                                                                                                                                                                                                  });
                                                                                                                                                                                                      } catch (err: any) {
                                                                                                                                                                                                            const detay = {
                                                                                                                                                                                                                    message: err?.message ?? null,
                                                                                                                                                                                                                            faultString: err?.faultString ?? err?.body?.faultString ?? null,
                                                                                                                                                                                                                                    faultCode: err?.faultCode ?? err?.body?.faultCode ?? null,
                                                                                                                                                                                                                                            name: err?.name ?? null,
                                                                                                                                                                                                                                                    aranan: targetIds,
                                                                                                                                                                                                                                                          };
                                                                                                                                                                                                                                                                console.error('[kategori-arsiv-kontrol hata]', JSON.stringify(detay));
                                                                                                                                                                                                                                                                      return res.status(500).json({ error: 'Kontrol edilemedi', detay });
                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                          });

// ── NİTELİK LİSTESİ (Odoo product.attribute) ──────────────────────
router.get('/nitelik-listesi', async (_req: Request, res: Response) => {
  try {
    const attrs = await execute(
      'product.attribute',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'value_ids', 'create_variant'], order: 'name asc', limit: 100 },
    );
    const attrsArr: any[] = Array.isArray(attrs) ? attrs : [];
    const allValueIds: number[] = attrsArr.flatMap((a: any) => a.value_ids ?? []);
    const valueMap: Record<number, { id: number; name: string; attribute_id: number }> = {};
    if (allValueIds.length > 0) {
      const values = await execute(
        'product.attribute.value',
        'search_read',
        [[['id', 'in', allValueIds]]],
        { fields: ['id', 'name', 'attribute_id'], limit: 500 },
      );
      (Array.isArray(values) ? values : []).forEach((v: any) => {
        valueMap[v.id] = v;
      });
    }
    const result = attrsArr.map((a: any) => ({
      id: a.id,
      name: a.name,
      create_variant: a.create_variant,
      values: (a.value_ids ?? []).map((vid: number) => valueMap[vid]).filter(Boolean),
    }));
    return res.json({ data: result });
  } catch (err: any) {
    console.error('[nitelik-listesi hata]', err?.message ?? err);
    return res.json({
      data: [
        { id: 1, name: 'Renk', create_variant: 'always', values: [{ id: 1, name: 'Şeffaf' }, { id: 2, name: 'Kahverengi' }] },
        { id: 2, name: 'İndeks', create_variant: 'always', values: [{ id: 3, name: '1.50' }, { id: 4, name: '1.60' }, { id: 5, name: '1.67' }] },
        { id: 3, name: 'Kaplama', create_variant: 'always', values: [{ id: 6, name: 'AR' }, { id: 7, name: 'Blue Cut' }, { id: 8, name: 'Fotoğrafik' }] },
      ],
    });
  }
});

// ── YENİ NİTELİK OLUŞTUR (Odoo product.attribute) ─────────────────
router.post('/nitelik-olustur', async (req: Request, res: Response) => {
  try {
    const { name, values } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'Nitelik adı zorunlu' });
    const degerler: string[] = (values ?? []).map((v: any) => String(v).trim()).filter(Boolean);
    if (degerler.length === 0) return res.status(400).json({ error: 'En az 1 değer gerekli' });

    // Önce aynı isimde nitelik var mı kontrol et
    const existing = await execute(
      'product.attribute',
      'search_read',
      [[['name', '=', name.trim()]]],
      { fields: ['id', 'name', 'value_ids'], limit: 1 },
    );

    let attrId: number;
    if (Array.isArray(existing) && existing.length > 0) {
      attrId = existing[0].id;
    } else {
      attrId = await execute('product.attribute', 'create', [{ name: name.trim(), create_variant: 'dynamic' }]);
    }

    // Değerleri ekle
    const valueIds: number[] = [];
    for (const deger of degerler) {
      try {
        const existingVal = await execute(
          'product.attribute.value',
          'search_read',
          [[['attribute_id', '=', attrId], ['name', '=', deger]]],
          { fields: ['id'], limit: 1 },
        );
        if (Array.isArray(existingVal) && existingVal.length > 0) {
          valueIds.push(existingVal[0].id);
        } else {
          const vid = await execute('product.attribute.value', 'create', [{ attribute_id: attrId, name: deger }]);
          valueIds.push(vid);
        }
      } catch (ve: any) {
        console.warn('[nitelik değer ekle]', deger, ve?.message);
      }
    }

    return res.json({ success: true, data: { id: attrId, name: name.trim(), value_ids: valueIds } });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[nitelik-olustur hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── TOPLU TRACKING GÜNCELLE ────────────────────────────────────────
router.post('/urun-tracking-guncelle', async (req: Request, res: Response) => {
  try {
    const { tracking } = req.body ?? {};
    if (!['serial', 'lot', 'none'].includes(tracking)) {
      return res.status(400).json({ error: 'tracking serial, lot veya none olmalı' });
    }

    const products = await execute(
      'product.template',
      'search_read',
      [[['active', '=', true], ['type', 'in', ['product', 'consu']], ['tracking', '=', 'none']]],
      { fields: ['id', 'name'], limit: 1000 },
    );

    if (!Array.isArray(products) || products.length === 0) {
      return res.json({ success: true, updated: 0, message: 'Güncellenecek ürün yok.' });
    }

    const ids = products.map((p: any) => p.id);

    await execute('product.template', 'write', [ids, { tracking }]);

    return res.json({
      success: true,
      updated: ids.length,
      message: `${ids.length} ürün tracking=${tracking} olarak güncellendi.`,
      ids,
    });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[urun-tracking-guncelle hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── ŞİRKET LİSTESİ (Odoo res.company) ────────────────────────────
router.get('/sirket-listesi', async (_req: Request, res: Response) => {
  try {
    const companies = await execute(
      'res.company',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'vat', 'currency_id'], order: 'name asc', limit: 50 },
    );
    return res.json({ data: companies });
  } catch (err: any) {
    console.error('[sirket-listesi hata]', err?.message ?? err);
    return res.json({
      data: [
        { id: 1, name: 'NG OPTİK', vat: '' },
        { id: 2, name: 'ADESE OPTİK', vat: '' },
        { id: 3, name: 'POTANSİYEL OPTİK', vat: '' },
      ],
    });
  }
});

// ── FİZİKİ TEDARİKÇİ ARA (Odoo res.partner — üretici) ─────────────
router.get('/uretici-ara', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  try {
    if (!q || q.length < 2) return res.json({ data: [] });

    const partners = await execute(
      'res.partner',
      'search_read',
      [[
        ['active', '=', true],
        ['is_company', '=', true],
        '|',
        ['name', 'ilike', q],
        ['vat', 'ilike', q],
      ]],
      { fields: ['id', 'name', 'vat', 'country_id'], limit: 20, order: 'name asc' },
    );

    return res.json({
      data: (Array.isArray(partners) ? partners : []).map((p: any) => ({
        id: p.id,
        name: p.name,
        vat: p.vat || '',
        country: p.country_id ? p.country_id[1] : '',
      })),
    });
  } catch (err: any) {
    console.error('[uretici-ara hata]', err?.message ?? err);
    return res.json({
      data: [
        { id: 101, name: 'Hoya Lens', vat: '', country: 'Japonya' },
        { id: 102, name: 'Rodenstock GmbH', vat: '', country: 'Almanya' },
        { id: 103, name: 'Essilor International', vat: '', country: 'Fransa' },
        { id: 104, name: 'Zeiss Vision', vat: '', country: 'Almanya' },
      ].filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    });
  }
});

// ── İRSALİYE OLUŞTUR (Odoo stock.picking — lokasyon bazlı) ─────────
// NOT: DepoPage Adım 4 kısayolu kaldırıldı (2026-07). Frontend artık çağırmıyor.
// Asıl akış: POST /admin/urun-giris (Adım 5 kaydet). Endpoint referans için korunuyor.
router.post('/irsaliye-olustur', async (req: Request, res: Response) => {
  try {
    const {
      sirketId,
      cariId,
      faturaNo,
      faturaTarihi,
      lokasyon,
      kalemler, // Array<{ bizimUrunOdooId, lotNo, barkod, utsKodu, birimFiyat }>
    } = req.body ?? {};

    if (!lokasyon || !kalemler?.length) {
      return res.status(400).json({ error: 'Lokasyon ve kalemler zorunlu' });
    }

    // Lokasyon ID'sini bul
    const LOKASYON_MAP: Record<string, number> = {
      GVN1: 53,
      GVN3: 54,
      GVN4: 55,
      GVN6: 56,
      GVN8: 57,
      GVN9: 58,
      GVN2: 59,
      GVN10: 60,
      ANADEPO: 61,
      GVN5: 62,
    };
    const destLocationId = LOKASYON_MAP[lokasyon];
    if (!destLocationId) {
      return res.status(400).json({ error: `Bilinmeyen lokasyon: ${lokasyon}` });
    }

    // Tedarikçi lokasyonu (vendor location) = 8 (Odoo default)
    const srcLocationId = 8;

    // stock.picking oluştur
    const pickingVals: Record<string, any> = {
      picking_type_id: 1, // Receipt (gelen mal)
      location_id: srcLocationId,
      location_dest_id: destLocationId,
      origin: faturaNo || '',
      scheduled_date: faturaTarihi || new Date().toISOString().slice(0, 10),
      note: `Ürün girişi - ${faturaNo} - ${lokasyon}`,
    };
    if (cariId) pickingVals.partner_id = cariId;
    if (sirketId) pickingVals.company_id = sirketId;

    const pickingId = await execute('stock.picking', 'create', [pickingVals]);

    // Her kalem için stock.move oluştur
    for (const kalem of kalemler) {
      if (!kalem.bizimUrunOdooId) continue;
      try {
        // Ürünün product_id'sini al (template → product variant)
        const variants = await execute(
          'product.product',
          'search_read',
          [[['product_tmpl_id', '=', kalem.bizimUrunOdooId]]],
          { fields: ['id'], limit: 1 },
        );
        const productId = variants[0]?.id;
        if (!productId) continue;

        await execute('stock.move', 'create', [{
          picking_id: pickingId,
          product_id: productId,
          product_uom_qty: 1,
          product_uom: 1, // Unit
          location_id: srcLocationId,
          location_dest_id: destLocationId,
          name: kalem.bizimUrunAdi || 'Ürün',
          price_unit: Number(kalem.birimFiyat) || 0,
        }]);
      } catch (moveErr: any) {
        console.warn('[stock.move hata]', moveErr?.message);
      }
    }

    // Picking'i onayla (validate)
    try {
      await execute('stock.picking', 'action_confirm', [[pickingId]]);
    } catch (confirmErr: any) {
      console.warn('[picking confirm uyarı]', confirmErr?.message);
    }

    // Picking adını al
    const pickingData = await execute(
      'stock.picking',
      'read',
      [[pickingId]],
      { fields: ['id', 'name', 'state'] },
    );

    return res.json({
      success: true,
      pickingId,
      pickingName: pickingData[0]?.name ?? `WH/IN/${pickingId}`,
      lokasyon,
      kalemSayisi: kalemler.length,
    });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[irsaliye-olustur hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── TCMB DÖVİZ KURU ───────────────────────────────────────────────
// Artık DovizKuru tablosunda kalıcı olarak saklanıyor (bkz. doviz-kuru.service.ts).
// Günlük kur zaten yoksa burada TCMB'den çekilip kaydediliyor; TCMB'ye ulaşılamazsa
// (hafta sonu/tatil/bağlantı sorunu) en son bilinen gerçek kur döner — asla sabit/uydurma
// bir rakama düşmez.
router.get('/doviz-kuru', async (_req: Request, res: Response) => {
  try {
    const sonuc = await getOrFetchTodayRate();
    return res.json({
      success: true,
      tarih: sonuc.tarih,
      kaynak: sonuc.kaynak,
      USD: sonuc.usd,
      EUR: sonuc.eur,
    });
  } catch (err: any) {
    console.error('[doviz-kuru hata]', err?.message);
    return res.status(503).json({
      success: false,
      error: 'TCMB kuru alınamadı ve veritabanında hiç kayıtlı kur yok.',
    });
  }
});

// ── SATIŞ FİYATI GÜNCELLE (Odoo product.template) ─────────────────
router.post('/satis-fiyati-guncelle', async (req: Request, res: Response) => {
  try {
    const { productTmplId, listPrice } = req.body ?? {};
    if (!productTmplId || listPrice == null) {
      return res.status(400).json({ error: 'productTmplId ve listPrice zorunlu' });
    }
    await execute('product.template', 'write', [[productTmplId], { list_price: Number(listPrice) }]);
    return res.json({ success: true, productTmplId, listPrice: Number(listPrice) });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[satis-fiyati-guncelle hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── DIŞ MÜŞTERİ TRANSFER + SATIŞ FATURASI ────────────────────────
// NOT: DepoPage Adım 4 dış müşteri kısayolu kaldırıldı (2026-07). Frontend artık çağırmıyor.
// Asıl akış: POST /admin/urun-giris (Adım 5 kaydet). Endpoint referans için korunuyor.
router.post('/dis-musteri-transfer', async (req: Request, res: Response) => {
  try {
    const { sirketId, faturaNo, faturaTarihi, partnerId, partnerAdi, kalemler } = req.body ?? {};
    if (!partnerId || !kalemler?.length) {
      return res.status(400).json({ error: 'Partner ve kalemler zorunlu' });
    }

    // 1) Delivery picking oluştur
    const pickingVals: Record<string, any> = {
      picking_type_id: 2,
      location_id: 8,
      location_dest_id: 5,
      partner_id: partnerId,
      origin: faturaNo || '',
      scheduled_date: faturaTarihi || new Date().toISOString().slice(0, 10),
      note: `Dış müşteri transferi - ${partnerAdi} - ${faturaNo}`,
    };
    if (sirketId) pickingVals.company_id = sirketId;
    const pickingId = await execute('stock.picking', 'create', [pickingVals]);

    // 2) Her kalem için stock.move
    for (const kalem of kalemler) {
      if (!kalem.bizimUrunOdooId) continue;
      try {
        const variants = await execute(
          'product.product',
          'search_read',
          [[['product_tmpl_id', '=', kalem.bizimUrunOdooId]]],
          { fields: ['id'], limit: 1 },
        );
        const productId = variants[0]?.id;
        if (!productId) continue;
        await execute('stock.move', 'create', [{
          picking_id: pickingId,
          product_id: productId,
          product_uom_qty: 1,
          product_uom: 1,
          location_id: 8,
          location_dest_id: 5,
          name: kalem.bizimUrunAdi || 'Ürün',
          price_unit: Number(kalem.satisFiyati) || 0,
        }]);
      } catch (me: any) {
        console.warn('[dis-musteri move]', me?.message);
      }
    }

    // 3) Transfer onayla
    try {
      await execute('stock.picking', 'action_confirm', [[pickingId]]);
    } catch (ce: any) {
      console.warn('[dis-musteri confirm]', ce?.message);
    }

    const pickingData = await execute(
      'stock.picking',
      'read',
      [[pickingId]],
      { fields: ['id', 'name', 'state'] },
    );
    const pickingName = pickingData[0]?.name ?? `WH/OUT/${pickingId}`;

    // 4) Satış faturası oluştur (account.move)
    let invoiceId: number | null = null;
    let invoiceName = '';
    try {
      const invoiceLines = [];
      for (const kalem of kalemler) {
        if (!kalem.bizimUrunOdooId || !Number(kalem.satisFiyati)) continue;
        const variants = await execute(
          'product.product',
          'search_read',
          [[['product_tmpl_id', '=', kalem.bizimUrunOdooId]]],
          { fields: ['id', 'name'], limit: 1 },
        );
        const productId = variants[0]?.id;
        if (!productId) continue;
        invoiceLines.push([0, 0, {
          product_id: productId,
          name: kalem.bizimUrunAdi || '',
          quantity: 1,
          price_unit: Number(kalem.satisFiyati),
        }]);
      }

      if (invoiceLines.length > 0) {
        const invoiceVals: Record<string, any> = {
          move_type: 'out_invoice',
          partner_id: partnerId,
          invoice_date: faturaTarihi || new Date().toISOString().slice(0, 10),
          ref: faturaNo || '',
          invoice_line_ids: invoiceLines,
        };
        if (sirketId) invoiceVals.company_id = sirketId;
        invoiceId = await execute('account.move', 'create', [invoiceVals]);
        const invData = await execute(
          'account.move',
          'read',
          [[invoiceId]],
          { fields: ['id', 'name'] },
        );
        invoiceName = invData[0]?.name ?? `INV/${invoiceId}`;
      }
    } catch (ie: any) {
      console.warn('[satis-faturasi hata]', ie?.message);
    }

    return res.json({
      success: true,
      pickingId,
      pickingName,
      invoiceId,
      invoiceName,
      partnerAdi,
      kalemSayisi: kalemler.length,
    });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[dis-musteri-transfer hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── SATIN ALMA FATURALARI (Odoo account.move — vendor bills) ───────
router.get('/satin-alma-faturalari', async (req: Request, res: Response) => {
  try {
    const sirketId = req.query.sirketId ? Number(req.query.sirketId) : null;
    const limit = Number(req.query.limit ?? 50);

    const domain: any[] = [
      ['move_type', '=', 'in_invoice'],
      ['state', 'in', ['draft', 'posted']],
    ];
    if (sirketId) domain.push(['company_id', '=', sirketId]);

    const faturalar = await execute(
      'account.move',
      'search_read',
      [domain],
      {
        fields: ['id', 'name', 'ref', 'invoice_date', 'partner_id',
          'amount_untaxed', 'amount_tax', 'amount_total',
          'currency_id', 'state', 'payment_state',
          'invoice_line_ids', 'company_id', 'narration'],
        order: 'invoice_date desc, id desc',
        limit,
      },
    );

    // İşlendi durumunu narration alanından çek
    const result = faturalar.map((f: any) => ({
      id: f.id,
      name: f.name,
      ref: f.ref || '',
      invoice_date: f.invoice_date || '',
      partner_name: f.partner_id ? f.partner_id[1] : '',
      partner_id: f.partner_id ? f.partner_id[0] : null,
      amount_untaxed: f.amount_untaxed,
      amount_tax: f.amount_tax,
      amount_total: f.amount_total,
      currency: f.currency_id ? f.currency_id[1] : 'TRY',
      state: f.state,
      payment_state: f.payment_state,
      company_name: f.company_id ? f.company_id[1] : '',
      company_id: f.company_id ? f.company_id[0] : null,
      islendi: (f.narration || '').includes('[POS-ISLENDI]'),
    }));

    return res.json({ data: result });
  } catch (err: any) {
    console.error('[satin-alma-faturalari hata]', err?.message ?? err);
    return res.json({ data: [] });
  }
});

// ── FATURA İŞLENDİ ETİKETİ ────────────────────────────────────────
router.post('/fatura-islendi', async (req: Request, res: Response) => {
  try {
    const { faturaId, islendi } = req.body ?? {};
    if (!faturaId) return res.status(400).json({ error: 'faturaId zorunlu' });

    // Mevcut narration'ı oku
    const mevcut = await execute('account.move', 'read', [[faturaId]], { fields: ['narration'] });
    let narration: string = mevcut[0]?.narration || '';

    if (islendi) {
      if (!narration.includes('[POS-ISLENDI]')) {
        narration = `[POS-ISLENDI] ${new Date().toISOString().slice(0, 10)}\n${narration}`.trim();
      }
    } else {
      narration = narration.replace(/\[POS-ISLENDI\][^\n]*\n?/g, '').trim();
    }

    await execute('account.move', 'write', [[faturaId], { narration }]);
    return res.json({ success: true, islendi });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[fatura-islendi hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

async function resolveProductVariantId(
  bizimUrunOdooId: number | null | undefined,
  bizimUrunProductId: number | null | undefined,
  companyId?: number,
): Promise<number | null> {
  const cid = companyId && companyId > 0 ? companyId : undefined;

  if (bizimUrunProductId) {
    try {
      const rows = await execute('product.product', 'read', [[bizimUrunProductId]], { fields: ['id'] }, cid);
      if (rows?.[0]?.id) return rows[0].id;
    } catch { /* fallthrough */ }
  }

  if (bizimUrunOdooId) {
    const byTemplate = await execute(
      'product.product',
      'search_read',
      [[['product_tmpl_id', '=', bizimUrunOdooId]]],
      { fields: ['id'], limit: 1 },
      cid,
    );
    if (byTemplate?.[0]?.id) return byTemplate[0].id;

    try {
      const asProduct = await execute(
        'product.product',
        'read',
        [[bizimUrunOdooId]],
        { fields: ['id', 'product_tmpl_id'] },
        cid,
      );
      const row = asProduct?.[0];
      if (row?.id) {
        const tmplRef = row.product_tmpl_id;
        const tmplId = Array.isArray(tmplRef) ? tmplRef[0] : tmplRef;
        if (tmplId && tmplId !== bizimUrunOdooId) return row.id;
      }
    } catch { /* template id olabilir */ }
  }

  return null;
}

async function resolveProductTemplateId(
  bizimUrunOdooId: number | null | undefined,
  bizimUrunProductId: number | null | undefined,
  companyId?: number,
): Promise<number | null> {
  const cid = companyId && companyId > 0 ? companyId : undefined;

  if (bizimUrunOdooId) {
    try {
      const tmpl = await execute('product.template', 'read', [[bizimUrunOdooId]], { fields: ['id'] }, cid);
      if (tmpl?.[0]?.id) return tmpl[0].id;
    } catch { /* variant id olabilir */ }
  }

  if (bizimUrunProductId) {
    const rows = await execute(
      'product.product',
      'read',
      [[bizimUrunProductId]],
      { fields: ['product_tmpl_id'] },
      cid,
    );
    const tmplRef = rows?.[0]?.product_tmpl_id;
    if (Array.isArray(tmplRef)) return tmplRef[0] ?? null;
    if (typeof tmplRef === 'number') return tmplRef;
  }

  return bizimUrunOdooId ?? null;
}

function odooErrText(err: any): string {
  return String(err?.faultString ?? err?.message ?? err ?? 'Bilinmeyen hata');
}

async function getProductUomId(productId: number, companyId?: number): Promise<number> {
  const rows = await execute('product.product', 'read', [[productId]], { fields: ['uom_id'] }, companyId);
  const uom = rows?.[0]?.uom_id;
  if (Array.isArray(uom)) return uom[0] ?? 1;
  return typeof uom === 'number' ? uom : 1;
}

async function resolveLotOdooId(
  lot: any,
  lotIdMap: Record<string, number>,
  companyId?: number,
): Promise<number | null> {
  // Sadece bu isteğin lotIdMap'inden çöz — eski fatura bazlı Odoo araması yapma
  return lotIdMap[lot.id] ?? null;
}

async function reportOrphanReceipts(faturaNo: string, companyId?: number): Promise<string[]> {
  const cid = companyId && companyId > 0 ? companyId : undefined;
  const warnings: string[] = [];
  if (!faturaNo?.trim()) return warnings;

  const pos = await execute(
    'purchase.order',
    'search_read',
    [[['origin', '=', faturaNo]]],
    { fields: ['id', 'name', 'state'], order: 'id asc' },
    cid,
  );
  const partnerRefPos = await execute(
    'purchase.order',
    'search_read',
    [[['partner_ref', '=', faturaNo]]],
    { fields: ['id', 'name', 'state'], order: 'id asc' },
    cid,
  );
  const allPos = [...(pos ?? []), ...(partnerRefPos ?? [])].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
  );

  for (const po of allPos) {
    const pickings = await execute(
      'stock.picking',
      'search_read',
      [[['purchase_id', '=', po.id]]],
      { fields: ['id', 'name', 'state'], limit: 5 },
      cid,
    );
    for (const p of pickings) {
      if (p.state === 'assigned' || p.state === 'confirmed' || p.state === 'waiting') {
        warnings.push(`Yarım kalan ürün kabulü: ${p.name} (PO ${po.name}, state=${p.state})`);
      }
    }
  }

  const orphanLots = await execute(
    'stock.lot',
    'search_read',
    [[['name', 'ilike', faturaNo]]],
    { fields: ['id', 'name'], order: 'id asc', limit: 20 },
    cid,
  );
  for (const lot of orphanLots ?? []) {
    const doneMls = await execute(
      'stock.move.line',
      'search_read',
      [[['lot_id', '=', lot.id], ['state', '=', 'done']]],
      { fields: ['picking_id'], limit: 1 },
      cid,
    );
    const activeMls = await execute(
      'stock.move.line',
      'search_read',
      [[['lot_id', '=', lot.id], ['state', 'in', ['assigned', 'partially_available']]]],
      { fields: ['picking_id'], limit: 3 },
      cid,
    );
    if (doneMls?.length && activeMls?.length) {
      warnings.push(
        `Seri no çakışması: ${lot.name} hem teslim alınmış hem aktif picking'de (${activeMls.length} ml)`,
      );
    }
  }

  return warnings;
}

async function postVendorBill(
  invoiceId: number,
  companyId?: number,
): Promise<{ ok: boolean; name?: string; state?: string; error?: string }> {
  const cid = companyId && companyId > 0 ? companyId : undefined;

  const before = await execute(
    'account.move',
    'read',
    [[invoiceId]],
    { fields: ['id', 'name', 'state', 'move_type'] },
    cid,
  );
  const inv = before?.[0];
  if (!inv) return { ok: false, error: 'Fatura bulunamadı' };
  if (inv.state === 'posted') {
    return { ok: true, name: inv.name, state: 'posted' };
  }
  if (inv.state === 'cancel') {
    return { ok: false, error: 'Fatura iptal edilmiş' };
  }

  const postKwargs = {
    context: {
      allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
      ...(cid ? { force_company: cid } : {}),
      skip_invoice_sync: true,
    },
  };

  const tryPost = async (extraCtx: Record<string, unknown> = {}) => {
    await execute(
      'account.move',
      'action_post',
      [[invoiceId]],
      { context: { ...postKwargs.context, ...extraCtx } },
      cid,
    );
  };

  try {
    console.log(`[urun-giris] action_post başlıyor invoice=${invoiceId}`);
    await tryPost();
  } catch (err: any) {
    const msg = odooErrText(err);
    console.warn('[urun-giris] action_post hata:', msg.slice(0, 300));
    const lower = msg.toLowerCase();
    if (lower.includes('duplicate') || lower.includes('kopya')) {
      try {
        await tryPost({ disable_duplicate_check: true, no_new_invoice: true });
      } catch (err2: any) {
        return { ok: false, error: odooErrText(err2) };
      }
    } else {
      return { ok: false, error: msg };
    }
  }

  const after = await execute(
    'account.move',
    'read',
    [[invoiceId]],
    { fields: ['name', 'state'] },
    cid,
  );
  const state = after?.[0]?.state;
  if (state !== 'posted') {
    return { ok: false, state, error: `Onay sonrası state=${state ?? 'bilinmiyor'}` };
  }
  console.log(`[urun-giris] fatura onaylandı: ${after[0].name}`);
  return { ok: true, name: after[0].name, state: 'posted' };
}

function validatePickingKwargs(companyId?: number) {
  return {
    context: {
      skip_backorder: true,
      skip_immediate: true,
      allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
      ...(companyId && companyId > 0 ? { force_company: companyId } : {}),
    },
  };
}

async function validateIncomingPicking(pickingId: number, companyId?: number): Promise<void> {
  const cid = companyId && companyId > 0 ? companyId : undefined;
  const validateKwargs = validatePickingKwargs(cid);
  console.log(`[urun-giris] button_validate başlıyor picking=${pickingId} company=${cid ?? '-'}`);
  try {
    await execute('stock.picking', 'button_validate', [[pickingId]], validateKwargs, cid);
    return;
  } catch (err: any) {
    const msg = odooErrText(err).toLowerCase();
    console.warn('[urun-giris] button_validate hata:', odooErrText(err).slice(0, 300));
    if (!msg.includes('immediate') && !msg.includes('backorder') && !msg.includes('wizard')) {
      throw err;
    }
  }
  try {
    const wizId = await execute(
      'stock.immediate.transfer',
      'create',
      [{ pick_ids: [[6, 0, [pickingId]]] }],
      {},
      cid,
    );
    await execute('stock.immediate.transfer', 'process', [[wizId]], {}, cid);
    console.log(`[urun-giris] immediate.transfer tamamlandı picking=${pickingId}`);
    return;
  } catch (wizErr: any) {
    console.warn('[urun-giris] immediate.transfer hata:', odooErrText(wizErr).slice(0, 300));
  }
  await execute('stock.picking', 'button_validate', [[pickingId]], validateKwargs, cid);
}

async function assignLotsAndValidatePicking(
  pickingId: number,
  lotlar: any[],
  lotIdMap: Record<string, number>,
  companyId?: number,
): Promise<void> {
  const cid = companyId && companyId > 0 ? companyId : undefined;
  const hedefLokasyonId = getAnaDepoLocationId(cid ?? 1);

  const pickingRows = await execute(
    'stock.picking',
    'read',
    [[pickingId]],
    { fields: ['id', 'name', 'state', 'location_id', 'location_dest_id', 'company_id'] },
    cid,
  );
  const picking = pickingRows?.[0];
  if (!picking) throw new Error(`Picking bulunamadı: ${pickingId}`);

  const locationId = picking.location_id?.[0];
  const locationDestId = hedefLokasyonId || picking.location_dest_id?.[0];
  console.log(
    `[urun-giris] picking ${picking.name} state=${picking.state} loc=${picking.location_id?.[1]} → dest=${locationDestId} (company ${cid ?? 1} ana depo)`,
  );

  if (locationDestId && picking.location_dest_id?.[0] !== locationDestId) {
    await execute(
      'stock.picking',
      'write',
      [[pickingId], { location_dest_id: locationDestId }],
      {},
      cid,
    );
  }

  if (picking.state === 'draft') {
    await execute('stock.picking', 'action_confirm', [[pickingId]], {}, cid);
  }
  if (['draft', 'confirmed', 'waiting'].includes(picking.state)) {
    try {
      await execute('stock.picking', 'action_assign', [[pickingId]], {}, cid);
    } catch (assignErr: any) {
      console.warn('[urun-giris] action_assign uyarı:', odooErrText(assignErr).slice(0, 200));
    }
  }

  const orderedLotIds: number[] = [];
  for (const lot of lotlar ?? []) {
    const lotOdooId = await resolveLotOdooId(lot, lotIdMap, cid);
    if (lotOdooId) orderedLotIds.push(lotOdooId);
    else console.warn(`[urun-giris] lot çözülemedi: ${lot.lotNo ?? lot.id}`);
  }
  console.log(`[urun-giris] ${orderedLotIds.length}/${lotlar?.length ?? 0} lot move line'a atanacak`);

  const moves = await execute(
    'stock.move',
    'search_read',
    [[['picking_id', '=', pickingId]]],
    { fields: ['id', 'product_id', 'product_uom_qty', 'state'], order: 'id asc' },
    cid,
  );

  type MoveLineSlot = {
    moveLineId?: number;
    moveId: number;
    productId: number;
    uomId: number;
  };
  const slots: MoveLineSlot[] = [];

  for (const move of moves as any[]) {
    const productId = move.product_id?.[0];
    const uomId = await getProductUomId(productId, cid);
    const qty = Math.max(1, Math.round(Number(move.product_uom_qty) || 1));

    let moveLines = await execute(
      'stock.move.line',
      'search_read',
      [[['move_id', '=', move.id]]],
      { fields: ['id', 'quantity', 'lot_id'], order: 'id asc' },
      cid,
    );

    if (!moveLines?.length) {
      for (let i = 0; i < qty; i++) {
        slots.push({ moveId: move.id, productId, uomId });
      }
    } else {
      for (let i = 0; i < qty; i++) {
        slots.push({
          moveLineId: moveLines[i]?.id,
          moveId: move.id,
          productId,
          uomId,
        });
      }
    }
  }

  if (orderedLotIds.length < slots.length) {
    throw new Error(
      `Seri/lot eksik: ${slots.length} adet bekleniyor, ${orderedLotIds.length} lot bulundu. ` +
      'Aynı seri no ile tekrar deneme yapıldıysa lotlar yeniden eşleştirilemedi.',
    );
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const lotOdooId = orderedLotIds[i];
    const avail = await isLotAvailableForReceipt(lotOdooId, cid, pickingId);
    if (!avail.available) {
      throw new Error(`move.line ${i + 1}: lot ${lotOdooId} atanamaz — ${avail.reason}`);
    }

    const mlVals: Record<string, unknown> = {
      quantity: 1,
      lot_id: lotOdooId,
      location_id: locationId,
      location_dest_id: locationDestId,
      product_id: slot.productId,
      product_uom_id: slot.uomId,
    };

    if (slot.moveLineId) {
      await execute('stock.move.line', 'write', [[slot.moveLineId], mlVals], {}, cid);
      console.log(`[urun-giris] move.line ${slot.moveLineId} ← lot ${lotOdooId}`);
    } else {
      const mlId = await execute(
        'stock.move.line',
        'create',
        [{
          picking_id: pickingId,
          move_id: slot.moveId,
          ...mlVals,
        }],
        {},
        cid,
      );
      console.log(`[urun-giris] move.line create ${mlId} ← lot ${lotOdooId}`);
    }
  }

  await validateIncomingPicking(pickingId, cid);

  const after = await execute(
    'stock.picking',
    'read',
    [[pickingId]],
    { fields: ['state', 'location_dest_id'] },
    cid,
  );
  if (after?.[0]?.state !== 'done') {
    throw new Error(`Picking validate sonrası state=${after?.[0]?.state ?? 'bilinmiyor'} (done bekleniyordu)`);
  }
}

async function resolveSupplierLocationId(companyId: number): Promise<number> {
  const cid = companyId;
  let rows = await execute(
    'stock.location',
    'search_read',
    [[['usage', '=', 'supplier'], ['company_id', '=', cid]]],
    { fields: ['id'], limit: 1 },
    cid,
  );
  if (!rows.length) {
    rows = await execute(
      'stock.location',
      'search_read',
      [[['usage', '=', 'supplier'], ['company_id', '=', false]]],
      { fields: ['id'], limit: 1 },
    );
  }
  if (!rows.length) {
    rows = await execute(
      'stock.location',
      'search_read',
      [[['usage', '=', 'supplier']]],
      { fields: ['id'], limit: 1 },
    );
  }
  const locId = rows[0]?.id;
  if (!locId) throw new Error('Tedarikçi lokasyonu bulunamadı');
  return locId;
}

/** Faturasız giriş: PO olmadan incoming picking + move satırları */
async function createFaturasizIncomingPicking(
  companyId: number,
  girisNo: string,
  satirList: any[],
  faturaTarihi?: string,
): Promise<number> {
  const cid = companyId;
  const hedefId = getAnaDepoLocationId(cid);
  const tedarikciLokId = await resolveSupplierLocationId(cid);
  const faturasizCariId = await getOrCreateFaturasizCari(cid);

  const ptRows = await execute(
    'stock.picking.type',
    'search_read',
    [[['code', '=', 'incoming'], ['active', '=', true], ['company_id', '=', cid]]],
    { fields: ['id'], limit: 1 },
    cid,
  );
  if (!ptRows.length) {
    throw new Error(`Şirket ${cid} için incoming picking type bulunamadı`);
  }

  const origin = String(girisNo ?? '').trim() || 'FATURASIZ';
  const pickingId = await execute(
    'stock.picking',
    'create',
    [{
      picking_type_id: ptRows[0].id,
      location_id: tedarikciLokId,
      location_dest_id: hedefId,
      company_id: cid,
      partner_id: faturasizCariId,
      origin,
      scheduled_date: faturaTarihi || new Date().toISOString().slice(0, 10),
      note: `Faturasız ürün girişi — ${origin}`,
    }],
    {},
    cid,
  );

  let moveCount = 0;
  for (const satir of satirList) {
    const productId = await resolveProductVariantId(
      satir.bizimUrunOdooId,
      satir.bizimUrunProductId,
      cid,
    );
    if (!productId) {
      console.warn('[urun-giris] faturasız move atlandı — ürün bulunamadı:', satir.id);
      continue;
    }
    const qty = Math.max(1, Math.round(Number(satir.miktar) || 1));
    const uomId = await getProductUomId(productId, cid);
    await execute(
      'stock.move',
      'create',
      [{
        picking_id: pickingId,
        product_id: productId,
        product_uom_qty: qty,
        product_uom: uomId,
        location_id: tedarikciLokId,
        location_dest_id: hedefId,
        name: satir.tedarikciUrunAdi || satir.bizimUrunAdi || 'Ürün',
      }],
      {},
      cid,
    );
    moveCount++;
  }

  if (moveCount === 0) {
    try {
      await execute('stock.picking', 'unlink', [[pickingId]], {}, cid);
    } catch { /* boş picking silinemezse sorun değil */ }
    throw new Error('Stok hareketi için geçerli ürün satırı bulunamadı');
  }

  console.log(
    `[urun-giris] faturasız incoming picking ${pickingId} oluşturuldu `
    + `(${moveCount} move) → dest=${hedefId} (company ${cid})`,
  );
  return pickingId;
}

// ── ÜRÜN GİRİŞİ ANA ENDPOINT ──────────────────────────────────────
router.post('/urun-giris', async (req: Request, res: Response) => {
  try {
    const {
      sirketId,
      sirketAdi,
      cariId,
      cariAdi,
      fizikiTedarikciId,
      fizikiTedarikciAdi,
      faturaNo,
      faturaReferans,
      faturaTarihi,
      faturaToplamKdvHaric,
      satirlar,
      lotlar,
      girisNo,
      girisTipi,
    } = req.body ?? {};

    const sonuclar: Record<string, any> = {};
    const hatalar: string[] = [];
    const cid = sirketId && Number(sirketId) > 0 ? Number(sirketId) : undefined;
    const satirList = satirlar ?? [];
    const lotList = lotlar ?? [];
    const girisTipiNorm = String(girisTipi ?? 'FATURAYLA').toUpperCase();
    const poGerekli = girisTipiNorm !== 'FATURASIZ';

    console.log(
      `[urun-giris] ${satirList.length} satır, ${lotList.length} lot gönderildi `
      + `(tip: ${girisTipiNorm}, fatura: ${faturaNo ?? '-'}, giris: ${girisNo ?? '-'}, sirket: ${cid ?? '-'})`,
    );

    if (girisTipiNorm === 'FATURASIZ' && !cid) {
      return res.status(400).json({
        success: false,
        error: 'Faturasız giriş için alıcı şirket seçimi zorunlu.',
      });
    }

    const orphanWarnings = await reportOrphanReceipts(faturaNo ?? '', cid);
    if (orphanWarnings.length) {
      console.warn('[urun-giris] yetim/yarım kayıt uyarıları:', orphanWarnings);
      hatalar.push(...orphanWarnings.map((w) => `⚠️ ${w}`));
    }

    // ── 0) CARİ PARTNER KONTROL / OLUŞTUR ─────────────────────────
    let gercekCariId = cariId;
    if (!gercekCariId && cariAdi?.trim()) {
      try {
        const existing = await execute('res.partner', 'search_read',
          [[['name', 'ilike', cariAdi.trim()], ['is_company', '=', true]]],
          { fields: ['id', 'name'], limit: 1 });
        if (existing.length > 0) {
          gercekCariId = existing[0].id;
        } else {
          gercekCariId = await execute('res.partner', 'create', [{ name: cariAdi.trim(), is_company: true, supplier_rank: 1 }]);
          sonuclar.yeniCari = { id: gercekCariId, name: cariAdi };
        }
      } catch (ce: any) {
        console.warn('[cari oluştur hata]', ce?.message);
      }
    }

    // Tedarikçi: fiziki tedarikçi varsa o, yoksa cari
    const tedarikciId = fizikiTedarikciId || gercekCariId;

    if (poGerekli && !tedarikciId) {
      return res.status(400).json({
        success: false,
        error: 'Tedarikçi/cari seçilmeden ürün girişi tamamlanamaz.',
      });
    }

    // ── 0.5) MALİYET DÖVİZ KARŞILIĞI KAYDI (yalnızca bundan sonraki girişler) ──
    // Her satırın TL maliyetinin o günün TCMB kuruyla dolar/euro karşılığını kalıcı
    // olarak saklar. SSKF Raporu bunu kullanarak "maliyet (giriş kuru)" (=birimFiyatTl)
    // ve "maliyet (güncel kur)" (=tutarUsd/tutarEur × bugünkü kur) hesaplar. Odoo
    // tarafındaki PO/fatura akışından bağımsızdır — o taraf başarısız olsa bile
    // maliyet kaydı denenir.
    try {
      const bugununKuru = await getOrFetchTodayRate();
      const girisTarihiVal = faturaTarihi ? new Date(faturaTarihi) : new Date();
      for (const satir of satirList) {
        const birimFiyatTl = Number(satir.birimFiyat);
        if (!birimFiyatTl) continue;
        const maliyetProductId = await resolveProductVariantId(satir.bizimUrunOdooId, satir.bizimUrunProductId, cid);
        if (!maliyetProductId) continue;
        await prisma.urunGirisMaliyet.create({
          data: {
            odooUrunId: maliyetProductId,
            urunAdi: satir.bizimUrunAdi || satir.tedarikciUrunAdi || '',
            faturaNo: faturaNo || null,
            girisTarihi: girisTarihiVal,
            miktar: new Prisma.Decimal(satir.miktar || 1),
            birimFiyatTl: new Prisma.Decimal(birimFiyatTl),
            kurUsd: new Prisma.Decimal(bugununKuru.usd),
            kurEur: new Prisma.Decimal(bugununKuru.eur),
            tutarUsd: new Prisma.Decimal(birimFiyatTl / bugununKuru.usd),
            tutarEur: new Prisma.Decimal(birimFiyatTl / bugununKuru.eur),
          },
        });
      }
    } catch (maliyetErr: any) {
      console.warn('[urun-giris] maliyet döviz kaydı hatası:', maliyetErr?.message);
    }

    // ── 1) SATIN ALMA SİPARİŞİ (purchase.order) ───────────────────
    let poId: number | null = null;
    let poLineCount = 0;
    try {
      // FATURASIZ: PO yok — aşağıda createFaturasizIncomingPicking ile stok yazılır
      if (poGerekli && tedarikciId && satirList.length > 0) {
        const poVals: Record<string, any> = {
          partner_id: tedarikciId,
          date_order: faturaTarihi || new Date().toISOString().slice(0, 10),
          origin: faturaNo || '',
          partner_ref: faturaNo || '',
          notes: `Fatura: ${faturaNo} | Cari: ${cariAdi} | Fiziki Tedarikçi: ${fizikiTedarikciAdi || '-'}`,
        };
        if (cid) poVals.company_id = cid;

        poId = await execute('purchase.order', 'create', [poVals], {}, cid);

        for (const satir of satirList) {
          const productId = await resolveProductVariantId(
            satir.bizimUrunOdooId,
            satir.bizimUrunProductId,
            cid,
          );
          if (!productId) {
            console.warn('[urun-giris] PO satır atlandı — ürün bulunamadı:', satir.id, satir.bizimUrunOdooId);
            continue;
          }
          await execute(
            'purchase.order.line',
            'create',
            [{
              order_id: poId,
              product_id: productId,
              name: satir.tedarikciUrunAdi || satir.bizimUrunAdi || '',
              product_qty: satir.miktar || 1,
              price_unit: Number(satir.birimFiyat) || 0,
              discount: Number(satir.iskonto) || 0,
              date_planned: faturaTarihi || new Date().toISOString().slice(0, 10),
              product_uom: 1,
            }],
            {},
            cid,
          );
          poLineCount++;
        }

        console.log(`[urun-giris] PO ${poId}: ${poLineCount}/${satirList.length} satır oluşturuldu`);

        if (poLineCount > 0) {
          try {
            await execute('purchase.order', 'button_confirm', [[poId]], {}, cid);
          } catch (ce: any) {
            console.warn('[po confirm]', ce?.message);
          }

          const poData = await execute('purchase.order', 'read', [[poId]], { fields: ['id', 'name'] }, cid);
          sonuclar.purchaseOrder = { id: poId, name: poData[0]?.name, satirSayisi: poLineCount };
        } else {
          try {
            await execute('purchase.order', 'unlink', [[poId]], {}, cid);
          } catch { /* boş PO silinemezse sorun değil */ }
          poId = null;
        }
      }
    } catch (poErr: any) {
      console.error('[purchase.order hata]', poErr?.message);
      const poMsg = `Satın alma siparişi: ${odooErrText(poErr).slice(0, 300)}`;
      if (poGerekli) {
        return res.status(400).json({ success: false, error: poMsg });
      }
      hatalar.push(poMsg);
    }

    if (poGerekli && !poId) {
      return res.status(400).json({
        success: false,
        error: 'Satın alma siparişi oluşturulamadı. Lot/seri numarası oluşturulmadı.',
        hatalar: hatalar.length > 0 ? hatalar : undefined,
      });
    }

    // ── 2) STOK LOT'LARI (stock.lot) + BARKOD ─────────────────────
    const lotIdMap: Record<string, number> = {};
    const barkodGuncellenenler = new Set<number>();
    try {
      for (const lot of lotList) {
        if (!lot.lotNo) continue;
        try {
          const productId = await resolveProductVariantId(
            lot.bizimUrunOdooId,
            lot.bizimUrunProductId,
            cid,
          );
          if (!productId) {
            console.warn('[urun-giris] lot atlandı — ürün bulunamadı:', lot.lotNo);
            continue;
          }

          const { lotId } = await getOrCreateStockLot(lot.lotNo, productId, cid, lot.barkod, lot.utsKodu);
          lotIdMap[lot.id] = lotId;

          if (lot.barkod && productId && !barkodGuncellenenler.has(productId)) {
            try {
              await execute('product.product', 'write', [[productId], { barcode: lot.barkod }], {}, cid);
              barkodGuncellenenler.add(productId);
            } catch (be: any) {
              console.warn('[barkod güncelle]', be?.message);
            }
          }
        } catch (le: any) {
          const lotMsg = odooErrText(le);
          console.warn('[stock.lot hata]', lot.lotNo, lotMsg.slice(0, 200));
          hatalar.push(`Lot ${lot.lotNo}: ${lotMsg.slice(0, 150)}`);
        }
      }
      sonuclar.lotSayisi = Object.keys(lotIdMap).length;
      console.log(`[urun-giris] lotIdMap: ${sonuclar.lotSayisi}/${lotList.length}`);
    } catch (lotErr: any) {
      hatalar.push(`Lot oluşturma: ${odooErrText(lotErr)}`);
    }

    // ── 3) STOK HAREKETİ ONAYLA (picking validate) ────────────────
    let stokGirisiBasarili = false;
    if (poId) {
      try {
        const pickings = await execute(
          'stock.picking',
          'search_read',
          [[['purchase_id', '=', poId]]],
          { fields: ['id', 'name', 'state'], limit: 5 },
          cid,
        );

        console.log(`[urun-giris] PO ${poId} için ${pickings.length} picking bulundu`);

        if (!pickings.length) {
          const msg = `PO ${poId} için ürün kabul (stock.picking) bulunamadı — stok girişi yapılamadı`;
          console.error(`[urun-giris] ${msg}`);
          hatalar.push(msg);
        }

        for (const picking of pickings) {
          if (picking.state === 'done') {
            stokGirisiBasarili = true;
            sonuclar.picking = { id: picking.id, name: picking.name, state: 'done' };
            continue;
          }
          try {
            await assignLotsAndValidatePicking(picking.id, lotList, lotIdMap, cid);
            const validated = await execute(
              'stock.picking',
              'read',
              [[picking.id]],
              { fields: ['id', 'name', 'state'] },
              cid,
            );
            const finalState = validated[0]?.state;
            sonuclar.picking = {
              id: picking.id,
              name: picking.name,
              state: finalState,
            };
            stokGirisiBasarili = finalState === 'done';
            console.log(`[urun-giris] picking ${picking.name} → ${finalState}`);
            if (!stokGirisiBasarili) {
              hatalar.push(`Stok girişi tamamlanamadı: ${picking.name} state=${finalState}`);
            }
          } catch (ve: any) {
            const msg = odooErrText(ve);
            console.error('[urun-giris] picking validate HATA:', msg.slice(0, 400));
            hatalar.push(`Stok girişi başarısız (${picking.name}): ${msg.slice(0, 300)}`);
            sonuclar.picking = { id: picking.id, name: picking.name, state: picking.state, hata: msg.slice(0, 300) };
          }
        }
      } catch (pe: any) {
        const msg = odooErrText(pe);
        console.error('[urun-giris] picking bul/validate HATA:', msg.slice(0, 400));
        hatalar.push(`Stok hareketi aranırken hata: ${msg.slice(0, 300)}`);
      }
    } else if (girisTipiNorm === 'FATURASIZ' && cid && Object.keys(lotIdMap).length > 0) {
      try {
        const manualPickingId = await createFaturasizIncomingPicking(
          cid,
          girisNo ?? '',
          satirList,
          faturaTarihi,
        );
        await assignLotsAndValidatePicking(manualPickingId, lotList, lotIdMap, cid);
        const validated = await execute(
          'stock.picking',
          'read',
          [[manualPickingId]],
          { fields: ['id', 'name', 'state'] },
          cid,
        );
        const finalState = validated[0]?.state;
        sonuclar.picking = {
          id: manualPickingId,
          name: validated[0]?.name,
          state: finalState,
        };
        stokGirisiBasarili = finalState === 'done';
        console.log(`[urun-giris] faturasız picking ${validated[0]?.name} → ${finalState}`);
        if (!stokGirisiBasarili) {
          hatalar.push(`Stok girişi tamamlanamadı: ${validated[0]?.name} state=${finalState}`);
        }
      } catch (fe: any) {
        const msg = odooErrText(fe);
        console.error('[urun-giris] faturasız picking HATA:', msg.slice(0, 400));
        hatalar.push(`Faturasız stok girişi başarısız: ${msg.slice(0, 300)}`);
      }
    } else if (girisTipiNorm === 'FATURASIZ' && cid && Object.keys(lotIdMap).length === 0) {
      hatalar.push('Lot oluşturulamadığı için stok girişi yapılamadı');
    }

    sonuclar.stokGirisiBasarili = stokGirisiBasarili;
    sonuclar.orphanWarnings = orphanWarnings;

    // ── 4) SATIN ALMA FATURASI (stok girişi başarılıysa oluştur + onayla) ──
    if (poId && gercekCariId && stokGirisiBasarili) {
      let invoiceId: number | null = null;
      try {
        const poLines = await execute(
          'purchase.order.line',
          'search_read',
          [[['order_id', '=', poId]]],
          { fields: ['id', 'product_id', 'product_qty', 'qty_received'], order: 'id asc' },
          cid,
        );

        const poLineUsage = new Map<number, number>();
        const invLines = [];
        for (const satir of satirList) {
          const productId = await resolveProductVariantId(
            satir.bizimUrunOdooId,
            satir.bizimUrunProductId,
            cid,
          );
          if (!productId) continue;
          const matching = (poLines as any[]).filter((pl) => pl.product_id?.[0] === productId);
          const idx = poLineUsage.get(productId) ?? 0;
          const purchaseLineId = matching[idx]?.id ?? false;
          poLineUsage.set(productId, idx + 1);

          invLines.push([0, 0, {
            product_id: productId,
            name: satir.tedarikciUrunAdi || satir.bizimUrunAdi || '',
            quantity: satir.miktar || 1,
            price_unit: Number(satir.birimFiyat) || 0,
            discount: Number(satir.iskonto) || 0,
            purchase_line_id: purchaseLineId,
          }]);
        }

        if (invLines.length > 0) {
          const invVals: Record<string, any> = {
            move_type: 'in_invoice',
            partner_id: gercekCariId,
            invoice_date: faturaTarihi || new Date().toISOString().slice(0, 10),
            ref: faturaNo || '',
            invoice_origin: sonuclar.purchaseOrder?.name || '',
            invoice_line_ids: invLines,
          };
          if (cid) invVals.company_id = cid;

          invoiceId = await execute('account.move', 'create', [invVals], {}, cid);
          const invData = await execute('account.move', 'read',
            [[invoiceId]], { fields: ['id', 'name', 'state'] }, cid);
          sonuclar.vendorBill = { id: invoiceId, name: invData[0]?.name, state: invData[0]?.state };

          await execute('account.move', 'write',
            [[invoiceId], { narration: `[POS-ISLENDI] ${new Date().toISOString().slice(0, 10)}` }], {}, cid);
        } else {
          // PO'da mevcut taslak fatura varsa onu kullan
          const poData = await execute('purchase.order', 'read', [[poId]], { fields: ['invoice_ids'] }, cid);
          const existingIds: number[] = poData?.[0]?.invoice_ids ?? [];
          for (const eid of existingIds) {
            const inv = (await execute('account.move', 'read', [[eid]], { fields: ['state', 'move_type'] }, cid))?.[0];
            if (inv?.move_type === 'in_invoice' && inv?.state === 'draft') {
              invoiceId = eid;
              break;
            }
          }
        }

        if (invoiceId) {
          const postResult = await postVendorBill(invoiceId, cid);
          sonuclar.faturaOnay = postResult;
          if (postResult.ok) {
            sonuclar.vendorBill = {
              ...(sonuclar.vendorBill ?? { id: invoiceId }),
              id: invoiceId,
              name: postResult.name,
              state: 'posted',
            };
          } else {
            console.error('[urun-giris] fatura onay HATA:', postResult.error);
            hatalar.push(`Fatura onaylanamadı: ${postResult.error ?? 'bilinmeyen hata'}`);
          }
        }
      } catch (ie: any) {
        const msg = odooErrText(ie);
        console.error('[vendor bill hata]', msg.slice(0, 300));
        hatalar.push(`Satın alma faturası: ${msg.slice(0, 200)}`);
      }
    } else if (poId && gercekCariId && !stokGirisiBasarili) {
      console.log('[urun-giris] stok girişi başarısız — tedarikçi faturası oluşturulmadı/onaylanmadı');
    }

    // ── 5) SATIŞ FİYATI GÜNCELLE (stok girişi tamamlandıysa) ───────
    if (stokGirisiBasarili) {
      try {
        const fiyatGuncellenenler = new Set<number>();
        for (const lot of lotList) {
          if (!lot.satisFiyati) continue;
          const templateId = await resolveProductTemplateId(
            lot.bizimUrunOdooId,
            lot.bizimUrunProductId,
            cid,
          );
          if (!templateId || fiyatGuncellenenler.has(templateId)) continue;
          const fiyat = Number(lot.satisFiyati);
          if (fiyat <= 0) continue;
          await execute('product.template', 'write', [[templateId], { list_price: fiyat }], {}, cid);
          fiyatGuncellenenler.add(templateId);
        }
        sonuclar.fiyatGuncellenen = fiyatGuncellenenler.size;
      } catch (fyErr: any) {
        console.warn('[satis fiyati hata]', fyErr?.message);
      }
    }

    const success = stokGirisiBasarili && (sonuclar.lotSayisi ?? 0) > 0;

    if (success) {
      const utsBildirimId = String(req.body?.utsBildirimId ?? '').trim() || null;
      if (utsBildirimId) {
        try {
          await markUtsUrunGirisiTamamlandi({ barkod: '', utsBildirimId });
        } catch (markErr) {
          console.warn('[urun-giris] UTS bildirim işaretleme:', markErr);
        }
      }
      for (const lot of lotList) {
        const barkod = String(lot?.utsKodu ?? lot?.barkod ?? '').trim();
        if (!barkod) continue;
        const lotNo = lot?.lotNo != null ? String(lot.lotNo).trim() : null;
        const seriNo = lotNo;
        try {
          await markUtsUrunGirisiTamamlandi({ barkod, seriNo, lotNo, utsBildirimId: null });
        } catch (markErr) {
          console.warn('[urun-giris] UTS ürün girişi işaretleme:', markErr);
        }
      }
    }

    return res.json({
      success,
      stokGirisiBasarili,
      sonuclar,
      hatalar: hatalar.length > 0 ? hatalar : undefined,
      ...(!stokGirisiBasarili && !hatalar.length
        ? { error: 'Stok girişi tamamlanamadı (picking validate edilemedi).' }
        : {}),
      ...(!stokGirisiBasarili && (sonuclar.lotSayisi ?? 0) > 0
        ? { error: 'Lot oluşturuldu ancak stok girişi tamamlanamadı.' }
        : {}),
    });
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[urun-giris hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── LOKASYON STOĞU (stock.quant) ──────────────────────────────────
router.get('/lokasyon-stok', async (req: Request, res: Response) => {
  try {
    const lokasyonId = Number(req.query.lokasyonId);
    const q = String(req.query.q ?? '').trim();
    if (!lokasyonId) return res.status(400).json({ error: 'lokasyonId zorunlu' });

    const domain: any[] = [
      ['location_id', '=', lokasyonId],
      ['quantity', '>', 0],
    ];
    if (q) domain.push(['product_id.name', 'ilike', q]);

    const quants = await execute('stock.quant', 'search_read', [domain], {
      fields: ['id', 'product_id', 'lot_id', 'quantity', 'reserved_quantity', 'location_id'],
      limit: 200,
      order: 'product_id asc',
    });

    const result = quants.map((quant: any) => ({
      id: quant.id,
      productId: quant.product_id?.[0],
      productName: quant.product_id?.[1] ?? '',
      lotId: quant.lot_id?.[0] ?? null,
      lotName: quant.lot_id?.[1] ?? '',
      quantity: quant.quantity,
      reservedQty: quant.reserved_quantity,
      locationId: quant.location_id?.[0],
      locationName: quant.location_id?.[1] ?? '',
    }));

    return res.json({ data: result });
  } catch (err: any) {
    console.error('[lokasyon-stok hata]', err?.message);
    return res.json({ data: [] });
  }
});

router.get('/stok-kontrol-urun', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.query.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: 'productId zorunlu' });
    }
    const data = await stokYonetimi.getUrunStokTumSubeler(productId);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── BARKOD / LOT İLE ÜRÜN BUL ─────────────────────────────────────
router.get('/lot-ara', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q || q.length < 2) return res.json({ data: [] });

    // Lot/seri no ile ara
    const lots = await execute('stock.lot', 'search_read', [
      [['name', 'ilike', q]],
    ], {
      fields: ['id', 'name', 'product_id', 'ref'],
      limit: 20,
    });

    // Her lot için mevcut lokasyonu bul
    const result = [];
    for (const lot of lots) {
      try {
        const quants = await execute('stock.quant', 'search_read', [
          [['lot_id', '=', lot.id], ['quantity', '>', 0]],
        ], {
          fields: ['id', 'location_id', 'quantity'],
          limit: 5,
        });
        result.push({
          lotId: lot.id,
          lotName: lot.name,
          barkod: lot.ref || '',
          productId: lot.product_id?.[0],
          productName: lot.product_id?.[1] ?? '',
          lokasyonlar: quants.map((qnt: any) => ({
            locationId: qnt.location_id?.[0],
            locationName: qnt.location_id?.[1] ?? '',
            quantity: qnt.quantity,
          })),
        });
      } catch { /* lot quant okunamadı */ }
    }

    // Barkod ile de ara (lot.ref)
    const lotsByRef = await execute('stock.lot', 'search_read', [
      [['ref', '=', q]],
    ], {
      fields: ['id', 'name', 'product_id', 'ref'],
      limit: 5,
    });
    for (const lot of lotsByRef) {
      if (result.find((r) => r.lotId === lot.id)) continue;
      const quants = await execute('stock.quant', 'search_read', [
        [['lot_id', '=', lot.id], ['quantity', '>', 0]],
      ], { fields: ['id', 'location_id', 'quantity'], limit: 5 });
      result.push({
        lotId: lot.id,
        lotName: lot.name,
        barkod: lot.ref || '',
        productId: lot.product_id?.[0],
        productName: lot.product_id?.[1] ?? '',
        lokasyonlar: quants.map((qnt: any) => ({
          locationId: qnt.location_id?.[0],
          locationName: qnt.location_id?.[1] ?? '',
          quantity: qnt.quantity,
        })),
      });
    }

    return res.json({ data: result });
  } catch (err: any) {
    console.error('[lot-ara hata]', err?.message);
    return res.json({ data: [] });
  }
});

// ── TOPLU TRANSFER OLUŞTUR (stock.picking internal) ───────────────
router.post('/transfer-olustur', async (req, res) => {
  try {
    const { kalemler, notlar } = req.body ?? {};
    if (!kalemler?.length) return res.status(400).json({ error: 'Kalemler zorunlu' });

    const result = await olusturTransfer({ kalemler, notlar });
    return res.json(result);
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err);
    console.error('[transfer-olustur hata]', msg);
    return res.status(500).json({ error: msg });
  }
});

router.post('/transfer-kabul', async (req, res) => {
  try {
    const { kabulPickingId, transferRef, sayimlar } = req.body ?? {};
    const pickingId = Number(kabulPickingId);
    if (!Number.isFinite(pickingId) || pickingId <= 0) {
      return res.status(400).json({ success: false, message: 'kabulPickingId zorunlu' });
    }

    const result = await kabulEtTransfer({
      kabulPickingId: pickingId,
      transferRef,
      sayimlar,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[transfer-kabul hata]', msg);
    return res.status(500).json({ success: false, message: msg });
  }
});

router.get('/transfer-aksiyon-log', async (req, res) => {
  try {
    const transferRef = typeof req.query.transferRef === 'string' ? req.query.transferRef.trim() : undefined;
    const refsRaw = typeof req.query.transferRefs === 'string' ? req.query.transferRefs : '';
    const transferRefs = refsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
    const logs = await listTransferAksiyonLogs({ transferRef, transferRefs, limit });
    return res.json({ logs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[transfer-aksiyon-log hata]', msg);
    return res.status(500).json({ error: msg });
  }
});



// ── TRANSFER İÇİN ÜRÜN/LOT ARAMA ──────────────────────────────────
router.get('/transfer-urun-ara', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim()
    if (!q || q.length < 2) return res.json({ data: [] })

    // 1) Lot/seri no ile ara
    const lotDomain: any[] = [
      '|', '|', '|', '|',
      ['name', 'ilike', q],
      ['ref', 'ilike', q],
      ['product_id.name', 'ilike', q],
      ['product_id.default_code', 'ilike', q],
      ['product_id.barcode', 'ilike', q],
    ]

    const lots = await execute('stock.lot', 'search_read', [lotDomain], {
      fields: ['id', 'name', 'ref', 'product_id'],
      limit: 30,
    })

    const result = []
    for (const lot of lots) {
      try {
        const quants = await execute('stock.quant', 'search_read', [
          [['lot_id', '=', lot.id], ['quantity', '>', 0]]
        ], {
          fields: ['id', 'location_id', 'quantity'],
          limit: 5,
        })
        for (const quant of quants) {
          result.push({
            lotId: lot.id,
            lotName: lot.name,
            barkod: lot.ref || '',
            productId: lot.product_id?.[0],
            productName: lot.product_id?.[1] ?? '',
            locationId: quant.location_id?.[0],
            locationName: quant.location_id?.[1] ?? '',
            quantity: quant.quantity,
            quantId: quant.id,
          })
        }
      } catch { }
    }

    return res.json({ data: result })
  } catch (err: any) {
    console.error('[transfer-urun-ara hata]', err?.message)
    return res.json({ data: [] })
  }
})

router.get('/test-sirket-auth', async (req, res) => {
  try {
    const { execute: exec } = await import('../odoo/odoo.service')
    const results: any[] = []
    for (const sirketId of [1, 2, 3, 4]) {
      try {
        const test = await exec('res.company', 'search_read',
          [[['id', '=', sirketId]]],
          { fields: ['id', 'name'], limit: 1 },
          sirketId)
        results.push({ sirketId, basarili: true, sirket: test[0]?.name })
      } catch (e: any) {
        results.push({ sirketId, basarili: false, hata: e?.message?.slice(0, 100) })
      }
    }
    return res.json({ results })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message })
  }
})

router.get('/urun-id-kontrol', async (req, res) => {
  try {
    const id = Number(req.query.id ?? 2)
    
    const tmpl = await execute('product.template', 'read', [[id]], { fields: ['id', 'name'] })
    const prod = await execute('product.product', 'read', [[id]], { fields: ['id', 'name', 'product_tmpl_id'] })
    const lot = await execute('stock.lot', 'read', [[1]], { fields: ['id', 'name', 'product_id'] })
    
    return res.json({ template: tmpl[0], product: prod[0], lot: lot[0] })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.get('/lokasyon-sirket-harita', async (req, res) => {
  try {
    const lokasyonIds = [53, 54, 55, 56, 57, 58, 59, 60, 61, 62]
    const lokasyonlar = await execute('stock.location', 'search_read',
      [[['id', 'in', lokasyonIds]]],
      { fields: ['id', 'name', 'complete_name', 'company_id'], limit: 20 })
    return res.json({ data: lokasyonlar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── MUHASEBE KURULUM (her şirket için otomatik) ────────────────────
router.post('/muhasebe-kurulum', async (req, res) => {
  try {
    const sonuclar: any[] = []

    for (const sirketId of [2, 3, 4]) { // NG, ADESE, POTENTIAL
      const sirketSonuc: any = { sirketId, islemler: [] }

      // 1) Hesap planı — temel hesaplar oluştur
      const temelHesaplar = [
        { code: '600', name: 'Yurt İçi Satışlar', account_type: 'income' },
        { code: '620', name: 'Satılan Malların Maliyeti', account_type: 'expense' },
        { code: '153', name: 'Ticari Mallar', account_type: 'asset_current' },
        { code: '120', name: 'Alıcılar', account_type: 'asset_receivable', reconcile: true },
        { code: '320', name: 'Satıcılar', account_type: 'liability_payable', reconcile: true },
        { code: '100', name: 'Kasa', account_type: 'asset_cash' },
      ]

      for (const hesap of temelHesaplar) {
        try {
          const existing = await execute('account.account', 'search_read',
            [[['code', '=', hesap.code], ['company_id', '=', sirketId]]],
            { fields: ['id', 'name'], limit: 1 }, sirketId)

          if (existing.length === 0) {
            const vals: any = {
              code: hesap.code,
              name: hesap.name,
              account_type: hesap.account_type,
              company_id: sirketId,
            }
            if (hesap.reconcile) vals.reconcile = true
            await execute('account.account', 'create', [vals], {}, sirketId)
            sirketSonuc.islemler.push(`Hesap oluşturuldu: ${hesap.code} ${hesap.name}`)
          } else {
            sirketSonuc.islemler.push(`Hesap mevcut: ${hesap.code}`)
          }
        } catch (he: any) {
          sirketSonuc.islemler.push(`Hesap hata: ${hesap.code} — ${he?.message?.slice(0, 80)}`)
        }
      }

      // 2) Satış journal'ı
      try {
        const satisJournal = await execute('account.journal', 'search_read',
          [[['type', '=', 'sale'], ['company_id', '=', sirketId]]],
          { fields: ['id', 'name'], limit: 1 }, sirketId)

        if (satisJournal.length === 0) {
          // Alıcılar hesabını bul
          const aliciHesap = await execute('account.account', 'search_read',
            [[['code', '=', '120'], ['company_id', '=', sirketId]]],
            { fields: ['id'], limit: 1 }, sirketId)

          await execute('account.journal', 'create', [{
            name: 'Müşteri Faturaları',
            type: 'sale',
            code: 'INV',
            company_id: sirketId,
            default_account_id: aliciHesap[0]?.id || false,
          }], {}, sirketId)
          sirketSonuc.islemler.push('Satış journal oluşturuldu')
        } else {
          sirketSonuc.islemler.push('Satış journal mevcut')
        }
      } catch (je: any) {
        sirketSonuc.islemler.push(`Satış journal hata: ${je?.message?.slice(0, 80)}`)
      }

      // 3) Alış journal'ı
      try {
        const alisJournal = await execute('account.journal', 'search_read',
          [[['type', '=', 'purchase'], ['company_id', '=', sirketId]]],
          { fields: ['id', 'name'], limit: 1 }, sirketId)

        if (alisJournal.length === 0) {
          const saticiHesap = await execute('account.account', 'search_read',
            [[['code', '=', '320'], ['company_id', '=', sirketId]]],
            { fields: ['id'], limit: 1 }, sirketId)

          await execute('account.journal', 'create', [{
            name: 'Tedarikçi Faturaları',
            type: 'purchase',
            code: 'BILL',
            company_id: sirketId,
          }], {}, sirketId)
          sirketSonuc.islemler.push('Alış journal oluşturuldu')
        } else {
          sirketSonuc.islemler.push('Alış journal mevcut')
        }
      } catch (je: any) {
        sirketSonuc.islemler.push(`Alış journal hata: ${je?.message?.slice(0, 80)}`)
      }

      // 4) Ürün kategorisi gelir/gider hesaplarını güncelle
      try {
        const gelirHesap = await execute('account.account', 'search_read',
          [[['code', '=', '600'], ['company_id', '=', sirketId]]],
          { fields: ['id'], limit: 1 }, sirketId)
        const giderHesap = await execute('account.account', 'search_read',
          [[['code', '=', '620'], ['company_id', '=', sirketId]]],
          { fields: ['id'], limit: 1 }, sirketId)
        const stokHesap = await execute('account.account', 'search_read',
          [[['code', '=', '153'], ['company_id', '=', sirketId]]],
          { fields: ['id'], limit: 1 }, sirketId)

        // Tüm ürün kategorilerini güncelle
        const kategoriler = await execute('product.category', 'search_read',
          [[]], { fields: ['id', 'name'], limit: 100 }, sirketId)

        for (const kat of kategoriler) {
          const vals: any = {}
          if (gelirHesap[0]?.id) vals.property_account_income_categ_id = gelirHesap[0].id
          if (giderHesap[0]?.id) vals.property_account_expense_categ_id = giderHesap[0].id
          if (stokHesap[0]?.id) vals.property_stock_account_input_categ_id = stokHesap[0].id
          if (Object.keys(vals).length > 0) {
            await execute('product.category', 'write', [[kat.id], vals], {}, sirketId)
          }
        }
        sirketSonuc.islemler.push(`${kategoriler.length} kategori hesapları güncellendi`)
      } catch (ke: any) {
        sirketSonuc.islemler.push(`Kategori hesap hata: ${ke?.message?.slice(0, 80)}`)
      }

      sonuclar.push(sirketSonuc)
    }

    return res.json({ success: true, sonuclar })
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err)
    console.error('[muhasebe-kurulum hata]', msg)
    return res.status(500).json({ error: msg })
  }
})

// ── FİNANSAL VARLIK CRUD ──────────────────────────────────────────
router.get('/finansal-varliklar', async (req, res) => {
  try {
    const varliklar = await prisma.finansalVarlik.findMany({
      where: { aktif: true },
      orderBy: [{ sirketAdi: 'asc' }, { tip: 'asc' }, { ad: 'asc' }],
    })
    return res.json({ data: varliklar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/finansal-varlik-ekle', async (req, res) => {
  try {
    const { ad, tip, katman, sirketId, sirketAdi, subeId, subeAdi, para_birimi, aciklama, odooHesapId } = req.body
    if (!ad?.trim() || !tip || !katman) return res.status(400).json({ error: 'ad, tip, katman zorunlu' })
    const varlik = await prisma.finansalVarlik.create({
      data: { ad, tip, katman, sirketId, sirketAdi, subeId, subeAdi, para_birimi: para_birimi || 'TRY', aciklama, odooHesapId }
    })
    return res.json({ success: true, data: varlik })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── ORTAKLAR CRUD ─────────────────────────────────────────────────
router.get('/ortaklar', async (req, res) => {
  try {
    const ortaklar = await prisma.ortak.findMany({
      where: { aktif: true },
      orderBy: { ad: 'asc' },
    })
    return res.json({ data: ortaklar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/ortak-ekle', async (req, res) => {
  try {
    const { ad, soyad, telefon, email } = req.body
    if (!ad?.trim()) return res.status(400).json({ error: 'Ad zorunlu' })
    const ortak = await prisma.ortak.create({ data: { ad, soyad, telefon, email } })
    return res.json({ success: true, data: ortak })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── FİNANS HAREKETİ ───────────────────────────────────────────────
router.get('/finans-hareketler', async (req, res) => {
  try {
    const { sirketId, katman, tip, baslangic, bitis, limit } = req.query
    const where: any = { iptalEdildi: false }
    if (sirketId) where.sirketId = Number(sirketId)
    if (katman) where.katman = String(katman)
    if (tip) where.tip = String(tip)
    if (baslangic || bitis) {
      where.tarih = {}
      if (baslangic) where.tarih.gte = new Date(String(baslangic))
      if (bitis) where.tarih.lte = new Date(String(bitis))
    }
    const hareketler = await prisma.finansHareket.findMany({
      where,
      orderBy: { tarih: 'desc' },
      take: Number(limit ?? 100),
      include: { kaynakVarlik: true, hedefVarlik: true, ortak: true },
    })
    return res.json({ data: hareketler })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/finans-hareket-ekle', async (req, res) => {
  try {
    const {
      tarih, tip, katman, kaynakVarlikId, hedefVarlikId, ortakId,
      sirketId, sirketAdi, subeId, tutar, paraBirimi, odemeYontemi,
      aciklama, evrakNo, odooFaturaId, onaylayan, olusturan
    } = req.body
    if (!tip || !katman || !tutar) return res.status(400).json({ error: 'tip, katman, tutar zorunlu' })
    const hareket = await prisma.finansHareket.create({
      data: {
        tarih: tarih ? new Date(tarih) : new Date(),
        tip, katman, kaynakVarlikId, hedefVarlikId, ortakId,
        sirketId, sirketAdi, subeId,
        tutar: Number(tutar), paraBirimi: paraBirimi || 'TRY',
        odemeYontemi, aciklama, evrakNo,
        odooFaturaId, onaylayan, olusturan
      },
      include: { kaynakVarlik: true, hedefVarlik: true, ortak: true }
    })
    return res.json({ success: true, data: hareket })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── ORTAK CARİ ────────────────────────────────────────────────────
router.get('/ortak-cari', async (req, res) => {
  try {
    const { ortakId } = req.query
    const where: any = {}
    if (ortakId) where.ortakId = String(ortakId)
    const kayitlar = await prisma.ortakCari.findMany({
      where, orderBy: { tarih: 'desc' }, take: 200
    })
    // Bakiye hesapla
    const bakiyeMap: Record<string, number> = {}
    for (const k of kayitlar) {
      const key = `${k.ortakId}-${k.sirketId}`
      if (!bakiyeMap[key]) bakiyeMap[key] = 0
      bakiyeMap[key] += k.tip === 'ALACAK' ? k.tutar : -k.tutar
    }
    return res.json({ data: kayitlar, bakiyeler: bakiyeMap })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── FİNANS DASHBOARD (Özet) ───────────────────────────────────────
router.get('/finans-ozet', async (req, res) => {
  try {
    // Varlik bakiyeleri
    const varliklar = await prisma.finansalVarlik.findMany({ where: { aktif: true } })

    // Her varlık için hareket toplamları
    const ozetler = []
    for (const v of varliklar) {
      const girenler = await prisma.finansHareket.aggregate({
        where: { hedefVarlikId: v.id, iptalEdildi: false },
        _sum: { tutar: true }
      })
      const cikenler = await prisma.finansHareket.aggregate({
        where: { kaynakVarlikId: v.id, iptalEdildi: false },
        _sum: { tutar: true }
      })
      const bakiye = (girenler._sum.tutar ?? 0) - (cikenler._sum.tutar ?? 0)
      ozetler.push({ ...v, bakiye: Math.round(bakiye * 100) / 100 })
    }

    // Ortak bakiyeleri
    const ortaklar = await prisma.ortak.findMany({ where: { aktif: true } })
    const ortakBakiyeler = []
    for (const o of ortaklar) {
      const kayitlar = await prisma.ortakCari.findMany({ where: { ortakId: o.id } })
      const toplam = kayitlar.reduce((acc, k) => acc + (k.tip === 'ALACAK' ? k.tutar : -k.tutar), 0)
      ortakBakiyeler.push({ ...o, bakiye: Math.round(toplam * 100) / 100 })
    }

    return res.json({
      success: true,
      varliklar: ozetler,
      ortaklar: ortakBakiyeler,
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── MUHASEBE - FATURA LİSTESİ ─────────────────────────────────────
router.get('/muhasebe-faturalar', async (req, res) => {
  try {
    const { sirketId, tip, durum, baslangic, bitis, limit } = req.query
    const cSirketId = sirketId ? Number(sirketId) : null

    const domain: any[] = [['state', 'in', ['draft', 'posted', 'cancel']]]
    if (tip === 'satis') domain.push(['move_type', 'in', ['out_invoice', 'out_refund']])
    else if (tip === 'alis') domain.push(['move_type', 'in', ['in_invoice', 'in_refund']])
    else domain.push(['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']])
    if (durum === 'odenmemis') domain.push(['payment_state', 'in', ['not_paid', 'partial']])
    else if (durum === 'odenmis') domain.push(['payment_state', '=', 'paid'])
    if (baslangic) domain.push(['invoice_date', '>=', String(baslangic)])
    if (bitis) domain.push(['invoice_date', '<=', String(bitis)])
    if (cSirketId) domain.push(['company_id', '=', cSirketId])

    const faturalar = await execute('account.move', 'search_read', [domain], {
      fields: ['id', 'name', 'move_type', 'state', 'payment_state',
               'partner_id', 'invoice_date', 'invoice_date_due',
               'amount_untaxed', 'amount_tax', 'amount_total',
               'amount_residual', 'currency_id', 'company_id', 'ref'],
      order: 'invoice_date desc, id desc',
      limit: Number(limit ?? 100),
    }, cSirketId ?? undefined)

    const result = faturalar.map((f: any) => ({
      id: f.id,
      name: f.name,
      tip: f.move_type,
      durum: f.state,
      odemeDurum: f.payment_state,
      cariAdi: f.partner_id?.[1] ?? '',
      cariId: f.partner_id?.[0] ?? null,
      tarih: f.invoice_date,
      vadeTarihi: f.invoice_date_due,
      kdvHaric: f.amount_untaxed,
      kdv: f.amount_tax,
      toplam: f.amount_total,
      kalan: f.amount_residual,
      paraBirimi: f.currency_id?.[1] ?? 'TRY',
      sirketAdi: f.company_id?.[1] ?? '',
      sirketId: f.company_id?.[0] ?? null,
      ref: f.ref ?? '',
    }))

    return res.json({ data: result })
  } catch (err: any) {
    console.error('[muhasebe-faturalar hata]', err?.message)
    return res.json({ data: [] })
  }
})

// ── MUHASEBE - CARİ HESAPLAR ──────────────────────────────────────
router.get('/muhasebe-cari', async (req, res) => {
  try {
    const { sirketId, q } = req.query
    const cSirketId = sirketId ? Number(sirketId) : null

    const domain: any[] = [
      ['active', '=', true],
      ['is_company', '=', true],
    ]
    if (q) domain.push(['name', 'ilike', String(q)])

    const partnerler = await execute('res.partner', 'search_read', [domain], {
      fields: ['id', 'name', 'vat', 'phone', 'email', 'commercial_partner_id'],
      limit: 100,
      order: 'name asc',
    }, cSirketId ?? undefined)

    // Her cari için bakiye hesapla
    const result = []
    for (const p of partnerler) {
      try {
        const alacak = await execute('account.move.line', 'search_read', [[
          ['partner_id', '=', p.id],
          ['account_id.account_type', '=', 'asset_receivable'],
          ['reconciled', '=', false],
          ...(cSirketId ? [['company_id', '=', cSirketId]] : []),
        ]], { fields: ['debit', 'credit'], limit: 500 }, cSirketId ?? undefined)

        const borc = await execute('account.move.line', 'search_read', [[
          ['partner_id', '=', p.id],
          ['account_id.account_type', '=', 'liability_payable'],
          ['reconciled', '=', false],
          ...(cSirketId ? [['company_id', '=', cSirketId]] : []),
        ]], { fields: ['debit', 'credit'], limit: 500 }, cSirketId ?? undefined)

        const alacakBakiye = alacak.reduce((a: number, l: any) => a + (l.debit - l.credit), 0)
        const borcBakiye = borc.reduce((a: number, l: any) => a + (l.credit - l.debit), 0)

        if (alacakBakiye !== 0 || borcBakiye !== 0) {
          result.push({
            id: p.id,
            ad: p.name,
            vat: p.vat ?? '',
            telefon: p.phone ?? '',
            alacak: Math.round(alacakBakiye * 100) / 100,
            borc: Math.round(borcBakiye * 100) / 100,
            net: Math.round((alacakBakiye - borcBakiye) * 100) / 100,
          })
        }
      } catch { }
    }

    result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    return res.json({ data: result })
  } catch (err: any) {
    console.error('[muhasebe-cari hata]', err?.message)
    return res.json({ data: [] })
  }
})

// ── MUHASEBE DASHBOARD ────────────────────────────────────────────
router.get('/muhasebe-dashboard', async (req, res) => {
  try {
    const buAy = new Date()
    const ayBaslangic = `${buAy.getFullYear()}-${String(buAy.getMonth() + 1).padStart(2, '0')}-01`
    const ayBitis = new Date(buAy.getFullYear(), buAy.getMonth() + 1, 0).toISOString().slice(0, 10)
    const bugun = new Date().toISOString().slice(0, 10)

    const sirketler = [
      { id: 1, ad: 'GÜVEN OPTİK 1959' },
      { id: 2, ad: 'NG' },
      { id: 3, ad: 'ADESE' },
      { id: 4, ad: 'POTENTIAL' },
    ]

    const sonuclar = []
    for (const sirket of sirketler) {
      try {
        const [satisAlacak, alisBorc, buAySatis, buAyAlis, vadesiGecmis] = await Promise.all([
          execute('account.move', 'search_read', [[
            ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
            ['payment_state', 'in', ['not_paid', 'partial']], ['company_id', '=', sirket.id],
          ]], { fields: ['amount_residual'], limit: 500 }, sirket.id),

          execute('account.move', 'search_read', [[
            ['move_type', '=', 'in_invoice'], ['state', '=', 'posted'],
            ['payment_state', 'in', ['not_paid', 'partial']], ['company_id', '=', sirket.id],
          ]], { fields: ['amount_residual'], limit: 500 }, sirket.id),

          execute('account.move', 'search_read', [[
            ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
            ['invoice_date', '>=', ayBaslangic], ['invoice_date', '<=', ayBitis],
            ['company_id', '=', sirket.id],
          ]], { fields: ['amount_untaxed'], limit: 500 }, sirket.id),

          execute('account.move', 'search_read', [[
            ['move_type', '=', 'in_invoice'], ['state', '=', 'posted'],
            ['invoice_date', '>=', ayBaslangic], ['invoice_date', '<=', ayBitis],
            ['company_id', '=', sirket.id],
          ]], { fields: ['amount_untaxed'], limit: 500 }, sirket.id),

          execute('account.move', 'search_read', [[
            ['move_type', 'in', ['out_invoice', 'in_invoice']], ['state', '=', 'posted'],
            ['payment_state', 'in', ['not_paid', 'partial']],
            ['invoice_date_due', '<', bugun], ['company_id', '=', sirket.id],
          ]], { fields: ['amount_residual', 'move_type'], limit: 500 }, sirket.id),
        ])

        sonuclar.push({
          sirketId: sirket.id,
          sirketAdi: sirket.ad,
          toplamAlacak: Math.round(satisAlacak.reduce((a: number, f: any) => a + (f.amount_residual || 0), 0) * 100) / 100,
          toplamBorc: Math.round(alisBorc.reduce((a: number, f: any) => a + (f.amount_residual || 0), 0) * 100) / 100,
          buAySatis: Math.round(buAySatis.reduce((a: number, f: any) => a + (f.amount_untaxed || 0), 0) * 100) / 100,
          buAyAlis: Math.round(buAyAlis.reduce((a: number, f: any) => a + (f.amount_untaxed || 0), 0) * 100) / 100,
          vadesiGecmisSayisi: vadesiGecmis.length,
          vadesiGecmisToplam: Math.round(vadesiGecmis.reduce((a: number, f: any) => a + (f.amount_residual || 0), 0) * 100) / 100,
          faturaSayisi: { odenmemisSatis: satisAlacak.length, odenmemisAlis: alisBorc.length },
        })
      } catch (se: any) {
        sonuclar.push({ sirketId: sirket.id, sirketAdi: sirket.ad, hata: se?.message?.slice(0, 100) })
      }
    }

    return res.json({ success: true, data: sonuclar, donem: { baslangic: ayBaslangic, bitis: ayBitis } })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── PERSONEL CRUD ─────────────────────────────────────────────────
router.post('/personel-sube-guncelle', async (req, res, next) => {
  try {
    const { ad, soyad, subeId, subeAdi, odooEmployeeId } = req.body;
    const personel = await prisma.personel.findFirst({
      where: {
        ad: { contains: ad, mode: 'insensitive' },
        soyad: { contains: soyad, mode: 'insensitive' },
      },
    });
    if (!personel) {
      return res.status(404).json({ error: `${ad} ${soyad} bulunamadı` });
    }
    await prisma.personel.update({
      where: { id: personel.id },
      data: { subeId, subeAdi, odooEmployeeId },
    });
    return res.json({
      success: true,
      personel: `${personel.ad} ${personel.soyad}`,
      subeId,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-ekle', async (req, res) => {
  try {
    const { ad, soyad, telefon, email, pozisyon, subeId, subeAdi, sirketId, sirketAdi, bolgeId, maas, pdksId, aylikHedef, odooEmployeeId } = req.body
    if (!ad?.trim() || !soyad?.trim() || !pozisyon) return res.status(400).json({ error: 'Ad, soyad, pozisyon zorunlu' })
    const personel = await prisma.personel.create({
      data: { ad, soyad, telefon, email, pozisyon, subeId, subeAdi, sirketId, sirketAdi, bolgeId, maas: Number(maas) || 0, aylikHedef: aylikHedef ? Number(aylikHedef) : 0, pdksId, odooEmployeeId: odooEmployeeId ? Number(odooEmployeeId) : undefined }
    })
    return res.json({ success: true, data: personel })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/pdks-personel-import', async (req, res, next) => {
  try {
    const pdksRes = await axios.get(
      `https://app.patronpdks.com/api/v4/organizations/${process.env.PDKS_ORG_ID}/users`,
      {
        headers: {
          Token: process.env.PDKS_TOKEN,
          'Content-Type': 'application/json; charset=UTF-8',
          'Accept-Language': 'tr',
        },
      },
    );
    const pdksPersoneller = pdksRes.data?.data ?? [];

    const eklenen: Array<{ id: string; ad: string; soyad: string; pdksId: number }> = [];
    const guncellenen: Array<{ id: string; ad: string; soyad: string; pdksId: number }> = [];
    const atlanan: Array<{ ad: string; soyad: string; pdksId: number; sebep: string }> = [];

    for (const p of pdksPersoneller) {
      if (!p.name) continue;

      const parcalar = p.name.trim().split(' ');
      const soyad = parcalar[parcalar.length - 1];
      const ad = parcalar.slice(0, -1).join(' ') || soyad;

      const mevcut = await prisma.personel.findFirst({
        where: {
          OR: [
            { pdksId: String(p.id) },
            {
              ad: { equals: ad, mode: 'insensitive' },
              soyad: { equals: soyad, mode: 'insensitive' },
            },
          ],
        },
      });

      if (mevcut) {
        if (!mevcut.pdksId) {
          await prisma.personel.update({
            where: { id: mevcut.id },
            data: { pdksId: String(p.id) },
          });
          guncellenen.push({ id: mevcut.id, ad, soyad, pdksId: p.id });
        } else {
          atlanan.push({ ad, soyad, pdksId: p.id, sebep: 'Zaten mevcut' });
        }
      } else {
        const yeni = await prisma.personel.create({
          data: {
            ad,
            soyad,
            telefon: p.tel || null,
            email: p.email || null,
            pozisyon: 'SATIS',
            pdksId: String(p.id),
            aktif: p.status === 1,
          },
        });
        eklenen.push({ id: yeni.id, ad, soyad, pdksId: p.id });
      }
    }

    return res.json({
      success: true,
      eklenen: eklenen.length,
      guncellenen: guncellenen.length,
      atlanan: atlanan.length,
      detay: { eklenen, guncellenen, atlanan },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-ise-al', async (req, res, next) => {
  try {
    const {
      ad,
      soyad,
      telefon,
      email,
      pozisyon,
      subeId,
      subeAdi,
      sirketId,
      sirketAdi,
      bolgeId,
      maas,
      aylikHedef,
      username,
      pin,
      role,
      odooDepId,
    } = req.body;

    if (!ad?.trim() || !soyad?.trim() || !pozisyon) {
      return res.status(400).json({ error: 'Ad, soyad, pozisyon zorunlu' });
    }

    const sonuc: Record<string, unknown> = {};

    const personel = await prisma.personel.create({
      data: {
        ad,
        soyad,
        telefon,
        email,
        pozisyon,
        subeId,
        subeAdi,
        sirketId,
        sirketAdi,
        bolgeId,
        maas: Number(maas) || 0,
        aylikHedef: Number(aylikHedef) || 0,
        aktif: true,
      },
    });
    sonuc.personel = { id: personel.id, ad, soyad };

    if (username?.trim() && pin?.trim()) {
      try {
        const pinHash = await bcrypt.hash(pin, 10);
        const branch = await prisma.branch.findFirst({
          where: { code: subeId },
        });

        if (branch) {
          const user = await prisma.user.create({
            data: {
              name: `${ad} ${soyad}`,
              username: username.trim().toLowerCase(),
              pin: pinHash,
              role: (role as Role) || Role.SALES_STAFF,
              branchId: branch.id,
              isActive: true,
              personelId: personel.id,
            },
          });
          await prisma.personel.update({
            where: { id: personel.id },
            data: { userId: user.id },
          });
          sonuc.posUser = { id: user.id, username: user.username };
        } else {
          sonuc.posUserUyari = 'Şube bulunamadı, POS kullanıcısı oluşturulamadı';
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        sonuc.posUserHata = msg.slice(0, 100);
      }
    }

    try {
      const odooEmpId = await execute('hr.employee', 'create', [{
        name: `${ad} ${soyad}`,
        work_email: email || false,
        work_phone: telefon || false,
        department_id: odooDepId ? Number(odooDepId) : false,
        job_title: pozisyon,
        active: true,
      }]);
      await prisma.personel.update({
        where: { id: personel.id },
        data: { odooEmployeeId: odooEmpId },
      });
      sonuc.odooEmployee = { id: odooEmpId };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      sonuc.odooHata = msg.slice(0, 100);
    }

    sonuc.pdksUyari = 'PDKS sistemine manuel olarak ekleyin';
    return res.json({ success: true, ...sonuc });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-isten-cikar/:id', async (req, res, next) => {
  try {
    const personelId = req.params.id;
    const { sebep } = req.body;

    const personel = await prisma.personel.findUnique({
      where: { id: personelId },
      include: { user: true },
    });
    if (!personel) {
      return res.status(404).json({ error: 'Personel bulunamadı' });
    }

    const sonuc: Record<string, unknown> = {};

    await prisma.personel.update({
      where: { id: personelId },
      data: { aktif: false },
    });
    sonuc.prisma = 'Pasif edildi';

    if (personel.userId) {
      await prisma.user.update({
        where: { id: personel.userId },
        data: { isActive: false },
      });
      sonuc.posUser = 'Pasif edildi';
    }

    if (personel.odooEmployeeId) {
      try {
        await execute('hr.employee', 'write', [
          [personel.odooEmployeeId],
          { active: false },
        ]);
        sonuc.odoo = 'Archive edildi';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        sonuc.odooHata = msg.slice(0, 100);
      }
    }

    if (personel.pdksId) {
      const pdksSonuc = await pdksService.setPdksUserStatus(personel.pdksId, false);
      if (pdksSonuc.success) {
        sonuc.pdks = 'Pasif edildi';
      } else {
        sonuc.pdksHata = pdksSonuc.message ?? 'PDKS pasif edilemedi';
        sonuc.pdksManuelGerekli = true;
      }
    }

    return res.json({ success: true, personelId, sebep, ...sonuc });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-aktifles/:id', async (req, res, next) => {
  try {
    const personelId = req.params.id;

    const personel = await prisma.personel.findUnique({
      where: { id: personelId },
    });
    if (!personel) {
      return res.status(404).json({ error: 'Personel bulunamadı' });
    }

    const sonuc: Record<string, unknown> = {};

    await prisma.personel.update({
      where: { id: personelId },
      data: { aktif: true },
    });
    sonuc.prisma = 'Aktif edildi';

    if (personel.userId) {
      await prisma.user.update({
        where: { id: personel.userId },
        data: { isActive: true },
      });
      sonuc.posUser = 'Aktif edildi';
    }

    if (personel.odooEmployeeId) {
      try {
        await execute('hr.employee', 'write', [
          [personel.odooEmployeeId],
          { active: true },
        ]);
        sonuc.odoo = 'Unarchive edildi';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        sonuc.odooHata = msg.slice(0, 100);
      }
    }

    if (personel.pdksId) {
      const pdksSonuc = await pdksService.setPdksUserStatus(personel.pdksId, true);
      if (pdksSonuc.success) {
        sonuc.pdks = 'Aktif edildi';
      } else {
        sonuc.pdksHata = pdksSonuc.message ?? 'PDKS aktif edilemedi';
        sonuc.pdksManuelGerekli = true;
      }
    }

    return res.json({ success: true, personelId, ...sonuc });
  } catch (err) {
    next(err);
  }
});

router.post('/pdks-sync', async (req, res, next) => {
  try {
    const pdksRes = await axios.get(
      `https://app.patronpdks.com/api/v4/organizations/${process.env.PDKS_ORG_ID}/users`,
      {
        headers: {
          Token: process.env.PDKS_TOKEN,
          'Content-Type': 'application/json; charset=UTF-8',
          'Accept-Language': 'tr',
        },
      },
    );
    const pdksPersoneller = pdksRes.data?.data ?? [];
    const pdksMap = new Map<string, boolean>(
      pdksPersoneller.map((p: { id: number; status: number }) => [String(p.id), p.status === 1]),
    );

    const personeller = await prisma.personel.findMany({
      where: { pdksId: { not: null } },
    });

    let guncellenen = 0;
    for (const p of personeller) {
      if (!p.pdksId) continue;
      const pdksAktif = pdksMap.get(p.pdksId);
      if (pdksAktif !== undefined && pdksAktif !== p.aktif) {
        await prisma.personel.update({
          where: { id: p.id },
          data: { aktif: pdksAktif },
        });
        guncellenen++;
      }
    }

    return res.json({
      success: true,
      pdksSayisi: pdksPersoneller.length,
      guncellenen,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/personel-baglanti-ozet', async (req, res, next) => {
  try {
    const personeller = await prisma.personel.findMany({
      where: { aktif: true },
      select: {
        id: true,
        ad: true,
        soyad: true,
        pozisyon: true,
        subeId: true,
        subeAdi: true,
        pdksId: true,
        odooEmployeeId: true,
        userId: true,
        aktif: true,
        telefon: true,
        user: { select: { id: true, username: true, role: true, canWorkAtolye: true } },
      },
      orderBy: { ad: 'asc' },
    });

    const tam = personeller.filter((p) => p.pdksId && p.odooEmployeeId && p.userId).length;
    const eksik = personeller.filter(
      (p) => (p.pdksId || p.odooEmployeeId || p.userId) && !(p.pdksId && p.odooEmployeeId && p.userId),
    ).length;
    const hicYok = personeller.filter((p) => !p.pdksId && !p.odooEmployeeId && !p.userId).length;

    return res.json({
      success: true,
      ozet: { toplam: personeller.length, tam, eksik, hicYok },
      data: personeller,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-sube-toplu-ata', async (req, res, next) => {
  try {
    const employees = await execute(
      'hr.employee',
      'search_read',
      [[['active', '=', true]]],
      { fields: ['id', 'name', 'department_id', 'job_title'] },
    );

    function subeKoduBul(deptName: string): string {
      if (!deptName) return 'YONETIM';
      const match = deptName.match(/GVN(\d+)\s+Mağaza/i);
      if (match) return `GVN${match[1]}`;
      return 'YONETIM';
    }

    const branches = await prisma.branch.findMany({
      select: { id: true, code: true },
    });
    const branchMap = new Map(branches.map((b) => [b.code, b.id]));

    const guncellenen: { personel: string; sube: string }[] = [];
    const atlanan: { emp: string; sebep: string }[] = [];

    for (const emp of employees) {
      const deptName = emp.department_id?.[1] ?? '';
      const subeKodu = subeKoduBul(deptName);
      const subeId = branchMap.get(subeKodu);

      if (!subeId) {
        atlanan.push({ emp: emp.name, sebep: `${subeKodu} bulunamadı` });
        continue;
      }

      const personel = await prisma.personel.findFirst({
        where: { odooEmployeeId: emp.id },
      });

      if (!personel) {
        const parcalar = emp.name.trim().split(' ');
        const soyad = parcalar[parcalar.length - 1];
        const ad = parcalar.slice(0, -1).join(' ');

        const personelIsim = await prisma.personel.findFirst({
          where: {
            OR: [
              {
                ad: { contains: ad, mode: 'insensitive' },
                soyad: { contains: soyad, mode: 'insensitive' },
              },
              {
                ad: { contains: soyad, mode: 'insensitive' },
              },
            ],
          },
        });

        if (personelIsim) {
          await prisma.personel.update({
            where: { id: personelIsim.id },
            data: {
              subeId: subeKodu,
              subeAdi: `Güven Optik 1959 - ${subeKodu.replace('GVN', '')}`,
              odooEmployeeId: emp.id,
            },
          });
          guncellenen.push({
            personel: `${personelIsim.ad} ${personelIsim.soyad}`,
            sube: subeKodu,
          });
        } else {
          atlanan.push({ emp: emp.name, sebep: "Prisma'da bulunamadı" });
        }
        continue;
      }

      await prisma.personel.update({
        where: { id: personel.id },
        data: {
          subeId: subeKodu,
          subeAdi: `Güven Optik 1959 - ${subeKodu.replace('GVN', '')}`,
        },
      });
      guncellenen.push({
        personel: `${personel.ad} ${personel.soyad}`,
        sube: subeKodu,
      });
    }

    return res.json({
      success: true,
      guncellenen: guncellenen.length,
      atlanan: atlanan.length,
      detay: { guncellenen, atlanan },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-odoo-bagla/:id', async (req, res, next) => {
  try {
    const { odooEmployeeId } = req.body;
    if (!odooEmployeeId) {
      return res.status(400).json({ error: 'odooEmployeeId zorunlu' });
    }
    await syncOdooEmployeeIdFromPersonel(req.params.id, Number(odooEmployeeId));
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.put('/personel-pdks/:id', async (req, res, next) => {
  try {
    const { pdksId } = req.body;
    if (!pdksId) {
      return res.status(400).json({ error: 'PDKS ID zorunlu' });
    }
    await prisma.personel.update({
      where: { id: req.params.id },
      data: { pdksId: String(pdksId) },
    });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/personel-pdks/:id', async (req, res, next) => {
  try {
    await prisma.personel.update({
      where: { id: req.params.id },
      data: { pdksId: null },
    });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.put('/personel-pos-guncelle/:id', async (req, res, next) => {
  try {
    const { username, role, pin, canWorkAtolye, ekYetkiler } = req.body;
    const personel = await prisma.personel.findUnique({ where: { id: req.params.id } });
    if (!personel?.userId) {
      return res.status(400).json({ error: 'POS kullanıcısı bağlı değil' });
    }

    const data: Prisma.UserUpdateInput = {};
    if (username?.trim()) data.username = String(username).trim().toLowerCase();
    if (role) data.role = role as Role;
    if (pin) data.pin = await bcrypt.hash(String(pin), 10);
    if (canWorkAtolye !== undefined) data.canWorkAtolye = Boolean(canWorkAtolye);

    if (ekYetkiler !== undefined) {
      const filtered = filterSecilebilirEkYetkiler(
        Array.isArray(ekYetkiler) ? ekYetkiler.map(String) : [],
      );
      await syncEkYetkilerFromPersonel(req.params.id, filtered);
    }

    if (!Object.keys(data).length && ekYetkiler === undefined) {
      return res.status(400).json({ error: 'Güncellenecek alan yok' });
    }

    if (Object.keys(data).length) {
      await prisma.user.update({
        where: { id: personel.userId },
        data,
      });
    }
    return res.json({ success: true });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten var' });
    }
    next(err);
  }
});

router.delete('/personel-pos-bagla/:id', async (req, res, next) => {
  try {
    const personel = await prisma.personel.findUnique({ where: { id: req.params.id } });
    if (!personel?.userId) {
      return res.status(400).json({ error: 'POS bağlantısı yok' });
    }
    const userId = personel.userId;
    await prisma.$transaction([
      prisma.personel.update({
        where: { id: req.params.id },
        data: { userId: null },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { personelId: null },
      }),
    ]);
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/pdks-personeller', async (_req, res, next) => {
  try {
    const raw = (await pdksService.getPersoneller()) as
      | Array<{ id: number; name?: string; givenName?: string; familyName?: string }>
      | { data?: Array<{ id: number; name?: string; givenName?: string; familyName?: string }> };
    const list = Array.isArray(raw) ? raw : (raw.data ?? []);
    return res.json({
      data: list.map((p: { id: number; name?: string; givenName?: string; familyName?: string; status?: number }) => ({
        id: p.id,
        name: p.name || `${p.givenName ?? ''} ${p.familyName ?? ''}`.trim(),
        status: p.status,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-pos-bagla/:id', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const mevcutBagli = await prisma.personel.findFirst({
      where: { userId, id: { not: req.params.id } },
    });
    if (mevcutBagli) {
      return res.status(400).json({
        error: 'Bu POS kullanıcısı başka personele bağlı',
      });
    }
    await prisma.$transaction([
      prisma.personel.update({
        where: { id: req.params.id },
        data: { userId },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { personelId: req.params.id },
      }),
    ]);
    await syncPersonelSubeFromUserId(req.params.id, userId);
    const personel = await prisma.personel.findUnique({
      where: { id: req.params.id },
      select: { ekYetkiler: true },
    });
    if (personel?.ekYetkiler?.length) {
      await prisma.user.update({
        where: { id: userId },
        data: { ekYetkiler: personel.ekYetkiler },
      });
    }
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-pos-olustur/:id', async (req, res, next) => {
  try {
    const { username, pin, role, branchId } = req.body;
    const personel = await prisma.personel.findUnique({
      where: { id: req.params.id },
    });
    if (!personel) return res.status(404).json({ error: 'Personel bulunamadı' });

    let branch = null;
    if (branchId) {
      branch = await prisma.branch.findUnique({ where: { id: branchId } });
    }
    if (!branch && personel.subeId) {
      branch = await prisma.branch.findFirst({
        where: { code: personel.subeId },
      });
    }
    if (!branch) {
      const branches = await prisma.branch.findMany({
        where: { isActive: true },
        take: 1,
      });
      if (branches.length) {
        return res.status(400).json({
          error: 'Şube seçilmedi',
          branches: branches.map((b) => ({ id: b.id, name: b.name, code: b.code })),
        });
      }
      return res.status(400).json({ error: 'Hiç şube bulunamadı' });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const user = await prisma.user.create({
      data: {
        name: `${personel.ad} ${personel.soyad}`,
        username: username.trim().toLowerCase(),
        pin: pinHash,
        role: (role as Role) || Role.SALES_STAFF,
        branchId: branch.id,
        isActive: true,
        personelId: personel.id,
        ekYetkiler: personel.ekYetkiler ?? [],
      },
    });

    await prisma.personel.update({
      where: { id: req.params.id },
      data: {
        userId: user.id,
        subeId: branch.code,
        subeAdi: branch.name,
      },
    });

    return res.json({
      success: true,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten var' });
    }
    next(err);
  }
});

router.get('/pos-kullanicilar', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        personel: { select: { id: true, ad: true, soyad: true } },
      },
      orderBy: { name: 'asc' },
    });
    return res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

router.put('/personel-guncelle/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.maas) data.maas = Number(data.maas);
    if (data.aylikHedef) data.aylikHedef = Number(data.aylikHedef);

    if (data.ekYetkiler !== undefined) {
      const filtered = filterSecilebilirEkYetkiler(
        Array.isArray(data.ekYetkiler) ? data.ekYetkiler.map(String) : [],
      );
      await syncEkYetkilerFromPersonel(id, filtered);
      delete data.ekYetkiler;
    }

    const updateData = { ...data };
    delete updateData.id;
    const personel =
      Object.keys(updateData).length > 0
        ? await prisma.personel.update({ where: { id }, data: updateData })
        : await prisma.personel.findUnique({ where: { id } });

    return res.json({ success: true, data: personel });
  } catch (err) {
    next(err);
  }
});

// ── PERSONEL BELGE (yönetici: indir / onayla / sil) ───────────────
router.get('/personel-belge/:belgeId/indir', async (req, res, next) => {
  try {
    const belge = await prisma.personelBelge.findUnique({
      where: { id: req.params.belgeId },
    });
    if (!belge) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ data: belge });
  } catch (err) {
    next(err);
  }
});

router.patch('/personel-belge/:belgeId/onayla', async (req, res, next) => {
  try {
    const belge = await prisma.personelBelge.update({
      where: { id: req.params.belgeId },
      data: {
        onaylandi: true,
        durum: 'ONAYLANDI',
        onaylayanId: req.user!.userId,
        onayTarihi: new Date(),
      },
    });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: belge.personelId,
        belgeId: belge.id,
        islem: 'ONAYLANDI',
        yapanId: req.user!.userId,
        aciklama: belge.ad,
      },
    });
    const { icerik: _icerik, ...belgeSafe } = belge;
    return res.json({ success: true, data: belgeSafe });
  } catch (err) {
    next(err);
  }
});

// Revizyon iste — belgeyi personele geri gönder, açıklama ile
router.patch('/personel-belge/:belgeId/revizyon-iste', async (req, res, next) => {
  try {
    const { aciklama } = req.body as { aciklama?: string };
    const belge = await prisma.personelBelge.update({
      where: { id: req.params.belgeId },
      data: {
        onaylandi: false,
        durum: 'REVIZYON_ISTENDI',
        notlar: aciklama || null,
        onaylayanId: null,
        onayTarihi: null,
      },
    });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: belge.personelId,
        belgeId: belge.id,
        islem: 'REVIZYON_ISTENDI',
        yapanId: req.user!.userId,
        aciklama: aciklama || belge.ad,
      },
    });
    const { icerik: _icerik, ...belgeSafe } = belge;
    return res.json({ success: true, data: belgeSafe });
  } catch (err) {
    next(err);
  }
});

// Eksik olarak işaretle
router.patch('/personel-belge/:belgeId/eksik-isaretle', async (req, res, next) => {
  try {
    const { aciklama } = req.body as { aciklama?: string };
    const belge = await prisma.personelBelge.update({
      where: { id: req.params.belgeId },
      data: { onaylandi: false, durum: 'EKSIK', notlar: aciklama || null },
    });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: belge.personelId,
        belgeId: belge.id,
        islem: 'EKSIK_ISARETLENDI',
        yapanId: req.user!.userId,
        aciklama: aciklama || belge.ad,
      },
    });
    const { icerik: _icerik, ...belgeSafe } = belge;
    return res.json({ success: true, data: belgeSafe });
  } catch (err) {
    next(err);
  }
});

router.delete('/personel-belge/:belgeId', async (req, res, next) => {
  try {
    const belge = await prisma.personelBelge.delete({ where: { id: req.params.belgeId } });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: belge.personelId,
        islem: 'SILINDI',
        yapanId: req.user!.userId,
        aciklama: belge.ad,
      },
    });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/personel-belgeler-ozet', async (req, res, next) => {
  try {
    const belgeler = await prisma.personelBelge.findMany({
      select: { personelId: true, tip: true },
    });
    const ozet: Record<string, string[]> = {};
    for (const b of belgeler) {
      if (!ozet[b.personelId]) ozet[b.personelId] = [];
      if (!ozet[b.personelId].includes(b.tip)) {
        ozet[b.personelId].push(b.tip);
      }
    }
    return res.json({ success: true, data: ozet });
  } catch (err) { next(err); }
});

// ── PERSONEL BELGE → MUHASEBEYE GÖNDER ────────────────────────────
const MUHASEBE_EPOSTA_ANAHTAR = { sirketId: 'genel', anahtar: 'muhasebe_eposta' } as const;

router.get('/personel-muhasebe-eposta', async (req, res, next) => {
  try {
    const ayar = await prisma.sirketAyar.findUnique({
      where: { sirketId_anahtar: MUHASEBE_EPOSTA_ANAHTAR },
    });
    return res.json({ success: true, data: { eposta: ayar?.deger ?? '' } });
  } catch (err) {
    next(err);
  }
});

router.post('/personel-muhasebe-eposta', async (req, res, next) => {
  try {
    const { eposta } = req.body as { eposta?: string };
    if (!eposta || !eposta.trim()) {
      return res.status(400).json({ error: 'EPOSTA_GEREKLI' });
    }
    await prisma.sirketAyar.upsert({
      where: { sirketId_anahtar: MUHASEBE_EPOSTA_ANAHTAR },
      create: { ...MUHASEBE_EPOSTA_ANAHTAR, deger: eposta.trim() },
      update: { deger: eposta.trim() },
    });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/personel/:id/belgeler-muhasebeye-gonder', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { alici, not: durumNotu } = req.body as { alici?: string; not?: string };
    if (!alici || !alici.trim()) {
      return res.status(400).json({ error: 'ALICI_GEREKLI', message: 'Alıcı e-posta adresi girilmedi.' });
    }

    const personel = await prisma.personel.findUnique({ where: { id } });
    if (!personel) return res.status(404).json({ error: 'PERSONEL_BULUNAMADI' });

    const belgeler = await prisma.personelBelge.findMany({
      where: { personelId: id, onaylandi: true },
    });
    if (!belgeler.length) {
      return res.status(400).json({ error: 'BELGE_YOK', message: 'Bu personelin onaylı belgesi yok.' });
    }

    const attachments = belgeler.map((b) => ({
      filename: b.dosyaAdi || `${b.ad || b.tip}.pdf`,
      content: Buffer.from(b.icerik, 'base64'),
    }));

    const belgeTipListesi = belgeler.map((b) => `- ${b.ad} (${b.tip})`).join('\n');
    const subject = `${personel.ad} ${personel.soyad} - Personel Evrakları`;
    const bodyParts = [
      `${personel.ad} ${personel.soyad} için gönderilen evraklar ektedir.`,
      '',
      'Ekli belgeler:',
      belgeTipListesi,
    ];
    if (durumNotu && durumNotu.trim()) {
      bodyParts.push('', 'Not:', durumNotu.trim());
    }
    const body = bodyParts.join('\n');

    const sonuc = await sendReportEmail([alici.trim()], subject, body, attachments);
    if (!sonuc.success) {
      return res.status(500).json({ error: 'GONDERIM_BASARISIZ', message: sonuc.error });
    }

    // Gönderilen adresi bir sonraki sefer için varsayılan yap
    await prisma.sirketAyar.upsert({
      where: { sirketId_anahtar: MUHASEBE_EPOSTA_ANAHTAR },
      create: { ...MUHASEBE_EPOSTA_ANAHTAR, deger: alici.trim() },
      update: { deger: alici.trim() },
    });

    return res.json({
      success: true,
      data: { gonderilenBelgeSayisi: belgeler.length, alici: alici.trim() },
    });
  } catch (err) {
    next(err);
  }
});

// ── PRİM KURAL CRUD ───────────────────────────────────────────────
router.get('/prim-kurallar', async (req, res) => {
  try {
    const kurallar = await prisma.primKural.findMany({
      where: { aktif: true }, orderBy: { createdAt: 'desc' }
    })
    return res.json({ data: kurallar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/prim-kural-ekle', async (req, res) => {
  try {
    const { ad, tip, kapsam, donem, hedefTutar, hedefAdet, primOrani, primSabit, kategoriAdi, subeId, subeAdi, bolgeId, sirketId, pozisyonlar } = req.body
    if (!ad?.trim() || !tip || !kapsam || !donem) return res.status(400).json({ error: 'ad, tip, kapsam, donem zorunlu' })
    const kural = await prisma.primKural.create({
      data: {
        ad, tip, kapsam, donem,
        hedefTutar: hedefTutar ? Number(hedefTutar) : null,
        hedefAdet: hedefAdet ? Number(hedefAdet) : null,
        primOrani: primOrani ? Number(primOrani) : null,
        primSabit: primSabit ? Number(primSabit) : null,
        kategoriAdi, subeId, subeAdi, bolgeId,
        sirketId: sirketId ? Number(sirketId) : null,
        pozisyonlar: pozisyonlar ? JSON.stringify(pozisyonlar) : null,
      }
    })
    return res.json({ success: true, data: kural })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── PRİM HESAPLA ──────────────────────────────────────────────────
router.post('/prim-hesapla', async (req, res) => {
  try {
    const { donemBaslangic, donemBitis, subeId, sirketId } = req.body

    if (!donemBaslangic || !donemBitis) {
      return res.status(400).json({ error: 'donemBaslangic ve donemBitis zorunlu' })
    }

    const bas = new Date(donemBaslangic)
    const bit = new Date(donemBitis)
    const donemKey = bas.toISOString().split('T')[0]

    const kurallar = await prisma.primKural.findMany({ where: { aktif: true } })

    const personelWhere: { aktif: boolean; subeId?: string; sirketId?: number } = { aktif: true }
    if (subeId) personelWhere.subeId = subeId
    if (sirketId) personelWhere.sirketId = Number(sirketId)
    const personeller = await prisma.personel.findMany({ where: personelWhere })

    const branches = await prisma.branch.findMany({
      select: { id: true, code: true },
    })
    const branchIdByCode = new Map(branches.map((b) => [b.code, b.id]))

    const tumSatislar = await prisma.sale.findMany({
      where: {
        status: SaleStatus.PAID,
        createdAt: { gte: bas, lte: bit },
        ...(subeId ? { branchId: subeId } : {}),
      },
      select: {
        id: true,
        userId: true,
        branchId: true,
        netTotal: true,
        items: {
          select: {
            product: { select: { category: true } },
            odooCategoryId: true,
            lineTotal: true,
            qty: true,
          },
        },
      },
    })

    const sonuclar = []

    for (const personel of personeller) {
      let toplamPrim = 0
      const detaylar = []

      for (const kural of kurallar) {
        if (kural.tip === 'MAGAZA' && kural.subeId && kural.subeId !== personel.subeId) continue
        if (kural.tip === 'BIREYSEL' && kural.subeId && kural.subeId !== personel.subeId) continue
        if (kural.sirketId && kural.sirketId !== personel.sirketId) continue

        const personelBranchId = branchIdByCode.get(personel.subeId ?? '')
        const subeSatislari = personelBranchId
          ? tumSatislar.filter((s) => s.branchId === personelBranchId)
          : []

        let gerceklesen = 0
        if (kural.kapsam === 'URUN_KATEGORI' && kural.kategoriAdi) {
          const kategoriSatislari = subeSatislari.filter((s) =>
            s.items.some(
              (i) =>
                i.product?.category === kural.kategoriAdi ||
                String(i.odooCategoryId ?? '') === kural.kategoriAdi,
            ),
          )
          gerceklesen = kategoriSatislari.reduce(
            (a, s) =>
              a +
              s.items
                .filter(
                  (i) =>
                    i.product?.category === kural.kategoriAdi ||
                    String(i.odooCategoryId ?? '') === kural.kategoriAdi,
                )
                .reduce((b, i) => b + Number(i.lineTotal), 0),
            0,
          )
        } else {
          gerceklesen = subeSatislari.reduce((a, s) => a + Number(s.netTotal), 0)
        }

        const hedef = kural.hedefTutar ?? 0
        if (gerceklesen <= 0) continue

        let primTutari = 0
        if (kural.primOrani && gerceklesen > hedef) {
          primTutari = (gerceklesen - hedef) * (kural.primOrani / 100)
        } else if (kural.primSabit && gerceklesen >= hedef) {
          primTutari = kural.primSabit
        }

        if (primTutari > 0 && kural.pozisyonlar) {
          try {
            const pozlar = JSON.parse(kural.pozisyonlar) as Array<{ pozisyon: string; oran: number }>
            const poz = pozlar.find((p) => p.pozisyon === personel.pozisyon)
            if (poz) primTutari = primTutari * poz.oran
            else primTutari = 0
          } catch { }
        }

        if (primTutari > 0) {
          toplamPrim += primTutari
          detaylar.push({
            kuralAdi: kural.ad,
            kuralTip: kural.tip,
            hedef,
            gerceklesen: Math.round(gerceklesen * 100) / 100,
            primTutari: Math.round(primTutari * 100) / 100,
          })

          const kazanimId = `${personel.id}-${kural.id}-${donemKey}`
          await prisma.primKazanim.upsert({
            where: { id: kazanimId },
            update: { gerceklesen, primTutari, hedef },
            create: {
              id: kazanimId,
              personelId: personel.id,
              primKuralId: kural.id,
              donemBaslangic: bas,
              donemBitis: bit,
              hedef,
              gerceklesen,
              primTutari: Math.round(primTutari * 100) / 100,
            },
          })
        }
      }

      if (detaylar.length > 0) {
        sonuclar.push({
          personelId: personel.id,
          personelAd: `${personel.ad} ${personel.soyad}`,
          pozisyon: personel.pozisyon,
          subeAdi: personel.subeAdi,
          toplamPrim: Math.round(toplamPrim * 100) / 100,
          detaylar,
        })
      }
    }

    return res.json({ success: true, donem: { baslangic: donemBaslangic, bitis: donemBitis }, sonuclar })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[prim-hesapla hata]', msg)
    return res.status(500).json({ error: msg })
  }
})

// ── ÖZEL SİPARİŞ CRUD ─────────────────────────────────────────────

router.get('/ozel-siparisler', async (req, res) => {
  try {
    const { durum, subeId, sirketId, limit, satisSiparisId } = req.query
    const where: any = {}
    if (durum) where.durum = String(durum)
    if (subeId) where.subeId = String(subeId)
    if (sirketId) where.sirketId = Number(sirketId)
    if (satisSiparisId) where.satisSiparisId = String(satisSiparisId)
    const siparisler = await prisma.ozelSiparis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit ?? 100),
    })
    const musteriIds = [...new Set(siparisler.map((s) => s.musteriId).filter(Boolean))] as string[]
    const customers = musteriIds.length
      ? await prisma.customer.findMany({
          where: { id: { in: musteriIds } },
          select: { id: true, name: true },
        })
      : []
    const customerNameById = new Map(customers.map((c) => [c.id, c.name]))
    const enriched = siparisler.map((s) => ({
      ...s,
      musteriAdi: (s.musteriId && customerNameById.get(s.musteriId)) || s.musteriAdi,
    }))
    return res.json({ data: enriched })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// Depo > Ürün Girişi > Lot/Barkod adımında, mağazalarda daha önce okutulup
// kaydedilmiş ama henüz stoğa işlenmemiş (durum: TESLIM_ALINDI) özel sipariş
// karekodlarını ürün adına ve/veya müşteri adına göre aratmak için.
router.get('/ozel-siparis-karekod-ara', async (req, res) => {
  try {
    const urunAdiQ = typeof req.query.urunAdi === 'string' ? req.query.urunAdi.trim().toLocaleLowerCase('tr') : ''
    const musteriAdiQ = typeof req.query.musteriAdi === 'string' ? req.query.musteriAdi.trim().toLocaleLowerCase('tr') : ''

    const siparisler = await prisma.ozelSiparis.findMany({
      where: {
        durum: 'TESLIM_ALINDI',
        karekodlar: { some: {} },
      },
      include: { karekodlar: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })

    const musteriIds = [...new Set(siparisler.map((s) => s.musteriId).filter(Boolean))] as string[]
    const customers = musteriIds.length
      ? await prisma.customer.findMany({ where: { id: { in: musteriIds } }, select: { id: true, name: true } })
      : []
    const customerNameById = new Map(customers.map((c) => [c.id, c.name]))

    let rows = siparisler.flatMap((s) => {
      const musteriAdi = (s.musteriId && customerNameById.get(s.musteriId)) || s.musteriAdi || ''
      return s.karekodlar.map((k) => ({
        karekod: k.karekod,
        siparisId: s.id,
        urunAdi: s.urunAdi,
        musteriAdi,
        subeId: s.subeId,
        subeAdi: s.subeAdi,
        taranmaTarihi: k.createdAt,
      }))
    })

    if (urunAdiQ) {
      rows = rows.filter((r) => (r.urunAdi || '').toLocaleLowerCase('tr').includes(urunAdiQ))
    }
    if (musteriAdiQ) {
      rows = rows.filter((r) => (r.musteriAdi || '').toLocaleLowerCase('tr').includes(musteriAdiQ))
    }

    return res.json({ data: rows.slice(0, 100) })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/ozel-siparis-ekle', async (req, res) => {
  try {
    const result = await createOzelSiparis(req.body, (req as any).user?.userId ?? null);
    return res.json(result);
  } catch (err: any) {
    if (err?.message === 'musteriAdi, urunAdi, tip zorunlu') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err?.message });
  }
});

router.put('/ozel-siparis-guncelle/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { firmaUrunu, satisTemsilcisi, notlar } = req.body
    const updated = await prisma.ozelSiparis.update({
      where: { id },
      data: {
        ...(firmaUrunu !== undefined && { firmaUrunu }),
        ...(satisTemsilcisi !== undefined && { satisTemsilcisi }),
        ...(notlar !== undefined && { notlar }),
      },
    })
    return res.json(updated)
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
})

router.put('/ozel-siparis-kart-basildi/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updated = await prisma.ozelSiparis.update({
      where: { id },
      data: { kartBasildi: true, kartBasmaTarihi: new Date() },
    })
    return res.json({ success: true, data: updated })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
})

router.put('/ozel-siparis-durum/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { durum, tedarikciSiparisNo, notlar, gercekGelisTarihi, teslimTarihi } = req.body
    const siparis = await updateOzelSiparisDurum(id, {
      durum,
      userId: (req as any).user?.userId ?? null,
      tedarikciSiparisNo,
      notlar,
      gercekGelisTarihi,
      teslimTarihi,
      bildirimGonder: true,
    })
    return res.json({ success: true, data: siparis })
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? 'Durum güncellenemedi' })
  }
})

router.get('/ozel-siparis-log/:id', async (req, res) => {
  try {
    const data = await getOzelSiparisLoglari(req.params.id)
    return res.json({ data })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.get('/ozel-siparis-stok-giris-detay/:id', async (req, res) => {
  try {
    const data = await getOzelSiparisStokGirisDetay(req.params.id)
    return res.json({ data })
  } catch (err: any) {
    return res.status(400).json({ error: err?.message })
  }
})

router.post('/ozel-siparis-stoka-al/:id', async (req, res) => {
  try {
    const { bekleyenFaturaId } = req.body ?? {}
    const result = await stokaAlOzelSiparis(req.params.id, {
      userId: (req as any).user?.userId ?? null,
      bekleyenFaturaId,
    })
    return res.json({ success: true, ...result })
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? 'Stoka alınamadı' })
  }
})

// ── SİPARİŞ TESLİM AL (Odoo'ya yaz) ─────────────────────────────
router.post('/ozel-siparis-teslim/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { hedef } = req.body // 'MUSTERI' | 'DEPO'

    const siparis = await prisma.ozelSiparis.findUnique({ where: { id } })
    if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı' })

    const sonuc: any = { siparisId: id }

    if (hedef === 'MUSTERI') {
      // Direkt müşteriye teslim → Odoo'da satış faturası
      if (siparis.satisFiyati && siparis.sirketId) {
        try {
          // Müşteri partner bul/oluştur
          let partnerId = null
          const partnerAra = await execute('res.partner', 'search_read',
            [[['name', 'ilike', siparis.musteriAdi], ['is_company', '=', false]]],
            { fields: ['id', 'name'], limit: 1 })

          if (partnerAra.length > 0) {
            partnerId = partnerAra[0].id
          } else {
            partnerId = await execute('res.partner', 'create', [{
              name: siparis.musteriAdi,
              phone: siparis.musteriTelefon || '',
              customer_rank: 1,
            }])
          }

          // Satış faturası oluştur
          const invoiceId = await execute('account.move', 'create', [{
            move_type: 'out_invoice',
            partner_id: partnerId,
            invoice_date: new Date().toISOString().slice(0, 10),
            company_id: siparis.sirketId,
            narration: `Özel sipariş: ${siparis.urunAdi} - ${siparis.musteriAdi}`,
            invoice_line_ids: [[0, 0, {
              name: `${siparis.urunAdi}${siparis.camTipi ? ` (${siparis.camTipi})` : ''}`,
              quantity: siparis.miktar,
              price_unit: siparis.satisFiyati,
            }]]
          }], {}, siparis.sirketId)

          try {
            await execute('account.move', 'action_post', [[invoiceId]], {}, siparis.sirketId)
          } catch { }

          const invData = await execute('account.move', 'read', [[invoiceId]], { fields: ['name'] }, siparis.sirketId)
          sonuc.fatura = invData[0]?.name
        } catch (fe: any) {
          console.warn('[ozel siparis fatura]', fe?.message)
          sonuc.faturaHata = fe?.message?.slice(0, 100)
        }
      }

      await prisma.ozelSiparis.update({
        where: { id },
        data: { durum: 'TESLIM_EDILDI', teslimTarihi: new Date() }
      })
      sonuc.durum = 'TESLIM_EDILDI'

    } else {
      // Depoya al → normal stok girişi
      await prisma.ozelSiparis.update({
        where: { id },
        data: { durum: 'TESLIM_ALINDI', gercekGelisTarihi: new Date() }
      })
      sonuc.durum = 'TESLIM_ALINDI'
      sonuc.mesaj = 'Ürün depoya alındı. Stok girişi için Ürün Girişi sekmesini kullanın.'
    }

    return res.json({ success: true, ...sonuc })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── ÜRÜN VARYANTLARI ──────────────────────────────────────────────
router.get('/urun-varyanlar/:templateId', async (req, res) => {
  try {
    const templateId = Number(req.params.templateId)
    if (!templateId) return res.status(400).json({ error: 'templateId zorunlu' })

    const varyantlar = await execute('product.product', 'search_read',
      [[['product_tmpl_id', '=', templateId], ['active', '=', true]]],
      { fields: ['id', 'name', 'default_code', 'barcode', 'combination_indices', 'product_template_attribute_value_ids'], limit: 100 })

    // Nitelik değerlerini çek
    const sonuclar = []
    for (const v of varyantlar) {
      const attrVals = v.product_template_attribute_value_ids?.length > 0
        ? await execute('product.template.attribute.value', 'read',
            [v.product_template_attribute_value_ids],
            { fields: ['id', 'name', 'attribute_id'] })
        : []

      sonuclar.push({
        id: v.id,
        name: v.name,
        defaultCode: typeof v.default_code === 'string' ? v.default_code : '',
        barcode: typeof v.barcode === 'string' ? v.barcode : '',
        nitelikler: attrVals.map((a: any) => ({
          nitelikId: a.attribute_id?.[0],
          nitelikAdi: a.attribute_id?.[1],
          degerAdi: typeof a.name === 'string' ? a.name : '',
        }))
      })
    }

    return res.json({ data: sonuclar })
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err)
    console.error('[urun-varyanlar hata]', msg)
    return res.status(500).json({ error: msg })
  }
})

// ── BEKLEYEN FATURA KAYITLARI ─────────────────────────────────────
router.get('/bekleyen-faturalar', async (req, res) => {
  try {
    const kayitlar = await prisma.bekleyenFatura.findMany({
      where: { durum: { in: ['BEKLIYOR', 'KISMI'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return res.json({ data: kayitlar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/bekleyen-fatura-ekle', async (req, res) => {
  try {
    const {
      girisTipi, tedarikciAdi, tedarikciId,
      irsaliyeNo, aciklama, sirketId, sirketAdi,
      subeId, subeAdi, kalemler, odooPickingId, odooPickingName,
      tahminiTarih,
    } = req.body

    const kayit = await prisma.bekleyenFatura.create({
      data: {
        girisTipi,
        tedarikciAdi, tedarikciId,
        irsaliyeNo, aciklama,
        sirketId, sirketAdi,
        subeId, subeAdi,
        kalemler: JSON.stringify(kalemler ?? []),
        odooPickingId, odooPickingName,
        tahminiTarih: tahminiTarih ? new Date(tahminiTarih) : null,
        durum: 'BEKLIYOR',
      }
    })
    return res.json({ success: true, data: kayit })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/bekleyen-fatura-eslestir/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { odooFaturaId, odooFaturaNo, notlar } = req.body

    const kayit = await prisma.bekleyenFatura.update({
      where: { id },
      data: {
        durum: 'ESLESTI',
        odooFaturaId,
        odooFaturaNo,
        notlar,
        ...(req.body.uyumsoftNo && { uyumsoftNo: req.body.uyumsoftNo }),
        ...(req.body.tedarikciIrsaliyeNo && { tedarikciIrsaliyeNo: req.body.tedarikciIrsaliyeNo }),
        eslesmeTarihi: new Date(),
      }
    })
    return res.json({ success: true, data: kayit })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── ODOO ÜRÜN YAPILANDIRMA ────────────────────────────────────────
router.get('/odoo-kategoriler', async (_req, res, next) => {
  try {
    const data = await execute('product.category', 'search_read', [[]], {
      fields: ['id', 'name', 'parent_id', 'complete_name'],
      limit: 100,
    });
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/odoo-nitelikler', async (_req, res, next) => {
  try {
    const data = await execute('product.attribute', 'search_read', [[]], {
      fields: ['id', 'name', 'value_ids', 'display_type'],
      limit: 50,
    });
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/odoo-nitelik-degerleri', async (_req, res, next) => {
  try {
    const data = await execute('product.attribute.value', 'search_read', [[]], {
      fields: ['id', 'name', 'attribute_id'],
      limit: 200,
    });
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-kategori-ekle', async (req, res, next) => {
  try {
    const { ad, parentId, forceCreate } = req.body;
    if (!ad?.trim()) return res.status(400).json({ error: 'ad zorunlu' });

    const parent = parentId ? Number(parentId) : null;
    const existing = await findExistingCategoryMatch(ad, { parentId: parent });

    if (existing.matchType === 'ambiguous') {
      return res.status(409).json({
        code: 'category-ambiguous',
        error: 'Kategori adı birden fazla olası eşleşmeye sahip, tam adını netleştirin.',
        candidates: existing.candidates.map((c) => ({
          id: c.id,
          name: c.name,
          complete_name: c.complete_name,
        })),
      });
    }

    if (existing.match && !forceCreate) {
      return res.status(409).json({
        code: 'category-exists',
        error: `Benzer bir kategori zaten var: "${existing.match.complete_name}"`,
        existing: {
          id: existing.match.id,
          name: existing.match.name,
          complete_name: existing.match.complete_name,
        },
        matchType: existing.matchType,
      });
    }

    const data: Record<string, unknown> = { name: ad.trim() };
    if (parent) data.parent_id = parent;
    const id = await execute('product.category', 'create', [data]);
    return res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-nitelik-ekle', async (req, res, next) => {
  try {
    const { ad, displayType, degerler } = req.body;
    if (!ad?.trim()) return res.status(400).json({ error: 'ad zorunlu' });
    const attrId = await execute('product.attribute', 'create', [{
      name: ad.trim(),
      display_type: displayType || 'select',
      create_variant: 'dynamic',
    }]);
    if (degerler?.length) {
      for (const d of degerler) {
        await execute('product.attribute.value', 'create', [{
          name: String(d).trim(),
          attribute_id: attrId,
        }]);
      }
    }
    return res.json({ success: true, id: attrId });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-nitelik-deger-ekle', async (req, res, next) => {
  try {
    const { attributeId, deger } = req.body;
    if (!attributeId || !deger?.trim()) {
      return res.status(400).json({ error: 'attributeId ve deger zorunlu' });
    }
    const id = await execute('product.attribute.value', 'create', [{
      name: deger.trim(),
      attribute_id: Number(attributeId),
    }]);
    return res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-nitelik-deger-toplu-ekle', async (req, res, next) => {
  try {
    const { attributeId, degerler } = req.body;
    if (!attributeId || !degerler?.length) {
      return res.status(400).json({ error: 'attributeId ve degerler zorunlu' });
    }

    const mevcutlar = await execute(
      'product.attribute.value', 'search_read',
      [[['attribute_id', '=', Number(attributeId)]]],
      { fields: ['name'], limit: 2000 },
    );
    const mevcutAdlar = new Set(
      mevcutlar.map((m: { name: string }) => m.name.trim().toUpperCase()),
    );

    const yeniDegerler = (degerler as string[]).filter(
      (d) => !mevcutAdlar.has(d.trim().toUpperCase()),
    );

    const eklenenler: { id: number; name: string }[] = [];
    for (const d of yeniDegerler) {
      const id = await execute('product.attribute.value', 'create', [{
        name: d.trim(),
        attribute_id: Number(attributeId),
      }]);
      eklenenler.push({ id, name: d.trim() });
    }

    return res.json({
      success: true,
      eklenen: eklenenler.length,
      atlanan: degerler.length - yeniDegerler.length,
      toplam: degerler.length,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-nitelik-deger-eslesme', async (req, res, next) => {
  try {
    const { attributeId, degerler } = req.body;
    if (!attributeId || !degerler?.length) {
      return res.status(400).json({ error: 'attributeId ve degerler zorunlu' });
    }

    const mevcutlar = await execute(
      'product.attribute.value', 'search_read',
      [[['attribute_id', '=', Number(attributeId)]]],
      { fields: ['id', 'name'], limit: 5000 },
    );
    const mevcutMap = new Map<string, number>(
      mevcutlar.map((m: { id: number; name: string }) => [m.name.trim().toUpperCase(), m.id]),
    );

    const sonuc = {
      secilen: [] as { id: number; name: string; durum: 'var' | 'yeni' }[],
    };

    for (const d of (degerler as string[])) {
      const temiz = d.trim();
      if (!temiz) continue;
      const key = temiz.toUpperCase();

      if (mevcutMap.has(key)) {
        sonuc.secilen.push({
          id: mevcutMap.get(key)!,
          name: temiz,
          durum: 'var',
        });
      } else {
        const yeniId = Number(await execute(
          'product.attribute.value', 'create',
          [{ name: temiz, attribute_id: Number(attributeId) }],
        ));
        sonuc.secilen.push({ id: yeniId, name: temiz, durum: 'yeni' });
        mevcutMap.set(key, yeniId);
      }
    }

    return res.json({
      success: true,
      secilen: sonuc.secilen,
      varSayisi: sonuc.secilen.filter((s) => s.durum === 'var').length,
      yeniSayisi: sonuc.secilen.filter((s) => s.durum === 'yeni').length,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/odoo-sablon-listesi', async (req, res, next) => {
  try {
    const { q, kategoriId } = req.query;
    const domain: unknown[] = [['type', 'in', ['product', 'consu', 'service']]];
    if (q) domain.push(['name', 'ilike', String(q)]);
    if (kategoriId) domain.push(['categ_id', '=', Number(kategoriId)]);

    const data = await execute('product.template', 'search_read',
      [domain],
      {
        fields: ['id', 'name', 'categ_id', 'default_code',
          'list_price', 'standard_price', 'type',
          'product_variant_count', 'attribute_line_ids',
          'sale_ok', 'purchase_ok', 'active'],
        limit: 100,
        order: 'name asc',
      },
    );
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/odoo-sablon/:tmplId/varyantlar', async (req, res, next) => {
  try {
    const tmplId = Number(req.params.tmplId);
    const lokasyon = typeof req.query.lokasyon === 'string' ? req.query.lokasyon : undefined;

    const variants = await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', '=', tmplId], ['active', 'in', [true, false]]]],
      {
        fields: [
          'id', 'name', 'default_code', 'barcode', 'active',
          'lst_price', 'standard_price',
          'product_template_attribute_value_ids',
        ],
        limit: 500,
        context: { active_test: false },
      },
    );

    const stockMap = await stokYonetimi.getVariantStockMap(
      variants.map((v: { id: number }) => v.id),
      lokasyon,
    );

    const allPtavIds = [...new Set(
      variants.flatMap((v: { product_template_attribute_value_ids?: number[] }) => v.product_template_attribute_value_ids ?? []),
    )];

    const ptavMap = new Map<number, { attrName: string; valueName: string }>();

    if (allPtavIds.length > 0) {
      const ptavlar = await execute(
        'product.template.attribute.value', 'read',
        [allPtavIds],
        { fields: ['id', 'attribute_id', 'product_attribute_value_id'] },
      );
      for (const p of ptavlar) {
        ptavMap.set(p.id, {
          attrName: p.attribute_id?.[1] ?? '',
          valueName: p.product_attribute_value_id?.[1] ?? '',
        });
      }
    }

    const result = variants.map((v: { id: number; active?: boolean; default_code?: string | false; barcode?: string | false; lst_price?: number; standard_price?: number; product_template_attribute_value_ids?: number[] }) => {
      const attrs: Record<string, string> = {};
      for (const ptavId of v.product_template_attribute_value_ids ?? []) {
        const ptav = ptavMap.get(ptavId);
        if (ptav) attrs[ptav.attrName] = ptav.valueName;
      }
      return {
        id: v.id,
        active: v.active !== false,
        default_code: v.default_code || '',
        barcode: v.barcode || '',
        lst_price: v.lst_price || 0,
        standard_price: v.standard_price || 0,
        stok: stockMap.get(v.id) ?? 0,
        model: attrs.MODEL || '',
        renk: attrs.RENK || '',
        olcu: attrs['ÖLÇÜ'] || '',
        attrs,
      };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/odoo-sablon/:tmplId', async (req, res, next) => {
  try {
    const tmplId = Number(req.params.tmplId);
    const data = await execute('product.template', 'read',
      [[tmplId]],
      {
        fields: ['id', 'name', 'categ_id', 'default_code', 'barcode',
          'list_price', 'standard_price', 'type', 'taxes_id',
          'sale_ok', 'purchase_ok', 'can_be_expensed',
          'invoice_policy', 'tracking', 'sale_delay',
          'weight', 'volume', 'company_id',
          'attribute_line_ids', 'product_variant_count'],
      },
    );
    return res.json({ data: data[0] ?? null });
  } catch (err) {
    next(err);
  }
});

router.get('/odoo-attr-lines/:tmplId', async (req, res, next) => {
  try {
    const lines = await execute(
      'product.template.attribute.line', 'search_read',
      [[['product_tmpl_id', '=', Number(req.params.tmplId)]]],
      { fields: ['id', 'attribute_id', 'value_ids'] },
    );
    return res.json({ data: lines });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-temizle-attr-lines/:tmplId', async (req, res, next) => {
  try {
    const tmplId = Number(req.params.tmplId);

    const lines = await execute(
      'product.template.attribute.line', 'search_read',
      [[['product_tmpl_id', '=', tmplId]]],
      { fields: ['id', 'attribute_id', 'value_ids'] },
    ) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

    const gruplar = new Map<number, typeof lines>();
    for (const line of lines) {
      const attrId = line.attribute_id[0];
      if (!gruplar.has(attrId)) gruplar.set(attrId, []);
      gruplar.get(attrId)!.push(line);
    }

    const silinen: number[] = [];
    const guncellenen: number[] = [];

    for (const [, attrLines] of gruplar) {
      if (attrLines.length <= 1) continue;

      const tumDegerler = [...new Set(attrLines.flatMap((l) => l.value_ids))];

      const ilk = attrLines[0];
      await execute(
        'product.template.attribute.line', 'write',
        [[ilk.id], { value_ids: [[6, 0, tumDegerler]] }],
      );
      guncellenen.push(ilk.id);

      const silinecekler = attrLines.slice(1).map((l) => l.id);
      await execute(
        'product.template.attribute.line', 'unlink',
        [silinecekler],
      );
      silinen.push(...silinecekler);
    }

    return res.json({
      success: true,
      silinen,
      guncellenen,
      mesaj: `${silinen.length} duplicate line silindi`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-sablon-sil', async (req, res, next) => {
  try {
    const { tmplId } = req.body;
    if (!tmplId) return res.status(400).json({ error: 'tmplId zorunlu' });

    const varyantlar = await execute(
      'product.product', 'search',
      [[['product_tmpl_id', '=', Number(tmplId)]]],
    ) as number[];

    if (varyantlar.length) {
      await execute('product.product', 'unlink', [varyantlar]);
    }

    await execute('product.template', 'unlink', [[Number(tmplId)]]);

    return res.json({
      success: true,
      silinenVaryant: varyantlar.length,
      mesaj: `Şablon #${tmplId} ve ${varyantlar.length} varyant silindi`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-sablon-olustur', async (req, res, next) => {
  try {
    const {
      ad, tur, kategoriId, satisFiyati, maliyet,
      icReferans, barkod, sirketId, faturaKurali,
      izleme, teslimSuresi, agirlik, hacim,
      satilabilir, satinAlinabilir, masrafOlabilir,
      vergi,
    } = req.body;

    if (!ad?.trim()) return res.status(400).json({ error: 'ad zorunlu' });

    const tmplData: Record<string, unknown> = {
      name: ad.trim(),
      type: tur || 'product',
      categ_id: kategoriId ? Number(kategoriId) : false,
      list_price: Number(satisFiyati) || 0,
      standard_price: Number(maliyet) || 0,
      default_code: icReferans || false,
      barcode: barkod || false,
      sale_ok: !!satilabilir,
      purchase_ok: !!satinAlinabilir,
      can_be_expensed: !!masrafOlabilir,
      invoice_policy: faturaKurali || 'order',
      tracking: izleme || 'lot',
      sale_delay: Number(teslimSuresi) || 0,
      weight: Number(agirlik) || 0,
      volume: Number(hacim) || 0,
    };

    if (sirketId) {
      const sid = Number(sirketId);
      if (sid === 2 || sid === 3 || sid === 4) tmplData.company_id = sid;
    }
    if (vergi) {
      const taxes = await execute('account.tax', 'search_read',
        [[['type_tax_use', '=', 'sale'], ['amount', '=', Number(vergi)]]],
        { fields: ['id', 'name'], limit: 1 });
      if (taxes?.length) tmplData.taxes_id = [[6, 0, [taxes[0].id]]];
    }

    const tmplId = await execute('product.template', 'create', [tmplData]);

    return res.json({ success: true, tmplId });
  } catch (err) {
    next(err);
  }
});

/**
 * Toplu, STOKSUZ ürün açma — "stok cam" gibi barkod/stok gerektirmeyen,
 * sadece satış ekranında seçilebilir olması gereken ürün listeleri için.
 * Her satır ayrı bir product.template (varyantsız, tracking=none, stok=0,
 * barkod yok) olarak açılır. Aynı isim+kategoride zaten bir şablon varsa
 * atlanır (tekrar çalıştırmak güvenli — idempotent).
 */
router.post('/odoo-sablon-toplu-olustur', async (req, res, next) => {
  try {
    const { kategoriId, urunAdlari, satisFiyati, tur, izleme, satinAlinabilir } = req.body as {
      kategoriId?: number | string;
      urunAdlari?: string[];
      satisFiyati?: number | string;
      tur?: string;
      izleme?: string;
      satinAlinabilir?: boolean;
    };

    const katId = kategoriId ? Number(kategoriId) : null;
    if (!katId) return res.status(400).json({ error: 'kategoriId zorunlu' });

    const adlar = Array.from(
      new Set((urunAdlari ?? []).map((a) => String(a ?? '').trim()).filter(Boolean)),
    );
    if (!adlar.length) return res.status(400).json({ error: 'urunAdlari boş olamaz' });

    const mevcutlar = (await execute(
      'product.template', 'search_read',
      [[['categ_id', '=', katId]]],
      { fields: ['id', 'name'], limit: 2000, context: { active_test: false } },
    )) as { id: number; name: string }[];
    const mevcutAdSet = new Set(mevcutlar.map((m) => m.name.trim().toLocaleLowerCase('tr-TR')));

    const olusturulan: { ad: string; tmplId: number }[] = [];
    const atlanan: string[] = [];
    const hatalar: { ad: string; sebep: string }[] = [];

    for (const ad of adlar) {
      const key = ad.toLocaleLowerCase('tr-TR');
      if (mevcutAdSet.has(key)) { atlanan.push(ad); continue; }
      try {
        const tmplId = Number(await execute('product.template', 'create', [{
          name: ad,
          type: tur || 'consu',
          categ_id: katId,
          list_price: Number(satisFiyati) || 0,
          standard_price: 0,
          sale_ok: true,
          purchase_ok: satinAlinabilir !== false,
          tracking: izleme || 'none',
        }]));
        olusturulan.push({ ad, tmplId });
        mevcutAdSet.add(key);
      } catch (e: unknown) {
        hatalar.push({ ad, sebep: e instanceof Error ? e.message : String(e) });
      }
    }

    return res.json({
      success: true,
      olusturulan: olusturulan.length,
      atlanan: atlanan.length,
      hata: hatalar.length,
      detay: { olusturulan, atlanan, hatalar },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Bir kategorideki MÜKERRER (aynı isim) product.template kayıtlarını
 * tespit edip en eskisi (en küçük id) HARİÇ hepsini arşivler (active=false).
 * "Toplu Aç (Stoksuz)" akışında art arda tıklama/yarış durumu yüzünden
 * oluşabilecek yinelenen kayıtları tek tıkla temizlemek için.
 */
router.post('/odoo-sablon-mukerrer-temizle', async (req, res, next) => {
  try {
    const { kategoriId } = req.body as { kategoriId?: number | string };
    const katId = kategoriId ? Number(kategoriId) : null;
    if (!katId) return res.status(400).json({ error: 'kategoriId zorunlu' });

    const templates = (await execute(
      'product.template', 'search_read',
      [[['categ_id', '=', katId], ['active', '=', true]]],
      { fields: ['id', 'name'], limit: 10000, order: 'id asc' },
    )) as { id: number; name: string }[];

    const gruplar = new Map<string, { id: number; name: string }[]>();
    for (const t of templates) {
      const key = t.name.trim().toLocaleLowerCase('tr-TR');
      const arr = gruplar.get(key) ?? [];
      arr.push(t);
      gruplar.set(key, arr);
    }

    const arsivlenecekIdler: number[] = [];
    const detay: { ad: string; tutulanId: number; arsivlenenIdler: number[] }[] = [];
    for (const grup of gruplar.values()) {
      if (grup.length < 2) continue;
      const sirali = [...grup].sort((a, b) => a.id - b.id);
      const [tutulan, ...fazlalar] = sirali;
      arsivlenecekIdler.push(...fazlalar.map((f) => f.id));
      detay.push({ ad: tutulan.name, tutulanId: tutulan.id, arsivlenenIdler: fazlalar.map((f) => f.id) });
    }

    if (arsivlenecekIdler.length) {
      await execute('product.template', 'write', [arsivlenecekIdler, { active: false }]);
    }

    return res.json({
      success: true,
      taranan: templates.length,
      mukerrerGrup: detay.length,
      arsivlenen: arsivlenecekIdler.length,
      detay,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-varyant-import', async (req, res, next) => {
  try {
    const { tmplId, satirlar, sutunSirasi } = req.body;

    if (!tmplId || !satirlar?.length || !sutunSirasi) {
      return res.status(400).json({ error: 'Eksik parametre' });
    }

    const nitelikler = await execute(
      'product.attribute', 'search_read',
      [[['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']]]],
      { fields: ['id', 'name', 'create_variant'] },
    );
    const nitelikMap = new Map<string, number>(
      (nitelikler as { id: number; name: string }[]).map((n) => [n.name, n.id]),
    );
    const modelAttrId = nitelikMap.get('MODEL');
    const renkAttrId = nitelikMap.get('RENK');
    const olcuAttrId = nitelikMap.get('ÖLÇÜ');

    if (!modelAttrId || !renkAttrId || !olcuAttrId) {
      return res.status(400).json({
        error: 'MODEL, RENK veya ÖLÇÜ niteliği bulunamadı',
      });
    }

    const mevcutDegerler = await execute(
      'product.attribute.value', 'search_read',
      [[['attribute_id', 'in', [modelAttrId, renkAttrId, olcuAttrId]]]],
      { fields: ['id', 'name', 'attribute_id'], limit: 10000 },
    );
    const degerMap = new Map<string, number>();
    for (const d of mevcutDegerler as { id: number; name: string; attribute_id: [number, string] }[]) {
      degerMap.set(
        `${d.attribute_id[0]}_${d.name.trim().toUpperCase()}`,
        d.id,
      );
    }

    const getOrCreateDeger = async (attrId: number, ad: string): Promise<number> => {
      const key = `${attrId}_${ad.trim().toUpperCase()}`;
      if (degerMap.has(key)) return degerMap.get(key)!;
      const yeniId = Number(await execute(
        'product.attribute.value', 'create',
        [{ name: ad.trim(), attribute_id: attrId }],
      ));
      degerMap.set(key, yeniId);
      return yeniId;
    };

    const mevcutLines = await execute(
      'product.template.attribute.line', 'search_read',
      [[['product_tmpl_id', '=', Number(tmplId)]]],
      { fields: ['id', 'attribute_id', 'value_ids'] },
    ) as { id: number; attribute_id: [number, string]; value_ids: number[] }[];

    const lineMap = new Map<number, { id: number; value_ids: number[] }>();
    for (const line of mevcutLines) {
      const attrId = line.attribute_id[0];
      if (!lineMap.has(attrId)) {
        lineMap.set(attrId, { id: line.id, value_ids: line.value_ids });
      } else {
        await execute(
          'product.template.attribute.line', 'unlink', [[line.id]],
        );
      }
    }

    for (const attrId of [modelAttrId, renkAttrId, olcuAttrId]) {
      if (!lineMap.has(attrId)) {
        lineMap.set(attrId, { id: -1, value_ids: [] });
      }
    }

    type ParsedImportRow = {
      index: number;
      modelAd: string;
      renkAd: string;
      olcuAd: string | null;
      barkod: string;
      fiyat: number;
      modelId: number;
      renkId: number;
      olcuId: number | null;
    };

    const parsedRows: ParsedImportRow[] = [];
    const hatalar: { satir: number; sebep: string }[] = [];
    const attrUniqueValues = new Map<number, Set<number>>();

    for (let i = 0; i < satirlar.length; i++) {
      const satir = satirlar[i] as string[];
      const modelAd = satir[sutunSirasi.model]?.trim();
      const renkAd = satir[sutunSirasi.renk]?.trim();
      const olcuAd = sutunSirasi.olcu >= 0
        ? satir[sutunSirasi.olcu]?.trim() : null;
      const barkod = sutunSirasi.barkod >= 0
        ? satir[sutunSirasi.barkod]?.trim() : '';
      const fiyat = sutunSirasi.fiyat >= 0
        ? Number(satir[sutunSirasi.fiyat]) : 0;

      if (!modelAd || !renkAd) {
        hatalar.push({ satir: i + 1, sebep: 'Model veya renk boş' });
        continue;
      }

      try {
        const modelId = await getOrCreateDeger(modelAttrId, modelAd);
        const renkId = await getOrCreateDeger(renkAttrId, renkAd);
        const olcuId = olcuAd
          ? await getOrCreateDeger(olcuAttrId, olcuAd)
          : null;

        const track = (attrId: number, valueId: number) => {
          if (!attrUniqueValues.has(attrId)) attrUniqueValues.set(attrId, new Set());
          attrUniqueValues.get(attrId)!.add(valueId);
        };
        track(modelAttrId, modelId);
        track(renkAttrId, renkId);
        if (olcuId) track(olcuAttrId, olcuId);

        parsedRows.push({
          index: i,
          modelAd,
          renkAd,
          olcuAd,
          barkod,
          fiyat,
          modelId,
          renkId,
          olcuId,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message.slice(0, 150) : 'Bilinmeyen hata';
        hatalar.push({ satir: i + 1, sebep: msg });
      }
    }

    // Nitelik satırlarını toplu kur (dynamic modda kartezyen varyant üretmez)
    for (const [attrId, valueSet] of attrUniqueValues) {
      const valueIds = [...valueSet];
      const line = lineMap.get(attrId);
      if (!line || line.id === -1) {
        const lineId = Number(await execute(
          'product.template.attribute.line', 'create',
          [{
            product_tmpl_id: Number(tmplId),
            attribute_id: attrId,
            value_ids: [[6, 0, valueIds]],
          }],
        ));
        lineMap.set(attrId, { id: lineId, value_ids: valueIds });
      } else {
        const merged = [...new Set([...line.value_ids, ...valueIds])];
        if (merged.length !== line.value_ids.length
          || merged.some((id) => !line.value_ids.includes(id))) {
          await execute(
            'product.template.attribute.line', 'write',
            [[line.id], { value_ids: [[6, 0, merged]] }],
          );
          lineMap.set(attrId, { id: line.id, value_ids: merged });
        }
      }
    }

    const sonuclar: {
      satir: number; varyantId: number; model: string; renk: string;
      olcu: string; barkod: string; fiyat: number;
    }[] = [];

    const korunanPtavKeys = new Set<string>();
    const korunanVaryantIds = new Set<number>();

    for (const row of parsedRows) {
      try {
        const ptavlar = await execute(
          'product.template.attribute.value', 'search_read',
          [[
            ['product_tmpl_id', '=', Number(tmplId)],
            ['product_attribute_value_id', 'in',
              [row.modelId, row.renkId, ...(row.olcuId ? [row.olcuId] : [])],
            ],
          ]],
          { fields: ['id', 'attribute_id', 'product_attribute_value_id'] },
        ) as {
          id: number;
          attribute_id: [number, string];
          product_attribute_value_id: [number, string];
        }[];

        const modelPtav = ptavlar.find(
          (p) => p.product_attribute_value_id[0] === row.modelId,
        );
        const renkPtav = ptavlar.find(
          (p) => p.product_attribute_value_id[0] === row.renkId,
        );
        const olcuPtav = row.olcuId ? ptavlar.find(
          (p) => p.product_attribute_value_id[0] === row.olcuId,
        ) : null;

        if (!modelPtav || !renkPtav || (row.olcuId && !olcuPtav)) {
          hatalar.push({
            satir: row.index + 1,
            sebep: 'PTAV bulunamadı',
          });
          continue;
        }

        const ptavIds = [
          modelPtav.id,
          renkPtav.id,
          ...(olcuPtav ? [olcuPtav.id] : []),
        ];
        const key = ptavKey(ptavIds);
        korunanPtavKeys.add(key);

        const mevcutVaryantlar = await execute(
          'product.product', 'search_read',
          [[['product_tmpl_id', '=', Number(tmplId)]]],
          { fields: ['id', 'product_template_attribute_value_ids'], limit: 5000 },
        ) as { id: number; product_template_attribute_value_ids: number[] }[];

        const mevcutEslesen = mevcutVaryantlar.find(
          (v) => ptavKey(v.product_template_attribute_value_ids ?? []) === key,
        );

        if (mevcutEslesen) {
          korunanVaryantIds.add(mevcutEslesen.id);
          hatalar.push({
            satir: row.index + 1,
            sebep: 'Varyant zaten mevcut',
          });
          continue;
        }

        const varyantId = Number(await execute(
          'product.product', 'create',
          [{
            product_tmpl_id: Number(tmplId),
            product_template_attribute_value_ids: [[6, 0, ptavIds]],
            barcode: row.barkod || false,
            lst_price: row.fiyat || 0,
          }],
        ));
        korunanVaryantIds.add(varyantId);

        sonuclar.push({
          satir: row.index + 1,
          varyantId,
          model: row.modelAd,
          renk: row.renkAd,
          olcu: row.olcuAd || '',
          barkod: row.barkod || '',
          fiyat: row.fiyat || 0,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error
          ? e.message.slice(0, 150)
          : 'Bilinmeyen hata';
        hatalar.push({ satir: row.index + 1, sebep: msg });
      }
    }

    const temizlik = await temizleImportSonrasiVaryantlar(
      Number(tmplId),
      korunanPtavKeys,
      korunanVaryantIds,
    );

    return res.json({
      success: true,
      olusturulan: sonuclar.length,
      hatalar: hatalar.length,
      otomatikTemizlenen: temizlik.temizlenen,
      kalanVaryant: temizlik.kalanVaryant,
      temizlenemedi: temizlik.silinemedi.length,
      detay: {
        sonuclar: sonuclar.slice(0, 50),
        hatalar: hatalar.slice(0, 50),
        temizlenemediIds: temizlik.silinemedi.slice(0, 20),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-varyant-onizle', async (req, res, next) => {
  try {
    const { tmplId, satirlar, sutunSirasi } = req.body;

    if (!tmplId || !satirlar?.length || !sutunSirasi) {
      return res.status(400).json({ error: 'Eksik parametre' });
    }

    const nitelikler = await execute(
      'product.attribute', 'search_read',
      [[['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']]]],
      { fields: ['id', 'name'] },
    );
    const nitelikMap = new Map<string, number>(
      (nitelikler as { id: number; name: string }[]).map((n) => [n.name, n.id]),
    );
    const modelAttrId = nitelikMap.get('MODEL');
    const renkAttrId = nitelikMap.get('RENK');
    const olcuAttrId = nitelikMap.get('ÖLÇÜ');

    if (!modelAttrId || !renkAttrId || !olcuAttrId) {
      return res.status(400).json({ error: 'MODEL, RENK veya ÖLÇÜ niteliği bulunamadı' });
    }

    const mevcutDegerler = await execute(
      'product.attribute.value', 'search_read',
      [[['attribute_id', 'in', [modelAttrId, renkAttrId, olcuAttrId]]]],
      { fields: ['id', 'name', 'attribute_id'], limit: 10000 },
    );
    const degerAdlar = new Set(
      (mevcutDegerler as { attribute_id: [number, string]; name: string }[]).map(
        (d) => `${d.attribute_id[0]}_${d.name.trim().toUpperCase()}`,
      ),
    );

    type OnizleSatir = {
      satir: number;
      durum: string;
      sebep?: string;
      model: string;
      renk: string;
      olcu: string;
      barkod: string;
      fiyat: string;
      yeniModel?: boolean;
      yeniRenk?: boolean;
      yeniOlcu?: boolean;
    };

    const sonuclar: OnizleSatir[] = (satirlar as string[][]).map((satir, i) => {
      const modelAd = satir[sutunSirasi.model]?.trim() ?? '';
      const renkAd = satir[sutunSirasi.renk]?.trim() ?? '';
      const olcuAd = satir[sutunSirasi.olcu]?.trim() ?? '';
      const barkod = sutunSirasi.barkod !== undefined && sutunSirasi.barkod >= 0
        ? satir[sutunSirasi.barkod]?.trim() ?? '' : '';
      const fiyat = sutunSirasi.fiyat !== undefined && sutunSirasi.fiyat >= 0
        ? satir[sutunSirasi.fiyat]?.trim() ?? '' : '';

      if (!modelAd || !renkAd || !olcuAd) {
        return {
          satir: i + 1,
          durum: 'hata',
          sebep: 'Boş değer',
          model: modelAd,
          renk: renkAd,
          olcu: olcuAd,
          barkod,
          fiyat,
        };
      }

      const yeniModel = !degerAdlar.has(`${modelAttrId}_${modelAd.toUpperCase()}`);
      const yeniRenk = !degerAdlar.has(`${renkAttrId}_${renkAd.toUpperCase()}`);
      const yeniOlcu = !degerAdlar.has(`${olcuAttrId}_${olcuAd.toUpperCase()}`);
      const yeniDeger = yeniModel || yeniRenk || yeniOlcu;

      return {
        satir: i + 1,
        durum: yeniDeger ? 'yeni_deger' : 'hazir',
        model: modelAd,
        renk: renkAd,
        olcu: olcuAd,
        barkod,
        fiyat,
        yeniModel,
        yeniRenk,
        yeniOlcu,
      };
    });

    const kombinasyonlar = new Set<string>();
    for (const s of sonuclar) {
      if (s.durum === 'hata') continue;
      const key = `${s.model}_${s.renk}_${s.olcu}`;
      if (kombinasyonlar.has(key)) {
        s.durum = 'duplicate';
        s.sebep = 'Aynı kombinasyon listede tekrar var';
      } else {
        kombinasyonlar.add(key);
      }
    }

    return res.json({
      success: true,
      toplam: sonuclar.length,
      hazir: sonuclar.filter((s) => s.durum === 'hazir').length,
      yeniDeger: sonuclar.filter((s) => s.durum === 'yeni_deger').length,
      hata: sonuclar.filter((s) => s.durum === 'hata').length,
      duplicate: sonuclar.filter((s) => s.durum === 'duplicate').length,
      satirlar: sonuclar,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/odoo-varyant-guncelle', async (req, res, next) => {
  try {
    const { varyantlar } = req.body;
    for (const v of (varyantlar || [])) {
      if (!v.odooId) continue;
      await execute('product.product', 'write', [
        [v.odooId],
        {
          default_code: v.icReferans || false,
          barcode: v.barkod || false,
          lst_price: Number(v.satisFiyati) || 0,
          standard_price: Number(v.maliyet) || 0,
        },
      ]);
    }
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── STOK YÖNETİMİ ────────────────────────────────────────────────
async function kullaniciSubeKodu(branchId: string): Promise<string | undefined> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { code: true } });
  return branch?.code;
}

router.get('/stok-kontrol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, kategoriId, fiyatMin, fiyatMax, stokDurumu, lokasyon, kdv } = req.query;
    const data = await stokYonetimi.listStokKontrol({
      q: q ? String(q) : undefined,
      kategoriId: kategoriId ? Number(kategoriId) : undefined,
      fiyatMin: fiyatMin != null && fiyatMin !== '' ? Number(fiyatMin) : undefined,
      fiyatMax: fiyatMax != null && fiyatMax !== '' ? Number(fiyatMax) : undefined,
      stokDurumu: stokDurumu === 'var' || stokDurumu === 'sifir' ? stokDurumu : undefined,
      lokasyon: lokasyon ? String(lokasyon) : undefined,
      kdv: kdv ? Number(kdv) : undefined,
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/stok-kontrol/uts-duzeltme-sablon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { productIds } = req.body ?? {};
    if (!Array.isArray(productIds) || !productIds.length) {
      return res.status(400).json({ error: 'productIds zorunlu' });
    }
    const buffer = await buildUtsDuzeltmeSablonBuffer(productIds.map(Number));
    const tarih = new Date().toISOString().slice(0, 10);
    const filename = `uts-duzeltme-sablon-${tarih}.xlsx`;
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

router.get('/stok-urunleri', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, kategoriId, fiyatMin, fiyatMax, stokDurumu, lokasyon, kdv, durum, page, limit } = req.query;
    const durumVal = durum ? String(durum) : undefined;
    const result = await stokYonetimi.listStokUrunleri({
      q: q ? String(q) : undefined,
      kategoriId: kategoriId ? Number(kategoriId) : undefined,
      fiyatMin: fiyatMin != null ? Number(fiyatMin) : undefined,
      fiyatMax: fiyatMax != null ? Number(fiyatMax) : undefined,
      stokDurumu: stokDurumu as 'tumu' | 'var' | 'sifir' | undefined,
      lokasyon: lokasyon ? String(lokasyon) : undefined,
      kdv: kdv ? Number(kdv) : undefined,
      durum: durumVal === 'arsiv' || durumVal === 'hepsi' ? durumVal : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/stok-urunleri/arsivle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { urunIds } = req.body ?? {};
    if (!Array.isArray(urunIds) || !urunIds.length) {
      return res.status(400).json({ error: 'urunIds zorunlu' });
    }
    const result = await stokYonetimi.topluUrunArsivle(urunIds.map(Number));
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/stok-urunleri/arsivden-cikar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { urunIds } = req.body ?? {};
    if (!Array.isArray(urunIds) || !urunIds.length) {
      return res.status(400).json({ error: 'urunIds zorunlu' });
    }
    const result = await stokYonetimi.topluUrunArsivdenCikar(urunIds.map(Number));
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-sablon/varyant-arsivle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { variantIds } = req.body ?? {};
    if (!Array.isArray(variantIds) || !variantIds.length) {
      return res.status(400).json({ error: 'variantIds zorunlu' });
    }
    const result = await stokYonetimi.topluVaryantArsivle(variantIds.map(Number));
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-sablon/varyant-arsivden-cikar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { variantIds } = req.body ?? {};
    if (!Array.isArray(variantIds) || !variantIds.length) {
      return res.status(400).json({ error: 'variantIds zorunlu' });
    }
    const result = await stokYonetimi.topluVaryantArsivdenCikar(variantIds.map(Number));
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

function parseStokExportFormat(raw: unknown): 'pdf' | 'xlsx' | 'csv' | null {
  const f = String(raw ?? '').toLowerCase();
  if (f === 'pdf' || f === 'xlsx' || f === 'csv') return f;
  return null;
}

router.post('/stok-urunleri/disa-aktar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { urunIds, format } = req.body ?? {};
    const fmt = parseStokExportFormat(format);
    if (!fmt) return res.status(400).json({ error: 'format zorunlu (pdf, xlsx, csv)' });
    if (!Array.isArray(urunIds) || !urunIds.length) {
      return res.status(400).json({ error: 'urunIds zorunlu' });
    }
    const buffer = await stokExport.exportStokUrunleri(urunIds.map(Number), fmt);
    const filename = stokExport.stokExportFilename('stok-urunleri', fmt);
    res.setHeader('Content-Type', stokExport.stokExportContentType(fmt));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.post('/odoo-sablon/varyant-disa-aktar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { variantIds, format } = req.body ?? {};
    const fmt = parseStokExportFormat(format);
    if (!fmt) return res.status(400).json({ error: 'format zorunlu (pdf, xlsx, csv)' });
    if (!Array.isArray(variantIds) || !variantIds.length) {
      return res.status(400).json({ error: 'variantIds zorunlu' });
    }
    const buffer = await stokExport.exportStokVaryantlari(variantIds.map(Number), fmt);
    const filename = stokExport.stokExportFilename('stok-varyantlari', fmt);
    res.setHeader('Content-Type', stokExport.stokExportContentType(fmt));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.patch('/stok-fiyat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { urunId, satisFiyati, alisFiyati } = req.body ?? {};
    if (!urunId) return res.status(400).json({ error: 'urunId zorunlu' });
    const result = await stokYonetimi.guncelleStokFiyat({
      urunId: Number(urunId),
      satisFiyati: satisFiyati != null ? Number(satisFiyati) : undefined,
      alisFiyati: alisFiyati != null ? Number(alisFiyati) : undefined,
      degistirenUserId: user.userId,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/stok-fiyat-toplu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { urunIds, tip, deger, hedef } = req.body ?? {};
    if (!Array.isArray(urunIds) || !urunIds.length) {
      return res.status(400).json({ error: 'urunIds zorunlu' });
    }
    const result = await stokYonetimi.topluFiyatGuncelle({
      urunIds: urunIds.map(Number),
      tip: tip ?? 'yuzde',
      deger: Number(deger) || 0,
      hedef: hedef ?? 'satis',
      degistirenUserId: user.userId,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/stok-urun/:tmplId/lotlar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tmplId = Number(req.params.tmplId);
    const lokasyon = String(req.query.lokasyon ?? 'GVN1');
    const lotlar = await stokYonetimi.getUrunLotlari(tmplId, lokasyon);
    return res.json({ data: lotlar });
  } catch (err) {
    next(err);
  }
});

router.get('/varyant-lot-bilgisi/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Geçersiz productId' });
    }
    const data = await stokYonetimi.getVaryantLotBilgisi(productId);
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/fiyat-degisiklikleri', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    let subeKodu: string | undefined;
    if (user.role === Role.STORE_MANAGER) {
      subeKodu = await kullaniciSubeKodu(user.branchId);
    } else if (req.query.subeKodu) {
      subeKodu = String(req.query.subeKodu);
    }
    const okundu = req.query.okundu === 'true' ? true : req.query.okundu === 'false' ? false : undefined;
    const etiketBasildi =
      req.query.etiketBasildi === 'true'
        ? true
        : req.query.etiketBasildi === 'false'
          ? false
          : undefined;
    const data = await stokYonetimi.listFiyatBildirimleri({ subeKodu, okundu, etiketBasildi });
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/fiyat-degisiklikleri/sayac', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    let subeKodu: string | undefined;
    if (user.role === Role.STORE_MANAGER) {
      subeKodu = await kullaniciSubeKodu(user.branchId);
    }
    let count = await stokYonetimi.fiyatBildirimSayac(subeKodu);
    if (user.userId) {
      count += await bildirimService.bildirimSayac(user.userId);
    }
    return res.json({ count });
  } catch (err) {
    next(err);
  }
});

router.post('/fiyat-degisiklikleri/toplu-etiket-basildi', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids zorunlu' });
    }
    let subeKodu: string | undefined;
    if (user.role === Role.STORE_MANAGER) {
      subeKodu = await kullaniciSubeKodu(user.branchId);
    }
    const result = await stokYonetimi.fiyatBildirimEtiketBasildiToplu(
      ids.map(String),
      { subeKodu },
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.patch('/fiyat-degisiklikleri/:id/etiket-basildi', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    let subeKodu: string | undefined;
    if (user.role === Role.STORE_MANAGER) {
      subeKodu = await kullaniciSubeKodu(user.branchId);
    }
    const data = await stokYonetimi.fiyatBildirimEtiketBasildi(req.params.id, { subeKodu });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.patch('/fiyat-degisiklikleri/:id/okundu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await stokYonetimi.bildirimOkundu(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.patch('/fiyat-degisiklikleri/okundu-tumu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    let subeKodu: string | undefined;
    if (user.role === Role.STORE_MANAGER) {
      subeKodu = await kullaniciSubeKodu(user.branchId);
    }
    const count = await stokYonetimi.bildirimleriOkunduIsaretle(subeKodu);
    return res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

// ── UTS YÖNETİMİ ─────────────────────────────────────────────────
router.get('/uts/subeler', async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      include: { utsSube: true },
      orderBy: { code: 'asc' },
    });
    return res.json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
});

router.post('/uts/sube-kaydet', async (req, res, next) => {
  try {
    const { branchId, kurumNo, token, ortam } = req.body;
    if (!branchId) return res.status(400).json({ error: 'branchId zorunlu' });
    const sube = await prisma.utsSube.upsert({
      where: { branchId },
      update: { kurumNo, token, ortam, aktif: !!(kurumNo && token) },
      create: {
        branchId,
        kurumNo,
        token,
        ortam: ortam || 'canli',
        aktif: !!(kurumNo && token),
      },
    });
    return res.json({ success: true, data: sube });
  } catch (err) {
    next(err);
  }
});

router.post('/uts/token-test/:branchId', async (req, res, next) => {
  try {
    const sonuc = await testUtsSubeToken(req.params.branchId);
    return res.json(sonuc);
  } catch (err) {
    next(err);
  }
});

router.get('/uts/odoo-cariler', async (req, res, next) => {
  try {
    const q = (req.query.q as string) || '';
    const domain: unknown[] = [
      ['is_company', '=', true],
      ['active', '=', true],
    ];
    if (q) domain.push(['name', 'ilike', q]);
    const partners = await execute(
      'res.partner', 'search_read',
      [domain],
      { fields: ['id', 'name', 'vat', 'phone', 'email', 'street', 'city'], limit: 30 },
    );
    return res.json({ success: true, data: partners });
  } catch (err) {
    next(err);
  }
});

router.get('/uts/dis-firmalar', async (req, res, next) => {
  try {
    const data = await prisma.utsDisFirma.findMany({
      where: { aktif: true },
      include: { lokasyonlar: { orderBy: { varsayilan: 'desc' } } },
      orderBy: { ad: 'asc' },
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/uts/dis-firma', async (req, res, next) => {
  try {
    const { ad, vkn, kurumNo, adres, telefon, email, notlar, odooPartnerId } = req.body;
    if (!ad?.trim()) return res.status(400).json({ error: 'Firma adı zorunlu' });
    const data = await prisma.utsDisFirma.create({
      data: {
        ad, vkn, kurumNo, adres, telefon, email, notlar,
        odooPartnerId: odooPartnerId ? Number(odooPartnerId) : undefined,
      },
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/uts/dis-firma/:id', async (req, res, next) => {
  try {
    const { ad, vkn, kurumNo, adres, telefon, email, notlar, odooPartnerId } = req.body;
    const data = await prisma.utsDisFirma.update({
      where: { id: req.params.id },
      data: {
        ad, vkn, kurumNo, adres, telefon, email, notlar,
        odooPartnerId: odooPartnerId ? Number(odooPartnerId) : null,
      },
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/uts/dis-firma/:firmaId/lokasyon', async (req, res, next) => {
  try {
    const { ad, kurumNo, varsayilan } = req.body;
    if (!ad?.trim()) return res.status(400).json({ error: 'Lokasyon adı zorunlu' });

    if (varsayilan) {
      await prisma.utsDisFirmaLokasyon.updateMany({
        where: { firmaId: req.params.firmaId },
        data: { varsayilan: false },
      });
    }

    const data = await prisma.utsDisFirmaLokasyon.create({
      data: {
        firmaId: req.params.firmaId,
        ad,
        kurumNo,
        varsayilan: !!varsayilan,
      },
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/uts/dis-firma-lokasyon/:id', async (req, res, next) => {
  try {
    const { ad, kurumNo, varsayilan } = req.body;
    const mevcut = await prisma.utsDisFirmaLokasyon.findUnique({
      where: { id: req.params.id },
    });
    if (!mevcut) return res.status(404).json({ error: 'Lokasyon bulunamadı' });

    if (varsayilan) {
      await prisma.utsDisFirmaLokasyon.updateMany({
        where: { firmaId: mevcut.firmaId },
        data: { varsayilan: false },
      });
    }

    const data = await prisma.utsDisFirmaLokasyon.update({
      where: { id: req.params.id },
      data: { ad, kurumNo, varsayilan: !!varsayilan },
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete('/uts/dis-firma-lokasyon/:id', async (req, res, next) => {
  try {
    await prisma.utsDisFirmaLokasyon.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/uts/kuyruk', async (req, res, next) => {
  try {
    const data = await prisma.utsBildirim.findMany({
      where: { durum: { in: ['BEKLIYOR', 'HATA'] } },
      include: {
        branch: { select: { name: true, code: true } },
        kalemler: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/uts/gonderilen', async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 30;
    const limit = Number(req.query.limit) || 100;
    const { data, count } = await listGonderilenUtsBildirimler({ days, limit });
    return res.json({ success: true, count, data });
  } catch (err) {
    next(err);
  }
});

router.get('/uts/urun-girisi-bekleyen', async (req, res, next) => {
  try {
    const [sayac, data] = await Promise.all([
      urunGirisiBekleyenSayac(),
      listUrunGirisiBekleyenler(50),
    ]);
    return res.json({ success: true, sayac, data });
  } catch (err) {
    next(err);
  }
});

router.post('/uts/bekleyen-alma-toplu-bildir', async (req, res, next) => {
  try {
    const { subeKodu, satirlar } = req.body ?? {};
    if (!subeKodu || !Array.isArray(satirlar) || !satirlar.length) {
      return res.status(400).json({ error: 'subeKodu ve satirlar zorunlu' });
    }
    const sonuclar = await bekleyenAlmaTopluBildir({ subeKodu: String(subeKodu), satirlar });
    const basarili = sonuclar.filter((s) => s.durum === 'GONDERILDI').length;
    const basarisiz = sonuclar.length - basarili;
    return res.json({ success: true, basarili, basarisiz, sonuclar });
  } catch (err) {
    next(err);
  }
});

router.get('/uts/belge-sorgula', async (req, res, next) => {
  try {
    const belgeNo = String(req.query.belgeNo ?? '').trim();
    let subeKodu = String(req.query.subeKodu ?? '').trim();
    const sirketId = Number(req.query.sirketId);
    if (!subeKodu && Number.isFinite(sirketId) && sirketId > 0) {
      subeKodu = sirketIdToReferansSube(sirketId);
    }
    if (!subeKodu) subeKodu = 'GVN2';

    const utsSube = await resolveUtsSubeForSubeKodu(subeKodu);
    if (!utsSube?.token?.trim()) {
      return res.status(400).json({ error: `${subeKodu} şubesi için UTS token tanımlı değil` });
    }
    if (!utsSube.aktif) {
      return res.status(400).json({ error: `${subeKodu} UTS entegrasyonu pasif — UTS Yönetimi'nden token test edin` });
    }

    const gkkRaw = Number(req.query.gkk);
    const gonderenKurumNo = Number.isFinite(gkkRaw) && gkkRaw > 0 ? gkkRaw : undefined;
    const uno = String(req.query.uno ?? '').trim() || undefined;

    const satirlar = belgeNo
      ? await sorgulaBelgeNoIleAlmaBekleyenler({
          token: utsSube.token,
          ortam: utsSube.ortam,
          belgeNo,
          gonderenKurumNo,
        })
      : await sorgulaAlmaBekleyenler({
          token: utsSube.token,
          ortam: utsSube.ortam,
          gonderenKurumNo,
          urunNumarasi: uno,
        });

    return res.json({
      success: true,
      subeKodu,
      subeAdi: utsSube.branch?.name ?? subeKodu,
      belgeNo: belgeNo || undefined,
      sayi: satirlar.length,
      data: satirlar,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/uts/alma-bekleyenler', async (req, res, next) => {
  try {
    let subeKodu = String(req.query.subeKodu ?? '').trim();
    const sirketId = Number(req.query.sirketId);
    if (!subeKodu && Number.isFinite(sirketId) && sirketId > 0) {
      subeKodu = sirketIdToReferansSube(sirketId);
    }
    if (!subeKodu) {
      return res.status(400).json({ error: 'subeKodu zorunlu' });
    }

    const utsSube = await resolveUtsSubeForSubeKodu(subeKodu);
    if (!utsSube?.token?.trim()) {
      return res.status(400).json({ error: `${subeKodu} şubesi için UTS token tanımlı değil` });
    }
    if (!utsSube.aktif) {
      return res.status(400).json({ error: `${subeKodu} UTS entegrasyonu pasif — UTS Yönetimi'nden token test edin` });
    }

    const belgeNo = String(req.query.belgeNo ?? '').trim() || undefined;
    const gkkRaw = Number(req.query.gkk);
    const gonderenKurumNo = Number.isFinite(gkkRaw) && gkkRaw > 0 ? gkkRaw : undefined;
    const uno = String(req.query.uno ?? '').trim() || undefined;

    const satirlar = await sorgulaAlmaBekleyenler({
      token: utsSube.token,
      ortam: utsSube.ortam,
      belgeNo,
      gonderenKurumNo,
      urunNumarasi: uno,
    });

    return res.json({
      success: true,
      subeKodu,
      subeAdi: utsSube.branch?.name ?? subeKodu,
      filtreler: { belgeNo, gkk: gonderenKurumNo, uno },
      sayi: satirlar.length,
      data: satirlar,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/uts/almak-istemiyorum', async (req, res, next) => {
  try {
    const bid = String(req.body?.bid ?? '').trim();
    let subeKodu = String(req.body?.subeKodu ?? '').trim();
    if (!bid) return res.status(400).json({ error: 'bid zorunlu' });
    if (!subeKodu) return res.status(400).json({ error: 'subeKodu zorunlu' });

    const utsSube = await resolveUtsSubeForSubeKodu(subeKodu);
    if (!utsSube?.token?.trim()) {
      return res.status(400).json({ error: `${subeKodu} şubesi için UTS token tanımlı değil` });
    }
    if (!utsSube.aktif) {
      return res.status(400).json({ error: `${subeKodu} UTS entegrasyonu pasif — UTS Yönetimi'nden token test edin` });
    }

    const sonuc = await almakIstemiyorumOlarakIsaretle({
      token: utsSube.token,
      ortam: utsSube.ortam,
      bid,
    });

    return res.json({ success: true, bid, data: sonuc });
  } catch (err) {
    const message = extractUtsHataDetay(err);
    return res.status(500).json({ error: message });
  }
});

router.post('/uts/bildirim-olustur', async (req, res, next) => {
  try {
    const {
      tip, branchId, kalemler,
      karsiKurumNo, karsiVkn, karsiAd,
      belgeNo, hemenGonder,
    } = req.body;

    if (!tip || !branchId || !kalemler?.length) {
      return res.status(400).json({ error: 'tip, branchId ve kalemler zorunlu' });
    }

    const sonuc = await bildirimOlusturVeGonder({
      tip,
      branchId,
      kalemler,
      karsiTaraf: {
        kurumNo: karsiKurumNo,
        vkn: karsiVkn,
        ad: karsiAd,
      },
      belgeNo,
      hemenGonder: !!hemenGonder,
    });

    const guncel = await prisma.utsBildirim.findUnique({
      where: { id: sonuc.bildirimId },
      include: { kalemler: true },
    });
    return res.json({ success: true, data: guncel });
  } catch (err) {
    next(err);
  }
});

router.post('/uts/bildirim-gonder/:id', async (req, res, next) => {
  try {
    const bildirim = await prisma.utsBildirim.findUnique({
      where: { id: req.params.id },
      include: { kalemler: true, branch: true },
    });
    if (!bildirim) return res.status(404).json({ error: 'Bildirim bulunamadı' });

    const utsSube = await prisma.utsSube.findUnique({
      where: { branchId: bildirim.branchId },
    });
    if (!utsSube?.token) {
      return res.status(400).json({ error: 'Bu şube için token tanımlı değil' });
    }

    await gondermeBildiriminiYap(bildirim, { token: utsSube.token, ortam: utsSube.ortam });
    return res.json({ success: true });
  } catch (err: unknown) {
    const message = extractUtsHataDetay(err);
    await prisma.utsBildirim.update({
      where: { id: req.params.id },
      data: { durum: 'HATA', hataDetay: message },
    }).catch(() => {});
    return res.status(500).json({ error: message });
  }
});

router.post('/uts/toplu-gonder', async (req, res, next) => {
  try {
    const { ids } = req.body;
    const sonuclar: Array<{ id: string; durum: string; sebep?: string }> = [];
    for (const id of (ids || [])) {
      try {
        const bildirim = await prisma.utsBildirim.findUnique({
          where: { id },
          include: { kalemler: true },
        });
        if (!bildirim) continue;
        const utsSube = await prisma.utsSube.findUnique({
          where: { branchId: bildirim.branchId },
        });
        if (!utsSube?.token) {
          sonuclar.push({ id, durum: 'HATA', sebep: 'Token yok' });
          continue;
        }
        await gondermeBildiriminiYap(bildirim, { token: utsSube.token, ortam: utsSube.ortam });
        sonuclar.push({ id, durum: 'GONDERILDI' });
      } catch (e: unknown) {
        const message = extractUtsHataDetay(e);
        await prisma.utsBildirim.update({
          where: { id },
          data: { durum: 'HATA', hataDetay: message },
        }).catch(() => {});
        sonuclar.push({ id, durum: 'HATA', sebep: message });
      }
    }
    return res.json({ success: true, sonuclar });
  } catch (err) {
    next(err);
  }
});

router.get('/sirket-ayar/:sirketId', async (req, res) => {
  try {
    const ayarlar = await prisma.sirketAyar.findMany({
      where: { sirketId: req.params.sirketId },
    })
    const map: Record<string, string> = {}
    for (const a of ayarlar) {
      if (a.anahtar.includes('password') || a.anahtar.includes('sifre')) {
        map[a.anahtar] = '••••••••'
      } else {
        map[a.anahtar] = a.deger
      }
    }
    return res.json({ data: map })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/sirket-ayar/:sirketId', async (req, res) => {
  try {
    const { ayarlar } = req.body
    for (const [anahtar, deger] of Object.entries(ayarlar as Record<string, string>)) {
      if (!deger || deger === '••••••••') continue
      await prisma.sirketAyar.upsert({
        where: { sirketId_anahtar: { sirketId: req.params.sirketId, anahtar } },
        create: { sirketId: req.params.sirketId, anahtar, deger: String(deger) },
        update: { deger: String(deger) },
      })
    }
    // e-İrsaliye kimlik bilgisi değiştiyse SOAP client cache'ini temizle
    const keys = Object.keys(ayarlar as Record<string, string>)
    if (keys.some((k) => k.startsWith('uyumsoft_eirsaliye_'))) {
      const { clearDespatchClientCache } = await import('../efatura/uyumsoft-irsaliye.service')
      clearDespatchClientCache(req.params.sirketId)
    }
    if (keys.includes('uyumsoft_username') || keys.includes('uyumsoft_password')) {
      const { clearUyumsoftClientCache } = await import('../uyumsoft/uyumsoft.service')
      clearUyumsoftClientCache(req.params.sirketId)
    }
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── E-TİCARET ENTEGRASYONU (Tanımlamalar > E-Ticaret) ─────────────
function maskSecret(v: string | null | undefined): string | null {
  if (!v) return null
  if (v.length <= 6) return '••••••'
  return `${v.slice(0, 3)}••••${v.slice(-3)}`
}

async function getOrCreateEticaretAyar() {
  const existing = await prisma.eticaretAyar.findFirst()
  if (existing) return existing
  return prisma.eticaretAyar.create({
    data: { bizimApiAnahtari: crypto.randomBytes(24).toString('hex') },
  })
}

router.get('/eticaret/ayarlar', async (_req: Request, res: Response) => {
  try {
    const ayar = await getOrCreateEticaretAyar()
    const [subeler, kullanicilar] = await Promise.all([
      prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, sirketAdi: true, eticaretSubesiMi: true, eticaretOncelikSirasi: true },
        orderBy: [{ eticaretOncelikSirasi: 'asc' }, { name: 'asc' }],
      }),
      prisma.user.findMany({
        where: { isActive: true, role: Role.ADMIN },
        select: { id: true, name: true, username: true },
      }),
    ])
    return res.json({
      data: {
        ...ayar,
        bizimApiAnahtari: maskSecret(ayar.bizimApiAnahtari),
        partnerApiToken: maskSecret(ayar.partnerApiToken),
      },
      subeler,
      kullanicilar,
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.put('/eticaret/ayarlar', async (req: Request, res: Response) => {
  try {
    const ayar = await getOrCreateEticaretAyar()
    const { partnerApiUrl, partnerApiToken, partnerDurumGuncelleUrl, eticaretSubeId, eticaretTemsilciUserId } = req.body ?? {}

    const data: Record<string, any> = {}
    if (partnerApiUrl !== undefined) data.partnerApiUrl = partnerApiUrl || null
    if (partnerDurumGuncelleUrl !== undefined) data.partnerDurumGuncelleUrl = partnerDurumGuncelleUrl || null
    if (partnerApiToken && !partnerApiToken.includes('••••')) data.partnerApiToken = partnerApiToken
    if (eticaretTemsilciUserId !== undefined) data.eticaretTemsilciUserId = eticaretTemsilciUserId || null

    if (eticaretSubeId !== undefined && eticaretSubeId !== ayar.eticaretSubeId) {
      if (ayar.eticaretSubeId) {
        await prisma.branch.update({ where: { id: ayar.eticaretSubeId }, data: { eticaretSubesiMi: false } }).catch(() => null)
      }
      if (eticaretSubeId) {
        await prisma.branch.update({ where: { id: eticaretSubeId }, data: { eticaretSubesiMi: true } })
      }
      data.eticaretSubeId = eticaretSubeId || null
    }

    const updated = await prisma.eticaretAyar.update({ where: { id: ayar.id }, data })
    return res.json({
      success: true,
      data: { ...updated, bizimApiAnahtari: maskSecret(updated.bizimApiAnahtari), partnerApiToken: maskSecret(updated.partnerApiToken) },
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// Anahtarı sadece üretim anında tam olarak döner — sonrasında hep maskeli görünür.
router.post('/eticaret/api-anahtari-yenile', async (_req: Request, res: Response) => {
  try {
    const ayar = await getOrCreateEticaretAyar()
    const yeniAnahtar = crypto.randomBytes(24).toString('hex')
    await prisma.eticaretAyar.update({ where: { id: ayar.id }, data: { bizimApiAnahtari: yeniAnahtar } })
    return res.json({ success: true, bizimApiAnahtari: yeniAnahtar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// Öncelik sırasını tek seferde günceller — subeIds dizisindeki sıra = öncelik sırası.
router.put('/eticaret/oncelik-sirasi', async (req: Request, res: Response) => {
  try {
    const { subeIds } = req.body ?? {}
    if (!Array.isArray(subeIds)) {
      return res.status(400).json({ error: 'subeIds bir dizi olmalı' })
    }
    await prisma.$transaction([
      prisma.branch.updateMany({ data: { eticaretOncelikSirasi: null } }),
      ...subeIds.map((id: string, index: number) =>
        prisma.branch.update({ where: { id }, data: { eticaretOncelikSirasi: index + 1 } }),
      ),
    ])
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// Siparişleri partner API'sinden şimdi çek (cron zaten 2 dakikada bir çalışır — manuel/acil tetikleme için)
router.post('/eticaret/siparisleri-cek', async (_req: Request, res: Response) => {
  try {
    const { partnerSiparisleriCek } = await import('../eticaret/eticaret-siparis.service')
    const sonuc = await partnerSiparisleriCek()
    return res.json({ success: true, ...sonuc })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/eticaret/durum-bildir', async (_req: Request, res: Response) => {
  try {
    const { partnerlereDurumBildir } = await import('../eticaret/eticaret-siparis.service')
    const sonuc = await partnerlereDurumBildir()
    return res.json({ success: true, ...sonuc })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.get('/eticaret/siparisler', async (req: Request, res: Response) => {
  try {
    const durum = typeof req.query.durum === 'string' ? req.query.durum : undefined
    const siparisler = await prisma.eticaretSiparis.findMany({
      where: durum ? { durum } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        secilenSube: { select: { name: true, code: true } },
        sale: { select: { referansNo: true, netTotal: true, odooSyncError: true, eFaturaDurum: true } },
      },
    })
    return res.json({ data: siparisler })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── PERSONEL CV (ÖZGEÇMİŞ) — yönetici görünümü ────────────────────
router.get('/personel/:id/ozgecmis', async (req, res, next) => {
  try {
    const [ozgecmis, sertifikalar] = await Promise.all([
      prisma.personelOzgecmis.findUnique({ where: { personelId: req.params.id } }),
      prisma.personelSertifika.findMany({
        where: { personelId: req.params.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return res.json({ success: true, data: { ozgecmis, sertifikalar } });
  } catch (err) { next(err); }
});

router.put('/personel/:id/ozgecmis', async (req, res, next) => {
  try {
    const data = ozgecmisVeriTemizle(req.body ?? {});
    const ozgecmis = await prisma.personelOzgecmis.upsert({
      where: { personelId: req.params.id },
      create: { personelId: req.params.id, ...data },
      update: data,
    });
    return res.json({ success: true, data: ozgecmis });
  } catch (err) { next(err); }
});

router.delete('/personel-sertifika/:sertifikaId', async (req, res, next) => {
  try {
    await prisma.personelSertifika.delete({ where: { id: req.params.sertifikaId } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ── BELGE KATEGORİLERİ — yönetici CRUD ─────────────────────────────
router.get('/personel-belge-kategorileri', async (req, res, next) => {
  try {
    const kategoriler = await prisma.personelBelgeKategorisi.findMany({
      orderBy: [{ grup: 'asc' }, { siraNo: 'asc' }],
    });
    return res.json({ success: true, data: kategoriler });
  } catch (err) { next(err); }
});

router.post('/personel-belge-kategorileri', async (req, res, next) => {
  try {
    const { kod, ad, grup, zorunlu, siraNo, hedefGruplar } = req.body ?? {};
    if (!kod || !ad || !grup) return res.status(400).json({ error: 'kod, ad ve grup zorunlu' });
    const kategori = await prisma.personelBelgeKategorisi.create({
      data: {
        kod: String(kod).toUpperCase().trim(),
        ad,
        grup,
        zorunlu: Boolean(zorunlu),
        siraNo: Number(siraNo) || 0,
        hedefGruplar: Array.isArray(hedefGruplar) ? hedefGruplar : [],
      },
    });
    return res.json({ success: true, data: kategori });
  } catch (err) { next(err); }
});

router.put('/personel-belge-kategorileri/:id', async (req, res, next) => {
  try {
    const { ad, grup, zorunlu, aktif, siraNo, hedefGruplar } = req.body ?? {};
    const data: Record<string, any> = {};
    if (ad !== undefined) data.ad = ad;
    if (grup !== undefined) data.grup = grup;
    if (zorunlu !== undefined) data.zorunlu = Boolean(zorunlu);
    if (aktif !== undefined) data.aktif = Boolean(aktif);
    if (siraNo !== undefined) data.siraNo = Number(siraNo);
    if (hedefGruplar !== undefined) data.hedefGruplar = Array.isArray(hedefGruplar) ? hedefGruplar : [];
    const kategori = await prisma.personelBelgeKategorisi.update({
      where: { id: req.params.id },
      data,
    });
    return res.json({ success: true, data: kategori });
  } catch (err) { next(err); }
});

router.delete('/personel-belge-kategorileri/:id', async (req, res, next) => {
  try {
    await prisma.personelBelgeKategorisi.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ── SÖZLEŞME ŞABLONLARI — yönetici CRUD ────────────────────────────
router.get('/personel-sozlesme-sablonlari', async (req, res, next) => {
  try {
    const sablonlar = await prisma.sozlesmeSablonu.findMany({
      select: {
        id: true, ad: true, tur: true, versiyon: true, dosyaAdi: true,
        mimeType: true, aktif: true, createdAt: true, updatedAt: true,
      },
      orderBy: [{ ad: 'asc' }, { versiyon: 'desc' }],
    });
    return res.json({ success: true, data: sablonlar });
  } catch (err) { next(err); }
});

router.post('/personel-sozlesme-sablonlari', async (req, res, next) => {
  try {
    const { ad, tur, base64, mimeType, dosyaAdi } = req.body ?? {};
    if (!ad || !tur || !base64) return res.status(400).json({ error: 'ad, tur ve base64 zorunlu' });
    const oncekiler = await prisma.sozlesmeSablonu.findMany({ where: { ad } });
    const yeniVersiyon = oncekiler.length ? Math.max(...oncekiler.map((s) => s.versiyon)) + 1 : 1;
    if (oncekiler.length) {
      await prisma.sozlesmeSablonu.updateMany({ where: { ad }, data: { aktif: false } });
    }
    const sablon = await prisma.sozlesmeSablonu.create({
      data: {
        ad, tur, versiyon: yeniVersiyon,
        dosyaAdi: dosyaAdi || `${ad}.pdf`,
        mimeType: mimeType || 'application/pdf',
        icerik: base64,
        aktif: true,
      },
    });
    const { icerik: _icerik, ...safe } = sablon;
    return res.json({ success: true, data: safe });
  } catch (err) { next(err); }
});

router.put('/personel-sozlesme-sablonlari/:id', async (req, res, next) => {
  try {
    const { aktif } = req.body ?? {};
    const sablon = await prisma.sozlesmeSablonu.update({
      where: { id: req.params.id },
      data: { aktif: aktif !== undefined ? Boolean(aktif) : undefined },
    });
    const { icerik: _icerik, ...safe } = sablon;
    return res.json({ success: true, data: safe });
  } catch (err) { next(err); }
});

router.delete('/personel-sozlesme-sablonlari/:id', async (req, res, next) => {
  try {
    await prisma.sozlesmeSablonu.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/personel-sozlesme-sablonlari/:id/dosya', async (req, res, next) => {
  try {
    const sablon = await prisma.sozlesmeSablonu.findUnique({ where: { id: req.params.id } });
    if (!sablon) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ success: true, data: sablon });
  } catch (err) { next(err); }
});

// ── PERSONEL SÖZLEŞME — atama / onay akışı ─────────────────────────
router.get('/personel/:id/sozlesmeler', async (req, res, next) => {
  try {
    const sozlesmeler = await prisma.personelSozlesme.findMany({
      where: { personelId: req.params.id },
      select: {
        id: true, sablonAdi: true, sablonVersiyon: true, durum: true,
        indirilmeTarihi: true, yuklenmeTarihi: true, onayTarihi: true,
        yuklenenDosyaAdi: true, yuklenenMimeType: true, aciklama: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: sozlesmeler });
  } catch (err) { next(err); }
});

router.post('/personel/:id/sozlesme-ata', async (req, res, next) => {
  try {
    const { sablonId } = req.body ?? {};
    if (!sablonId) return res.status(400).json({ error: 'sablonId zorunlu' });
    const sablon = await prisma.sozlesmeSablonu.findUnique({ where: { id: sablonId } });
    if (!sablon) return res.status(404).json({ error: 'SABLON_BULUNAMADI' });
    const sozlesme = await prisma.personelSozlesme.create({
      data: {
        personelId: req.params.id,
        sablonId: sablon.id,
        sablonAdi: sablon.ad,
        sablonVersiyon: sablon.versiyon,
        durum: 'BEKLIYOR',
      },
    });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: req.params.id,
        sozlesmeId: sozlesme.id,
        islem: 'HATIRLATMA_GONDERILDI',
        yapanId: req.user!.userId,
        aciklama: `Sözleşme atandı: ${sablon.ad}`,
      },
    });
    return res.json({ success: true, data: sozlesme });
  } catch (err) { next(err); }
});

router.get('/personel-sozlesme/:id/dosya', async (req, res, next) => {
  try {
    const sozlesme = await prisma.personelSozlesme.findUnique({ where: { id: req.params.id } });
    if (!sozlesme || !sozlesme.yuklenenIcerik) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({
      success: true,
      data: {
        dosyaAdi: sozlesme.yuklenenDosyaAdi,
        mimeType: sozlesme.yuklenenMimeType,
        icerik: sozlesme.yuklenenIcerik,
      },
    });
  } catch (err) { next(err); }
});

router.patch('/personel-sozlesme/:id/onayla', async (req, res, next) => {
  try {
    const sozlesme = await prisma.personelSozlesme.update({
      where: { id: req.params.id },
      data: { durum: 'ONAYLANDI', onayTarihi: new Date(), onaylayanId: req.user!.userId },
    });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: sozlesme.personelId,
        sozlesmeId: sozlesme.id,
        islem: 'ONAYLANDI',
        yapanId: req.user!.userId,
        aciklama: sozlesme.sablonAdi,
      },
    });
    return res.json({ success: true, data: sozlesme });
  } catch (err) { next(err); }
});

router.patch('/personel-sozlesme/:id/revizyon-iste', async (req, res, next) => {
  try {
    const { aciklama } = req.body ?? {};
    const sozlesme = await prisma.personelSozlesme.update({
      where: { id: req.params.id },
      data: { durum: 'REVIZYON_ISTENDI', aciklama: aciklama || null },
    });
    await prisma.personelBelgeLog.create({
      data: {
        personelId: sozlesme.personelId,
        sozlesmeId: sozlesme.id,
        islem: 'REVIZYON_ISTENDI',
        yapanId: req.user!.userId,
        aciklama: aciklama || sozlesme.sablonAdi,
      },
    });
    return res.json({ success: true, data: sozlesme });
  } catch (err) { next(err); }
});

router.delete('/personel-sozlesme/:id', async (req, res, next) => {
  try {
    await prisma.personelSozlesme.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ── BORDROLAR — yönetici, aylık çoklu kayıt ────────────────────────
router.get('/personel/:id/bordrolar', async (req, res, next) => {
  try {
    const bordrolar = await prisma.personelBordro.findMany({
      where: { personelId: req.params.id },
      select: {
        id: true, ay: true, yil: true, dosyaAdi: true, mimeType: true,
        aciklama: true, yuklenmeTarihi: true, createdAt: true,
      },
      orderBy: [{ yil: 'desc' }, { ay: 'desc' }],
    });
    return res.json({ success: true, data: bordrolar });
  } catch (err) { next(err); }
});

router.post('/personel/:id/bordro-yukle', async (req, res, next) => {
  try {
    const { ay, yil, base64, mimeType, dosyaAdi, aciklama } = req.body ?? {};
    if (!ay || !yil || !base64) return res.status(400).json({ error: 'ay, yil ve base64 zorunlu' });
    const bordro = await prisma.personelBordro.upsert({
      where: { personelId_ay_yil: { personelId: req.params.id, ay: Number(ay), yil: Number(yil) } },
      create: {
        personelId: req.params.id, ay: Number(ay), yil: Number(yil),
        dosyaAdi: dosyaAdi || `Bordro-${ay}-${yil}.pdf`,
        mimeType: mimeType || 'application/pdf',
        icerik: base64, aciklama: aciklama || null,
        yukleyenId: req.user!.userId,
      },
      update: {
        dosyaAdi: dosyaAdi || `Bordro-${ay}-${yil}.pdf`,
        mimeType: mimeType || 'application/pdf',
        icerik: base64, aciklama: aciklama || null,
        yukleyenId: req.user!.userId,
        yuklenmeTarihi: new Date(),
      },
    });
    return res.json({ success: true, data: { id: bordro.id } });
  } catch (err) { next(err); }
});

router.get('/personel-bordro/:id/indir', async (req, res, next) => {
  try {
    const bordro = await prisma.personelBordro.findUnique({ where: { id: req.params.id } });
    if (!bordro) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ success: true, data: bordro });
  } catch (err) { next(err); }
});

router.delete('/personel-bordro/:id', async (req, res, next) => {
  try {
    await prisma.personelBordro.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ── HASTALIK RAPORLARI — yönetici, sınırsız kayıt ──────────────────
router.get('/personel/:id/hastalik-raporlari', async (req, res, next) => {
  try {
    const raporlar = await prisma.personelHastalikRaporu.findMany({
      where: { personelId: req.params.id },
      select: {
        id: true, baslangicTarihi: true, bitisTarihi: true, gunSayisi: true,
        saglikKurumu: true, aciklama: true, dosyaAdi: true, mimeType: true, createdAt: true,
      },
      orderBy: { baslangicTarihi: 'desc' },
    });
    return res.json({ success: true, data: raporlar });
  } catch (err) { next(err); }
});

router.post('/personel/:id/hastalik-raporu-ekle', async (req, res, next) => {
  try {
    const { baslangicTarihi, bitisTarihi, saglikKurumu, aciklama, base64, mimeType, dosyaAdi } = req.body ?? {};
    if (!baslangicTarihi || !bitisTarihi) {
      return res.status(400).json({ error: 'baslangicTarihi ve bitisTarihi zorunlu' });
    }
    const basTarih = new Date(baslangicTarihi);
    const bitTarih = new Date(bitisTarihi);
    const gunSayisi = Math.max(1, Math.round((bitTarih.getTime() - basTarih.getTime()) / 86400000) + 1);
    const rapor = await prisma.personelHastalikRaporu.create({
      data: {
        personelId: req.params.id,
        baslangicTarihi: basTarih,
        bitisTarihi: bitTarih,
        gunSayisi,
        saglikKurumu: saglikKurumu || null,
        aciklama: aciklama || null,
        dosyaAdi: dosyaAdi || null,
        mimeType: mimeType || null,
        icerik: base64 || null,
      },
    });
    return res.json({ success: true, data: { id: rapor.id, gunSayisi } });
  } catch (err) { next(err); }
});

router.get('/personel-hastalik-raporu/:id/indir', async (req, res, next) => {
  try {
    const rapor = await prisma.personelHastalikRaporu.findUnique({ where: { id: req.params.id } });
    if (!rapor || !rapor.icerik) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({
      success: true,
      data: { dosyaAdi: rapor.dosyaAdi, mimeType: rapor.mimeType, icerik: rapor.icerik },
    });
  } catch (err) { next(err); }
});

router.delete('/personel-hastalik-raporu/:id', async (req, res, next) => {
  try {
    await prisma.personelHastalikRaporu.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ── BELGE LOGU (özlük dosyası işlem geçmişi) ───────────────────────
router.get('/personel/:id/belge-loglari', async (req, res, next) => {
  try {
    const loglar = await prisma.personelBelgeLog.findMany({
      where: { personelId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return res.json({ success: true, data: loglar });
  } catch (err) { next(err); }
});

// ── HATIRLATMA GÖNDER (e-posta) ────────────────────────────────────
router.post('/personel/:id/hatirlatma-gonder', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tur, mesaj } = req.body as { tur?: string; mesaj?: string };
    const personel = await prisma.personel.findUnique({ where: { id } });
    if (!personel) return res.status(404).json({ error: 'PERSONEL_BULUNAMADI' });
    if (!personel.email) {
      return res.status(400).json({ error: 'EPOSTA_YOK', message: 'Bu personelin kayıtlı e-posta adresi yok.' });
    }

    let baslikMap: Record<string, string> = {
      EKSIK_BELGE: 'Eksik Belge Hatırlatması',
      REVIZYON: 'Belge Revizyon Talebi',
      FORM_EKSIK: 'Bilgi Formu Tamamlama Hatırlatması',
      GENEL: 'Hatırlatma',
    };
    const baslik = baslikMap[tur || 'GENEL'] || baslikMap.GENEL;
    const subject = `${baslik} — Güven Optik İnsan Kaynakları`;
    const body = [
      `Merhaba ${personel.ad} ${personel.soyad},`,
      '',
      mesaj || 'Personel bilgi formunuzda / belgelerinizde eksik veya revizyon bekleyen kalemler bulunmaktadır. Lütfen kısa süre içinde tamamlayınız.',
      '',
      'Güven Optik 1959 — İnsan Kaynakları',
    ].join('\n');

    const sonuc = await sendReportEmail([personel.email], subject, body, []);
    if (!sonuc.success) {
      return res.status(502).json({ error: 'GONDERIM_HATASI', message: sonuc.error });
    }

    await prisma.personelBelgeLog.create({
      data: {
        personelId: id,
        islem: 'HATIRLATMA_GONDERILDI',
        yapanId: req.user!.userId,
        aciklama: `${baslik} (${personel.email})`,
      },
    });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

router.use('/envanter-import', envanterImportRouter);
router.use('/odoo-sablon-excel', sablonExcelImportRouter);
router.use('/deploy', deployRouter);

export default router;

