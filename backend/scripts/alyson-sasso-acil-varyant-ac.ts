/**
 * ACİL — "ALYSON SASSO OPTİK ÇERÇEVE" şablonuna 1 yeni varyant açar:
 *   MSSP8307MO / C63 / 51
 *
 * Şablon ID'si hardcode EDİLMEDİ — isimden runtime'da bulunuyor (önce aktif,
 * bulunamazsa arşivlenmiş/pasif şablonlar da dahil aranır). Varyant açma
 * işlemi, 14.10.2026'da kalıcı/otomatik güvenlik ağlı hale getirilen
 * "dinamik tek şablon" yolunu (importVaryantlarDinamikTekSablon) doğrudan,
 * UI'den geçmeden çağırıyor — bkz. odoo-varyant-import-dinamik.service.ts.
 * Bu yol, ana şablona yazma (MODEL/RENK/ÖLÇÜ "Çoklu" nitelik satırları)
 * başarısız olursa KENDİLİĞİNDEN izole alt şablona düşer, hiç hata vermeden
 * durur ya da yarım kalmaz.
 *
 * Kullanım:
 *   npm run alyson-sasso-acil-varyant-ac
 *   npm run alyson-sasso-acil-varyant-ac -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { importVaryantlarDinamikTekSablon } from '../src/modules/admin/odoo-varyant-import-dinamik.service';
import type { VaryantImportSatir } from '../src/modules/admin/odoo-varyant-import.service';

const SABLON_ADI = 'ALYSON SASSO OPTİK ÇERÇEVE';
const EXECUTE = process.argv.includes('--execute');

const satirlar: VaryantImportSatir[] = [
  { index: 0, model: 'MSSP8307MO', renk: 'C63', olcu: '51', barkod: '', fiyat: 0 },
];

async function sablonBul(ad: string): Promise<{ id: number; name: string } | null> {
  const aktif = (await execute(
    'product.template', 'search_read',
    [[['name', '=', ad]]],
    { fields: ['id', 'name'], limit: 1 },
  )) as { id: number; name: string }[];
  if (aktif.length) return aktif[0];

  // Arşivlenmiş/pasif şablonları da dahil et.
  const hepsi = (await execute(
    'product.template', 'search_read',
    [[['name', '=', ad]]],
    { fields: ['id', 'name'], limit: 1, context: { active_test: false } },
  )) as { id: number; name: string }[];
  if (hepsi.length) return hepsi[0];

  // Tam eşleşme yoksa "ilike" ile dene (boşluk/karakter farkına karşı).
  const benzer = (await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', ad]]],
    { fields: ['id', 'name'], limit: 5, context: { active_test: false } },
  )) as { id: number; name: string }[];
  if (benzer.length === 1) return benzer[0];
  if (benzer.length > 1) {
    console.log(`Birden fazla benzer şablon bulundu, lütfen TEMPLATE_ID'yi elle belirtin:`);
    for (const b of benzer) console.log(`  #${b.id} — ${b.name}`);
  }
  return null;
}

async function main() {
  const sablon = await sablonBul(SABLON_ADI);
  if (!sablon) {
    console.error(`"${SABLON_ADI}" adlı şablon bulunamadı. Odoo'da ürün adını kontrol edin.`);
    process.exit(1);
    return;
  }
  console.log(`Şablon bulundu: #${sablon.id} — "${sablon.name}"`);

  if (!EXECUTE) {
    console.log('DRY RUN: aşağıdaki satır "dinamik tek şablon" yoluyla bu şablona açılacak:');
    for (const s of satirlar) console.log(`  - ${s.model} / ${s.renk} / ${s.olcu}`);
    console.log('\nGerçek çalıştırma için: npm run alyson-sasso-acil-varyant-ac -- --execute');
    return;
  }

  const sonuc = await importVaryantlarDinamikTekSablon(sablon.id, satirlar);
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
