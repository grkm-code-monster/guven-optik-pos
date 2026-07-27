/**
 * Faz 2 — senaryo tespiti ve UTS kalem filtresi (ağ/Odoo çağrısı yok)
 */
import {
  detectTransferSenaryo,
  filterUtsKalemler,
  type TransferPostActionKalem,
} from '../src/modules/transfer/transfer-post-actions.service';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const kalemUtsli: TransferPostActionKalem = {
  productId: 1,
  utsKodu: 'UTS-123',
  miktar: 1,
};

const kalemUtsiz: TransferPostActionKalem = {
  productId: 2,
  miktar: 1,
};

// Senaryo tespiti
assert(
  detectTransferSenaryo(
    { subeKodu: 'GVN2', sirketId: 2 },
    { subeKodu: 'GVN1', sirketId: 3 },
  ) === 'SIRKET_DEGISIYOR',
  'NG→ADESE = SIRKET_DEGISIYOR',
);

assert(
  detectTransferSenaryo(
    { subeKodu: 'GVN1', sirketId: 3 },
    { subeKodu: 'GVN3', sirketId: 3 },
  ) === 'FARKLI_LOKASYON',
  'GVN1→GVN3 = FARKLI_LOKASYON',
);

assert(
  detectTransferSenaryo(
    { subeKodu: 'GVN1', sirketId: 3 },
    { subeKodu: 'GVN1', sirketId: 3 },
  ) === 'AYNI_LOKASYON',
  'GVN1→GVN1 = AYNI_LOKASYON',
);

// UTS filtre — cross-company: utsKodu yeterli
const cross = filterUtsKalemler([kalemUtsli, kalemUtsiz], 'SIRKET_DEGISIYOR', '111', '222');
assert(cross.length === 1 && cross[0].utsKodu === 'UTS-123', 'cross-company UTS filtresi');

// UTS filtre — same company, farklı kurum no
const sameDiffKurum = filterUtsKalemler(
  [kalemUtsli],
  'FARKLI_LOKASYON',
  '111',
  '222',
);
assert(sameDiffKurum.length === 1, 'aynı şirket farklı kurum → UTS gider');

const sameSameKurum = filterUtsKalemler(
  [kalemUtsli],
  'FARKLI_LOKASYON',
  '111',
  '111',
);
assert(sameSameKurum.length === 0, 'aynı şirket aynı kurum → UTS gitmez');

console.log('✅ test-transfer-post-actions-faz2 — tüm senaryolar geçti');
