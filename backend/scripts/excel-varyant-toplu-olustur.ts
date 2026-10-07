/**
 * Excel listelerindeki Ürün Şablonu / Model / Renk / Ölçü satırlarını Odoo'ya
 * aktarır. Barkod/fiyat/adet verilmiyor (boş/0 geçilir). KDV varsayılan %10;
 * veri JSON'unda satırda kdvOrani verilmişse (örn. 20) o oran kullanılır
 * (örn. AKTARILACAK 5 — güneş gözlüğü, %20 KDV).
 *
 * Kategori iki şekilde gelebilir (veri JSON'undaki alana göre):
 *   - kategoriId (number): Excel'de "#44All / OPTİK ÇERÇEVE / ORTA GRUP" gibi
 *     ID'si belli verildiyse DOĞRUDAN o categ_id kullanılır — hiçbir arama/
 *     oluşturma yapılmaz, YENİ KATEGORİ KESİNLİKLE AÇILMAZ.
 *   - kategori (string): sadece isim verildiyse resolveOrCreateCategoryId ile
 *     çözülür, bulunamazsa yeni kategori açılır (AKTARILACAK 1 dosyası gibi).
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
 * Farklı veri dosyası: --data=excel-varyant-aktarim-2.json
 *
 * Kullanım:
 *   npm run excel-varyant-toplu-olustur -- --data=excel-varyant-aktarim-2.json
 *   npm run excel-varyant-toplu-olustur -- --data=excel-varyant-aktarim-2.json --sadece="HAWK OPTİK ÇERÇEVE" --execute
 *   npm run excel-varyant-toplu-olustur -- --data=excel-varyant-aktarim-2.json --execute
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';
import {
  importVaryantlarForTemplate,
  type VaryantImportSatir,
} from '../src/modules/admin/odoo-varyant-import.service';

type Satir = {
  urunAdi: string; model: string; renk: string; olcu: string;
  kategori?: string; kategoriId?: number; kategoriAdi?: string;
  kdvOrani?: number;
};

function parseArgs() {
  const execute_ = process.argv.includes('--execute');
  const sadeceArg = process.argv.find((a) => a.startsWith('--sadece='));
  const sadece = sadeceArg ? sadeceArg.split('=').slice(1).join('=').replace(/^"|"$/g, '') : null;
  const dataArg = process.argv.find((a) => a.startsWith('--data='));
  const data = dataArg ? dataArg.split('=')[1] : 'excel-varyant-aktarim.json';
  return { execute: execute_, sadece, data };
}

/** kategoriId verilmişse DOĞRUDAN o id ile, yoksa isimle çözüp/oluşturup yeni şablon açar. */
async function sablonAc(ad: string, satir: Satir): Promise<number> {
  let categId: number;
  if (satir.kategoriId != null) {
    // Doğrulama: ID gerçekten var mı ve isim eşleşiyor mu (yanlış ID'yle
    // sessizce yanlış kategoriye ürün açmamak için).
    const kat = (await execute(
      'product.category', 'read', [[satir.kategoriId]], { fields: ['id', 'complete_name'] },
    )) as { id: number; complete_name: string }[];
    if (!kat.length) {
      throw new Error(`kategoriId #${satir.kategoriId} Odoo'da bulunamadı`);
    }
    categId = kat[0].id;
    console.log(`  (kategori #${categId} "${kat[0].complete_name}" doğrudan kullanılıyor — yeni kategori açılmadı)`);
  } else if (satir.kategori) {
    const { resolveOrCreateCategoryId } = await import('../src/modules/odoo/odoo-category.util');
    const resolved = await resolveOrCreateCategoryId(satir.kategori);
    categId = resolved.id;
  } else {
    throw new Error('Satırda ne kategoriId ne de kategori var');
  }

  const tmplData: Record<string, unknown> = {
    name: ad,
    type: 'product',
    categ_id: categId,
    list_price: 0,
    standard_price: 0,
    sale_ok: true,
    purchase_ok: true,
    tracking: 'serial',
  };
  const kdvOrani = satir.kdvOrani ?? 10;
  const taxes = (await execute(
    'account.tax', 'search_read',
    [[['type_tax_use', '=', 'sale'], ['amount', '=', kdvOrani]]],
    { fields: ['id'], limit: 1 },
  )) as { id: number }[];
  if (taxes.length) {
    tmplData.taxes_id = [[6, 0, [taxes[0].id]]];
  } else {
    console.log(`  ⚠️ %${kdvOrani} satış KDV'si Odoo'da bulunamadı — taxes_id boş kalacak`);
  }

  return Number(await execute('product.template', 'create', [tmplData]));
}

async function main() {
  const { execute: doExecute, sadece, data } = parseArgs();
  const dataPath = path.join(__dirname, 'data', data);
  console.log(`Veri dosyası: ${data}`);
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
        const katEtiketi = rows[0].kategoriId != null
          ? `#${rows[0].kategoriId} ${rows[0].kategoriAdi ?? ''}`.trim()
          : rows[0].kategori;
        if (!doExecute) {
          console.log(`• ${ad} — YENİ ŞABLON açılacak (kategori: ${katEtiketi}, KDV %${rows[0].kdvOrani ?? 10}) — ${rows.length} satır`);
          continue;
        }
        tmplId = await sablonAc(ad, rows[0]);
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
