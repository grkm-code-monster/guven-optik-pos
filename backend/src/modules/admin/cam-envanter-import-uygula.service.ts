import { getCompanyIdFromLokasyon } from '../odoo/odooLocations';
import { execute } from '../odoo/odoo.service';
import {
  previewCamEnvanterImport,
  type ParsedCamEnvanterRow,
} from './cam-envanter-import.service';
import { createEnvanterSablon } from './odoo-varyant-import.service';
import { applyStockAdjustmentForLot } from './stock-adjustment.service';
import {
  getOrCreateStockLot,
  rollbackCreatedLot,
} from './stock-lot.service';
import { resolveEnvanterLotFields } from '../odoo/gs1-parser.util';
import {
  formatCategoryCandidatesMessage,
  mapCategoryCandidates,
  OdooCategoryMatchError,
  type KategoriAdaySatir,
} from '../odoo/odoo-category.util';
import { CAM_TEMSILCI_BARKOD_ONEKI } from './cam-envanter-import.constants';

export type CamEnvanterUygulaSatirSonuc = {
  satirNo: number;
  durum: 'BASARILI' | 'BASARISIZ';
  mesaj: string;
  olusturulanLotId?: number;
  olusturulanVaryantId?: number;
  kategoriAdaylari?: KategoriAdaySatir[];
};

export type CamEnvanterUygulaSonuc = {
  ozet: { basarili: number; basarisiz: number };
  satirlar: CamEnvanterUygulaSatirSonuc[];
};

function urunAnahtar(kategori: string, urunSablonu: string): string {
  return `${kategori.trim().toUpperCase()}::${urunSablonu.trim().toUpperCase()}`;
}

/**
 * Excel import satırı için kendi depo takip numaramızı (Odoo Lot/Seri) üretir.
 * envanter-import-uygula.service.ts'teki otomatikLotNoUret ile AYNI format —
 * garanti/iade akışı bu formatı aradığı için BİREBİR KORUNUYOR, değiştirilmedi.
 */
function otomatikLotNoUret(satirNo: number, aktarimKimligi: string): string {
  const now = new Date();
  const gun = String(now.getDate()).padStart(2, '0');
  const ay = String(now.getMonth() + 1).padStart(2, '0');
  const yil = now.getFullYear();
  const tarih = `${gun}${ay}${yil}`;
  const kimlik = (aktarimKimligi || '').trim() || String(Math.floor(1000 + Math.random() * 9000));
  return `GRS-${tarih}-EXC${kimlik}-${String(satirNo).padStart(3, '0')}`;
}

function resolveLotFieldsForImportRow(
  row: ParsedCamEnvanterRow,
  aktarimKimligi: string,
): { lotNo: string; utsKodu: string | undefined } {
  const otomatikLotNo = otomatikLotNoUret(row.satirNo, aktarimKimligi);
  const fields = resolveEnvanterLotFields(row.utsKodu, row.barkod, row.lotNo, otomatikLotNo);
  return { lotNo: fields.lotNo, utsKodu: fields.utsKodu };
}

/**
 * Bu şablonun TEK (attribute'suz) varyantının product.product ID'sini bulur.
 * Çerçeve/güneş gözlüğü akışındaki findTekVariantProductId'den FARKLI: o
 * barkoda göre arıyordu (bizde barkod ürün üzerinde sabit ve her satırda
 * değişmiyor), biz doğrudan şablonun TEK varyantını alıyoruz.
 */
async function findCamVariantIdForTemplate(tmplId: number): Promise<number | null> {
  const variants = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', Number(tmplId)]]],
    { fields: ['id'], limit: 2 },
  ) as { id: number }[];
  return variants.length ? variants[0].id : null;
}

/**
 * Ürünün KENDİ (temsilci) barkodunu, Odoo'da 08680000001XXX serisinde en
 * yüksek kullanılan numaradan devam ederek üretir. Bu barkod SADECE raf
 * etiketi/okutma kolaylığı içindir — gerçek tedarikçi barkodları her satırın
 * KENDİ lot.ref alanına yazılır, bu temsilci barkoda hiç karışmaz.
 */
async function generateNextTemsilciBarkod(): Promise<string> {
  const existing = await execute(
    'product.product', 'search_read',
    [[['barcode', 'like', CAM_TEMSILCI_BARKOD_ONEKI]]],
    { fields: ['barcode'], limit: 5000, context: { active_test: false } },
  ) as { barcode: string | false }[];

  let maxSuffix = 0;
  for (const p of existing) {
    const bc = typeof p.barcode === 'string' ? p.barcode.trim() : '';
    if (!bc.startsWith(CAM_TEMSILCI_BARKOD_ONEKI)) continue;
    const suffix = Number(bc.slice(CAM_TEMSILCI_BARKOD_ONEKI.length));
    if (Number.isFinite(suffix) && suffix > maxSuffix) maxSuffix = suffix;
  }

  const nextSuffix = maxSuffix + 1;
  return `${CAM_TEMSILCI_BARKOD_ONEKI}${String(nextSuffix).padStart(3, '0')}`;
}

/**
 * Ürünün list_price/standard_price alanlarını günceller — ÖNEMLİ: barkod
 * alanına HİÇ DOKUNMAZ (odoo-varyant-import.service.ts'teki
 * guncelleVaryantFiyatlari'nın aksine). O fonksiyon her çağrıldığında
 * product.product.barcode'u satırın kendi barkoduyla EZER; burada ürünün
 * barkodu sadece ilk oluşturulduğunda bir kez atanan temsilci barkod olduğu
 * için o fonksiyon kullanılAMAZ, bu ayrı (ve güvenli) kopya yazıldı.
 */
async function guncelleCamFiyatlari(
  varyantId: number,
  satisFiyati: number,
  maliyetFiyati: number,
): Promise<void> {
  await execute('product.product', 'write', [
    [varyantId],
    {
      lst_price: Number(satisFiyati) || 0,
      standard_price: Number(maliyetFiyati) || 0,
    },
  ]);
}

export async function uygulaCamEnvanterImport(input: {
  lokasyonKodu: string;
  satirlar: ParsedCamEnvanterRow[];
  aktarimKimligi?: string;
}): Promise<CamEnvanterUygulaSonuc> {
  const lokasyonKodu = String(input.lokasyonKodu ?? '').trim().toUpperCase();
  const companyId = getCompanyIdFromLokasyon(lokasyonKodu) ?? undefined;
  const aktarimKimligi = String(input.aktarimKimligi ?? '').trim();

  const onizleme = await previewCamEnvanterImport(input.satirlar);
  const onizlemeBySatirNo = new Map(onizleme.satirlar.map((s) => [s.satirNo, s]));

  const sonuclar: CamEnvanterUygulaSatirSonuc[] = [];
  const islenenSatirNolar = new Set<number>();

  const urunGruplari = new Map<string, ParsedCamEnvanterRow[]>();
  for (const row of input.satirlar) {
    const preview = onizlemeBySatirNo.get(row.satirNo);
    if (!preview || preview.durum === 'HATA') {
      sonuclar.push({
        satirNo: row.satirNo,
        durum: 'BASARISIZ',
        mesaj: preview?.mesaj ?? 'Satır önizlemede geçersiz',
      });
      islenenSatirNolar.add(row.satirNo);
      continue;
    }

    const key = urunAnahtar(row.kategori, row.urunSablonu);
    const list = urunGruplari.get(key) ?? [];
    list.push(row);
    urunGruplari.set(key, list);
  }

  for (const [, grupSatirlari] of urunGruplari) {
    const ilk = grupSatirlari[0];
    let tmplId: number | null = null;
    let sablonHata: string | null = null;
    let sablonKategoriAdaylari: KategoriAdaySatir[] | undefined;

    const ilkPreview = onizlemeBySatirNo.get(ilk.satirNo)!;
    const needsNewTemplate = ilkPreview.durum === 'YENI_URUN';

    if (needsNewTemplate) {
      try {
        tmplId = await createEnvanterSablon({
          kategori: ilk.kategori,
          urunAdi: ilk.urunSablonu,
          satisFiyati: ilk.satisFiyati,
          maliyetFiyati: ilk.maliyetFiyati,
          kdvOrani: ilk.kdvOrani,
        });
      } catch (e: unknown) {
        if (e instanceof OdooCategoryMatchError) {
          sablonKategoriAdaylari = mapCategoryCandidates(e.candidates);
          sablonHata = e.message + formatCategoryCandidatesMessage(e.candidates);
        } else {
          sablonHata = e instanceof Error ? e.message : 'Ürün oluşturulamadı';
        }
      }
    } else {
      tmplId = ilkPreview.resolvedTemplateId ?? null;
      if (!tmplId) {
        sablonHata = `Ürün şablonu bulunamadı: ${ilk.urunSablonu}`;
      }
    }

    if (sablonHata || !tmplId) {
      for (const row of grupSatirlari) {
        if (islenenSatirNolar.has(row.satirNo)) continue;
        sonuclar.push({
          satirNo: row.satirNo,
          durum: 'BASARISIZ',
          mesaj: sablonHata ?? 'Ürün oluşturulamadı',
          ...(sablonKategoriAdaylari?.length ? { kategoriAdaylari: sablonKategoriAdaylari } : {}),
        });
        islenenSatirNolar.add(row.satirNo);
      }
      continue;
    }

    // Şablonun tekil varyantını bul (attribute matrisi yok, Odoo otomatik
    // olarak tek bir product.product oluşturur).
    let varyantId = await findCamVariantIdForTemplate(tmplId);
    if (!varyantId) {
      for (const row of grupSatirlari) {
        if (islenenSatirNolar.has(row.satirNo)) continue;
        sonuclar.push({
          satirNo: row.satirNo,
          durum: 'BASARISIZ',
          mesaj: `Ürün için varyant bulunamadı (şablon #${tmplId})`,
        });
        islenenSatirNolar.add(row.satirNo);
      }
      continue;
    }

    // Ürünün KENDİ (temsilci) barkodunu — SADECE ilk kez, boşsa — ata. Bir
    // daha asla değiştirilmez; satırların gerçek barkodları lot.ref'e gider.
    try {
      const mevcut = await execute(
        'product.product', 'read',
        [[varyantId]],
        { fields: ['barcode'] },
      ) as { barcode: string | false }[];
      const barkodBos = !mevcut[0]?.barcode || !String(mevcut[0].barcode).trim();
      if (barkodBos) {
        const temsilciBarkod = await generateNextTemsilciBarkod();
        await execute('product.product', 'write', [[varyantId], { barcode: temsilciBarkod }]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Temsilci barkod atanamadı';
      for (const row of grupSatirlari) {
        if (islenenSatirNolar.has(row.satirNo)) continue;
        sonuclar.push({ satirNo: row.satirNo, durum: 'BASARISIZ', mesaj: msg });
        islenenSatirNolar.add(row.satirNo);
      }
      continue;
    }

    const fiyatGuncellenen = new Set<number>();

    for (const row of grupSatirlari) {
      if (islenenSatirNolar.has(row.satirNo)) continue;

      let lotId: number | null = null;
      let lotCreated = false;

      try {
        const { lotNo, utsKodu } = resolveLotFieldsForImportRow(row, aktarimKimligi);
        // getOrCreateStockLot: row.barkod → lot.ref (gerçek tedarikçi
        // barkodu), utsKodu → lot.x_uts_kodu. Ürünün kendi barcode alanına
        // KESİNLİKLE dokunmaz (stock-lot.service.ts, değişmeden kullanılıyor).
        const lotResult = await getOrCreateStockLot(
          lotNo,
          varyantId,
          companyId,
          row.barkod,
          utsKodu,
        );
        lotId = lotResult.lotId;
        lotCreated = lotResult.created;

        await applyStockAdjustmentForLot({
          productId: varyantId,
          locationCode: lokasyonKodu,
          lotId,
          qty: row.adet,
        });

        if (!fiyatGuncellenen.has(varyantId)) {
          await guncelleCamFiyatlari(varyantId, row.satisFiyati, row.maliyetFiyati);
          fiyatGuncellenen.add(varyantId);
        }

        sonuclar.push({
          satirNo: row.satirNo,
          durum: 'BASARILI',
          mesaj: 'Stok ve lot oluşturuldu',
          olusturulanLotId: lotId,
          olusturulanVaryantId: varyantId,
        });
        islenenSatirNolar.add(row.satirNo);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Satır işlenemedi';

        if (lotId != null && lotCreated) {
          try {
            await rollbackCreatedLot(lotId, companyId);
          } catch {
            // rollback best-effort
          }
        }

        sonuclar.push({
          satirNo: row.satirNo,
          durum: 'BASARISIZ',
          mesaj: msg,
          ...(lotId != null && !lotCreated ? { olusturulanLotId: lotId } : {}),
          olusturulanVaryantId: varyantId,
        });
        islenenSatirNolar.add(row.satirNo);
      }
    }
  }

  sonuclar.sort((a, b) => a.satirNo - b.satirNo);

  return {
    ozet: {
      basarili: sonuclar.filter((s) => s.durum === 'BASARILI').length,
      basarisiz: sonuclar.filter((s) => s.durum === 'BASARISIZ').length,
    },
    satirlar: sonuclar,
  };
}
