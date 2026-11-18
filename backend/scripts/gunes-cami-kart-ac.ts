/**
 * 18.11.2026 — VP. HAZIR GÜNEŞ CAMI kartları (680 kombinasyon) — Odoo
 *
 * Kaynak: scripts/veri/gunes-camlari-2026-11-18.json (GUNES_STOK_CAM_KOMBINASYON.xlsx'ten;
 * ad, barkod, maliyet, satış). Her kombinasyon AYRI şablon olarak açılır:
 *   - kategori #83 "All / BAKIM / Güneş Camları"
 *   - stoklu + seri takipli (stok camlarla aynı: type/detailed_type='product', tracking='serial')
 *     → stok gelince Cam Envanter girişiyle doğrudan bu kartlara yüklenir
 *   - barkod = tablodaki barkod (086800002 + hammadde/özellik/renk/baz/kaplama)
 *   - satış (KDV dahil) = list_price, maliyet = standard_price
 *   - vergi/birim/şirket ayarları mevcut bir stok cam şablonundan (kategori 35) kopyalanır
 *
 * GÜVENLİK: Varsayılan KURU. Aynı isimde (arşivdekiler dahil) şablon ya da aynı barkodlu
 * ürün varsa o satır ATLANIR ve raporlanır. Uygulamada açılan id'ler
 * /root/gunes-cami-kart-<zaman>.json'a yazılır; geri almak için (arşivler, silmez):
 *   --geri=/root/gunes-cami-kart-<zaman>.json --confirm
 *
 * Kullanım:
 *   cd backend
 *   npx ts-node --transpile-only scripts/gunes-cami-kart-ac.ts            (kuru)
 *   npx ts-node --transpile-only scripts/gunes-cami-kart-ac.ts --confirm  (uygula)
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';

const KATEGORI_ID = 83;
const ORNEK_KATEGORI_ID = 35; // Stok Cam / Beyaz / Standart
const VERI = path.join(__dirname, 'veri', 'gunes-camlari-2026-11-18.json');

const confirm = process.argv.includes('--confirm');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');

type Satir = { ad: string; barkod: string; maliyet: number; satis: number };

function parcala<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

function fold(s: string): string {
  return (s || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();
}

async function geriAl(dosya: string) {
  const k = JSON.parse(fs.readFileSync(dosya, 'utf8')) as { acilan: number[] };
  console.log(`Geri: arşivlenecek şablon ${k.acilan.length} (${dosya})`);
  if (!confirm) return console.log('--- KURU --- Uygulamak için --confirm ekle.');
  for (const p of parcala(k.acilan, 100)) await execute('product.template', 'write', [p, { active: false }]);
  console.log('TAMAM — geri alındı (arşivlendi)');
}

async function main() {
  const geri = arg('geri');
  if (geri) return geriAl(geri);
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');

  const satirlar = JSON.parse(fs.readFileSync(VERI, 'utf8')) as Satir[];
  console.log(`Tablodaki kombinasyon: ${satirlar.length}`);

  const [kat] = (await execute('product.category', 'read', [[KATEGORI_ID]], { fields: ['id', 'complete_name'] })) as Array<{ id: number; complete_name: string }>;
  if (!kat) throw new Error(`Kategori #${KATEGORI_ID} bulunamadı`);
  console.log(`Kategori: #${kat.id} "${kat.complete_name}"`);

  const [ornek] = (await execute('product.template', 'search_read', [[['categ_id', '=', ORNEK_KATEGORI_ID], ['type', '=', 'product'], ['tracking', '=', 'serial'], ['active', '=', true]]], {
    fields: ['id', 'name', 'taxes_id', 'supplier_taxes_id', 'uom_id', 'uom_po_id', 'company_id'],
    limit: 1,
    order: 'id desc',
  })) as Array<{ id: number; name: string; taxes_id: number[]; supplier_taxes_id: number[]; uom_id: [number, string] | false; uom_po_id: [number, string] | false; company_id: [number, string] | false }>;
  if (!ornek) throw new Error('Ayar kopyalanacak stok cam şablonu bulunamadı');
  console.log(`Ayarlar şu stok camdan kopyalanacak: #${ornek.id} "${ornek.name}" (satış vergisi ${JSON.stringify(ornek.taxes_id)}, alış vergisi ${JSON.stringify(ornek.supplier_taxes_id)}, şirket: ${ornek.company_id ? ornek.company_id[1] : 'tümü'})`);

  // Aynı isim (arşivdekiler dahil, tüm kategoriler)
  const adlar = satirlar.map((s) => s.ad);
  const ayniIsim = new Map<string, { id: number; active: boolean; categ: string }>();
  for (const p of parcala(adlar, 200)) {
    const r = (await execute('product.template', 'search_read', [[['name', 'in', p]]], { fields: ['id', 'name', 'active', 'categ_id'], context: { active_test: false } })) as Array<{ id: number; name: string; active: boolean; categ_id: [number, string] | false }>;
    for (const t of r) ayniIsim.set(fold(t.name), { id: t.id, active: t.active, categ: t.categ_id ? t.categ_id[1] : '' });
  }
  // Aynı barkod
  const barkodlar = satirlar.map((s) => s.barkod);
  const ayniBarkod = new Map<string, string>();
  for (const p of parcala(barkodlar, 200)) {
    const r = (await execute('product.product', 'search_read', [[['barcode', 'in', p]]], { fields: ['id', 'display_name', 'barcode'], context: { active_test: false } })) as Array<{ id: number; display_name: string; barcode: string }>;
    for (const v of r) ayniBarkod.set(v.barcode, `#${v.id} ${v.display_name}`);
  }
  // 086800002 serisi başka yerde (lot ref) kullanılıyor mu? (bilgi)
  const lotRef = Number(await execute('stock.lot', 'search_count', [[['ref', '=like', '086800002%']]]));

  const acilacak: Satir[] = [];
  const atlanan: string[] = [];
  for (const s of satirlar) {
    const i = ayniIsim.get(fold(s.ad));
    const b = ayniBarkod.get(s.barkod);
    if (i) atlanan.push(`"${s.ad}" — aynı isimde şablon var #${i.id} (${i.active ? 'aktif' : 'arşivde'}, ${i.categ})`);
    else if (b) atlanan.push(`"${s.ad}" — barkod ${s.barkod} başka üründe: ${b}`);
    else acilacak.push(s);
  }

  console.log(`\nAÇILACAK: ${acilacak.length}`);
  for (const s of acilacak.slice(0, 5)) console.log(`  "${s.ad}"  barkod ${s.barkod}  maliyet ${s.maliyet}  satış ${s.satis}`);
  if (acilacak.length > 5) console.log(`  … (+${acilacak.length - 5})`);
  const ozet = new Map<string, number>();
  for (const s of acilacak) {
    const k = `maliyet ${s.maliyet} → satış ${s.satis}`;
    ozet.set(k, (ozet.get(k) ?? 0) + 1);
  }
  console.log('Fiyat dağılımı:');
  for (const [k, v] of [...ozet.entries()].sort()) console.log(`  ${v} kart: ${k}`);
  console.log(`\nATLANAN: ${atlanan.length}`);
  for (const a of atlanan.slice(0, 30)) console.log(`  ${a}`);
  if (lotRef) console.log(`\n⚠ BİLGİ: 086800002… ile başlayan ${lotRef} lot referansı var (ürün barkodu değil, çakışma sayılmadı).`);

  if (!confirm) {
    console.log('\n--- KURU --- Hiçbir şey değişmedi. Uygulamak için sonuna --confirm ekle.');
    return;
  }

  const kayit = { zaman: new Date().toISOString(), acilan: [] as number[] };
  const dosya = `/root/gunes-cami-kart-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  let hata = 0;
  for (const p of parcala(acilacak, 40)) {
    const vals = p.map((s) => {
      const v: Record<string, unknown> = {
        name: s.ad,
        type: 'product',
        detailed_type: 'product',
        tracking: 'serial',
        categ_id: KATEGORI_ID,
        list_price: s.satis,
        standard_price: s.maliyet,
        barcode: s.barkod,
        sale_ok: true,
        purchase_ok: true,
        company_id: ornek.company_id ? ornek.company_id[0] : false,
        taxes_id: [[6, 0, ornek.taxes_id ?? []]],
        supplier_taxes_id: [[6, 0, ornek.supplier_taxes_id ?? []]],
      };
      if (ornek.uom_id) v.uom_id = ornek.uom_id[0];
      if (ornek.uom_po_id) v.uom_po_id = ornek.uom_po_id[0];
      return v;
    });
    try {
      const ids = (await execute('product.template', 'create', [vals])) as number[] | number;
      const liste = Array.isArray(ids) ? ids : [ids];
      kayit.acilan.push(...liste);
      fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
      console.log(`✓ ${kayit.acilan.length}/${acilacak.length}`);
    } catch (e: unknown) {
      hata++;
      console.error(`✗ Parti hatası (${p[0].ad} …):`, e instanceof Error ? e.message.slice(0, 300) : e);
    }
  }
  fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
  console.log(`\nKayıt dosyası (geri alma için): ${dosya}`);
  console.log(hata ? `BİTTİ — ${kayit.acilan.length} kart açıldı, ${hata} parti HATALI (tekrar çalıştırmak güvenli: açılanlar atlanır)` : `TAMAM — ${kayit.acilan.length} kart açıldı`);
}

main().catch((e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
});
