import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { ItemStatus } from '@prisma/client';
import {
  buildUBLXML,
  eFaturaGonder,
  faturaNoUret,
  getSupplierInfo,
  satistenFaturaData,
  subeToSirketAyarId,
} from '../src/modules/efatura/uyumsoft-efatura.service';
import { sendInvoice, clearUyumsoftClientCache } from '../src/modules/uyumsoft/uyumsoft.service';

const SALE_ID = 'e021d034-37e0-4fea-bef6-6637a7319c9f';

async function tryEarsiv(sirketId: string, branchCode: string) {
  clearUyumsoftClientCache();
  const satis = await prisma.sale.findUnique({
    where: { id: SALE_ID },
    include: {
      items: { include: { product: true }, where: { status: { not: ItemStatus.VOID } } },
      customer: true,
    },
  });
  if (!satis) throw new Error('sale not found');
  const branch = await prisma.branch.findUnique({ where: { id: satis.branchId } });
  const count = await prisma.fatura.count({ where: { sube: branchCode } });
  const faturaNo = faturaNoUret(branchCode, count + 99);
  const faturaData = await satistenFaturaData(satis, faturaNo, branchCode, branch);
  const supplier = await getSupplierInfo(branchCode, branch);
  const xml = buildUBLXML(faturaData, 'EARSIVFATURA', supplier);
  const ettn = xml.match(/<cbc:UUID>([^<]+)<\/cbc:UUID>/)?.[1] ?? 'TEST';
  console.log(`\n=== EARSIV deneme sirketId=${sirketId} supplierVkn=${supplier.vkn} ===`);
  const res = await sendInvoice(sirketId, {
    faturaNo,
    ettn,
    faturaTarihi: faturaData.faturaTarihi,
    profileId: 'EARSIVFATURA',
    supplierVkn: supplier.vkn,
    aliciVkn: faturaData.aliciVkn,
    aliciAdi: faturaData.aliciAdi,
    xmlContent: xml,
  });
  console.log(JSON.stringify(res, null, 2));
}

async function main() {
  console.log('subeToSirket ng GVN2:', subeToSirketAyarId('GVN2'));
  await tryEarsiv('ng', 'GVN2');
  await tryEarsiv('adese', 'GVN1');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
