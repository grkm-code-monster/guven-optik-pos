import ExcelJS from 'exceljs';
import { execute } from '../odoo/odoo.service';
import {
  findVariantProductId,
  guncelleVaryantFiyatlari,
  importVaryantlarForTemplate,
  varyantKey,
  type VaryantImportSatir,
} from './odoo-varyant-import.service';
import {
  SABLON_EXCEL_HEADERS,
  SABLON_EXCEL_HEDEF_ALANLARI,
  type SablonExcelHedefAlan,
  type SablonExcelKolonMap,
  VARSAYILAN_SABLON_EXCEL_KOLON_MAP,
} from './sablon-excel-import.constants';

export type ParsedSablonExcelYukleme = {
  sutunlar: string[];
  ornekSatirlar: string[][];
  satirlar: string[][];
  varsayilanMap: SablonExcelKolonMap;
};

export type MappedSablonSatir = {
  satirNo: number;
  kategori: string;
  urunSablonAdi: string;
  model: string;
  renk: string;
  olcu: string;
  barkod: string;
  icReferans: string;
  kdvOrani: number | null;
  satisFiyati: number;
  maliyet: number;
  sirket: string;
  izleme: string;
};

export type SablonDogrulamaSonuc = {
  aktarilabilir: boolean;
  kategoriler: Array<{ yol: string; bulundu: boolean; categId?: number; satirlar: number[] }>;
  kdvOranlari: Array<{ oran: number; bulundu: boolean; taxId?: number; satirlar: number[] }>;
  zorunluBosSatirlar: Array<{ satirNo: number; eksik: string[] }>;
  gecersizKdvSatirlar: number[];
  varyantKismiDoluSatirlar: number[];
  varyantGuvenlikAtlamalari: Array<{ satirNo: number; urunSablonAdi: string; mesaj: string }>;
  niteliklerHazir: boolean;
  ozet: {
    toplamSatir: number;
    gecerliSatir: number;
    atlanacakZorunluBos: number;
  };
  satirlar: MappedSablonSatir[];
};

export type SablonAktarimSatirSonuc = {
  satirNo: number;
  ad: string;
  durum:
    | 'created'
    | 'skipped-duplicate'
    | 'skipped-invalid'
    | 'skipped-variant-exists'
    | 'variant-created'
    | 'variant-updated'
    | 'error';
  tmplId?: number;
  varyantId?: number;
  sebep?: string;
};

export type SablonAktarimSonuc = {
  aktarildi: number;
  atlandi: number;
  hata: number;
  detay: SablonAktarimSatirSonuc[];
};

const SIRKET_AD_TO_ID: Record<string, number> = {
  ng: 2,
  adese: 3,
  potential: 4,
};

const IZLEME_MAP: Record<string, string> = {
  lot: 'lot',
  seri: 'serial',
  serial: 'serial',
  yok: 'none',
  none: 'none',
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value && value.text) {
    return String(value.text).trim();
  }
  if (typeof value === 'object' && 'result' in value && value.result != null) {
    return String(value.result).trim();
  }
  return String(value).trim();
}

function cellTextForCode(value: ExcelJS.CellValue): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('fullwide', { useGrouping: false });
  }
  return cellText(value);
}

function cellNumber(value: ExcelJS.CellValue): number {
  const text = cellText(value).replace(',', '.');
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

function guessColumnMap(headers: string[]): SablonExcelKolonMap {
  const map: SablonExcelKolonMap = { ...VARSAYILAN_SABLON_EXCEL_KOLON_MAP };
  const aliases: Record<SablonExcelHedefAlan, string[]> = {
    kategori: ['kategori (tam yol)', 'kategori'],
    urunSablonAdi: ['urun sablon adi', 'ürün şablon adı', 'urun adi', 'ürün adı'],
    model: ['model'],
    renk: ['renk'],
    olcu: ['olcu', 'ölçü', 'olcu', 'size'],
    barkod: ['barkod'],
    icReferans: ['ic referans', 'iç referans', 'default code'],
    kdvOrani: ['kdv orani', 'kdv oranı', 'kdv'],
    satisFiyati: ['satis fiyati', 'satış fiyatı'],
    maliyet: ['maliyet'],
    sirket: ['sirket', 'şirket'],
    izleme: ['izleme', 'tracking'],
  };

  for (const alan of SABLON_EXCEL_HEDEF_ALANLARI) {
    const idx = headers.findIndex((h) => aliases[alan].includes(normalizeHeader(h)));
    if (idx >= 0) map[alan] = idx;
  }
  return map;
}

export async function buildSablonExcelOrnekBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Urun Sablonlari');
  ws.addRow([...SABLON_EXCEL_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow([
    'All / LENS / STANDART',
    'ULTRA KONTAKT LENS -0100',
    '',
    '',
    '',
    '785811314545',
    '',
    10,
    '',
    '',
    'Güven Optik 1959',
    'Lot',
  ]);
  ws.addRow([
    'All / CERCEVE / STANDART',
    'TEST CERCEVE EXCEL',
    'OP11850',
    'Kirmizi',
    '53',
    '8690000000001',
    '',
    10,
    150,
    80,
    'Güven Optik 1959',
    'Lot',
  ]);
  const barkodCol = SABLON_EXCEL_HEADERS.indexOf('Barkod') + 1;
  ws.getColumn(barkodCol).numFmt = '@';
  for (let r = 2; r <= 500; r++) {
    ws.getCell(r, barkodCol).numFmt = '@';
  }
  ws.columns = SABLON_EXCEL_HEADERS.map((h) => ({
    header: h,
    width: Math.max(14, h.length + 2),
  }));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function parseSablonExcelUpload(buffer: Buffer): Promise<ParsedSablonExcelYukleme> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel dosyasında sayfa bulunamadı');

  const headerRow = ws.getRow(1);
  const sutunlar = (headerRow.values as Array<ExcelJS.CellValue | undefined>)
    .slice(1)
    .map((v) => cellText(v));

  const satirlar: string[][] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    let bos = true;
    for (let c = 1; c <= sutunlar.length; c++) {
      const val = row.getCell(c).value;
      const text = c === SABLON_EXCEL_HEADERS.indexOf('Barkod') + 1
        || normalizeHeader(sutunlar[c - 1]).includes('barkod')
        ? cellTextForCode(val)
        : cellText(val);
      if (text) bos = false;
      cells.push(text);
    }
    if (!bos) satirlar.push(cells);
  }

  if (!satirlar.length) {
    throw new Error('Excel dosyasında işlenecek satır yok');
  }

  return {
    sutunlar,
    ornekSatirlar: satirlar.slice(0, 5),
    satirlar,
    varsayilanMap: guessColumnMap(sutunlar),
  };
}

function mapColIndex(map: SablonExcelKolonMap, alan: SablonExcelHedefAlan): number | null {
  const idx = map[alan];
  if (idx === 'yoksay' || idx == null || idx < 0) return null;
  return idx;
}

export function mapSablonSatirlar(
  rawSatirlar: string[][],
  kolonMap: SablonExcelKolonMap,
): MappedSablonSatir[] {
  return rawSatirlar.map((cells, i) => {
    const get = (alan: SablonExcelHedefAlan) => {
      const idx = mapColIndex(kolonMap, alan);
      return idx != null && idx < cells.length ? cells[idx] : '';
    };
    const kdvRaw = get('kdvOrani');
    const kdvParsed = kdvRaw ? cellNumber(kdvRaw) : NaN;
    const satisRaw = get('satisFiyati');
    const maliyetRaw = get('maliyet');
    return {
      satirNo: i + 2,
      kategori: get('kategori').trim(),
      urunSablonAdi: get('urunSablonAdi').trim(),
      model: get('model').trim(),
      renk: get('renk').trim(),
      olcu: get('olcu').trim(),
      barkod: get('barkod').trim(),
      icReferans: get('icReferans').trim(),
      kdvOrani: kdvRaw && Number.isFinite(kdvParsed) ? kdvParsed : (kdvRaw ? null : null),
      satisFiyati: satisRaw && Number.isFinite(cellNumber(satisRaw)) ? cellNumber(satisRaw) : 0,
      maliyet: maliyetRaw && Number.isFinite(cellNumber(maliyetRaw)) ? cellNumber(maliyetRaw) : 0,
      sirket: get('sirket').trim(),
      izleme: get('izleme').trim(),
    };
  });
}

async function resolveKategoriId(yol: string): Promise<number | null> {
  const rows = await execute(
    'product.category',
    'search_read',
    [[['complete_name', '=', yol.trim()]]],
    { fields: ['id'], limit: 1 },
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

async function resolveSatisVergiId(oran: number): Promise<number | null> {
  const taxes = await execute(
    'account.tax',
    'search_read',
    [[['type_tax_use', '=', 'sale'], ['amount', '=', oran], ['active', '=', true]]],
    { fields: ['id'], limit: 1, order: 'id asc' },
  );
  return taxes?.[0]?.id ? Number(taxes[0].id) : null;
}

function resolveSirketId(ad: string): number | false {
  const key = ad.trim().toLowerCase();
  if (!key || key === 'guven optik 1959' || key === 'güven optik 1959') return false;
  return SIRKET_AD_TO_ID[key] ?? false;
}

function resolveIzleme(raw: string): string {
  if (!raw.trim()) return 'none';
  const key = raw.trim().toLowerCase();
  return IZLEME_MAP[key] ?? 'none';
}

function isVaryantSatir(s: MappedSablonSatir): boolean {
  return !!(s.model.trim() && s.renk.trim() && s.olcu.trim());
}

function varyantDoluSayisi(s: MappedSablonSatir): number {
  return [s.model, s.renk, s.olcu].filter((v) => v.trim()).length;
}

type TemplateContext = {
  tmplId: number;
  product_variant_count: number;
  name: string;
  reason: 'name' | 'barcode-template' | 'barcode-variant';
};

async function readTemplateById(tmplId: number): Promise<TemplateContext | null> {
  const rows = await execute(
    'product.template',
    'read',
    [[tmplId]],
    { fields: ['id', 'name', 'product_variant_count'] },
  ) as { id: number; name: string; product_variant_count: number }[];
  if (!rows?.length) return null;
  return {
    tmplId: Number(rows[0].id),
    product_variant_count: Number(rows[0].product_variant_count) || 1,
    name: rows[0].name,
    reason: 'name',
  };
}

async function findTemplateContext(ad: string, barkod: string): Promise<TemplateContext | null> {
  const byName = await execute(
    'product.template',
    'search_read',
    [[['name', '=', ad]]],
    { fields: ['id', 'name', 'product_variant_count'], limit: 1 },
  ) as { id: number; name: string; product_variant_count: number }[];
  if (byName?.length) {
    return {
      tmplId: Number(byName[0].id),
      product_variant_count: Number(byName[0].product_variant_count) || 1,
      name: byName[0].name,
      reason: 'name',
    };
  }

  if (barkod) {
    const byTemplateBarcode = await execute(
      'product.template',
      'search_read',
      [[['barcode', '=', barkod]]],
      { fields: ['id', 'name', 'product_variant_count'], limit: 1 },
    ) as { id: number; name: string; product_variant_count: number }[];
    if (byTemplateBarcode?.length) {
      return {
        tmplId: Number(byTemplateBarcode[0].id),
        product_variant_count: Number(byTemplateBarcode[0].product_variant_count) || 1,
        name: byTemplateBarcode[0].name,
        reason: 'barcode-template',
      };
    }

    const byVariantBarcode = await execute(
      'product.product',
      'search_read',
      [[['barcode', '=', barkod]]],
      { fields: ['id', 'product_tmpl_id'], limit: 1 },
    ) as { id: number; product_tmpl_id: [number, string] }[];
    if (byVariantBarcode?.length) {
      const ctx = await readTemplateById(byVariantBarcode[0].product_tmpl_id[0]);
      if (ctx) return { ...ctx, reason: 'barcode-variant' };
    }
  }
  return null;
}

async function ensureVaryantNitelikleri(): Promise<boolean> {
  const nitelikler = await execute(
    'product.attribute',
    'search_read',
    [[['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']]]],
    { fields: ['id', 'name'] },
  ) as { id: number; name: string }[];
  const names = new Set(nitelikler.map((n) => n.name));
  return names.has('MODEL') && names.has('RENK') && names.has('ÖLÇÜ');
}

async function createTemplateShell(
  s: MappedSablonSatir,
  categId: number,
  kdvIdMap: Map<number, number>,
): Promise<number> {
  const companyId = resolveSirketId(s.sirket);
  const tmplData: Record<string, unknown> = {
    name: s.urunSablonAdi,
    type: 'product',
    categ_id: categId,
    list_price: s.satisFiyati,
    standard_price: s.maliyet,
    default_code: s.icReferans || false,
    barcode: false,
    sale_ok: true,
    purchase_ok: true,
    can_be_expensed: false,
    invoice_policy: 'order',
    tracking: resolveIzleme(s.izleme),
  };
  if (companyId !== false) tmplData.company_id = companyId;
  if (s.kdvOrani != null) {
    const taxId = kdvIdMap.get(s.kdvOrani);
    if (taxId) tmplData.taxes_id = [[6, 0, [taxId]]];
  }
  return Number(
    await execute(
      'product.template',
      'create',
      [tmplData],
      {},
      companyId === false ? undefined : companyId,
    ),
  );
}

async function createFlatTemplate(
  s: MappedSablonSatir,
  categId: number,
  kdvIdMap: Map<number, number>,
): Promise<number> {
  const companyId = resolveSirketId(s.sirket);
  const tmplData: Record<string, unknown> = {
    name: s.urunSablonAdi,
    type: 'product',
    categ_id: categId,
    list_price: s.satisFiyati,
    standard_price: s.maliyet,
    default_code: s.icReferans || false,
    barcode: s.barkod || false,
    sale_ok: true,
    purchase_ok: true,
    can_be_expensed: false,
    invoice_policy: 'order',
    tracking: resolveIzleme(s.izleme),
  };
  if (companyId !== false) tmplData.company_id = companyId;
  if (s.kdvOrani != null) {
    const taxId = kdvIdMap.get(s.kdvOrani);
    if (taxId) tmplData.taxes_id = [[6, 0, [taxId]]];
  }
  return Number(
    await execute(
      'product.template',
      'create',
      [tmplData],
      {},
      companyId === false ? undefined : companyId,
    ),
  );
}

function toVaryantImportSatir(s: MappedSablonSatir): VaryantImportSatir {
  return {
    index: s.satirNo,
    model: s.model.trim(),
    renk: s.renk.trim(),
    olcu: s.olcu.trim(),
    barkod: s.barkod.trim(),
    fiyat: s.satisFiyati,
  };
}

const VARIANT_EXISTS_MSG =
  'Bu ürün zaten varyantlı — Excel\'den düz satır aktarılamaz. Model/Renk/Ölçü doldurun veya Ürün Yapılandırma ekranından düzenleyin.';

function isPartialVaryantSatir(s: MappedSablonSatir): boolean {
  const dolu = varyantDoluSayisi(s);
  return dolu > 0 && dolu < 3;
}

/** Varyantlı şablonda yeni template/varyant açmadan önce güvenlik kontrolü */
function variantTemplateGuvenlikIhlali(ctx: TemplateContext, s: MappedSablonSatir): boolean {
  if (ctx.product_variant_count <= 1) return false;
  return !isVaryantSatir(s) || isPartialVaryantSatir(s);
}

function pushVariantGuvenlikSkip(
  detay: SablonAktarimSatirSonuc[],
  s: MappedSablonSatir,
  ctx: TemplateContext,
  sebep?: string,
): void {
  detay.push({
    satirNo: s.satirNo,
    ad: s.urunSablonAdi,
    durum: 'skipped-variant-exists',
    tmplId: ctx.tmplId,
    sebep: sebep ?? VARIANT_EXISTS_MSG,
  });
}

export async function dogrulaSablonExcelImport(
  rawSatirlar: string[][],
  kolonMap: SablonExcelKolonMap,
): Promise<SablonDogrulamaSonuc> {
  const satirlar = mapSablonSatirlar(rawSatirlar, kolonMap);

  const zorunluBosSatirlar: SablonDogrulamaSonuc['zorunluBosSatirlar'] = [];
  for (const s of satirlar) {
    const eksik: string[] = [];
    if (!s.kategori) eksik.push('Kategori');
    if (!s.urunSablonAdi) eksik.push('Ürün Şablon Adı');
    if (eksik.length) zorunluBosSatirlar.push({ satirNo: s.satirNo, eksik });
  }

  const kategoriSatirMap = new Map<string, number[]>();
  const kdvSatirMap = new Map<string, number[]>();

  for (const s of satirlar) {
    if (!s.kategori || !s.urunSablonAdi) continue;
    const katKey = s.kategori;
    kategoriSatirMap.set(katKey, [...(kategoriSatirMap.get(katKey) ?? []), s.satirNo]);
    if (s.kdvOrani != null) {
      const kdvKey = String(s.kdvOrani);
      kdvSatirMap.set(kdvKey, [...(kdvSatirMap.get(kdvKey) ?? []), s.satirNo]);
    }
  }

  const kategoriler: SablonDogrulamaSonuc['kategoriler'] = [];
  for (const [yol, satirlarList] of kategoriSatirMap) {
    const categId = await resolveKategoriId(yol);
    kategoriler.push({
      yol,
      bulundu: categId != null,
      categId: categId ?? undefined,
      satirlar: satirlarList,
    });
  }

  const kdvOranlari: SablonDogrulamaSonuc['kdvOranlari'] = [];
  for (const [oranStr, satirlarList] of kdvSatirMap) {
    const oran = Number(oranStr);
    const taxId = await resolveSatisVergiId(oran);
    kdvOranlari.push({
      oran,
      bulundu: taxId != null,
      taxId: taxId ?? undefined,
      satirlar: satirlarList,
    });
  }

  const gecerliSatir = satirlar.filter((s) => s.kategori && s.urunSablonAdi).length;
  const kategoriOk = kategoriler.every((k) => k.bulundu);
  const kdvOk = kdvOranlari.every((k) => k.bulundu);

  const gecersizKdvSatirlar: number[] = [];
  const varyantKismiDoluSatirlar: number[] = [];
  const varyantGuvenlikAtlamalari: SablonDogrulamaSonuc['varyantGuvenlikAtlamalari'] = [];

  for (const s of satirlar) {
    if (!s.kategori || !s.urunSablonAdi) continue;
    const idx = mapColIndex(kolonMap, 'kdvOrani');
    if (idx == null) continue;
    const raw = rawSatirlar[s.satirNo - 2]?.[idx] ?? '';
    if (raw.trim() && s.kdvOrani == null) gecersizKdvSatirlar.push(s.satirNo);

    const dolu = varyantDoluSayisi(s);
    const ctx = await findTemplateContext(s.urunSablonAdi, s.barkod);
    if (dolu > 0 && dolu < 3 && !(ctx && ctx.product_variant_count > 1)) {
      varyantKismiDoluSatirlar.push(s.satirNo);
    }

    if (ctx && variantTemplateGuvenlikIhlali(ctx, s)) {
      varyantGuvenlikAtlamalari.push({
        satirNo: s.satirNo,
        urunSablonAdi: s.urunSablonAdi,
        mesaj: isPartialVaryantSatir(s)
          ? `${VARIANT_EXISTS_MSG} (Model/Renk/Ölçü eksik veya belirsiz)`
          : VARIANT_EXISTS_MSG,
      });
    }
  }

  const niteliklerHazir = await ensureVaryantNitelikleri();
  const varyantSatirVar = satirlar.some((s) => isVaryantSatir(s));
  const aktarilabilir = kategoriOk && kdvOk && gecersizKdvSatirlar.length === 0
    && varyantKismiDoluSatirlar.length === 0 && gecerliSatir > 0
    && (!varyantSatirVar || niteliklerHazir);

  return {
    aktarilabilir,
    kategoriler,
    kdvOranlari,
    zorunluBosSatirlar,
    gecersizKdvSatirlar,
    varyantKismiDoluSatirlar,
    varyantGuvenlikAtlamalari,
    niteliklerHazir,
    ozet: {
      toplamSatir: satirlar.length,
      gecerliSatir,
      atlanacakZorunluBos: zorunluBosSatirlar.length,
    },
    satirlar,
  };
}

export async function aktarSablonExcelImport(
  rawSatirlar: string[][],
  kolonMap: SablonExcelKolonMap,
): Promise<SablonAktarimSonuc> {
  const dogrulama = await dogrulaSablonExcelImport(rawSatirlar, kolonMap);
  if (!dogrulama.aktarilabilir) {
    throw new Error('Doğrulama başarısız — eksik kategori, KDV veya hatalı satırlar var');
  }

  const kategoriIdMap = new Map(dogrulama.kategoriler.map((k) => [k.yol, k.categId!]));
  const kdvIdMap = new Map(dogrulama.kdvOranlari.map((k) => [k.oran, k.taxId!]));
  const zorunluBosSet = new Set(dogrulama.zorunluBosSatirlar.map((z) => z.satirNo));
  const tmplCache = new Map<string, number>();

  const detay: SablonAktarimSatirSonuc[] = [];
  let aktarildi = 0;
  let atlandi = 0;
  let hata = 0;

  for (const s of dogrulama.satirlar) {
    if (zorunluBosSet.has(s.satirNo)) {
      detay.push({
        satirNo: s.satirNo,
        ad: s.urunSablonAdi || '(boş)',
        durum: 'skipped-invalid',
        sebep: 'Zorunlu alan boş',
      });
      atlandi += 1;
      continue;
    }

    const categId = kategoriIdMap.get(s.kategori);
    if (!categId) {
      detay.push({
        satirNo: s.satirNo,
        ad: s.urunSablonAdi,
        durum: 'error',
        sebep: 'Kategori bulunamadı',
      });
      hata += 1;
      continue;
    }

    try {
      const ctx = await findTemplateContext(s.urunSablonAdi, s.barkod);

      if (ctx && variantTemplateGuvenlikIhlali(ctx, s)) {
        pushVariantGuvenlikSkip(
          detay,
          s,
          ctx,
          isPartialVaryantSatir(s)
            ? `${VARIANT_EXISTS_MSG} (Model/Renk/Ölçü eksik veya belirsiz)`
            : undefined,
        );
        atlandi += 1;
        continue;
      }

      const kismiVaryant = isPartialVaryantSatir(s);
      if (kismiVaryant) {
        detay.push({
          satirNo: s.satirNo,
          ad: s.urunSablonAdi,
          durum: 'skipped-invalid',
          sebep: 'Model/Renk/Ölçü alanlarının hepsi dolu olmalı',
        });
        atlandi += 1;
        continue;
      }

      const varyantli = isVaryantSatir(s);

      if (varyantli) {
        let tmplId = tmplCache.get(s.urunSablonAdi) ?? ctx?.tmplId;
        if (!tmplId) {
          tmplId = await createTemplateShell(s, categId, kdvIdMap);
          tmplCache.set(s.urunSablonAdi, tmplId);
        } else {
          tmplCache.set(s.urunSablonAdi, tmplId);
        }

        const mevcutVaryantId = await findVariantProductId(
          tmplId,
          s.model,
          s.renk,
          s.olcu,
        );

        if (mevcutVaryantId) {
          await guncelleVaryantFiyatlari(
            mevcutVaryantId,
            s.satisFiyati,
            s.maliyet,
            s.barkod,
          );
          detay.push({
            satirNo: s.satirNo,
            ad: s.urunSablonAdi,
            durum: 'variant-updated',
            tmplId,
            varyantId: mevcutVaryantId,
            sebep: `${s.renk}, ${s.olcu}`,
          });
          aktarildi += 1;
          continue;
        }

        const imp = await importVaryantlarForTemplate(tmplId, [toVaryantImportSatir(s)]);
        if (imp.hatalar.length) {
          const impSebep = imp.hatalar.map((h) => h.sebep).join('; ');
          if (ctx && ctx.product_variant_count > 1) {
            pushVariantGuvenlikSkip(
              detay,
              s,
              ctx,
              `${VARIANT_EXISTS_MSG} (Varyant eşleştirilemedi: ${impSebep})`,
            );
            atlandi += 1;
            continue;
          }
          detay.push({
            satirNo: s.satirNo,
            ad: s.urunSablonAdi,
            durum: 'error',
            tmplId,
            sebep: impSebep,
          });
          hata += 1;
          continue;
        }

        const yeniVaryantId = imp.varyantIdByKey.get(
          varyantKey(s.model, s.renk, s.olcu),
        );
        if (s.maliyet > 0 && yeniVaryantId) {
          await guncelleVaryantFiyatlari(yeniVaryantId, s.satisFiyati, s.maliyet, s.barkod);
        }

        detay.push({
          satirNo: s.satirNo,
          ad: s.urunSablonAdi,
          durum: 'variant-created',
          tmplId,
          varyantId: yeniVaryantId,
          sebep: `${s.renk}, ${s.olcu}`,
        });
        aktarildi += 1;
        continue;
      }

      if (ctx) {
        detay.push({
          satirNo: s.satirNo,
          ad: s.urunSablonAdi,
          durum: 'skipped-duplicate',
          tmplId: ctx.tmplId,
          sebep: ctx.reason === 'barcode-template' || ctx.reason === 'barcode-variant'
            ? 'Aynı barkod'
            : 'Aynı isim',
        });
        atlandi += 1;
        continue;
      }

      const tmplId = await createFlatTemplate(s, categId, kdvIdMap);
      detay.push({
        satirNo: s.satirNo,
        ad: s.urunSablonAdi,
        durum: 'created',
        tmplId,
      });
      aktarildi += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      detay.push({
        satirNo: s.satirNo,
        ad: s.urunSablonAdi,
        durum: 'error',
        sebep: msg,
      });
      hata += 1;
    }
  }

  return { aktarildi, atlandi, hata, detay };
}

/** Test / script: 37 satırlık ULTRA KONTAKT LENS listesini xlsx buffer olarak üretir */
export async function buildUltraKontaktLensTestBuffer(): Promise<Buffer> {
  const URUNLER: Array<{ ad: string; barkod: string }> = [
    { ad: 'ULTRA KONTAKT LENS 0000', barkod: '' },
    { ad: 'ULTRA KONTAKT LENS -0025', barkod: '' },
    { ad: 'ULTRA KONTAKT LENS -0050', barkod: '' },
    { ad: 'ULTRA KONTAKT LENS -0075', barkod: '' },
    { ad: 'ULTRA KONTAKT LENS -0100', barkod: '785811314545' },
    { ad: 'ULTRA KONTAKT LENS -0125', barkod: '785811314552' },
    { ad: 'ULTRA KONTAKT LENS -0150', barkod: '785811314569' },
    { ad: 'ULTRA KONTAKT LENS -0175', barkod: '785811314576' },
    { ad: 'ULTRA KONTAKT LENS -0200', barkod: '785811314583' },
    { ad: 'ULTRA KONTAKT LENS -0225', barkod: '785811314590' },
    { ad: 'ULTRA KONTAKT LENS -0250', barkod: '785811314606' },
    { ad: 'ULTRA KONTAKT LENS -0275', barkod: '785812139741' },
    { ad: 'ULTRA KONTAKT LENS -0300', barkod: '785812139758' },
    { ad: 'ULTRA KONTAKT LENS -0325', barkod: '785812139765' },
    { ad: 'ULTRA KONTAKT LENS -0350', barkod: '785811314644' },
    { ad: 'ULTRA KONTAKT LENS -0375', barkod: '785811314651' },
    { ad: 'ULTRA KONTAKT LENS -0400', barkod: '785811314668' },
    { ad: 'ULTRA KONTAKT LENS -0425', barkod: '785811314675' },
    { ad: 'ULTRA KONTAKT LENS -0450', barkod: '785811314682' },
    { ad: 'ULTRA KONTAKT LENS -0475', barkod: '785811314699' },
    { ad: 'ULTRA KONTAKT LENS -0500', barkod: '785811314705' },
    { ad: 'ULTRA KONTAKT LENS -0525', barkod: '785811314712' },
    { ad: 'ULTRA KONTAKT LENS -0550', barkod: '785811314729' },
    { ad: 'ULTRA KONTAKT LENS -0575', barkod: '785812139864' },
    { ad: 'ULTRA KONTAKT LENS -0600', barkod: '785811314743' },
    { ad: 'ULTRA KONTAKT LENS -0650', barkod: '785811314750' },
    { ad: 'ULTRA KONTAKT LENS -0700', barkod: '785811314767' },
    { ad: 'ULTRA KONTAKT LENS -0750', barkod: '785811314774' },
    { ad: 'ULTRA KONTAKT LENS -0800', barkod: '785811314781' },
    { ad: 'ULTRA KONTAKT LENS -0850', barkod: '' },
    { ad: 'ULTRA KONTAKT LENS -0900', barkod: '785811314804' },
    { ad: 'ULTRA KONTAKT LENS -0950', barkod: '785811314811' },
    { ad: 'ULTRA KONTAKT LENS -1000', barkod: '785811314828' },
    { ad: 'ULTRA KONTAKT LENS -1050', barkod: '785812139963' },
    { ad: 'ULTRA KONTAKT LENS -1100', barkod: '785812139970' },
    { ad: 'ULTRA KONTAKT LENS -1150', barkod: '785812139987' },
    { ad: 'ULTRA KONTAKT LENS -1200', barkod: '785811314866' },
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Urun Sablonlari');
  ws.addRow([...SABLON_EXCEL_HEADERS]);
  ws.getRow(1).font = { bold: true };
  for (const u of URUNLER) {
    ws.addRow([
      'All / LENS / STANDART',
      u.ad,
      '',
      '',
      '',
      u.barkod,
      '',
      10,
      '',
      '',
      'Güven Optik 1959',
      'Lot',
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
