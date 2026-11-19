/**
 * 19.11.2026 — "OPTİK CAM" ve "LENS" kategorilerinde Odoo kartı "sarf" (type=consu) kalmış ürünleri
 * TEK SEFERDE stoklu ürüne (type=product, takip=seri no) çevirir.
 *
 * Neden doğrudan veritabanı: Odoo, geçmişte hareketi olan kartın tipini arayüzden/ORM'den
 * değiştirmeye izin vermiyor. Eski yöntem (kopya kart + eskisini arşivle) kart numarasını
 * değiştirdiği için bekleyen siparişler / eşleştirme hafızası eski karta bakmaya devam ediyordu
 * (Erol Güldağ karışıklığı). Burada kart numarası AYNI kalır, sadece tipi değişir.
 *
 * Etkisi: sarfken girilmiş ürünlerin Odoo'da stok adedi zaten yoktu; çevirme sonrası 0 görünür.
 * Fiziki stok sayımla girilir. Bundan sonraki girişler adetli olur, sipariş transferleri çalışır.
 *
 * Kapsam dışı: arşivli kartlar, "[ESKİ-TİP-KİLİTLİ]" kartlar, aynı adda aktif stoklu ikizi olanlar
 * (çift kart olmasın diye listelenir, dokunulmaz).
 *
 *   npx ts-node --transpile-only scripts/odoo-sarf-cam-stoklu.ts            → kuru (rapor)
 *   npx ts-node --transpile-only scripts/odoo-sarf-cam-stoklu.ts --sql      → SQL dosyası yazar (uygula sarmalayıcısı çalıştırır)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { execute } from '../src/modules/odoo/odoo.service';

const SQL = process.argv.includes('--sql');
const CTX = { context: { active_test: false } };
const KOK_KATEGORILER = ['All / OPTİK CAM', 'All / LENS'];

type T = { id: number; name: string; type: string; tracking: string; active: boolean; categ_id: [number, string] | false };

async function main() {
  const kokler = (await execute('product.category', 'search_read', [[['complete_name', 'in', KOK_KATEGORILER]]], { fields: ['id', 'complete_name'] })) as Array<{ id: number; complete_name: string }>;
  if (kokler.length !== KOK_KATEGORILER.length) throw new Error(`Kök kategoriler bulunamadı: ${kokler.map((k) => k.complete_name).join(', ')}`);
  const tumu = (await execute('product.template', 'search_read', [[['categ_id', 'child_of', kokler.map((k) => k.id)]]], {
    fields: ['id', 'name', 'type', 'tracking', 'active', 'categ_id'], limit: 100000, ...CTX,
  })) as T[];
  const aktifStoklu = new Map<string, number>();
  for (const t of tumu) if (t.active && t.type === 'product') aktifStoklu.set(t.name.trim(), t.id);
  const sarf = tumu.filter((t) => t.type !== 'product');
  const arsiv = sarf.filter((t) => !t.active || t.name.startsWith('[ESKİ-TİP-KİLİTLİ]'));
  const aday = sarf.filter((t) => t.active && !t.name.startsWith('[ESKİ-TİP-KİLİTLİ]'));
  const ikizli = aday.filter((t) => aktifStoklu.has(t.name.trim()));
  const cevrilecek = aday.filter((t) => !aktifStoklu.has(t.name.trim()));

  console.log(`Kategoriler: ${KOK_KATEGORILER.join(' + ')} — toplam kart ${tumu.length}`);
  console.log(`  zaten stoklu: ${tumu.length - sarf.length}`);
  console.log(`  sarf/hizmet ama arşivli ya da [ESKİ-TİP-KİLİTLİ] (dokunulmaz): ${arsiv.length}`);
  console.log(`  sarf + aynı adda aktif stoklu ikizi var (dokunulmaz, listelenir): ${ikizli.length}`);
  console.log(`  ÇEVRİLECEK: ${cevrilecek.length}`);

  const tipSay = new Map<string, number>();
  const katSay = new Map<string, number>();
  for (const t of cevrilecek) {
    tipSay.set(`${t.type}/${t.tracking}`, (tipSay.get(`${t.type}/${t.tracking}`) ?? 0) + 1);
    const k = t.categ_id ? t.categ_id[1].split(' / ').slice(0, 4).join(' / ') : '-';
    katSay.set(k, (katSay.get(k) ?? 0) + 1);
  }
  console.log('\nÇevrilecekler — şimdiki tip/takip:');
  for (const [k, n] of tipSay) console.log(`  ${n} | ${k}`);
  console.log('\nÇevrilecekler — kategori:');
  for (const [k, n] of [...katSay.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)} | ${k}`);
  const hizmet = cevrilecek.filter((t) => t.type === 'service');
  if (hizmet.length) {
    console.log(`\n⚠️ HİZMET tipinde ${hizmet.length} kart var (çevrilecekler arasında) — ilk 15:`);
    for (const t of hizmet.slice(0, 15)) console.log(`  #${t.id} ${t.name} | ${t.categ_id ? t.categ_id[1] : '-'}`);
  }
  if (ikizli.length) {
    console.log(`\nİkizi olan (dokunulmayan) ilk 15:`);
    for (const t of ikizli.slice(0, 15)) console.log(`  #${t.id} ${t.name} → aktif stoklu #${aktifStoklu.get(t.name.trim())}`);
  }

  // Açık (tamamlanmamış) stok hareketi olanlar — çevirmeden önce bilinmeli
  const ids = cevrilecek.map((t) => t.id);
  let acikHareket = 0;
  for (let i = 0; i < ids.length; i += 2000) {
    acikHareket += Number(await execute('stock.move', 'search_count', [[['product_id.product_tmpl_id', 'in', ids.slice(i, i + 2000)], ['state', 'not in', ['done', 'cancel']]]], CTX));
  }
  console.log(`\nAçık (taslak/bekleyen) stok hareketi: ${acikHareket}${acikHareket ? ' — bunlar çevirme sonrası "stok yok" uyarısı verebilir' : ''}`);

  if (SQL) {
    const sadeceSarf = cevrilecek.filter((t) => t.type === 'consu').map((t) => t.id);
    const dosya = `/root/sarf-cam-stoklu-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    const sql = [
      'BEGIN;',
      `CREATE TABLE IF NOT EXISTS zz_sarf_stoklu_yedek AS SELECT id, type, detailed_type, tracking, now() AS yedek_zamani FROM product_template WHERE false;`,
      `INSERT INTO zz_sarf_stoklu_yedek SELECT id, type, detailed_type, tracking, now() FROM product_template WHERE id IN (${sadeceSarf.join(',') || 0}) AND type = 'consu';`,
      `UPDATE product_template SET type = 'product', detailed_type = 'product', tracking = 'serial', write_date = now() WHERE id IN (${sadeceSarf.join(',') || 0}) AND type = 'consu';`,
      'COMMIT;',
    ].join('\n');
    fs.writeFileSync(dosya, sql);
    console.log(`\nSQL yazıldı (${sadeceSarf.length} sarf kart; hizmet tipindekilere dokunulmaz): ${dosya}`);
    console.log(`SQLDOSYA=${dosya}`);
  } else console.log('\n--- KURU --- Hiçbir şey değişmedi.');
}
main().catch((e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
});
