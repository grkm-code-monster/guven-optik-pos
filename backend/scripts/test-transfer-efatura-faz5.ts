/**
 * Faz 5 — transfer e-Fatura kalem/fiyat birim testleri (Odoo/Uyumsoft çağrısı yok)
 */
import {
  transferdenFaturaData,
  transferMaliyetSatisFiyati,
} from '../src/modules/efatura/uyumsoft-efatura.service';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(transferMaliyetSatisFiyati(100) === 105, 'maliyet×1.05 = 105');
assert(transferMaliyetSatisFiyati(10.5) === 11.03, 'maliyet×1.05 yuvarlama');

const data = transferdenFaturaData(
  {
    transferRef: 'TRANSFER-1234567890',
    partnerVkn: '1234567890',
    partnerName: 'ADESE OPTİK',
    partnerAdres: 'İsmet Paşa Mah. Cumhuriyet Cad. No:19',
    partnerIl: 'MUĞLA',
    partnerIlce: 'MİLAS',
    partnerVergiDairesi: 'Milas',
    kalemler: [
      { urunAdi: 'Ray-Ban RB2140', urunKodu: '42', miktar: 2, birimFiyat: 105, kdvOrani: 10 },
    ],
  },
  'GN202600000001',
  'GVN2',
);

assert(data.siparisNo === 'TRANSFER-1234567890', 'siparisNo = transferRef');
assert(data.kalemler.length === 1, 'tek kalem');
assert(data.kalemler[0].urunAdi === 'Ray-Ban RB2140', 'ürün adı');
assert(data.kalemler[0].birimFiyat === 105, 'birim fiyat');
assert(data.kalemler[0].kdvOrani === 10, 'kdv oranı kalemden');
assert(data.kalemler[0].urunKodu === '42', 'ürün kodu');
assert(data.not?.includes('TRANSFER-1234567890'), 'not transferRef içerir');
assert(data.aliciAdres.includes('Cumhuriyet'), 'alıcı adres gerçek');
assert(data.aliciIl === 'MUĞLA', 'alıcı il');
assert(data.aliciIlce === 'MİLAS', 'alıcı ilçe');
assert(data.aliciVergiDairesi === 'Milas', 'alıcı vergi dairesi');

console.log('✅ test-transfer-efatura-faz5 — tüm kontroller geçti');
