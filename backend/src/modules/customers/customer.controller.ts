import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { CreateCustomerInput, CreateCustomerPrescriptionInput, CustomerSearchInput, LegacyPromoteInput, UpdateCustomerInput } from './customer.types';
import * as customerService from './customer.service';
import * as legacyService from './legacy.service';

const router = Router();

router.use(authenticate);

function handleCustomerError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;

  if (code === 'CUSTOMER_PHONE_EXISTS') {
    res.status(409).json({ error: 'CUSTOMER_PHONE_EXISTS', message: 'Bu telefon numarası zaten kayıtlı.' });
    return true;
  }
  if (code === 'CUSTOMER_TC_EXISTS') {
    res.status(409).json({ error: 'CUSTOMER_TC_EXISTS', message: 'Bu TC kimlik numarası zaten kayıtlı.' });
    return true;
  }
  if (code === 'CUSTOMER_NOT_FOUND') {
    res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Müşteri bulunamadı.' });
    return true;
  }
  if (code === 'LEGACY_CUSTOMER_NOT_FOUND') {
    res.status(404).json({ error: 'LEGACY_CUSTOMER_NOT_FOUND', message: 'Arşiv müşterisi bulunamadı.' });
    return true;
  }
  if (code === 'LEGACY_PHONE_MISSING') {
    res.status(400).json({ error: 'LEGACY_PHONE_MISSING', message: 'Arşiv kaydında telefon bilgisi yok.' });
    return true;
  }
  return false;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CustomerSearchInput.safeParse({ q: req.query.q });
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz sorgu parametresi.' });
    }
    const result = await customerService.searchCustomers(parsed.data.q);
    return res.status(200).json(result);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateCustomerInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const customer = await customerService.createCustomer(parsed.data);
    return res.status(200).json(customer);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.post('/resolve-odoo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { odooPartnerId, name, phone, email } = req.body;
    if (!odooPartnerId || !name) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'odooPartnerId ve name zorunlu.' });
    }
    const customer = await customerService.resolveOdooCustomer(Number(odooPartnerId), {
      name,
      phone: phone ?? '',
      email,
    });
    return res.status(200).json(customer);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.get('/legacy-search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CustomerSearchInput.safeParse({ q: req.query.q });
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz sorgu parametresi.' });
    }
    const result = await legacyService.searchLegacyCustomers(parsed.data.q);
    return res.status(200).json(result);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.get('/legacy/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const detail = await legacyService.getLegacyCustomerDetail(req.params.id);
    return res.status(200).json(detail);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.post('/legacy/:id/promote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = LegacyPromoteInput.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const result = await legacyService.promoteLegacyCustomer(req.params.id, parsed.data);
    return res.status(200).json(result);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    return res.status(200).json(customer);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateCustomerInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const customer = await customerService.updateCustomer(req.params.id, parsed.data);
    return res.status(200).json(customer);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.post('/:id/prescriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateCustomerPrescriptionInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const created = await customerService.addPrescription(req.params.id, parsed.data);
    return res.status(200).json(created);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.get('/:id/prescriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await customerService.getCustomerPrescriptions(req.params.id);
    return res.status(200).json(list);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.get('/:id/prescriptions/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = await customerService.getLatestPrescription(req.params.id);
    return res.status(200).json(latest);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

router.get('/:id/receteler', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await customerService.getReceteGecmisi(req.params.id);
    return res.status(200).json(list);
  } catch (err) {
    if (handleCustomerError(err, res)) return;
    next(err);
  }
});

export default router;

