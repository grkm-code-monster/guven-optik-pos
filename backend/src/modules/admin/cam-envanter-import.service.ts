import ExcelJS from 'exceljs';
import { execute } from '../odoo/odoo.service';
import { turkceSadelestir } from './envanter-import.service';
import {
  CAM_ENVANTER_IMPORT_HEADERS,
  CAM_ENVANTER_ZORUNLU_ALANLAR,
  type CamEnvanterImportHeader,
  type CamEnvanterSatirDurum,
} from './cam-envanter-import.constants';

export type ParsedCamEnvanterRow = {
  satirNo: number;
  kategori: string;
  urunSablonu: string;
  barkod: string;
  utsKodu: string;
  adet: number;
  satisFiyati: number;
  maliyetFiyati: number;
  kdvOrani: number;
  odooVaryantId?: number;
  lotNo?: string;
  odooLotId?: number;
};

export type CamEnvanterSatirOnizleme = ParsedCamEnvanterRow & {
  durum: CamEnvanterSatirDurum;
  mesaj: string;
  // Bu ürün şablonu adı Odoo'da zaten varsa, product.template ID'si (ürünün
  // kendisi değil — apply adımı buradan tekil product.product'ı çözer).
  resolvedTemplateId?: number;
};

export type CamEnvanterOnizlemeSonuc = {
  ozet: {
    toplamSatir: number;
    urunGrupSayisi: number;
    yeniUrun: number;
    yeniLot: number;
    hata: number;
  };
  satirlar: CamEnvanterSatirOnizleme[];
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

const HEADER_ALIASES: Record<CamEnvanterImportHeader, string[]> = {
  Kategori: ['kategori'],
  'Ürün Şablonu': ['urun sablonu', 'ürün şablonu', 'urun adi', 'ürün adı'],
  Barkod: ['barkod'],
  'UTS Kodu': ['uts kodu', 'uts'],
  Adet: ['adet', 'miktar'],
  'Satış Fiyatı': ['satis fiyati', 'satış fiyatı'],
  'Maliyet Fiyatı': ['maliyet fiyati', 'maliyet fiyatı', 'maliyet'],
  'KDV Oranı': ['kdv orani', 'kdv oranı', 'kdv'],
  'Odoo Varyant ID': ['odoo varyant id', 'varyant id', 'product id'],
  'Lot No': ['lot no', 'lot numarasi', 'lot numarası', 'seri no'],
  'Odoo Lot ID': ['odoo lot id', 'lot id', 'stock lot id'],
};

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

function cellOptionalInt(value: ExcelJS.CellValue): number | undefined {
  const text = cellText(value).replace(',', '.');
  if (!text) return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

const BILIMSEL_GOSTERIM_MESAJ =
  'Bu değer bilimsel gösterime dönüşmüş (Excel hücre formatı sorunu), lütfen şablonu yeniden indirip Metin formatında girin.';

function bilimselGosterimHatasi(value: string): boolean {
  return /[eE]\+/.test(value);
}

export async function buildCamEnvanterSablonBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CamLensEnvanter');

  ws.addRow([...CAM_ENVANTER_IMPORT_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.columns = CAM_ENVANTER_IMPORT_HEADERS.map((h) => ({
    header: h,
    width: Math.max(14, h.length + 2),
  }));

  const barkodCol = CAM_ENVANTER_IMPORT_HEADERS.indexOf('Barkod') + 1;
  const utsCol = CAM_ENVANTER_IMPORT_HEADERS.indexOf('UTS Kodu') + 1;
  const odooVaryantCol = CAM_ENVANTER_IMPORT_HEADERS.indexOf('Odoo Varyant ID') + 1;
  const lotNoCol = CAM_ENVANTER_IMPORT_HEADERS.indexOf('Lot No') + 1;
  const odooLotCol = CAM_ENVANTER_IMPORT_HEADERS.indexOf('Odoo Lot ID') + 1;
  const textCols = [barkodCol, utsCol, odooVaryantCol, lotNoCol, odooLotCol];
  for (const col of textCols) ws.getColumn(col).numFmt = '@';
  for (let r = 2; r <= 500; r++) {
    for (const col of textCols) ws.getCell(r, col).numFmt = '@';
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function parseCamEnvanterExcel(buffer: Buffer): Promise<ParsedCamEnvanterRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel dosyasında sayfa bulunamadı');

  const headerRow = ws.getRow(1);
  const headerTexts = (headerRow.values as Array<ExcelJS.CellValue | undefined>)
    .slice(1)
    .map((v) => normalizeHeader(v));

  const colIndex = new Map<CamEnvanterImportHeader, number>();
  for (const header of CAM_ENVANTER_IMPORT_HEADERS) {
    const aliases = HEADER_ALIASES[header];
    const idx = headerTexts.findIndex((h) => aliases.includes(h));
    if (idx >= 0) colIndex.set(header, idx + 1);
  }

  for (const required of CAM_ENVANTER_ZORUNLU_ALANLAR) {
    if (!colIndex.has(required)) {
      throw new Error(`Zorunlu sütun bulunamadı: "${required}"`);
    }
  }

  // bkz. envanter-import.service.ts'teki aynı not — ws.rowCount yerine
  // eachRow({includeEmpty:false}) kullanılıyor (performans/kilitlenme).
  const rows: ParsedCamEnvanterRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < 2) return;
    const get = (key: CamEnvanterImportHeader) => {
      const col = colIndex.get(key);
      return col ? row.getCell(col).value : undefined;
    };

    const odooVaryantId = colIndex.has('Odoo Varyant ID')
      ? cellOptionalInt(get('Odoo Varyant ID'))
      : undefined;
    const odooLotId = colIndex.has('Odoo Lot ID')
      ? cellOptionalInt(get('Odoo Lot ID'))
      : undefined;
    const lotNo = colIndex.has('Lot No') ? cellText(get('Lot No')) : '';

    const parsed: ParsedCamEnvanterRow = {
      satirNo: r,
      kategori: cellText(get('Kategori')),
      urunSablonu: cellText(get('Ürün Şablonu')),
      barkod: cellTextForCode(get('Barkod')),
      utsKodu: cellTextForCode(get('UTS Kodu')),
      adet: cellNumber(get('Adet')),
      satisFiyati: cellNumber(get('Satış Fiyatı')),
      maliyetFiyati: cellNumber(get('Maliyet Fiyatı')),
      kdvOrani: cellNumber(get('KDV Oranı')),
      ...(odooVaryantId ? { odooVaryantId } : {}),
      ...(lotNo ? { lotNo } : {}),
      ...(odooLotId ? { odooLotId } : {}),
    };

    const bos = !parsed.kategori && !parsed.urunSablonu && !parsed.barkod;
    if (bos) return;

    rows.push(parsed);
  });

  return rows;
}

function validateRow(row: ParsedCamEnvanterRow): string | null {
  for (const alan of CAM_ENVANTER_ZORUNLU_ALANLAR) {
    const val = row[
      alan === 'Kategori' ? 'kategori'
        : alan === 'Ürün Şablonu' ? 'urunSablonu'
          : alan === 'Barkod' ? 'barkod'
            : alan === 'Adet' ? 'adet'
              : alan === 'Satış Fiyatı' ? 'satisFiyati'
                : 'maliyetFiyati'
    ];
    if (val === '' || val == null || (typeof val === 'number' && Number.isNaN(val))) {
      return `Zorunlu alan eksik: ${alan}`;
    }
  }

  if (row.adet <= 0) return 'Adet 0\'dan büyük olmalı';
  if (row.satisFiyati < 0) return 'Satış fiyatı geçersiz';
  if (row.maliyetFiyati < 0) return 'Maliyet fiyatı geçersiz';
  if (bilimselGosterimHatasi(row.barkod)) {
    return `Barkod: ${BILIMSEL_GOSTERIM_MESAJ}`;
  }
  if (row.utsKodu && bilimselGosterimHatasi(row.utsKodu)) {
    return `UTS Kodu: ${BILIMSEL_GOSTERIM_MESAJ}`;
  }
  return null;
}

export type CamOdooLookup = {
  utsMap: Map<string, { lotId: number; lotName: string }>;
  templatesByName: Map<string, Array<{ id: number; name: string; categName: string }>>;
  templatesByNameNoSpace: Map<string, Array<{ id: number; name: string; categName: string }>>;
};

export async function loadCamOdooLookup(): Promise<CamOdooLookup> {
  // UTS tekilliği — aynı mantık (envanter-import.service.ts.loadOdooLookup).
  const utsMap = new Map<string, { lotId: number; lotName: string }>();
  const lotsWithUts = await execute(
    'stock.lot', 'search_read',
    [[['x_uts_kodu', '!=', false]]],
    { fields: ['id', 'name', 'x_uts_kodu'], limit: 20000, context: { active_test: false } },
  ) as { id: number; name: string; x_uts_kodu: string | false }[];
  for (const l of lotsWithUts) {
    const uts = typeof l.x_uts_kodu === 'string' ? l.x_uts_kodu.trim() : '';
    if (uts) utsMap.set(uts, { lotId: l.id, lotName: l.name });
  }

  const templates = await execute(
    'product.template', 'search_read',
    [[]],
    { fields: ['id', 'name', 'categ_id'], limit: 5000, context: { active_test: false } },
  ) as { id: number; name: string; categ_id: [number, string] | false }[];

  const templatesByName = new Map<string, Array<{ id: number; name: string; categName: string }>>();
  const templatesByNameNoSpace = new Map<string, Array<{ id: number; name: string; categName: string }>>();
  for (const t of templates) {
    const key = turkceSadelestir(t.name);
    const keyNoSpace = key.replace(/\s+/g, '');
    const categName = t.categ_id ? t.categ_id[1] : '';
    const entry = { id: t.id, name: t.name, categName };
    const list = templatesByName.get(key) ?? [];
    list.push(entry);
    templatesByName.set(key, list);
    const listNoSpace = templatesByNameNoSpace.get(keyNoSpace) ?? [];
    listNoSpace.push(entry);
    templatesByNameNoSpace.set(keyNoSpace, listNoSpace);
  }

  return { utsMap, templatesByName, templatesByNameNoSpace };
}

/** findTemplate (envanter-import.service.ts) ile PARİTE — AND-ilike-tüm-kelimeler. */
export async function findCamTemplate(
  lookup: CamOdooLookup,
  urunSablonu: string,
  kategori: string,
): Promise<{ id: number; name: string } | null> {
  const normKey = turkceSadelestir(urunSablonu);
  const normKeyNoSpace = normKey.replace(/\s+/g, '');
  let candidates = lookup.templatesByName.get(normKey) ?? [];
  if (!candidates.length) {
    candidates = lookup.templatesByNameNoSpace.get(normKeyNoSpace) ?? [];
  }

  if (!candidates.length) {
    const kelimeler = urunSablonu.trim().split(/\s+/).filter(Boolean);
    const andKosullari = kelimeler.length
      ? kelimeler.map((k) => ['name', 'ilike', k] as [string, string, string])
      : [['name', 'ilike', urunSablonu.trim()] as [string, string, string]];
    const live = (await execute(
      'product.template', 'search_read',
      [andKosullari],
      { fields: ['id', 'name', 'categ_id'], limit: 100, context: { active_test: false } },
    )) as { id: number; name: string; categ_id: [number, string] | false }[];
    const eslesen = live.filter((t) => {
      const tNorm = turkceSadelestir(t.name);
      return tNorm === normKey || tNorm.replace(/\s+/g, '') === normKeyNoSpace;
    });
    candidates = eslesen.map((t) => ({ id: t.id, name: t.name, categName: t.categ_id ? t.categ_id[1] : '' }));
  }

  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const katUpper = kategori.trim().toUpperCase();
  const byCateg = candidates.find((c) =>
    c.categName.toUpperCase().includes(katUpper)
    || katUpper.includes(c.categName.toUpperCase()),
  );
  return byCateg ?? candidates[0];
}

function urunAnahtar(kategori: string, urunSablonu: string): string {
  return `${kategori.trim().toUpperCase()}::${turkceSadelestir(urunSablonu)}`;
}

export async function previewCamEnvanterImport(
  rows: ParsedCamEnvanterRow[],
): Promise<CamEnvanterOnizlemeSonuc> {
  const lookup = await loadCamOdooLookup();
  const satirlar: CamEnvanterSatirOnizleme[] = [];

  // Excel içindeki mükerrer barkod+UTS (aynı dosyada iki kez girilmiş birim).
  const excelBirimler = new Map<string, number>();
  // Bu import'ta kaç farklı ürün grubu var — raporlama amaçlı.
  const urunGruplari = new Set<string>();

  for (const row of rows) {
    const validationError = validateRow(row);
    if (validationError) {
      satirlar.push({ ...row, durum: 'HATA', mesaj: validationError });
      continue;
    }

    const birimKey = `${row.barkod.trim().toUpperCase()}::${(row.utsKodu || '').trim().toUpperCase()}`;
    if (excelBirimler.has(birimKey)) {
      satirlar.push({
        ...row,
        durum: 'HATA',
        mesaj: `Mükerrer barkod+UTS (Excel satır ${excelBirimler.get(birimKey)})`,
      });
      continue;
    }
    excelBirimler.set(birimKey, row.satirNo);

    if (row.utsKodu.trim()) {
      const mevcutUts = lookup.utsMap.get(row.utsKodu.trim());
      if (mevcutUts) {
        satirlar.push({
          ...row,
          durum: 'HATA',
          mesaj: `Mükerrer UTS kodu — Odoo'da zaten kayıtlı (lot #${mevcutUts.lotId}: ${mevcutUts.lotName})`,
        });
        continue;
      }
    }

    urunGruplari.add(urunAnahtar(row.kategori, row.urunSablonu));

    const tmpl = await findCamTemplate(lookup, row.urunSablonu, row.kategori);
    if (!tmpl) {
      satirlar.push({
        ...row,
        durum: 'YENI_URUN',
        mesaj: 'Yeni ürün oluşturulacak (temsilci barkod otomatik atanacak) + ilk lot',
      });
      continue;
    }

    satirlar.push({
      ...row,
      durum: 'YENI_LOT',
      mesaj: `Mevcut ürüne yeni lot/birim eklenecek (şablon #${tmpl.id})`,
      resolvedTemplateId: tmpl.id,
    });
  }

  const ozet = {
    toplamSatir: satirlar.length,
    urunGrupSayisi: urunGruplari.size,
    yeniUrun: satirlar.filter((s) => s.durum === 'YENI_URUN').length,
    yeniLot: satirlar.filter((s) => s.durum === 'YENI_LOT').length,
    hata: satirlar.filter((s) => s.durum === 'HATA').length,
  };

  return { ozet, satirlar };
}
