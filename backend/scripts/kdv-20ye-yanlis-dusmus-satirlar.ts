/**
 * 22.10.2026 KDV hatası teşhisi — SALT OKUNUR, hiçbir kayıt DEĞİŞTİRMEZ.
 *
 * Arka plan: 16.10.2026'da "bir cam %20 kayıtlıyken olması gereken %10'muş"
 * şikayeti üzerine, satış ekranı artık KDV oranını Odoo'daki ürün vergisinden
 * DEĞİL, mağazanın kendi kategori-bazlı varsayılan tablosundan atıyor
 * (Optik Cam/Çerçeve/renksiz Kontakt Lens: %10, Güneş Gözlüğü/Solüsyon/
 * Aksesuar/Bakım/renkli Kontakt Lens: %20) — bkz. packages/web/src/
 * components/sale/ItemsStep.tsx kategoriKdvOrani(). Yani Odoo'nun kendisi
 * BİLEREK güvenilmiyor, bazı ürünlerde Odoo'da hâlâ yanlış/eski KDV kayıtlı
 * olabiliyor.
 *
 * 22.10.2026'da bulunan asıl hata: recalcSaleTotals, kalem eklenirken bu
 * kategori-varsayımıyla doğru atanan oranı (örn. %10), her yeniden
 * hesaplamada (miktar/iskonto değişince, HATTA confirmSale'de satış
 * onaylanırken bile) resolveSaleItemTaxRate'i inputTaxRate GÖNDERMEDEN
 * tekrar çalıştırarak kaybediyor, ve bu ürünler Odoo'ya bağlı olduğu için
 * (odooProductId dolu) Odoo'nun GÜVENİLMEYEN kendi oranına (çoğu zaman %20)
 * geri dönüyordu. Düzeltildi (bkz. sale.service.ts recalcSaleTotals) —
 * artık kalemin zaten sahip olduğu oran korunuyor.
 *
 * NOT: Odoo'nun kendisi de aynı (yanlış) %20'yi döndürdüğü için, "kayıtlı
 * taxRate ile Odoo'daki güncel oranı karşılaştırma" yöntemi işe yaramadı —
 * ikisi de yanlışta hemfikir. Bu yüzden script artık, bugün taxRate=%20
 * olarak kayıtlı TÜM kalemlerin Odoo ürün adını çekip listeliyor; ürün adına
 * bakarak (CAM/LENS/ÇERÇEVE reçeteli ürünse muhtemelen %10 olmalıydı, GÜNEŞ
 * GÖZLÜĞÜ/AKSESUAR/SOLÜSYON/BAKIM ise muhtemelen gerçekten %20) sen karar
 * vermen gerekiyor — otomatik düzeltme YOK.
 *
 * Düzeltme admin panelindeki mevcut "KDV Düzeltme" ekranından (Satış Detay
 * sayfası, sadece ADMIN) elle yapılır; her düzeltme AuditLog'a yazılır,
 * Odoo faturasına dokunulmaz.
 *
 * Kullanım:
 *   npm run kdv-20ye-yanlis-dusmus-satirlar -- 2026-10-22
 *   (tarih verilmezse bugünün tarihi kullanılır)
 */
import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { SaleStatus } from '@prisma/client';
import { execute } from '../src/modules/odoo/odoo.service';

function paraFmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CAM_LENS_IPUCU = /\b(1[.,]\d{2}|HD|HMC|UC|CR-?39|POLİKARBON|POLIKARBON|ASFERİK|ASFERIK|FOTOKROMİK|FOTOKROMIK|MULTİFOKAL|MULTIFOKAL|PROGRESİF|PROGRESIF)\b/i;
const CERCEVE_IPUCU = /ÇERÇEVE|CERCEVE|FRAME/i;
const GUNES_IPUCU = /GÜNEŞ|GUNES|SUN/i;

function tahmin(ad: string): string {
  if (GUNES_IPUCU.test(ad)) return 'muhtemelen GÜNEŞ GÖZLÜĞÜ -> %20 DOĞRU OLABİLİR';
  if (CAM_LENS_IPUCU.test(ad)) return 'muhtemelen CAM/LENS -> %10 OLMALIYDI, KONTROL ET';
  if (CERCEVE_IPUCU.test(ad)) return 'muhtemelen ÇERÇEVE -> %10 OLMALIYDI, KONTROL ET';
  return 'belirsiz — ürün adına bakıp elle karar ver';
}

async function main() {
  const tarihArg = process.argv[2];
  const gun = tarihArg ? new Date(tarihArg + 'T00:00:00') : new Date();
  gun.setHours(0, 0, 0, 0);
  const gunSonu = new Date(gun);
  gunSonu.setDate(gunSonu.getDate() + 1);

  console.log('='.repeat(78));
  console.log(`%20 KDV'li kalemler (ürün adıyla) — ${gun.toLocaleDateString('tr-TR')}`);
  console.log('='.repeat(78));

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: [SaleStatus.PAID, SaleStatus.DRAFT] },
      createdAt: { gte: gun, lt: gunSonu },
    },
    include: {
      customer: { select: { name: true } },
      items: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const branchIds = Array.from(new Set(sales.map((s) => s.branchId)));
  const branches = branchIds.length
    ? await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, code: true } })
    : [];
  const branchCodeById = new Map(branches.map((b) => [b.id, b.code]));

  if (!sales.length) {
    console.log('\nBu tarihte hiç satış bulunamadı.');
    return;
  }

  // Odoo ürün adlarını toplu çek
  const odooIds = Array.from(
    new Set(
      sales
        .flatMap((s) => s.items)
        .filter((it) => it.taxRate != null && Number(it.taxRate) === 20 && it.odooProductId)
        .map((it) => parseInt(String(it.odooProductId), 10))
        .filter((n) => Number.isFinite(n)),
    ),
  );
  const nameById = new Map<number, string>();
  if (odooIds.length) {
    try {
      const rows = (await execute('product.product', 'read', [odooIds], { fields: ['display_name'] })) as Array<{
        id: number;
        display_name: string;
      }>;
      for (const r of rows) nameById.set(r.id, r.display_name);
    } catch (err) {
      console.warn('Odoo\'dan ürün adları okunamadı:', err instanceof Error ? err.message : err);
    }
  }

  let toplamKdv20 = 0;
  let adet = 0;

  for (const sale of sales) {
    const yirmilikler = sale.items.filter((it) => it.taxRate != null && Number(it.taxRate) === 20);
    if (!yirmilikler.length) continue;

    console.log('');
    console.log(`Satış #${sale.id}  [${branchCodeById.get(sale.branchId) ?? '—'}]  ${sale.customer?.name ?? '—'}  (${sale.status})  ${sale.createdAt.toLocaleTimeString('tr-TR')}`);

    for (const it of yirmilikler) {
      const pid = it.odooProductId ? parseInt(String(it.odooProductId), 10) : NaN;
      const ad = (Number.isFinite(pid) ? nameById.get(pid) : null) ?? it.odooProductName ?? '(ürün adı okunamadı)';
      const eskiTax = Number(it.taxAmount);
      adet++;
      toplamKdv20 += eskiTax;
      console.log(`  - [${it.id}] odooProductId=${it.odooProductId ?? '—'}  "${ad}"  KDV tutarı: ${paraFmt(eskiTax)} TL`);
      console.log(`      -> ${tahmin(ad)}`);
    }
  }

  console.log('');
  console.log('='.repeat(78));
  if (adet === 0) {
    console.log('Bu tarihte hiç %20 KDV\'li kalem yok.');
  } else {
    console.log(`Toplam ${adet} kalem %20 KDV ile kayıtlı, toplam KDV tutarı: ${paraFmt(toplamKdv20)} TL.`);
    console.log('Yukarıdaki tahminlere göre "CAM/LENS" veya "ÇERÇEVE" diye işaretlenenleri');
    console.log('gözden geçir — gerçekten reçeteli optik ürünse admin panelindeki Satış');
    console.log('Detay > "KDV Düzeltme" ekranından %10\'a düzelt. "GÜNEŞ GÖZLÜĞÜ" ve');
    console.log('"belirsiz" diye işaretlenenlere dokunma/önce ürünü kontrol et.');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
