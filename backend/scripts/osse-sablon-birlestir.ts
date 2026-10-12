/**
 * "OSSE GÜNEŞ GÖZLÜĞÜ" için mükerrer açılmış şablonları (5000 limit bug'ı
 * yüzünden) tek bir kanonik şablon (#12620, en çok varyantlı / orijinal
 * katalog) altında birleştirir:
 *
 *   - Her mükerrer şablondaki her varyant, model/renk/ölçü nitelik
 *     kombinasyonuna göre kanonik şablonda zaten var olan (stoksuz) eşiyle
 *     eşleştirilir.
 *   - O varyanttaki stok (lot bazlı), AYNI lot adı + UTS koduyla kanonik
 *     varyant altında yeniden oluşturulup oraya taşınır (stock.lot bir
 *     product_id'ye bağlı olduğu için "yeniden atama" yapılamaz — aynı
 *     isimle yeni bir lot açılır), mükerrer varyanttaki stok 0'a çekilir.
 *   - Barkod / maliyet (standard_price) mükerrer varyanttan kanonik
 *     varyanta kopyalanır (kanonikte bunlar boş/0 olduğu için).
 *   - Bir mükerrer şablonun TÜM varyantları boşaldıysa, o şablon arşivlenir
 *     (active=false) — satış geçmişi olmadığı zaten osse-sablon-incele ile
 *     doğrulandı.
 *
 * Varsayılan: DRY RUN (hiçbir şey yazmaz, sadece planı listeler).
 * Gerçek çalıştırma: --execute
 *
 * Kullanım:
 *   npm run osse-sablon-birlestir
 *   npm run osse-sablon-birlestir -- --execute
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';
import { getOrCreateStockLot } from '../src/modules/admin/stock-lot.service';
import { applyStockAdjustmentForLot } from '../src/modules/admin/stock-adjustment.service';
import { LOKASYON_ID_MAP, getCompanyIdFromLokasyon } from '../src/modules/odoo/odooLocations';

const URUN_ADI = 'OSSE GÜNEŞ GÖZLÜĞÜ';
const KANONIK_SABLON_ID = 12620;

const EXECUTE = process.argv.includes('--execute');

// location_id (numeric) -> frontend lokasyon kodu (ters map)
const LOCATION_ID_TO_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(LOKASYON_ID_MAP).map(([kod, id]) => [id, kod]),
);

type Variant = {
  id: number;
  barcode: string | false;
  standard_price: number;
  comboKey: string;
  comboLabel: string;
};

type Quant = {
  id: number;
  location_id: [number, string];
  quantity: number;
  lot_id: [number, string] | false;
};

async function getVariants(templateId: number): Promise<Variant[]> {
  const variants = (await execute(
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', templateId]]],
    {
      fields: ['id', 'barcode', 'standard_price', 'product_template_attribute_value_ids'],
      limit: 200,
      context: { active_test: false },
    },
  )) as {
    id: number;
    barcode: string | false;
    standard_price: number;
    product_template_attribute_value_ids: number[];
  }[];

  const out: Variant[] = [];
  for (const v of variants) {
    const ptavIds = v.product_template_attribute_value_ids ?? [];
    let comboLabel = '(nitelik yok)';
    let comboKey = '';
    if (ptavIds.length) {
      const ptavs = (await execute(
        'product.template.attribute.value',
        'read',
        [ptavIds],
        { fields: ['name'] },
      )) as { name: string }[];
      const names = ptavs.map((p) => p.name).sort();
      comboKey = names.join('|');
      comboLabel = names.join(' / ');
    }
    out.push({
      id: v.id,
      barcode: v.barcode,
      standard_price: v.standard_price,
      comboKey,
      comboLabel,
    });
  }
  return out;
}

async function getQuants(productId: number): Promise<Quant[]> {
  return (await execute(
    'stock.quant',
    'search_read',
    [[['product_id', '=', productId], ['quantity', '>', 0]]],
    { fields: ['id', 'location_id', 'quantity', 'lot_id'], limit: 20 },
  )) as Quant[];
}

async function main() {
  const templates = (await execute(
    'product.template',
    'search_read',
    [[['name', '=', URUN_ADI]]],
    { fields: ['id', 'name', 'active'], limit: 50, context: { active_test: false } },
  )) as { id: number; name: string; active: boolean }[];

  const kanonik = templates.find((t) => t.id === KANONIK_SABLON_ID);
  if (!kanonik) {
    throw new Error(`Kanonik şablon #${KANONIK_SABLON_ID} bulunamadı`);
  }
  const mukerrerler = templates.filter((t) => t.id !== KANONIK_SABLON_ID);

  console.log(`${EXECUTE ? 'GERÇEK ÇALIŞTIRMA' : 'DRY RUN (--execute yok)'}`);
  console.log(`Kanonik şablon: #${kanonik.id}`);
  console.log(`Mükerrer şablonlar: ${mukerrerler.map((t) => `#${t.id}`).join(', ')}\n`);

  const kanonikVariants = await getVariants(kanonik.id);
  const kanonikByCombo = new Map<string, Variant>();
  for (const v of kanonikVariants) {
    if (v.comboKey) kanonikByCombo.set(v.comboKey, v);
  }

  for (const sablon of mukerrerler) {
    console.log(`======================================================================`);
    console.log(`MÜKERRER ŞABLON #${sablon.id}`);
    const variants = await getVariants(sablon.id);
    let hepsiBosaldi = true;
    let hicVaryantIslendi = false;

    for (const v of variants) {
      const hedef = v.comboKey ? kanonikByCombo.get(v.comboKey) : undefined;
      if (!hedef) {
        console.log(
          `  ! #${v.id} [${v.comboLabel}] — kanonik şablonda eşleşen nitelik kombinasyonu YOK. ATLANIYOR (elle kontrol gerekir).`,
        );
        hepsiBosaldi = false;
        continue;
      }

      const quants = await getQuants(v.id);
      if (!quants.length) {
        console.log(`  - #${v.id} [${v.comboLabel}] → kanonik #${hedef.id}: stok yok, taşınacak bir şey yok.`);
        continue;
      }

      hicVaryantIslendi = true;
      for (const q of quants) {
        const locId = q.location_id[0];
        const lokasyonKodu = LOCATION_ID_TO_CODE[locId];
        if (!lokasyonKodu) {
          console.log(
            `  ! #${v.id} quant #${q.id}: lokasyon id ${locId} (${q.location_id[1]}) bilinen bir koda map'lenemedi. ATLANIYOR.`,
          );
          hepsiBosaldi = false;
          continue;
        }
        const lotId = q.lot_id ? q.lot_id[0] : null;
        if (!lotId) {
          console.log(`  ! #${v.id} quant #${q.id}: lot_id yok — bu stok lotsuz, elle kontrol gerekir. ATLANIYOR.`);
          hepsiBosaldi = false;
          continue;
        }
        const lotName = q.lot_id ? q.lot_id[1] : '';

        const lotRead = (await execute(
          'stock.lot',
          'read',
          [[lotId]],
          { fields: ['x_uts_kodu'] },
        )) as { x_uts_kodu?: string | false | null }[];
        const utsKodu = lotRead?.[0]?.x_uts_kodu || undefined;

        const companyId = getCompanyIdFromLokasyon(lokasyonKodu) ?? undefined;

        console.log(
          `  • #${v.id} [${v.comboLabel}] lot "${lotName}" (uts: ${utsKodu ?? '-'}) ${q.quantity} adet @ ${lokasyonKodu}` +
          ` → kanonik varyant #${hedef.id}`,
        );

        if (!EXECUTE) continue;

        const { lotId: yeniLotId, created } = await getOrCreateStockLot(
          lotName,
          hedef.id,
          companyId,
          v.barcode || undefined,
          utsKodu,
        );
        console.log(`      → kanonik lot ${created ? 'oluşturuldu' : 'zaten vardı'}: #${yeniLotId}`);

        await applyStockAdjustmentForLot({
          productId: hedef.id,
          locationCode: lokasyonKodu,
          lotId: yeniLotId,
          qty: q.quantity,
        });
        await applyStockAdjustmentForLot({
          productId: v.id,
          locationCode: lokasyonKodu,
          lotId,
          qty: 0,
        });
        console.log(`      → stok taşındı: ${lokasyonKodu} ${q.quantity} adet, kaynak #${v.id} sıfırlandı.`);
      }

      // Barkod / maliyet kopyala (kanonikte boşsa)
      if (EXECUTE) {
        const patch: Record<string, unknown> = {};
        if (v.barcode && !hedef.barcode) patch.barcode = v.barcode;
        if (v.standard_price && !hedef.standard_price) patch.standard_price = v.standard_price;
        if (Object.keys(patch).length) {
          await execute('product.product', 'write', [[hedef.id], patch]);
          console.log(`      → kanonik #${hedef.id} güncellendi: ${JSON.stringify(patch)}`);
        }
      } else if ((v.barcode && !hedef.barcode) || (v.standard_price && !hedef.standard_price)) {
        console.log(
          `      (planlanan) kanonik #${hedef.id} için barkod/maliyet kopyalanacak: ` +
          `barkod=${v.barcode || '-'} maliyet=${v.standard_price}`,
        );
      }
    }

    if (!hicVaryantIslendi && hepsiBosaldi) {
      console.log(`  (Bu şablonun hiç stoklu varyantı yoktu.)`);
    }

    if (hepsiBosaldi) {
      console.log(`  → Tüm varyantlar eşleşti/boşaldı. Şablon #${sablon.id} arşivlenecek.`);
      if (EXECUTE) {
        // Son kontrol: gerçekten stok kalmadı mı?
        let kalanStok = 0;
        for (const v of variants) {
          const q = await getQuants(v.id);
          kalanStok += q.reduce((s, x) => s + x.quantity, 0);
        }
        if (kalanStok > 0) {
          console.log(`  ! Beklenmedik: ${kalanStok} adet stok kaldı, şablon ARŞİVLENMEDİ.`);
        } else {
          await execute('product.template', 'write', [[sablon.id], { active: false }]);
          console.log(`  ✓ Şablon #${sablon.id} arşivlendi.`);
        }
      }
    } else {
      console.log(`  → Bazı varyantlar eşleşmedi/atlandı — şablon #${sablon.id} ARŞİVLENMEYECEK.`);
    }
  }

  console.log(`\n${EXECUTE ? 'Tamamlandı.' : 'Dry run bitti — gerçek değişiklik yapmak için --execute ekleyin.'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
