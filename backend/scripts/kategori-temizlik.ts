/**
 * 27.10.2026 — Odoo ürün kategorisi temizliği (Görkem'in talebi).
 *
 *  1) #78 "TÜM / Satılabilir / GÜNEŞ GÖZLÜĞÜ / ORTA ÜST GRUP" aslında
 *     #60 "All / GÜNEŞ GÖZLÜĞÜ / ORTA ÜST" -> #78'deki ürünler #60'a taşınır,
 *     POS veritabanındaki SaleItem / WarrantyClaim odooCategoryId=78 kayıtları
 *     60 yapılır, #78 (ve boş kalan "TÜM / Satılabilir..." üst kategorileri) arşivlenir.
 *  2) Test sırasında açılmış kategoriler (FAZ_B_, FAZ_C_, GS1IMP_, NOT47_,
 *     TEST_UTS_CAT_) arşivlenir.
 *
 * "Arşivleme": Odoo'da product.category'nin 'active' alanı varsa active=false;
 * yoksa (standart Odoo 17'de yok) kategori "ARŞİV (TEST / ESKİ)" adlı bir
 * üst kategorinin altına taşınır — silinmez, ürün ve geçmiş kayıtları bozulmaz.
 *
 * VARSAYILAN KURU ÇALIŞMA — hiçbir şey değişmez. Uygulamak için: --uygula
 *   npx ts-node --transpile-only scripts/kategori-temizlik.ts
 *   npx ts-node --transpile-only scripts/kategori-temizlik.ts --uygula
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { prisma } from '../src/database/prisma';

const UYGULA = process.argv.includes('--uygula');
const KAYNAK_ID = 78;
const HEDEF_ID = 60;
const TEST_DESEN = /^(FAZ_B_|FAZ_C_|GS1IMP_|NOT47_|TEST_UTS_CAT_)/;
const ARSIV_ADI = 'ARŞİV (TEST / ESKİ)';

async function main() {
  console.log(UYGULA ? '*** UYGULAMA MODU — değişiklik YAPILACAK ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const ctx: any = { active_test: false };
  const sir: any[] = (await execute('res.company', 'search_read', [[]], { fields: ['id'], context: ctx })) as any[];
  ctx.allowed_company_ids = sir.map((s) => s.id);

  const alanlar: any = await execute('product.category', 'fields_get', [], { attributes: ['type'] });
  const aktifVar = !!alanlar.active;
  console.log(`product.category 'active' alanı: ${aktifVar ? 'VAR (active=false ile arşivlenecek)' : `YOK (kategoriler "${ARSIV_ADI}" altına taşınacak)`}`);

  const kat: any[] = (await execute('product.category', 'search_read', [[]], { fields: ['id', 'name', 'complete_name', 'parent_id', 'child_id'], limit: 0, context: ctx })) as any[];
  const byId = new Map(kat.map((k) => [k.id, k]));
  const urunSay = async (id: number) =>
    (await execute('product.template', 'search_count', [[['categ_id', '=', id]]], { context: ctx })) as number;

  // ---------- 1) #78 -> #60 ----------
  const kaynak = byId.get(KAYNAK_ID);
  const hedef = byId.get(HEDEF_ID);
  console.log('\n=== 1) BİRLEŞTİRME ===');
  if (!kaynak || !hedef) {
    console.log(`  #${KAYNAK_ID} veya #${HEDEF_ID} bulunamadı, atlandı.`);
  } else {
    console.log(`  KAYNAK #${KAYNAK_ID}: ${kaynak.complete_name}  (üst: ${kaynak.parent_id ? kaynak.parent_id[1] : 'yok'}, alt kategori: ${kaynak.child_id.length})`);
    console.log(`  HEDEF  #${HEDEF_ID}: ${hedef.complete_name}`);
    const tmpl: any[] = (await execute('product.template', 'search_read', [[['categ_id', '=', KAYNAK_ID]]], { fields: ['id', 'name', 'active'], limit: 0, context: ctx })) as any[];
    console.log(`  #${KAYNAK_ID}'deki ürün şablonu: ${tmpl.length}`);
    for (const t of tmpl.slice(0, 15)) console.log(`     - ${t.name}${t.active ? '' : ' (arşivli)'}`);
    if (tmpl.length > 15) console.log(`     ... +${tmpl.length - 15}`);
    const posSale = await prisma.saleItem.count({ where: { odooCategoryId: KAYNAK_ID } });
    const posWar = await prisma.warrantyClaim.count({ where: { odooCategoryId: KAYNAK_ID } });
    console.log(`  POS veritabanında #${KAYNAK_ID} kullanan: satış kalemi ${posSale}, garanti kaydı ${posWar}`);
    if (UYGULA) {
      if (tmpl.length) await execute('product.template', 'write', [tmpl.map((t) => t.id), { categ_id: HEDEF_ID }], { context: ctx });
      await prisma.saleItem.updateMany({ where: { odooCategoryId: KAYNAK_ID }, data: { odooCategoryId: HEDEF_ID } });
      await prisma.warrantyClaim.updateMany({ where: { odooCategoryId: KAYNAK_ID }, data: { odooCategoryId: HEDEF_ID } });
      console.log(`  ✓ ${tmpl.length} ürün ve ${posSale + posWar} POS kaydı #${HEDEF_ID}'e taşındı`);
    }
  }

  // ---------- 2) arşivlenecekler ----------
  const arsiv: number[] = [];
  if (kaynak) {
    arsiv.push(KAYNAK_ID);
    // boş kalan üst zinciri ("TÜM", "TÜM / Satılabilir" ...) da arşivle
    let p = kaynak.parent_id ? byId.get(kaynak.parent_id[0]) : null;
    while (p && !String(p.complete_name).startsWith('All')) {
      const digerCocuk = p.child_id.filter((c: number) => !arsiv.includes(c));
      if (digerCocuk.length || (await urunSay(p.id))) break;
      arsiv.push(p.id);
      p = p.parent_id ? byId.get(p.parent_id[0]) : null;
    }
  }
  const testler = kat.filter((k) => TEST_DESEN.test(k.name) || TEST_DESEN.test(k.complete_name));
  arsiv.push(...testler.map((k) => k.id));

  console.log('\n=== 2) ARŞİVLENECEK KATEGORİLER ===');
  for (const id of arsiv) {
    const k = byId.get(id);
    const n = await urunSay(id);
    const pos = await prisma.saleItem.count({ where: { odooCategoryId: id } });
    console.log(`  #${id}  ${k.complete_name}  | ürün şablonu: ${n}${pos ? ` | POS satış kalemi: ${pos}` : ''}`);
  }

  if (UYGULA && arsiv.length) {
    if (aktifVar) {
      await execute('product.category', 'write', [arsiv, { active: false }], { context: ctx });
    } else {
      let ust = kat.find((k) => k.name === ARSIV_ADI && !k.parent_id);
      const ustId = ust ? ust.id : ((await execute('product.category', 'create', [{ name: ARSIV_ADI }], { context: ctx })) as number);
      // sadece en üstteki (üstü arşivlenmeyecek olan) kategorileri taşı, zincir korunur
      const tepe = arsiv.filter((id) => {
        const k = byId.get(id);
        return !(k.parent_id && arsiv.includes(k.parent_id[0]));
      });
      await execute('product.category', 'write', [tepe, { parent_id: ustId }], { context: ctx });
    }
    console.log(`  ✓ ${arsiv.length} kategori arşivlendi`);
  }
  console.log(UYGULA ? '\nTAMAM.' : '\nKuru çalışma bitti. Liste doğruysa aynı komutu sonuna --uygula ekleyerek çalıştırın.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
