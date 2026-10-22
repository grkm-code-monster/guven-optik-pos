/**
 * 22.10.2026 — CAM ve LENS kategorilerindeki TÜM ürünlerin (stok olsun/
 * olmasın) listesini, varyant ve yerel satış rakamlarıyla birlikte CSV
 * olarak terminale basar. SALT OKUNUR, hiçbir kayıt DEĞİŞTİRMEZ.
 *
 * "CAM" ve "LENS" burada, Günlük Kasa/Mağaza Özeti raporlarında kullanılan
 * AYNI kategori tespiti ile belirleniyor (bkz. backend/src/utils/
 * kategoriTespit.ts): Odoo kategori yolunda "OPTİK CAM"/"STOK CAM" geçenler
 * -> CAM (reçeteli gözlük camı), "LENS"/"KONTAKT" geçenler -> LENS (kontakt
 * lens). Yani kullanıcının sehven düzeltme yapacağı KDV kategorileriyle
 * birebir aynı tanım.
 *
 * Çıktı CSV formatında, '|' ayraçlı (TR locale'de virgül ondalık ayracı
 * olduğu için ',' kullanılmadı). Terminalden kopyalanıp Excel'e
 * yapıştırılabilir veya `> dosya.csv` ile dosyaya yönlendirilebilir.
 *
 * Kullanım:
 *   npm run cam-lens-urun-listesi
 *   (çıktıyı dosyaya almak için: npm run cam-lens-urun-listesi > cam-lens.csv)
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { ItemStatus, SaleStatus } from '@prisma/client';
import { execute } from '../src/modules/odoo/odoo.service';
import { kategoriTespit } from '../src/utils/kategoriTespit';

type OdooCategory = { id: number; complete_name?: string; name?: string };
type OdooProduct = {
  id: number;
  name: string;
  display_name: string;
  default_code: string | false;
  barcode: string | false;
  categ_id: [number, string] | false;
  qty_available: number;
  list_price: number;
  product_tmpl_id: [number, string];
};

async function main() {
  console.error('CAM/LENS kategorileri Odoo\'dan tespit ediliyor...');

  const categories = (await execute(
    'product.category',
    'search_read',
    [[]],
    { fields: ['id', 'complete_name', 'name'] },
  )) as OdooCategory[];

  const hedefKategoriIds: number[] = [];
  const kategoriPathById = new Map<number, string>();
  const kategoriEtiketById = new Map<number, 'CAM' | 'LENS'>();
  for (const c of categories) {
    const path = (c.complete_name ?? c.name ?? '').trim();
    const etiket = kategoriTespit(path);
    if (etiket === 'CAM' || etiket === 'LENS') {
      hedefKategoriIds.push(c.id);
      kategoriPathById.set(c.id, path);
      kategoriEtiketById.set(c.id, etiket as 'CAM' | 'LENS');
    }
  }

  if (!hedefKategoriIds.length) {
    console.error('Hiç CAM/LENS kategorisi bulunamadı — kategoriTespit eşleşmedi.');
    return;
  }
  console.error(`${hedefKategoriIds.length} kategori eşleşti (CAM+LENS). Ürünler çekiliyor (stok dahil/hariç hepsi)...`);

  // active_test:false -> arşivlenmiş (pasif) ürünler de dahil olsun
  const products = (await execute(
    'product.product',
    'search_read',
    [[['categ_id', 'in', hedefKategoriIds]]],
    {
      fields: ['id', 'name', 'display_name', 'default_code', 'barcode', 'categ_id', 'qty_available', 'list_price', 'product_tmpl_id'],
      context: { active_test: false },
      limit: 100000,
    },
  )) as OdooProduct[];

  console.error(`${products.length} ürün (varyant) bulundu. Şablon varyant sayıları hesaplanıyor...`);

  const tmplVaryantSayisi = new Map<number, number>();
  for (const p of products) {
    const tmplId = p.product_tmpl_id[0];
    tmplVaryantSayisi.set(tmplId, (tmplVaryantSayisi.get(tmplId) ?? 0) + 1);
  }

  console.error('Yerel DB\'den satış rakamları toplanıyor (tüm zamanlar, VOID hariç)...');

  const odooIdStrings = products.map((p) => String(p.id));
  const saleItems = await prisma.saleItem.findMany({
    where: {
      odooProductId: { in: odooIdStrings },
      status: { not: ItemStatus.VOID },
      sale: { status: { in: [SaleStatus.PAID] } },
    },
    select: {
      odooProductId: true,
      qty: true,
      lineTotal: true,
      sale: { select: { createdAt: true } },
    },
  });

  type Agg = { adet: number; tutar: number; sonTarih: Date | null };
  const satisAgg = new Map<string, Agg>();
  for (const it of saleItems) {
    const key = it.odooProductId!;
    const cur = satisAgg.get(key) ?? { adet: 0, tutar: 0, sonTarih: null };
    cur.adet += it.qty;
    cur.tutar += Number(it.lineTotal);
    const tarih = it.sale.createdAt;
    if (!cur.sonTarih || tarih > cur.sonTarih) cur.sonTarih = tarih;
    satisAgg.set(key, cur);
  }

  console.error(`Toplam ${products.length} satır yazılıyor. Aşağıdaki CSV'yi kopyala:`);
  console.error('='.repeat(100));

  const basliklar = [
    'Kategori',
    'Odoo Kategori Yolu',
    'Sablon Adi',
    'Varyant Adi',
    'Odoo Urun ID',
    'Referans Kodu',
    'Barkod',
    'Liste Fiyati',
    'Guncel Stok',
    'Sablon Varyant Sayisi',
    'Toplam Satis Adedi',
    'Toplam Satis Tutari',
    'Son Satis Tarihi',
  ];
  console.log(basliklar.join('|'));

  // Şablon adını (ilk variant'ın name alanı genelde şablon adıdır; display_name
  // varyant özniteliklerini ekler) ayırmak için display_name'den name'i çıkar.
  for (const p of products) {
    const categId = p.categ_id ? p.categ_id[0] : null;
    const etiket = categId != null ? kategoriEtiketById.get(categId) ?? '' : '';
    const kategoriPath = categId != null ? kategoriPathById.get(categId) ?? '' : '';
    const agg = satisAgg.get(String(p.id));
    const satir = [
      etiket,
      kategoriPath,
      p.name ?? '',
      p.display_name ?? '',
      String(p.id),
      p.default_code || '',
      p.barcode || '',
      p.list_price != null ? p.list_price.toFixed(2) : '0.00',
      String(p.qty_available ?? 0),
      String(tmplVaryantSayisi.get(p.product_tmpl_id[0]) ?? 1),
      String(agg?.adet ?? 0),
      (agg?.tutar ?? 0).toFixed(2),
      agg?.sonTarih ? agg.sonTarih.toISOString().slice(0, 10) : '',
    ];
    // Hücre içindeki '|' karakterini temizle (ayraçla çakışmasın)
    console.log(satir.map((s) => String(s).replace(/\|/g, '/')).join('|'));
  }

  console.error('='.repeat(100));
  console.log(`# TOPLAM SATIR: ${products.length}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
