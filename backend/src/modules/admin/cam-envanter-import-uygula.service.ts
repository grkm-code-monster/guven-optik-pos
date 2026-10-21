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
 *
 * ÖNEMLİ (20.10.2026) — context: { active_test: false } ZORUNLU: eski/stoğu
 * biten cam ürünleri daha önce arşivlenmiş (active=False) olabiliyor; bu
 * durumda varsayılan search_read onu GÖRMEZ ve "varyant bulunamadı" hatası
 * verir (canlı veride görüldü — şablon #3827, zaten var olan ürün). Bulunan
 * varyant (veya şablonun kendisi) arşivdeyse, restok yapıldığı için otomatik
 * olarak tekrar aktif hale getiriliyor.
 */
async function findCamVariantIdForTemplate(tmplId: number): Promise<number | null> {
  const variants = await execute(
    'product.product', 'search_read',
    [[['product_tmpl_id', '=', Number(tmplId)]]],
    { fields: ['id', 'active'], limit: 2, context: { active_test: false } },
  ) as { id: number; active: boolean }[];
  if (!variants.length) return null;

  const variant = variants[0];
  if (!variant.active) {
    await execute('product.product', 'write', [[variant.id], { active: true }]);
  }

  const tmpl = await execute(
    'product.template', 'read',
    [[Number(tmplId)]],
    { fields: ['active'], context: { active_test: false } },
  ) as { active: boolean }[];
  if (tmpl.length && !tmpl[0].active) {
    await execute('product.template', 'write', [[Number(tmplId)], { active: true }]);
  }

  return variant.id;
}

/**
 * 08680000001XXX serisinden bir sonraki numarayı üretir. TEK bir ortak
 * sayaç olarak çalışması için (20.10.2026 — Görkem'in talebi: UTS/barkodu
 * hiç olmayan camlarda da bu seriden barkod atansın), hem ÜRÜNÜN temsilci
 * barkodu (product.product.barcode) hem de UTS'siz satırların KENDİ lot
 * barkodu (stock.lot.ref) olarak kullanılıyor — bu yüzden ikisi de taranıp
 * en yüksek numaradan devam ediliyor, aksi halde iki farklı amaç aynı
 * numarayı üretip çakışabilirdi.
 */
async function generateNextTemsilciBarkod(): Promise<string> {
  const [urunler, lotlar] = await Promise.all([
    execute(
      'product.product', 'search_read',
      [[['barcode', 'like', CAM_TEMSILCI_BARKOD_ONEKI]]],
      { fields: ['barcode'], limit: 5000, context: { active_test: false } },
    ) as Promise<{ barcode: string | false }[]>,
    execute(
      'stock.lot', 'search_read',
      [[['ref', 'like', CAM_TEMSILCI_BARKOD_ONEKI]]],
      { fields: ['ref'], limit: 5000, context: { active_test: false } },
    ) as Promise<{ ref: string | false }[]>,
  ]);

  let maxSuffix = 0;
  const degerler = [
    ...urunler.map((p) => p.barcode),
    ...lotlar.map((l) => l.ref),
  ];
  for (const deger of degerler) {
    const bc = typeof deger === 'string' ? deger.trim() : '';
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
    // AYRICA (20.10.2026) — ÖNCEDEN VAR OLAN şablonlar, bu yeni Cam/Lens
    // akışından geçmeden (ör. Odoo'da elle veya başka bir yoldan) oluşmuş
    // olabilir ve type="service"/"consu" (stoksuz) kalmış olabilir — bu
    // durumda stok hareketi (stock.quant) Odoo tarafından reddediliyor
    // ("Miktarlar hizmet ya da tüketilebilirlik için oluşturulamaz", canlı
    // veride görüldü: şablon #3827). createEnvanterSablon YENİ şablonları
    // zaten type:'product', tracking:'serial' ile oluşturuyor — burada
    // MEVCUT şablonu da aynı, kanıtlanmış değerlere getiriyoruz (yalnızca
    // yanlışsa yazıyoruz, her zaman yazmıyoruz).
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

      const tmplMevcut = await execute(
        'product.template', 'read',
        [[tmplId]],
        { fields: ['type', 'detailed_type', 'tracking'] },
      ) as { type: string; detailed_type: string; tracking: string }[];
      const tmplDuzeltme: Record<string, unknown> = {};
      // type ve detailed_type Odoo'da iki paralel alan — biri diğeriyle
      // tutarsız yazılırsa "Bu ürünün Türü, Ayrıntılı Tür ile eşleşmiyor"
      // hatası verir, bu yüzden ikisi birlikte yazılmalı.
      if (tmplMevcut[0]?.type !== 'product') tmplDuzeltme.type = 'product';
      if (tmplMevcut[0]?.detailed_type !== 'product') tmplDuzeltme.detailed_type = 'product';
      if (tmplMevcut[0]?.tracking !== 'serial') tmplDuzeltme.tracking = 'serial';
      if (Object.keys(tmplDuzeltme).length) {
        try {
          await execute('product.template', 'write', [[tmplId], tmplDuzeltme]);
        } catch (typeErr: unknown) {
          // 20.10.2026 — bu şablonda ZATEN başarılı stok hareketi varsa
          // (ör. aynı import'un önceki parçası/chunk'ı), Odoo bu alanları
          // bir daha DEĞİŞTİRMEMİZE izin vermiyor — ama bu, ürünün tipinin
          // ZATEN doğru olduğunun KANITI (yanlış olsaydı o önceki stok
          // hareketi hiç oluşmazdı). Bu durumda hatayı yutup devam ediyoruz.
          //
          // 21.10.2026 — AMA gerçekten type='product' DEĞİLSE (tmplDuzeltme.type
          // yazılmak istendiyse), bu kanıt GEÇERSİZ — şablon GERÇEKTEN kilitli
          // ve hâlâ yanlış tipte. Bu durumda aşağıdaki stok adımına hiç
          // gitmeden, hemen açık ve eyleme geçirilebilir bir hata ver (tmplId +
          // hazır düzeltme komutu) — jenerik "Miktarlar hizmet ya da
          // tüketilebilirlik için oluşturulamaz" hatasını teşhis etmek için
          // Odoo'yu tekrar kazmak gerekmesin.
          if (tmplDuzeltme.type) {
            throw new Error(
              `Şablon #${tmplId} ("${ilk.urunSablonu}") kalıcı tip kilidi: bu şablon bu akıştan önce ` +
              `oluşturulmuş ve type='product' değil, üzerinde de geçmiş stok hareketi var — Odoo tipin ` +
              `değiştirilmesine izin vermiyor. Düzeltmek için sunucuda çalıştır: ` +
              `npm run sablon-tip-kilidi-coz -- --tmpl=${tmplId} --confirm`,
            );
          }
          console.warn(
            `[cam-envanter-import] Şablon #${tmplId} detailed_type/tracking düzeltilemedi (type zaten doğru, mevcut stok hareketi engelliyor):`,
            typeErr instanceof Error ? typeErr.message : typeErr,
          );
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Temsilci barkod/ürün tipi düzeltilemedi';
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
        // 20.10.2026 — Görkem'in talebi: kutusunda/etiketinde hiç okunabilir
        // kod olmayan camlarda UTS boş kalır (güneş gözlüğü akışındaki gibi),
        // bu satırın KENDİ barkodu (lot.ref) ise temsilci barkod havuzundan
        // (08680000001XXX) otomatik atanır — ürünün kendi representative
        // barcode'una KARIŞMAZ, sadece bu LOT'un ref alanına gider.
        const rowBarkod = row.barkodOtomatikMu
          ? await generateNextTemsilciBarkod()
          : row.barkod;

        const { lotNo, utsKodu } = resolveLotFieldsForImportRow(
          { ...row, barkod: rowBarkod },
          aktarimKimligi,
        );
        // getOrCreateStockLot: rowBarkod → lot.ref (gerçek tedarikçi barkodu
        // ya da otomatik atanan), utsKodu → lot.x_uts_kodu (otomatik atanan
        // satırlarda bu undefined kalır). Ürünün kendi barcode alanına
        // KESİNLİKLE dokunmaz (stock-lot.service.ts, değişmeden kullanılıyor).
        const lotResult = await getOrCreateStockLot(
          lotNo,
          varyantId,
          companyId,
          rowBarkod,
          utsKodu,
        );
        lotId = lotResult.lotId;
        lotCreated = lotResult.created;

        // Tedarikçi/firma ürün adı — SADECE ek bilgi amaçlı, lot'un name/ref/
        // x_uts_kodu alanlarına hiç dokunmuyor (bkz. cam-envanter-import.constants.ts).
        // Alan Odoo'da yoksa (kurulum scripti çalıştırılmamışsa) bu satırın
        // geri kalanını BOZMAMASI için hata burada yutuluyor, sadece loglanıyor.
        if (row.tedarikciUrunAdi?.trim()) {
          try {
            await execute(
              'stock.lot', 'write',
              [[lotId], { x_tedarikci_urun_adi: row.tedarikciUrunAdi.trim() }],
              {},
            );
          } catch (e: unknown) {
            console.error(
              `[cam-envanter-import] x_tedarikci_urun_adi yazılamadı (lot #${lotId}):`,
              e instanceof Error ? e.message : e,
            );
          }
        }

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
          mesaj: row.barkodOtomatikMu
            ? `Stok ve lot oluşturuldu (UTS yok, barkod otomatik atandı: ${rowBarkod})`
            : 'Stok ve lot oluşturuldu',
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
