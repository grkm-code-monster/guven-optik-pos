/**
 * MYOSMART kategori teşhisi (salt okunur).
 *
 * "HOYA MYOSMART 1.59 BEYAZ UV" ürünü Ürün Yönetimi'nde kategori yolu
 * "All / OPTİK CAM / TEK ODAKLI / MİYOPİ / MYOSMART" olarak görünüyor, ama
 * satış ekranındaki (ItemsStep.tsx / saleKategoriTree.ts) sabit kategori
 * ağacında "MYOSMART" adlı bir düğüm yok — sadece "Miyopi Kontrol" (id 22) ve
 * "Myocare" (id 23) var. Bu script Odoo'da "MİYOPİ"/"MYOSMART" geçen tüm
 * product.category kayıtlarını listeler; buradan gerçek MYOSMART id'sini
 * bulup saleKategoriTree.ts'e yeni bir leaf olarak ekleyeceğiz.
 *
 * Çalıştırma: npm run myosmart-kategori-bul   (sunucuda, backend/ içinde)
 */
import { execute } from '../src/modules/odoo/odoo.service';

async function main() {
  const rows = (await execute('product.category', 'search_read', [
    ['|', ['name', 'ilike', 'MİYOPİ'], ['name', 'ilike', 'MYOSMART']],
  ], {
    fields: ['id', 'name', 'parent_id', 'complete_name'],
  })) ?? [];

  if (!rows.length) {
    console.log('Hiç kategori bulunamadı ("MİYOPİ" veya "MYOSMART" içeren).');
    return;
  }

  console.log(`${rows.length} kategori bulundu:\n`);
  for (const r of rows) {
    console.log(`id=${r.id}  ad="${r.name}"  tam_yol="${r.complete_name ?? ''}"  parent=${JSON.stringify(r.parent_id)}`);
  }

  // Bu kategorilerdeki ürün sayısını da göster (hangi kategoride kaç ürün var)
  console.log('\n--- Kategori başına ürün sayısı ---');
  for (const r of rows) {
    const templates = (await execute('product.template', 'search_read', [
      [['categ_id', '=', r.id]],
    ], { fields: ['id', 'name'], limit: 50 })) ?? [];
    console.log(`\nKategori "${r.name}" (id=${r.id}) — ${templates.length} şablon:`);
    for (const t of templates) {
      console.log(`  - ${t.name} (tmpl id=${t.id})`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('HATA:', err);
    process.exit(1);
  });
