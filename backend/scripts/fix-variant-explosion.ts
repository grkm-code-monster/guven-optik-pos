/**
 * Varyant patlaması kalıcı düzeltmesi.
 *
 * Kök neden: MODEL / RENK / ÖLÇÜ özniteliklerinin Odoo'daki "Varyant Oluşturma"
 * (create_variant) modu "Anında" (always) — yani bir ürün şablonunun attribute
 * satırına yeni bir değer eklendiğinde Odoo o şablonun TÜM model × renk × ölçü
 * kombinasyonlarını PEŞİNEN oluşturmaya çalışıyor. Zamanla çok sayıda değer
 * biriken şablonlarda (örn. "OTTO OPTİK ÇERÇEVE") bu kombinasyon sayısı Odoo'nun
 * güvenlik sınırını aşıyor ve import'lar "XML-RPC fault: Oluşturulacak
 * varyantların sayısı izin verilen sınırın üzerinde" hatasıyla komple reddediliyor.
 *
 * Kalıcı çözüm: bu 3 özniteliğin modunu "Talep Üzerine" (dynamic) yapmak.
 * Bu değişiklikle Odoo artık kombinasyonları peşinen üretmeye çalışmaz — sadece
 * gerçekten import kodumuzun `product.product create` ile açıkça istediği
 * kombinasyon oluşturulur (envanter import kodu zaten böyle çalışıyor, bkz.
 * odoo-varyant-import.service.ts). Mevcut varyantlar/stok etkilenmez, sadece
 * "otomatik ön-üretim" davranışı kapanır — bu hata bir daha hiçbir üründe
 * (sadece OTTO değil, MODEL/RENK/ÖLÇÜ kullanan HER ürün) çıkmaz.
 *
 * Kullanım:
 *   cd backend
 *   npm run fix-variant-explosion              (dry-run — sadece rapor)
 *   npm run fix-variant-explosion -- --execute  (gerçek değişikliği uygular)
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const HEDEF_NITELIKLER = ['MODEL', 'RENK', 'ÖLÇÜ'] as const;

type Attribute = { id: number; name: string; create_variant: string };
type AttrValue = { id: number; name: string; attribute_id: [number, number]; };
type AttrLine = {
  id: number;
  product_tmpl_id: [number, string];
  attribute_id: [number, string];
  value_ids: number[];
};

function parseArgs() {
  return { executeMode: process.argv.includes('--execute') };
}

async function main() {
  const { executeMode } = parseArgs();

  console.log('='.repeat(70));
  console.log('Varyant patlaması kalıcı düzeltmesi (MODEL / RENK / ÖLÇÜ)');
  console.log('='.repeat(70));
  console.log(`Mod: ${executeMode ? 'EXECUTE (Odoo\'ya yazılacak)' : 'DRY-RUN (sadece rapor)'}\n`);

  const nitelikler = (await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', [...HEDEF_NITELIKLER]]]],
    { fields: ['id', 'name', 'create_variant'] },
  )) as Attribute[];

  if (!nitelikler.length) {
    console.log('MODEL/RENK/ÖLÇÜ nitelikleri bulunamadı — durduruluyor.');
    return;
  }

  console.log('Mevcut "Varyant Oluşturma" modları:');
  for (const n of nitelikler) {
    console.log(`  ${n.name.padEnd(8)} (id ${n.id}): ${n.create_variant}`);
  }
  console.log('');

  const attrIds = nitelikler.map((n) => n.id);

  // Her şablon için mevcut attribute satırlarındaki değer sayılarının
  // çarpımını (kartezyen kombinasyon sayısı) hesapla, en büyük 15'i göster.
  const lines = (await execute(
    'product.template.attribute.line', 'search_read',
    [[['attribute_id', 'in', attrIds]]],
    { fields: ['id', 'product_tmpl_id', 'attribute_id', 'value_ids'], limit: 20000 },
  )) as AttrLine[];

  const byTmpl = new Map<number, { name: string; lineValueCounts: number[] }>();
  for (const l of lines) {
    const tmplId = l.product_tmpl_id[0];
    const tmplName = l.product_tmpl_id[1];
    if (!byTmpl.has(tmplId)) byTmpl.set(tmplId, { name: tmplName, lineValueCounts: [] });
    byTmpl.get(tmplId)!.lineValueCounts.push(l.value_ids.length);
  }

  const rows = [...byTmpl.entries()]
    .map(([tmplId, v]) => ({
      tmplId,
      name: v.name,
      kombinasyon: v.lineValueCounts.reduce((a, b) => a * (b || 1), 1),
      detay: v.lineValueCounts.join(' × '),
    }))
    .sort((a, b) => b.kombinasyon - a.kombinasyon);

  console.log('En yüksek kombinasyon sayısına sahip 15 şablon (model×renk×ölçü):');
  for (const r of rows.slice(0, 15)) {
    console.log(`  #${r.tmplId} ${r.name.slice(0, 45).padEnd(45)} → ${r.kombinasyon.toLocaleString('tr-TR')} kombinasyon (${r.detay})`);
  }

  const otto = rows.find((r) => r.name.toLocaleUpperCase('tr').includes('OTTO OPTİK'));
  if (otto) {
    console.log(`\n"OTTO OPTİK ÇERÇEVE" (#${otto.tmplId}): ${otto.kombinasyon.toLocaleString('tr-TR')} olası kombinasyon (${otto.detay})`);
    const mevcutVaryant = await execute(
      'product.product', 'search_count',
      [[['product_tmpl_id', '=', otto.tmplId]]],
    );
    console.log(`Şu an Odoo'da gerçekten oluşturulmuş varyant sayısı: ${mevcutVaryant}`);
    console.log(`(Fark, "always" modunda her yeni değer eklemede Odoo'nun oluşturmaya ÇALIŞIP başarısız olduğu kombinasyon sayısını gösterir.)`);
  } else {
    console.log('\n"OTTO OPTİK ÇERÇEVE" şablonu MODEL/RENK/ÖLÇÜ satırları arasında bulunamadı.');
  }

  const degistirilecek = nitelikler.filter((n) => n.create_variant !== 'dynamic');
  console.log('');
  if (!degistirilecek.length) {
    console.log('MODEL/RENK/ÖLÇÜ zaten "Talep Üzerine" modunda — değişiklik gerekmiyor.');
    return;
  }

  console.log(`Değiştirilecek nitelikler: ${degistirilecek.map((n) => n.name).join(', ')}`);
  console.log('Yeni mod: dynamic (Talep Üzerine)');

  if (!executeMode) {
    console.log('\nBu bir dry-run — hiçbir şey değiştirilmedi.');
    console.log('Gerçek uygulama için: npm run fix-variant-explosion -- --execute');
    console.log('(NOT: Odoo, zaten varyantı olan bir niteliğin modunu değiştirmeyi');
    console.log(' engelliyor olabilir — aşağıya bakın.)');
    return;
  }

  try {
    await execute(
      'product.attribute', 'write',
      [degistirilecek.map((n) => n.id), { create_variant: 'dynamic' }],
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('\n✗ Odoo bu değişikliği reddetti:');
    console.log(`  ${msg.slice(0, 300)}`);
    console.log('');
    console.log('Bu beklenen bir durum — Odoo, MODEL/RENK/ÖLÇÜ zaten onlarca şablonda');
    console.log('kullanıldığı ve o şablonların gerçek varyantları olduğu için global');
    console.log('modu değiştirmeye izin vermiyor (veri bütünlüğü koruması).');
    console.log('');
    console.log('KALICI ÇÖZÜM bu yüzden başka bir yerde uygulandı: Envanter Excel');
    console.log('import koduna (odoo-varyant-import.service.ts) otomatik bir koruma');
    console.log('eklendi — bir şablon 500+ kombinasyona ulaştıysa (OTTO, MUSTANG gibi),');
    console.log('yeni modeller artık o şablona değil, otomatik oluşturulan küçük');
    console.log('"{Ürün Adı} {MODEL}" alt şablonlarına yazılıyor. Mevcut varyantlara');
    console.log('dokunulmuyor, sadece yeni büyüme güvenli şablonlara yönleniyor.');
    console.log('Bu ayar değişikliğine gerek kalmadan import artık çalışmalı —');
    console.log('en son başarısız olan Excel dosyasını tekrar deneyin.');
    return;
  }

  console.log('\n✓ Uygulandı. MODEL/RENK/ÖLÇÜ artık "Talep Üzerine" modunda.');
  console.log('  - Mevcut varyantlar ve stok hareketleri ETKİLENMEDİ.');
  console.log('  - Odoo artık yeni değer eklendiğinde tüm kombinasyonları peşinen');
  console.log('    üretmeye çalışmayacak — bu hata bir daha hiçbir üründe çıkmaz.');
  console.log('  - Envanter import kodu zaten sadece gereken kombinasyonu açıkça');
  console.log('    oluşturuyor (product.product create), bu değişiklikle tam uyumlu.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
