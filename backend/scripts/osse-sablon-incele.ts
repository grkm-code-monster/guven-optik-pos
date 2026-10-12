/**
 * "OSSE GÜNEŞ GÖZLÜĞÜ" için mükerrer açılmış şablonları (5000 limit
 * bug'ı yüzünden) tespit edip her birinin tam durumunu (varyantlar,
 * stok, lot, UTS, satış geçmişi var mı) raporlar. SALT OKUNUR — hiçbir
 * şey yazmaz. Birleştirme kararı verilmeden önce bilgi toplama amaçlı.
 *
 * Kullanım:
 *   npm run osse-sablon-incele
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const URUN_ADI = 'OSSE GÜNEŞ GÖZLÜĞÜ';

async function main() {
  const templates = (await execute(
    'product.template', 'search_read',
    [[['name', '=', URUN_ADI]]],
    { fields: ['id', 'name', 'categ_id', 'list_price', 'active'], limit: 50, context: { active_test: false } },
  )) as { id: number; name: string; categ_id: [number, string] | false; list_price: number; active: boolean }[];

  console.log(`"${URUN_ADI}" için ${templates.length} şablon bulundu:\n`);

  for (const t of templates) {
    console.log(`======================================================================`);
    console.log(`ŞABLON #${t.id} — ${t.active ? 'AKTİF' : 'ARŞİVLİ'} — kategori: ${t.categ_id ? t.categ_id[1] : '-'} — liste fiyatı: ${t.list_price}`);

    const variants = (await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', '=', t.id]]],
      { fields: ['id', 'barcode', 'default_code', 'product_template_attribute_value_ids', 'standard_price'], limit: 200, context: { active_test: false } },
    )) as { id: number; barcode: string | false; default_code: string | false; product_template_attribute_value_ids: number[]; standard_price: number }[];

    console.log(`  Varyant sayısı: ${variants.length}`);

    for (const v of variants) {
      const ptavs = v.product_template_attribute_value_ids?.length
        ? (await execute(
            'product.template.attribute.value', 'read',
            [v.product_template_attribute_value_ids],
            { fields: ['name'] },
          )) as { name: string }[]
        : [];
      const nitelik = ptavs.map((p) => p.name).join(' / ') || '(nitelik yok)';

      const quants = (await execute(
        'stock.quant', 'search_read',
        [[['product_id', '=', v.id], ['quantity', '>', 0]]],
        { fields: ['location_id', 'quantity', 'lot_id'], limit: 20 },
      )) as { location_id: [number, string]; quantity: number; lot_id: [number, string] | false }[];

      const toplamStok = quants.reduce((s, q) => s + q.quantity, 0);

      const satisVarMi = (await execute(
        'sale.order.line', 'search_count',
        [[['product_id', '=', v.id]]],
      )) as number;

      console.log(
        `    • #${v.id} [${nitelik}] barkod=${v.barcode || '-'} maliyet=${v.standard_price} ` +
        `toplam_stok=${toplamStok} satış_satırı=${satisVarMi}`,
      );
      for (const q of quants) {
        console.log(`        - ${q.location_id[1]}: ${q.quantity} adet${q.lot_id ? ` (lot #${q.lot_id[0]} ${q.lot_id[1]})` : ''}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
