/**
 * 09.11.2026 — Sıfırdan, boş (temiz) yeni şube açar:
 *   1) Odoo'da örnek şubenin deposunun altında yeni stok yeri (ör. NG/Stok/GUVENP2), şirketi örnek şubeninki
 *   2) POS'ta Branch kaydı: şirket, VKN, Uyumsoft e-fatura hesabı ve FATURA ADRESİ örnek şubeden kopyalanır;
 *      il/ilçe/telefon parametreden. Stok, kasa, personel, POS cihazı YOK (temiz şube).
 * Var olan hiçbir şube/lokasyona dokunmaz. Kod sadece A-Z ve 0-9 olabilir (e-fatura numarası şube kodundan
 * üretiliyor; Türkçe harf GİB fatura numarasında geçersiz).
 *
 * VARSAYILAN KURU ÇALIŞMA. Kullanım:
 *   npx ts-node --transpile-only scripts/yeni-sube-ac.ts --kod GUVENP2 --ad "GÜVEN NG PANAYIR" --ornek GVN2 \
 *     --il Muğla --ilce Menteşe [--telefon "..."] [--uygula]
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';
import { belgeNoPrefixFromSube } from '../src/modules/efatura/belge-no.util';

const argv = process.argv.slice(2);
const d = (b: string) => { const i = argv.indexOf(b); return i >= 0 ? argv[i + 1] : undefined; };
const UYGULA = argv.includes('--uygula');

async function main() {
  const kod = (d('--kod') ?? '').trim();
  const ad = (d('--ad') ?? '').trim();
  const ornekKod = (d('--ornek') ?? '').trim();
  const il = d('--il')?.trim() || null;
  const ilce = d('--ilce')?.trim() || null;
  const telefon = d('--telefon')?.trim() || null;
  if (!kod || !ad || !ornekKod) throw new Error('--kod, --ad ve --ornek zorunlu');
  console.log(UYGULA ? '*** UYGULAMA MODU ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const engel: string[] = [];
  if (!/^[A-Z0-9]+$/.test(kod)) engel.push(`Kod "${kod}" sadece büyük A-Z ve 0-9 içerebilir (Türkçe harf e-fatura numarasını bozar)`);
  if (await prisma.branch.findUnique({ where: { code: kod } })) engel.push(`"${kod}" kodlu şube zaten var`);
  const ornek = await prisma.branch.findUnique({ where: { code: ornekKod } });
  if (!ornek) throw new Error(`Örnek şube ${ornekKod} bulunamadı`);
  if (!ornek.sirketId || !ornek.odooLocationId) engel.push(`Örnek şube ${ornekKod}'de şirket ya da Odoo lokasyonu tanımlı değil`);

  // E-fatura numara öneki çakışması (aynı şirkette)
  const onek = belgeNoPrefixFromSube(kod);
  const ayniSirket = await prisma.branch.findMany({ where: { sirketId: ornek.sirketId } });
  const cakisan = ayniSirket.filter((b) => belgeNoPrefixFromSube(b.code) === onek);
  if (cakisan.length) engel.push(`E-fatura öneki ${onek} aynı şirkette ${cakisan.map((b) => b.code).join(', ')} ile çakışıyor`);

  // Odoo: örnek lokasyonun üst yeri (ör. NG/Stok)
  const [ornekLok] = await execute('stock.location', 'read', [[ornek.odooLocationId]], { fields: ['complete_name', 'location_id', 'company_id', 'usage'] });
  const ust = ornekLok?.location_id; // [id, ad]
  if (!ust) engel.push('Örnek lokasyonun üst yeri okunamadı');
  const mevcut = ust
    ? await execute('stock.location', 'search_read', [[['name', '=', kod], ['location_id', '=', ust[0]]]], { fields: ['id', 'complete_name', 'active'], context: { active_test: false } })
    : [];

  console.log(`\nÖRNEK ŞUBE ${ornek.code} — ${ornek.name} | şirket ${ornek.sirketAdi} (Odoo ${ornek.sirketId}) | VKN ${ornek.vkn} | Uyumsoft ${ornek.uyumsoftUser ? 'tanımlı' : 'YOK'}`);
  console.log(`  Odoo lokasyon ${ornekLok?.complete_name} → yeni lokasyon üst yeri: ${ust?.[1]}`);
  console.log(`\nYENİ ŞUBE ${kod} — ${ad}`);
  console.log(`  şirket ${ornek.sirketAdi} (Odoo ${ornek.sirketId}) | VKN ${ornek.vkn} | e-fatura numarası öneki ${onek} (ör. ${onek}000000001)`);
  console.log(`  fatura adresi (${ornekKod} ile aynı): ${ornek.adres ?? '—'}`);
  console.log(`  il ${il ?? '—'} | ilçe ${ilce ?? '—'} | telefon ${telefon ?? '—'} | atölye yok | aktif`);
  console.log(`  Odoo lokasyon: ${mevcut.length ? `ZATEN VAR → kullanılacak (${mevcut[0].complete_name}, id ${mevcut[0].id})` : `${ust?.[1]}/${kod} OLUŞTURULACAK (iç lokasyon, şirket ${ornek.sirketId})`}`);
  console.log('  Stok, kasa, personel, POS cihazı: YOK (temiz şube)');
  if (engel.length) { console.log('\n⚠️ DURDU:'); engel.forEach((e) => console.log('  - ' + e)); return; }
  if (!UYGULA) { console.log('\nKURU ÇALIŞMA — sorun yok. Uygulamak için --uygula ekleyin.'); return; }

  const lokId: number = mevcut.length
    ? mevcut[0].id
    : await execute('stock.location', 'create', [{ name: kod, location_id: ust[0], usage: 'internal', company_id: ornek.sirketId }], {}, ornek.sirketId);
  console.log(`✓ Odoo lokasyonu: id ${lokId}`);
  const yeni = await prisma.branch.create({
    data: {
      name: ad, code: kod, isActive: true, hasAtolye: false,
      sirketId: ornek.sirketId, sirketAdi: ornek.sirketAdi, vkn: ornek.vkn,
      odooLocationId: lokId, adres: ornek.adres, il, ilce, telefon,
      uyumsoftUser: ornek.uyumsoftUser, uyumsoftPass: ornek.uyumsoftPass,
    },
  });
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) await prisma.auditLog.create({ data: { userId: admin.id, action: 'YENI_SUBE_AC', entity: 'Branch', entityId: yeni.id, payload: { kod, ad, ornek: ornekKod, odooLocationId: lokId, script: true } } });
  console.log(`✓ Şube oluşturuldu: ${kod} — ${ad} (id ${yeni.id}, Odoo lokasyon ${lokId})`);
  console.log(`\nBANA BU SAYIYI İLETİN → Odoo lokasyon id: ${lokId}`);
}
main().catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
