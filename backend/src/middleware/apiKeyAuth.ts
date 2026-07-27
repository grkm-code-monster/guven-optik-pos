import type { Request, Response, NextFunction } from 'express';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.ECOMMERCE_API_KEY?.trim();
  if (!configured) {
    console.error('[external-api] ECOMMERCE_API_KEY tanımlı değil');
    res.status(500).json({
      error: 'SERVER_CONFIG',
      message: 'Harici API yapılandırması eksik.',
    });
    return;
  }

  const header = req.headers['x-api-key'];
  const provided = typeof header === 'string' ? header.trim() : '';
  if (!provided || provided !== configured) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Geçersiz veya eksik API anahtarı.',
    });
    return;
  }

  next();
}
