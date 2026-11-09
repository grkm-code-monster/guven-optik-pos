/**
 * 09.11.2026 — Excel Envanter aktarımında BAŞARISIZ olan satırların Odoo'da bıraktığı artıkları temizler.
 * (Panayır aktarımı: seri takipli üründe Adet>1 tek lota yazılamadığı için 108 satır hata verdi; o satırlar
 * için açılan lot + "sayım bekleyen" (uygulanmamış) quant kayıtları kalmış olabilir.)
 *
 * Sadece adı verilen önekle başlayan lotlara bakar. Stoğu olan (quantity ≠ 0) ya da hareketi (move line) olan
 * lota DOKUNMAZ — başarılı satırların lotları korunur. Stoğu sıfır ve hareketsiz lotun bekleyen sayım
 * kaydı (inventory_quantity) temizlenir, quant ve lot silinir.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/envanter-yarim-temizle.ts --lot-onek GRS-09112026-EXC5655- [--uygula]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');

async function main() {
  const onek = (d('--lot-onek') ?? '').trim();
  if (onek.length < 10) throw new Error('--lot-onek zorunlu (ör. GRS-09112026-EXC5655-)');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const ctx = { active_test: false, allowed_company_ids: [1, 2, 3, 4] };
  const lotlar = (await execute('stock.lot', 'search_read', [[['name', '=like', `${onek}%`]]], { fields: ['id', 'name', 'product_id', 'company_id'], limit: 0, context: ctx })) as any[];
  const lotIds = lotlar.map((l) => l.id);
  const quantlar = lotIds.length
    ? ((await execute('stock.quant', 'search_read', [[['lot_id', 'in', lotIds]]], { fields: ['id', 'lot_id', 'quantity', 'inventory_quantity', 'inventory_quantity_set', 'location_id'], limit: 0, context: ctx })) as any[])
    : [];
  const hareketler = lotIds.length
    ? ((await execute('stock.move.line', 'search_read', [[['lot_id', 'in', lotIds]]], { fields: ['id', 'lot_id', 'state'], limit: 0, context: ctx })) as any[])
    : [];
  const temizlenecek: { lot: any; quantIds: number[] }[] = [];
  let korunan = 0, korunanAdet = 0;
  for (const l of lotlar) {
    const q = quantlar.filter((x) => x.lot_id?.[0] === l.id);
    const stok = q.reduce((a, x) => a + Number(x.quantity || 0), 0);
    const hareket = hareketler.filter((x) => x.lot_id?.[0] === l.id).length;
    if (stok !== 0 || hareket > 0) { korunan++; korunanAdet += stok; continue; }
    temizlenecek.push({ lot: l, quantIds: q.map((x) => x.id) });
  }
  console.log(`\n"${onek}" ile başlayan lot: ${lotlar.length}`);
  console.log(`  KORUNACAK (stoğu/hareketi var — başarılı satırlar): ${korunan} lot, ${korunanAdet} adet`);
  console.log(`  TEMİZLENECEK (stoksuz, hareketsiz — başarısız satır artığı): ${temizlenecek.length} lot, ${temizlenecek.reduce((a, t) => a + t.quantIds.length, 0)} bekleyen sayım kaydı`);
  for (const t of temizlenecek.slice(0, 200)) console.log(`    - ${t.lot.name} | ${t.lot.product_id?.[1]} | quant ${t.quantIds.join(',') || '-'}`);
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — uygulamak için --uygula ekleyin.'); return; }
  let ok = 0, hata = 0;
  for (const t of temizlenecek) {
    try {
      if (t.quantIds.length) {
        try { await execute('stock.quant', 'action_clear_inventory_quantity', [t.quantIds], { context: ctx }); } catch { /* yoksa geç */ }
        try { await execute('stock.quant', 'unlink', [t.quantIds], { context: ctx }); } catch { /* sıfır quant Odoo tarafından da temizlenir */ }
      }
      await execute('stock.lot', 'unlink', [[t.lot.id]], { context: ctx });
      ok++;
    } catch (e) { hata++; console.log(`  ✗ ${t.lot.name}: ${e instanceof Error ? e.message : e}`); }
  }
  console.log(`✓ ${ok} lot temizlendi${hata ? `, ${hata} lot temizlenemedi (yukarıda)` : ''}`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; });
