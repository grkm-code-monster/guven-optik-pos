/**
 * ZEISS cam fiyat listesini (platinum kaplama, Excel'den hazırlanmış JSON)
 * Odoo'ya STANDALONE product.template olarak aktarır.
 *
 * ÖNEMLİ FARK: Model/Renk/Ölçü varyant mimarisi YOK — nitelik yok. Excel'deki
 * her satır kendi başına bağımsız bir product.template'dir (1 satır = 1 ürün).
 *
 * Alan eşlemesi (kullanıcı talimatı):
 *   kdv oranı                              -> taxes_id (account.tax, amount=kdvOrani)
 *   Grup (#<id><ad> formatında)             -> categ_id (DOĞRUDAN id, yeni kategori AÇILMAZ)
 *   Ürün Adı (Platinum UV)                  -> name
 *   satış Fiyat (Platinum UV)               -> list_price (KDV DAHİL, doğrudan — çevrim yok)
 *   maliyet Fiyat (Platinum UV - Toptan)    -> standard_price
 *
 * Takip: tracking = 'lot' (barkod/UTS satış anında kullanılmıyor, lot stok
 * girişinde otomatik atanıyor — kullanıcı onayı).
 *
 * Mevcut ürün (aynı isimle tam eşleşen product.template) varsa:
 *   -> FİYATLARI GÜNCELLE: list_price, standard_price, taxes_id güncellenir.
 *      categ_id'ye DOKUNULMAZ (kullanıcı seçimi: "Fiyatları güncelle").
 * Birden fazla tam eşleşen şablon varsa: belirsiz, ATLANIR ve raporlanır.
 * Hiç yoksa: yeni product.template açılır.
 *
 * Varsayılan: DRY RUN (hiçbir şey yazmaz, sadece plan basar).
 * Gerçek çalıştırma: --execute
 * Tek üründe test: --sadece="ZEISS Progresif Smartlife Individual 1.5 Photofusion X Kahve"
 * Farklı veri dosyası: --data=zeiss-lens-aktarim.json (varsayılan budur)
 *
 * Kullanım:
 *   npm run zeiss-lens-toplu-olustur
 *   npm run zeiss-lens-toplu-olustur -- --sadece="..." --execute
 *   npm run zeiss-lens-toplu-olustur -- --execute
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';

type Satir = {
  urunAdi: string;
  kategoriId: number;
  kategoriAdi: string;
  kdvOrani: number;
  satisFiyati: number;
  maliyetFiyati: number;
};

function parseArgs() {
  const execute_ = process.argv.includes('--execute');
  const sadeceArg = process.argv.find((a) => a.startsWith('--sadece='));
  const sadece = sadeceArg ? sadeceArg.split('=').slice(1).join('=').replace(/^"|"$/g, '') : null;
  const dataArg = process.argv.find((a) => a.startsWith('--data='));
  const data = dataArg ? dataArg.split('=')[1] : 'zeiss-lens-aktarim.json';
  return { execute: execute_, sadece, data };
}

const taxCache = new Map<number, number | null>();
async function taxIdFor(kdvOrani: number): Promise<number | null> {
  if (taxCache.has(kdvOrani)) return taxCache.get(kdvOrani)!;
  const taxes = (await execute(
    'account.tax', 'search_read',
    [[['type_tax_use', '=', 'sale'], ['amount', '=', kdvOrani]]],
    { fields: ['id'], limit: 1 },
  )) as { id: number }[];
  const id = taxes.length ? taxes[0].id : null;
  taxCache.set(kdvOrani, id);
  return id;
}

const categCache = new Map<number, string>();
async function validateCategoryId(id: number): Promise<string> {
  if (categCache.has(id)) return categCache.get(id)!;
  const kat = (await execute(
    'product.category', 'read', [[id]], { fields: ['id', 'complete_name'] },
  )) as { id: number; complete_name: string }[];
  if (!kat.length) {
    throw new Error(`kategoriId #${id} Odoo'da bulunamadı`);
  }
  categCache.set(id, kat[0].complete_name);
  return kat[0].complete_name;
}

async function main() {
  const { execute: doExecute, sadece, data } = parseArgs();
  const dataPath = path.join(__dirname, 'data', data);
  console.log(`Veri dosyası: ${data}`);
  let tumSatirlar: Satir[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  if (sadece) {
    tumSatirlar = tumSatirlar.filter(
      (s) => s.urunAdi.trim().toUpperCase() === sadece.trim().toUpperCase(),
    );
  }

  if (tumSatirlar.length === 0) {
    console.log('Eşleşen ürün bulunamadı (--sadece filtresini kontrol edin).');
    return;
  }

  console.log(`${doExecute ? 'GERÇEK ÇALIŞTIRMA' : 'DRY RUN (önizleme)'} — ${tumSatirlar.length} ürün\n`);

  let olusturulan = 0;
  let guncellenen = 0;
  let hata = 0;
  const hatalar: string[] = [];

  for (const s of tumSatirlar) {
    const ad = s.urunAdi.trim();
    try {
      const mevcut = (await execute(
        'product.template', 'search_read',
        [[['name', '=', ad]]],
        { fields: ['id', 'name'] },
      )) as { id: number; name: string }[];

      if (mevcut.length > 1) {
        console.log(`✗ ${ad} — ${mevcut.length} tam eşleşen şablon var (belirsiz), ATLANDI: ${
          mevcut.map((t) => `#${t.id}`).join(', ')
        }`);
        hatalar.push(`${ad}: birden fazla şablon (${mevcut.map((t) => `#${t.id}`).join(', ')})`);
        hata++;
        continue;
      }

      if (!doExecute) {
        if (mevcut.length === 1) {
          console.log(
            `• ${ad} — mevcut #${mevcut[0].id} GÜNCELLENECEK (satış ₺${s.satisFiyati}, maliyet ₺${s.maliyetFiyati}, KDV %${s.kdvOrani})`,
          );
        } else {
          console.log(
            `• ${ad} — YENİ ürün açılacak (kategori #${s.kategoriId} ${s.kategoriAdi}, satış ₺${s.satisFiyati}, maliyet ₺${s.maliyetFiyati}, KDV %${s.kdvOrani})`,
          );
        }
        continue;
      }

      const taxId = await taxIdFor(s.kdvOrani);
      if (!taxId) {
        console.log(`  ⚠️ %${s.kdvOrani} satış KDV'si Odoo'da bulunamadı — taxes_id boş kalacak`);
      }

      if (mevcut.length === 1) {
        const updateData: Record<string, unknown> = {
          list_price: s.satisFiyati,
          standard_price: s.maliyetFiyati,
        };
        if (taxId) updateData.taxes_id = [[6, 0, [taxId]]];
        await execute('product.template', 'write', [[mevcut[0].id], updateData]);
        console.log(`✓ ${ad} — mevcut #${mevcut[0].id} güncellendi (fiyat/KDV)`);
        guncellenen++;
      } else {
        const katAd = await validateCategoryId(s.kategoriId);
        const tmplData: Record<string, unknown> = {
          name: ad,
          type: 'product',
          categ_id: s.kategoriId,
          list_price: s.satisFiyati,
          standard_price: s.maliyetFiyati,
          sale_ok: true,
          purchase_ok: true,
          tracking: 'lot',
        };
        if (taxId) tmplData.taxes_id = [[6, 0, [taxId]]];
        const newId = Number(await execute('product.template', 'create', [tmplData]));
        console.log(`✓ ${ad} — yeni ürün oluşturuldu #${newId} (kategori: ${katAd})`);
        olusturulan++;
      }
    } catch (e: any) {
      console.log(`✗ ${ad} — BEKLENMEYEN HATA: ${e?.message ?? e}`);
      hatalar.push(`${ad}: ${e?.message ?? e}`);
      hata++;
    }
  }

  console.log('\n======================================================================');
  console.log(`TOPLAM: ${olusturulan} oluşturuldu, ${guncellenen} güncellendi, ${hata} hata`);
  if (hatalar.length) {
    console.log(`\nHatalar (${hatalar.length}):`);
    for (const h of hatalar) console.log(`  - ${h}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
