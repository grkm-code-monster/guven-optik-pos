import bcrypt from 'bcryptjs';
import { Prisma, Role, ShiftStatus, SyncStatus } from '@prisma/client';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../../database/prisma';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { execute } from '../odoo/odoo.service';

const router = Router();

router.use(authenticate);
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
    if (!name || !username || !pin || !role || !branchId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) throw codeError('USER_USERNAME_EXISTS', 'Bu kullanıcı adı zaten kayıtlı.');

    const pinHash = await bcrypt.hash(pin, 10);

    const user = await prisma.user.create({
      data: { name, username, pin: pinHash, role, branchId, isActive: true },
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

export default router;

