/**
 * Yarım kalmış (state='assigned', hiç tamamlanmamış) bir teslimatı, geçmişte
 * ZATEN SATILMIŞ ama Odoo'da hiç doğrulanmamış (validate edilmemiş) ürünler
 * için KAPATIR — Görkem'in kararı: bu ürün zaten müşteriye teslim edilmiş,
 * sadece Odoo'da hiç tamamlanmamış. Her move.line'a yeni bir lot atanır
 * (geçmişte tam olarak hangi lot/UTS olduğu artık bilinmediği için düz bir
 * "ESKI-TESLIMAT-..." ismi kullanılır — garanti/iade akışı GRS-... formatlı
 * lotları aradığı için bu YANILTICI bir gerçek-satış lotu GİBİ görünmez,
 * kolayca ayırt edilir), sonra picking button_validate ile tamamlanır.
 *
 * ÖNEMLİ: Bu script CANLI YAZMA yapar. Varsayılan olarak sadece NE
 * YAPILACAĞINI gösterir (dry-run). Gerçekten uygulamak için --confirm ekle.
 *
 * Kullanım:
 *   cd backend
 *   npm run kapat-eski-teslimat -- --picking=275            (önce dry-run)
 *   npm run kapat-eski-teslimat -- --picking=275 --confirm  (gerçekten uygula)
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

function parseArgs() {
  const pickingArg = process.argv.find((a) => a.startsWith('--picking='));
  const picking = pickingArg ? Number(pickingArg.split('=')[1]) : null;
  const confirm = process.argv.includes('--confirm');
  return { picking, confirm };
}

async function main() {
  const { picking, confirm } = parseArgs();
  if (!picking) {
    console.log('Kullanım: npm run kapat-eski-teslimat -- --picking=275 [--confirm]');
    process.exit(1);
  }

  const pickingData = (await execute(
    'stock.picking', 'read',
    [[picking]],
    { fields: ['id', 'name', 'state', 'partner_id', 'company_id'], context: { active_test: false } },
  )) as { id: number; name: string; state: string; partner_id: [number, string] | false; company_id: [number, string] | false }[];
  if (!pickingData.length) {
    console.log(`Picking #${picking} bulunamadı.`);
    return;
  }
  console.log('TESLİMAT:', JSON.stringify(pickingData[0]));

  if (pickingData[0].state === 'done') {
    console.log('Bu teslimat ZATEN tamamlanmış (done) — hiçbir şey yapılmadı.');
    return;
  }
  if (pickingData[0].state === 'cancel') {
    console.log('Bu teslimat ZATEN iptal edilmiş (cancel) — hiçbir şey yapılmadı.');
    return;
  }

  const moveLines = (await execute(
    'stock.move.line', 'search_read',
    [[['picking_id', '=', picking]]],
    { fields: ['id', 'product_id', 'quantity', 'lot_id'], context: { active_test: false } },
  )) as { id: number; product_id: [number, string]; quantity: number; lot_id: [number, string] | false }[];

  console.log(`\n${moveLines.length} satır bulundu:`);
  const eksikLot = moveLines.filter((l) => !l.lot_id);
  for (const l of moveLines) {
    console.log(`  move.line #${l.id} ürün #${l.product_id[0]} (${l.product_id[1]}) miktar=${l.quantity} lot=${l.lot_id ? l.lot_id[1] : 'YOK — atanacak'}`);
  }

  if (!confirm) {
    console.log('\n--- DRY-RUN --- Gerçekten uygulamak için sonuna --confirm ekleyip tekrar çalıştır.');
    console.log(`Yapılacaklar: ${eksikLot.length} satıra yeni lot atanacak, sonra teslimat tamamlanacak (button_validate).`);
    return;
  }

  const pickingCompanyId = pickingData[0].company_id ? pickingData[0].company_id[0] : false;

  for (const line of eksikLot) {
    const lotName = `ESKI-TESLIMAT-${pickingData[0].name}-${line.id}`;
    const lotId = Number(await execute('stock.lot', 'create', [{
      name: lotName,
      product_id: line.product_id[0],
      ...(pickingCompanyId ? { company_id: pickingCompanyId } : {}),
    }]));
    await execute('stock.move.line', 'write', [[line.id], { lot_id: lotId }]);
    console.log(`  move.line #${line.id} -> yeni lot #${lotId} (${lotName}) atandı`);
  }

  // Onarım: önceki bir çalıştırmada zaten oluşturulmuş olup, picking'in
  // şirketiyle uyuşmayan company_id'ye sahip lotları düzelt. Odoo bir lot
  // OLUŞTUKTAN SONRA company_id'sinin değiştirilmesine izin vermiyor
  // ("şirketini değiştirmek bu noktada yasaktır") — bu yüzden yanlış
  // şirketteki lotu (bu Odoo sürümünde stock.lot'ta 'active' alanı da
  // olmadığından arşivleyemiyoruz, sadece adını "İPTAL" olarak işaretliyoruz)
  // bırakıp, doğru şirkette YENİ bir lot oluşturup move.line'ı ona yönlendiriyoruz.
  if (pickingCompanyId) {
    const guncelMoveLines = (await execute(
      'stock.move.line', 'search_read',
      [[['picking_id', '=', picking]]],
      { fields: ['id', 'product_id', 'lot_id'], context: { active_test: false } },
    )) as { id: number; product_id: [number, string]; lot_id: [number, string] | false }[];
    const lotIds = guncelMoveLines.map((l) => l.lot_id && l.lot_id[0]).filter((x): x is number => !!x);
    if (lotIds.length) {
      const lots = (await execute(
        'stock.lot', 'read', [lotIds],
        { fields: ['id', 'name', 'company_id'], context: { active_test: false } },
      )) as { id: number; name: string; company_id: [number, string] | false }[];
      const lotById = new Map(lots.map((l) => [l.id, l]));
      for (const line of guncelMoveLines) {
        if (!line.lot_id) continue;
        const lot = lotById.get(line.lot_id[0]);
        if (!lot) continue;
        const dogruSirket = lot.company_id && lot.company_id[0] === pickingCompanyId;
        if (dogruSirket) continue;

        const yeniAd = `${lot.name}-V2`;
        const yeniLotId = Number(await execute('stock.lot', 'create', [{
          name: yeniAd,
          product_id: line.product_id[0],
          company_id: pickingCompanyId,
        }]));
        await execute('stock.move.line', 'write', [[line.id], { lot_id: yeniLotId }]);
        await execute('stock.lot', 'write', [[lot.id], { name: `${lot.name}-IPTAL-YANLIS-SIRKET` }]);
        console.log(`  lot #${lot.id} (${lot.name}) yanlış şirketteydi -> "İPTAL" olarak işaretlendi; move.line #${line.id} yeni lot #${yeniLotId} (${yeniAd}) ile değiştirildi`);
      }
    }
  }

  console.log('\nTeslimat tamamlanıyor (button_validate)...');
  // skip_backorder: eksik kalan miktar için "ek teslimat oluşturulsun mu?"
  // sihirbazını atlar. skip_sms: bu geçmiş/tarihi teslimat için müşteriye
  // SMS bildirimi sorulmasın (zaten gerçek teslimat çok önce yapılmıştı).
  const sonuc = await execute(
    'stock.picking', 'button_validate', [[picking]],
    { context: { skip_backorder: true, skip_sms: true } },
  );
  console.log('Sonuç:', JSON.stringify(sonuc));

  const after = (await execute(
    'stock.picking', 'read',
    [[picking]],
    { fields: ['id', 'name', 'state'], context: { active_test: false } },
  )) as { id: number; name: string; state: string }[];
  console.log('\nTESLİMAT (güncel durum):', JSON.stringify(after[0]));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
