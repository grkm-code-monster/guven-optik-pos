/**
 * 27.10.2026 — Kategori temizliği 2. tur (Görkem'in talebi).
 *  1) "All / OPTİK ÇERÇEVE / ALT GRUP" iki kez var (#45, #68) -> tek kategori.
 *     Ürünü çok olan KALIR, diğerinin ürünleri ona taşınır; POS'taki
 *     SaleItem / WarrantyClaim odooCategoryId de çevrilir; boşalan kategori
 *     "ARŞİV (TEST / ESKİ)" altına taşınır (Odoo'da kategori arşiv alanı yok).
 *  2) "ARŞİV (TEST / ESKİ)" altındaki kategorilerde kalan (test) ürün
 *     şablonları arşivlenir (active=false) — silinmez.
 * VARSAYILAN KURU ÇALIŞMA. Uygulamak için: --uygula
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { prisma } from '../src/database/prisma';

const UYGULA = process.argv.includes('--uygula');
const IKIZ = [45, 68];
const ARSIV_ADI = 'ARŞİV (TEST / ESKİ)';

async function main() {
  console.log(UYGULA ? '*** UYGULAMA MODU — değişiklik YAPILACAK ***' : '--- KURU ÇALIŞMA — hiçbir şey değişmeyecek (uygulamak için --uygula) ---');
  const ctx: any = { active_test: false };
  const sir: any[] = (await execute('res.company', 'search_read', [[]], { fields: ['id'], context: ctx })) as any[];
  ctx.allowed_company_ids = sir.map((s) => s.id);
  const kat: any[] = (await execute('product.category', 'search_read', [[]], { fields: ['id', 'name', 'complete_name', 'parent_id', 'child_id'], limit: 0, context: ctx })) as any[];
  const byId = new Map(kat.map((k) => [k.id, k]));
  const tmplOf = async (ids: number[]) =>
    (await execute('product.template', 'search_read', [[['categ_id', 'in', ids]]], { fields: ['id', 'name', 'default_code', 'active', 'categ_id'], limit: 0, context: ctx })) as any[];

  // ---------- 1) #45 / #68 ----------
  console.log('\n=== 1) OPTİK ÇERÇEVE / ALT GRUP BİRLEŞTİRME ===');
  const ikiz = IKIZ.map((id) => byId.get(id)).filter(Boolean);
  let kalan: any = null, giden: any = null, gidenUrun: any[] = [];
  if (ikiz.length !== 2) {
    console.log('  İki kategoriden biri bulunamadı, atlandı.');
  } else {
    const say = await Promise.all(ikiz.map(async (k) => ({ k, urun: await tmplOf([k.id]), pos: await prisma.saleItem.count({ where: { odooCategoryId: k.id } }) })));
    for (const s of say) console.log(`  #${s.k.id} ${s.k.complete_name} | ürün şablonu: ${s.urun.length} | POS satış kalemi: ${s.pos} | alt kategori: ${s.k.child_id.length}`);
    say.sort((a, b) => b.urun.length - a.urun.length || a.k.id - b.k.id);
    kalan = say[0].k; giden = say[1].k; gidenUrun = say[1].urun;
    console.log(`  -> KALACAK: #${kalan.id}   TAŞINACAK/ARŞİVE: #${giden.id} (${gidenUrun.length} ürün taşınacak)`);
    if (giden.child_id.length) console.log(`  ⚠️ #${giden.id}'in alt kategorileri var, onlar da #${kalan.id} altına taşınacak`);
    if (UYGULA) {
      if (gidenUrun.length) await execute('product.template', 'write', [gidenUrun.map((t) => t.id), { categ_id: kalan.id }], { context: ctx });
      if (giden.child_id.length) await execute('product.category', 'write', [giden.child_id, { parent_id: kalan.id }], { context: ctx });
      const a = await prisma.saleItem.updateMany({ where: { odooCategoryId: giden.id }, data: { odooCategoryId: kalan.id } });
      const b = await prisma.warrantyClaim.updateMany({ where: { odooCategoryId: giden.id }, data: { odooCategoryId: kalan.id } });
      console.log(`  ✓ ${gidenUrun.length} ürün ve ${a.count + b.count} POS kaydı #${kalan.id}'e taşındı`);
    }
  }

  // ---------- 2) arşiv kategorilerindeki ürünler ----------
  console.log('\n=== 2) ARŞİV KATEGORİLERİNDEKİ ÜRÜNLER ===');
  let arsiv = kat.find((k) => k.name === ARSIV_ADI && !k.parent_id);
  let arsivId: number | null = arsiv ? arsiv.id : null;
  const altlar = (id: number): number[] => {
    const k = byId.get(id);
    return k ? [id, ...k.child_id.flatMap((c: number) => altlar(c))] : [id];
  };
  const arsivKatIds = arsivId ? altlar(arsivId).filter((id) => id !== arsivId) : [];
  const urunler = arsivKatIds.length ? await tmplOf(arsivKatIds) : [];
  const aktifler = urunler.filter((u) => u.active);
  console.log(`  Arşiv altındaki kategori: ${arsivKatIds.length} | ürün şablonu: ${urunler.length} (aktif: ${aktifler.length})`);
  for (const u of urunler) console.log(`     - [${u.categ_id?.[1]}] ${u.name}${u.default_code ? ' (' + u.default_code + ')' : ''}${u.active ? '' : '  — zaten arşivli'}`);

  if (UYGULA) {
    if (aktifler.length) await execute('product.template', 'write', [aktifler.map((u) => u.id), { active: false }], { context: ctx });
    console.log(`  ✓ ${aktifler.length} ürün arşivlendi`);
    if (giden) {
      if (!arsivId) arsivId = (await execute('product.category', 'create', [{ name: ARSIV_ADI }], { context: ctx })) as number;
      await execute('product.category', 'write', [[giden.id], { parent_id: arsivId }], { context: ctx });
      console.log(`  ✓ #${giden.id} "${ARSIV_ADI}" altına taşındı`);
    }
  }
  console.log(UYGULA ? '\nTAMAM.' : '\nKuru çalışma bitti. Doğruysa aynı komutu sonuna --uygula ekleyerek çalıştırın.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
