import { prisma } from '../src/database/prisma';
import { mukellefiyetSorgula, tetikleSatisEFatura } from '../src/modules/efatura/uyumsoft-efatura.service';
import { listTransferAksiyonLogs } from '../src/modules/transfer/transfer-aksiyon-log.service';
import { queryOutboxDespatchStatus } from '../src/modules/efatura/uyumsoft-irsaliye.service';

const SALE_ID = 'e021d034-37e0-4fea-bef6-6637a7319c9f';
const TRANSFER_REF = 'TRANSFER-1784639534663';

async function main() {
  const sale = await prisma.sale.findUnique({
    where: { id: SALE_ID },
    include: { customer: true },
  });
  console.log('customer:', sale?.customer?.name, 'identity:', sale?.customer?.identityNo);
  if (sale?.customer?.identityNo) {
    const muk = await mukellefiyetSorgula(sale.customer.identityNo, 'ng');
    console.log('mukellef:', muk);
  }

  const logs = await listTransferAksiyonLogs({ transferRef: TRANSFER_REF, limit: 20 });
  console.log('\n=== transfer logs ===');
  console.log(JSON.stringify(logs, null, 2));

  const eirsLog = logs.find((l) => l.aksiyon === 'EIRSALIYE');
  if (eirsLog?.kayitId) {
    const outbox = await queryOutboxDespatchStatus(eirsLog.kayitId, 'ng');
    console.log('\n=== outbox (kayitId=ettn) ===');
    console.log(JSON.stringify(outbox, null, 2));
  }

  console.log('\n=== e-Fatura yeniden deneme ===');
  await tetikleSatisEFatura(SALE_ID);
  const updated = await prisma.sale.findUnique({ where: { id: SALE_ID } });
  const lastKuyruk = await prisma.faturaKuyruk.findFirst({
    where: { satisId: SALE_ID },
    orderBy: { createdAt: 'desc' },
  });
  console.log('eFaturaDurum:', updated?.eFaturaDurum, 'eFaturaId:', updated?.eFaturaId);
  console.log('last kuyruk hata:', lastKuyruk?.hata);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
