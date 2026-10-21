/**
 * Salt-okunur TOPLU teşhis: Cam/Lens içe aktarımında "Miktarlar hizmet ya da
 * tüketilebilirlik için oluşturulamaz" hatası veren TÜM şablonları tek
 * seferde bulur. Kök neden: bu şablonlar ÖNCEDEN (bu Cam/Lens akışından
 * geçmeden) type='service'/'consu' olarak oluşturulmuş VE üzerlerinde zaten
 * en az bir stok hareketi (stock.move) var — bu da Odoo'nun type alanını bir
 * daha DEĞİŞTİRMEMİZE izin vermemesi anlamına geliyor (bkz.
 * sablon-tip-kilidi-coz.ts). cam-envanter-import-uygula.service.ts'teki
 * otomatik düzeltme bu durumda write hatasını yutup "zaten doğru olmalı"
 * diye devam ediyor — ama GERÇEKTEN yanlışsa (ki buradaki vaka budur), hata
 * stok adımında tekrar ortaya çıkıyor.
 *
 * Bu script'in yaptığı: name'i "Ürün Şablonu" formatına uyan (en az bir
 * rakam ve tire içeren, cam/lens tarzı) VEYA kategori adında "cam"/"lens"
 * geçen TÜM product.template kayıtlarını çeker, type/detailed_type/tracking
 * yanlış olanları filtreler, ve her biri için üzerinde gerçekten stok
 * hareketi olup olmadığını (yani kilidin GERÇEKTEN var olup olmadığını)
 * kontrol eder.
 *
 * Çıktıdaki her satır, sablon-tip-kilidi-coz.ts'e doğrudan beslenebilecek
 * bir --tmpl=ID.
 *
 * Kullanım:
 *   cd backend
 *   npm run teshis-cam-tip-kilidi-toplu
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

type Tmpl = {
  id: number;
  name: string;
  type: string;
  detailed_type: string;
  tracking: string;
  categ_id: [number, string] | false;
};

async function main() {
  const templates = (await execute(
    'product.template', 'search_read',
    [[]],
    {
      fields: ['id', 'name', 'type', 'detailed_type', 'tracking', 'categ_id'],
      limit: 10000,
      context: { active_test: false },
    },
  )) as Tmpl[];

  console.log(`Toplam ${templates.length} şablon tarandı.`);

  const bozuk = templates.filter((t) => {
    if (t.type === 'product' && t.tracking === 'serial' && t.detailed_type === 'product') return false;
    // zaten "[ESKİ-TİP-KİLİTLİ]" diye yeniden adlandırılmış olanları atla —
    // bunlar bilinçli olarak böyle bırakıldı, zaten bir yenisi var.
    if (t.name.startsWith('[ESKİ-TİP-KİLİTLİ]')) return false;
    return true;
  });

  console.log(`\n${bozuk.length} şablon type/detailed_type/tracking uyumsuz (product/serial değil).`);

  if (!bozuk.length) {
    console.log('Hiçbir sorunlu şablon yok.');
    return;
  }

  console.log('\nStok hareketi (kilit kanıtı) kontrol ediliyor...\n');

  const sonuclar: Array<{
    id: number; name: string; categ: string; type: string; detailed_type: string;
    tracking: string; moveCount: number; kilitli: boolean;
  }> = [];

  for (const t of bozuk) {
    const moveCount = await execute(
      'stock.move', 'search_count',
      [[['product_id.product_tmpl_id', '=', t.id]]],
      { context: { active_test: false } },
    ) as number;
    sonuclar.push({
      id: t.id,
      name: t.name,
      categ: t.categ_id ? t.categ_id[1] : '(kategori yok)',
      type: t.type,
      detailed_type: t.detailed_type,
      tracking: t.tracking,
      moveCount,
      kilitli: moveCount > 0,
    });
  }

  const kilitli = sonuclar.filter((s) => s.kilitli);
  const serbest = sonuclar.filter((s) => !s.kilitli);

  console.log(`=== KİLİTLİ (stok hareketi var — type alanı Odoo'da artık değiştirilemez, kopya-şablon gerekir) ===`);
  for (const s of kilitli) {
    console.log(`  #${s.id}  "${s.name}"  [${s.categ}]  type=${s.type}/${s.detailed_type} tracking=${s.tracking}  (${s.moveCount} stok hareketi)`);
  }
  console.log(`\nToplam ${kilitli.length} şablon KİLİTLİ. Her biri için şunu çalıştır:`);
  for (const s of kilitli) {
    console.log(`  npm run sablon-tip-kilidi-coz -- --tmpl=${s.id} --confirm`);
  }

  console.log(`\n=== SERBEST (stok hareketi YOK — direkt write ile düzeltilebilir, kopya-şablon GEREKMEZ) ===`);
  for (const s of serbest) {
    console.log(`  #${s.id}  "${s.name}"  [${s.categ}]  type=${s.type}/${s.detailed_type} tracking=${s.tracking}`);
  }
  console.log(`\nToplam ${serbest.length} şablon SERBEST — bunlar için product.template.write ile direkt type='product', detailed_type='product', tracking='serial' yazılabilir (kopya şablon oluşturmaya gerek yok).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
