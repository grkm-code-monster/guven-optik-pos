/**
 * 19.11.2026 — Ürün girişinde siparişe bağlanmadan (ya da yanlış bağlanarak) stoğa girmiş lotları
 * bekleyen bir müşteri siparişine sonradan bağlar. Stok hareketi YAPMAZ (lotlar bulunduğu yerde kalır).
 *
 * Adaylar:  npx ts-node --transpile-only scripts/lot-siparise-bagla.ts --lotlar=16457,16458 --ara=PRIME
 * Bağla:    npx ts-node --transpile-only scripts/lot-siparise-bagla.ts --lotlar=16457,16458 --siparis=<id> [--confirm]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../src/modules/odoo/odoo.service';
import { bekleyenMusteriSiparisleri, kalemSiparisleriniAc } from '../src/modules/admin/urun-giris-siparis.service';
import { updateOzelSiparisDurum } from '../src/modules/ozel-siparis/ozel-siparis.service';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const confirm = process.argv.includes('--confirm');
const fold = (s: string) => (s ?? '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
const d2 = (v: number | null) => (v == null ? '·' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);

async function main() {
  const lotIds = String(arg('lotlar') ?? '').split(',').map(Number).filter((x) => x > 0);
  if (!lotIds.length) throw new Error('--lotlar=ID,ID zorunlu');
  const lotlar = (await execute('stock.lot', 'read', [lotIds], { fields: ['id', 'name', 'ref', 'product_id', 'company_id'], ...CTX })) as any[];
  console.log('== LOTLAR');
  for (const l of lotlar) {
    const q = (await execute('stock.quant', 'search_read', [[['lot_id', '=', l.id], ['quantity', '>', 0]]], { fields: ['location_id', 'quantity'], ...CTX })) as any[];
    const ml = (await execute('stock.move.line', 'search_read', [[['lot_id', '=', l.id]]], { fields: ['picking_id', 'date', 'location_dest_id'], order: 'date asc', ...CTX })) as any[];
    console.log(`  #${l.id} ${l.name} | ${l.product_id[1]} | ref ${l.ref || '-'} | şimdi: ${q.map((x) => x.location_id[1]).join(', ') || 'stokta yok'}`);
    for (const m of ml) console.log(`     ${String(m.date).slice(0, 16)} ${m.picking_id?.[1] ?? '-'} → ${m.location_dest_id[1]}`);
  }
  const hedef = arg('siparis');
  if (!hedef) {
    const ara = fold(arg('ara') ?? lotlar[0]?.product_id?.[1]?.split(' ')[0] ?? '');
    const liste = (await bekleyenMusteriSiparisleri()).filter((s) => !s.geldi && fold(`${s.urunAdi} ${s.odooUrunAdi ?? ''}`).includes(ara));
    console.log(`\n== "${ara}" içeren bekleyen müşteri siparişleri: ${liste.length}`);
    liste.forEach((s, i) => {
      const r = s.recete;
      console.log(`\n ${i + 1}) ${s.musteriAdi} | ${s.subeId ?? '-'} | ${new Date(s.olusturma).toLocaleDateString('tr-TR')} | ${s.urunAdi} | kalan ${s.kalan}/${s.miktar} | ${s.durum}`);
      console.log(`    Sağ ${d2(r.sagSph)} ${d2(r.sagCyl)} x${r.sagAks ?? '·'}  Sol ${d2(r.solSph)} ${d2(r.solCyl)} x${r.solAks ?? '·'}`);
      console.log(`    bağlamak için: --siparis=${s.id}`);
    });
    await prisma.$disconnect();
    return;
  }
  console.log(confirm ? '\n=== UYGULA ===' : '\n=== KURU (hiçbir şey değişmez) ===');
  let siparisId = hedef;
  const aday = (await bekleyenMusteriSiparisleri()).find((s) => s.id === hedef);
  if (!aday) throw new Error('Sipariş bekleyenler arasında yok');
  if (aday.kalan < lotlar.length) throw new Error(`Siparişte kalan ${aday.kalan}, lot ${lotlar.length}`);
  console.log(`Bağlanacak: ${aday.musteriAdi} | ${aday.subeId} | ${aday.urunAdi} ← ${lotlar.map((l) => l.name).join(', ')}`);
  if (!confirm) {
    console.log('--- KURU --- Uygulamak için --confirm ekleyin.');
    await prisma.$disconnect();
    return;
  }
  if (siparisId.startsWith('kalem:')) {
    const m = await kalemSiparisleriniAc([siparisId], null);
    siparisId = m.get(siparisId) ?? '';
    if (!siparisId) throw new Error('Sipariş kaydı açılamadı');
  }
  const s = await prisma.ozelSiparis.findUniqueOrThrow({ where: { id: siparisId } });
  const girisNo = String(lotlar[0].name).match(/^(GRS-\d{4}-\d{2}-\d+)/)?.[1] ?? null;
  await prisma.ozelSiparisKarekod.createMany({ data: lotlar.map((l) => ({ siparisId, karekod: l.name })) });
  const yeniGelen = (s.gelenAdet ?? 0) + lotlar.length;
  await prisma.ozelSiparis.update({ where: { id: siparisId }, data: { gelenAdet: yeniGelen, urunGirisNo: girisNo, urunGirisTarihi: new Date(), gercekGelisTarihi: new Date() } });
  const not = `Sonradan bağlandı: ${lotlar.map((l) => l.name).join(', ')} (${girisNo ?? 'giriş'}) — stok hareketi yapılmadı, ürün bulunduğu yerde`;
  if (yeniGelen >= Math.max(1, s.miktar ?? 1)) {
    await updateOzelSiparisDurum(siparisId, { durum: 'TESLIM_ALINDI', notlar: not, notSadeceGecmise: true, bildirimGonder: true, bildirimOzel: { baslik: `Müşteri ürünü geldi — ${s.musteriAdi}`, mesaj: `${s.urunAdi} · ${s.subeId} stoğunda` } });
  } else {
    await prisma.ozelSiparisLog.create({ data: { siparisId, eskiDurum: s.durum, yeniDurum: s.durum, notlar: `Kısmi (${yeniGelen}/${s.miktar}) — ${not}` } });
  }
  console.log(`TAMAM — ${s.musteriAdi} siparişine bağlandı (${yeniGelen}/${s.miktar}).`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error('HATA:', e?.message ?? e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
