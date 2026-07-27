/**
 * Arşivlenmiş Ürünler sekmesi — API davranış testleri
 * npx ts-node --transpile-only backend/scripts/test-arsivlenmis-urunler-sekmesi.ts
 */
import 'dotenv/config';
import { listStokUrunleri, topluUrunArsivdenCikar, topluUrunArsivle } from '../src/modules/admin/stok-yonetimi.service';

const OPTELLI_TMPL = 1950;

async function main() {
  console.log('=== TEST 1: durum=arsiv doğrudan arşiv listesi ===');
  const arsivOnce = await listStokUrunleri({ durum: 'arsiv', q: 'OPTELLİ', limit: 50 });
  console.log(`  Arşivde OPTELLİ: ${arsivOnce.data.length} şablon`);
  for (const u of arsivOnce.data.slice(0, 5)) {
    console.log(`    - ${u.id} ${u.urunAdi}`);
  }

  console.log('\n=== TEST 2-3: Arşivle → arşiv listesinde gör → çıkar → aktif listesinde gör ===');
  const aktifOnce = await listStokUrunleri({ durum: 'aktif', q: 'OPTELLİ', limit: 50 });
  const optelliAktif = aktifOnce.data.find((u) => u.id === OPTELLI_TMPL);
  console.log(`  Aktif listede OPTELLİ (1950): ${optelliAktif ? 'var' : 'yok'}`);

  if (optelliAktif) {
    await topluUrunArsivle([OPTELLI_TMPL]);
    const arsivSonra = await listStokUrunleri({ durum: 'arsiv', q: 'OPTELLİ', limit: 50 });
    const arsivde = arsivSonra.data.some((u) => u.id === OPTELLI_TMPL);
    console.log(`  Arşivleme sonrası arşiv listesinde: ${arsivde ? 'OK' : 'HATA'}`);

    const aktifSonra = await listStokUrunleri({ durum: 'aktif', q: 'OPTELLİ', limit: 50 });
    const aktifdeDegil = !aktifSonra.data.some((u) => u.id === OPTELLI_TMPL);
    console.log(`  Aktif listeden çıktı: ${aktifdeDegil ? 'OK' : 'HATA'}`);

    await topluUrunArsivdenCikar([OPTELLI_TMPL]);
    const aktifGeri = await listStokUrunleri({ durum: 'aktif', q: 'OPTELLİ', limit: 50 });
    const geriGeldi = aktifGeri.data.some((u) => u.id === OPTELLI_TMPL);
    console.log(`  Arşivden çıkarınca aktif listede: ${geriGeldi ? 'OK' : 'HATA'}`);
  } else if (arsivOnce.data.some((u) => u.id === OPTELLI_TMPL)) {
    console.log('  OPTELLİ zaten arşivde — arşivden çıkarma testi');
    await topluUrunArsivdenCikar([OPTELLI_TMPL]);
    const aktifGeri = await listStokUrunleri({ durum: 'aktif', q: 'OPTELLİ', limit: 50 });
    console.log(`  Aktif listede: ${aktifGeri.data.some((u) => u.id === OPTELLI_TMPL) ? 'OK' : 'HATA'}`);
    await topluUrunArsivle([OPTELLI_TMPL]);
    console.log('  (OPTELLİ tekrar arşivlendi — önceki duruma döndürüldü)');
  } else {
    console.log('  OPTELLİ bulunamadı — atlandı');
  }

  console.log('\n=== TEST 4: Aktif varsayılan liste (regresyon) ===');
  const aktifVarsayilan = await listStokUrunleri({ durum: 'aktif', limit: 5 });
  console.log(`  Aktif ürün sayfası yüklendi: ${aktifVarsayilan.data.length} kayıt — OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
