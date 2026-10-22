/**
 * 22.10.2026 KDV hatası teşhisi — SALT OKUNUR, hiçbir kayıt DEĞİŞTİRMEZ.
 *
 * Kök neden (düzeltildi — bkz. sale.service.ts recalcSaleTotals): kalem
 * eklenirken/satış onaylanırken doğru resolve edilen KDV oranı, her
 * recalcSaleTotals çağrısında resolveSaleItemTaxRate'in inputTaxRate'siz
 * yeniden çalışmasıyla sessizce kaybolabiliyordu.
 *
 * İlk dökümde görüldü ki bu mağazada satış kalemlerinin NEREDEYSE TAMAMI
 * Odoo ürünlerine bağlı (odooProductId dolu, yerel Product sadece
 * "__ODOO_PLACEHOLDER__" / kategori=ACCESSORY) — yani resolveSaleItemTaxRate
 * yerel kategoriye değil, Odoo'daki ürünün KDV'sine bakıyor
 * (readProductSaleTaxRate). Bu yüzden "yerel kategori %10 mi" testi işe
 * yaramadı; bunun yerine HER kalem için Odoo'dan GERÇEK, GÜNCEL KDV oranı
 * canlı okunup kayıtlı taxRate ile karşılaştırılıyor. Fark varsa şüpheli
 * olarak işaretlenir.
 *
 * ÖNEMLİ: Bu script HİÇBİR ŞEYİ OTOMATİK DÜZELTMEZ, sadece Odoo'dan SALT
 * OKUNUR okuma yapar ve karşılaştırır. Düzeltme, admin panelindeki mevcut
 * "KDV Düzeltme" ekranından elle yapılır (her düzeltme AuditLog'a yazılır,
 * Odoo faturasına dokunulmaz).
 *
 * Kullanım:
 *   npm run kdv-20ye-yanlis-dusmus-satirlar -- 2026-10-22
 *   (tarih verilmezse bugünün tarihi kullanılır)
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { SaleStatus } from '@prisma/client';
import { ODOO_TAX_CHART_COMPANY_ID, readProductSaleTaxRate } from '../src/modules/odoo/odoo-tax.util';

function paraFmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const tarihArg = process.argv[2];
  const gun = tarihArg ? new Date(tarihArg + 'T00:00:00') : new Date();
  gun.setHours(0, 0, 0, 0);
  const gunSonu = new Date(gun);
  gunSonu.setDate(gunSonu.getDate() + 1);

  console.log('='.repeat(78));
  console.log(`KDV uyuşmazlığı teşhisi (Odoo'daki GÜNCEL oranla karşılaştırma) — ${gun.toLocaleDateString('tr-TR')}`);
  console.log('='.repeat(78));

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: [SaleStatus.PAID, SaleStatus.DRAFT] },
      createdAt: { gte: gun, lt: gunSonu },
    },
    include: {
      customer: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, category: true, taxRate: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const branchIds = Array.from(new Set(sales.map((s) => s.branchId)));
  const branches = branchIds.length
    ? await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, code: true } })
    : [];
  const branchCodeById = new Map(branches.map((b) => [b.id, b.code]));

  if (!sales.length) {
    console.log('\nBu tarihte hiç satış bulunamadı.');
    return;
  }

  // Aynı odooProductId'yi tekrar tekrar Odoo'ya sormamak için cache
  const odooRateCache = new Map<number, number>();
  async function odooRate(odooProductId: number): Promise<number> {
    if (odooRateCache.has(odooProductId)) return odooRateCache.get(odooProductId)!;
    const rate = await readProductSaleTaxRate(odooProductId, ODOO_TAX_CHART_COMPANY_ID);
    odooRateCache.set(odooProductId, rate);
    return rate;
  }

  let supheliSayisi = 0;
  let toplamEskiTax = 0;
  let toplamYeniTax = 0;

  for (const sale of sales) {
    const satirlar: string[] = [];

    for (const it of sale.items) {
      if (it.taxRate == null) continue;
      const kayitliTaxRate = Number(it.taxRate);

      let gercekOdooOrani: number | null = null;
      if (it.odooProductId) {
        const pid = parseInt(String(it.odooProductId), 10);
        if (Number.isFinite(pid)) {
          try {
            gercekOdooOrani = await odooRate(pid);
          } catch (err) {
            console.warn(`  [UYARI] odooProductId=${pid} için Odoo KDV okunamadı: ${err instanceof Error ? err.message : err}`);
          }
        }
      }

      if (gercekOdooOrani == null || gercekOdooOrani === kayitliTaxRate) continue;

      const unitPrice = Number(it.unitPrice);
      const qty = it.qty;
      const discount = Number(it.discount);
      const lineTotal = unitPrice * qty - discount;
      const eskiTax = Number(it.taxAmount);
      const yeniTax = (lineTotal * gercekOdooOrani) / (100 + gercekOdooOrani);

      supheliSayisi++;
      toplamEskiTax += eskiTax;
      toplamYeniTax += yeniTax;

      satirlar.push(
        `  - [${it.id}] ${it.product?.name ?? it.odooProductName ?? '—'} (odooProductId: ${it.odooProductId})\n` +
          `      Satır toplamı (KDV dahil): ${paraFmt(lineTotal)} TL\n` +
          `      Şu an kayıtlı: KDV %${kayitliTaxRate} -> KDV tutarı ${paraFmt(eskiTax)} TL, vergi hariç ${paraFmt(lineTotal - eskiTax)} TL\n` +
          `      Odoo'da GÜNCEL oran: KDV %${gercekOdooOrani} -> KDV tutarı ${paraFmt(yeniTax)} TL, vergi hariç ${paraFmt(lineTotal - yeniTax)} TL  (fark: ${paraFmt(eskiTax - yeniTax)} TL)`,
      );
    }

    if (!satirlar.length) continue;

    console.log('');
    console.log(`Satış #${sale.id}  [${branchCodeById.get(sale.branchId) ?? '—'}]  ${sale.customer?.name ?? '—'}  (${sale.status})  ${sale.createdAt.toLocaleTimeString('tr-TR')}`);
    for (const s of satirlar) console.log(s);
  }

  console.log('');
  console.log('='.repeat(78));
  if (supheliSayisi === 0) {
    console.log('Hiçbir kalemde kayıtlı KDV ile Odoo\'daki güncel KDV arasında fark bulunamadı.');
  } else {
    console.log(`Toplam ${supheliSayisi} kalemde kayıtlı KDV, Odoo'daki güncel orandan FARKLI.`);
    console.log(`Şu an kayıtlı toplam KDV: ${paraFmt(toplamEskiTax)} TL`);
    console.log(`Odoo'daki güncel orana göre olması gereken toplam KDV: ${paraFmt(toplamYeniTax)} TL`);
    console.log(`Fark: ${paraFmt(toplamEskiTax - toplamYeniTax)} TL`);
    console.log('');
    console.log('NOT: "Odoo\'daki güncel oran" şu AN Odoo\'da o ürüne tanımlı vergi —');
    console.log('satış anında da aynıydı mı garanti yok. Her satırı gözle kontrol edip');
    console.log('admin panelindeki Satış Detay > "KDV Düzeltme" ekranından elle düzelt.');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
