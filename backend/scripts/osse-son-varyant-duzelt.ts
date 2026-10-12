/**
 * osse-sablon-birlestir.ts çalışmasında tek bir varyant (#37937, OS3788OG
 * C3/55) stoğu önceki (hatalı) denemede zaten taşınmış olduğu için
 * "stok yok" diye atlandı ve barkod/maliyet kopyalanmadı — bu script o
 * tek eksik kopyalamayı tamamlar.
 *
 * Varsayılan: DRY RUN. Gerçek çalıştırma: --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const EXECUTE = process.argv.includes('--execute');

const KAYNAK_ID = 37937; // mükerrer varyant (şablon #13604, arşivli)
const HEDEF_ID = 36124; // kanonik varyant (şablon #12620)
const BARKOD = '8682037315573';
const MALIYET = 1099;

async function main() {
  const [kaynak] = (await execute(
    'product.product',
    'read',
    [[KAYNAK_ID]],
    { fields: ['barcode', 'standard_price'], context: { active_test: false } },
  )) as { barcode: string | false; standard_price: number }[];
  const [hedef] = (await execute(
    'product.product',
    'read',
    [[HEDEF_ID]],
    { fields: ['barcode', 'standard_price'] },
  )) as { barcode: string | false; standard_price: number }[];

  console.log(`Kaynak #${KAYNAK_ID}: barkod=${kaynak.barcode || '-'} maliyet=${kaynak.standard_price}`);
  console.log(`Hedef  #${HEDEF_ID}: barkod=${hedef.barcode || '-'} maliyet=${hedef.standard_price}`);

  if (kaynak.barcode !== BARKOD) {
    console.log(`! Beklenen barkod kaynakta yok, script'i çalıştırmıyorum.`);
    return;
  }
  if (hedef.barcode) {
    console.log(`! Hedefte zaten barkod var, muhtemelen daha önce düzeltilmiş. Çalıştırmıyorum.`);
    return;
  }

  console.log(`${EXECUTE ? 'Uygulanıyor' : '(planlanan)'}: kaynak barkodu temizle → hedefe barkod=${BARKOD} maliyet=${MALIYET} yaz.`);

  if (!EXECUTE) return;

  await execute('product.product', 'write', [[KAYNAK_ID], { barcode: false }]);
  await execute('product.product', 'write', [[HEDEF_ID], { barcode: BARKOD, standard_price: MALIYET }]);
  console.log('✓ Tamamlandı.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
