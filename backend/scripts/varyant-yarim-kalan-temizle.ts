/**
 * TEK SEFERLİK temizlik — bir şablonda, çökmüş/yarıda kalmış bir import
 * denemesinden kalan YARIM varyantları (yalnızca MODEL niteliği set edilmiş,
 * RENK ve/veya ÖLÇÜ'sü boş kalmış product.product kayıtlarını) bulur ve
 * (güvenliyse) siler.
 *
 * Arka plan: "Yeni şablon oluştur" sihirbazının eski (korumasız)
 * /odoo-varyant-import kodu, MODEL/RENK/ÖLÇÜ attribute satırlarını SIRAYLA
 * yazıyordu. Odoo, sadece MODEL satırı yazıldığı anda (RENK/ÖLÇÜ satırları
 * henüz yokken) o ana kadar eklenen tüm MODEL değerleri için otomatik olarak
 * birer "yarım" varyant üretiyor — sonra RENK/ÖLÇÜ satırları yazılmadan istek
 * timeout/hata ile kesilince bu yarım varyantlar Odoo'da kalıyor.
 *
 * Bu script SADECE stok/barkod/iç referansı olmayan, hiçbir satışta/siparişte
 * geçmeyen (isVaryantGuvenleSilinebilir ile aynı güvenlik kriterleri)
 * varyantları siler — gerçek, tamamlanmış varyantlara ASLA dokunmaz.
 *
 * Kullanım:
 *   cd backend
 *   npm run varyant-yarim-kalan-temizle -- --tmplId=12156              (dry-run)
 *   npm run varyant-yarim-kalan-temizle -- --tmplId=12156 --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { isVaryantGuvenleSilinebilir } from '../src/modules/admin/varyant-import-temizlik.service';

function parseArgs() {
  const tmplIdArg = process.argv.find((a) => a.startsWith('--tmplId='));
  const tmplId = tmplIdArg ? Number(tmplIdArg.split('=')[1]) : null;
  const executeMode = process.argv.includes('--execute');
  return { tmplId, executeMode };
}

async function main() {
  const { tmplId, executeMode } = parseArgs();
  if (!tmplId || !Number.isFinite(tmplId)) {
    console.log('Kullanım: npm run varyant-yarim-kalan-temizle -- --tmplId=12156 [--execute]');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log(`Yarım kalan varyant temizliği — Şablon #${tmplId}`);
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const tmpl = (await execute(
    'product.template', 'read', [[tmplId]], { fields: ['id', 'name'] },
  ) as { id: number; name: string }[])[0];
  if (!tmpl) {
    console.log('Şablon bulunamadı.');
    return;
  }
  console.log(`Şablon: ${tmpl.name}\n`);

  const variants = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', tmplId]]],
    {
      fields: ['id', 'default_code', 'barcode', 'product_template_attribute_value_ids'],
      limit: 20000,
    },
  ) as { id: number; default_code: string | false; barcode: string | false; product_template_attribute_value_ids: number[] }[];

  console.log(`Toplam varyant: ${variants.length}`);

  const allPtavIds = [...new Set(variants.flatMap((v) => v.product_template_attribute_value_ids ?? []))];
  const ptavlar = allPtavIds.length
    ? (await execute(
        'product.template.attribute.value', 'read', [allPtavIds],
        { fields: ['id', 'attribute_id'] },
      ) as { id: number; attribute_id: [number, string] }[])
    : [];
  const attrByPtavId = new Map(ptavlar.map((p) => [p.id, p.attribute_id[1]]));

  const yarimKalanlar: typeof variants = [];
  for (const v of variants) {
    const attrNames = new Set((v.product_template_attribute_value_ids ?? []).map((id) => attrByPtavId.get(id)));
    const hasModel = attrNames.has('MODEL');
    const hasRenk = attrNames.has('RENK');
    const hasOlcu = attrNames.has('ÖLÇÜ');
    // "Yarım" = MODEL var ama RENK veya ÖLÇÜ eksik (tam bir varyant her üçünü de içermeli)
    if (hasModel && (!hasRenk || !hasOlcu)) {
      yarimKalanlar.push(v);
    }
  }

  console.log(`Yarım kalan (MODEL var, RENK/ÖLÇÜ eksik) varyant: ${yarimKalanlar.length}\n`);

  if (!yarimKalanlar.length) {
    console.log('Temizlenecek bir şey yok.');
    return;
  }

  const silinebilir: number[] = [];
  const silinemez: { id: number; sebep: string }[] = [];

  for (const v of yarimKalanlar) {
    if (v.default_code || v.barcode) {
      silinemez.push({ id: v.id, sebep: 'İç referans veya barkod atanmış — güvenli değil' });
      continue;
    }
    const guvenli = await isVaryantGuvenleSilinebilir(v.id);
    if (guvenli) silinebilir.push(v.id);
    else silinemez.push({ id: v.id, sebep: 'Stok/satış/sipariş kaydı var — güvenli değil' });
  }

  console.log(`Güvenle silinebilir: ${silinebilir.length}`);
  console.log(`Silinemez (dokunulmadı): ${silinemez.length}`);
  for (const s of silinemez.slice(0, 20)) {
    console.log(`  #${s.id} — ${s.sebep}`);
  }

  if (!executeMode) {
    console.log('\nDry-run — hiçbir şey silinmedi. Uygulamak için sonuna --execute ekleyin.');
    return;
  }

  if (!silinebilir.length) {
    console.log('\nSilinecek güvenli kayıt yok.');
    return;
  }

  await execute('product.product', 'unlink', [silinebilir]);
  console.log(`\n✓ ${silinebilir.length} yarım kalan varyant silindi.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
