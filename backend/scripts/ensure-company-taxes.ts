/**
 * NG / ADESE / POTENTIAL şirketlerinde chart şablonundan %20 vergi kayıtlarını oluşturur.
 * Kullanım: npx ts-node scripts/ensure-company-taxes.ts
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { ensureStandardCompanyTaxes } from '../src/modules/odoo/odoo-tax.util';

const SIRKET_ADLARI: Record<number, string> = {
  2: 'NG',
  3: 'ADESE',
  4: 'POTENTIAL',
};

async function listCompanyTaxes(companyId: number) {
  return execute(
    'account.tax',
    'search_read',
    [[['company_id', '=', companyId], ['active', '=', true], ['amount_type', '=', 'percent']]],
    { fields: ['id', 'name', 'type_tax_use', 'amount', 'price_include', 'company_id'], order: 'type_tax_use,amount' },
    companyId,
  );
}

async function main() {
  console.log('=== Şirket vergileri (önce) ===');
  for (const cid of [2, 3, 4]) {
    const taxes = await listCompanyTaxes(cid);
    console.log(`\n${SIRKET_ADLARI[cid]} (company ${cid}): ${taxes.length} kayıt`);
    for (const t of taxes) {
      console.log(`  #${t.id} ${t.name} ${t.type_tax_use} ${t.amount}% price_include=${t.price_include}`);
    }
  }

  console.log('\n=== ensureStandardCompanyTaxes çalıştırılıyor ===');
  const created = await ensureStandardCompanyTaxes([2, 3, 4], [20]);
  for (const row of created) {
    const label = SIRKET_ADLARI[row.companyId] ?? String(row.companyId);
    console.log(
      `${label} ${row.type} ${row.rate}% price_include=${row.priceInclude} → tax_id=${row.taxId ?? 'NULL'}`,
    );
  }

  console.log('\n=== Şirket vergileri (sonra) ===');
  for (const cid of [2, 3, 4]) {
    const taxes = await listCompanyTaxes(cid);
    console.log(`\n${SIRKET_ADLARI[cid]} (company ${cid}): ${taxes.length} kayıt`);
    for (const t of taxes) {
      console.log(`  #${t.id} ${t.name} ${t.type_tax_use} ${t.amount}% price_include=${t.price_include}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
