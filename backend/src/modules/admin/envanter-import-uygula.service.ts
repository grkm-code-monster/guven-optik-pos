import { getCompanyIdFromLokasyon } from '../odoo/odooLocations';
import { execute } from '../odoo/odoo.service';
import {
  previewEnvanterImport,
  resolveLotForUtsCorrection,
  resolveVariantByOdooId,
  type ParsedEnvanterRow,
} from './envanter-import.service';
import {
  createEnvanterSablon,
  findVariantProductId,
  guncelleVaryantFiyatlari,
  importVaryantlarForTemplate,
  varyantKey,
  type VaryantImportSatir,
} from './odoo-varyant-import.service';
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

export type EnvanterUygulaSatirSonuc = {
  satirNo: number;
  durum: 'BASARILI' | 'BASARISIZ';
  mesaj: string;
  olusturulanLotId?: number;
  olusturulanVaryantId?: number;
  kategoriAdaylari?: KategoriAdaySatir[];
};

export type EnvanterUygulaSonuc = {
  ozet: { basarili: number; basarisiz: number };
  satirlar: EnvanterUygulaSatirSonuc[];
};

function sablonAnahtar(kategori: string, urunAdi: string): string {
  return `${kategori.trim().toUpperCase()}::${urunAdi.trim().toUpperCase()}`;
}

function resolveLotFieldsForImportRow(row: ParsedEnvanterRow): { lotNo: string; utsKodu: string | undefined } {
  const fields = resolveEnvanterLotFields(row.utsKodu, row.barkod);
  return { lotNo: fields.lotNo, utsKodu: fields.utsKodu };
}

async function applyLotUtsCorrectionRow(
  row: ParsedEnvanterRow,
): Promise<EnvanterUygulaSatirSonuc> {
  const resolved = await resolveLotForUtsCorrection(row.odooLotId!, row.odooVaryantId);
  if (!resolved.ok) {
    return { satirNo: row.satirNo, durum: 'BASARISIZ', mesaj: resolved.error };
  }

  if (row.odooVaryantId) {
    const variantCheck = await resolveVariantByOdooId(row.odooVaryantId, row.barkod);
    if (!variantCheck.ok) {
      return { satirNo: row.satirNo, durum: 'BASARISIZ', mesaj: variantCheck.error };
    }
  }

  const yeniUts = row.utsKodu.trim();
  if (resolved.utsDolu) {
    return {
      satirNo: row.satirNo,
      durum: 'BASARILI',
      mesaj: `UTS zaten dolu — lot #${resolved.lotId} değiştirilmedi`,
      olusturulanLotId: resolved.lotId,
      olusturulanVaryantId: resolved.variantId,
    };
  }

  if (!yeniUts) {
    return {
      satirNo: row.satirNo,
      durum: 'BASARILI',
      mesaj: `UTS boş — lot #${resolved.lotId} için yazılacak değer yok`,
      olusturulanLotId: resolved.lotId,
      olusturulanVaryantId: resolved.variantId,
    };
  }

  await execute(
    'stock.lot',
    'write',
    [[resolved.lotId], { x_uts_kodu: yeniUts }],
    {},
  );

  return {
    satirNo: row.satirNo,
    durum: 'BASARILI',
    mesaj: `UTS kodu lot #${resolved.lotId} (${resolved.lotNo}) üzerine yazıldı`,
    olusturulanLotId: resolved.lotId,
    olusturulanVaryantId: resolved.variantId,
  };
}

async function findTemplateId(
  urunAdi: string,
  kategori: string,
): Promise<number | null> {
  const templates = await execute(
    'product.template', 'search_read',
    [[['name', 'ilike', urunAdi.trim()]]],
    { fields: ['id', 'name', 'categ_id'], limit: 20, context: { active_test: false } },
  ) as { id: number; name: string; categ_id: [number, string] | false }[];

  const exact = templates.filter(
    (t) => t.name.trim().toUpperCase() === urunAdi.trim().toUpperCase(),
  );
  if (!exact.length) return null;
  if (exact.length === 1) return exact[0].id;

  const katUpper = kategori.trim().toUpperCase();
  const byCateg = exact.find((t) => {
    const categName = t.categ_id ? t.categ_id[1] : '';
    return categName.toUpperCase().includes(katUpper)
      || katUpper.includes(categName.toUpperCase());
  });
  return (byCateg ?? exact[0]).id;
}

export async function uygulaEnvanterImport(input: {
  lokasyonKodu: string;
  satirlar: ParsedEnvanterRow[];
}): Promise<EnvanterUygulaSonuc> {
  const lokasyonKodu = String(input.lokasyonKodu ?? '').trim().toUpperCase();
  const companyId = getCompanyIdFromLokasyon(lokasyonKodu) ?? undefined;

  const onizleme = await previewEnvanterImport(input.satirlar);
  const onizlemeBySatirNo = new Map(onizleme.satirlar.map((s) => [s.satirNo, s]));

  const sonuclar: EnvanterUygulaSatirSonuc[] = [];
  const islenenSatirNolar = new Set<number>();

  const sablonGruplari = new Map<string, ParsedEnvanterRow[]>();
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

    const key = sablonAnahtar(row.kategori, row.urunAdi);
    const list = sablonGruplari.get(key) ?? [];
    list.push(row);
    sablonGruplari.set(key, list);
  }

  for (const [, grupSatirlari] of sablonGruplari) {
    const ilk = grupSatirlari[0];
    let tmplId: number | null = null;
    let sablonHata: string | null = null;
    let sablonKategoriAdaylari: KategoriAdaySatir[] | undefined;

    const needsNewTemplate = grupSatirlari.some((r) => {
      const p = onizlemeBySatirNo.get(r.satirNo);
      return p?.durum === 'YENI_SABLON';
    });

    if (needsNewTemplate) {
      try {
        tmplId = await createEnvanterSablon({
          kategori: ilk.kategori,
          urunAdi: ilk.urunAdi,
          satisFiyati: ilk.satisFiyati,
          maliyetFiyati: ilk.maliyetFiyati,
          kdvOrani: ilk.kdvOrani,
        });
      } catch (e: unknown) {
        if (e instanceof OdooCategoryMatchError) {
          sablonKategoriAdaylari = mapCategoryCandidates(e.candidates);
          sablonHata = e.message + formatCategoryCandidatesMessage(e.candidates);
          console.error(
            '[envanter-import] Kategori belirsiz:',
            ilk.kategori,
            sablonKategoriAdaylari,
          );
        } else {
          sablonHata = e instanceof Error ? e.message : 'Şablon oluşturulamadı';
        }
      }
    } else {
      tmplId = await findTemplateId(ilk.urunAdi, ilk.kategori);
      if (!tmplId) {
        sablonHata = `Şablon bulunamadı: ${ilk.urunAdi}`;
      }
    }

    if (sablonHata || !tmplId) {
      for (const row of grupSatirlari) {
        if (islenenSatirNolar.has(row.satirNo)) continue;
        sonuclar.push({
          satirNo: row.satirNo,
          durum: 'BASARISIZ',
          mesaj: sablonHata ?? 'Şablon oluşturulamadı',
          ...(sablonKategoriAdaylari?.length ? { kategoriAdaylari: sablonKategoriAdaylari } : {}),
        });
        islenenSatirNolar.add(row.satirNo);
      }
      continue;
    }

    const importSatirlari: VaryantImportSatir[] = [];
    for (const row of grupSatirlari) {
      const preview = onizlemeBySatirNo.get(row.satirNo)!;
      if (preview.durum === 'YENI_SABLON' || preview.durum === 'YENI_VARYANT') {
        importSatirlari.push({
          index: row.satirNo,
          model: row.model,
          renk: row.renk,
          olcu: row.olcu,
          barkod: row.barkod,
          fiyat: row.satisFiyati,
        });
      }
    }

    const varyantIdCache = new Map<string, number>();

    if (importSatirlari.length) {
      try {
        const importSonuc = await importVaryantlarForTemplate(tmplId, importSatirlari);
        for (const [key, id] of importSonuc.varyantIdByKey) {
          varyantIdCache.set(key, id);
        }
        for (const h of importSonuc.hatalar) {
          if (islenenSatirNolar.has(h.index)) continue;
          sonuclar.push({
            satirNo: h.index,
            durum: 'BASARISIZ',
            mesaj: `Varyant oluşturulamadı: ${h.sebep}`,
          });
          islenenSatirNolar.add(h.index);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Varyant import hatası';
        for (const row of grupSatirlari) {
          if (islenenSatirNolar.has(row.satirNo)) continue;
          sonuclar.push({
            satirNo: row.satirNo,
            durum: 'BASARISIZ',
            mesaj: msg,
          });
          islenenSatirNolar.add(row.satirNo);
        }
        continue;
      }
    }

    const fiyatGuncellenen = new Set<number>();

    for (const row of grupSatirlari) {
      if (islenenSatirNolar.has(row.satirNo)) continue;

      if (row.odooLotId) {
        try {
          sonuclar.push(await applyLotUtsCorrectionRow(row));
        } catch (e: unknown) {
          sonuclar.push({
            satirNo: row.satirNo,
            durum: 'BASARISIZ',
            mesaj: e instanceof Error ? e.message : 'Lot UTS düzeltmesi başarısız',
          });
        }
        islenenSatirNolar.add(row.satirNo);
        continue;
      }

      const vKey = varyantKey(row.model, row.renk, row.olcu);
      let varyantId = varyantIdCache.get(vKey) ?? null;

      if (row.odooVaryantId) {
        const resolved = await resolveVariantByOdooId(row.odooVaryantId, row.barkod);
        if (!resolved.ok) {
          sonuclar.push({
            satirNo: row.satirNo,
            durum: 'BASARISIZ',
            mesaj: resolved.error,
          });
          islenenSatirNolar.add(row.satirNo);
          continue;
        }
        varyantId = resolved.variantId;
      } else if (!varyantId) {
        try {
          varyantId = await findVariantProductId(tmplId, row.model, row.renk, row.olcu);
        } catch {
          varyantId = null;
        }
      }

      if (!varyantId) {
        sonuclar.push({
          satirNo: row.satirNo,
          durum: 'BASARISIZ',
          mesaj: 'Varyant ID çözülemedi',
        });
        islenenSatirNolar.add(row.satirNo);
        continue;
      }

      let lotId: number | null = null;
      let lotCreated = false;

      try {
        const { lotNo, utsKodu } = resolveLotFieldsForImportRow(row);
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
          await guncelleVaryantFiyatlari(
            varyantId,
            row.satisFiyati,
            row.maliyetFiyati,
            row.barkod,
          );
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
