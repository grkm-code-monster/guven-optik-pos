/**
 * ULTRA KONTAKT LENS 37 satır — sablon-excel-import uçtan uca test
 */
import 'dotenv/config';
import {
  aktarSablonExcelImport,
  buildUltraKontaktLensTestBuffer,
  dogrulaSablonExcelImport,
  parseSablonExcelUpload,
} from '../src/modules/admin/sablon-excel-import.service';
import { VARSAYILAN_SABLON_EXCEL_KOLON_MAP } from '../src/modules/admin/sablon-excel-import.constants';

async function main() {
  const buf = await buildUltraKontaktLensTestBuffer();
  const parsed = await parseSablonExcelUpload(buf);
  console.log('Yükleme:', parsed.satirlar.length, 'satır');

  const dogrulama = await dogrulaSablonExcelImport(parsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  console.log('Doğrulama aktarilabilir:', dogrulama.aktarilabilir);
  console.log('Geçerli satır:', dogrulama.ozet.gecerliSatir);

  const sonuc = await aktarSablonExcelImport(parsed.satirlar, VARSAYILAN_SABLON_EXCEL_KOLON_MAP);
  console.log('Sonuç:', {
    aktarildi: sonuc.aktarildi,
    atlandi: sonuc.atlandi,
    hata: sonuc.hata,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
