/**
 * 10.11.2026 — UTS SİTESİNDEN (programın dışında) kabul edilmiş alma bildirimlerini programa
 * "kabul edilmiş, ürün girişi bekliyor" kaydı olarak ekler. Böylece Depo → Ürün Girişi'nde
 * "Belge No ile UTS'den Çek" bu kayıtları bulur (ürün no + lot + seri satırlara gelir).
 * UTS'ye HİÇBİR bildirim göndermez; sadece programın kendi kaydını oluşturur.
 * Aynı şubede aynı ürün no + seri no için ALMA kaydı zaten varsa o satırı atlar.
 *
 * Dosya: JSON dizi — [{ "UNO", "LNO", "SNO", "BNO", "BZA", "DKU", "MME" }] (UTS bildirim/sorgula cevabı alanları)
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/uts-kabul-iceri-al.ts --sube GVN2 --dosya /tmp/x.json [--uygula]
 */
import 'dotenv/config';
import fs from 'fs';
import { prisma } from '../src/database/prisma';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');

type Kayit = { UNO: string; LNO?: string; SNO?: string; BNO: string; BZA?: string; DKU?: string; MME?: string };

async function main() {
  const subeKodu = (d('--sube') ?? '').trim().toUpperCase();
  const dosya = d('--dosya');
  if (!subeKodu || !dosya) throw new Error('--sube ve --dosya zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const sube = await prisma.branch.findFirst({ where: { code: subeKodu } });
  if (!sube) throw new Error(`Şube ${subeKodu} yok`);
  const kayitlar = JSON.parse(fs.readFileSync(dosya, 'utf8')) as Kayit[];
  const mevcut = await prisma.utsBildirimKalem.findMany({
    where: { bildirim: { tip: 'ALMA', branchId: sube.id, durum: { in: ['GONDERILDI', 'BEKLIYOR'] } }, barkod: { in: [...new Set(kayitlar.map((k) => k.UNO))] } },
    select: { barkod: true, seriNo: true, lotNo: true },
  });
  const var_ = new Set(mevcut.map((m) => `${m.barkod}|${m.seriNo ?? ''}|${m.lotNo ?? ''}`));
  const eklenecek = kayitlar.filter((k) => !var_.has(`${k.UNO}|${k.SNO ?? ''}|${k.LNO ?? ''}`));
  const belgeler = new Map<string, number>();
  for (const k of eklenecek) belgeler.set(k.BNO, (belgeler.get(k.BNO) ?? 0) + 1);
  console.log(`Şube ${subeKodu} | dosyada ${kayitlar.length} kayıt | programda zaten var: ${kayitlar.length - eklenecek.length} | eklenecek: ${eklenecek.length}`);
  for (const [b, n] of belgeler) console.log(`  belge ${b}: ${n} kayıt`);
  for (const k of eklenecek.slice(0, 5)) console.log(`  örnek: ${k.UNO} lot ${k.LNO ?? '-'} seri ${k.SNO ?? '-'} | ${k.MME ?? ''}`);
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — uygulamak için --uygula ekleyin.'); return; }
  let n = 0;
  for (const k of eklenecek) {
    await prisma.utsBildirim.create({
      data: {
        tip: 'ALMA',
        durum: 'GONDERILDI',
        branchId: sube.id,
        belgeNo: k.BNO,
        karsiAd: k.DKU ?? null,
        payload: { BNO: k.BNO, kaynak: 'UTS_SITESI_ICERI_ALINDI', urunTanimi: k.MME ?? null, utsKabulZamani: k.BZA ?? null },
        gonderimZamani: k.BZA ? new Date(k.BZA.replace(' ', 'T') + '+03:00') : new Date(),
        kalemler: { create: [{ barkod: k.UNO, lotNo: k.LNO ?? null, seriNo: k.SNO ?? null, adet: 1 }] },
      },
    });
    n++;
  }
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) await prisma.auditLog.create({ data: { userId: admin.id, action: 'UTS_KABUL_ICERI_AL', entity: 'UtsBildirim', entityId: subeKodu, payload: { adet: n, belgeler: Object.fromEntries(belgeler), script: true } } });
  console.log(`✓ ${n} kayıt eklendi. Ürün Girişi'nde "Belge No ile UTS'den Çek" artık bunları bulur.`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
