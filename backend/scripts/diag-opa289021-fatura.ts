/**
 * OPA2026000289021 — Uyumsoft gelen fatura teşhisi
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { getInboxInvoice, getInboxInvoiceList } from '../src/modules/uyumsoft/uyumsoft.service';

const FATURA_NO = 'OPA2026000289021';
const ARAMA_PARCALARI = ['OPA2026000289021', '289021', '0289021'];

async function dbKayitlari() {
  console.log('\n=== VERİTABANI KAYITLARI ===');
  const kayitlar = await prisma.bekleyenFatura.findMany({
    where: {
      girisTipi: 'UYUMSOFT_GELEN',
      OR: [
        { uyumsoftNo: { contains: '289021' } },
        { uyumsoftNo: { contains: FATURA_NO } },
        { aciklama: { contains: '289021' } },
      ],
    },
    take: 10,
  });
  if (!kayitlar.length) {
    console.log('DB\'de eşleşen kayıt yok');
    return;
  }
  for (const k of kayitlar) {
    let veri: Record<string, unknown> | null = null;
    try {
      veri = k.uyumsoftVeri ? JSON.parse(k.uyumsoftVeri) : null;
    } catch {
      veri = null;
    }
    console.log({
      id: k.id,
      uyumsoftNo: k.uyumsoftNo,
      uyumsoftEttn: k.uyumsoftEttn,
      sirket: k.uyumsoftSirketId,
      tedarikciAdi: k.tedarikciAdi,
      issueDate: veri?.issueDate,
      lineCount: Array.isArray(veri?.lines) ? (veri.lines as unknown[]).length : 0,
      taxExclusive: veri?.taxExclusiveAmount,
      durum: k.durum,
      uyumsoftDurum: k.uyumsoftDurum,
      createdAt: k.createdAt.toISOString(),
    });
  }
}

async function uyumsoftTara() {
  console.log('\n=== UYUMSOFT INBOX TARAMASI ===');
  for (const sirketId of ['ng', 'adese', 'potential']) {
    console.log(`\n--- şirket: ${sirketId} ---`);
    let bulundu = false;

    for (const onlyUnread of [true, false]) {
      for (let page = 0; page < 30; page++) {
        const list = await getInboxInvoiceList(sirketId, {
          pageIndex: page,
          pageSize: 50,
          onlyUnread,
          createStartDate: new Date(Date.now() - 365 * 86400000),
        }).catch((e: Error) => {
          console.log(`  liste hatası (onlyUnread=${onlyUnread}, page=${page}): ${e.message}`);
          return null;
        });
        if (!list) break;

        for (const item of list.items) {
          const birlesik = `${item.invoiceId} ${item.documentId}`.toLowerCase();
          if (ARAMA_PARCALARI.some((p) => birlesik.includes(p.toLowerCase()))) {
            console.log('  LISTEDE BULUNDU:', {
              onlyUnread,
              page,
              invoiceId: item.invoiceId,
              documentId: item.documentId,
              executionDate: item.issueDate,
              status: item.status,
              isNew: item.isNew,
              isSeen: item.isSeen,
              createDateUtc: item.createDateUtc,
              taxExclusiveAmount: item.taxExclusiveAmount,
            });
            bulundu = true;

            const detay = await getInboxInvoice(sirketId, item.documentId);
            if (!detay) {
              console.log('  DETAY: null');
              continue;
            }
            console.log('  DETAY:', {
              invoiceNo: detay.invoiceNo,
              issueDate: detay.issueDate,
              supplierTitle: detay.supplierTitle,
              supplierVkn: detay.supplierVkn,
              lineCount: detay.lines.length,
              taxExclusiveAmount: detay.taxExclusiveAmount,
              payableAmount: detay.payableAmount,
              ilkSatir: detay.lines[0] ?? null,
            });
          }
        }

        if (list.items.length < list.pageSize) break;
      }
    }

    if (!bulundu) console.log('  365 gün taramasında bulunamadı');
  }
}

async function main() {
  await dbKayitlari();
  await uyumsoftTara();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
