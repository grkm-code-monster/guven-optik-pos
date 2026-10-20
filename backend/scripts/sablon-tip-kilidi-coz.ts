/**
 * Odoo, bir ürünün (product.template) GEÇMİŞTE herhangi bir stok hareketi
 * olduysa (done dahi olsa) type alanının bir daha DEĞİŞTİRİLMESİNE izin
 * vermiyor ("Halihazırda kullanılmış olan bir ürünün türünü
 * değiştiremezsiniz."). Bu yüzden mevcut şablonu düzeltmek mümkün değil.
 *
 * Bu script, eski şablonun TÜM diğer alanlarını (kategori, fiyat, vergi,
 * birim vb.) birebir kopyalayıp sadece type='product' ve tracking='serial'
 * olan YENİ bir şablon oluşturur (Odoo'nun kendi copy() metodu ile — barkod
 * çakışmasını önlemek için yeni varyantın barkodu boş bırakılır, import akışı
 * zaten ilk satırda otomatik temsilci barkod atıyor). Eski şablon silinmez,
 * sadece adının başına "[ESKİ-TİP-KİLİTLİ]" eklenir ki artık ad bazlı
 * aramalarda karışıklık yaratmasın (storable tercih mantığı zaten yeni
 * şablonu seçecektir, bu ekstra bir netlik tedbiri).
 *
 * ÖNEMLİ: Varsayılan olarak sadece NE YAPILACAĞINI gösterir (dry-run).
 * Gerçekten uygulamak için --confirm ekle.
 *
 * Kullanım:
 *   cd backend
 *   npm run sablon-tip-kilidi-coz -- --tmpl=3816            (önce dry-run)
 *   npm run sablon-tip-kilidi-coz -- --tmpl=3816 --confirm  (gerçekten uygula)
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const tmplArg = process.argv.find((a) => a.startsWith('--tmpl='));
  const tmpl = tmplArg ? Number(tmplArg.split('=')[1]) : null;
  const confirm = process.argv.includes('--confirm');
  return { tmpl, confirm };
}

async function main() {
  const { tmpl, confirm } = parseArgs();
  if (!tmpl) {
    console.log('Kullanım: npm run sablon-tip-kilidi-coz -- --tmpl=3816 [--confirm]');
    process.exit(1);
  }

  const tmplData = (await execute(
    'product.template', 'read', [[tmpl]],
    { fields: ['id', 'name', 'type', 'tracking', 'categ_id', 'list_price', 'standard_price'], context: { active_test: false } },
  )) as { id: number; name: string; type: string; tracking: string; categ_id: [number, string] | false; list_price: number; standard_price: number }[];
  if (!tmplData.length) {
    console.log(`Şablon #${tmpl} bulunamadı.`);
    return;
  }
  console.log('ESKİ ŞABLON:', JSON.stringify(tmplData[0]));

  if (tmplData[0].type === 'product' && tmplData[0].tracking === 'serial') {
    console.log('Bu şablon zaten type=product, tracking=serial — hiçbir şey yapılmadı.');
    return;
  }

  console.log(`\nYapılacaklar:
  1) "${tmplData[0].name}" şablonunun bir KOPYASI oluşturulacak (aynı kategori/fiyat/vergi vb.), ama type='product', tracking='serial', barkod boş.
  2) Eski şablon #${tmpl} silinmeyecek, sadece adı "[ESKİ-TİP-KİLİTLİ] ${tmplData[0].name}" olarak değiştirilecek.
  3) Yeni şablonun id'si ve yeni varyant id'si raporlanacak.`);

  if (!confirm) {
    console.log('\n--- DRY-RUN --- Gerçekten uygulamak için sonuna --confirm ekleyip tekrar çalıştır.');
    return;
  }

  const yeniTmplId = Number(await execute('product.template', 'copy', [[tmpl], {
    type: 'product',
    tracking: 'serial',
    barcode: false,
  }]));
  console.log(`\nYeni şablon oluşturuldu: #${yeniTmplId}`);

  const yeniVaryantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', yeniTmplId]]],
    { fields: ['id', 'barcode', 'active'], context: { active_test: false } },
  )) as { id: number; barcode: string | false; active: boolean }[];
  console.log('Yeni varyant(lar):', JSON.stringify(yeniVaryantlar));

  await execute('product.template', 'write', [[tmpl], { name: `[ESKİ-TİP-KİLİTLİ] ${tmplData[0].name}` }]);
  console.log(`Eski şablon #${tmpl} adı güncellendi -> "[ESKİ-TİP-KİLİTLİ] ${tmplData[0].name}"`);

  const yeniTmplData = (await execute(
    'product.template', 'read', [[yeniTmplId]],
    { fields: ['id', 'name', 'type', 'tracking'], context: { active_test: false } },
  )) as { id: number; name: string; type: string; tracking: string }[];
  console.log('\nYENİ ŞABLON (güncel):', JSON.stringify(yeniTmplData[0]));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
