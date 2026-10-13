/**
 * "Ürün Yapılandırma" sayfasında şablon #1984 için varyant import'u
 * "_unlink_or_archive" hatasıyla patlıyor. Bu, Odoo'nun yeni nitelik
 * satırı yazıldığında eski "varsayılan" (niteliksiz) varyantı otomatik
 * silmeye/arşivlemeye çalışması ve o varyantın stok/satış referansı
 * olduğu için silinememesinden kaynaklanıyor olabilir.
 *
 * SALT OKUNUR — hiçbir şey yazmaz. Şablonun mevcut varyant(lar)ını ve
 * her birinin stok/satış/satınalma referansı olup olmadığını listeler.
 *
 * Kullanım:
 *   npm run sablon-1984-teshis
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const TEMPLATE_ID = Number(process.argv[2]) || 1984;

async function diagnoseTemplate(tmplId: number) {
  const [tmpl] = (await execute(
    'product.template',
    'read',
    [[tmplId]],
    { fields: ['id', 'name', 'active', 'attribute_line_ids'], context: { active_test: false } },
  )) as { id: number; name: string; active: boolean; attribute_line_ids: number[] }[];

  if (!tmpl) {
    console.log(`Şablon #${tmplId} bulunamadı.\n`);
    return;
  }

  console.log(`======================================================================`);
  console.log(`Şablon #${tmplId}: "${tmpl?.name}" — aktif: ${tmpl?.active}`);
  console.log(`Mevcut attribute_line_ids: ${JSON.stringify(tmpl?.attribute_line_ids)}\n`);

  const variants = (await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    {
      fields: ['id', 'default_code', 'barcode', 'active', 'product_template_attribute_value_ids'],
      context: { active_test: false },
    },
  )) as {
    id: number;
    default_code: string | false;
    barcode: string | false;
    active: boolean;
    product_template_attribute_value_ids: number[];
  }[];

  console.log(`Toplam varyant: ${variants.length}\n`);

  for (const v of variants) {
    const nitelikVar = (v.product_template_attribute_value_ids ?? []).length > 0;
    console.log(
      `• Varyant #${v.id} — aktif: ${v.active} — niteliksiz(varsayılan): ${!nitelikVar} — ` +
      `kod: ${v.default_code || '-'} — barkod: ${v.barcode || '-'}`,
    );

    const [quant, moveLine, saleLine, purchaseLine, mrpLine] = await Promise.all([
      execute('stock.quant', 'search_count', [[['product_id', '=', v.id]]]),
      execute('stock.move.line', 'search_count', [[['product_id', '=', v.id]]]),
      execute('sale.order.line', 'search_count', [[['product_id', '=', v.id]]]),
      execute('purchase.order.line', 'search_count', [[['product_id', '=', v.id]]]).catch(() => 0),
      execute('mrp.bom', 'search_count', [[['product_id', '=', v.id]]]).catch(() => 0),
    ]);

    console.log(
      `    stock.quant=${quant} stock.move.line=${moveLine} sale.order.line=${saleLine} ` +
      `purchase.order.line=${purchaseLine} mrp.bom=${mrpLine}`,
    );

    if (Number(quant) + Number(moveLine) + Number(saleLine) + Number(purchaseLine) + Number(mrpLine) > 0) {
      console.log(`    ⚠️  Bu varyantın referansı var — Odoo onu silemiyor, muhtemel kök neden BU.`);
    }
  }
}

async function main() {
  await diagnoseTemplate(TEMPLATE_ID);

  // "Import ile oluştur" akışı, bu ana şablonla aynı önekte DAHA ÖNCE
  // bölünmüş bir alt şablon varsa (örn. "{ad} 2140") eski "split by model"
  // yoluna gidiyor ve asıl yazma işlemi tmplId'nin KENDİSİNE değil, o alt
  // şablona yapılıyor olabilir. Onları da bulup teşhis edelim.
  const [tmpl] = (await execute(
    'product.template', 'read', [[TEMPLATE_ID]], { fields: ['name'] },
  )) as { name: string }[];
  if (tmpl?.name) {
    const siblings = (await execute(
      'product.template', 'search_read',
      [[['name', '=like', `${tmpl.name.trim()} %`]]],
      { fields: ['id', 'name'], limit: 50, context: { active_test: false } },
    )) as { id: number; name: string }[];
    if (siblings.length) {
      console.log(`\n"${tmpl.name}" öneki ile ${siblings.length} bölünmüş alt şablon bulundu — bunlar da inceleniyor:\n`);
      for (const s of siblings) await diagnoseTemplate(s.id);
    } else {
      console.log(`\n"${tmpl.name}" öneki ile bölünmüş alt şablon yok — "dinamik tek şablon" yolu kullanılmış olmalı.`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
