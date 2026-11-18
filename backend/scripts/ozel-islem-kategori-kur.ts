/**
 * 18.11.2026 — ÖZEL İŞLEM kategorisi ve hizmet ürünleri (Odoo)
 *
 * Satışta cam satırındaki "Özel İşlem" butonu, Odoo'da BAKIM (63) altındaki
 * "ÖZEL İŞLEM" alt kategorisindeki hizmet ürünlerini listeler. Bu script:
 *   1) BAKIM (63) altında "ÖZEL İŞLEM" kategorisini açar (yoksa),
 *   2) BAKIM'daki RENKLENDİRME ürün(ler)ini bu kategoriye TAŞIR (silmez; geçmiş
 *      satışlar etkilenmez, Bakım listesinden kalkar),
 *   3) ODAK KAYDIRMA, PRİZMA, İNCELTME / ÖZEL ÇAP hizmet ürünlerini açar (yoksa).
 *      Vergi/şirket/birim ayarları RENKLENDİRME'den kopyalanır (o yoksa BAKIM'daki
 *      ilk hizmet ürününden).
 *
 * GÜVENLİK: Varsayılan KURU (hiçbir şey değişmez). Uygulamak için --confirm.
 * Geri alma: yapılan değişiklikler /root/ozel-islem-kur-<zaman>.json'a yazılır
 * (taşınan ürünlerin eski kategorisi + açılan kayıtların id'leri).
 *
 * Fiyat: yeni ürünler 0 TL açılır (satışta fiyat elle girilir). İstenirse:
 *   --fiyat="PRİZMA=750;ODAK KAYDIRMA=500"
 *
 * Kullanım:
 *   cd backend
 *   npx ts-node --transpile-only scripts/ozel-islem-kategori-kur.ts            (kuru)
 *   npx ts-node --transpile-only scripts/ozel-islem-kategori-kur.ts --confirm  (uygula)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';

const BAKIM_KATEGORI_ID = 63;
const KATEGORI_ADI = 'ÖZEL İŞLEM';
const YENI_URUNLER = ['ODAK KAYDIRMA', 'PRİZMA', 'İNCELTME / ÖZEL ÇAP'];

const confirm = process.argv.includes('--confirm');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');

function fold(s: string): string {
  return (s || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function fiyatlar(): Map<string, number> {
  const m = new Map<string, number>();
  for (const parca of (arg('fiyat') ?? '').split(';')) {
    const [ad, f] = parca.split('=');
    if (!ad || f == null) continue;
    const n = Number(String(f).replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) m.set(fold(ad), n);
  }
  return m;
}

type Tmpl = {
  id: number;
  name: string;
  type: string;
  list_price: number;
  categ_id: [number, string] | false;
  company_id: [number, string] | false;
  taxes_id: number[];
  uom_id: [number, string] | false;
  uom_po_id: [number, string] | false;
  sale_ok: boolean;
};

async function main() {
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  const fiyat = fiyatlar();
  const kayit: Record<string, unknown> = { zaman: new Date().toISOString() };

  const [bakim] = (await execute('product.category', 'read', [[BAKIM_KATEGORI_ID]], { fields: ['id', 'complete_name'] })) as Array<{ id: number; complete_name: string }>;
  if (!bakim) throw new Error('BAKIM kategorisi (63) bulunamadı');
  console.log(`BAKIM kategorisi: #${bakim.id} "${bakim.complete_name}"`);

  // 1) Kategori
  const mevcutKat = (await execute('product.category', 'search_read', [[['parent_id', '=', BAKIM_KATEGORI_ID]]], { fields: ['id', 'name'] })) as Array<{ id: number; name: string }>;
  let katId: number | null = mevcutKat.find((k) => fold(k.name) === fold(KATEGORI_ADI))?.id ?? null;
  console.log(katId ? `ÖZEL İŞLEM kategorisi zaten var: #${katId}` : `AÇILACAK kategori: "${bakim.complete_name} / ${KATEGORI_ADI}"`);

  // 2) Bakım'daki hizmet ürünleri
  const alanlar = ['id', 'name', 'type', 'list_price', 'categ_id', 'company_id', 'taxes_id', 'uom_id', 'uom_po_id', 'sale_ok'];
  const bakimUrunleri = (await execute('product.template', 'search_read', [[['categ_id', '=', BAKIM_KATEGORI_ID], ['active', '=', true]]], { fields: alanlar, order: 'name asc' })) as Tmpl[];
  console.log(`\nBAKIM'da aktif ürün: ${bakimUrunleri.length}`);
  for (const t of bakimUrunleri) console.log(`  #${t.id} "${t.name}"  tip=${t.type}  fiyat=${t.list_price}`);

  const renk = bakimUrunleri.filter((t) => /RENKLEND/.test(fold(t.name)));
  console.log(`\nTAŞINACAK (Bakım → Özel İşlem): ${renk.length}`);
  for (const t of renk) console.log(`  #${t.id} "${t.name}"  fiyat=${t.list_price}`);

  let ozelUrunleri: Tmpl[] = [];
  if (katId) {
    ozelUrunleri = (await execute('product.template', 'search_read', [[['categ_id', '=', katId]]], { fields: alanlar, context: { active_test: false } })) as Tmpl[];
  }
  const sablon = renk[0] ?? ozelUrunleri[0] ?? bakimUrunleri.find((t) => t.type === 'service') ?? null;
  if (!sablon) throw new Error('Ayar kopyalanacak hizmet ürünü bulunamadı');
  if (sablon.type !== 'service') console.log(`\n⚠ UYARI: örnek ürün #${sablon.id} tipi "${sablon.type}" (service değil). Yeni ürünler yine de 'service' açılacak.`);
  console.log(`\nAyarlar şu üründen kopyalanacak: #${sablon.id} "${sablon.name}" (vergi: ${JSON.stringify(sablon.taxes_id)}, şirket: ${sablon.company_id ? sablon.company_id[1] : 'tümü'})`);

  const varOlanlar = new Set([...ozelUrunleri, ...bakimUrunleri].map((t) => fold(t.name)));
  if (!renk.length && !ozelUrunleri.some((t) => /RENKLEND/.test(fold(t.name)))) YENI_URUNLER.unshift('RENKLENDİRME');
  const acilacak = YENI_URUNLER.filter((ad) => !varOlanlar.has(fold(ad)));
  console.log(`\nAÇILACAK hizmet ürünü: ${acilacak.length}`);
  for (const ad of acilacak) console.log(`  "${ad}"  fiyat=${fiyat.get(fold(ad)) ?? 0}`);
  const zatenVar = YENI_URUNLER.filter((ad) => varOlanlar.has(fold(ad)));
  if (zatenVar.length) console.log(`ZATEN VAR (dokunulmayacak): ${zatenVar.join(', ')}`);

  if (!confirm) {
    console.log('\n--- KURU --- Hiçbir şey değişmedi. Uygulamak için sonuna --confirm ekle.');
    return;
  }

  if (!katId) {
    katId = (await execute('product.category', 'create', [{ name: KATEGORI_ADI, parent_id: BAKIM_KATEGORI_ID }])) as number;
    kayit.acilanKategori = katId;
    console.log(`\n✓ Kategori açıldı: #${katId}`);
  }

  if (renk.length) {
    kayit.tasinan = renk.map((t) => ({ id: t.id, eskiKategori: BAKIM_KATEGORI_ID }));
    await execute('product.template', 'write', [renk.map((t) => t.id), { categ_id: katId }]);
    console.log(`✓ Taşındı: ${renk.map((t) => `#${t.id}`).join(', ')}`);
  }

  const acilan: number[] = [];
  for (const ad of acilacak) {
    const vals: Record<string, unknown> = {
      name: ad,
      type: 'service',
      categ_id: katId,
      list_price: fiyat.get(fold(ad)) ?? 0,
      sale_ok: true,
      purchase_ok: false,
      company_id: sablon.company_id ? sablon.company_id[0] : false,
      taxes_id: [[6, 0, sablon.taxes_id ?? []]],
    };
    if (sablon.uom_id) vals.uom_id = sablon.uom_id[0];
    if (sablon.uom_po_id) vals.uom_po_id = sablon.uom_po_id[0];
    const id = (await execute('product.template', 'create', [vals])) as number;
    acilan.push(id);
    console.log(`✓ Açıldı: #${id} "${ad}"`);
  }
  kayit.acilanUrunler = acilan;

  const dosya = `/root/ozel-islem-kur-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
  console.log(`\nKayıt dosyası (geri alma için): ${dosya}`);
  console.log(`TAMAM — ÖZEL İŞLEM kategorisi #${katId}`);
}

main().catch((e) => {
  console.error('HATA:', e?.message ?? e);
  process.exit(1);
});
