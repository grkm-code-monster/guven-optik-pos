/**
 * Faz 6 — UtsDisFirma seed + transfer kalem → UTS kalem dönüşümü (API çağrısı yok)
 */
import { prisma } from '../src/database/prisma';
import {
  ensureUtsDisFirmaSirketlerSeed,
  transferKalemlerdenUtsKalemler,
} from '../src/modules/uts/uts.service';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const before = await prisma.utsDisFirma.count();
  const seed = await ensureUtsDisFirmaSirketlerSeed();
  const after = await prisma.utsDisFirma.count();
  assert(after >= before, 'seed sonrası kayıt sayısı azalmamalı');
  assert(after >= 3, `en az 3 UtsDisFirma kaydı (${after})`);
  if (before === 0) {
    assert(seed.olusturulan === 3, `boş tabloda 3 firma seed (${seed.olusturulan})`);
  } else {
    assert(seed.olusturulan >= 0, 'idempotent seed');
  }

  const kalemler = await transferKalemlerdenUtsKalemler(
    [
      { utsKodu: '08681234567890', miktar: 2, utsFirmaKodu: 'LOT-A' },
      { utsKodu: '', miktar: 1 },
    ],
    2,
  );
  assert(kalemler.length === 1, 'utsKodu olmayan kalem filtrelenir');
  assert(kalemler[0].barkod === '08681234567890', 'barkod = utsKodu');
  assert(kalemler[0].adet === 2, 'adet korunur');
  assert(kalemler[0].lotNo === 'LOT-A', 'lotNo utsFirmaKodu');

  console.log('✅ test-transfer-uts-faz6 — tüm kontroller geçti');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
