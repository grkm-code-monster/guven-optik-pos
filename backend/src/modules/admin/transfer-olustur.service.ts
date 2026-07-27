import { execute } from '../odoo/odoo.service';
import { enrichKalemlerWithUtsFromLot } from '../transfer/transfer-kalem.util';
import { baslatTransfer, type BaslatTransferSonuc } from '../transfer/transfer-core.service';

export type TransferOlusturKalem = {
  kaynak: number;
  hedef: number;
  productId: number;
  lotId?: number | null;
  miktar?: number;
  urunAdi?: string;
  resolvedProductId?: number;
  utsKodu?: string;
  utsFirmaKodu?: string;
};

export type TransferOlusturInput = {
  kalemler: TransferOlusturKalem[];
  notlar?: string;
  /** Lab-incident gibi istisnalar — Faz 4'te Garanti/Özel Sipariş */
  hemenKabul?: boolean;
};

export type TransferOlusturResult = {
  success: boolean;
  partial: boolean;
  message: string;
  transferler: unknown[];
};

function mapBaslatSonucToRow(
  sonuc: BaslatTransferSonuc,
  grup: TransferOlusturKalem[],
): Record<string, unknown> {
  const base = {
    ...(sonuc.detay as object),
    durum: sonuc.durum,
    transferRef: sonuc.transferRef,
    kabulPickingId: sonuc.kabulPickingId,
    kalemSayisi: grup.length,
    hata: sonuc.success ? undefined : sonuc.message,
  };

  if (sonuc.tip === 'sirket-ici') {
    return {
      ...base,
      tip: 'sirket-ici',
      pickingId: sonuc.kabulPickingId,
      pickingName: sonuc.pickingName,
    };
  }

  return {
    ...base,
    tip: 'sirketler-arasi',
    kaynakPickingId: sonuc.kaynakPickingId,
  };
}

/** POST /admin/transfer-olustur — iki adımlı çekirdek (baslat) */
export async function olusturTransfer(input: TransferOlusturInput): Promise<TransferOlusturResult> {
  const { kalemler, notlar, hemenKabul } = input;
  if (!kalemler?.length) {
    throw new Error('Kalemler zorunlu');
  }

  const olusturulanlar: unknown[] = [];

  const gruplar: Record<string, TransferOlusturKalem[]> = {};
  for (const k of kalemler) {
    const key = `${k.kaynak}-${k.hedef}`;
    if (!gruplar[key]) gruplar[key] = [];
    gruplar[key].push(k);
  }

  for (const [key, grup] of Object.entries(gruplar)) {
    const [kaynakId, hedefId] = key.split('-').map(Number);

    const lokasyonlar = await execute(
      'stock.location',
      'search_read',
      [[['id', 'in', [kaynakId, hedefId]]]],
      { fields: ['id', 'name', 'company_id'], limit: 2 },
    );

    const kaynakLok = lokasyonlar.find((l: { id: number }) => l.id === kaynakId);
    const hedefLok = lokasyonlar.find((l: { id: number }) => l.id === hedefId);
    const kaynakSirketId = kaynakLok?.company_id?.[0] ?? 1;
    const hedefSirketId = hedefLok?.company_id?.[0] ?? 1;

    for (const kalem of grup) {
      try {
        const prodCheck = await execute(
          'product.product',
          'search_read',
          [[['id', '=', kalem.productId]]],
          { fields: ['id', 'name'], limit: 1 },
        );
        if (prodCheck[0]?.id) {
          kalem.resolvedProductId = prodCheck[0].id;
        } else {
          const variants = await execute(
            'product.product',
            'search_read',
            [[['product_tmpl_id', '=', kalem.productId]]],
            { fields: ['id'], limit: 1 },
          );
          kalem.resolvedProductId = variants[0]?.id ?? kalem.productId;
        }
      } catch {
        kalem.resolvedProductId = kalem.productId;
      }
    }

    const stokHatalari: string[] = [];
    for (const kalem of grup) {
      try {
        const stokDomain: unknown[] = [
          ['location_id', '=', kaynakId],
          ['quantity', '>', 0],
          '|',
          ['product_id', '=', kalem.resolvedProductId ?? kalem.productId],
          ['product_id.product_tmpl_id', '=', kalem.resolvedProductId ?? kalem.productId],
        ];
        if (kalem.lotId) stokDomain.push(['lot_id', '=', kalem.lotId]);

        const stok = await execute(
          'stock.quant',
          'search_read',
          [stokDomain],
          { fields: ['id', 'quantity', 'lot_id'], limit: 1 },
          kaynakSirketId,
        );

        if (!stok.length || stok[0].quantity < (kalem.miktar || 1)) {
          const mevcutStok = stok[0]?.quantity ?? 0;
          stokHatalari.push(
            `"${kalem.urunAdi}" için yeterli stok yok (mevcut: ${mevcutStok}, istenen: ${kalem.miktar || 1})`,
          );
        }
      } catch (se: unknown) {
        const msg = se instanceof Error ? se.message : String(se);
        console.warn('[stok kontrol hata]', msg.slice(0, 80));
      }
    }

    if (stokHatalari.length > 0) {
      olusturulanlar.push({
        tip: 'stok-hatasi',
        hata: stokHatalari.join(', '),
        kaynak: kaynakId,
        hedef: hedefId,
      });
      continue;
    }

    await enrichKalemlerWithUtsFromLot(grup, kaynakSirketId);

    const sonuc = await baslatTransfer({
      kaynakLocationId: kaynakId,
      hedefLocationId: hedefId,
      kalemler: grup,
      notlar,
      hemenKabul,
    });

    olusturulanlar.push(mapBaslatSonucToRow(sonuc, grup));
  }

  type TransferRow = {
    tip?: string;
    durum?: string;
    hata?: string;
    manuelMudahaleMesaji?: string;
  };
  const rows = olusturulanlar as TransferRow[];
  const stokHatalari = rows.filter((t) => t.tip === 'stok-hatasi');
  const transferler = rows.filter((t) => t.tip !== 'stok-hatasi');
  const basarisiz = transferler.filter((t) => t.durum === 'basarisiz' || t.durum === 'kismi');
  const bekleyen = transferler.filter((t) => t.durum === 'bekliyor');
  const tumBasarili = stokHatalari.length === 0 && basarisiz.length === 0;

  let message = bekleyen.length > 0 && !hemenKabul
    ? 'Transfer gönderildi — hedef şube kabul bekliyor.'
    : 'Transfer tamamlandı.';
  if (stokHatalari.length > 0) {
    message = stokHatalari.map((t) => t.hata).join('; ');
  } else if (basarisiz.length > 0) {
    message = basarisiz.map((t) => t.hata ?? t.manuelMudahaleMesaji ?? 'Transfer başarısız').join('; ');
  }

  return {
    success: tumBasarili,
    partial: basarisiz.some((t) => t.durum === 'kismi'),
    message,
    transferler: olusturulanlar,
  };
}
