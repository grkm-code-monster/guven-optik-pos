/**
 * Keşif (salt okunur) — "AKTARILACAK 1" Excel listesindeki 45 Ürün Şablonu
 * adının her biri için Odoo'da şu an ne durumda olduğunu raporlar:
 *   - Hiç yok (yeni şablon açılacak)
 *   - Tek şablon var, varyant sayısı
 *   - "Bölünmüş" (split-by-model) eski yapı var (örn. OTTO) — kaç alt şablon
 * Hiçbir yazma işlemi yapmaz. excel-varyant-toplu-olustur.ts'den önce çalıştırılmalı.
 *
 * Kullanım: npm run excel-varyant-kesif
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';

type Satir = {
  urunAdi: string; model: string; renk: string; olcu: string;
  kategori?: string; kategoriId?: number; kategoriAdi?: string;
};

function parseArgs() {
  const dataArg = process.argv.find((a) => a.startsWith('--data='));
  const data = dataArg ? dataArg.split('=')[1] : 'excel-varyant-aktarim.json';
  return { data };
}

async function main() {
  const { data } = parseArgs();
  const dataPath = path.join(__dirname, 'data', data);
  console.log(`Veri dosyası: ${data}\n`);
  const satirlar: Satir[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  const gruplar = new Map<string, Satir[]>();
  for (const s of satirlar) {
    const ad = s.urunAdi.trim();
    if (!gruplar.has(ad)) gruplar.set(ad, []);
    gruplar.get(ad)!.push(s);
  }

  console.log(`Toplam marka/şablon sayısı: ${gruplar.size}, toplam satır: ${satirlar.length}\n`);

  const siraliAdlar = [...gruplar.keys()].sort((a, b) => gruplar.get(b)!.length - gruplar.get(a)!.length);

  for (const ad of siraliAdlar) {
    const rows = gruplar.get(ad)!;
    // Ana ada tam eşit şablonlar
    const tamEslesen = await execute(
      'product.template', 'search_read',
      [[['name', '=', ad]]],
      { fields: ['id', 'name'], context: { active_test: false } },
    ) as { id: number; name: string }[];

    // "{ad} " ile başlayan (bölünmüş alt şablon) adaylar
    const splitAdaylari = await execute(
      'product.template', 'search_count',
      [[['name', '=like', `${ad} %`]]],
    ) as number;

    let varyantSayisi = 0;
    if (tamEslesen.length === 1) {
      varyantSayisi = await execute(
        'product.product', 'search_count',
        [[['product_tmpl_id', '=', tamEslesen[0].id]]],
      ) as number;
    }

    const durum = tamEslesen.length === 0 && splitAdaylari === 0
      ? 'YOK — yeni şablon açılacak'
      : tamEslesen.length === 1 && splitAdaylari > 0
      ? `ANA ŞABLON VAR (#${tamEslesen[0].id}) + ${splitAdaylari} BÖLÜNMÜŞ ALT ŞABLON (eski split-by-model yapı)`
      : tamEslesen.length === 1
      ? `TEK ŞABLON VAR (#${tamEslesen[0].id}), ${varyantSayisi} varyant`
      : tamEslesen.length > 1
      ? `⚠️ BİRDEN FAZLA (${tamEslesen.length}) TAM EŞLEŞEN ŞABLON VAR — belirsiz`
      : `⚠️ Ana şablon yok ama ${splitAdaylari} "benzer isimli" şablon var — kontrol gerekli`;

    console.log(`${String(rows.length).padStart(4)} satır | ${ad.padEnd(35)} | ${durum}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
