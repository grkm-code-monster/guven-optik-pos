/**
 * 12.10.2026 tarihli Excel envanter importu yanlışlıkla ANADEPO'ya
 * atılmıştı (olması gereken: GVN2). Bu script, o import'taki barkodları
 * ANADEPO'da bulup GVN2'ye bir TRANSFER (stock.picking) ile gönderir —
 * doğrudan stok silip yeniden yazmaz, mevcut "Transferler" mekanizmasını
 * (baslatTransfer) kullanır. Transfer GVN2 tarafında normal şekilde
 * "Bekleyen Transferler" ekranından kabul edilmesi gerekir.
 *
 * Varsayılan: DRY RUN (hiçbir şey yazmaz, sadece ANADEPO'da ne bulduğunu
 * ve ne önereceğini listeler).
 * Gerçek çalıştırma: --execute
 *
 * Kullanım:
 *   npm run envanter-yanlis-lokasyon-duzelt
 *   npm run envanter-yanlis-lokasyon-duzelt -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { baslatTransfer } from '../src/modules/transfer/transfer-core.service';
import { LOKASYON_ID_MAP } from '../src/modules/odoo/odooLocations';

const KAYNAK_LOKASYON = 'ANADEPO';
const HEDEF_LOKASYON = 'GVN2';

// Excel'deki barkod + beklenen adet (12.10.2026 importu)
const SATIRLAR: { barkod: string; adet: number; urunAdi: string }[] = [
  { barkod: '8682037221393', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2237MG C2' },
  { barkod: '8682037236670', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2248MG C2' },
  { barkod: '8682037097608', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2108MG C1' },
  { barkod: '8682037109028', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2217MG C2' },
  { barkod: '8682037315573', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3788OG C3' },
  { barkod: '8682037339470', adet: 2, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2657MG C2' },
  { barkod: '8682037306526', adet: 1, urunAdi: 'HAWK GÜNEŞ GÖZLÜĞÜ HW2233HG C3' },
  { barkod: '8682037335175', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3840OG C1' },
  { barkod: '49376873478796099584', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3600OG C3' },
  { barkod: '8682037302641', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3700OG C3' },
  { barkod: '8682037097622', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2108MG C3' },
  { barkod: '8682037107468', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3176OG C2' },
  { barkod: '8682037333621', adet: 1, urunAdi: 'HAWK GÜNEŞ GÖZLÜĞÜ HW2284HG C3' },
  { barkod: '8682037323547', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3746OG C2' },
  { barkod: '8698716199167', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU1200MG C1' },
  { barkod: '8682037316396', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2586MG C2' },
  { barkod: '457885448845436992', adet: 1, urunAdi: 'HAWK GÜNEŞ GÖZLÜĞÜ HW2240HG C1' },
  { barkod: '8682037273101', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2387MG C1' },
  { barkod: '8682037336882', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2648MG C3' },
  { barkod: '8682037336875', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2648MG C2' },
  { barkod: '8682037276010', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2388MG C5' },
  { barkod: '8682037107383', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3173OG C3' },
  { barkod: '8682037339463', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2657MG C1' },
  { barkod: '8698716148875', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU1116MG C7' },
  { barkod: '8698716148813', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU1116MG C1' },
  { barkod: '8682037221409', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2237MG C3' },
  { barkod: '8682037339487', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2657MG C3' },
  { barkod: '8682037328184', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2108MG C4' },
  { barkod: '8682037236656', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2248MG C4' },
  { barkod: '8682037339517', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2658MG C3' },
  { barkod: '8682037339920', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2672MG C2' },
  { barkod: '8682037316167', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3791OG C1' },
  { barkod: '8682037273156', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2388MG C2' },
  { barkod: '8682037337582', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3867OG C2' },
  { barkod: '8682037338329', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3882OG C1' },
  { barkod: '8682037311896', adet: 1, urunAdi: 'MUSTANG GÜNEŞ GÖZLÜĞÜ MU2528MG C3' },
  { barkod: '8682037323707', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3751OG C3' },
  { barkod: '8682037295844', adet: 1, urunAdi: 'HAWK GÜNEŞ GÖZLÜĞÜ HW2205HG C3' },
  { barkod: '8682037302047', adet: 1, urunAdi: 'OSSE GÜNEŞ GÖZLÜĞÜ OS3659OG C2' },
  { barkod: '9252252034840', adet: 1, urunAdi: 'LEGION KIDS GÜNEŞ GÖZLÜĞÜ 2034LG CB8' },
  { barkod: '29346252252034340', adet: 1, urunAdi: 'LEGION KIDS GÜNEŞ GÖZLÜĞÜ 2034LG CB3' },
  { barkod: '293462522520342440', adet: 1, urunAdi: 'LEGION KIDS GÜNEŞ GÖZLÜĞÜ 2034LG CB4' },
  { barkod: '08680994021575', adet: 1, urunAdi: 'MASSIMO MILANO KIDS OPTİK ÇERÇEVE 5004MO C502' },
  { barkod: '9876543456787654', adet: 1, urunAdi: 'EYE EMPIRE KIDS OPTİK ÇERÇEVE 101EO C1' },
  { barkod: '08681715132100', adet: 1, urunAdi: 'LEGION KIDS OPTİK ÇERÇEVE 558LO C7' },
  { barkod: '08680256423116', adet: 1, urunAdi: 'SWING KIDS OPTİK ÇERÇEVE TR160SO CP222' },
  { barkod: '08680279103194', adet: 1, urunAdi: 'PARADOX KIDS OPTİK ÇERÇEVE 221PO C9172' },
  { barkod: '08680186141012', adet: 1, urunAdi: 'SWING KIDS OPTİK ÇERÇEVE TR027SO C19' },
  { barkod: '08831219337678', adet: 1, urunAdi: 'LACOSTE KIDS OPTİK ÇERÇEVE L3609LO C424' },
  { barkod: '01086817151320992121121112910211129', adet: 1, urunAdi: 'LEGION KIDS OPTİK ÇERÇEVE 557LO C105' },
];

function parseArgs() {
  return { execute: process.argv.includes('--execute') };
}

type Quant = { id: number; product_id: [number, string]; lot_id: [number, string] | false; quantity: number };

async function main() {
  const { execute: doExecute } = parseArgs();
  const kaynakLocId = LOKASYON_ID_MAP[KAYNAK_LOKASYON];
  const hedefLocId = LOKASYON_ID_MAP[HEDEF_LOKASYON];

  console.log(`${doExecute ? 'GERÇEK ÇALIŞTIRMA' : 'DRY RUN (önizleme)'} — ${SATIRLAR.length} barkod, ${KAYNAK_LOKASYON} → ${HEDEF_LOKASYON}\n`);

  const kalemler: { productId: number; miktar: number; urunAdi: string; lotId: number | null }[] = [];
  const sorunlular: string[] = [];

  for (const satir of SATIRLAR) {
    const barkod = satir.barkod.trim();
    const products = (await execute(
      'product.product', 'search_read',
      [[['barcode', '=', barkod]]],
      { fields: ['id', 'name'], limit: 2 },
    )) as { id: number; name: string }[];

    if (products.length !== 1) {
      console.log(`✗ ${satir.urunAdi} (${barkod}) — ürün ${products.length === 0 ? 'bulunamadı' : 'birden fazla eşleşti'}`);
      sorunlular.push(`${satir.urunAdi}: ürün ${products.length === 0 ? 'bulunamadı' : 'belirsiz'}`);
      continue;
    }
    const productId = products[0].id;

    const quants = (await execute(
      'stock.quant', 'search_read',
      [[
        ['product_id', '=', productId],
        ['location_id', '=', kaynakLocId],
        ['quantity', '>', 0],
      ]],
      { fields: ['id', 'product_id', 'lot_id', 'quantity'], limit: 10 },
    )) as Quant[];

    if (!quants.length) {
      console.log(`✗ ${satir.urunAdi} (${barkod}) — ${KAYNAK_LOKASYON}'da stok bulunamadı (#${productId})`);
      sorunlular.push(`${satir.urunAdi}: ${KAYNAK_LOKASYON}'da stok yok`);
      continue;
    }

    const toplamMevcut = quants.reduce((s, q) => s + q.quantity, 0);
    const tasinacak = Math.min(satir.adet, toplamMevcut);
    const lotId = quants[0].lot_id ? quants[0].lot_id[0] : null;

    console.log(
      `• ${satir.urunAdi} (${barkod}) — #${productId}, ${KAYNAK_LOKASYON}'da ${toplamMevcut} adet, ` +
      `${tasinacak} adet taşınacak${lotId ? ` (lot #${lotId})` : ' (lotsuz)'}`,
    );

    kalemler.push({ productId, miktar: tasinacak, urunAdi: satir.urunAdi, lotId });
  }

  console.log(`\n======================================================================`);
  console.log(`Taşınacak kalem: ${kalemler.length}, sorunlu: ${sorunlular.length}`);
  if (sorunlular.length) {
    console.log(`\nSorunlular:`);
    for (const s of sorunlular) console.log(`  - ${s}`);
  }

  if (!doExecute) {
    console.log(`\nDRY RUN bitti — gerçekten transfer oluşturmak için --execute ekleyin.`);
    return;
  }

  if (!kalemler.length) {
    console.log('\nTaşınacak kalem yok, transfer oluşturulmadı.');
    return;
  }

  const sonuc = await baslatTransfer({
    kaynakLocationId: kaynakLocId,
    hedefLocationId: hedefLocId,
    kalemler: kalemler.map((k) => ({
      productId: k.productId,
      resolvedProductId: k.productId,
      miktar: k.miktar,
      urunAdi: k.urunAdi,
      lotId: k.lotId,
    })),
    notlar: 'Yanlış lokasyona (ANADEPO) atılan 12.10.2026 Excel envanter importunun düzeltilmesi',
  });

  console.log('\nTransfer sonucu:', JSON.stringify(sonuc, null, 2));
  if (sonuc.success) {
    console.log(`\n✓ Transfer oluşturuldu (${sonuc.pickingName ?? sonuc.kabulPickingId}). ${HEDEF_LOKASYON} tarafında "Bekleyen Transferler" ekranından kabul edilmesi gerekiyor.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
