/**
 * 19.11.2026 — Ürün girişinde müşteriye bağlanıp "geldi" sayılan ama mağaza transferi
 * "yeterli stok yok" ile düşen siparişleri düzelt. Neden: ürünün Odoo kartı "sarf" (stok
 * takipsiz) — depoda adet tutulmadığı için transfer yapılamıyordu (kod düzeltildi).
 *
 * Yapılan: sipariş TESLIM_ALINDI olur (15 dk sonra cron LABORATUVARDA'ya alır), mağazaya
 * "ürün geldi" bildirimi gider. Odoo stoğuna DOKUNULMAZ.
 * Atlananlar: bağlanan lotlardan biri stoklu ürünse ya da lot ürünü siparişteki üründen
 * farklıysa (elle kontrol).
 *
 *   npx ts-node --transpile-only scripts/ozel-siparis-sarf-geldi.ts [--confirm]
 */
import 'dotenv/config';
import * as fs from 'fs';
import { prisma } from '../src/database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';
import { updateOzelSiparisDurum } from '../src/modules/ozel-siparis/ozel-siparis.service';
import { BEKLEYEN_SIPARIS_DURUMLARI } from '../src/modules/admin/urun-giris-siparis.service';

const confirm = process.argv.includes('--confirm');
const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const sade = (x: string) => x.replace(/^\[.*?\]\s*/, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR');

async function main() {
  console.log(confirm ? '=== UYGULA ===' : '=== KURU (hiçbir şey değişmez) ===');
  const ss = await prisma.ozelSiparis.findMany({
    where: { urunGirisNo: { not: null }, durum: { in: BEKLEYEN_SIPARIS_DURUMLARI } },
    include: { karekodlar: true, logs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { urunGirisTarihi: 'asc' },
  });
  const adaylar = ss.filter((s) => (s.gelenAdet ?? 0) >= Math.max(1, s.miktar ?? 1) && /yeterli stok yok/i.test(s.logs[0]?.notlar ?? ''));
  console.log(`Geldi sayılıp transferi "stok yok" ile düşen sipariş: ${adaylar.length}\n`);
  const kayit: unknown[] = [];
  let yapilan = 0;
  for (const s of adaylar) {
    const lotlar: Array<{ id: number; name: string; product_id: [number, string] }> = [];
    for (const k of s.karekodlar) {
      const r = (await execute('stock.lot', 'search_read', [['|', '|', ['name', '=', k.karekod], ['ref', '=', k.karekod], ['x_uts_kodu', '=', k.karekod]]], { fields: ['id', 'name', 'product_id'], limit: 1, ...CTX })) as any[];
      if (r[0]) lotlar.push(r[0]);
    }
    const pids = [...new Set(lotlar.map((l) => l.product_id[0]))];
    const urunler = pids.length ? ((await execute('product.product', 'read', [pids], { fields: ['id', 'type', 'display_name'], ...CTX })) as any[]) : [];
    const stoklu = urunler.filter((u) => u.type === 'product');
    const farkli = lotlar.filter((l) => sade(l.product_id[1]) !== sade(s.urunAdi));
    let karar = 'GELDİ YAPILACAK';
    if (!lotlar.length) karar = 'ATLANDI — bağlı lot Odoo\'da bulunamadı';
    else if (stoklu.length) karar = 'ATLANDI — stoklu ürün var (transfer gerekir)';
    else if (farkli.length) karar = `ATLANDI — bağlanan cam farklı ürün: ${farkli.map((f) => f.product_id[1]).join(', ')} (kontrol edin)`;
    console.log(`${s.musteriAdi} | ${s.subeId} | ${s.urunAdi} | ${s.miktar}/${s.gelenAdet} | ${s.urunGirisNo}`);
    console.log(`   → ${karar}`);
    if (!confirm || karar !== 'GELDİ YAPILACAK') continue;
    await updateOzelSiparisDurum(s.id, {
      durum: 'TESLIM_ALINDI',
      userId: null,
      notlar: `Ürün girişi ${s.urunGirisNo} — ürün kartı stok takipsiz ("sarf"); sistem transferi gerekmez. Ürünü fiziki olarak ${s.subeId} gönderin.`,
      notSadeceGecmise: true,
      bildirimGonder: true,
      bildirimOzel: { baslik: `Müşteri ürünü geldi — ${s.musteriAdi}`, mesaj: `${s.urunAdi} · depodan ${s.subeId} mağazasına gönderilecek` },
    });
    yapilan++;
    kayit.push({ siparisId: s.id, musteri: s.musteriAdi, eskiDurum: s.durum });
  }
  const silinenNot = await prisma.ozelSiparis.count({
    where: { OR: [{ notlar: { startsWith: 'Otomatik: Teslim alındıktan' } }, { notlar: { startsWith: 'Ürün girişi GRS-' } }] },
  });
  console.log(`\nBilgi: asıl notu otomatik notla ezilmiş sipariş sayısı: ${silinenNot} (kod düzeltildi; bundan sonra ezilmeyecek)`);
  if (confirm) {
    const dosya = `/root/ozel-siparis-sarf-geldi-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(dosya, JSON.stringify(kayit, null, 2));
    console.log(`\nTAMAM — ${yapilan} sipariş "geldi" yapıldı. Kayıt: ${dosya}`);
  } else console.log('\n--- KURU --- Hiçbir şey değişmedi.');
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
