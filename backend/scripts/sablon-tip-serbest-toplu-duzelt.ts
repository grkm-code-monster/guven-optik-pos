/**
 * teshis-cam-tip-kilidi-toplu.ts'in bulduğu "SERBEST + cam/lens-benzeri"
 * (üzerinde hiç stok hareketi olmayan VE adı cam/lens formatına uyan)
 * şablonları TOPLU olarak type='product', detailed_type='product',
 * tracking='serial' yapar.
 *
 * GÜVENLİK: SADECE type != 'product' olan VE adı cam/lens formatına uyan
 * (bkz. cam-lens-isim-deseni.ts) şablonlara dokunur — "Göz Muayenesi",
 * "Kargo" gibi GERÇEK hizmet kalemlerine ASLA dokunmaz, stok hareketi
 * (kilitli) olanlara da dokunmaz (onlar için sablon-tip-kilidi-coz.ts
 * kullanılmalı, tek tek --tmpl=ID ile).
 *
 * Varsayılan: dry-run (sadece ne yapılacağını listeler).
 * Gerçekten uygulamak için --confirm ekle.
 *
 * Kullanım:
 *   cd backend
 *   npm run sablon-tip-serbest-toplu-duzelt            (dry-run)
 *   npm run sablon-tip-serbest-toplu-duzelt -- --confirm
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { CAM_LENS_ISIM_DESENI } from './cam-lens-isim-deseni';

type Tmpl = {
  id: number;
  name: string;
  type: string;
  detailed_type: string;
  tracking: string;
  categ_id: [number, string] | false;
};

async function main() {
  const confirm = process.argv.includes('--confirm');

  const bozuk = (await execute(
    'product.template', 'search_read',
    [[['type', '!=', 'product']]],
    {
      fields: ['id', 'name', 'type', 'detailed_type', 'tracking', 'categ_id'],
      limit: 5000,
      context: { active_test: false },
    },
  )) as Tmpl[];

  const adaylar = bozuk.filter(
    (t) => !t.name.startsWith('[ESKİ-TİP-KİLİTLİ]') && CAM_LENS_ISIM_DESENI.test(t.name),
  );

  if (!adaylar.length) {
    console.log('Cam/lens-benzeri isimli, type != product olan hiçbir şablon yok.');
    return;
  }

  console.log(`${adaylar.length} aday şablon bulundu (type != 'product', cam/lens-benzeri isim). Stok hareketi kontrol ediliyor...\n`);

  const varyantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', 'in', adaylar.map((t) => t.id)]]],
    { fields: ['id', 'product_tmpl_id'], limit: 20000, context: { active_test: false } },
  )) as { id: number; product_tmpl_id: [number, string] }[];
  const varyantIdToTmplId = new Map<number, number>();
  for (const v of varyantlar) varyantIdToTmplId.set(v.id, v.product_tmpl_id[0]);

  const hareketliTmplIdSet = new Set<number>();
  if (varyantlar.length) {
    const moves = (await execute(
      'stock.move', 'search_read',
      [[['product_id', 'in', varyantlar.map((v) => v.id)]]],
      { fields: ['product_id'], limit: 50000, context: { active_test: false } },
    )) as { product_id: [number, string] }[];
    for (const m of moves) {
      const tmplId = varyantIdToTmplId.get(m.product_id[0]);
      if (tmplId) hareketliTmplIdSet.add(tmplId);
    }
  }

  const serbest = adaylar.filter((t) => !hareketliTmplIdSet.has(t.id));
  const kilitli = adaylar.filter((t) => hareketliTmplIdSet.has(t.id));

  console.log(`${serbest.length} şablon SERBEST (düzeltilecek), ${kilitli.length} şablon KİLİTLİ (atlanacak — sablon-tip-kilidi-coz.ts kullan).\n`);

  for (const t of serbest) {
    console.log(`#${t.id} "${t.name}" [${t.categ_id ? t.categ_id[1] : '-'}]  ${t.type}/${t.detailed_type}/${t.tracking} -> product/product/serial`);
  }
  if (kilitli.length) {
    console.log('\nKİLİTLİ olup atlanacaklar:');
    for (const t of kilitli) {
      console.log(`  npm run sablon-tip-kilidi-coz -- --tmpl=${t.id} --confirm`);
    }
  }

  if (!confirm) {
    console.log('\n--- DRY-RUN --- Gerçekten uygulamak için sonuna --confirm ekleyip tekrar çalıştır.');
    return;
  }

  console.log('\nUygulanıyor...');
  for (const t of serbest) {
    try {
      await execute('product.template', 'write', [[t.id], {
        type: 'product',
        detailed_type: 'product',
        tracking: 'serial',
      }]);
      console.log(`  #${t.id} "${t.name}" -> OK`);
    } catch (e: unknown) {
      console.log(`  #${t.id} "${t.name}" -> HATA: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log('\nBitti.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
