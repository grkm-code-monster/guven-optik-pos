import ExcelJS from 'exceljs';
import { execute } from '../odoo/odoo.service';
import { ptavKey } from './varyant-import-temizlik.service';
import {
  ENVANTER_IMPORT_HEADERS,
  ENVANTER_ZORUNLU_ALANLAR,
  ENVANTER_MODEL_RENK_OLCU_MUAF_ANAHTAR_KELIMELER,
  type EnvanterImportHeader,
  type EnvanterSatirDurum,
} from './envanter-import.constants';

export type ParsedEnvanterRow = {
  satirNo: number;
  kategori: string;
  urunAdi: string;
  model: string;
  renk: string;
  olcu: string;
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

export type EnvanterSatirOnizleme = ParsedEnvanterRow & {
  durum: EnvanterSatirDurum;
  mesaj: string;
  // Barkod üzerinden KESİN olarak tespit edilmiş Odoo product.product ID'si
  // (16.10.2026 — restok tespiti artık şablon adı/model-renk-ölçü string
  // eşleşmesine değil, doğrudan barkoda bakıyor). Doluysa uygulama adımı
  // bu ID'yi kullanır, tekrar isim/ptav ile arama YAPMAZ.
  resolvedVariantId?: number;
};

export type EnvanterVaryantGrup = {
  model: string;
  renk: string;
  olcu: string;
  satirlar: EnvanterSatirOnizleme[];
};

export type EnvanterSablonGrup = {
  kategori: string;
  urunAdi: string;
  sablonAnahtar: string;
  varyantlar: EnvanterVaryantGrup[];
  ozet: {
    toplamSatir: number;
    yeniSablon: number;
    yeniVaryant: number;
    mevcutVaryant: number;
    hata: number;
  };
};

export type EnvanterOnizlemeSonuc = {
  ozet: {
    toplamSatir: number;
    sablonGrupSayisi: number;
    yeniSablon: number;
    yeniVaryant: number;
    mevcutVaryant: number;
    hata: number;
  };
  sablonlar: EnvanterSablonGrup[];
  satirlar: EnvanterSatirOnizleme[];
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

const HEADER_ALIASES: Record<EnvanterImportHeader, string[]> = {
  Kategori: ['kategori'],
  'Ürün Adı': ['urun adi', 'ürün adı', 'urun adi'],
  Model: ['model'],
  Renk: ['renk'],
  Ölçü: ['olcu', 'ölçü', 'olcu'],
  Barkod: ['barkod'],
  'UTS Kodu': ['uts kodu', 'uts'],
  Adet: ['adet', 'miktar'],
  'Satış Fiyatı': ['satis fiyati', 'satış fiyatı', 'satis fiyati'],
  'Maliyet Fiyatı': ['maliyet fiyati', 'maliyet fiyatı', 'maliyet'],
  'KDV Oranı': ['kdv orani', 'kdv oranı', 'kdv'],
  'Odoo Varyant ID': ['odoo varyant id', 'odoo varyant id', 'varyant id', 'product id'],
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

function sablonAnahtar(kategori: string, urunAdi: string): string {
  return `${kategori.trim().toUpperCase()}::${urunAdi.trim().toUpperCase()}`;
}

function varyantAnahtar(model: string, renk: string, olcu: string): string {
  return `${model.trim().toUpperCase()}|${renk.trim().toUpperCase()}|${olcu.trim().toUpperCase()}`;
}

function birimAnahtar(row: Pick<ParsedEnvanterRow, 'barkod' | 'utsKodu' | 'odooLotId'>): string {
  if (row.odooLotId) return `LOT:${row.odooLotId}`;
  return `${row.barkod.trim().toUpperCase()}::${(row.utsKodu || '').trim().toUpperCase()}`;
}

function odooStrVal(v: unknown): string | null {
  if (v === false || v == null) return null;
  const s = String(v).trim();
  return s || null;
}

const BILIMSEL_GOSTERIM_MESAJ =
  'Bu değer bilimsel gösterime dönüşmüş (Excel hücre formatı sorunu), lütfen şablonu yeniden indirip Metin formatında girin.';

function bilimselGosterimHatasi(value: string): boolean {
  return /[eE]\+/.test(value);
}

/** Türkçe karakter + büyük/küçük harf farkını yok sayan karşılaştırma için
 *  (16.10.2026 — "VIVALDI" (excel'de ASCII I ile) ile Odoo'da "VİVALDİ"
 *  (Türkçe noktalı İ ile) kayıtlı AYNI ürün, düz .toUpperCase() ile farklı
 *  string sayılıp yanlışlıkla "başka ürüne kayıtlı" hatası veriyordu.
 *  transfer.service.ts'teki turkishFoldBackend ile aynı mantık). */
export function turkceSadelestir(s: string): string {
  return String(s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .toLowerCase()
    .trim();
}

function cellTextForCode(value: ExcelJS.CellValue): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('fullwide', { useGrouping: false });
  }
  return cellText(value);
}

export async function buildEnvanterSablonBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Envanter');

  ws.addRow([...ENVANTER_IMPORT_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.columns = ENVANTER_IMPORT_HEADERS.map((h) => ({
    header: h,
    width: Math.max(12, h.length + 2),
  }));

  const barkodCol = ENVANTER_IMPORT_HEADERS.indexOf('Barkod') + 1;
  const utsCol = ENVANTER_IMPORT_HEADERS.indexOf('UTS Kodu') + 1;
  const odooVaryantCol = ENVANTER_IMPORT_HEADERS.indexOf('Odoo Varyant ID') + 1;
  const lotNoCol = ENVANTER_IMPORT_HEADERS.indexOf('Lot No') + 1;
  const odooLotCol = ENVANTER_IMPORT_HEADERS.indexOf('Odoo Lot ID') + 1;
  const textCols = [barkodCol, utsCol, odooVaryantCol, lotNoCol, odooLotCol];
  for (const col of textCols) ws.getColumn(col).numFmt = '@';
  for (let r = 2; r <= 500; r++) {
    for (const col of textCols) ws.getCell(r, col).numFmt = '@';
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function parseEnvanterExcel(buffer: Buffer): Promise<ParsedEnvanterRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel dosyasında sayfa bulunamadı');

  const headerRow = ws.getRow(1);
  const headerTexts = (headerRow.values as Array<ExcelJS.CellValue | undefined>)
    .slice(1)
    .map((v) => normalizeHeader(v));

  const colIndex = new Map<EnvanterImportHeader, number>();
  for (const header of ENVANTER_IMPORT_HEADERS) {
    const aliases = HEADER_ALIASES[header];
    const idx = headerTexts.findIndex((h) => aliases.includes(h));
    if (idx >= 0) colIndex.set(header, idx + 1);
  }

  for (const required of ENVANTER_ZORUNLU_ALANLAR) {
    if (!colIndex.has(required)) {
      throw new Error(`Zorunlu sütun bulunamadı: "${required}"`);
    }
  }

  // ÖNEMLİ: ws.rowCount, Excel'in bazı dosyalarda (ör. bu şablon) sayfanın
  // "kullanılan aralık" meta verisini gerçek veriden çok daha büyük (hatta
  // Excel'in mutlak maksimumu 1.048.576'ya kadar) rapor edebiliyor. Daha
  // önce burada `for (r=2; r<=ws.rowCount; r++)` ile TÜM bu aralık tek tek
  // dolaşılıyordu — 52 satırlık bir dosyada bile milyonlarca boş satırı
  // gezip her biri için Row nesnesi oluşturuyordu, bu da süreci dakikalarca
  // kilitleyip (hatta belleği tüketip) backend'in sessizce çökmesine/
  // yeniden başlamasına yol açıyordu (nginx 502). `eachRow` ise sadece
  // GERÇEKTEN veri içeren satırları ziyaret eder — doğru ve güvenli yol bu.
  const rows: ParsedEnvanterRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < 2) return;
    const get = (key: EnvanterImportHeader) => {
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

    const parsed: ParsedEnvanterRow = {
      satirNo: r,
      kategori: cellText(get('Kategori')),
      urunAdi: cellText(get('Ürün Adı')),
      model: cellText(get('Model')),
      renk: cellText(get('Renk')),
      olcu: cellText(get('Ölçü')),
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

    const bos = !parsed.kategori && !parsed.urunAdi && !parsed.barkod && !parsed.model;
    if (bos) return;

    rows.push(parsed);
  });

  return rows;
}

export function isModelRenkOlcuMuaf(kategori: string): boolean {
  const katUpper = kategori.trim().toUpperCase();
  return ENVANTER_MODEL_RENK_OLCU_MUAF_ANAHTAR_KELIMELER.some((kw) => katUpper.includes(kw));
}

function validateRow(row: ParsedEnvanterRow): string | null {
  if (row.odooLotId) {
    if (!row.barkod?.trim()) return 'Barkod zorunlu (lot düzeltme satırı)';
    if (!row.odooVaryantId) return 'Odoo Varyant ID zorunlu (lot düzeltme satırı)';
    if (row.adet <= 0) return 'Adet 0\'dan büyük olmalı';
    if (bilimselGosterimHatasi(row.barkod)) {
      return `Barkod: ${BILIMSEL_GOSTERIM_MESAJ}`;
    }
    if (row.utsKodu && bilimselGosterimHatasi(row.utsKodu)) {
      return `UTS Kodu: ${BILIMSEL_GOSTERIM_MESAJ}`;
    }
    return null;
  }

  for (const alan of ENVANTER_ZORUNLU_ALANLAR) {
    const val = row[
      alan === 'Kategori' ? 'kategori'
        : alan === 'Ürün Adı' ? 'urunAdi'
          : alan === 'Model' ? 'model'
            : alan === 'Renk' ? 'renk'
              : alan === 'Ölçü' ? 'olcu'
                : alan === 'Barkod' ? 'barkod'
                  : alan === 'Adet' ? 'adet'
                    : alan === 'Satış Fiyatı' ? 'satisFiyati'
                      : 'maliyetFiyati'
    ];
    if (val === '' || val == null || (typeof val === 'number' && Number.isNaN(val))) {
      return `Zorunlu alan eksik: ${alan}`;
    }
  }

  // Model/Renk/Ölçü sadece Cam ve Lens DIŞINDAKİ kategorilerde (Çerçeve,
  // Güneş Gözlüğü vb.) zorunlu — Cam ve Lens ürünlerinde bu alanlar olmaz.
  if (!isModelRenkOlcuMuaf(row.kategori)) {
    if (!row.model?.trim()) return 'Zorunlu alan eksik: Model';
    if (!row.renk?.trim()) return 'Zorunlu alan eksik: Renk';
    if (!row.olcu?.trim()) return 'Zorunlu alan eksik: Ölçü';
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

async function loadOdooLookup(): Promise<{
  barcodeSet: Set<string>;
  productByBarcode: Map<string, { id: number; tmplId: number }>;
  templatesByName: Map<string, Array<{ id: number; name: string; categName: string }>>;
  templatesByNameNoSpace: Map<string, Array<{ id: number; name: string; categName: string }>>;
  templatesById: Map<number, { name: string; categName: string }>;
  attrIds: { model?: number; renk?: number; olcu?: number };
  attrValues: Map<string, number>;
  variantsByTmpl: Map<number, Set<string>>;
  utsMap: Map<string, { lotId: number; lotName: string }>;
}> {
  console.log(`[envanter-onizle] loadOdooLookup başladı ts=${new Date().toISOString()}`);
  const barcodeSet = new Set<string>();
  // 16.10.2026 — restok tespiti artık ŞABLON ADI / MODEL-RENK-ÖLÇÜ string
  // eşleşmesine DEĞİL, doğrudan BARKODA bakıyor (barkod Odoo'da product.product
  // seviyesinde tekil ve ürünün gerçek kimliği). Önceden sadece "barkod var mı
  // yok mu" bakılıp sonra isim/ptav eşleşmesi aranıyordu — isim arama limitleri
  // (5000 şablon) veya model/renk/ölçü yazım farkları yüzünden eşleşme
  // bulunamayınca ZATEN VAR OLAN bir ürün için "Barkod Odoo'da zaten kayıtlı"
  // hatası ya da yanlışlıkla "Yeni Varyant" (mükerrer varyant denemesi)
  // çıkıyordu (MUSTANG / OTTO ÇERÇEVE şikayetleri). Artık barkod → product.
  // product eşlemesi dolays olarak alınıp hangi şablona ait olduğu KESİN
  // belirleniyor.
  const productByBarcode = new Map<string, { id: number; tmplId: number }>();
  const withBarcode = await execute(
    'product.product', 'search_read',
    [[['barcode', '!=', false]]],
    { fields: ['id', 'barcode', 'product_tmpl_id'], limit: 10000 },
  ) as { id: number; barcode: string; product_tmpl_id: [number, string] | false }[];
  for (const p of withBarcode) {
    const bc = p.barcode?.trim();
    if (!bc) continue;
    barcodeSet.add(bc);
    if (Array.isArray(p.product_tmpl_id)) {
      productByBarcode.set(bc, { id: p.id, tmplId: p.product_tmpl_id[0] });
    }
  }
  console.log(`[envanter-onizle] loadOdooLookup: barkod seti tamam (${barcodeSet.size})`);

  // UTS kodu tekilliği (16.10.2026) — "mükerrer UTS" durumu barkod farklı
  // olsa bile ayrı bir hata olmalı (UTS tıbbi cihaz takibinde tekil olmak
  // ZORUNDA, "aynı ürün" diye basitçe adet artırılamaz). stock.lot üzerindeki
  // x_uts_kodu alanına göre GLOBAL bir harita çıkarıyoruz.
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
  console.log(`[envanter-onizle] loadOdooLookup: UTS seti tamam (${utsMap.size})`);

  const templates = await execute(
    'product.template', 'search_read',
    [[]],
    { fields: ['id', 'name', 'categ_id'], limit: 5000, context: { active_test: false } },
  ) as { id: number; name: string; categ_id: [number, string] | false }[];
  console.log(`[envanter-onizle] loadOdooLookup: şablonlar tamam (${templates.length})`);

  // 16.10.2026 — anahtar artık turkceSadelestir ile normalize ediliyor
  // ("VIVALDI" vs "VİVALDİ" gibi Türkçe İ/I farkları için), AYRICA boşluksuz
  // ikinci bir harita (templatesByNameNoSpace) tutuluyor ("X BLACK" excel'de,
  // Odoo'da "XBLACK" gibi aralık farkları için — gerçek örnekte görüldü,
  // eşleşme bulunamayınca Odoo'da ZATEN VAR olan marka için MÜKERRER şablon
  // açılıyordu).
  const templatesByName = new Map<string, Array<{ id: number; name: string; categName: string }>>();
  const templatesByNameNoSpace = new Map<string, Array<{ id: number; name: string; categName: string }>>();
  const templatesById = new Map<number, { name: string; categName: string }>();
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
    templatesById.set(t.id, { name: t.name, categName });
  }

  const attrs = await execute(
    'product.attribute', 'search_read',
    [[['name', 'in', ['MODEL', 'RENK', 'ÖLÇÜ']]]],
    { fields: ['id', 'name'], limit: 10 },
  ) as { id: number; name: string }[];

  const attrIds = {
    model: attrs.find((a) => a.name === 'MODEL')?.id,
    renk: attrs.find((a) => a.name === 'RENK')?.id,
    olcu: attrs.find((a) => a.name === 'ÖLÇÜ')?.id,
  };

  const attrValueIds = attrs.map((a) => a.id);
  const attrValues = new Map<string, number>();
  if (attrValueIds.length) {
    const values = await execute(
      'product.attribute.value', 'search_read',
      [[['attribute_id', 'in', attrValueIds]]],
      { fields: ['id', 'name', 'attribute_id'], limit: 10000 },
    ) as { id: number; name: string; attribute_id: [number, string] }[];
    for (const v of values) {
      attrValues.set(`${v.attribute_id[0]}_${v.name.trim().toUpperCase()}`, v.id);
    }
  }

  const variantsByTmpl = new Map<number, Set<string>>();
  const tmplIds = templates.map((t) => t.id);
  if (tmplIds.length) {
    const variants = await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id', 'in', tmplIds]]],
      { fields: ['product_tmpl_id', 'product_template_attribute_value_ids'], limit: 10000 },
    ) as { product_tmpl_id: [number, string]; product_template_attribute_value_ids: number[] }[];

    for (const v of variants) {
      const tmplId = v.product_tmpl_id[0];
      const set = variantsByTmpl.get(tmplId) ?? new Set<string>();
      set.add(ptavKey(v.product_template_attribute_value_ids ?? []));
      variantsByTmpl.set(tmplId, set);
    }
  }
  console.log(`[envanter-onizle] loadOdooLookup TAMAMLANDI ts=${new Date().toISOString()}`);

  return { barcodeSet, productByBarcode, templatesByName, templatesByNameNoSpace, templatesById, attrIds, attrValues, variantsByTmpl, utsMap };
}

async function findTemplate(
  lookup: Awaited<ReturnType<typeof loadOdooLookup>>,
  urunAdi: string,
  kategori: string,
): Promise<{ id: number; name: string } | null> {
  // 16.10.2026 — "X BLACK OPTİK ÇERÇEVE" (excel) vs Odoo'da "XBLACK OPTİK
  // ÇERÇEVE" (boşluk farkı) örneğinde olduğu gibi, salt .trim().toUpperCase()
  // ile birebir string eşleşmesi aranması TÜRKÇE KARAKTER (İ/I, Ğ, Ş...) ya da
  // BOŞLUK farklarında mevcut şablonu bulamıyor ve ZATEN VAR OLAN bir ürün
  // için yanlışlıkla "Yeni Şablon" oluşturuluyordu. Artık önce Türkçe
  // normalize edilmiş isim ile, bulunamazsa boşluksuz normalize isim ile
  // aranıyor (barkod karşılaştırmasında kullanılan turkceSadelestir ile aynı
  // mantık).
  const normKey = turkceSadelestir(urunAdi);
  const normKeyNoSpace = normKey.replace(/\s+/g, '');
  let candidates = lookup.templatesByName.get(normKey) ?? [];
  if (!candidates.length) {
    candidates = lookup.templatesByNameNoSpace.get(normKeyNoSpace) ?? [];
  }

  // ÖNEMLİ: loadOdooLookup, şablonları `limit: 5000` ile ÖN YÜKLÜYOR —
  // katalogda 5000'den fazla şablon varsa (bu mağazada öyle), bazı mevcut
  // şablonlar bu listeye hiç girmeyebilir. Önceden sadece bu listeye
  // bakılıyordu ve eşleşme yoksa doğrudan "yeni şablon" denip Odoo'da ZATEN
  // VAR OLAN bir ürün için MÜKERRER şablon açılıyordu (ör. "OSSE GÜNEŞ
  // GÖZLÜĞÜ"). Artık ön-yüklenen listede yoksa, canlı bir Odoo araması ile
  // de kontrol ediliyor — tıpkı gerçek uygulama (uygula) adımındaki
  // findTemplateId'nin yaptığı gibi. Birebir eşitlik yerine ilk kelime ile
  // GENİŞ (ilike) arama yapılıp sonuçlar Türkçe-normalize edilmiş isimle
  // istemci tarafında filtreleniyor — böylece boşluk/Türkçe karakter farkları
  // canlı aramada da gözden kaçmıyor.
  if (!candidates.length) {
    const ilkKelime = urunAdi.trim().split(/\s+/)[0] || urunAdi.trim();
    const live = (await execute(
      'product.template', 'search_read',
      [[['name', 'ilike', ilkKelime]]],
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

async function resolveVariantPtavKey(
  tmplId: number,
  row: ParsedEnvanterRow,
  lookup: Awaited<ReturnType<typeof loadOdooLookup>>,
): Promise<string | null> {
  const { attrIds } = lookup;
  if (!attrIds.model || !attrIds.renk || !attrIds.olcu) return null;

  const modelId = lookup.attrValues.get(`${attrIds.model}_${row.model.trim().toUpperCase()}`);
  const renkId = lookup.attrValues.get(`${attrIds.renk}_${row.renk.trim().toUpperCase()}`);
  const olcuId = lookup.attrValues.get(`${attrIds.olcu}_${row.olcu.trim().toUpperCase()}`);
  if (!modelId || !renkId || !olcuId) return null;

  const ptavlar = await execute(
    'product.template.attribute.value', 'search_read',
    [[
      ['product_tmpl_id', '=', tmplId],
      ['product_attribute_value_id', 'in', [modelId, renkId, olcuId]],
    ]],
    { fields: ['id'], limit: 10 },
  ) as { id: number }[];

  if (ptavlar.length < 3) return null;
  return ptavKey(ptavlar.map((p) => p.id));
}

export async function resolveVariantByOdooId(
  odooVaryantId: number,
  barkod: string,
): Promise<{ ok: true; variantId: number } | { ok: false; error: string }> {
  const id = Math.floor(Number(odooVaryantId));
  if (!id || id <= 0) {
    return { ok: false, error: 'Geçersiz Odoo Varyant ID' };
  }

  const products = await execute(
    'product.product',
    'read',
    [[id]],
    { fields: ['id', 'barcode'], context: { active_test: false } },
  ) as { id: number; barcode?: string | false }[];

  if (!products?.length) {
    return { ok: false, error: `Odoo Varyant ID #${id} bulunamadı` };
  }

  const expectedBarkod = barkod.trim();
  const actualBarkod = typeof products[0].barcode === 'string' ? products[0].barcode.trim() : '';
  if (expectedBarkod && actualBarkod && expectedBarkod !== actualBarkod) {
    return {
      ok: false,
      error: `ID ile barkod eşleşmiyor (ID #${id}: "${actualBarkod}", satır: "${expectedBarkod}")`,
    };
  }

  return { ok: true, variantId: products[0].id };
}

export async function resolveLotForUtsCorrection(
  odooLotId: number,
  odooVaryantId?: number,
): Promise<
  | { ok: true; lotId: number; variantId: number; utsDolu: boolean; lotNo: string }
  | { ok: false; error: string }
> {
  const lotId = Math.floor(Number(odooLotId));
  if (!lotId || lotId <= 0) {
    return { ok: false, error: 'Geçersiz Odoo Lot ID' };
  }

  const lots = await execute(
    'stock.lot',
    'read',
    [[lotId]],
    { fields: ['id', 'product_id', 'x_uts_kodu', 'name'], context: { active_test: false } },
  ) as Array<{
    id: number;
    product_id: [number, string] | false;
    x_uts_kodu?: string | false;
    name: string;
  }>;

  if (!lots?.length) {
    return { ok: false, error: `Odoo Lot ID #${lotId} bulunamadı` };
  }

  const lot = lots[0];
  const variantId = Array.isArray(lot.product_id) ? lot.product_id[0] : 0;
  if (!variantId) {
    return { ok: false, error: `Lot #${lotId} için varyant bulunamadı` };
  }

  if (odooVaryantId && variantId !== odooVaryantId) {
    return {
      ok: false,
      error: `Lot ID ile Varyant ID uyuşmuyor (lot #${lotId} → varyant #${variantId}, satır: #${odooVaryantId})`,
    };
  }

  const mevcutUts = odooStrVal(lot.x_uts_kodu);
  return {
    ok: true,
    lotId: lot.id,
    variantId,
    utsDolu: !!mevcutUts,
    lotNo: lot.name ?? '',
  };
}

export async function previewEnvanterImport(
  rows: ParsedEnvanterRow[],
): Promise<EnvanterOnizlemeSonuc> {
  const lookup = await loadOdooLookup();
  const excelBirimler = new Map<string, number>();
  // 16.10.2026 — excel'in KENDİ İÇİNDE aynı barkodun farklı model/renk/ölçü
  // (ya da muaf kategorilerde farklı ürün adı) ile tekrar etmesini yakalamak
  // için. Gerçek bir örnekte görüldü: "OTTO OPTİK ÇERÇEVE" barkodu
  // 08681715130217 bir satırda model 204OO, başka bir satırda 203OO olarak
  // girilmiş — muhtemelen veri girişi hatası (kopyala-yapıştır). Barkod
  // Odoo'da ürünün TEK kimliği olduğu için aynı barkodun iki farklı modele
  // atanması, hangisi doğruysa o yanlış ürüne stok/UTS eklenmesine yol açar;
  // bu yüzden içe aktarmadan ÖNCE kullanıcıya gösterilip düzelttirilmeli.
  const barkodIlkGorulen = new Map<string, { model: string; renk: string; olcu: string; urunAdi: string; satirNo: number }>();
  const satirlar: EnvanterSatirOnizleme[] = [];

  let rowIdx = 0;
  for (const row of rows) {
    rowIdx++;
    console.log(`[envanter-onizle] satır ${rowIdx}/${rows.length} işleniyor (satirNo=${row.satirNo})`);
    const validationError = validateRow(row);
    if (validationError) {
      satirlar.push({ ...row, durum: 'HATA', mesaj: validationError });
      continue;
    }

    const birimKey = birimAnahtar(row);
    if (excelBirimler.has(birimKey)) {
      satirlar.push({
        ...row,
        durum: 'HATA',
        mesaj: row.odooLotId
          ? `Mükerrer Odoo Lot ID (Excel satır ${excelBirimler.get(birimKey)})`
          : `Mükerrer barkod+UTS (Excel satır ${excelBirimler.get(birimKey)})`,
      });
      continue;
    }
    excelBirimler.set(birimKey, row.satirNo);

    if (!row.odooLotId) {
      const barkodTrim = row.barkod.trim();
      const onceki = barkodIlkGorulen.get(barkodTrim);
      if (!onceki) {
        barkodIlkGorulen.set(barkodTrim, {
          model: row.model,
          renk: row.renk,
          olcu: row.olcu,
          urunAdi: row.urunAdi,
          satirNo: row.satirNo,
        });
      } else {
        const ayniVaryant = isModelRenkOlcuMuaf(row.kategori)
          ? turkceSadelestir(onceki.urunAdi) === turkceSadelestir(row.urunAdi)
          : turkceSadelestir(onceki.model) === turkceSadelestir(row.model)
            && turkceSadelestir(onceki.renk) === turkceSadelestir(row.renk)
            && turkceSadelestir(onceki.olcu) === turkceSadelestir(row.olcu);
        if (!ayniVaryant) {
          satirlar.push({
            ...row,
            durum: 'HATA',
            mesaj: isModelRenkOlcuMuaf(row.kategori)
              ? `Bu barkod excel içinde farklı bir ürünle tekrar ediyor (Excel satır ${onceki.satirNo}: "${onceki.urunAdi}") — barkodu uydurmayın, kutudaki gerçek barkoda bakıp ürün adı satırını düzeltin`
              : `Bu barkod excel içinde farklı bir model/renk/ölçü ile tekrar ediyor (Excel satır ${onceki.satirNo}: "${onceki.model}/${onceki.renk}/${onceki.olcu}") — barkodu uydurmayın (kutudaki gerçek barkodla eşleşmez, kasada okutulamaz), kutudan/faturadan doğru model kodunu kontrol edip düzeltin`,
          });
          continue;
        }
      }
    }

    // UTS kodu tekilliği (16.10.2026) — UTS tıbbi cihaz takibinde TEKİL olmak
    // zorunda; barkod aynı ürüne ait olsa bile UTS başka bir lotta zaten
    // kayıtlıysa bu ayrı ve gerçek bir hata (basitçe adet artırılamaz).
    // odooLotId dolu satırlar zaten bilinçli "UTS düzeltme" akışı, onları
    // bu kontrolden muaf tutuyoruz.
    if (!row.odooLotId && row.utsKodu.trim()) {
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

    if (row.odooLotId) {
      const resolved = await resolveLotForUtsCorrection(row.odooLotId, row.odooVaryantId);
      if (!resolved.ok) {
        satirlar.push({ ...row, durum: 'HATA', mesaj: resolved.error });
        continue;
      }
      if (row.odooVaryantId) {
        const variantCheck = await resolveVariantByOdooId(row.odooVaryantId, row.barkod);
        if (!variantCheck.ok) {
          satirlar.push({ ...row, durum: 'HATA', mesaj: variantCheck.error });
          continue;
        }
      }
      let mesaj: string;
      if (resolved.utsDolu) {
        mesaj = `UTS düzeltme — lot #${resolved.lotId} (UTS zaten dolu, değişmeyecek)`;
      } else if (row.utsKodu.trim()) {
        mesaj = `UTS düzeltme — lot #${resolved.lotId} (UTS yazılacak)`;
      } else {
        mesaj = `UTS düzeltme — lot #${resolved.lotId} (UTS boş, doldurulacak değer yok)`;
      }
      satirlar.push({
        ...row,
        durum: 'MEVCUT_VARYANT',
        mesaj,
      });
      continue;
    }

    if (row.odooVaryantId) {
      const resolved = await resolveVariantByOdooId(row.odooVaryantId, row.barkod);
      if (!resolved.ok) {
        satirlar.push({ ...row, durum: 'HATA', mesaj: resolved.error });
        continue;
      }
      satirlar.push({
        ...row,
        durum: 'MEVCUT_VARYANT',
        mesaj: `UTS düzeltme — mevcut varyant (#${resolved.variantId})`,
      });
      continue;
    }

    // 16.10.2026 — barkod Odoo'da product.product seviyesinde TEKİL ve
    // ürünün gerçek kimliğidir. Önceden burada önce "şablon adı eşleşiyor
    // mu" (findTemplate) sonra "model/renk/ölçü (ptav) eşleşiyor mu" diye
    // bakılıyordu — isim arama limitleri veya yazım farkları eşleşmeyi
    // bozunca ZATEN VAR OLAN bir ürün ya "Barkod Odoo'da zaten kayıtlı"
    // hatasına (MUSTANG OPTİK ÇERÇEVE şikayeti) ya da yanlışlıkla "Yeni
    // Varyant" olarak (OTTO OPTİK ÇERÇEVE şikayeti — zaten var olan varyant
    // için tekrar oluşturma denemesi) düşüyordu. Artık doğrudan barkodun
    // Odoo'da hangi şablona ait olduğu (productByBarcode) okunuyor; excel
    // satırının ürün adıyla o şablonun GERÇEK adı karşılaştırılıp restok mu
    // yoksa gerçek bir çakışma mı olduğuna karar veriliyor.
    const mevcutUrun = lookup.productByBarcode.get(row.barkod.trim());
    if (mevcutUrun) {
      let mevcutSablonAdi = lookup.templatesById.get(mevcutUrun.tmplId)?.name;
      if (!mevcutSablonAdi) {
        // 5000'lik ön-yükleme listesine girmemiş olabilir — canlı oku.
        const live = (await execute(
          'product.template', 'read',
          [[mevcutUrun.tmplId]],
          { fields: ['name'], context: { active_test: false } },
        )) as { id: number; name: string }[];
        mevcutSablonAdi = live[0]?.name ?? `#${mevcutUrun.tmplId}`;
      }

      const excelAdiNorm = turkceSadelestir(row.urunAdi);
      const odooAdiNorm = turkceSadelestir(mevcutSablonAdi);
      const ayniUrun = excelAdiNorm === odooAdiNorm
        || excelAdiNorm.includes(odooAdiNorm)
        || odooAdiNorm.includes(excelAdiNorm);

      if (ayniUrun) {
        satirlar.push({
          ...row,
          durum: 'MEVCUT_VARYANT',
          mesaj: `Mevcut varyant — restok (barkod ile doğrulandı: "${mevcutSablonAdi}")`,
          resolvedVariantId: mevcutUrun.id,
        });
        continue;
      }

      satirlar.push({
        ...row,
        durum: 'HATA',
        mesaj: `Barkod başka bir ürüne kayıtlı — Odoo'da "${mevcutSablonAdi}" olarak kayıtlı, excel'de "${row.urunAdi}" yazıyor`,
      });
      continue;
    }

    const tmpl = await findTemplate(lookup, row.urunAdi, row.kategori);
    if (!tmpl) {
      satirlar.push({
        ...row,
        durum: 'YENI_SABLON',
        mesaj: 'Yeni şablon + yeni varyant oluşturulacak',
      });
      continue;
    }

    const ptavKeyVal = await resolveVariantPtavKey(tmpl.id, row, lookup);
    const mevcutKeys = lookup.variantsByTmpl.get(tmpl.id) ?? new Set<string>();

    if (ptavKeyVal && mevcutKeys.has(ptavKeyVal)) {
      satirlar.push({
        ...row,
        durum: 'MEVCUT_VARYANT',
        mesaj: `Mevcut varyant (şablon #${tmpl.id})`,
      });
      continue;
    }

    satirlar.push({
      ...row,
      durum: 'YENI_VARYANT',
      mesaj: `Mevcut şablona yeni varyant eklenecek (#${tmpl.id})`,
    });
  }

  const sablonMap = new Map<string, EnvanterSablonGrup>();
  for (const satir of satirlar) {
    const key = sablonAnahtar(satir.kategori, satir.urunAdi);
    if (!sablonMap.has(key)) {
      sablonMap.set(key, {
        kategori: satir.kategori,
        urunAdi: satir.urunAdi,
        sablonAnahtar: key,
        varyantlar: [],
        ozet: { toplamSatir: 0, yeniSablon: 0, yeniVaryant: 0, mevcutVaryant: 0, hata: 0 },
      });
    }
    const grup = sablonMap.get(key)!;
    grup.ozet.toplamSatir++;
    if (satir.durum === 'YENI_SABLON') grup.ozet.yeniSablon++;
    else if (satir.durum === 'YENI_VARYANT') grup.ozet.yeniVaryant++;
    else if (satir.durum === 'MEVCUT_VARYANT') grup.ozet.mevcutVaryant++;
    else grup.ozet.hata++;

    const vKey = varyantAnahtar(satir.model, satir.renk, satir.olcu);
    let varyant = grup.varyantlar.find((v) =>
      varyantAnahtar(v.model, v.renk, v.olcu) === vKey,
    );
    if (!varyant) {
      varyant = { model: satir.model, renk: satir.renk, olcu: satir.olcu, satirlar: [] };
      grup.varyantlar.push(varyant);
    }
    varyant.satirlar.push(satir);
  }

  const sablonlar = [...sablonMap.values()];
  const ozet = {
    toplamSatir: satirlar.length,
    sablonGrupSayisi: sablonlar.length,
    yeniSablon: satirlar.filter((s) => s.durum === 'YENI_SABLON').length,
    yeniVaryant: satirlar.filter((s) => s.durum === 'YENI_VARYANT').length,
    mevcutVaryant: satirlar.filter((s) => s.durum === 'MEVCUT_VARYANT').length,
    hata: satirlar.filter((s) => s.durum === 'HATA').length,
  };

  return { ozet, sablonlar, satirlar };
}
