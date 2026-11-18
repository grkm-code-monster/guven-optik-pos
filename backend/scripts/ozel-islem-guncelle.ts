/**
 * 18.11.2026 (2) — ÖZEL İŞLEM listesini düzenle (Odoo)
 *
 * Odak kaydırma / Prizma / İnceltme-Özel çap ölçüm ekranında zaten var; Özel İşlem'de
 * sadece Renklendirme ve kaplamalar kalsın:
 *   - ARŞİVLENİR (silinmez): ODAK KAYDIRMA, PRİZMA, İNCELTME / ÖZEL ÇAP
 *   - AÇILIR (yoksa): PLUS KAPLAMA, İÇTEN PLUS KAPLAMA, MAVİ KORUMA KAPLAMA, DRIVE KAPLAMA,
 *     DİĞER KAPLAMA (adı satışta yazılır), TERAPÖTİK FİLTRE ve AYNA KAPLAMA (ikisi
 *     Renklendirme'nin içinden seçilir; fiyat farkı olduğu için ayrı ürün)
 *   Vergi/şirket/birim ayarları RENKLENDİRME'den kopyalanır. Fiyat 0 (satışta girilir);
 *   istenirse --fiyat="PLUS KAPLAMA=500;AYNA KAPLAMA=750".
 *
 * GÜVENLİK: Varsayılan KURU. Uygulamak için --confirm. Yapılanlar
 * /root/ozel-islem-guncelle-<zaman>.json'a yazılır; geri almak için:
 *   --geri=/root/ozel-islem-guncelle-<zaman>.json --confirm
 *   (arşivlenenleri geri açar, açılanları arşivler)
 *
 * Kullanım:
 *   cd backend
 *   npx ts-node --transpile-only scripts/ozel-islem-guncelle.ts            (kuru)
 *   npx ts-node --transpile-only scripts/ozel-islem-guncelle.ts --confirm  (uygula)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';
import { prisma } from '../src/database/prisma';

const BAKIM_KATEGORI_ID = 63;
const KATEGORI_ADI = 'ÖZEL İŞLEM';
const ARSIVLENECEK = ['ODAK KAYDIRMA', 'PRİZMA', 'İNCELTME / ÖZEL ÇAP'];
const ACILACAK = [
  'PLUS KAPLAMA',
  'İÇTEN PLUS KAPLAMA',
  'MAVİ KORUMA KAPLAMA',
  'DRIVE KAPLAMA',
  'DİĞER KAPLAMA',
  'TERAPÖTİK FİLTRE',
  'AYNA KAPLAMA',
];

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
  active: boolean;
  list_price: number;
  company_id: [number, string] | false;
  taxes_id: number[];
  uom_id: [number, string] | false;
  uom_po_id: [number, string] | false;
};

async function geriAl(dosya: string) {
  const k = JSON.parse(fs.readFileSync(dosya, 'utf8')) as { arsivlenen: number[]; acilan: number[] };
  console.log(`Geri: arşivden çıkacak ${k.arsivlenen.length}, arşivlenecek (açılan) ${k.acilan.length}`);
  if (!confirm) return console.log('--- KURU --- Uygulamak için --confirm ekle.');
  if (k.arsivlenen.length) await execute('product.template', 'write', [k.arsivlenen, { active: true }], { context: { active_test: false } });
  if (k.acilan.length) await execute('product.template', 'write', [k.acilan, { active: false }]);
  console.log('TAMAM — geri alındı');
}

async function main() {
  const geri = arg('geri');
  if (geri) return geriAl(geri);
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  const fiyat = fiyatlar();

  const kat = (await execute('product.category', 'search_read', [[['parent_id', '=', BAKIM_KATEGORI_ID]]], { fields: ['id', 'name'] })) as Array<{ id: number; name: string }>;
  const katId = kat.find((k) => fold(k.name) === fold(KATEGORI_ADI))?.id;
  if (!katId) throw new Error('ÖZEL İŞLEM kategorisi yok — önce ozel-islem-kategori-kur.ts');
  console.log(`ÖZEL İŞLEM kategorisi: #${katId}`);

  const alanlar = ['id', 'name', 'type', 'active', 'list_price', 'company_id', 'taxes_id', 'uom_id', 'uom_po_id'];
  const hepsi = (await execute('product.template', 'search_read', [[['categ_id', '=', katId]]], { fields: alanlar, order: 'name asc', context: { active_test: false } })) as Tmpl[];
  console.log('\nŞu an kategoride:');
  for (const t of hepsi) console.log(`  #${t.id} "${t.name}"  ${t.active ? 'aktif' : 'ARŞİVDE'}  fiyat=${t.list_price}`);

  const arsiv = hepsi.filter((t) => t.active && ARSIVLENECEK.some((a) => fold(a) === fold(t.name)));
  console.log(`\nARŞİVLENECEK: ${arsiv.length}`);
  for (const t of arsiv) {
    const varyant = (await execute('product.product', 'search', [[['product_tmpl_id', '=', t.id]]], { context: { active_test: false } })) as number[];
    const kullanan = await prisma.saleItem.count({ where: { odooProductId: { in: varyant.map(String) }, status: { not: 'VOID' } } });
    console.log(`  #${t.id} "${t.name}"  (POS'ta bu işlemi içeren kalem: ${kullanan} — kayıtları etkilenmez, sadece listeden kalkar)`);
  }

  const sablon = hepsi.find((t) => /RENKLEND/.test(fold(t.name)) && t.active) ?? hepsi.find((t) => t.type === 'service');
  if (!sablon) throw new Error('Ayar kopyalanacak hizmet ürünü bulunamadı');
  console.log(`\nAyarlar şu üründen kopyalanacak: #${sablon.id} "${sablon.name}" (vergi: ${JSON.stringify(sablon.taxes_id)})`);

  const aktifAdlar = new Set(hepsi.filter((t) => t.active).map((t) => fold(t.name)));
  const ac = ACILACAK.filter((a) => !aktifAdlar.has(fold(a)));
  console.log(`\nAÇILACAK: ${ac.length}`);
  for (const a of ac) console.log(`  "${a}"  fiyat=${fiyat.get(fold(a)) ?? 0}`);
  const zaten = ACILACAK.filter((a) => aktifAdlar.has(fold(a)));
  if (zaten.length) console.log(`ZATEN VAR (dokunulmayacak): ${zaten.join(', ')}`);

  if (!confirm) {
    console.log('\n--- KURU --- Hiçbir şey değişmedi. Uygulamak için sonuna --confirm ekle.');
    return;
  }

  const kayit = { zaman: new Date().toISOString(), arsivlenen: arsiv.map((t) => t.id), acilan: [] as number[] };
  if (arsiv.length) {
    await execute('product.template', 'write', [arsiv.map((t) => t.id), { active: false }]);
    console.log(`\n✓ Arşivlendi: ${arsiv.map((t) => `#${t.id}`).join(', ')}`);
  }
  for (const ad of ac) {
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
    kayit.acilan.push(id);
    console.log(`✓ Açıldı: #${id} "${ad}"`);
  }
  const dosya = `/root/ozel-islem-guncelle-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
  console.log(`\nKayıt dosyası (geri alma için): ${dosya}`);
  console.log('TAMAM');
}

main()
  .catch((e) => {
    console.error('HATA:', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
