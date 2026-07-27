/**
 * Harici e-ticaret API entegrasyon testi
 * Kullanım: npx ts-node scripts/test-ecommerce-external-api.ts
 */
import 'dotenv/config';
import { createApp } from '../src/app';
import type { Server } from 'http';

const API_KEY = process.env.ECOMMERCE_API_KEY?.trim();
if (!API_KEY) {
  console.error('❌ ECOMMERCE_API_KEY .env içinde tanımlı değil');
  process.exit(1);
}

async function request(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown; ms: number }> {
  const started = Date.now();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  const ms = Date.now() - started;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body, ms };
}

async function main() {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;
  const auth: Record<string, string> = { 'X-Api-Key': API_KEY! };

  console.log('=== 401 — anahtar yok ===');
  const noKey = await request(port, '/api/external/products');
  console.log(noKey.status === 401 ? '✅ 401' : `❌ beklenen 401, alınan ${noKey.status}`);

  console.log('\n=== 401 — yanlış anahtar ===');
  const badKey = await request(port, '/api/external/products', { 'X-Api-Key': 'wrong-key' });
  console.log(badKey.status === 401 ? '✅ 401' : `❌ beklenen 401, alınan ${badKey.status}`);

  console.log('\n=== GET /api/external/products ===');
  const products = await request(port, '/api/external/products?page=1&pageSize=5', auth);
  console.log('status:', products.status, 'ms:', products.ms);
  const prodBody = products.body as { data?: unknown[]; totalCount?: number };
  if (products.status === 200 && Array.isArray(prodBody.data)) {
    console.log(`✅ ${prodBody.data.length} ürün (toplam ${prodBody.totalCount})`);
    console.log('örnek:', JSON.stringify(prodBody.data[0], null, 2));
  } else {
    console.log('❌', products.body);
  }

  console.log('\n=== GET /api/external/stock (sayfa 1) ===');
  const stockStart = Date.now();
  const stock = await request(port, '/api/external/stock?page=1&pageSize=10', auth);
  const stockMs = Date.now() - stockStart;
  console.log('status:', stock.status, 'ms:', stock.ms);
  const stockBody = stock.body as { data?: Array<{ barkod: string; urunAdi: string; toplamStok: number; subeler: unknown[] }>; totalCount?: number };
  if (stock.status === 200 && Array.isArray(stockBody.data)) {
    console.log(`✅ ${stockBody.data.length} ürün stok (toplam katalog ${stockBody.totalCount}), süre ${stockMs}ms`);
    const sample = stockBody.data.find((r) => r.toplamStok > 0) ?? stockBody.data[0];
    if (sample) {
      console.log('örnek:', JSON.stringify({
        barkod: sample.barkod,
        urunAdi: sample.urunAdi,
        toplamStok: sample.toplamStok,
        subeler: sample.subeler?.slice(0, 3),
      }, null, 2));
    }
  } else {
    console.log('❌', stock.body);
  }

  if (stockBody.data?.[0]?.barkod) {
    const barkod = stockBody.data[0].barkod;
    console.log(`\n=== GET /api/external/stock?barkod=${barkod} ===`);
    const one = await request(port, `/api/external/stock?barkod=${encodeURIComponent(barkod)}`, auth);
    const oneBody = one.body as { data?: unknown[] };
    console.log(one.status === 200 && oneBody.data?.length === 1 ? '✅ tek ürün' : '❌', one.status, oneBody);
  }

  console.log('\n=== Rate limit (61 istek) ===');
  let rate429 = false;
  for (let i = 0; i < 61; i++) {
    const r = await request(port, '/api/external/products?page=1&pageSize=1', auth);
    if (r.status === 429) {
      rate429 = true;
      console.log(`✅ 429 alındı (${i + 1}. istek)`);
      break;
    }
  }
  if (!rate429) console.log('❌ 61 istekte 429 alınmadı');

  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
