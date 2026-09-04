import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { getExpenseCategories, createExpense, getEmployees, searchSuppliers } from './expense.service';

const router = Router();

router.use(authenticate);

async function resolveOdooEmployeeId(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      odooEmployeeId: true,
      personel: { select: { odooEmployeeId: true } },
    },
  });
  const employeeId = user?.odooEmployeeId ?? user?.personel?.odooEmployeeId;
  if (!employeeId) {
    throw new Error('Odoo çalışan eşlemesi bulunamadı. Lütfen yöneticinize başvurun.');
  }
  return employeeId;
}

/**
 * hr.expense oluştururken KULLANILACAK şirketi, çalışanın Odoo'daki KENDİ
 * kayıtlı şirketinden çek. Önceden companyId hiç gönderilmiyordu, bu yüzden
 * execute() varsayılan (admin'in ana) şirket bağlamını kullanıyordu — eğer
 * çalışan farklı bir şirkete kayıtlıysa (örn. İlker YOLCU → GÜVEN OPTİK 1959
 * dışında bir şirket) Odoo "Uyumsuz şirket kayıtları" hatası veriyordu.
 * Artık kayıt her zaman çalışanın kendi şirketinde açılıyor.
 */
async function resolveEmployeeCompanyId(employeeId: number): Promise<number | undefined> {
  const rows = (await execute(
    'hr.employee', 'read', [[employeeId]],
    { fields: ['id', 'company_id'] },
  )) as Array<{ id: number; company_id?: [number, string] | false }>;
  const companyId = rows?.[0]?.company_id;
  return Array.isArray(companyId) ? companyId[0] : undefined;
}

function appendOdemeYontemiToDescription(description: string | undefined, odemeYontemi?: string): string {
  const trimmed = (description ?? '').trim();
  if (!odemeYontemi || (odemeYontemi !== 'Nakit' && odemeYontemi !== 'Kart')) {
    return trimmed;
  }
  const odemeLine = `Ödeme: ${odemeYontemi}`;
  return trimmed ? `${odemeLine}\n${trimmed}` : odemeLine;
}

// Masraf kategorilerini getir
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await getExpenseCategories();
    res.json({ success: true, data: categories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Çalışanları getir
router.get('/employees', async (req: Request, res: Response) => {
  try {
    const employees = await getEmployees();
    res.json({ success: true, data: employees });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tedarikçi arama
router.get('/suppliers', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '');
    if (q.length < 3) return res.status(400).json({ success: false, error: 'En az 3 karakter' });
    const results = await searchSuppliers(q);
    res.json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Masraf oluştur
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, product_id, total_amount, payment_mode, description, companyId, odeme_yontemi } = req.body;
    if (!name || !product_id || !total_amount) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
    }
    const employee_id = await resolveOdooEmployeeId(req.user!.userId);
    // Frontend companyId göndermiyor; çalışanın kendi şirketini kullan ki
    // "uyumsuz şirket kayıtları" hatası çıkmasın (bkz. resolveEmployeeCompanyId).
    const resolvedCompanyId = companyId ?? (await resolveEmployeeCompanyId(employee_id));
    const id = await createExpense({
      name,
      product_id,
      total_amount,
      employee_id,
      payment_mode: payment_mode ?? 'company_account',
      description: appendOdemeYontemiToDescription(description, odeme_yontemi),
      companyId: resolvedCompanyId,
    });
    res.json({ success: true, id });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Masraf kaydı oluşturulamadı';
    const status = message.includes('Odoo çalışan eşlemesi') ? 400 : 500;
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
