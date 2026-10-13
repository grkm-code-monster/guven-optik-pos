/**
 * ACİL — ALLIGATOR OPTİK ÇERÇEVE (şablon #1984) için 2 yeni varyant açar:
 *   ALL146AO / C4 / 50
 *   ALL146AO / C112 / 50
 *
 * Bu şablonun 24 mevcut varyantı zaten "MODEL (Çoklu)/RENK (Çoklu)/ÖLÇÜ
 * (Çoklu)" DİNAMİK nitelik sisteminden geliyor (7 model, 11 renk, 4 ölçü
 * değeri, 22+ varyant bu yoldan başarıyla açılmış) — yani bu script,
 * "Ürün Yapılandırma" ekranının ZATEN KANITLANMIŞ ÇALIŞAN import
 * fonksiyonunu (importVaryantlarDinamikTekSablon) doğrudan, UI'den
 * geçmeden çağırıyor. Önceki "_unlink_or_archive" hatası, bu şablona daha
 * önce AYRI/ilgisiz bir Excel denemesinden (2140/3025 model kodları)
 * kaynaklanmış olabilir — ALL146AO/C4/C112 ile ilgisi yok.
 *
 * Kullanım:
 *   npm run alligator-acil-varyant-ac
 *   npm run alligator-acil-varyant-ac -- --execute
 */
import 'dotenv/config';
import { importVaryantlarDinamikTekSablon } from '../src/modules/admin/odoo-varyant-import-dinamik.service';
import type { VaryantImportSatir } from '../src/modules/admin/odoo-varyant-import.service';

const TEMPLATE_ID = 1984;
const EXECUTE = process.argv.includes('--execute');

const satirlar: VaryantImportSatir[] = [
  { index: 0, model: 'ALL146AO', renk: 'C4', olcu: '50', barkod: '', fiyat: 0 },
  { index: 1, model: 'ALL146AO', renk: 'C112', olcu: '50', barkod: '', fiyat: 0 },
];

async function main() {
  if (!EXECUTE) {
    console.log('DRY RUN: aşağıdaki 2 satır "dinamik tek şablon" yoluyla şablon #1984\'e açılacak:');
    for (const s of satirlar) console.log(`  - ${s.model} / ${s.renk} / ${s.olcu}`);
    console.log('\nGerçek çalıştırma için: npm run alligator-acil-varyant-ac -- --execute');
    return;
  }

  const sonuc = await importVaryantlarDinamikTekSablon(TEMPLATE_ID, satirlar);
  console.log(`Oluşturulan: ${sonuc.olusturulan}, zaten mevcut: ${sonuc.zatenMevcut}, hata: ${sonuc.hatalar.length}`);
  for (const r of sonuc.sonuclar) {
    console.log(`  • ${r.model}/${r.renk}/${r.olcu} → varyant #${r.varyantId} (${r.durum})`);
  }
  for (const h of sonuc.hatalar) {
    console.log(`  ✗ satır ${h.index}: ${h.sebep}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
