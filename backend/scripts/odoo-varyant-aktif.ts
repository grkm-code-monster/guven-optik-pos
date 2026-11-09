/**
 * 09.11.2026 — Arşivlenmiş (pasif) Odoo ürün varyantlarını geri AKTİF yapar. Panayır envanter girişinde,
 * aynı ürün için yeni kayıt açmak yerine Odoo'daki mevcut (pasif) kaydın kullanılması için.
 * Sadece product.product.active alanını değiştirir; fiyat, barkod, model adına dokunmaz.
 * Şablonu pasif olan, ya da barkodu DELETE_ ile başlayan (bilerek silinmiş) varyantı ATLAR.
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/odoo-varyant-aktif.ts --ids 11236,39089,... [--uygula]
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');

async function main() {
  const ids = (d('--ids') ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
  if (!ids.length) throw new Error('--ids zorunlu (virgülle ayrılmış Odoo varyant ID listesi)');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const ctx = { active_test: false };
  const vs = (await execute('product.product', 'read', [ids], { fields: ['id', 'display_name', 'barcode', 'active', 'product_tmpl_id'], context: ctx })) as any[];
  const tmplIds = [...new Set(vs.map((v) => v.product_tmpl_id[0]))];
  const tmpls = new Map(((await execute('product.template', 'read', [tmplIds], { fields: ['id', 'active'], context: ctx })) as any[]).map((t) => [t.id, t.active]));
  const yapilacak: number[] = [];
  let zatenAktif = 0, atla = 0;
  for (const id of ids) {
    const v = vs.find((x) => x.id === id);
    if (!v) { console.log(`  ⚠️ ${id}: bulunamadı — ATLA`); atla++; continue; }
    const bc = String(v.barcode || '');
    if (v.active) { zatenAktif++; console.log(`  = ${id} ${v.display_name} [${bc}] zaten aktif`); continue; }
    if (!tmpls.get(v.product_tmpl_id[0])) { console.log(`  ⚠️ ${id} ${v.display_name}: şablonu pasif — ATLA`); atla++; continue; }
    if (bc.startsWith('DELETE_')) { console.log(`  ⚠️ ${id} ${v.display_name}: barkodu ${bc} (bilerek silinmiş) — ATLA`); atla++; continue; }
    console.log(`  → ${id} ${v.display_name} [${bc || 'barkodsuz'}] AKTİF yapılacak`);
    yapilacak.push(id);
  }
  console.log(`\nÖZET: ${yapilacak.length} aktif yapılacak, ${zatenAktif} zaten aktif, ${atla} atlandı (toplam ${ids.length})`);
  if (!UYGULA) { console.log('KURU ÇALIŞMA — uygulamak için --uygula ekleyin.'); return; }
  let ok = 0;
  for (const id of yapilacak) {
    try { await execute('product.product', 'write', [[id], { active: true }]); ok++; }
    catch (e) { console.log(`  ✗ ${id}: ${e instanceof Error ? e.message : e}`); }
  }
  console.log(`✓ ${ok}/${yapilacak.length} varyant aktif yapıldı`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; });
