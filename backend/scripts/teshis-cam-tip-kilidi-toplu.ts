/**
 * Salt-okunur TOPLU teşhis: "Miktarlar hizmet ya da tüketilebilirlik için
 * oluşturulamaz" hatasına sebep olan TÜM şablonları tek seferde bulur.
 *
 * ÖNEMLİ (21.10.2026 düzeltmesi) — İLK SÜRÜM type/detailed_type/tracking
 * ÜÇÜNÜN DE 'product'/'serial' olmasını zorunlu tutuyordu; bu, tracking'i
 * bilinçli olarak 'lot' veya 'none' olan BAŞKA ürün ailelerini (çerçeve vb.)
 * da "bozuk" sayıp binlerce yanlış-pozitif üretti (9566/10000!) ve her biri
 * için tek tek stock.move sorgusu sunucuyu gereksiz yere yordu.
 *
 * GERÇEK hata sinyali SADECE type alanı — Odoo "Miktarlar hizmet ya da
 * tüketilebilirlik için oluşturulamaz" hatasını SADECE type='service' veya
 * type='consu' olduğunda verir (bkz. sablon-tip-kilidi-coz.ts). tracking
 * alanı bu hatayla ilgisiz. Bu yüzden bu script ARTIK SADECE type != 'product'
 * olan şablonları arıyor.
 *
 * GÜVENLİK: type != 'product' olan şablonların HEPSİ Cam/Lens'ten kalma
 * bozuk kayıt DEĞİL — "Göz Muayenesi", "Kargo" gibi GERÇEK hizmet/masraf
 * kalemleri de bilinçli olarak type='service' tutulmuş olabilir. Bu yüzden
 * sonuçlar iki gruba ayrılıyor: "CAM/LENS BENZERİ İSİM" (ör. "1.56 Org Et
 * -0200-0200" formatına uyan, yani bir dioptri/sıra kodu içeren) ve "DİĞER"
 * (muhtemelen gerçek hizmet kalemleri — ELLE incelenmeli, toplu
 * düzeltilmemeli). sablon-tip-serbest-toplu-duzelt.ts SADECE birinci gruba
 * dokunur.
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
import { CAM_LENS_ISIM_DESENI } from './cam-lens-isim-deseni';

type Tmpl = {
  id: number;
  name: string;
  type: string;
  detailed_type: string;
  tracking: string;
  categ_id: [number, string] | false;
};

async function main() {
  // SADECE type != 'product' olanları çek (service/consu) — asıl hatanın
  // tek gerçek sebebi bu. 'in' domain'i ile tek sorguda, 10000 kaydı tek
  // tek taramak yerine.
  const bozuk = (await execute(
    'product.template', 'search_read',
    [[['type', '!=', 'product']]],
    {
      fields: ['id', 'name', 'type', 'detailed_type', 'tracking', 'categ_id'],
      limit: 5000,
      context: { active_test: false },
    },
  )) as Tmpl[];

  const filtreli = bozuk.filter((t) => !t.name.startsWith('[ESKİ-TİP-KİLİTLİ]'));

  console.log(`type != 'product' olan ${bozuk.length} şablon bulundu (${filtreli.length} tanesi zaten "[ESKİ-TİP-KİLİTLİ]" işaretli değil).\n`);

  if (!filtreli.length) {
    console.log('Hiçbir sorunlu şablon yok.');
    return;
  }

  console.log('Stok hareketi (kilit kanıtı) kontrol ediliyor (tek sorguda)...\n');

  const tmplIds = filtreli.map((t) => t.id);
  const varyantlar = (await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', 'in', tmplIds]]],
    { fields: ['id', 'product_tmpl_id'], limit: 20000, context: { active_test: false } },
  )) as { id: number; product_tmpl_id: [number, string] }[];

  const varyantIdToTmplId = new Map<number, number>();
  for (const v of varyantlar) varyantIdToTmplId.set(v.id, v.product_tmpl_id[0]);

  const hareketliTmplIdSet = new Set<number>();
  if (varyantlar.length) {
    const moveProductIds = (await execute(
      'stock.move', 'search_read',
      [[['product_id', 'in', varyantlar.map((v) => v.id)]]],
      { fields: ['product_id'], limit: 50000, context: { active_test: false } },
    )) as { product_id: [number, string] }[];
    for (const m of moveProductIds) {
      const tmplId = varyantIdToTmplId.get(m.product_id[0]);
      if (tmplId) hareketliTmplIdSet.add(tmplId);
    }
  }

  const lensBenzeri = (t: Tmpl) => CAM_LENS_ISIM_DESENI.test(t.name);

  const kilitli = filtreli.filter((t) => hareketliTmplIdSet.has(t.id));
  const serbest = filtreli.filter((t) => !hareketliTmplIdSet.has(t.id));

  const yazdir = (liste: Tmpl[], baslik: string) => {
    console.log(`\n=== ${baslik} (${liste.length}) ===`);
    for (const t of liste) {
      console.log(`  #${t.id}  "${t.name}"  [${t.categ_id ? t.categ_id[1] : '-'}]  type=${t.type}/${t.detailed_type} tracking=${t.tracking}`);
    }
  };

  yazdir(kilitli.filter(lensBenzeri), 'KİLİTLİ — CAM/LENS BENZERİ İSİM (stok hareketi var, kopya şablon gerekir)');
  yazdir(kilitli.filter((t) => !lensBenzeri(t)), 'KİLİTLİ — DİĞER (muhtemelen GERÇEK hizmet kalemi — ELLE incele, dokunma)');
  yazdir(serbest.filter(lensBenzeri), 'SERBEST — CAM/LENS BENZERİ İSİM (stok hareketi yok, direkt düzeltilebilir)');
  yazdir(serbest.filter((t) => !lensBenzeri(t)), 'SERBEST — DİĞER (muhtemelen GERÇEK hizmet kalemi — ELLE incele, dokunma)');

  const kilitliLens = kilitli.filter(lensBenzeri);
  console.log(`\nKİLİTLİ + cam/lens-benzeri olanlar için şunu çalıştır:`);
  for (const t of kilitliLens) {
    console.log(`  npm run sablon-tip-kilidi-coz -- --tmpl=${t.id} --confirm`);
  }

  console.log(`\nSERBEST + cam/lens-benzeri olanlar: "npm run sablon-tip-serbest-toplu-duzelt -- --confirm" ile TEK KOMUTLA düzeltilebilir (bu script SADECE o grubu düzeltir).`);
  console.log(`\n"DİĞER" gruplarına GİRMEYEN hiçbir otomatik script dokunmaz — bunlar muhtemelen gerçek hizmet/masraf kalemleri, elle kontrol edilmeli.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
