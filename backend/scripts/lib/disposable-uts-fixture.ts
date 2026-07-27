/**
 * Tek kullanımlık UTS test fixture — canlı ürünlere yazmadan import testi.
 */
import { execute } from '../../src/modules/odoo/odoo.service';
import { getOrCreateStockLot } from '../../src/modules/admin/stock-lot.service';
import { applyStockAdjustmentForLot } from '../../src/modules/admin/stock-adjustment.service';
import { getCompanyIdFromLokasyon } from '../../src/modules/odoo/odooLocations';
import { createEnvanterSablon } from '../../src/modules/admin/odoo-varyant-import.service';
import { importVaryantlarForTemplate } from '../../src/modules/admin/odoo-varyant-import.service';

const ctx = { context: { active_test: false } };
const TEST_LOKASYON = 'ANADEPO';

export type DisposableUtsFixture = {
  productId: number;
  templateId: number;
  lotIds: [number, number];
  barkod: string;
  cleanup: () => Promise<void>;
};

export async function createDisposableUtsFixture(): Promise<DisposableUtsFixture> {
  const ts = Date.now();
  const urunAdi = `TEST_UTS_DISPOSABLE_${ts}`;
  const barkod = `TESTUTS${String(ts).slice(-10)}`;

  const templateId = await createEnvanterSablon({
    kategori: `TEST_UTS_CAT_${ts}`,
    urunAdi,
    satisFiyati: 1,
    maliyetFiyati: 1,
    kdvOrani: 10,
  });

  const importSonuc = await importVaryantlarForTemplate(templateId, [{
    index: 1,
    model: 'M1',
    renk: 'R1',
    olcu: 'O1',
    barkod,
    fiyat: 1,
  }]);

  const productId = [...importSonuc.varyantIdByKey.values()][0];
  if (!productId) throw new Error('Disposable varyant oluşturulamadı');

  const companyId = getCompanyIdFromLokasyon(TEST_LOKASYON) ?? undefined;
  const lotA = await getOrCreateStockLot(`TEST_LOT_${ts}_A`, productId, companyId, barkod);
  const lotB = await getOrCreateStockLot(`TEST_LOT_${ts}_B`, productId, companyId, barkod);

  await applyStockAdjustmentForLot({
    productId,
    locationCode: TEST_LOKASYON,
    lotId: lotA.lotId,
    qty: 1,
  });
  await applyStockAdjustmentForLot({
    productId,
    locationCode: TEST_LOKASYON,
    lotId: lotB.lotId,
    qty: 1,
  });

  async function cleanup() {
    for (const lotId of [lotA.lotId, lotB.lotId]) {
      try {
        await applyStockAdjustmentForLot({
          productId,
          locationCode: TEST_LOKASYON,
          lotId,
          qty: 0,
        });
      } catch {
        // best-effort
      }
      try {
        await execute('stock.lot', 'write', [[lotId], { x_uts_kodu: false }], {}, undefined);
      } catch {
        // best-effort
      }
    }
    try {
      await execute('product.template', 'write', [[templateId], { active: false }], {}, undefined);
    } catch {
      // best-effort
    }
  }

  return {
    productId,
    templateId,
    lotIds: [lotA.lotId, lotB.lotId],
    barkod,
    cleanup,
  };
}

export async function readLotUts(lotId: number): Promise<string | false | null> {
  const rows = await execute('stock.lot', 'read', [[lotId]], {
    fields: ['x_uts_kodu'],
    ...ctx,
  }) as Array<{ x_uts_kodu?: string | false }>;
  return rows?.[0]?.x_uts_kodu ?? null;
}
