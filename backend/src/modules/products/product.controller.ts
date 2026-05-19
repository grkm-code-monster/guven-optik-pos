import { Router, type Request, type Response, type NextFunction } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { CreateProductInput, ProductQueryInput } from './product.types';
import * as productService from './product.service';

const router = Router();

router.use(authenticate);

function handleProductError(err: unknown, res: Response): boolean {
  if (!(err instanceof Error) || !('code' in err)) return false;
  const code = (err as Error & { code: string }).code;

  if (code === 'PRODUCT_NOT_FOUND') {
    res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: 'Ürün bulunamadı.' });
    return true;
  }
  if (code === 'PRODUCT_BARCODE_EXISTS') {
    res.status(409).json({ error: 'PRODUCT_BARCODE_EXISTS', message: 'Bu barkod zaten kayıtlı.' });
    return true;
  }
  return false;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ProductQueryInput.safeParse({
      type: req.query.type,
      category: req.query.category,
      group: req.query.group,
      q: req.query.q,
      barcode: req.query.barcode,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz sorgu parametreleri.' });
    }
    const products = await productService.getProducts(parsed.data);
    return res.status(200).json(products);
  } catch (err) {
    if (handleProductError(err, res)) return;
    next(err);
  }
});

router.get('/favorites', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await productService.getFavoriteProducts();
    return res.status(200).json(products);
  } catch (err) {
    if (handleProductError(err, res)) return;
    next(err);
  }
});

router.get('/by-barcode/:barcode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productService.getProductByBarcode(req.params.barcode);
    return res.status(200).json(product);
  } catch (err) {
    if (handleProductError(err, res)) return;
    next(err);
  }
});

router.post('/', authorize(Role.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateProductInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz istek gövdesi.' });
    }
    const product = await productService.createProduct(parsed.data);
    return res.status(200).json(product);
  } catch (err) {
    if (handleProductError(err, res)) return;
    next(err);
  }
});

export default router;

