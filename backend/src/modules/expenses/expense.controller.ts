import { Router, Request, Response } from 'express';
import { getExpenseCategories, createExpense, getEmployees, searchSuppliers } from './expense.service';

const router = Router();

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
    const { name, product_id, total_amount, employee_id, payment_mode, description, companyId } = req.body;
    if (!name || !product_id || !total_amount || !employee_id) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
    }
    const id = await createExpense({
      name,
      product_id,
      total_amount,
      employee_id,
      payment_mode: payment_mode ?? 'company_account',
      description,
      companyId,
    });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
