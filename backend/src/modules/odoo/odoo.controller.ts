import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { ODOO_CATEGORY_MAP, execute, getProducts, getProductsByCategory } from './odoo.service';

const router = Router();

router.use(authenticate);

function mapOdooProduct(p: any, category?: string) {
  return {
    id: `odoo_${p.id}`,
    name: p.name,
    price: p.list_price,
    barcode: p.barcode || null,
    category: category || 'GENERAL',
    source: 'odoo' as const,
  };
}

router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;

    let rawProducts: any[];
    if (category) {
      const odooCategoryId = ODOO_CATEGORY_MAP[category];
      if (!odooCategoryId) {
        return res.status(200).json([]);
      }
      rawProducts = await getProductsByCategory(odooCategoryId);
    } else {
      rawProducts = await getProducts();
    }

    const mapped = (rawProducts ?? []).map((p) => mapOdooProduct(p, category));
    return res.status(200).json(mapped);
  } catch (err) {
    next(err);
  }
});

router.get('/products/barcode/:barcode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await execute(
      'product.template',
      'search_read',
      [[['barcode', '=', req.params.barcode]]],
      {
        fields: ['id', 'name', 'list_price', 'default_code', 'barcode', 'categ_id', 'type'],
        limit: 1,
      },
    );

    if (!Array.isArray(result) || result.length === 0) {
      return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: 'Ürün bulunamadı.' });
    }

    return res.status(200).json(mapOdooProduct(result[0]));
  } catch (err) {
    next(err);
  }
});

router.get('/taxes', async (req, res) => {
  try {
    const taxes = await execute(
      'account.tax',
      'search_read',
      [[['type_tax_use', '=', 'sale'], ['active', '=', true]]],
      { fields: ['id', 'name', 'amount'], limit: 50 },
    );
    res.json({ success: true, data: taxes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
