import * as soap from 'soap';
import { prisma } from '../../database/prisma';

const WSDL_URL = 'http://efatura.uyumsoft.com.tr/Services/BasicIntegration?wsdl';

export const DEFAULT_SIRKET_ID = 'ng';

export interface UyumsoftCredentials {
  username: string;
  password: string;
  gonderenBirim: string;
}

export async function getCredentialsForSirket(sirketId: string): Promise<UyumsoftCredentials> {
  const rows = await prisma.sirketAyar.findMany({
    where: {
      sirketId,
      anahtar: { in: ['uyumsoft_username', 'uyumsoft_password', 'uyumsoft_gonderen_birim'] },
    },
  });
  const map = Object.fromEntries(rows.map((r) => [r.anahtar, r.deger]));
  return {
    username: map.uyumsoft_username || process.env.UYUMSOFT_USERNAME || (() => {
      throw new Error('UYUMSOFT_USERNAME tanımlı değil');
    })(),
    password: map.uyumsoft_password || process.env.UYUMSOFT_PASSWORD || (() => {
      throw new Error('UYUMSOFT_PASSWORD tanımlı değil');
    })(),
    gonderenBirim: map.uyumsoft_gonderen_birim || process.env.UYUMSOFT_GONDEREN_BIRIM || (() => {
      throw new Error('UYUMSOFT_GONDEREN_BIRIM tanımlı değil');
    })(),
  };
}

function buildUserInfo(creds: Pick<UyumsoftCredentials, 'username' | 'password'>) {
  return {
    attributes: {
      Username: creds.username,
      Password: creds.password,
    },
  };
}

const clients = new Map<string, soap.Client>();

export async function getClient(sirketId: string = DEFAULT_SIRKET_ID): Promise<soap.Client> {
  const existing = clients.get(sirketId);
  if (existing) return existing;

  const creds = await getCredentialsForSirket(sirketId);
  const client = await soap.createClientAsync(WSDL_URL, {
    wsdl_headers: {
      Authorization: 'Basic ' + Buffer.from(
        `${creds.username}:${creds.password}`,
      ).toString('base64'),
    },
  });
  client.setSecurity(
    new soap.BasicAuthSecurity(creds.username, creds.password),
  );
  clients.set(sirketId, client);
  return client;
}

/** Kimlik bilgisi değişince cache'i temizleyin (yeni client bir sonraki istekte oluşur) */
export function clearUyumsoftClientCache(sirketId?: string): void {
  if (sirketId) clients.delete(sirketId);
  else clients.clear();
}

export async function testConnection(sirketId: string = DEFAULT_SIRKET_ID): Promise<unknown> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  const [result] = await c.TestConnectionAsync({
    userInfo: buildUserInfo(creds),
  });
  return result;
}

export async function getSystemDate(sirketId: string = DEFAULT_SIRKET_ID): Promise<string> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  const [result] = await c.GetSystemDateAsync({
    userInfo: buildUserInfo(creds),
  });
  return result?.GetSystemDateResult ?? '';
}

/** node-soap: `<IsEInvoiceUserResult IsSucceded="true" Value="true"/>` → `{ attributes: { ... } }` */
function parseIsEInvoiceUserResult(raw: unknown): boolean {
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  if (raw && typeof raw === 'object') {
    const attrs =
      (raw as { attributes?: Record<string, unknown> }).attributes
      ?? (raw as Record<string, unknown>);
    const succeeded = attrs.IsSucceded;
    if (succeeded === false || succeeded === 'false') {
      const msg = String(attrs.Message || attrs.ErrorMessage || JSON.stringify(attrs));
      throw new Error(`IsEInvoiceUser sorgu başarısız: ${msg}`);
    }
    const value = attrs.Value;
    return value === true || value === 'true';
  }
  return false;
}

export async function isEInvoiceUser(
  vknTckn: string,
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<boolean> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  const [result] = await c.IsEInvoiceUserAsync({
    userInfo: buildUserInfo(creds),
    vknTckn,
  });
  return parseIsEInvoiceUserResult(result?.IsEInvoiceUserResult);
}

export async function getUserAliasses(
  vknTckn: string,
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<unknown> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  const [result] = await c.GetUserAliassesAsync({
    userInfo: buildUserInfo(creds),
    vknTckn,
  });
  return result;
}

export async function getAccessToken(sirketId: string = DEFAULT_SIRKET_ID): Promise<string> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  const [result] = await c.GetAccessTokenAsync({
    userInfo: buildUserInfo(creds),
    request: {
      UserName: creds.username,
      Password: creds.password,
    },
  });
  return result?.GetAccessTokenResult?.Token ?? '';
}

export interface SendInvoiceRequest {
  faturaNo: string;
  ettn: string;
  faturaTarihi: string;
  profileId: 'TEMELFATURA' | 'EARSIVFATURA';
  supplierVkn: string;
  aliciVkn: string;
  aliciAdi?: string;
  receiverAlias?: string;
  xmlContent: string;
}

export interface SendInvoiceResult {
  IsSucceded?: boolean | string;
  IsSucceeded?: boolean | string;
  DocumentId?: string;
  ETTN?: string;
  Message?: string;
  ErrorMessage?: string;
  Value?: Array<{
    attributes?: {
      Id?: string;
      Number?: string;
      InvoiceScenario?: string;
    };
    Id?: string;
    Number?: string;
    InvoiceScenario?: string;
  }> | {
    attributes?: {
      Id?: string;
      Number?: string;
      InvoiceScenario?: string;
    };
    Id?: string;
    Number?: string;
    InvoiceScenario?: string;
  };
}

function isSoapSuccess(res?: SendInvoiceResult): boolean {
  return (
    res?.IsSucceded === true ||
    res?.IsSucceeded === true ||
    res?.IsSucceded === 'true' ||
    res?.IsSucceeded === 'true'
  );
}

function parseSendInvoiceResult(raw: unknown): SendInvoiceResult | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const base = ('attributes' in obj ? obj.attributes : obj) as SendInvoiceResult;
  const value = (obj.Value ?? base.Value) as SendInvoiceResult['Value'];
  return { ...base, Value: value };
}

function xmlWithoutDeclaration(xml: string): string {
  return xml.replace(/^<\?xml[^>]*\?>\s*/i, '');
}

const CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const CAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

function ublToUyumsoftInvoiceContent(xml: string): string {
  let body = xmlWithoutDeclaration(xml);
  body = body.replace(/^<Invoice\b[^>]*>/i, '').replace(/<\/Invoice>\s*$/i, '');

  body = body.replace(/<cbc:([\w]+)([^>]*)\/>/g, `<$1 xmlns="${CBC_NS}"$2/>`);
  body = body.replace(/<cbc:([\w]+)([^>]*)>/g, `<$1 xmlns="${CBC_NS}"$2>`);
  body = body.replace(/<\/cbc:([\w]+)>/g, '</$1>');

  body = body.replace(/<cac:([\w]+)([^>]*)\/>/g, `<$1 xmlns="${CAC_NS}"$2/>`);
  body = body.replace(/<cac:([\w]+)([^>]*)>/g, `<$1 xmlns="${CAC_NS}"$2>`);
  body = body.replace(/<\/cac:([\w]+)>/g, '</$1>');

  body = body.replace(/<ext:([\w]+)([^>]*)\/>/g, `<$1 xmlns="${EXT_NS}"$2/>`);
  body = body.replace(/<ext:([\w]+)([^>]*)>/g, `<$1 xmlns="${EXT_NS}"$2>`);
  body = body.replace(/<\/ext:([\w]+)>/g, '</$1>');

  return body.trim();
}

/**
 * Uyumsoft BasicIntegration WSDL — SendInvoice request yapısı:
 * invoices.InvoiceInfo[] içinde Invoice (UBL), TargetCustomer, Scenario, EArchiveInvoiceInfo
 */
function buildInvoiceInfoPayload(request: SendInvoiceRequest): Record<string, unknown> {
  const invoiceInfo: Record<string, unknown> = {
    attributes: {
      LocalDocumentId: request.faturaNo,
    },
    Invoice: {
      $xml: ublToUyumsoftInvoiceContent(request.xmlContent),
    },
    TargetCustomer: {
      attributes: {
        VknTckn: request.aliciVkn,
        Title: request.aliciAdi ?? '',
        ...(request.receiverAlias ? { Alias: request.receiverAlias } : {}),
      },
    },
    Scenario: 'Automated',
  };

  if (request.profileId === 'EARSIVFATURA') {
    invoiceInfo.EArchiveInvoiceInfo = {
      attributes: {
        DeliveryType: 'Electronic',
      },
    };
  }

  return invoiceInfo;
}

export async function sendInvoice(
  sirketId: string,
  request: SendInvoiceRequest,
): Promise<SendInvoiceResult | undefined> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);

  console.log(`[Uyumsoft] SendInvoice sirketId=${sirketId} username=${creds.username}`);

  const payload = {
    userInfo: buildUserInfo(creds),
    invoices: {
      InvoiceInfo: [buildInvoiceInfoPayload(request)],
    },
  };

  const [result] = await c.SendInvoiceAsync(payload);
  const parsed = parseSendInvoiceResult(result?.SendInvoiceResult);

  if (parsed && isSoapSuccess(parsed)) {
    console.log('[Uyumsoft] SendInvoice başarılı');
    return parsed;
  }

  const msg = parsed?.Message || parsed?.ErrorMessage || JSON.stringify(parsed);
  console.log('[Uyumsoft] SendInvoice hata:', msg);
  return parsed;
}

export type OutboxInvoiceStatusResult = {
  sorgulandi: boolean;
  statusEnum?: string;
  statusCode?: string;
  mesaj?: string;
  nihaiBasarili?: boolean;
};

function parseSoapBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function isOutboxInvoiceSuccess(statusEnum?: string): boolean {
  if (!statusEnum) return false;
  const s = statusEnum.toLowerCase();
  return s === 'success' || s === 'approved' || s === 'sent' || s === 'completed';
}

export function isOutboxInvoiceError(statusEnum?: string): boolean {
  if (!statusEnum) return false;
  const s = statusEnum.toLowerCase();
  return s === 'error' || s === 'failed' || s === 'rejected' || s === 'cancelled';
}

function parseOutboxStatus(attrs: Record<string, string>): string | undefined {
  return attrs.StatusEnum ?? attrs.statusEnum ?? attrs.Status ?? attrs.status;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queryOutboxInvoiceStatus(
  ettn: string,
  sirketId: string,
): Promise<OutboxInvoiceStatusResult> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  try {
    const [result] = await c.QueryOutboxInvoiceStatusAsync({
      userInfo: buildUserInfo(creds),
      invoiceIds: { string: [ettn] },
    });
    const root = result?.QueryOutboxInvoiceStatusResult as {
      attributes?: { IsSucceded?: boolean | string; Message?: string };
      Value?: unknown;
    } | undefined;
    if (!parseSoapBool(root?.attributes?.IsSucceded)) {
      return {
        sorgulandi: false,
        mesaj: String(root?.attributes?.Message ?? 'Outbox durum sorgusu başarısız'),
      };
    }
    const items = root?.Value;
    const first = Array.isArray(items) ? items[0] : items;
    const attrs = (first as { attributes?: Record<string, string> })?.attributes ?? {};
    const statusEnum = parseOutboxStatus(attrs);
    const mesaj = attrs.Message ?? attrs.message;
    const statusCode = attrs.StatusCode ?? attrs.statusCode;
    return {
      sorgulandi: true,
      statusEnum,
      statusCode,
      mesaj,
      nihaiBasarili: isOutboxInvoiceSuccess(statusEnum),
    };
  } catch (err) {
    return {
      sorgulandi: false,
      mesaj: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function pollOutboxInvoiceStatus(
  ettn: string,
  sirketId: string,
  delaysMs: number[] = [6000, 10000, 20000],
): Promise<OutboxInvoiceStatusResult> {
  let last: OutboxInvoiceStatusResult = { sorgulandi: false };
  for (const delay of delaysMs) {
    await sleepMs(delay);
    last = await queryOutboxInvoiceStatus(ettn, sirketId);
    if (!last.sorgulandi) continue;
    if (isOutboxInvoiceError(last.statusEnum)) return last;
    if (last.nihaiBasarili) return last;
  }
  return last;
}

// ── Gelen (inbox) e-fatura ────────────────────────────────────────

export function ublAlanOku(value: unknown): string | number | boolean {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(ublAlanOku).filter(Boolean).join(', ');
  }
  const obj = value as Record<string, unknown>;
  if (obj.$value != null) return String(obj.$value);
  if (obj._ != null) return String(obj._);
  return '';
}

export interface InboxInvoiceListItem {
  invoiceId: string;
  documentId: string;
  supplierVkn: string;
  supplierTitle: string;
  status: string;
  isNew: boolean;
  isSeen: boolean;
  /** Uyumsoft liste API'sinde ExecutionDate — detaydaki IssueDate (fatura düzenleme tarihi) ile aynı olmayabilir. */
  issueDate?: string;
  payableAmount: number;
  taxExclusiveAmount: number;
  currency: string;
  createDateUtc?: string;
}

export interface UyumsoftSupplierParty {
  name: string;
  vkn: string;
  vergiDairesi: string;
  adres: string;
  il: string;
  ilce: string;
  telefon: string;
  email: string;
  tip: 'tuzel' | 'gercek';
}

export function tipFromVkn(vkn: string): 'tuzel' | 'gercek' {
  const digits = vkn.replace(/\D/g, '');
  if (digits.length === 11) return 'gercek';
  return 'tuzel';
}

function parseSupplierParty(party: Record<string, unknown> | undefined): UyumsoftSupplierParty {
  const ids = party?.PartyIdentification;
  const idList = Array.isArray(ids) ? ids : ids ? [ids] : [];
  const vknRow = idList.find((row) => {
    const scheme = (row as Record<string, unknown>)?.ID as Record<string, unknown> | undefined;
    const s = scheme?.attributes as Record<string, string> | undefined;
    return s?.schemeID === 'VKN' || s?.schemeID === 'TCKN';
  }) as Record<string, unknown> | undefined;
  const vkn = String(ublAlanOku(vknRow?.ID) || '').replace(/\D/g, '');

  let name = String(ublAlanOku((party?.PartyName as Record<string, unknown>)?.Name) || '');
  const person = party?.Person as Record<string, unknown> | undefined;
  if (!name && person) {
    name = `${ublAlanOku(person.FirstName)} ${ublAlanOku(person.FamilyName)}`.trim();
  }

  const taxScheme = party?.PartyTaxScheme as Record<string, unknown> | undefined;
  const taxSchemeInner = taxScheme?.TaxScheme as Record<string, unknown> | undefined;
  const vergiDairesi = String(ublAlanOku(taxSchemeInner?.Name) || '');

  const postal = party?.PostalAddress as Record<string, unknown> | undefined;
  const street = String(ublAlanOku(postal?.StreetName) || '');
  const building = String(ublAlanOku(postal?.BuildingNumber) || '');
  const adres = [street, building].filter(Boolean).join(' ').trim();

  const contact = party?.Contact as Record<string, unknown> | undefined;

  return {
    name,
    vkn,
    vergiDairesi,
    adres,
    il: String(ublAlanOku(postal?.CityName) || ''),
    ilce: String(ublAlanOku(postal?.CitySubdivisionName) || ''),
    telefon: String(ublAlanOku(contact?.Telephone) || ''),
    email: String(ublAlanOku(contact?.ElectronicMail) || ''),
    tip: tipFromVkn(vkn),
  };
}

export interface InboxInvoiceDetail {
  documentId: string;
  invoiceNo: string;
  issueDate: string;
  supplierVkn: string;
  supplierTitle: string;
  supplier: UyumsoftSupplierParty;
  taxExclusiveAmount: number;
  payableAmount: number;
  currency: string;
  lines: Array<{
    sira: number;
    stokKodu: string;
    urunAdi: string;
    malzemeHizmet: string;
    barkod: string;
    miktar: number;
    birimFiyat: number;
    kdvOrani: number;
    iskontoOrani: string;
    iskontoTutar: number;
    iskonto: number;
    siparisNo: string;
  }>;
  siparisNo: string;
}

function normalizeUyumsoftDate(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

function parseInboxListItem(raw: Record<string, unknown>): InboxInvoiceListItem {
  return {
    invoiceId: String(raw.InvoiceId ?? ''),
    documentId: String(raw.DocumentId ?? ''),
    supplierVkn: '',
    supplierTitle: '',
    status: String(raw.Status ?? ''),
    isNew: raw.IsNew === true || raw.IsNew === 'true',
    isSeen: raw.IsSeen === true || raw.IsSeen === 'true',
    issueDate: normalizeUyumsoftDate(raw.ExecutionDate),
    payableAmount: Number(raw.PayableAmount ?? 0),
    taxExclusiveAmount: Number(raw.TaxExclusiveAmount ?? 0),
    currency: String(raw.DocumentCurrencyCode ?? 'TRY'),
    createDateUtc: normalizeUyumsoftDate(raw.CreateDateUtc),
  };
}

function parseLineAllowances(
  allowanceRaw: unknown,
  miktar: number,
  birimFiyat: number,
): { iskontoOrani: string; iskontoTutar: number; iskonto: number } {
  const list = Array.isArray(allowanceRaw) ? allowanceRaw : allowanceRaw ? [allowanceRaw] : [];
  const discounts = list.filter((row) => {
    const charge = row as Record<string, unknown>;
    return charge.ChargeIndicator === false || charge.ChargeIndicator === 'false';
  });

  if (!discounts.length) {
    return { iskontoOrani: '', iskontoTutar: 0, iskonto: 0 };
  }

  const oranlar = discounts.map((row) => {
    const mult = Number(ublAlanOku((row as Record<string, unknown>).MultiplierFactorNumeric) || 0);
    return Math.round(mult * 10000) / 100;
  });
  const tutar = discounts.reduce(
    (sum, row) => sum + Number(ublAlanOku((row as Record<string, unknown>).Amount) || 0),
    0,
  );
  const base = miktar * birimFiyat;
  const iskonto = base > 0 ? Math.round((tutar / base) * 10000) / 100 : 0;

  return {
    iskontoOrani: oranlar.map((o) => `${o}%`).join(', '),
    iskontoTutar: tutar,
    iskonto,
  };
}

export function computeLinesTaxExclusiveTotal(
  lines: InboxInvoiceDetail['lines'],
): number {
  return Math.round(
    lines.reduce(
      (acc, l) => acc + l.miktar * l.birimFiyat * (1 - (l.iskonto || 0) / 100),
      0,
    ) * 100,
  ) / 100;
}

/** UBL başlık toplamı satır toplamından bariz sapıyorsa satır toplamını kullan. */
export function resolveTaxExclusiveAmount(
  headerAmount: number,
  lines: InboxInvoiceDetail['lines'],
): number {
  const fromLines = computeLinesTaxExclusiveTotal(lines);
  if (!lines.length) return headerAmount;
  if (!headerAmount) return fromLines;
  const diff = Math.abs(headerAmount - fromLines);
  if (diff > 1 && (diff / fromLines > 0.01 || headerAmount < fromLines * 0.5)) {
    console.warn(
      `[uyumsoft] TaxExclusiveAmount (${headerAmount}) satır toplamından (${fromLines}) farklı; satır toplamı kullanılıyor.`,
    );
    return fromLines;
  }
  return headerAmount;
}

function parseIssueDateFromInvoice(inv: Record<string, unknown>): string {
  const period = inv.InvoicePeriod as Record<string, unknown> | undefined;
  const delivery = inv.Delivery as Record<string, unknown> | undefined;
  const candidates = [
    ublAlanOku(inv.IssueDate),
    ublAlanOku(inv.TaxPointDate),
    ublAlanOku(period?.StartDate),
    ublAlanOku(period?.EndDate),
    ublAlanOku(delivery?.ActualDeliveryDate),
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }
  return '';
}

function parseInboxInvoiceDetail(value: Record<string, unknown>): InboxInvoiceDetail | null {
  const inv = value.Invoice as Record<string, unknown> | undefined;
  if (!inv) return null;

  const party = (inv.AccountingSupplierParty as Record<string, unknown>)?.Party as
    | Record<string, unknown>
    | undefined;
  const supplier = parseSupplierParty(party);

  const orderRef = inv.OrderReference as Record<string, unknown> | undefined;
  const siparisNo = String(ublAlanOku(orderRef?.ID) || '');

  const rawLines = inv.InvoiceLine;
  const lineArr = Array.isArray(rawLines) ? rawLines : rawLines ? [rawLines] : [];

  const lines = lineArr.map((line, idx) => {
    const row = line as Record<string, unknown>;
    const taxSub = row.TaxTotal as Record<string, unknown> | undefined;
    const sub = taxSub?.TaxSubtotal;
    const subRow = Array.isArray(sub) ? sub[0] : sub;
    const item = row.Item as Record<string, unknown> | undefined;
    const sellersId = item?.SellersItemIdentification as Record<string, unknown> | undefined;
    const standardId = item?.StandardItemIdentification as Record<string, unknown> | undefined;
    const stokKodu = String(ublAlanOku(sellersId?.ID) || ublAlanOku(item?.Name) || '');
    const gtin = String(ublAlanOku(standardId?.ID) || '');
    const miktar = Number(ublAlanOku(row.InvoicedQuantity) || 1);
    const birimFiyat = Number(ublAlanOku((row.Price as Record<string, unknown>)?.PriceAmount) || 0);
    const { iskontoOrani, iskontoTutar, iskonto } = parseLineAllowances(
      row.AllowanceCharge,
      miktar,
      birimFiyat,
    );

    return {
      sira: Number(ublAlanOku(row.ID) || idx + 1),
      stokKodu,
      urunAdi: String(ublAlanOku(item?.Name) || ''),
      malzemeHizmet: String(ublAlanOku(item?.Description) || ''),
      barkod: gtin || stokKodu,
      miktar,
      birimFiyat,
      kdvOrani: Number(ublAlanOku((subRow as Record<string, unknown>)?.Percent) || 20),
      iskontoOrani,
      iskontoTutar,
      iskonto,
      siparisNo,
    };
  });

  const monetary = inv.LegalMonetaryTotal as Record<string, unknown> | undefined;
  const headerTaxExclusive = Number(ublAlanOku(monetary?.TaxExclusiveAmount) || 0);
  const taxExclusiveAmount = resolveTaxExclusiveAmount(headerTaxExclusive, lines);
  const issueRaw = parseIssueDateFromInvoice(inv);

  return {
    documentId: String(ublAlanOku(inv.UUID) || ''),
    invoiceNo: String(ublAlanOku(inv.ID) || ''),
    issueDate: issueRaw,
    supplierVkn: supplier.vkn,
    supplierTitle: supplier.name,
    supplier,
    taxExclusiveAmount,
    payableAmount: Number(ublAlanOku(monetary?.PayableAmount) || 0),
    currency: String(ublAlanOku(inv.DocumentCurrencyCode) || 'TRY'),
    lines,
    siparisNo,
  };
}

export async function getInboxInvoiceList(
  sirketId: string,
  query: {
  createStartDate?: Date;
  createEndDate?: Date;
  executionStartDate?: Date;
  executionEndDate?: Date;
  pageIndex?: number;
  pageSize?: number;
  onlyNewest?: boolean;
  onlyUnread?: boolean;
}): Promise<{
  items: InboxInvoiceListItem[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
}> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  const start = query.createStartDate ?? new Date(Date.now() - 30 * 86400000);
  const end = query.createEndDate ?? new Date();
  const pageIndex = query.pageIndex ?? 0;
  const pageSize = query.pageSize ?? 50;
  const executionStart = query.executionStartDate ?? null;
  const executionEnd = query.executionEndDate ?? null;

  const [result] = await c.GetInboxInvoiceListAsync({
    userInfo: buildUserInfo(creds),
    query: {
      attributes: {
        OnlyNewestInvoices: query.onlyNewest ?? false,
        PageIndex: pageIndex,
        PageSize: pageSize,
      },
      CreateStartDate: start.toISOString(),
      CreateEndDate: end.toISOString(),
      ExecutionStartDate: executionStart ? executionStart.toISOString() : null,
      ExecutionEndDate: executionEnd ? executionEnd.toISOString() : null,
      Status: null,
    },
  });

  const parsed = result?.GetInboxInvoiceListResult as Record<string, unknown> | undefined;
  if (parsed?.IsSucceded === false || parsed?.IsSucceded === 'false') {
    throw new Error(String(parsed.Message || parsed.ErrorMessage || 'Gelen fatura listesi alınamadı'));
  }

  const value = parsed?.Value as Record<string, unknown> | undefined;
  const attrs = (value?.attributes ?? {}) as Record<string, string>;
  const rawItems = value?.Items;
  const items = (Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [])
    .map((item) => parseInboxListItem(item as Record<string, unknown>))
    .filter((item) => {
      if (!query.onlyUnread) return true;
      return item.isNew || !item.isSeen;
    });

  return {
    items,
    totalCount: Number(attrs.TotalCount ?? items.length),
    pageIndex: Number(attrs.PageIndex ?? pageIndex),
    pageSize: Number(attrs.PageSize ?? pageSize),
  };
}

export async function getInboxInvoice(
  sirketId: string,
  documentId: string,
): Promise<InboxInvoiceDetail | null> {
  const creds = await getCredentialsForSirket(sirketId);
  const c = await getClient(sirketId);
  const [result] = await c.GetInboxInvoiceAsync({
    userInfo: buildUserInfo(creds),
    invoiceId: documentId,
  });

  const parsed = result?.GetInboxInvoiceResult as Record<string, unknown> | undefined;
  if (parsed?.IsSucceded === false || parsed?.IsSucceded === 'false') {
    throw new Error(String(parsed.Message || parsed.ErrorMessage || 'Fatura detayı alınamadı'));
  }

  const value = parsed?.Value as Record<string, unknown> | undefined;
  if (!value) return null;
  return parseInboxInvoiceDetail(value);
}

export async function getOutboxInvoicePdf(sirketId: string, invoiceId: string): Promise<string> {
  const creds = await getCredentialsForSirket(sirketId);
  const client = await getClient(sirketId);
  const [result] = await client.GetOutboxInvoicePdfAsync({
    userInfo: buildUserInfo(creds),
    invoiceId,
  });

  const parsed = result?.GetOutboxInvoicePdfResult as Record<string, unknown> | undefined;
  if (parsed?.IsSucceded === false || parsed?.IsSucceded === 'false') {
    const msg = String(parsed.Message || parsed.ErrorMessage || 'PDF alınamadı');
    throw new Error(msg);
  }

  const value = parsed?.Value as Record<string, unknown> | undefined;
  const data = value?.Data ?? (value?.attributes as Record<string, unknown> | undefined)?.Data;
  if (data == null || data === '') {
    throw new Error('PDF alınamadı — Uyumsoft yanıtı boş');
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('base64');
  }
  if (typeof data === 'object' && data !== null && '_' in (data as Record<string, unknown>)) {
    return String((data as Record<string, unknown>)._);
  }
  return String(data);
}
