import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { apiKeyAuth } from '../../middleware/apiKeyAuth';
import * as ecommerceApi from './ecommerce-api.service';

const router = Router();

function externalApiLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`[external-api] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

const externalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const key = req.headers['x-api-key'];
    if (typeof key === 'string' && key.trim()) return key.trim();
    return ipKeyGenerator(req.ip ?? '127.0.0.1');
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'RATE_LIMIT',
      message: 'Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.',
    });
  },
});

router.use(apiKeyAuth);
router.use(externalRateLimiter);
router.use(externalApiLogger);

router.get('/products', async (req: Request, res: Response) => {
  try {
    const result = await ecommerceApi.getExternalProducts(req.query as Record<string, unknown>);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[external-api] products hata:', err);
    return res.status(500).json({
      error: 'PRODUCTS_UNAVAILABLE',
      message: 'Ürün bilgisi alınamadı.',
    });
  }
});

router.get('/stock', async (req: Request, res: Response) => {
  try {
    const result = await ecommerceApi.getExternalStock(req.query as Record<string, unknown>);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[external-api] stock hata:', err);
    return res.status(500).json({
      error: 'STOCK_UNAVAILABLE',
      message: 'Stok bilgisi alınamadı.',
    });
  }
});

export default router;
