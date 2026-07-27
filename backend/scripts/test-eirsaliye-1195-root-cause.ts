/**
 * e-İrsaliye 1195 kök neden testi — ANADEPO → GVN2 senaryosu
 * Kullanım: npx ts-node scripts/test-eirsaliye-1195-root-cause.ts
 */
import { prisma } from '../src/database/prisma';
import { getSupplierInfo } from '../src/modules/efatura/uyumsoft-efatura.service';
import {
  sendDespatch,
  queryOutboxDespatchStatus,
  resolveIrsaliyeNoForTransfer,
  saveIrsaliyeKayit,
} from '../src/modules/efatura/uyumsoft-irsaliye.service';
import type { DespatchPartyInfo } from '../src/modules/efatura/uyumsoft-irsaliye.service';

function supplierToParty(s: Awaited<ReturnType<typeof getSupplierInfo>>): DespatchPartyInfo {
  return {
    vkn: s.vkn,
    idScheme: s.idScheme,
    unvan: s.unvan,
    adres: s.adres,
    il: s.il,
    ilce: s.ilce,
    vergiDairesi: s.vergiDairesi,
    telefon: s.telefon,
    email: s.email,
  };
}

async function main() {
  const branches = await prisma.branch.findMany({
    where: { code: { in: ['ANADEPO', 'GVN2', 'GVN1', 'GVN3', 'GVN5'] } },
    select: { code: true, name: true, adres: true, il: true, ilce: true },
    orderBy: { code: 'asc' },
  });
  console.log('=== Branch DB (il/ilce/adres) ===');
  console.table(branches);

  console.log('\n=== getSupplierInfo (güncel merge) ===');
  for (const code of ['ANADEPO', 'GVN2']) {
    const info = await getSupplierInfo(code);
    console.log(code, { adres: info.adres, il: info.il, ilce: info.ilce, vkn: info.vkn });
  }

  const transferRef = `TEST-${Date.now()}`;
  const irsaliyeNo = await resolveIrsaliyeNoForTransfer(transferRef, 'ANADEPO');
  console.log('irsaliyeNo:', irsaliyeNo, `(${irsaliyeNo.length} karakter)`);
  const now = new Date();
  const gonderen = supplierToParty(await getSupplierInfo('ANADEPO'));
  const alici = supplierToParty(await getSupplierInfo('GVN2'));

  console.log('\n=== Test SendDespatch (outbox poll dahil) ===');
  console.log('transferRef:', transferRef);
  console.log('gonderen adres:', gonderen.adres);
  console.log('alici adres:', alici.adres);

  const result = await sendDespatch({
    irsaliyeNo,
    issueDate: now.toISOString().slice(0, 10),
    issueTime: now.toTimeString().slice(0, 8),
    sevkTarihi: now.toISOString().slice(0, 10),
    gonderen,
    alici,
    kalemler: [{
      sira: 1,
      urunAdi: 'TEST KONTAKT LENS',
      urunKodu: 'TEST-1',
      miktar: 1,
      birim: 'C62',
    }],
    transferRef,
    localDocumentId: transferRef,
    not: '1195 kök neden testi ANADEPO → GVN2',
  }, 'ng');

  console.log('\n=== sendDespatch sonucu ===');
  console.log(JSON.stringify(result, null, 2));

  if (result.basarili) {
    await saveIrsaliyeKayit({
      irsaliyeNo,
      sube: 'ANADEPO',
      transferRef,
      ettn: result.ettn,
      durum: result.outboxOnaylandi ? 'ONAYLANDI' : 'GONDERILDI',
    });
  }

  if (result.ettn) {
    const extra = await queryOutboxDespatchStatus(result.ettn, 'ng');
    console.log('\n=== Anlık outbox durumu ===');
    console.log(JSON.stringify(extra, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
