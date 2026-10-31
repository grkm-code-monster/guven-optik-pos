/**
 * 31.10.2026 — Mağaza stok sayımı Excel'i için ürün kataloğu dökümü.
 * SALT OKUNUR: Odoo'da ve yerel DB'de hiçbir kaydı DEĞİŞTİRMEZ.
 *
 * Tüm aktif ürün varyantlarını (kategori, şablon, varyant nitelikleri,
 * barkod, ref, satış fiyatı, maliyet, KDV) ve tüm lot kayıtlarını
 * (ref / x_uts_kodu -> ürün) tek bir JSON olarak stdout'a basar.
 * Lotlar, camlarda gerçek tedarikçi GTIN'i -> ürün eşleşmesi ve
 * "bu UTS zaten sistemde var mı" kontrolü için kullanılır.
 *
 * Kullanım (Mac'ten, çıktı doğrudan Mac'e yazılır):
 *   ssh root@89.252.133.40 "cd /opt/guven-pos/backend && npx ts-node --transpile-only scripts/katalog-disa-aktar.ts" > ~/"claud calısma dosyası/katalog.json"
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { kategoriTespit } from '../src/utils/kategoriTespit';

async function main() {
  console.error('Kategoriler...');
  const kategoriler = (await execute('product.category', 'search_read', [[]], {
    fields: ['id', 'complete_name'],
  })) as { id: number; complete_name: string }[];
  const katYol = new Map(kategoriler.map((k) => [k.id, k.complete_name]));

  console.error('Varyantlar...');
  const urunler = (await execute('product.product', 'search_read', [[['sale_ok', '=', true]]], {
    fields: ['id', 'product_tmpl_id', 'categ_id', 'barcode', 'default_code', 'list_price',
      'standard_price', 'taxes_id', 'product_template_attribute_value_ids', 'type', 'tracking'],
    limit: 200000,
  })) as any[];
  console.error(`${urunler.length} varyant`);

  const ptavIds = Array.from(new Set(urunler.flatMap((u) => u.product_template_attribute_value_ids ?? [])));
  const ptav = new Map<number, { attr: string; val: string }>();
  for (let i = 0; i < ptavIds.length; i += 5000) {
    const parca = (await execute('product.template.attribute.value', 'read', [ptavIds.slice(i, i + 5000)], {
      fields: ['id', 'name', 'attribute_id'],
    })) as { id: number; name: string; attribute_id: [number, string] }[];
    for (const p of parca) ptav.set(p.id, { attr: p.attribute_id[1], val: p.name });
  }

  const vergiIds = Array.from(new Set(urunler.flatMap((u) => u.taxes_id ?? [])));
  const vergiler = vergiIds.length
    ? ((await execute('account.tax', 'read', [vergiIds], { fields: ['id', 'amount'] })) as { id: number; amount: number }[])
    : [];
  const vergi = new Map(vergiler.map((v) => [v.id, v.amount]));

  console.error('Lotlar...');
  const lotlar = (await execute('stock.lot', 'search_read', [[]], {
    fields: ['id', 'name', 'ref', 'x_uts_kodu', 'product_id'],
    limit: 500000,
  })) as any[];
  console.error(`${lotlar.length} lot`);

  const cikti = {
    olusturma: new Date().toISOString(),
    varyantlar: urunler.map((u) => {
      const yol = u.categ_id ? katYol.get(u.categ_id[0]) ?? u.categ_id[1] : '';
      return {
        id: u.id,
        tmplId: u.product_tmpl_id[0],
        sablon: u.product_tmpl_id[1],
        kategoriYolu: yol,
        kategori: kategoriTespit(yol),
        nitelikler: (u.product_template_attribute_value_ids ?? []).map((i: number) => ptav.get(i)).filter(Boolean),
        barkod: u.barcode || '',
        ref: u.default_code || '',
        satis: u.list_price,
        maliyet: u.standard_price,
        kdv: Array.from(new Set((u.taxes_id ?? []).map((t: number) => vergi.get(t)))),
        tip: u.type,
        takip: u.tracking,
      };
    }),
    lotlar: lotlar.map((l) => ({
      id: l.id,
      ad: l.name,
      ref: l.ref || '',
      uts: l.x_uts_kodu || '',
      urunId: l.product_id ? l.product_id[0] : null,
    })),
  };
  process.stdout.write(JSON.stringify(cikti));
  console.error('Bitti.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
