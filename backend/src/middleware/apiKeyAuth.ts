import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma';

/**
 * E-Ticaret partner API'sinin anahtarı artık Yönetim Paneli > Tanımlamalar > E-Ticaret
 * sekmesinden yönetiliyor (EticaretAyar.bizimApiAnahtari) — admin "Anahtarı yenile"ye
 * bastığında burada da anında geçerli olur. ECOMMERCE_API_KEY env değişkeni yalnızca
 * DB'de henüz kayıt yoksa (ilk kurulum/geçiş dönemi) yedek olarak kullanılır.
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers['x-api-key'];
  const provided = typeof header === 'string' ? header.trim() : '';

  if (!provided) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Geçersiz veya eksik API anahtarı.' });
    return;
  }

  try {
    const ayar = await prisma.eticaretAyar.findFirst({ select: { bizimApiAnahtari: true, aktif: true } });
    if (ayar) {
      if (ayar.aktif && provided === ayar.bizimApiAnahtari) return next();
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Geçersiz veya eksik API anahtarı.' });
      return;
    }
  } catch (err) {
    console.error('[external-api] EticaretAyar okunamadı, env fallback deneniyor:', err);
  }

  const fallback = process.env.ECOMMERCE_API_KEY?.trim();
  if (!fallback) {
    console.error('[external-api] Ne EticaretAyar ne de ECOMMERCE_API_KEY tanımlı');
    res.status(500).json({ error: 'SERVER_CONFIG', message: 'Harici API yapılandırması eksik.' });
    return;
  }
  if (provided !== fallback) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Geçersiz veya eksik API anahtarı.' });
    return;
  }
  next();
}
