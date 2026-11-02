/**
 * 02.11.2026 — SALT OKUNUR. stdin'den gelen UTS kodlarının (her satıra bir
 * kod) Odoo'da lot olarak oluşup oluşmadığını ve stokta olup olmadığını yazar.
 * Hiçbir kaydı değiştirmez.
 *
 * Kullanım (Mac'ten):
 *   ssh root@SUNUCU "cd /opt/guven-pos/backend && npx ts-node --transpile-only scripts/uts-var-mi.ts" < uts-listesi.txt
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const girdi = await new Promise<string>((res) => {
    let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => res(s));
  });
  const kodlar = Array.from(new Set(girdi.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)));
  const lotlar = (await execute('stock.lot', 'search_read', [[['x_uts_kodu', 'in', kodlar]]], {
    fields: ['id', 'name', 'x_uts_kodu', 'product_id', 'create_date'],
  })) as any[];
  const quants = lotlar.length ? (await execute('stock.quant', 'search_read',
    [[['lot_id', 'in', lotlar.map((l) => l.id)], ['location_id.usage', '=', 'internal']]],
    { fields: ['lot_id', 'quantity', 'location_id'] })) as any[] : [];
  const stok = new Map<number, string>();
  for (const q of quants) if (q.quantity > 0) stok.set(q.lot_id[0], `${q.location_id[1]} x${q.quantity}`);
  const bulunan = new Set(lotlar.map((l) => l.x_uts_kodu));
  console.log(`Toplam kod: ${kodlar.length} | Odoo'da lotu olan: ${bulunan.size} | stokta olan: ${stok.size} | hiç olmayan: ${kodlar.length - bulunan.size}`);
  for (const l of lotlar) console.log(`VAR  ${l.x_uts_kodu}  ${l.product_id?.[1]}  lot=${l.name}  ${stok.get(l.id) ?? 'STOK YOK'}  (${l.create_date})`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
