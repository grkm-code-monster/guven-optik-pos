export type Gs1Parsed = {
  gtin14: string;
  gtin13: string;
  lot?: string;
  serial?: string;
  additional?: string;
};

export type Gs1SearchYontem = 'barkod' | 'uts' | 'lot' | 'ref' | 'ad';

const FIXED_LENGTH_AIS: Record<string, number> = {
  '01': 14,
  '11': 6,
  '17': 6,
};

const VARIABLE_AIS = new Set(['10', '21', '240']);

const VARIABLE_AI_STOP: Record<string, string[]> = {
  '10': ['240', '21', '17', '11'],
  '21': ['240', '17', '11', '10'],
  '240': [],
};

const MATCH_AIS = ['240', '01', '17', '11', '10', '21'];

export function normalizeGs1Raw(ham: string): string {
  return String(ham ?? '').trim().replace(/\*/g, '\x1d').replace(/[()]/g, '');
}

export function gtin14ToEan13(gtin14: string): string {
  if (gtin14.length !== 14) return gtin14;
  return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
}

/** GS1 element string: starts with (01) GTIN, typically longer than a plain EAN-13. */
export function isGs1DataMatrix(ham: string): boolean {
  const s = normalizeGs1Raw(ham);
  if (!s.startsWith('01')) return false;
  if (s.length < 16) return false;
  return /^01\d{14}/.test(s);
}

/** @deprecated alias — transfer kodu uyumluluğu */
export function looksLikeGs1ElementString(term: string): boolean {
  return isGs1DataMatrix(term);
}

function matchAi(raw: string, pos: number): string | null {
  for (const ai of MATCH_AIS) {
    if (raw.slice(pos, pos + ai.length) === ai) return ai;
  }
  return null;
}

function readVariableField(
  raw: string,
  start: number,
  stopAis: string[],
  parentAi?: string,
): { value: string; end: number } {
  for (let j = start; j < raw.length; j++) {
    if (raw[j] === '\x1d') {
      return { value: raw.slice(start, j), end: j + 1 };
    }
  }
  if (!stopAis.length) {
    return { value: raw.slice(start), end: raw.length };
  }
  for (let j = start + 1; j <= raw.length; j++) {
    for (const ai of stopAis) {
      if (raw.slice(j, j + ai.length) !== ai) continue;
      if (parentAi === '21' && ai === '10') {
        const candidateSerial = raw.slice(start, j);
        if (candidateSerial.length < 4) continue;
      }
      return { value: raw.slice(start, j), end: j };
    }
  }
  return { value: raw.slice(start), end: raw.length };
}

function repairGs1ParseWithoutFnc1(raw: string, parsed: Gs1Parsed): Gs1Parsed {
  if (raw.includes('\x1d')) return parsed;
  if (raw.slice(16, 18) !== '21') return parsed;

  const tail = raw.slice(18);
  if (!tail) return parsed;

  const dateSuffix = tail.match(/^(.+\d{4}-\d{2}-\d{2})(\d{1,20})$/);
  if (dateSuffix) {
    return { ...parsed, serial: dateSuffix[1], lot: dateSuffix[2] };
  }

  const serial = parsed.serial?.trim() ?? '';
  const lot = parsed.lot?.trim() ?? '';
  const suspicious =
    (!serial && !lot) ||
    (serial.length > 0 && serial.length <= 3 && lot.length <= 3);

  if (!suspicious) return parsed;

  for (let i = tail.length - 3; i >= 4; i--) {
    if (tail.slice(i, i + 2) !== '10') continue;
    const serialCandidate = tail.slice(0, i);
    let lotCandidate = tail.slice(i + 2);
    if (serialCandidate.length < 8 && !serialCandidate.includes('-')) continue;
    const m11 = lotCandidate.match(/^(.+?)11(\d{6})/);
    if (m11) lotCandidate = m11[1];
    if (lotCandidate.length > 0 && lotCandidate.length <= 20) {
      return { ...parsed, serial: serialCandidate, lot: lotCandidate };
    }
  }

  return { ...parsed, serial: tail, lot: undefined };
}

export function isUtsSeriLotEksik(seriNo?: string | null, lotNo?: string | null): boolean {
  return !String(seriNo ?? '').trim() && !String(lotNo ?? '').trim();
}

export const UTS_MAX_LOT_LENGTH = 20;
export const UTS_MAX_SERI_LENGTH = 20;

export function utsAlanUzunlukHatasi(seriNo?: string | null, lotNo?: string | null): string | null {
  const s = String(seriNo ?? '').trim();
  const l = String(lotNo ?? '').trim();
  if (l.length > UTS_MAX_LOT_LENGTH) {
    const ozet = l.length > 40 ? `${l.slice(0, 40)}…` : l;
    return `Lot/Batch ${UTS_MAX_LOT_LENGTH} karakterden uzun: ${ozet}`;
  }
  if (s.length > UTS_MAX_SERI_LENGTH) {
    const ozet = s.length > 40 ? `${s.slice(0, 40)}…` : s;
    return `Seri/Sıra ${UTS_MAX_SERI_LENGTH} karakterden uzun: ${ozet}`;
  }
  return null;
}

export function isUtsAlanCokUzun(seriNo?: string | null, lotNo?: string | null): boolean {
  return utsAlanUzunlukHatasi(seriNo, lotNo) !== null;
}

/** TİTCK alanlarından yeniden oluşturulmuş GS1 gösterimi (orijinal ham veri değil). */
export function formatGs1FromUtsFields(uno: string, lotNo?: string | null, seriNo?: string | null): string {
  const gtin = String(uno ?? '').replace(/\D/g, '').padStart(14, '0').slice(-14);
  let out = `01${gtin}`;
  const lot = String(lotNo ?? '').trim();
  const serial = String(seriNo ?? '').trim();
  if (lot) out += `10${lot}`;
  if (serial) out += `21${serial}`;
  return out;
}

export function parseGs1DataMatrix(ham: string): Gs1Parsed | null {
  const raw = normalizeGs1Raw(ham);
  if (!isGs1DataMatrix(raw)) return null;

  let i = 0;
  const result: Partial<Gs1Parsed> = {};

  while (i < raw.length) {
    if (raw[i] === '\x1d') {
      i += 1;
      continue;
    }
    const ai = matchAi(raw, i);
    if (!ai) break;
    i += ai.length;

    const fixedLen = FIXED_LENGTH_AIS[ai];
    if (fixedLen != null) {
      if (i + fixedLen > raw.length) return null;
      const value = raw.slice(i, i + fixedLen);
      i += fixedLen;
      if (ai === '01') {
        result.gtin14 = value;
        result.gtin13 = gtin14ToEan13(value);
      }
      continue;
    }

    if (VARIABLE_AIS.has(ai)) {
      const { value, end } = readVariableField(raw, i, VARIABLE_AI_STOP[ai] ?? [], ai);
      i = end;
      if (ai === '10') result.lot = value;
      else if (ai === '21') result.serial = value;
      else if (ai === '240') result.additional = value;
      continue;
    }

    break;
  }

  if (!result.gtin14 || !result.gtin13) return null;
  return repairGs1ParseWithoutFnc1(raw, result as Gs1Parsed);
}

/** @deprecated alias — transfer kodu uyumluluğu */
export function parseGs1Fields(ham: string): Gs1Parsed | null {
  return parseGs1DataMatrix(ham);
}

export function extractGs1SearchTerm(ham: string, yontem: Gs1SearchYontem): string {
  const trimmed = String(ham ?? '').trim();
  if (!trimmed || !isGs1DataMatrix(trimmed)) return trimmed;
  const parsed = parseGs1DataMatrix(trimmed);
  if (!parsed) return trimmed;

  if (yontem === 'ad') return '';

  if (yontem === 'lot') {
    return parsed.lot ?? parsed.serial ?? trimmed;
  }
  if (yontem === 'ref') {
    return parsed.lot ?? parsed.serial ?? parsed.additional ?? trimmed;
  }
  if (yontem === 'uts') {
    return parsed.gtin14;
  }
  return parsed.gtin13;
}

/** Transfer arama kutusu — ham GS1 stringini yönteme göre kısaltır */
export function normalizeTransferSearchTerm(term: string, yontem: Gs1SearchYontem): string {
  return extractGs1SearchTerm(term, yontem);
}

export function extractGs1LotFromRaw(raw: string): string | null {
  const parsed = parseGs1DataMatrix(raw);
  return parsed?.lot ?? null;
}

export type EnvanterLotFields = {
  lotNo: string;
  utsKodu: string | undefined;
  gs1Parsed: boolean;
};

/**
 * Envanter import UTS Kodu hücresinden stock.lot alanlarını üretir.
 *
 * ÖNEMLİ — Görkem'in netleştirdiği 4 ayrı kavram, KARIŞTIRILMAMALI:
 *  - Barkod: ürün/model seviyesinde, aynı modelin her biriminde aynı (GTIN).
 *  - UTS Kodu (x_uts_kodu): UTS sisteminden/ürün üzerinden gelen TAM HAM kod
 *    (örn. "010868171513022421216211210802101") — parçalanmadan, olduğu gibi
 *    saklanır. Bu kodun İÇİNDE üreticinin kendi seri/lot bilgisi de var, ama
 *    o bizim ilgilendiğimiz bir şey değil — TİTCK/üretici tarafının bilgisi.
 *  - Odoo Lot/Seri (stock.lot.name): TAMAMEN bizim kendi depo giriş takip
 *    numaramız (GRS-tarih-EXC{aktarım}-{satır} formatında, faturayla girişte
 *    zaten kullanılan girisNo mantığının Excel karşılığı) — UTS kodunun
 *    içindeki üretici seri numarasıYLA HİÇBİR İLGİSİ YOK, ondan asla
 *    türetilmez.
 *
 * Önceki hatalı davranış: UTS Kodu hücresi GS1 formatlıysa içinden seri/lot
 * çıkarılıp bunlar hem Odoo Lot/Seri (name) hem de kısaltılmış UTS Kodu
 * (sadece GTIN) olarak yazılıyordu — bu hem UTS'nin tam halini kaybediyor
 * hem de üretici serisini bizim kendi takip numaramızla karıştırıyordu.
 */
export function resolveEnvanterLotFields(
  utsKoduRaw: string,
  barkod: string,
  manualLotNo: string | undefined,
  otomatikLotNo: string,
): EnvanterLotFields {
  const trimmedUts = utsKoduRaw?.trim() ?? '';
  const trimmedManuel = manualLotNo?.trim() ?? '';
  const lotNo = trimmedManuel || otomatikLotNo;

  return {
    lotNo,
    utsKodu: trimmedUts || undefined,
    gs1Parsed: false,
  };
}
