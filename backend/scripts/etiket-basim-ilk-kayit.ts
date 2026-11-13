/**
 * 13.11.2026 — Etiket basım geçmişinin İLK kaydı (tek seferlik).
 *
 * Daha önce basılmış etiketler (11.11 GVN2 toplu baskı — 139 adet, 13.11 Marco Salvadori
 * SP8201 — 19 adet) "basıldı" olarak geçmişe yazılır. Diğer her şey "basılmamış" başlar.
 *
 * Lotlar Odoo'da lot adı (GRS-…) ya da UTS kodu ile bulunur. Bulunamayan satır YAZILMAZ, raporlanır.
 * Aynı lot için daha önce ILK_KAYIT yazılmışsa tekrar yazılmaz (tekrar çalıştırmak güvenli).
 *
 * Varsayılan: KURU (hiçbir şey yazmaz). Uygulamak için: --confirm
 *   npx ts-node --transpile-only scripts/etiket-basim-ilk-kayit.ts [--confirm]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execute } from '../src/modules/odoo/odoo.service';
import { prisma } from '../src/database/prisma';

type Satir = {
  lotAdi: string | null;
  utsKodu: string | null;
  urunAdi: string;
  nitelik: string;
  fiyat: number;
  lokasyon: string;
  basildi: string;
  not: string;
};

type OdooLot = { id: number; name: string; x_uts_kodu: string | false; product_id: [number, string] | false };

const ctxCache: { v?: { context: Record<string, unknown> } } = {};
async function ctx() {
  if (ctxCache.v) return ctxCache.v;
  const comps = (await execute('res.company', 'search_read', [[]], { fields: ['id'] })) as { id: number }[];
  const ids = comps.map((c) => c.id);
  ctxCache.v = { context: { active_test: false, allowed_company_ids: [1, ...ids.filter((i) => i !== 1)] } };
  return ctxCache.v;
}

/** UTS kodunun ayraçtan önceki kısmı (01 GTIN 21 SERİ) — ayraç biçimi farkını yok sayar. */
function utsCekirdek(kod: string): string {
  return kod.replace(/[\s\u001d]/g, '').split(/[*(]/)[0];
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const satirlar = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'etiket-basim-ilk-kayit.json'), 'utf8'),
  ) as Satir[];
  console.log(confirm ? '### UYGULAMA MODU' : '### KURU MOD (hiçbir şey yazılmaz)');
  console.log(`Dosyadaki satır: ${satirlar.length}`);

  const c = await ctx();
  const adlar = satirlar.map((s) => s.lotAdi).filter((x): x is string => !!x);
  const adlaBulunan = (await execute('stock.lot', 'search_read', [[['name', 'in', adlar]]], {
    fields: ['id', 'name', 'x_uts_kodu', 'product_id'],
    ...c,
  })) as OdooLot[];
  const lotByAd = new Map(adlaBulunan.map((l) => [l.name, l]));

  const hedefler: { s: Satir; lot: OdooLot }[] = [];
  const bulunamayan: Satir[] = [];
  for (const s of satirlar) {
    let lot: OdooLot | undefined;
    if (s.lotAdi) lot = lotByAd.get(s.lotAdi);
    if (!lot && s.utsKodu) {
      const cekirdek = utsCekirdek(s.utsKodu);
      const aday = (await execute('stock.lot', 'search_read', [[['x_uts_kodu', 'ilike', cekirdek]]], {
        fields: ['id', 'name', 'x_uts_kodu', 'product_id'],
        ...c,
      })) as OdooLot[];
      const tam = aday.filter((l) => typeof l.x_uts_kodu === 'string' && utsCekirdek(l.x_uts_kodu) === cekirdek);
      if (tam.length === 1) lot = tam[0];
      else if (tam.length > 1) console.log(`  ⚠️ UTS birden fazla lotta: ${s.utsKodu} → ${tam.map((l) => '#' + l.id).join(', ')} (atlandı)`);
    }
    if (lot) hedefler.push({ s, lot });
    else bulunamayan.push(s);
  }

  const lotIds = hedefler.map((h) => h.lot.id);
  const mevcut = await prisma.etiketBasimKaydi.findMany({
    where: { lotId: { in: lotIds }, kaynak: 'ILK_KAYIT' },
    select: { lotId: true },
  });
  const mevcutSet = new Set(mevcut.map((m) => m.lotId));
  const yazilacak = hedefler.filter((h) => !mevcutSet.has(h.lot.id));

  const ozet = new Map<string, number>();
  for (const h of yazilacak) ozet.set(h.s.not, (ozet.get(h.s.not) ?? 0) + 1);
  console.log(`Odoo'da bulunan lot: ${hedefler.length}`);
  console.log(`Zaten kayıtlı (atlanacak): ${mevcutSet.size}`);
  console.log(`Yazılacak: ${yazilacak.length}`);
  for (const [k, n] of ozet) console.log(`   - ${k}: ${n}`);
  if (bulunamayan.length) {
    console.log(`⚠️ Odoo'da bulunamayan: ${bulunamayan.length}`);
    for (const b of bulunamayan) console.log(`   ${b.lotAdi ?? b.utsKodu} | ${b.urunAdi} ${b.nitelik}`);
  }
  for (const h of yazilacak.slice(0, 5)) {
    console.log(`   örnek: lot #${h.lot.id} ${h.lot.name} | ${h.s.urunAdi} ${h.s.nitelik} | ${h.s.fiyat} TL | ${h.s.basildi}`);
  }

  if (!confirm) {
    console.log('--- KURU MOD --- Uygulamak için --confirm ile tekrar çalıştırın.');
    return;
  }
  if (!yazilacak.length) {
    console.log('Yazılacak bir şey yok.');
    return;
  }
  const r = await prisma.etiketBasimKaydi.createMany({
    data: yazilacak.map((h) => ({
      lotId: h.lot.id,
      lotAdi: h.lot.name,
      utsKodu: typeof h.lot.x_uts_kodu === 'string' ? h.lot.x_uts_kodu : h.s.utsKodu,
      varyantId: h.lot.product_id ? h.lot.product_id[0] : null,
      urunAdi: h.s.urunAdi,
      nitelik: h.s.nitelik || null,
      fiyat: h.s.fiyat,
      sablonSlug: 'gunes-gozlugu-katlanir',
      kaynak: 'ILK_KAYIT',
      lokasyon: h.s.lokasyon,
      adet: 1,
      basildi: new Date(h.s.basildi),
    })),
  });
  console.log(`✓ Yazıldı: ${r.count}`);
}

main()
  .catch((e) => {
    console.error('HATA', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
