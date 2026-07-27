/**
 * ULTRA lens — listStokKontrol + lot panel simülasyonu
 */
import 'dotenv/config';
import { listStokKontrol } from '../src/modules/admin/stok-yonetimi.service';
import { searchUrunLotsByProduct } from '../src/modules/transfer/transfer.service';

async function main() {
  const rows = await listStokKontrol({ q: 'ULTRA KONTAKT', stokDurumu: 'var' });
  console.log(`listStokKontrol: ${rows.length} ürün\n`);
  for (const u of rows.slice(0, 6)) {
    const stoklu = u.lokasyonlar.filter((l) => l.miktar > 0);
    console.log(`#${u.productId} ${u.barkod} | ${u.urunAdi}`);
    console.log(`  stoklu şubeler: ${stoklu.map((s) => `${s.kod}=${s.miktar}`).join(', ') || '—'}`);
    const lotSatirlar: string[] = [];
    for (const sube of stoklu) {
      try {
        const lots = await searchUrunLotsByProduct(u.productId, sube.kod);
        for (const l of lots) {
          lotSatirlar.push(`${sube.kod}|${l.lotNo}|uts=${l.utsKodu ?? '—'}`);
        }
      } catch (e) {
        lotSatirlar.push(`HATA@${sube.kod}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(`  lot panel: ${lotSatirlar.length ? lotSatirlar.join('; ') : 'BOŞ (Bu ürün için lot/UTS kaydı yok mesajı)'}`);
    console.log('');
  }
}

main().catch(console.error);
