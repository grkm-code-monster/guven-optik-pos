import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { readProductSaleTaxRate } from '../odoo/odoo-tax.util';
import { resolveStandardPriceAcrossCompanies } from '../odoo/odoo-standard-price.util';

export function transferMaliyetSatisFiyati(maliyet: number): number {
  return Math.round(maliyet * 1.05 * 100) / 100;
}

export type TransferEFaturaKalem = {
  urunAdi: string;
  urunKodu?: string;
  miktar: number;
  maliyet: number;
  birimFiyat?: number;
  kdvOrani?: number;
};

/** Satıcı Kodu için öncelik: UTS kodu > Lot/Seri adı > Odoo ürün ID. */
function resolveSaticiKodu(k: { utsKodu?: string; lotAdi?: string }, productId: number): string {
  const uts = k.utsKodu?.trim();
  if (uts) return uts;
  const lot = k.lotAdi?.trim();
  if (lot) return lot;
  return String(productId);
}

export function transferMaliyetHataMesaji(urunAdi: string): string {
  return `'${urunAdi}' için kaynak şirkette maliyet bilgisi (standard_price) bulunamadı — transfer faturası kesilemedi, önce ürünün maliyet fiyatını girin.`;
}

export function assertPositiveTransferMaliyet(maliyet: number, urunAdi: string): void {
  if (!Number.isFinite(maliyet) || maliyet <= 0) {
    throw new Error(transferMaliyetHataMesaji(urunAdi));
  }
}

function uniqueCompanyIds(...ids: Array<number | undefined>): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (id != null && id > 0 && !out.includes(id)) out.push(id);
  }
  for (const id of ODOO_ALL_COMPANY_IDS) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export async function resolveTransferKalemMaliyet(
  kalem: {
    productId: number;
    resolvedProductId?: number;
    urunAdi?: string;
    maliyet?: number;
  },
  kaynakSirketId: number,
  hedefSirketId?: number,
): Promise<{ maliyet: number; urunAdi: string }> {
  const productId = kalem.resolvedProductId ?? kalem.productId;
  let urunAdi = kalem.urunAdi?.trim() || `Ürün ${productId}`;

  const explicit = Number(kalem.maliyet ?? 0);
  if (explicit > 0) {
    return { maliyet: explicit, urunAdi };
  }

  const companyIds = uniqueCompanyIds(kaynakSirketId, hedefSirketId);
  const { price: maliyet } = await resolveStandardPriceAcrossCompanies(
    'product.product',
    productId,
    companyIds,
  );

  if (maliyet <= 0) {
    try {
      const rows = (await execute(
        'product.product',
        'read',
        [[productId]],
        { fields: ['name'] },
        kaynakSirketId,
      )) as Array<{ name?: string }>;
      if (rows[0]?.name) urunAdi = String(rows[0].name);
    } catch {
      // ad yoksa mevcut urunAdi kalır
    }
  }

  assertPositiveTransferMaliyet(maliyet, urunAdi);
  return { maliyet, urunAdi };
}

export async function resolveTransferFaturaKalemler(
  kalemler: Array<{
    productId: number;
    resolvedProductId?: number;
    urunAdi?: string;
    miktar?: number;
    maliyet?: number;
    utsKodu?: string;
    lotAdi?: string;
  }>,
  kaynakSirketId: number,
  hedefSirketId?: number,
): Promise<TransferEFaturaKalem[]> {
  const result: TransferEFaturaKalem[] = [];
  for (const k of kalemler) {
    const productId = k.resolvedProductId ?? k.productId;
    const { maliyet, urunAdi } = await resolveTransferKalemMaliyet(k, kaynakSirketId, hedefSirketId);
    const kdvOrani = await readProductSaleTaxRate(productId, kaynakSirketId);
    result.push({
      urunAdi,
      urunKodu: resolveSaticiKodu(k, productId),
      miktar: k.miktar || 1,
      maliyet,
      birimFiyat: transferMaliyetSatisFiyati(maliyet),
      kdvOrani,
    });
  }
  return result;
}
