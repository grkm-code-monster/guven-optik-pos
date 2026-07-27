/**
 * Stok Kontrol — RENK etiketi + lot/UTS testleri
 * npx ts-node --transpile-only backend/scripts/test-stok-kontrol-renk-lot.ts
 */
import 'dotenv/config';
import { listStokKontrol } from '../src/modules/admin/stok-yonetimi.service';
import { searchUrunLotsByProduct } from '../src/modules/transfer/transfer.service';

const OPTELLI_VARIANTS = [
  { id: 5621, barcode: '8682037201630' },
  { id: 5623, barcode: '8682037200190' },
  { id: 5626, barcode: '8682037201319' },
];

async function main() {
  console.log('=== TEST 1: OPTELLİ varyantlarında RENK (C6-5) görünür ===');
  let pass1 = true;
  for (const v of OPTELLI_VARIANTS) {
    const rows = await listStokKontrol({ q: v.barcode });
    const row = rows.find((r) => r.productId === v.id);
    const ad = row?.urunAdi ?? '';
    const hasRenk = ad.includes('C6-5');
    const hasModel = ad.includes('OP11854') || ad.includes('OP118') || ad.includes('(');
    console.log(`  ${v.id} (${v.barcode}): ${ad}`);
    console.log(`    RENK C6-5: ${hasRenk ? 'OK' : 'HATA'}`);
    if (!hasRenk) pass1 = false;
    if (!row) {
      console.log('    Ürün bulunamadı: HATA');
      pass1 = false;
    }
  }
  console.log(`  Sonuç: ${pass1 ? 'OK' : 'HATA'}`);

  console.log('\n=== TEST 2-3: Lot/UTS — stoklu şubelerde lot sorgusu ===');
  const sample = OPTELLI_VARIANTS[0];
  const kontrol = await listStokKontrol({ q: sample.barcode });
  const urun = kontrol.find((r) => r.productId === sample.id);
  if (!urun) {
    console.log('  Örnek ürün bulunamadı — atlandı');
  } else {
    const stokluSubeler = urun.lokasyonlar.filter((l) => l.miktar > 0);
    console.log(`  Ürün ${urun.productId}, stoklu şube sayısı: ${stokluSubeler.length}`);
    const allLots: Array<{ sube: string; lotNo: string; stok: number; utsKodu: string | null; utsDurumu: string }> = [];
    for (const sube of stokluSubeler) {
      const lots = await searchUrunLotsByProduct(urun.productId, sube.kod);
      for (const lot of lots) {
        allLots.push({
          sube: sube.kod,
          lotNo: lot.lotNo ?? '—',
          stok: Number(lot.stok) || 0,
          utsKodu: lot.utsKodu ?? null,
          utsDurumu: lot.utsDurumu ?? '—',
        });
      }
    }
    if (allLots.length) {
      console.log('  Lot kayıtları:');
      for (const l of allLots.slice(0, 10)) {
        console.log(`    ${l.sube} | ${l.lotNo} | miktar=${l.stok} | UTS=${l.utsKodu ?? '—'} | durum=${l.utsDurumu}`);
      }
      console.log(`  Toplam lot satırı: ${allLots.length} — OK (endpoint çalışıyor)`);
      if (stokluSubeler.length > 1) {
        const subeler = new Set(allLots.map((l) => l.sube));
        console.log(`  Çoklu şube lotları: ${subeler.size} şube — ${subeler.size >= 2 ? 'OK' : 'tek şube (stok tek yerde olabilir)'}`);
      }
    } else {
      console.log('  Stoklu şubede lot döndürülmedi — lot/UTS kaydı yok veya tracking kapalı (TEST 4 senaryosu)');
    }
  }

  console.log('\n=== TEST 4: Lot/UTS kaydı olmayan ürün (tracking none) ===');
  const noLot = await listStokKontrol({ q: 'test', stokDurumu: 'var' });
  const candidate = noLot.find((u) => u.toplamStok > 0);
  if (candidate) {
    const subeler = candidate.lokasyonlar.filter((l) => l.miktar > 0).slice(0, 2);
    let totalLots = 0;
    for (const s of subeler) {
      const lots = await searchUrunLotsByProduct(candidate.productId, s.kod);
      totalLots += lots.length;
    }
    console.log(`  Örnek: ${candidate.urunAdi.slice(0, 60)} (${candidate.productId})`);
    console.log(`  Lot satırı: ${totalLots} — ${totalLots === 0 ? 'boş mesaj senaryosu OK' : 'lot var'}`);
  } else {
    console.log('  Uygun aday bulunamadı — manuel doğrulama gerekir');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
