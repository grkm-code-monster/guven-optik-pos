export const MOCK_URUN_ARA = [
  {
    id: 101,
    ad: 'Ray-Ban RB2140',
    varyant: 'Siyah / 50',
    lotNo: 'LOT-2026-001',
    utsKodu: 'UTS-998877',
    utsDurumu: 'ALINDI',
    stok: 12,
    kaynakFatura: 'FTR-2025-4412',
  },
  {
    id: 102,
    ad: 'Acuvue Oasys 6lı',
    varyant: '-2.00',
    lotNo: 'SN-884422',
    utsKodu: null,
    utsDurumu: 'BEKLEMEDE',
    stok: 24,
    kaynakFatura: null,
  },
];

export const MOCK_BEKLEYEN = [
  {
    transferId: 90089,
    refNo: 'WH/INT/00089',
    tarih: '2026-05-15',
    gonderen: 'GVN3',
    alici: 'GVN1',
    personel: 'demo',
    durum: 'assigned',
    urunler: [
      {
        moveLineId: 1,
        id: 101,
        ad: 'Ray-Ban RB2140',
        varyant: 'Siyah',
        lotNo: 'LOT-001',
        beklenenAdet: 2,
        sayilanAdet: 0,
        utsKodu: null,
        utsDurumu: 'ALINDI',
      },
      {
        moveLineId: 2,
        id: 102,
        ad: 'Acuvue Oasys',
        varyant: '-2.00',
        lotNo: 'SN-884422',
        beklenenAdet: 1,
        sayilanAdet: 0,
        utsKodu: null,
        utsDurumu: 'BEKLEMEDE',
      },
    ],
  },
];

export function isDevMockEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}
