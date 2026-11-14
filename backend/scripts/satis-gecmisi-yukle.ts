/**
 * 14.11.2026 — Eski satış geçmişini (Siber 2023-24 + eski Odoo 11.2025-11.2026, çerçeve/güneş)
 * SatisGecmisi tablosuna yükler; marka → fatura kesen firma bilgisini MarkaTedarikci'ye ekler.
 *
 * Sadece bu iki YENİ tabloya yazar. Odoo'ya ve diğer tablolara dokunmaz.
 * Tekrar çalıştırmak güvenli: SatisGecmisi'ndeki aynı kaynağın satırları silinip yeniden yazılır;
 * MarkaTedarikci'de sadece BOŞ olan "faturaFirma" doldurulur (elle girilen hiçbir şey değişmez).
 *
 * Varsayılan: KURU (hiçbir şey yazmaz). Uygulamak için: --confirm
 *   npx ts-node --transpile-only scripts/satis-gecmisi-yukle.ts [--confirm]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { prisma } from '../src/database/prisma';

type Satir = {
  kaynak: string; tarih: string; lokasyon: string; tur: string; marka: string; model: string;
  renk: string; urunAdi: string; adet: number; tutar: number;
};

function csvOku(): Satir[] {
  const ham = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'satis-gecmisi.csv.gz'))).toString('utf8');
  const satirlar = ham.split('\n').filter(Boolean);
  const out: Satir[] = [];
  for (const l of satirlar.slice(1)) {
    // Python csv: alan ";" veya tırnak içeriyorsa çift tırnaklı
    const p: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) {
        if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
      } else if (c === '"') q = true;
      else if (c === ';') { p.push(cur); cur = ''; } else cur += c;
    }
    p.push(cur);
    if (p.length !== 10) throw new Error(`Bozuk satır: ${l}`);
    out.push({
      kaynak: p[0], tarih: p[1], lokasyon: p[2], tur: p[3], marka: p[4], model: p[5], renk: p[6],
      urunAdi: p[7], adet: Number(p[8]), tutar: Number(p[9]) || 0,
    });
  }
  return out;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const satirlar = csvOku();
  const kaynaklar = [...new Set(satirlar.map((s) => s.kaynak))];
  console.log(`Dosyada ${satirlar.length} satır`);
  for (const k of kaynaklar) {
    const ks = satirlar.filter((s) => s.kaynak === k);
    const tar = ks.map((s) => s.tarih).sort();
    const mevcut = await prisma.satisGecmisi.count({ where: { kaynak: k } });
    console.log(`  ${k}: ${ks.length} satır, ${ks.reduce((a, s) => a + s.adet, 0)} adet, ${tar[0]} → ${tar[tar.length - 1]} (tabloda şu an ${mevcut} satır)`);
  }

  const markalar = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'marka-fatura-firma.json'), 'utf8')) as { marka: string; faturaFirma: string | null }[];
  const mevcutM = new Map((await prisma.markaTedarikci.findMany()).map((m) => [m.marka, m]));
  const yeniM = markalar.filter((m) => !mevcutM.has(m.marka));
  const doldurM = markalar.filter((m) => m.faturaFirma && mevcutM.has(m.marka) && !mevcutM.get(m.marka)!.faturaFirma);
  console.log(`Marka kartı: ${yeniM.length} yeni, ${doldurM.length} kartın boş fatura firması doldurulacak`);

  if (!confirm) {
    console.log('\nKURU çalışma — hiçbir şey yazılmadı. Uygulamak için sonuna --confirm ekleyin.');
    return;
  }

  for (const k of kaynaklar) {
    const ks = satirlar.filter((s) => s.kaynak === k);
    await prisma.$transaction(async (tx) => {
      await tx.satisGecmisi.deleteMany({ where: { kaynak: k } });
      for (let i = 0; i < ks.length; i += 2000) {
        await tx.satisGecmisi.createMany({
          data: ks.slice(i, i + 2000).map((s) => ({ ...s, tarih: new Date(`${s.tarih}T00:00:00Z`) })),
        });
      }
    }, { timeout: 120000 });
    console.log(`  ${k}: ${ks.length} satır yazıldı`);
  }
  for (const m of yeniM) {
    await prisma.markaTedarikci.create({ data: { marka: m.marka, faturaFirma: m.faturaFirma } });
  }
  for (const m of doldurM) {
    await prisma.markaTedarikci.update({ where: { marka: m.marka }, data: { faturaFirma: m.faturaFirma } });
  }
  console.log(`Marka kartı: ${yeniM.length} eklendi, ${doldurM.length} güncellendi`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
