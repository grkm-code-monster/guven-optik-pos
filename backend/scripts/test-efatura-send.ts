import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { ItemStatus } from '@prisma/client';
import {
  eFaturaGonder,
  faturaNoUret,
  satistenFaturaData,
} from '../src/modules/efatura/uyumsoft-efatura.service';

const SATIS_ID = process.argv[2] ?? '70244f4b-eaa2-489d-b462-5ac7996d7b42';

async function main() {
  const satis = await prisma.sale.findUnique({
    where: { id: SATIS_ID },
    include: {
      items: { include: { product: true }, where: { status: { not: ItemStatus.VOID } } },
      customer: true,
    },
  });
  if (!satis) {
    console.error('Satış bulunamadı:', SATIS_ID);
    process.exit(1);
  }

  const branch = await prisma.branch.findUnique({ where: { id: satis.branchId } });
  const branchCode = branch?.code ?? 'GVN1';
  const count = await prisma.fatura.count({ where: { sube: branchCode } });
  const faturaNo = faturaNoUret(branchCode, count + 1);
  const faturaData = await satistenFaturaData(satis, faturaNo, branchCode, branch);

  console.log('Şube:', branchCode, '| Fatura No:', faturaNo, '| Müşteri:', faturaData.aliciAdi);
  const sonuc = await eFaturaGonder(faturaData, branch);
  console.log(JSON.stringify(sonuc, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
