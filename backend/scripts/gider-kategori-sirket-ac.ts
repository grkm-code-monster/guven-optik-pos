/**
 * TEK SEFERLİK düzeltme — Gider (Masraf) kategorileri (can_be_expensed=true
 * product.template kayıtları) tek bir şirkete kilitli olduğu için, o
 * şirkette olmayan çalışanlar gider/kasa sıfırlama kaydı açamıyordu
 * ("Uyumsuz şirket kayıtları" XML-RPC hatası — örnek: KASA SIFIRLAMA +
 * İlker YOLCU).
 *
 * Bu script TÜM can_be_expensed=true ürünlerin company_id alanını
 * temizler (boş = "Tüm şirketler"), böylece hangi şirkete kayıtlı
 * olursa olsun her çalışan her gider kategorisini kullanabilir.
 *
 * Kullanım:
 *   cd backend
 *   npm run gider-kategori-sirket-ac              (dry-run)
 *   npm run gider-kategori-sirket-ac -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  return { executeMode: process.argv.includes('--execute') };
}

async function main() {
  const { executeMode } = parseArgs();
  console.log('='.repeat(70));
  console.log('Gider kategorilerini tüm şirketlere açma');
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const urunler = (await execute(
    'product.template', 'search_read',
    [[['can_be_expensed', '=', true]]],
    { fields: ['id', 'name', 'company_id'], limit: 500, context: { active_test: false } },
  )) as Array<{ id: number; name: string; company_id: [number, string] | false }>;

  const sirketliOlanlar = urunler.filter((u) => u.company_id);
  const zatenAcikOlanlar = urunler.filter((u) => !u.company_id);

  console.log(`Toplam gider kategorisi: ${urunler.length}`);
  console.log(`Zaten tüm şirketlere açık: ${zatenAcikOlanlar.length}`);
  console.log(`Tek şirkete kilitli (düzeltilecek): ${sirketliOlanlar.length}\n`);

  for (const u of sirketliOlanlar) {
    console.log(`  #${u.id} ${u.name} — şu an: ${u.company_id ? u.company_id[1] : '-'}`);
  }

  if (!executeMode) {
    console.log('\nDry-run — hiçbir şey yazılmadı. Uygulamak için: npm run gider-kategori-sirket-ac -- --execute');
    return;
  }

  if (!sirketliOlanlar.length) {
    console.log('\nDüzeltilecek kayıt yok.');
    return;
  }

  console.log('\n--- Uygulanıyor ---');
  const ids = sirketliOlanlar.map((u) => u.id);
  await execute('product.template', 'write', [ids, { company_id: false }]);
  console.log(`${ids.length} gider kategorisi tüm şirketlere açıldı.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
