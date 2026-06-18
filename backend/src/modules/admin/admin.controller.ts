import bcrypt from 'bcryptjs';
import axios from 'axios';
import { Prisma, Role, SaleStatus, ShiftStatus, SyncStatus } from '@prisma/client';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../../database/prisma';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { execute } from '../odoo/odoo.service';

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

router.use(authorize(Role.ADMIN));

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
    if (!name || !username || !pin || !role || !branchId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) throw codeError('USER_USERNAME_EXISTS', 'Bu kullanıcı adı zaten kayıtlı.');

    const pinHash = await bcrypt.hash(pin, 10);

    const user = await prisma.user.create({
      data: { name, username, pin: pinHash, role, branchId, isActive: true, personelId, odooEmployeeId },
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

    const empNameParts = emp.name.trim().split(' ');
    const soyad = empNameParts[empNameParts.length - 1];
    const ad = empNameParts.slice(0, -1).join(' ');

    const personel = await prisma.personel.findFirst({
      where: {
        ad: { contains: ad, mode: 'insensitive' },
        soyad: { contains: soyad, mode: 'insensitive' },
      },
    });

    let personelLinked = false;
    if (personel && !personel.userId) {
      await prisma.personel.update({
        where: { id: personel.id },
        data: {
          userId,
          odooEmployeeId,
        },
      });
      personelLinked = true;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        odooEmployeeId,
        personelId: personelLinked ? personel!.id : undefined,
      },
    });

    return res.json({
      success: true,
      user: updated,
      odooEmployee: emp,
      personelLinked,
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

router.get('/branch-list', async (_req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        sirketId: true,
        sirketAdi: true,
        vkn: true,
        odooLocationId: true,
        pdksPlaceId: true,
        uyumsoftUser: true,
        adres: true,
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
      odooLocationId, pdksPlaceId, uyumsoftUser,
      uyumsoftPass, adres, telefon } = req.body;
    if (!name?.trim() || !code?.trim()) {
      return res.status(400).json({ error: 'name ve code zorunlu' });
    }
    const branch = await prisma.branch.create({
      data: {
        name: name.trim(), code: code.trim().toUpperCase(),
        isActive: true,
        sirketId: sirketId ? Number(sirketId) : null,
        sirketAdi: sirketAdi || null, vkn: vkn || null,
        odooLocationId: odooLocationId ? Number(odooLocationId) : null,
        pdksPlaceId: pdksPlaceId ? Number(pdksPlaceId) : null,
        uyumsoftUser: uyumsoftUser || null,
        uyumsoftPass: uyumsoftPass || null,
        adres: adres || null, telefon: telefon || null,
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
    const strFields = ['name', 'sirketAdi', 'vkn', 'adres', 'telefon', 'uyumsoftUser', 'uyumsoftPass'];
    const numFields = ['sirketId', 'odooLocationId', 'pdksPlaceId'];
    for (const f of strFields) {
      if (req.body[f] !== undefined) data[f] = req.body[f] || null;
    }
    for (const f of numFields) {
      if (req.body[f] !== undefined) data[f] = req.body[f] ? Number(req.body[f]) : null;
    }
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
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

// Odoo'dan şubeleri çek
router.get('/branches', async (_req: Request, res: Response) => {
  try {
    const locations = await execute(
      'stock.location',
      'search_read',
      [
        [
          ['usage', '=', 'internal'],
          ['active', '=', true],
          '|',
          ['name', 'like', 'GVN'],
          ['name', '=', 'ANA-DEPO'],
        ],
      ],
      { fields: ['id', 'name', 'complete_name', 'company_id'], limit: 50 },
    );
    return res.json({ success: true, data: locations });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stock', async (req: Request, res: Response) => {
  try {
    const { locationId, search } = req.query;

    const domain: any[] = [
      ['location_id.usage', '=', 'internal'],
      ['quantity', '>', 0],
    ];

    if (locationId) {
      domain.push(['location_id', '=', Number(locationId)]);
    }
    if (search) {
      domain.push(['product_id.name', 'ilike', String(search)]);
    }

    const quants = await execute(
      'stock.quant',
      'search_read',
      [domain],
      {
        fields: ['product_id', 'location_id', 'quantity', 'reserved_quantity'],
        limit: 100,
        order: 'quantity desc',
      },
    );

    return res.json({ success: true, data: quants });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
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
    const q = String(req.query.q ?? '').trim().toLowerCase();

    const domain: any[] = [
      ['active', '=', true],
      ['type', 'in', ['product', 'consu']],
      '|',
      ['name', 'ilike', q],
      ['attribute_line_ids.value_ids.name', 'ilike', q],
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
      const cats = await execute(
        'product.category',
        'search_read',
        [[['name', 'ilike', categ_name.trim()]]],
        { fields: ['id', 'name'], limit: 1 },
      );
      if (Array.isArray(cats) && cats.length > 0) {
        categId = cats[0].id;
      } else {
        categId = await execute('product.category', 'create', [{ name: categ_name.trim() }]);
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
      attrId = await execute('product.attribute', 'create', [{ name: name.trim(), create_variant: 'always' }]);
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
router.get('/doviz-kuru', async (_req: Request, res: Response) => {
  try {
    const https = await import('https');
    const xml = await new Promise<string>((resolve, reject) => {
      https.get('https://www.tcmb.gov.tr/kurlar/today.xml', (r) => {
        let data = '';
        r.on('data', (chunk) => { data += chunk; });
        r.on('end', () => resolve(data));
        r.on('error', reject);
      }).on('error', reject);
    });

    const usdMatch = xml.match(/<Currency[^>]*CurrencyCode="USD"[^>]*>[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);
    const eurMatch = xml.match(/<Currency[^>]*CurrencyCode="EUR"[^>]*>[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);

    const usd = usdMatch ? parseFloat(usdMatch[1]) : null;
    const eur = eurMatch ? parseFloat(eurMatch[1]) : null;

    return res.json({
      success: true,
      tarih: new Date().toISOString().slice(0, 10),
      USD: usd,
      EUR: eur,
    });
  } catch (err: any) {
    console.error('[doviz-kuru hata]', err?.message);
    // Fallback — yaklaşık değerler
    return res.json({
      success: false,
      tarih: new Date().toISOString().slice(0, 10),
      USD: 38.5,
      EUR: 41.2,
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
    } = req.body ?? {};

    const sonuclar: Record<string, any> = {};
    const hatalar: string[] = [];

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

    // ── 1) SATIN ALMA SİPARİŞİ (purchase.order) ───────────────────
    let poId: number | null = null;
    try {
      const poLines = [];
      for (const satir of satirlar ?? []) {
        if (!satir.bizimUrunOdooId) continue;
        const variants = await execute(
          'product.product',
          'search_read',
          [[['product_tmpl_id', '=', satir.bizimUrunOdooId]]],
          { fields: ['id'], limit: 1 },
        );
        const productId = variants[0]?.id;
        if (!productId) continue;
        poLines.push([0, 0, {
          product_id: productId,
          name: satir.tedarikciUrunAdi || satir.bizimUrunAdi || '',
          product_qty: satir.miktar || 1,
          price_unit: Number(satir.birimFiyat) || 0,
          discount: Number(satir.iskonto) || 0,
          date_planned: faturaTarihi || new Date().toISOString().slice(0, 10),
          product_uom: 1,
        }]);
      }

      if (poLines.length > 0 && tedarikciId) {
        const poVals: Record<string, any> = {
          partner_id: tedarikciId,
          date_order: faturaTarihi || new Date().toISOString().slice(0, 10),
          origin: faturaNo || '',
          partner_ref: faturaNo || '',
          notes: `Fatura: ${faturaNo} | Cari: ${cariAdi} | Fiziki Tedarikçi: ${fizikiTedarikciAdi || '-'}`,
          order_line: poLines,
        };
        if (sirketId) poVals.company_id = sirketId;

        poId = await execute('purchase.order', 'create', [poVals]);
        try {
          await execute('purchase.order', 'button_confirm', [[poId]]);
        } catch (ce: any) {
          console.warn('[po confirm]', ce?.message);
        }

        const poData = await execute('purchase.order', 'read', [[poId]], { fields: ['id', 'name'] });
        sonuclar.purchaseOrder = { id: poId, name: poData[0]?.name };
      }
    } catch (poErr: any) {
      console.error('[purchase.order hata]', poErr?.message);
      hatalar.push(`Satın alma siparişi: ${poErr?.faultString ?? poErr?.message}`);
    }

    // ── 2) STOK LOT'LARI (stock.lot) + BARKOD ─────────────────────
    const lotIdMap: Record<string, number> = {};
    const barkodGuncellenenler = new Set<number>();
    try {
      for (const lot of lotlar ?? []) {
        if (!lot.bizimUrunOdooId || !lot.lotNo) continue;
        try {
          const variants = await execute(
            'product.product',
            'search_read',
            [[['product_tmpl_id', '=', lot.bizimUrunOdooId]]],
            { fields: ['id'], limit: 1 },
          );
          const productId = variants[0]?.id;
          if (!productId) continue;

          const lotVals: Record<string, any> = {
            name: lot.lotNo,
            product_id: productId,
          };
          if (lot.barkod) lotVals.ref = lot.barkod;
          if (sirketId) lotVals.company_id = sirketId;

          const lotId = await execute('stock.lot', 'create', [lotVals]);
          lotIdMap[lot.id] = lotId;

          // Barkodu ürün kartına da yaz (ilk kez)
          if (lot.barkod && !barkodGuncellenenler.has(lot.bizimUrunOdooId)) {
            try {
              await execute('product.template', 'write', [[lot.bizimUrunOdooId], { barcode: lot.barkod }]);
              barkodGuncellenenler.add(lot.bizimUrunOdooId);
            } catch (be: any) {
              console.warn('[barkod güncelle]', be?.message);
            }
          }
        } catch (le: any) {
          console.warn('[stock.lot hata]', lot.lotNo, le?.message);
        }
      }
      sonuclar.lotSayisi = Object.keys(lotIdMap).length;
    } catch (lotErr: any) {
      hatalar.push(`Lot oluşturma: ${lotErr?.message}`);
    }

    // ── 3) STOK HAREKETİ ONAYLA (picking validate) ────────────────
    if (poId) {
      try {
        const pickings = await execute('stock.picking', 'search_read',
          [[['purchase_id', '=', poId]]],
          { fields: ['id', 'name', 'state'], limit: 5 });

        for (const picking of pickings) {
          if (picking.state === 'done') continue;
          try {
            await execute('stock.picking', 'action_confirm', [[picking.id]]);
            await execute('stock.picking', 'action_assign', [[picking.id]]);

            // Move line'ları çek
            const moveLines = await execute('stock.move.line', 'search_read',
              [[['picking_id', '=', picking.id]]],
              { fields: ['id', 'product_id', 'move_id'], limit: 100 });

            // Her move line için: lot_id ata + qty_done set et
            for (const ml of moveLines) {
              const writeVals: Record<string, any> = { quantity: 1 };

              // Bu move line'ın ürününe karşılık gelen lot'u bul
              const ilgiliLot = (lotlar ?? []).find((l: any) => {
                if (!l.bizimUrunOdooId) return false;
                return true; // İlk lot'u ata (seri no bazlı ayrım sonra yapılabilir)
              });

              const lotOdooId = ilgiliLot ? lotIdMap[ilgiliLot.id] : null;
              if (lotOdooId) writeVals.lot_id = lotOdooId;

              await execute('stock.move.line', 'write', [[ml.id], writeVals]);
            }

            // Eğer move line yoksa immediate transfer yap
            if (moveLines.length === 0) {
              const moves = await execute('stock.move', 'search_read',
                [[['picking_id', '=', picking.id]]],
                { fields: ['id', 'product_uom_qty'], limit: 100 });
              for (const move of moves) {
                await execute('stock.move', 'write',
                  [[move.id], { quantity_done: move.product_uom_qty || 1 }]);
              }
            }

            await execute('stock.picking', 'button_validate', [[picking.id]]);
            sonuclar.picking = { id: picking.id, name: picking.name };
          } catch (ve: any) {
            const msg = ve?.faultString ?? ve?.message ?? '';
            console.warn('[picking validate]', msg.slice(0, 150));
            if (!msg.includes('backorder') && !msg.includes('wizard') && !msg.includes('immediate')) {
              hatalar.push(`Stok hareketi: ${msg}`);
            } else {
              sonuclar.picking = { id: picking.id, name: picking.name, uyari: 'wizard' };
            }
          }
        }
      } catch (pe: any) {
        console.warn('[picking bul hata]', pe?.message);
      }
    }

    // ── 4) SATIN ALMA FATURASI ─────────────────────────────────────
    // Picking validate olduktan sonra fatura oluştur
    if (poId && gercekCariId) {
      try {
        // PO'daki teslim alınan miktarı güncelle
        const poLines = await execute('purchase.order.line', 'search_read',
          [[['order_id', '=', poId]]],
          { fields: ['id', 'product_qty', 'qty_received'], limit: 50 });

        // Manuel fatura oluştur (action_create_invoice yerine)
        const invLines = [];
        for (const satir of satirlar ?? []) {
          if (!satir.bizimUrunOdooId) continue;
          const variants = await execute('product.product', 'search_read',
            [[['product_tmpl_id', '=', satir.bizimUrunOdooId]]],
            { fields: ['id'], limit: 1 });
          const productId = variants[0]?.id;
          if (!productId) continue;
          invLines.push([0, 0, {
            product_id: productId,
            name: satir.tedarikciUrunAdi || satir.bizimUrunAdi || '',
            quantity: satir.miktar || 1,
            price_unit: Number(satir.birimFiyat) || 0,
            purchase_line_id: poLines.find((pl: any) => pl)?.id || false,
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
          if (sirketId) invVals.company_id = sirketId;

          const invoiceId = await execute('account.move', 'create', [invVals]);
          const invData = await execute('account.move', 'read',
            [[invoiceId]], { fields: ['id', 'name'] });
          sonuclar.vendorBill = { id: invoiceId, name: invData[0]?.name };

          // İşlendi etiketi
          await execute('account.move', 'write',
            [[invoiceId], { narration: `[POS-ISLENDI] ${new Date().toISOString().slice(0, 10)}` }]);
        }
      } catch (ie: any) {
        const msg = ie?.faultString ?? ie?.message ?? '';
        console.warn('[vendor bill hata]', msg.slice(0, 150));
        hatalar.push(`Satın alma faturası: ${msg.slice(0, 200)}`);
      }
    }

    // ── 5) SATIŞ FİYATI GÜNCELLE ──────────────────────────────────
    try {
      const fiyatGuncellenenler = new Set<number>();
      for (const lot of lotlar ?? []) {
        if (!lot.bizimUrunOdooId || !lot.satisFiyati || fiyatGuncellenenler.has(lot.bizimUrunOdooId)) continue;
        const fiyat = Number(lot.satisFiyati);
        if (fiyat <= 0) continue;
        await execute('product.template', 'write', [[lot.bizimUrunOdooId], { list_price: fiyat }]);
        fiyatGuncellenenler.add(lot.bizimUrunOdooId);
      }
      sonuclar.fiyatGuncellenen = fiyatGuncellenenler.size;
    } catch (fyErr: any) {
      console.warn('[satis fiyati hata]', fyErr?.message);
    }

    return res.json({
      success: true,
      sonuclar,
      hatalar: hatalar.length > 0 ? hatalar : undefined,
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
    const { kalemler, notlar } = req.body ?? {}
    if (!kalemler?.length) return res.status(400).json({ error: 'Kalemler zorunlu' })

    const olusturulanlar = []

    // Kaynak-hedef kombinasyonlarına göre grupla
    const gruplar: Record<string, typeof kalemler> = {}
    for (const k of kalemler) {
      const key = `${k.kaynak}-${k.hedef}`
      if (!gruplar[key]) gruplar[key] = []
      gruplar[key].push(k)
    }

    for (const [key, grup] of Object.entries(gruplar)) {
      const [kaynakId, hedefId] = key.split('-').map(Number)

      // Kaynak ve hedef lokasyonların şirketlerini bul
      const lokasyonlar = await execute('stock.location', 'search_read',
        [[['id', 'in', [kaynakId, hedefId]]]],
        { fields: ['id', 'name', 'company_id'], limit: 2 })

      const kaynakLok = lokasyonlar.find((l: any) => l.id === kaynakId)
      const hedefLok = lokasyonlar.find((l: any) => l.id === hedefId)
      const kaynakSirketId = kaynakLok?.company_id?.[0] ?? 1
      const hedefSirketId = hedefLok?.company_id?.[0] ?? 1

      // Her kalem için product.product ID'sini doğrula
      for (const kalem of grup) {
        try {
          // Önce product.product olarak oku
          const prodCheck = await execute('product.product', 'search_read',
            [[['id', '=', kalem.productId]]],
            { fields: ['id', 'name'], limit: 1 })
          if (prodCheck[0]?.id) {
            kalem.resolvedProductId = prodCheck[0].id // product.product ID confirmed
          } else {
            // Template ID ise variant'ı bul
            const variants = await execute('product.product', 'search_read',
              [[['product_tmpl_id', '=', kalem.productId]]],
              { fields: ['id'], limit: 1 })
            kalem.resolvedProductId = variants[0]?.id ?? kalem.productId
          }
        } catch {
          kalem.resolvedProductId = kalem.productId
        }
      }

      // ── STOK KONTROLÜ ─────────────────────────────────────────
      const stokHatalari: string[] = []
      for (const kalem of grup) {
        try {
          const stokDomain: any[] = [
            ['location_id', '=', kaynakId],
            ['quantity', '>', 0],
            '|',
            ['product_id', '=', kalem.resolvedProductId ?? kalem.productId],
            ['product_id.product_tmpl_id', '=', kalem.resolvedProductId ?? kalem.productId],
          ]
          if (kalem.lotId) stokDomain.push(['lot_id', '=', kalem.lotId])

          const stok = await execute('stock.quant', 'search_read',
            [stokDomain],
            { fields: ['id', 'quantity', 'lot_id'], limit: 1 },
            kaynakSirketId)

          if (!stok.length || stok[0].quantity < (kalem.miktar || 1)) {
            const mevcutStok = stok[0]?.quantity ?? 0
            stokHatalari.push(`"${kalem.urunAdi}" için yeterli stok yok (mevcut: ${mevcutStok}, istenen: ${kalem.miktar || 1})`)
          }
        } catch (se: any) {
          console.warn('[stok kontrol hata]', se?.message?.slice(0, 80))
        }
      }

      if (stokHatalari.length > 0) {
        olusturulanlar.push({
          tip: 'stok-hatasi',
          hata: stokHatalari.join(', '),
          kaynak: kaynakId,
          hedef: hedefId,
        })
        continue
      }

      if (kaynakSirketId === hedefSirketId) {
        // ── ŞİRKET İÇİ TRANSFER ──────────────────────────────────
        const ptDomain: any[] = [['code', '=', 'internal'], ['active', '=', true], ['company_id', '=', kaynakSirketId]]
        let pickingTypes = await execute('stock.picking.type', 'search_read',
          [ptDomain], { fields: ['id', 'name'], limit: 1 }, kaynakSirketId)

        if (!pickingTypes.length) {
          const warehouses = await execute('stock.warehouse', 'search_read',
            [[['company_id', '=', kaynakSirketId]]],
            { fields: ['id', 'name'], limit: 1 }, kaynakSirketId)
          const yeniPTId = await execute('stock.picking.type', 'create', [{
            name: 'İç Transferler',
            code: 'internal',
            company_id: kaynakSirketId,
            warehouse_id: warehouses[0]?.id || false,
            sequence_code: `INT${kaynakSirketId}`,
            show_operations: true,
          }], {}, kaynakSirketId)
          pickingTypes = [{ id: yeniPTId }]
        }

        const pickingTypeId = pickingTypes[0].id

        const pickingId = await execute('stock.picking', 'create', [{
          picking_type_id: pickingTypeId,
          location_id: kaynakId,
          location_dest_id: hedefId,
          company_id: kaynakSirketId,
          note: notlar || '',
        }], {}, kaynakSirketId)

        for (const kalem of grup) {
          await execute('stock.move', 'create', [{
            picking_id: pickingId,
            product_id: kalem.resolvedProductId ?? kalem.productId,
            product_uom_qty: kalem.miktar || 1,
            product_uom: 1,
            location_id: kaynakId,
            location_dest_id: hedefId,
            name: kalem.urunAdi || 'Transfer',
          }], {}, kaynakSirketId)
        }

        await execute('stock.picking', 'action_confirm', [[pickingId]], {}, kaynakSirketId)
        await execute('stock.picking', 'action_assign', [[pickingId]], {}, kaynakSirketId)

        // Move line'lara lot ata ve validate et
        const moveLines = await execute('stock.move.line', 'search_read',
          [[['picking_id', '=', pickingId]]],
          { fields: ['id', 'product_id'], limit: 100 }, kaynakSirketId)

        for (let i = 0; i < moveLines.length; i++) {
          const ml = moveLines[i]
          const ilgiliKalem = grup[i]
          const writeVals: Record<string, any> = { quantity: ilgiliKalem?.miktar || 1 }
          if (ilgiliKalem?.lotId) writeVals.lot_id = ilgiliKalem.lotId
          await execute('stock.move.line', 'write', [[ml.id], writeVals], {}, kaynakSirketId)
        }

        try {
          await execute('stock.picking', 'button_validate', [[pickingId]], {}, kaynakSirketId)
        } catch (ve: any) {
          console.warn('[validate uyarı]', ve?.faultString?.slice(0, 100))
        }

        const pickingData = await execute('stock.picking', 'read',
          [[pickingId]], { fields: ['id', 'name', 'state'] }, kaynakSirketId)

        olusturulanlar.push({
          tip: 'sirket-ici',
          pickingId,
          pickingName: pickingData[0]?.name,
          state: pickingData[0]?.state,
          kalemSayisi: grup.length,
        })

      } else {
        // ── ŞİRKETLER ARASI SATIŞ ────────────────────────────────
        // Satıcı: kaynakSirketId, Alıcı: hedefSirketId
        // %5 kâr marjı ile satış faturası

        const invoiceLines = []
        const satisSipLines = []

        for (const kalem of grup) {
          const productRows = await execute('product.product', 'search_read',
            [[['id', '=', kalem.resolvedProductId ?? kalem.productId]]],
            { fields: ['id', 'name', 'lst_price', 'standard_price'], limit: 1 }, kaynakSirketId)
          const product = productRows[0]
          if (!product) continue

          const maliyet = kalem.maliyet || product.standard_price || 0
          const satisFiyati = kalem.satisFiyati || Math.round(maliyet * 1.05 * 100) / 100

          invoiceLines.push([0, 0, {
            product_id: product.id,
            name: kalem.urunAdi || product.name || '',
            quantity: kalem.miktar || 1,
            price_unit: satisFiyati,
          }])

          satisSipLines.push([0, 0, {
            product_id: product.id,
            name: kalem.urunAdi || product.name || '',
            product_uom_qty: kalem.miktar || 1,
            price_unit: satisFiyati,
            product_uom: 1,
          }])
        }

        // Alıcı şirketi partner olarak bul
        const aliciSirket = await execute('res.company', 'read',
          [[hedefSirketId]], { fields: ['id', 'name', 'partner_id'] })
        const aliciPartnerId = aliciSirket[0]?.partner_id?.[0]

        if (!aliciPartnerId) {
          olusturulanlar.push({ tip: 'sirketler-arasi', hata: 'Alıcı şirket partner bulunamadı' })
          continue
        }

        // sale.order yerine direkt out_invoice oluştur
        const soData = { name: `TRANSFER-${Date.now()}` }

        let invoiceId = null
        let invoiceName = ''
        try {
          if (invoiceLines.length > 0) {
            // Vergi hesabı bul
            const vergiler = await execute('account.tax', 'search_read',
              [[['type_tax_use', '=', 'sale'], ['company_id', '=', kaynakSirketId], ['active', '=', true]]],
              { fields: ['id', 'name', 'amount'], limit: 1 }, kaynakSirketId)
            const vergiId = vergiler[0]?.id

            // Gelir hesabı bul
            const gelirHesap = await execute('account.account', 'search_read',
              [[['code', '=', '600'], ['company_id', '=', kaynakSirketId]]],
              { fields: ['id'], limit: 1 }, kaynakSirketId)
            const gelirHesapId = gelirHesap[0]?.id

            // Invoice line'lara vergi ve hesap ekle
            const invoiceLinesWithTax = invoiceLines.map((line: any) => {
              const vals = { ...line[2] }
              if (gelirHesapId) vals.account_id = gelirHesapId
              if (vergiId) vals.tax_ids = [[6, 0, [vergiId]]]
              return [0, 0, vals]
            })

            invoiceId = await execute('account.move', 'create', [{
              move_type: 'out_invoice',
              partner_id: aliciPartnerId,
              company_id: kaynakSirketId,
              invoice_date: new Date().toISOString().slice(0, 10),
              invoice_line_ids: invoiceLinesWithTax,
              narration: `Şirketler arası transfer ${kaynakLok?.name} → ${hedefLok?.name} - %5 kâr`,
            }], {}, kaynakSirketId)

            // Faturayı onayla
            try {
              await execute('account.move', 'action_post', [[invoiceId]], {}, kaynakSirketId)
            } catch (pe: any) {
              console.warn('[fatura onayla]', pe?.message?.slice(0, 100))
            }

            const invData = await execute('account.move', 'read',
              [[invoiceId]], { fields: ['id', 'name', 'state'] }, kaynakSirketId)
            invoiceName = invData[0]?.name ?? ''
          }
        } catch (ie: any) {
          console.warn('[sirketler arasi fatura hata]', ie?.message?.slice(0, 150))
          invoiceName = 'Hata: ' + ie?.message?.slice(0, 50)
        }

        const sonKayitRef: any = {
          tip: 'sirketler-arasi',
          satisSiparisi: soData.name,
          fatura: invoiceName,
          kalemSayisi: grup.length,
          kaynakSirket: kaynakLok?.company_id?.[1],
          hedefSirket: hedefLok?.company_id?.[1],
        }

        // ── NG/HEDEF ŞİRKET TARAFI: SATIN ALMA + STOK GİRİŞİ ──────
        try {
          // Alıcı şirket için satın alma faturası oluştur
          const alimFaturaLines = []
          for (const kalem of grup) {
            const hedefProductId = kalem.resolvedProductId ?? kalem.productId

            // Gider hesabı bul
            const giderHesap = await execute('account.account', 'search_read',
              [[['code', '=', '620'], ['company_id', '=', hedefSirketId]]],
              { fields: ['id'], limit: 1 }, hedefSirketId)

            const lineVals: any = {
              product_id: hedefProductId,
              name: kalem.urunAdi || '',
              quantity: kalem.miktar || 1,
              price_unit: kalem.maliyet ? Math.round(kalem.maliyet * 1.05 * 100) / 100 : 0,
            }
            if (giderHesap[0]?.id) lineVals.account_id = giderHesap[0].id
            alimFaturaLines.push([0, 0, lineVals])
          }

          if (alimFaturaLines.length > 0) {
            // Satıcı partner bul (ADESE şirketi)
            const saticiSirket = await execute('res.company', 'read',
              [[kaynakSirketId]], { fields: ['id', 'name', 'partner_id'] })
            const saticiPartnerId = saticiSirket[0]?.partner_id?.[0]

            if (saticiPartnerId) {
              const alimFaturaId = await execute('account.move', 'create', [{
                move_type: 'in_invoice',
                partner_id: saticiPartnerId,
                company_id: hedefSirketId,
                invoice_date: new Date().toISOString().slice(0, 10),
                invoice_line_ids: alimFaturaLines,
                narration: `Şirketler arası alım ${kaynakLok?.name} → ${hedefLok?.name}`,
              }], {}, hedefSirketId)

              try {
                await execute('account.move', 'action_post', [[alimFaturaId]], {}, hedefSirketId)
              } catch (pe: any) {
                console.warn('[alim fatura onayla]', pe?.message?.slice(0, 100))
              }

              const alimInvData = await execute('account.move', 'read',
                [[alimFaturaId]], { fields: ['id', 'name'] }, hedefSirketId)
              sonKayitRef.alimFatura = alimInvData[0]?.name
            }
          }

          // Hedef şirkette stok girişi (receipt)
          const hedefPtReceipt = await execute('stock.picking.type', 'search_read',
            [[['code', '=', 'incoming'], ['active', '=', true], ['company_id', '=', hedefSirketId]]],
            { fields: ['id', 'name'], limit: 1 }, hedefSirketId)

          if (hedefPtReceipt.length > 0) {
            let tedarikciLok = await execute('stock.location', 'search_read',
              [[['usage', '=', 'supplier'], ['company_id', '=', hedefSirketId]]],
              { fields: ['id', 'name'], limit: 1 }, hedefSirketId)

            if (!tedarikciLok.length) {
              tedarikciLok = await execute('stock.location', 'search_read',
                [[['usage', '=', 'supplier'], ['company_id', '=', false]]],
                { fields: ['id', 'name'], limit: 1 })
            }

            if (!tedarikciLok.length) {
              tedarikciLok = await execute('stock.location', 'search_read',
                [[['usage', '=', 'supplier']]],
                { fields: ['id', 'name'], limit: 1 })
            }

            const tedarikciLokId = tedarikciLok[0]?.id

            if (tedarikciLokId) {
              const inPickingId = await execute('stock.picking', 'create', [{
                picking_type_id: hedefPtReceipt[0].id,
                location_id: tedarikciLokId,
                location_dest_id: hedefId,
                company_id: hedefSirketId,
                note: `Şirketler arası giriş ← ${kaynakLok?.name}`,
              }], {}, hedefSirketId)

              for (const kalem of grup) {
                await execute('stock.move', 'create', [{
                  picking_id: inPickingId,
                  product_id: kalem.resolvedProductId ?? kalem.productId,
                  product_uom_qty: kalem.miktar || 1,
                  product_uom: 1,
                  location_id: tedarikciLokId,
                  location_dest_id: hedefId,
                  name: kalem.urunAdi || 'Transfer',
                }], {}, hedefSirketId)
              }

              await execute('stock.picking', 'action_confirm', [[inPickingId]], {}, hedefSirketId)
              await execute('stock.picking', 'action_assign', [[inPickingId]], {}, hedefSirketId)

              const inMoveLines = await execute('stock.move.line', 'search_read',
                [[['picking_id', '=', inPickingId]]],
                { fields: ['id', 'product_id', 'lot_id'], limit: 100 }, hedefSirketId)

              if (inMoveLines.length === 0) {
                for (const kalem of grup) {
                  const hedefProdId = kalem.resolvedProductId ?? kalem.productId

                  const mlVals: any = {
                    picking_id: inPickingId,
                    product_id: hedefProdId,
                    quantity: kalem.miktar || 1,
                    location_id: tedarikciLokId,
                    location_dest_id: hedefId,
                    product_uom_id: 1,
                  }

                  // Lot varsa hedef şirkette yeni lot oluştur
                  if (kalem.lotId) {
                    try {
                      // Kaynak lot bilgisini al
                      const kaynakLotData = await execute('stock.lot', 'read',
                        [[kalem.lotId]], { fields: ['id', 'name', 'ref'] })
                      const lotAdi = kaynakLotData[0]?.name ?? `LOT-${kalem.lotId}`

                      // Hedef şirkette aynı isimde lot var mı kontrol et
                      const mevcutLot = await execute('stock.lot', 'search_read',
                        [[['name', '=', lotAdi], ['product_id', '=', hedefProdId], ['company_id', '=', hedefSirketId]]],
                        { fields: ['id'], limit: 1 }, hedefSirketId)

                      let hedefLotId: number
                      if (mevcutLot.length > 0) {
                        hedefLotId = mevcutLot[0].id
                      } else {
                        const yeniLotVals: any = {
                          name: lotAdi,
                          product_id: hedefProdId,
                          company_id: hedefSirketId,
                        }
                        if (kaynakLotData[0]?.ref) yeniLotVals.ref = kaynakLotData[0].ref
                        hedefLotId = await execute('stock.lot', 'create', [yeniLotVals], {}, hedefSirketId)
                      }
                      mlVals.lot_id = hedefLotId
                    } catch (le: any) {
                      console.warn('[hedef lot hata]', le?.message?.slice(0, 100))
                    }
                  }

                  await execute('stock.move.line', 'create', [mlVals], {}, hedefSirketId)
                }
              } else {
                for (let i = 0; i < inMoveLines.length; i++) {
                  const kalemI = grup[i]
                  const writeVals: any = { quantity: kalemI?.miktar || 1 }

                  if (kalemI?.lotId) {
                    try {
                      const kaynakLotData = await execute('stock.lot', 'read',
                        [[kalemI.lotId]], { fields: ['id', 'name', 'ref'] })
                      const lotAdi = kaynakLotData[0]?.name ?? `LOT-${kalemI.lotId}`

                      const lineProductId = inMoveLines[i].product_id?.[0] ?? kalemI?.resolvedProductId ?? kalemI?.productId
                      const mevcutLot = await execute('stock.lot', 'search_read',
                        [[['name', '=', lotAdi], ['product_id', '=', lineProductId], ['company_id', '=', hedefSirketId]]],
                        { fields: ['id'], limit: 1 }, hedefSirketId)

                      let hedefLotId: number
                      if (mevcutLot.length > 0) {
                        hedefLotId = mevcutLot[0].id
                      } else {
                        const yeniLotVals: any = {
                          name: lotAdi,
                          product_id: lineProductId,
                          company_id: hedefSirketId,
                        }
                        if (kaynakLotData[0]?.ref) yeniLotVals.ref = kaynakLotData[0].ref
                        hedefLotId = await execute('stock.lot', 'create', [yeniLotVals], {}, hedefSirketId)
                      }
                      writeVals.lot_id = hedefLotId
                    } catch (le: any) {
                      console.warn('[incoming write lot hata]', le?.message?.slice(0, 100))
                    }
                  }

                  await execute('stock.move.line', 'write',
                    [[inMoveLines[i].id], writeVals], {}, hedefSirketId)
                }
              }

              try {
                await execute('stock.picking', 'button_validate', [[inPickingId]], {}, hedefSirketId)
              } catch (ve: any) {
                console.warn('[incoming validate HATA]', ve?.faultString?.slice(0, 200) ?? ve?.message?.slice(0, 200))
              }

              const inPickData = await execute('stock.picking', 'read',
                [[inPickingId]], { fields: ['id', 'name', 'state'] }, hedefSirketId)
              sonKayitRef.hedefStokGirisi = inPickData[0]?.name
            }
          }
        } catch (hedefErr: any) {
          console.warn('[hedef sirket islem hata]', hedefErr?.message?.slice(0, 150))
        }

        olusturulanlar.push(sonKayitRef)

        // Şirketler arası stok hareketi — kaynak şirketten çıkış
        try {
          const ptOut = await execute('stock.picking.type', 'search_read',
            [[['code', '=', 'outgoing'], ['active', '=', true], ['company_id', '=', kaynakSirketId]]],
            { fields: ['id', 'name'], limit: 1 }, kaynakSirketId)

          if (ptOut.length > 0) {
            // Önce şirkete özel customer lokasyonu ara, bulamazsa global olanı al
            let musteriLok = await execute('stock.location', 'search_read',
              [[['usage', '=', 'customer'], ['company_id', '=', kaynakSirketId]]],
              { fields: ['id', 'name'], limit: 1 }, kaynakSirketId)

            if (!musteriLok.length) {
              // Global customer lokasyonu (company_id = false)
              musteriLok = await execute('stock.location', 'search_read',
                [[['usage', '=', 'customer'], ['company_id', '=', false]]],
                { fields: ['id', 'name'], limit: 1 })
            }

            if (!musteriLok.length) {
              // Herhangi bir customer lokasyonu
              musteriLok = await execute('stock.location', 'search_read',
                [[['usage', '=', 'customer']]],
                { fields: ['id', 'name'], limit: 1 })
            }

            const musteriLokId = musteriLok[0]?.id

            if (musteriLokId) {
              const outPickingId = await execute('stock.picking', 'create', [{
                picking_type_id: ptOut[0].id,
                location_id: kaynakId,
                location_dest_id: musteriLokId,
                company_id: kaynakSirketId,
                partner_id: aliciPartnerId,
                note: `Şirketler arası transfer → ${hedefLok?.name}`,
              }], {}, kaynakSirketId)

              for (const kalem of grup) {
                await execute('stock.move', 'create', [{
                  picking_id: outPickingId,
                  product_id: kalem.resolvedProductId ?? kalem.productId,
                  product_uom_qty: kalem.miktar || 1,
                  product_uom: 1,
                  location_id: kaynakId,
                  location_dest_id: musteriLokId,
                  name: kalem.urunAdi || 'Transfer',
                }], {}, kaynakSirketId)
              }

              await execute('stock.picking', 'action_confirm', [[outPickingId]], {}, kaynakSirketId)
              await execute('stock.picking', 'action_assign', [[outPickingId]], {}, kaynakSirketId)

              // Move line yoksa manuel oluştur
              const outMoveLines = await execute('stock.move.line', 'search_read',
                [[['picking_id', '=', outPickingId]]],
                { fields: ['id', 'product_id', 'lot_id'], limit: 100 }, kaynakSirketId)

              if (outMoveLines.length === 0) {
                // Stock quant'tan lot bilgisini al
                for (const kalem of grup) {
                  const productId = kalem.resolvedProductId ?? kalem.productId

                  const quants = await execute('stock.quant', 'search_read',
                    [[['location_id', '=', kaynakId], ['product_id', '=', productId], ['quantity', '>', 0]]],
                    { fields: ['id', 'lot_id', 'quantity'], limit: 1 }, kaynakSirketId)

                  const mlVals: any = {
                    picking_id: outPickingId,
                    product_id: productId,
                    quantity: kalem.miktar || 1,
                    location_id: kaynakId,
                    location_dest_id: musteriLokId,
                    product_uom_id: 1,
                  }
                  if (quants[0]?.lot_id) mlVals.lot_id = quants[0].lot_id[0]
                  else if (kalem.lotId) mlVals.lot_id = kalem.lotId

                  await execute('stock.move.line', 'create', [mlVals], {}, kaynakSirketId)
                }
              } else {
                for (let i = 0; i < outMoveLines.length; i++) {
                  const kalem = grup[i]
                  const writeVals: any = { quantity: kalem?.miktar || 1 }

                  if (!outMoveLines[i].lot_id) {
                    const productId = kalem?.resolvedProductId ?? kalem?.productId
                    const quants = await execute('stock.quant', 'search_read',
                      [[['location_id', '=', kaynakId], ['product_id', '=', productId], ['quantity', '>', 0]]],
                      { fields: ['lot_id'], limit: 1 }, kaynakSirketId)
                    if (quants[0]?.lot_id) writeVals.lot_id = quants[0].lot_id[0]
                    else if (kalem?.lotId) writeVals.lot_id = kalem.lotId
                  }

                  await execute('stock.move.line', 'write',
                    [[outMoveLines[i].id], writeVals], {}, kaynakSirketId)
                }
              }

              try {
                await execute('stock.picking', 'button_validate', [[outPickingId]], {}, kaynakSirketId)
              } catch (ve: any) {
                console.warn('[outgoing validate HATA]', ve?.faultString?.slice(0, 200) ?? ve?.message?.slice(0, 200))
              }

              const outData = await execute('stock.picking', 'read',
                [[outPickingId]], { fields: ['id', 'name', 'state'] }, kaynakSirketId)
              const sonKayit = olusturulanlar[olusturulanlar.length - 1] as any
              sonKayit.stokHareketi = outData[0]?.name
            }
          }
        } catch (se: any) {
          console.warn('[sirketler arasi stok hata]', se?.message?.slice(0, 150))
        }
      }
    }

    return res.json({ success: true, transferler: olusturulanlar })
  } catch (err: any) {
    const msg = err?.faultString ?? err?.message ?? String(err)
    console.error('[transfer-olustur hata]', msg)
    return res.status(500).json({ error: msg })
  }
})



// ── TRANSFER İÇİN ÜRÜN/LOT ARAMA ──────────────────────────────────
router.get('/transfer-urun-ara', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim()
    if (!q || q.length < 2) return res.json({ data: [] })

    // 1) Lot/seri no ile ara
    const lotDomain: any[] = [
      '|', '|', '|',
      ['name', 'ilike', q],
      ['ref', 'ilike', q],
      ['product_id.name', 'ilike', q],
      ['product_id.default_code', 'ilike', q],
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
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const varliklar = await prisma.finansalVarlik.findMany({
      where: { aktif: true },
      orderBy: [{ sirketAdi: 'asc' }, { tip: 'asc' }, { ad: 'asc' }],
    })
    await prisma.$disconnect()
    return res.json({ data: varliklar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/finansal-varlik-ekle', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const { ad, tip, katman, sirketId, sirketAdi, subeId, subeAdi, para_birimi, aciklama, odooHesapId } = req.body
    if (!ad?.trim() || !tip || !katman) return res.status(400).json({ error: 'ad, tip, katman zorunlu' })
    const varlik = await prisma.finansalVarlik.create({
      data: { ad, tip, katman, sirketId, sirketAdi, subeId, subeAdi, para_birimi: para_birimi || 'TRY', aciklama, odooHesapId }
    })
    await prisma.$disconnect()
    return res.json({ success: true, data: varlik })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── ORTAKLAR CRUD ─────────────────────────────────────────────────
router.get('/ortaklar', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const ortaklar = await prisma.ortak.findMany({
      where: { aktif: true },
      orderBy: { ad: 'asc' },
    })
    await prisma.$disconnect()
    return res.json({ data: ortaklar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/ortak-ekle', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const { ad, soyad, telefon, email } = req.body
    if (!ad?.trim()) return res.status(400).json({ error: 'Ad zorunlu' })
    const ortak = await prisma.ortak.create({ data: { ad, soyad, telefon, email } })
    await prisma.$disconnect()
    return res.json({ success: true, data: ortak })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── FİNANS HAREKETİ ───────────────────────────────────────────────
router.get('/finans-hareketler', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
    await prisma.$disconnect()
    return res.json({ data: hareketler })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/finans-hareket-ekle', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
    await prisma.$disconnect()
    return res.json({ success: true, data: hareket })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── ORTAK CARİ ────────────────────────────────────────────────────
router.get('/ortak-cari', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
    await prisma.$disconnect()
    return res.json({ data: kayitlar, bakiyeler: bakiyeMap })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── FİNANS DASHBOARD (Özet) ───────────────────────────────────────
router.get('/finans-ozet', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

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

    await prisma.$disconnect()
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
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const { ad, soyad, telefon, email, pozisyon, subeId, subeAdi, sirketId, sirketAdi, bolgeId, maas, pdksId, aylikHedef, odooEmployeeId } = req.body
    if (!ad?.trim() || !soyad?.trim() || !pozisyon) return res.status(400).json({ error: 'Ad, soyad, pozisyon zorunlu' })
    const personel = await prisma.personel.create({
      data: { ad, soyad, telefon, email, pozisyon, subeId, subeAdi, sirketId, sirketAdi, bolgeId, maas: Number(maas) || 0, aylikHedef: aylikHedef ? Number(aylikHedef) : 0, pdksId, odooEmployeeId: odooEmployeeId ? Number(odooEmployeeId) : undefined }
    })
    await prisma.$disconnect()
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

    sonuc.pdksUyari = 'PDKS sisteminden manuel olarak çıkarın';
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

    await prisma.personel.update({
      where: { id: personelId },
      data: { aktif: true },
    });

    if (personel.userId) {
      await prisma.user.update({
        where: { id: personel.userId },
        data: { isActive: true },
      });
    }

    if (personel.odooEmployeeId) {
      try {
        await execute('hr.employee', 'write', [
          [personel.odooEmployeeId],
          { active: true },
        ]);
      } catch {
        // Odoo unarchive başarısız olsa da Prisma/POS aktif kalır
      }
    }

    return res.json({ success: true, personelId });
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
        user: { select: { id: true, username: true, role: true } },
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
    await prisma.personel.update({
      where: { id: req.params.id },
      data: { odooEmployeeId: Number(odooEmployeeId) },
    });
    return res.json({ success: true });
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
    await prisma.personel.update({
      where: { id: req.params.id },
      data: { userId },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { personelId: req.params.id },
    });
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
      },
    });

    await prisma.personel.update({
      where: { id: req.params.id },
      data: { userId: user.id },
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

router.put('/personel-guncelle/:id', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const { id } = req.params
    const data = req.body
    if (data.maas) data.maas = Number(data.maas)
    if (data.aylikHedef) data.aylikHedef = Number(data.aylikHedef)
    const personel = await prisma.personel.update({ where: { id }, data })
    await prisma.$disconnect()
    return res.json({ success: true, data: personel })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

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
        onaylayanId: req.user!.userId,
        onayTarihi: new Date(),
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
    await prisma.personelBelge.delete({ where: { id: req.params.belgeId } });
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

// ── PRİM KURAL CRUD ───────────────────────────────────────────────
router.get('/prim-kurallar', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const kurallar = await prisma.primKural.findMany({
      where: { aktif: true }, orderBy: { createdAt: 'desc' }
    })
    await prisma.$disconnect()
    return res.json({ data: kurallar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/prim-kural-ekle', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
    await prisma.$disconnect()
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
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const { durum, subeId, sirketId, limit } = req.query
    const where: any = {}
    if (durum) where.durum = String(durum)
    if (subeId) where.subeId = String(subeId)
    if (sirketId) where.sirketId = Number(sirketId)
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
    await prisma.$disconnect()
    return res.json({ data: enriched })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/ozel-siparis-ekle', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const {
      musteriAdi, musteriTelefon, musteriId,
      satisSiparisId, subeId, subeAdi, sirketId,
      tip, urunAdi, urunKodu, miktar,
      sagSph, sagCyl, sagAks, sagAdd, sagPd,
      solSph, solCyl, solAks, solAdd, solPd,
      camTipi, camIndeksi, kaplama, cerceveBilgisi,
      tedarikciId, tedarikciAdi,
      tahminiMaliyet, satisFiyati,
      notlar, tahminiGelisTarihi, olusturanKullanici, olcumBilgisi, satisTemsilcisi,
    } = req.body

    if (!musteriAdi?.trim() || !urunAdi?.trim() || !tip) {
      return res.status(400).json({ error: 'musteriAdi, urunAdi, tip zorunlu' })
    }

    const siparis = await prisma.ozelSiparis.create({
      data: {
        musteriAdi, musteriTelefon, musteriId,
        satisSiparisId, subeId, subeAdi,
        sirketId: sirketId ? Number(sirketId) : null,
        tip, urunAdi, urunKodu,
        miktar: Number(miktar) || 1,
        sagSph: sagSph ? Number(sagSph) : null,
        sagCyl: sagCyl ? Number(sagCyl) : null,
        sagAks: sagAks ? Number(sagAks) : null,
        sagAdd: sagAdd ? Number(sagAdd) : null,
        sagPd: sagPd ? Number(sagPd) : null,
        solSph: solSph ? Number(solSph) : null,
        solCyl: solCyl ? Number(solCyl) : null,
        solAks: solAks ? Number(solAks) : null,
        solAdd: solAdd ? Number(solAdd) : null,
        solPd: solPd ? Number(solPd) : null,
        camTipi, camIndeksi, kaplama, cerceveBilgisi,
        tedarikciId: tedarikciId ? Number(tedarikciId) : null,
        tedarikciAdi,
        tahminiMaliyet: tahminiMaliyet ? Number(tahminiMaliyet) : null,
        satisFiyati: satisFiyati ? Number(satisFiyati) : null,
        notlar, olusturanKullanici,
        olcumBilgisi: olcumBilgisi ?? undefined,
        satisTemsilcisi: satisTemsilcisi ?? undefined,
        tahminiGelisTarihi: tahminiGelisTarihi ? new Date(tahminiGelisTarihi) : null,
      }
    })
    await prisma.$disconnect()
    return res.json({ success: true, data: siparis })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.put('/ozel-siparis-guncelle/:id', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
    await prisma.$disconnect()
    return res.json(updated)
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
})

router.put('/ozel-siparis-durum/:id', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const { id } = req.params
    const { durum, tedarikciSiparisNo, notlar, gercekGelisTarihi, teslimTarihi } = req.body

    const data: any = { durum }
    if (tedarikciSiparisNo) data.tedarikciSiparisNo = tedarikciSiparisNo
    if (notlar) data.notlar = notlar
    if (gercekGelisTarihi) data.gercekGelisTarihi = new Date(gercekGelisTarihi)
    if (teslimTarihi) data.teslimTarihi = new Date(teslimTarihi)

    const siparis = await prisma.ozelSiparis.update({ where: { id }, data })
    await prisma.$disconnect()
    return res.json({ success: true, data: siparis })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

// ── SİPARİŞ TESLİM AL (Odoo'ya yaz) ─────────────────────────────
router.post('/ozel-siparis-teslim/:id', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
        data: { durum: 'MUSTERIYE_TESLIM', teslimTarihi: new Date() }
      })
      sonuc.durum = 'MUSTERIYE_TESLIM'

    } else {
      // Depoya al → normal stok girişi
      await prisma.ozelSiparis.update({
        where: { id },
        data: { durum: 'TESLIM_ALINDI', gercekGelisTarihi: new Date() }
      })
      sonuc.durum = 'TESLIM_ALINDI'
      sonuc.mesaj = 'Ürün depoya alındı. Stok girişi için Ürün Girişi sekmesini kullanın.'
    }

    await prisma.$disconnect()
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
        defaultCode: v.default_code ?? '',
        barcode: v.barcode ?? '',
        nitelikler: attrVals.map((a: any) => ({
          nitelikId: a.attribute_id?.[0],
          nitelikAdi: a.attribute_id?.[1],
          degerAdi: a.name,
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
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const kayitlar = await prisma.bekleyenFatura.findMany({
      where: { durum: { in: ['BEKLIYOR', 'KISMI'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    await prisma.$disconnect()
    return res.json({ data: kayitlar })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/bekleyen-fatura-ekle', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
    await prisma.$disconnect()
    return res.json({ success: true, data: kayit })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post('/bekleyen-fatura-eslestir/:id', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
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
    await prisma.$disconnect()
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
    const { ad, parentId } = req.body;
    if (!ad?.trim()) return res.status(400).json({ error: 'ad zorunlu' });
    const data: Record<string, unknown> = { name: ad.trim() };
    if (parentId) data.parent_id = Number(parentId);
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

    if (sirketId) tmplData.company_id = Number(sirketId);
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

router.post('/odoo-sablon-nitelik-ata', async (req, res, next) => {
  try {
    const { tmplId, nitelikler } = req.body;

    if (!tmplId || !nitelikler?.length) {
      return res.status(400).json({ error: 'tmplId ve nitelikler zorunlu' });
    }

    const attributeLines = nitelikler.map((n: { attributeId: number; valueIds: number[] }) => [0, 0, {
      attribute_id: n.attributeId,
      value_ids: [[6, 0, n.valueIds]],
    }]);

    await execute('product.template', 'write', [
      [Number(tmplId)],
      { attribute_line_ids: attributeLines },
    ]);

    const variants = await execute('product.product', 'search_read',
      [[['product_tmpl_id', '=', Number(tmplId)]]],
      {
        fields: ['id', 'name',
          'product_template_attribute_value_ids',
          'default_code', 'barcode', 'lst_price', 'standard_price'],
        limit: 200,
      });

    return res.json({ success: true, variants });
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
      { fields: ['id', 'name'] },
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

    const sonuclar: {
      satir: number; varyantId: number; model: string; renk: string;
      olcu: string; barkod: string; fiyat: number;
    }[] = [];
    const hatalar: { satir: number; sebep: string }[] = [];
    const eklenenDegerIdler = new Set<string>();

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

        const addToLine = async (attrId: number, valueId: number) => {
          const key = `${attrId}_${valueId}`;
          if (eklenenDegerIdler.has(key)) return;
          eklenenDegerIdler.add(key);

          const line = lineMap.get(attrId);
          if (!line || line.id === -1) {
            const lineId = Number(await execute(
              'product.template.attribute.line', 'create',
              [{
                product_tmpl_id: Number(tmplId),
                attribute_id: attrId,
                value_ids: [[4, valueId]],
              }],
            ));
            lineMap.set(attrId, { id: lineId, value_ids: [valueId] });
          } else if (!line.value_ids.includes(valueId)) {
            await execute(
              'product.template.attribute.line', 'write',
              [[line.id], { value_ids: [[4, valueId]] }],
            );
            line.value_ids.push(valueId);
          }
        };

        await addToLine(modelAttrId, modelId);
        await addToLine(renkAttrId, renkId);
        if (olcuId) await addToLine(olcuAttrId, olcuId);

        const ptavlar = await execute(
          'product.template.attribute.value', 'search_read',
          [[
            ['product_tmpl_id', '=', Number(tmplId)],
            ['product_attribute_value_id', 'in',
              [modelId, renkId, ...(olcuId ? [olcuId] : [])],
            ],
          ]],
          { fields: ['id', 'attribute_id', 'product_attribute_value_id'] },
        ) as {
          id: number;
          attribute_id: [number, string];
          product_attribute_value_id: [number, string];
        }[];

        const modelPtav = ptavlar.find(
          (p) => p.product_attribute_value_id[0] === modelId,
        );
        const renkPtav = ptavlar.find(
          (p) => p.product_attribute_value_id[0] === renkId,
        );
        const olcuPtav = olcuId ? ptavlar.find(
          (p) => p.product_attribute_value_id[0] === olcuId,
        ) : null;

        if (!modelPtav || !renkPtav || (olcuId && !olcuPtav)) {
          hatalar.push({
            satir: i + 1,
            sebep: 'PTAV bulunamadı',
          });
          continue;
        }

        const ptavIds = [
          modelPtav.id,
          renkPtav.id,
          ...(olcuPtav ? [olcuPtav.id] : []),
        ];

        const mevcutVaryant = await execute(
          'product.product', 'search',
          [[
            ['product_tmpl_id', '=', Number(tmplId)],
            ['product_template_attribute_value_ids', '=', ptavIds[0]],
          ]],
        ) as number[];

        if (mevcutVaryant.length > 0) {
          hatalar.push({
            satir: i + 1,
            sebep: 'Varyant zaten mevcut',
          });
          continue;
        }

        const varyantId = Number(await execute(
          'product.product', 'create',
          [{
            product_tmpl_id: Number(tmplId),
            product_template_attribute_value_ids: [[6, 0, ptavIds]],
            barcode: barkod || false,
            lst_price: fiyat || 0,
          }],
        ));

        sonuclar.push({
          satir: i + 1,
          varyantId,
          model: modelAd,
          renk: renkAd,
          olcu: olcuAd || '',
          barkod: barkod || '',
          fiyat: fiyat || 0,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error
          ? e.message.slice(0, 150)
          : 'Bilinmeyen hata';
        hatalar.push({ satir: i + 1, sebep: msg });
      }
    }

    return res.json({
      success: true,
      olusturulan: sonuclar.length,
      hatalar: hatalar.length,
      detay: {
        sonuclar: sonuclar.slice(0, 50),
        hatalar: hatalar.slice(0, 50),
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

export default router;

