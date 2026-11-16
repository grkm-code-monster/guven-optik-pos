/**
 * 16.11.2026 — AYNI İSİMLİ İKİZ ŞABLON TEMİZLİĞİ
 *
 * Sorun: Birçok üründe (ör. "Org 1.5 0000 -0000") aynı isimde İKİ şablon var:
 *   - biri stok tutan (type='product', seri takipli) — doğru olan,
 *   - diğeri stok tutmayan (type='consu') — eski/hatalı kopya.
 * Mağazada satışta consu ikiz seçilirse lotsuz/stoksuz satış oluyor (canlı örnek:
 * #2881, 28.10.2026 NG/OUT/00166). Ayrıca sablon-tip-kilidi-coz.ts ile adı
 * "[ESKİ-TİP-KİLİTLİ] ..." yapılan eski şablonlar hâlâ AKTİF.
 *
 * Bu script, AKTİF ve stok tutan bir ikizi OLAN şu şablonları ARŞİVLER (silmez):
 *   1) aynı isimli, aktif, type='consu' şablonlar,
 *   2) "[ESKİ-TİP-KİLİTLİ] X" adlı aktif şablonlar (X'in stok tutan aktif hali varsa).
 *
 * GÜVENLİK:
 *   - type='service' şablonlara (muayene, kargo vb.) ASLA dokunmaz.
 *   - Stok tutan aktif ikizi olmayan şablona dokunmaz.
 *   - Varyantında stok (quant) veya açık (done/cancel dışı) stok hareketi varsa atlar.
 *   - Varsayılan KURU: sadece rapor. Uygulamak için --confirm.
 *   - Uygulamada arşivlenen id'ler /root/ikiz-arsiv-<zaman>.json'a yazılır;
 *     geri almak için: --geri=/root/ikiz-arsiv-<zaman>.json --confirm
 *
 * Kullanım:
 *   cd backend
 *   npx ts-node --transpile-only scripts/ikiz-sablon-arsivle.ts               (kuru)
 *   npx ts-node --transpile-only scripts/ikiz-sablon-arsivle.ts --confirm     (uygula)
 *   npx ts-node --transpile-only scripts/ikiz-sablon-arsivle.ts --geri=DOSYA --confirm
 */
import 'dotenv/config';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';

const ESKI_ONEK = '[ESKİ-TİP-KİLİTLİ]';

type Tmpl = { id: number; name: string; active: boolean; type: string; categ_id: [number, string] | false };

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const confirm = process.argv.includes('--confirm');

function anahtar(ad: string): { key: string; eski: boolean } {
  let s = (ad || '').trim();
  const eski = s.startsWith(ESKI_ONEK);
  if (eski) s = s.slice(ESKI_ONEK.length).trim();
  return { key: s.replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR'), eski };
}

function parcala<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

async function geriAl(dosya: string) {
  const kayit = JSON.parse(fs.readFileSync(dosya, 'utf8')) as { arsivlenen: number[] };
  console.log(`Geri alınacak şablon: ${kayit.arsivlenen.length} (${dosya})`);
  if (!confirm) { console.log('--- KURU --- Uygulamak için --confirm ekle.'); return; }
  for (const p of parcala(kayit.arsivlenen, 100)) {
    await execute('product.template', 'write', [p, { active: true }], { context: { active_test: false } });
    const varyant = (await execute('product.product', 'search', [[['product_tmpl_id', 'in', p], ['active', '=', false]]], { context: { active_test: false } })) as number[];
    if (varyant.length) await execute('product.product', 'write', [varyant, { active: true }]);
  }
  console.log('GERİ ALINDI.');
}

async function main() {
  const geri = arg('geri');
  if (geri) return geriAl(geri);

  const hepsi = (await execute('product.template', 'search_read', [[]], {
    fields: ['id', 'name', 'active', 'type', 'categ_id'], order: 'id asc', context: { active_test: false },
  })) as Tmpl[];
  console.log(`Toplam şablon: ${hepsi.length}`);

  const gruplar = new Map<string, { t: Tmpl; eski: boolean }[]>();
  for (const t of hepsi) {
    const { key, eski } = anahtar(t.name);
    if (!key) continue;
    const g = gruplar.get(key) ?? [];
    g.push({ t, eski });
    gruplar.set(key, g);
  }

  const adaylar: { t: Tmpl; hedef: number; neden: string }[] = [];
  let ikiStoklu = 0;
  for (const g of gruplar.values()) {
    if (g.length < 2) continue;
    const hedefler = g.filter((x) => !x.eski && x.t.active && x.t.type === 'product');
    if (!hedefler.length) continue;
    if (hedefler.length > 1) ikiStoklu++;
    const hedef = hedefler[0].t.id;
    for (const x of g) {
      if (!x.t.active || x.t.type !== 'consu') continue;
      if (hedefler.some((h) => h.t.id === x.t.id)) continue;
      adaylar.push({ t: x.t, hedef, neden: x.eski ? 'ESKİ-TİP-KİLİTLİ' : 'consu ikiz' });
    }
  }
  console.log(`Arşiv adayı (stok tutan aktif ikizi olan): ${adaylar.length}`);

  // Güvenlik: stok / açık hareket kontrolü (varyant bazında)
  const atla = new Map<number, string>();
  for (const p of parcala(adaylar.map((a) => a.t.id), 200)) {
    const vars = (await execute('product.product', 'search_read', [[['product_tmpl_id', 'in', p]]], {
      fields: ['id', 'product_tmpl_id'], context: { active_test: false },
    })) as { id: number; product_tmpl_id: [number, string] }[];
    const v2t = new Map(vars.map((v) => [v.id, v.product_tmpl_id[0]]));
    const vids = vars.map((v) => v.id);
    if (!vids.length) continue;
    const quant = (await execute('stock.quant', 'search_read', [[['product_id', 'in', vids], ['quantity', '!=', 0], ['location_id.usage', '=', 'internal']]], {
      fields: ['product_id', 'quantity'],
    })) as { product_id: [number, string]; quantity: number }[];
    for (const q of quant) atla.set(v2t.get(q.product_id[0])!, `stokta ${q.quantity} adet var`);
    const hareket = (await execute('stock.move', 'search_read', [[['product_id', 'in', vids], ['state', 'not in', ['done', 'cancel']]]], {
      fields: ['product_id', 'state'],
    })) as { product_id: [number, string]; state: string }[];
    for (const h of hareket) atla.set(v2t.get(h.product_id[0])!, `açık stok hareketi (${h.state})`);
  }

  const arsivlenecek = adaylar.filter((a) => !atla.has(a.t.id));
  const atlanan = adaylar.filter((a) => atla.has(a.t.id));

  const katSay = new Map<string, number>();
  for (const a of arsivlenecek) {
    const k = a.t.categ_id ? a.t.categ_id[1].split(' / ').slice(0, 3).join(' / ') : '(kategorisiz)';
    katSay.set(k, (katSay.get(k) ?? 0) + 1);
  }
  console.log(`\n===== ARŞİVLENECEK: ${arsivlenecek.length}  (ESKİ-TİP: ${arsivlenecek.filter((a) => a.neden === 'ESKİ-TİP-KİLİTLİ').length}, consu ikiz: ${arsivlenecek.filter((a) => a.neden === 'consu ikiz').length})`);
  for (const [k, n] of [...katSay.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log('\nÖrnekler (ilk 30):');
  for (const a of arsivlenecek.slice(0, 30)) console.log(`  #${a.t.id} "${a.t.name}"  [${a.neden}]  → kalan: #${a.hedef}`);
  console.log(`\n===== ATLANAN (dokunulmayacak): ${atlanan.length}`);
  for (const a of atlanan.slice(0, 40)) console.log(`  #${a.t.id} "${a.t.name}" — ${atla.get(a.t.id)}`);
  if (ikiStoklu) console.log(`\nBilgi: ${ikiStoklu} isimde İKİ ayrı stok tutan aktif şablon var (bu script onlara dokunmaz).`);

  if (!confirm) {
    console.log('\n--- KURU --- Hiçbir şey değişmedi. Uygulamak için sonuna --confirm ekle.');
    return;
  }

  const ids = arsivlenecek.map((a) => a.t.id);
  const dosya = `/root/ikiz-arsiv-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(dosya, JSON.stringify({ tarih: new Date().toISOString(), arsivlenen: ids, detay: arsivlenecek.map((a) => ({ id: a.t.id, ad: a.t.name, neden: a.neden, kalan: a.hedef })) }, null, 1));
  console.log(`\nKayıt dosyası (geri alma için): ${dosya}`);
  let n = 0;
  for (const p of parcala(ids, 100)) {
    await execute('product.template', 'write', [p, { active: false }]);
    n += p.length;
    console.log(`  arşivlendi: ${n}/${ids.length}`);
  }
  console.log(`\nTAMAM — ${n} şablon arşivlendi.`);
}

main().catch((e) => {
  console.error('HATA', e instanceof Error ? e.message : e);
  process.exit(1);
});
