import { execute } from '../odoo/odoo.service';

/**
 * UTS/Lot-Seri karışıklığı düzeltmesi sonrası, ESKİ (bozuk) kayıtları
 * kullanıcının sağladığı orijinal Excel dosyalarındaki ham UTS kodlarıyla
 * onarır: x_uts_kodu'nu tam ham UTS koduna geri yükler ve Lot/Seri adını
 * GRS-{tarih}-ONARIM-{lotId} formatına çevirir.
 *
 * Eşleştirme stratejisi: her barkod grubu için mevcut bozuk lot'lar
 * lot id'sine göre (oluşturulma sırasına yakın) artan sırada dizilir,
 * kullanıcının sağladığı UTS listesi de Excel satır sırasına göre dizilir
 * ve sırayla eşleştirilir. Orijinal içe aktarımda hangi fiziksel ürünün
 * hangi Odoo lotuna karşılık geldiğine dair kayıt tutulmadığından
 * (bu da düzeltilen hatanın bir sonucu), bu en iyi çaba (best-effort)
 * bir eşleştirmedir — barkod/renk grubu içinde doğru, gruplar arası
 * karışma yoktur.
 */

const ONARILACAK_COMPANY_ID = 2; // NG şirketi — tespit sonucunda etkilenen kayıtların tamamı burada

export type OnarimSatiri = {
  lotId: number;
  barkod: string;
  urunAdi: string;
  eskiLotAdi: string;
  yeniLotAdi: string;
  eskiUtsKodu: string;
  yeniUtsKodu: string;
};

export type OnarimSonucu = {
  mode: 'preview' | 'apply';
  toplamEslesen: number;
  eslesemeyenBarkodlar: Record<string, { bozukLotSayisi: number; saglananUtsSayisi: number }>;
  satirlar: OnarimSatiri[];
  hatalar?: Array<{ lotId: number; mesaj: string }>;
};

function bugunTarihDDMMYYYY(): string {
  const now = new Date();
  const gun = String(now.getDate()).padStart(2, '0');
  const ay = String(now.getMonth() + 1).padStart(2, '0');
  const yil = now.getFullYear();
  return `${gun}${ay}${yil}`;
}

export async function onarEskiUtsKayitlari(
  perBarkodUts: Record<string, string[]>,
  mode: 'preview' | 'apply',
): Promise<OnarimSonucu> {
  const barkodlar = Object.keys(perBarkodUts);

  const lots: any[] = (await execute(
    'stock.lot',
    'search_read',
    [[['ref', 'in', barkodlar]]],
    { fields: ['id', 'name', 'x_uts_kodu', 'product_id', 'ref'], context: { active_test: false } },
    ONARILACAK_COMPANY_ID,
  )) ?? [];

  const bozukLotlarByBarkod: Record<string, any[]> = {};
  for (const lot of lots) {
    const barkod = String(lot.ref ?? '');
    const name = String(lot.name ?? '').trim();
    const uts = String(lot.x_uts_kodu ?? '').trim();
    const grsFormatinda = /^GRS-\d{8}-/.test(name);
    const utsSadeceGtinBoyunda = uts.length === 14 && /^\d{14}$/.test(uts);
    if (!grsFormatinda && utsSadeceGtinBoyunda) {
      (bozukLotlarByBarkod[barkod] ??= []).push(lot);
    }
  }
  for (const barkod of Object.keys(bozukLotlarByBarkod)) {
    bozukLotlarByBarkod[barkod].sort((a, b) => a.id - b.id);
  }

  const tarih = bugunTarihDDMMYYYY();
  const satirlar: OnarimSatiri[] = [];
  const eslesemeyenBarkodlar: OnarimSonucu['eslesemeyenBarkodlar'] = {};

  for (const barkod of barkodlar) {
    const utsListesi = perBarkodUts[barkod] ?? [];
    const bozukLotlar = bozukLotlarByBarkod[barkod] ?? [];

    if (bozukLotlar.length !== utsListesi.length) {
      eslesemeyenBarkodlar[barkod] = {
        bozukLotSayisi: bozukLotlar.length,
        saglananUtsSayisi: utsListesi.length,
      };
    }

    const n = Math.min(bozukLotlar.length, utsListesi.length);
    for (let i = 0; i < n; i++) {
      const lot = bozukLotlar[i];
      const yeniUts = utsListesi[i];
      satirlar.push({
        lotId: lot.id,
        barkod,
        urunAdi: String(lot.product_id?.[1] ?? ''),
        eskiLotAdi: String(lot.name ?? ''),
        yeniLotAdi: `GRS-${tarih}-ONARIM-${lot.id}`,
        eskiUtsKodu: String(lot.x_uts_kodu ?? ''),
        yeniUtsKodu: yeniUts,
      });
    }
  }

  const sonuc: OnarimSonucu = {
    mode,
    toplamEslesen: satirlar.length,
    eslesemeyenBarkodlar,
    satirlar,
  };

  if (mode === 'apply') {
    const hatalar: Array<{ lotId: number; mesaj: string }> = [];
    for (const satir of satirlar) {
      try {
        await execute(
          'stock.lot',
          'write',
          [[satir.lotId], { name: satir.yeniLotAdi, x_uts_kodu: satir.yeniUtsKodu }],
          {},
          ONARILACAK_COMPANY_ID,
        );
      } catch (err) {
        hatalar.push({ lotId: satir.lotId, mesaj: err instanceof Error ? err.message : String(err) });
      }
    }
    sonuc.hatalar = hatalar;
  }

  return sonuc;
}
