/**
 * TEK SEFERLİK sıfırlama — bir şablonun MODEL/RENK/ÖLÇÜ ile ilgili TÜM
 * varyantlarını ve attribute satırlarını temizler, şablonu "Import ile
 * oluştur" ile sıfırdan denemeye hazır, tertemiz bir duruma getirir.
 *
 * Arka plan: eski (korumasız) kodun art arda çökmesi, "SWING GÜNEŞ GÖZLÜĞÜ"
 * (#12156) şablonuna hem yarım kalmış varyantlar hem de MODEL attribute
 * satırında onlarca kalıntı değer bıraktı. Bu kalıntı değerler, artık
 * düzeltilmiş kod bile çalışsa, YENİ bir küçük test importunda dahi Odoo'nun
 * (mevcut MODEL değerleri) × (yeni RENK) × (yeni ÖLÇÜ) kartezyen çarpımını
 * anında üretmesine sebep oluyordu. Bu script şablonu component olarak
 * SIFIRLIYOR: TÜM varyantları (güvenlik kontrolüyle) siler, MODEL/RENK/ÖLÇÜ
 * attribute satırlarını komple kaldırır.
 *
 * NOT: Bu script SADECE stok/barkod/satışı olmayan (yani zaten "çöp" test/
 * kalıntı) varyantları siler; gerçek, satışı/stoğu olan bir varyant bulunursa
 * DURUR ve hiçbir şey silmeden raporlar.
 *
 * Kullanım:
 *   cd backend
 *   npm run sablon-model-renk-olcu-sifirla -- --tmplId=12156              (dry-run)
 *   npm run sablon-model-renk-olcu-sifirla -- --tmplId=12156 --execute
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
    console.log('Kullanım: npm run sablon-model-renk-olcu-sifirla -- --tmplId=12156 [--execute]');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log(`Şablon sıfırlama (MODEL/RENK/ÖLÇÜ) — Şablon #${tmplId}`);
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
    { fields: ['id', 'default_code', 'barcode'], limit: 20000 },
  ) as { id: number; default_code: string | false; barcode: string | false }[];

  console.log(`Toplam varyant: ${variants.length}`);

  const silinebilir: number[] = [];
  const silinemez: { id: number; sebep: string }[] = [];
  for (const v of variants) {
    if (v.default_code || v.barcode) {
      silinemez.push({ id: v.id, sebep: 'İç referans veya barkod atanmış' });
      continue;
    }
    const guvenli = await isVaryantGuvenleSilinebilir(v.id);
    if (guvenli) silinebilir.push(v.id);
    else silinemez.push({ id: v.id, sebep: 'Stok/satış/sipariş kaydı var' });
  }

  console.log(`Güvenle silinebilir varyant: ${silinebilir.length}`);
  console.log(`GÜVENLİ OLMAYAN (dokunulmayacak): ${silinemez.length}`);
  for (const s of silinemez.slice(0, 20)) {
    console.log(`  #${s.id} — ${s.sebep}`);
  }

  if (silinemez.length > 0) {
    console.log('\n⚠ Bu şablonda güvenle silinemeyecek gerçek varyant(lar) var.');
    console.log('  Attribute satırları TEMİZLENMEYECEK (karışıklık riski) — sadece güvenli varyantlar silinecek.');
  }

  const nitelikler = await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']]]],
    { fields: ['id', 'name'] },
  ) as { id: number; name: string }[];
  const attrIds = nitelikler.map((n) => n.id);

  const lines = attrIds.length
    ? (await execute(
        'product.template.attribute.line', 'search_read',
        [[['product_tmpl_id', '=', tmplId], ['attribute_id', 'in', attrIds]]],
        { fields: ['id', 'attribute_id', 'value_ids'] },
      ) as { id: number; attribute_id: [number, string]; value_ids: number[] }[])
    : [];

  console.log(`\nMODEL/RENK/ÖLÇÜ attribute satırı: ${lines.length}`);
  for (const l of lines) {
    console.log(`  ${l.attribute_id[1]}: ${l.value_ids.length} değer`);
  }

  if (!executeMode) {
    console.log('\nDry-run — hiçbir şey silinmedi. Uygulamak için sonuna --execute ekleyin.');
    return;
  }

  if (silinebilir.length) {
    await execute('product.product', 'unlink', [silinebilir]);
    console.log(`\n✓ ${silinebilir.length} varyant silindi.`);
  }

  if (silinemez.length === 0 && lines.length) {
    const lineIds = lines.map((l) => l.id);
    await execute('product.template.attribute.line', 'unlink', [lineIds]);
    console.log(`✓ ${lineIds.length} MODEL/RENK/ÖLÇÜ attribute satırı kaldırıldı — şablon tertemiz.`);
  } else if (silinemez.length > 0) {
    console.log('\nAttribute satırları KORUNDU (güvenli olmayan gerçek varyant(lar) olduğu için).');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
