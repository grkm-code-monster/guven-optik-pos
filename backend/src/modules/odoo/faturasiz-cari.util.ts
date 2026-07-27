import { execute } from './odoo.service';

export const FATURASIZ_CARI_ADI = 'Stok Sayım / Faturasız Giriş';

const partnerCache = new Map<number, number>();

/**
 * Şirket başına genel amaçlı "Stok Sayım / Faturasız Giriş" tedarikçi carisi.
 * Gerçek tedarikçi değildir; sadece FATURASIZ stok hareketlerinde izlenebilirlik için.
 */
export async function getOrCreateFaturasizCari(companyId: number): Promise<number> {
  const cached = partnerCache.get(companyId);
  if (cached) return cached;

  const existing = await execute(
    'res.partner',
    'search_read',
    [[
      ['name', '=', FATURASIZ_CARI_ADI],
      ['is_company', '=', true],
      '|',
      ['company_id', '=', companyId],
      ['company_id', '=', false],
    ]],
    { fields: ['id', 'company_id'], limit: 1 },
    companyId,
  );

  if (existing[0]?.id) {
    const id = Number(existing[0].id);
    // Şirketsiz bulunursa bu şirkete yazmayı dene (çoklu şirket kilidi olabilir — yoksay)
    if (!existing[0].company_id) {
      try {
        await execute(
          'res.partner',
          'write',
          [[id], { company_id: companyId, supplier_rank: 1 }],
          {},
          companyId,
        );
      } catch {
        /* paylaşımlı cari yeterli */
      }
    }
    partnerCache.set(companyId, id);
    return id;
  }

  const id = Number(
    await execute(
      'res.partner',
      'create',
      [{
        name: FATURASIZ_CARI_ADI,
        is_company: true,
        supplier_rank: 1,
        company_id: companyId,
        comment: 'POS FATURASIZ ürün girişi için otomatik cari — gerçek tedarikçi değildir.',
      }],
      {},
      companyId,
    ),
  );
  partnerCache.set(companyId, id);
  console.log(`[faturasiz-cari] oluşturuldu: "${FATURASIZ_CARI_ADI}" id=${id} company=${companyId}`);
  return id;
}
