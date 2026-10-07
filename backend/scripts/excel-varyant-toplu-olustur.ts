/**
 * "AKTARILACAK 1" Excel listesindeki 45 Ürün Şablonu / 877 (dedupe sonrası)
 * satırı Odoo'ya aktarır. Barkod/fiyat/adet verilmiyor (boş/0 geçilir).
 * KDV %10 sabit. Kategori Excel'deki "Ürün Kategorisi" sütunundan çözülür/
 * gerekirse oluşturulur.
 *
 * Her Ürün Şablonu için:
 *   - Odoo'da tam adıyla (trim) eşleşen TEK şablon varsa → onu kullanır.
 *   - Hiç yoksa → yeni şablon açar (kategori + %10 KDV, fiyatsız).
 *   - Birden fazla eşleşme varsa → o markayı ATLAR, hata olarak raporlar
 *     (elle çözülmesi gerekir — bkz. excel-varyant-kesif.ts).
 * Ardından importVaryantlarForTemplate() çağrılır — bu fonksiyon zaten
 * otomatik olarak güvenli yolu seçer: split alt şablonlar varsa (örn. eski
 * mimari) o yola, yoksa yeni dinamik MODEL(Çoklu)/RENK(Çoklu)/ÖLÇÜ(Çoklu)
 * mimarisine yönlenir — aynı SWING GÜNEŞ GÖZLÜĞÜ'nde kullandığımız, test
 * edilmiş servis (odoo-varyant-import.service.ts).
 *
 * Varsayılan: DRY RUN (hiçbir şey yazmaz, sadece plan basar).
 * Gerçek çalıştırma: --execute
 * Tek markayla test: --sadece="OPTICALL OPTİK ÇERÇEVE"
 *
 * Kullanım:
 *   npm run excel-varyant-toplu-olustur
 *   npm run excel-varyant-toplu-olustur -- --sadece="RAPSODİ OPTİK ÇERÇEVE" --execute
 *   npm run excel-varyant-toplu-olustur -- --execute
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';
import { resolveOrCreateCategoryId } from '../src/modules/odoo/odoo-category.util';
import {
  createEnvanterSablon,
  importVaryantlarForTemplate,
  type VaryantImportSatir,
} from '../src/modules/admin/odoo-varyant-import.service';

type Satir = { urunAdi: string; model: string; renk: string; olcu: string; kategori: string };

function parseArgs() {
  const execute_ = process.argv.includes('--execute');
  const sadeceArg = process.argv.find((a) => a.startsWith('--sadece='));
  const sadece = sadeceArg ? sadeceArg.split('=').slice(1).join('=').replace(/^"|"$/g, '') : null;
  return { execute: execute_, sadece };
}

async function main() {
  const { execute: doExecute, sadece } = parseArgs();
  const dataPath = path.join(__dirname, 'data', 'excel-varyant-aktarim.json');
  const tumSatirlar: Satir[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  const gruplar = new Map<string, Satir[]>();
  for (const s of tumSatirlar) {
    const ad = s.urunAdi.trim();
    if (sadece && ad.toUpperCase() !== sadece.trim().toUpperCase()) continue;
    if (!gruplar.has(ad)) gruplar.set(ad, []);
    gruplar.get(ad)!.push(s);
  }

  if (gruplar.size === 0) {
    console.log('Eşleşen marka bulunamadı (--sadece filtresini kontrol edin).');
    return;
  }

  console.log(`${doExecute ? 'GERÇEK ÇALIŞTIRMA' : 'DRY RUN (önizleme)'} — ${gruplar.size} marka, ${
    [...gruplar.values()].reduce((a, r) => a + r.length, 0)
  } satır\n`);

  let toplamOlusturulan = 0;
  let toplamZatenMevcut = 0;
  let toplamHata = 0;
  const markaHatalari: string[] = [];

  for (const [ad, rows] of gruplar) {
    try {
      const mevcutSablonlar = (await execute(
        'product.template', 'search_read',
        [[['name', '=', ad]]],
        { fields: ['id', 'name'] },
      )) as { id: number; name: string }[];

      let tmplId: number;

      if (mevcutSablonlar.length > 1) {
        console.log(`✗ ${ad} — ${mevcutSablonlar.length} tam eşleşen şablon var (belirsiz), ATLANDI: ${
          mevcutSablonlar.map((t) => `#${t.id}`).join(', ')
        }`);
        markaHatalari.push(`${ad}: birden fazla şablon (${mevcutSablonlar.map((t) => `#${t.id}`).join(', ')})`);
        continue;
      }

      if (mevcutSablonlar.length === 1) {
        tmplId = mevcutSablonlar[0].id;
        console.log(`• ${ad} — mevcut şablon #${tmplId} kullanılacak (${rows.length} satır)`);
      } else {
        if (!doExecute) {
          console.log(`• ${ad} — YENİ ŞABLON açılacak (kategori: ${rows[0].kategori}, KDV %10) — ${rows.length} satır`);
          continue;
        }
        tmplId = await createEnvanterSablon({
          kategori: rows[0].kategori,
          urunAdi: ad,
          satisFiyati: 0,
          maliyetFiyati: 0,
          kdvOrani: 10,
        });
        console.log(`✓ ${ad} — yeni şablon oluşturuldu #${tmplId}`);
      }

      if (!doExecute) {
        console.log(`  (dry run — ${rows.length} satır için varyant import atlandı)`);
        continue;
      }

      const satirlar: VaryantImportSatir[] = rows.map((r, i) => ({
        index: i + 1,
        model: r.model,
        renk: r.renk,
        olcu: r.olcu,
        barkod: '',
        fiyat: 0,
      }));

      const sonuc = await importVaryantlarForTemplate(tmplId, satirlar);
      toplamOlusturulan += sonuc.olusturulan;
      toplamZatenMevcut += sonuc.zatenMevcut;
      toplamHata += sonuc.hatalar.length;
      console.log(
        `  → ${sonuc.olusturulan} oluşturuldu, ${sonuc.zatenMevcut} zaten vardı, ${sonuc.hatalar.length} hata`,
      );
      if (sonuc.hatalar.length) {
        for (const h of sonuc.hatalar.slice(0, 5)) {
          console.log(`    satır ${h.index}: ${h.sebep}`);
        }
        if (sonuc.hatalar.length > 5) console.log(`    ...ve ${sonuc.hatalar.length - 5} hata daha`);
      }
    } catch (e: any) {
      console.log(`✗ ${ad} — BEKLENMEYEN HATA: ${e?.message ?? e}`);
      markaHatalari.push(`${ad}: ${e?.message ?? e}`);
    }
  }

  console.log('\n======================================================================');
  console.log(`TOPLAM: ${toplamOlusturulan} oluşturuldu, ${toplamZatenMevcut} zaten vardı, ${toplamHata} satır hatası`);
  if (markaHatalari.length) {
    console.log(`\nMarka bazlı hatalar (${markaHatalari.length}):`);
    for (const m of markaHatalari) console.log(`  - ${m}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
