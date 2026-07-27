/**
 * CreateStartDate vs ExecutionStartDate — hangisi gerçek fatura tarihine daha yakın?
 */
import 'dotenv/config';
import { getInboxInvoice, getInboxInvoiceList } from '../src/modules/uyumsoft/uyumsoft.service';

const SIRKET = process.argv[2] ?? 'ng';
const BAS = process.argv[3] ?? '2026-07-08';
const BIT = process.argv[4] ?? '2026-07-12';

function dateAtStart(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}
function dateAtEnd(iso: string) {
  return new Date(`${iso.slice(0, 10)}T23:59:59.999Z`);
}

async function karsilastir(
  etiket: string,
  query: Parameters<typeof getInboxInvoiceList>[1],
) {
  const list = await getInboxInvoiceList(SIRKET, { ...query, pageSize: 10, pageIndex: 0, onlyUnread: false });
  console.log(`\n=== ${etiket} (${list.items.length} kayıt) ===`);
  for (const item of list.items.slice(0, 5)) {
    const detay = item.documentId ? await getInboxInvoice(SIRKET, item.documentId) : null;
    const issueDate = detay?.issueDate ?? '';
    const listExecution = item.issueDate ?? '';
    const createUtc = item.createDateUtc?.slice(0, 10) ?? '';
    const issueMatch = issueDate === listExecution;
    const inRange = issueDate >= BAS && issueDate <= BIT;
    console.log({
      invoiceNo: detay?.invoiceNo ?? item.invoiceId,
      listExecutionDate: listExecution,
      ublIssueDate: issueDate,
      createDateUtc: createUtc,
      executionMatchesIssue: issueMatch,
      issueInSelectedRange: inRange,
    });
  }
}

async function main() {
  const bas = dateAtStart(BAS);
  const bit = dateAtEnd(BIT);
  const wideCreateBas = new Date(bas.getTime() - 120 * 86400000);
  const wideCreateBit = new Date(Math.max(bit.getTime(), Date.now()) + 7 * 86400000);

  console.log(`Şirket=${SIRKET} hedef fatura aralığı=${BAS}..${BIT}`);

  await karsilastir('SADECE CreateStartDate/CreateEndDate', {
    createStartDate: bas,
    createEndDate: bit,
  });

  await karsilastir('SADECE ExecutionStartDate/ExecutionEndDate', {
    createStartDate: wideCreateBas,
    createEndDate: wideCreateBit,
    executionStartDate: bas,
    executionEndDate: bit,
  });

  await karsilastir('Execution + geniş Create (yeni varsayılan)', {
    createStartDate: wideCreateBas,
    createEndDate: wideCreateBit,
    executionStartDate: bas,
    executionEndDate: bit,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
