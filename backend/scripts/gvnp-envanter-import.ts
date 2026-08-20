/**
 * GVNP şubesi için Excel Envanter içe aktarımını DOĞRUDAN sunucu üzerinde
 * çalıştırır — Depo Yönetimi > Excel Envanter ekranından yüklenmiş gibi,
 * AYNI backend fonksiyonlarını (parseEnvanterExcel + uygulaEnvanterImport)
 * kullanır. Her satır için normal akıştaki gibi lot/seri otomatik üretilir.
 *
 * Dosya: backend/scripts/data/gvnp-gunes-gozlugu-import.xlsx
 * (Görkem'in yüklediği "envanter-import-sablon (15).xlsx" — 177 geçerli
 * güneş gözlüğü satırı, 12 boş şablon satırı otomatik atlanıyor.)
 *
 * Kullanım:
 *   cd backend
 *   npm run gvnp-envanter-import              (dry-run — sadece önizleme raporu)
 *   npm run gvnp-envanter-import -- --execute  (gerçekten GVNP'ye yazar)
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { parseEnvanterExcel, previewEnvanterImport } from '../src/modules/admin/envanter-import.service';
import { uygulaEnvanterImport } from '../src/modules/admin/envanter-import-uygula.service';

const DOSYA_YOLU = path.join(__dirname, 'data', 'gvnp-gunes-gozlugu-import.xlsx');
const LOKASYON_KODU = 'GVNP';

function parseArgs() {
  return { executeMode: process.argv.includes('--execute') };
}

async function main() {
  const { executeMode } = parseArgs();

  console.log('='.repeat(70));
  console.log(`GVNP Excel Envanter içe aktarımı — ${LOKASYON_KODU}`);
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE (Odoo\'ya yazılacak)' : 'DRY-RUN (sadece önizleme)'}\n`);

  if (!fs.existsSync(DOSYA_YOLU)) {
    console.error(`Dosya bulunamadı: ${DOSYA_YOLU}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(DOSYA_YOLU);
  const rows = await parseEnvanterExcel(buffer);
  console.log(`Excel'den okunan geçerli satır sayısı: ${rows.length}\n`);

  const onizleme = await previewEnvanterImport(rows);
  console.log('Önizleme özeti:');
  console.log(`  Toplam satır       : ${onizleme.ozet.toplamSatir}`);
  console.log(`  Şablon grubu       : ${onizleme.ozet.sablonGrupSayisi}`);
  console.log(`  Yeni şablon        : ${onizleme.ozet.yeniSablon}`);
  console.log(`  Yeni varyant       : ${onizleme.ozet.yeniVaryant}`);
  console.log(`  Mevcut varyant     : ${onizleme.ozet.mevcutVaryant}`);
  console.log(`  Hata               : ${onizleme.ozet.hata}`);

  if (onizleme.ozet.hata > 0) {
    console.log('\nHatalı satırlar:');
    for (const s of onizleme.satirlar.filter((s) => s.durum === 'HATA')) {
      console.log(`  Satır ${s.satirNo}: ${s.mesaj} (${s.urunAdi} / ${s.barkod})`);
    }
  }

  if (!executeMode) {
    console.log('\nBu bir dry-run — hiçbir şey Odoo\'ya yazılmadı.');
    console.log('Gerçek uygulama için: npm run gvnp-envanter-import -- --execute');
    return;
  }

  console.log(`\n${LOKASYON_KODU}'ye YAZILIYOR — bu işlem geri alınamaz, lütfen bekleyin...\n`);

  const aktarimKimligi = `GVNP-ACIL-${Date.now()}`;
  const sonuc = await uygulaEnvanterImport({
    lokasyonKodu: LOKASYON_KODU,
    satirlar: rows,
    aktarimKimligi,
  });

  console.log('='.repeat(70));
  console.log('SONUÇ');
  console.log('='.repeat(70));
  console.log(`Başarılı: ${sonuc.ozet.basarili}`);
  console.log(`Başarısız: ${sonuc.ozet.basarisiz}`);

  const basarisizlar = sonuc.satirlar.filter((s) => s.durum === 'BASARISIZ');
  if (basarisizlar.length) {
    console.log('\nBaşarısız satırlar:');
    for (const s of basarisizlar) {
      const kaynak = rows.find((r) => r.satirNo === s.satirNo);
      console.log(`  Satır ${s.satirNo} (${kaynak?.urunAdi ?? '?'} / ${kaynak?.barkod ?? '?'}): ${s.mesaj}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
