import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';

/**
 * Odoo bağlantı/kimlik doğrulama sorunlarını teşhis eder: hem varsayılan
 * (companyId'siz, .env ODOO_USER/ODOO_PASS ile authenticate) yolu hem de
 * her şirket için sabit kodlanmış (SIRKET_ODOO_CREDENTIALS) kimlik bilgisi
 * yolunu ayrı ayrı test eder ve hata mesajlarını döner. Salt okunur.
 */
export async function odooBaglantiTeshis(): Promise<{
  varsayilan: { basarili: boolean; hata?: string };
  sirketler: Record<number, { basarili: boolean; hata?: string }>;
}> {
  const sonuc: {
    varsayilan: { basarili: boolean; hata?: string };
    sirketler: Record<number, { basarili: boolean; hata?: string }>;
  } = { varsayilan: { basarili: false }, sirketler: {} };

  try {
    await execute('res.company', 'search_count', [[]], {});
    sonuc.varsayilan = { basarili: true };
  } catch (err) {
    sonuc.varsayilan = { basarili: false, hata: err instanceof Error ? err.message : String(err) };
  }

  for (const companyId of ODOO_ALL_COMPANY_IDS) {
    try {
      await execute('res.company', 'search_count', [[]], {}, companyId);
      sonuc.sirketler[companyId] = { basarili: true };
    } catch (err) {
      sonuc.sirketler[companyId] = { basarili: false, hata: err instanceof Error ? err.message : String(err) };
    }
  }

  return sonuc;
}

/**
 * UTS/Lot-Seri karışıklığı düzeltmesi (bkz. gs1-parser.util.ts) öncesinde,
 * Excel içe aktarımıyla oluşturulmuş olması muhtemel kayıtları tespit eder.
 *
 * Sezgi: Doğru (düzeltilmiş) kayıtlarda Lot/Seri adı her zaman
 * "GRS-{tarih}-..." formatındadır (hem fatura girişi hem de düzeltilmiş
 * Excel importu bu formatı kullanır). Eski/hatalı Excel importu ise UTS'nin
 * içine gömülü üretici seri numarasını Lot/Seri adı olarak kullanıyordu —
 * bu isimler "GRS-" ile başlamaz. Ayrıca eski hatalı importta x_uts_kodu
 * alanı tam ham UTS kodu yerine sadece 14 haneli GTIN'e kesiliyordu.
 *
 * Bu fonksiyon salt-okunur bir tespit/rapor aracıdır; hiçbir kaydı değiştirmez.
 */
export type EskiKayitSatiri = {
  companyId: number;
  lotId: number;
  lotAdi: string;
  utsKodu: string;
  urunAdi: string;
  barkod: string;
};

export type EskiKayitlarTespitSonucu = {
  toplam: number;
  sirketBazinda: Record<number, number>;
  kayitlar: EskiKayitSatiri[];
};

const GRS_FORMAT_REGEX = /^GRS-\d{8}-/;

export async function tespitEskiHatalıKayitlar(): Promise<EskiKayitlarTespitSonucu> {
  const kayitlar: EskiKayitSatiri[] = [];
  const sirketBazinda: Record<number, number> = {};

  for (const companyId of ODOO_ALL_COMPANY_IDS) {
    let lots: any[] = [];
    try {
      lots = (await execute(
        'stock.lot',
        'search_read',
        [[['x_uts_kodu', '!=', false]]],
        { fields: ['id', 'name', 'x_uts_kodu', 'product_id', 'ref'], context: { active_test: false } },
        companyId,
      )) ?? [];
    } catch (err) {
      // Bu şirket için Odoo bağlantısı/izni yoksa atla, diğerlerine devam et.
      continue;
    }

    let sirketSayisi = 0;
    for (const lot of lots) {
      const name = String(lot.name ?? '').trim();
      const uts = String(lot.x_uts_kodu ?? '').trim();
      if (!uts) continue;

      const grsFormatinda = GRS_FORMAT_REGEX.test(name);
      const utsSadeceGtinBoyunda = uts.length === 14 && /^\d{14}$/.test(uts);

      if (!grsFormatinda && utsSadeceGtinBoyunda) {
        kayitlar.push({
          companyId,
          lotId: lot.id,
          lotAdi: name,
          utsKodu: uts,
          urunAdi: String(lot.product_id?.[1] ?? ''),
          barkod: String(lot.ref ?? ''),
        });
        sirketSayisi++;
      }
    }
    if (sirketSayisi > 0) sirketBazinda[companyId] = sirketSayisi;
  }

  return { toplam: kayitlar.length, sirketBazinda, kayitlar };
}
