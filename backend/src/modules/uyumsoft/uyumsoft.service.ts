import * as soap from 'soap';

const WSDL_URL = 'http://efatura.uyumsoft.com.tr/Services/BasicIntegration?wsdl';
const USERNAME = process.env.UYUMSOFT_USERNAME ?? 'NejlaGumuskesen_WebServis';
const PASSWORD = process.env.UYUMSOFT_PASSWORD ?? '36uOz3Jn';
const GONDEREN_BIRIM = process.env.UYUMSOFT_GONDEREN_BIRIM ??
  'urn:mail:defaultgb@guvenoptik.com';

const USER_INFO = {
  attributes: {
    Username: USERNAME,
    Password: PASSWORD,
  },
};

let client: soap.Client | null = null;

async function getClient(): Promise<soap.Client> {
  if (client) return client;
  client = await soap.createClientAsync(WSDL_URL, {
    wsdl_headers: {
      Authorization: 'Basic ' + Buffer.from(
        `${USERNAME}:${PASSWORD}`,
      ).toString('base64'),
    },
  });
  client.setSecurity(
    new soap.BasicAuthSecurity(USERNAME, PASSWORD),
  );
  return client;
}

export async function testConnection(): Promise<unknown> {
  const c = await getClient();
  const [result] = await c.TestConnectionAsync({
    userInfo: USER_INFO,
  });
  return result;
}

export async function getSystemDate(): Promise<string> {
  const c = await getClient();
  const [result] = await c.GetSystemDateAsync({
    userInfo: USER_INFO,
  });
  return result?.GetSystemDateResult ?? '';
}

export async function isEInvoiceUser(
  vknTckn: string,
): Promise<boolean> {
  const c = await getClient();
  const [result] = await c.IsEInvoiceUserAsync({
    userInfo: USER_INFO,
    vknTckn,
  });
  return result?.IsEInvoiceUserResult === true;
}

export async function getUserAliasses(vknTckn: string): Promise<unknown> {
  const c = await getClient();
  const [result] = await c.GetUserAliassesAsync({
    userInfo: USER_INFO,
    vknTckn,
  });
  return result;
}

export async function getAccessToken(): Promise<string> {
  const c = await getClient();
  const [result] = await c.GetAccessTokenAsync({
    userInfo: USER_INFO,
    request: {
      UserName: USERNAME,
      Password: PASSWORD,
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
  request: SendInvoiceRequest,
): Promise<SendInvoiceResult | undefined> {
  const c = await getClient();

  const payload = {
    userInfo: USER_INFO,
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

function parseInboxListItem(raw: Record<string, unknown>): InboxInvoiceListItem {
  return {
    invoiceId: String(raw.InvoiceId ?? ''),
    documentId: String(raw.DocumentId ?? ''),
    supplierVkn: '',
    supplierTitle: '',
    status: String(raw.Status ?? ''),
    isNew: raw.IsNew === true || raw.IsNew === 'true',
    isSeen: raw.IsSeen === true || raw.IsSeen === 'true',
    issueDate: raw.ExecutionDate ? String(raw.ExecutionDate).slice(0, 10) : undefined,
    payableAmount: Number(raw.PayableAmount ?? 0),
    taxExclusiveAmount: Number(raw.TaxExclusiveAmount ?? 0),
    currency: String(raw.DocumentCurrencyCode ?? 'TRY'),
    createDateUtc: raw.CreateDateUtc ? String(raw.CreateDateUtc) : undefined,
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

  return {
    documentId: String(ublAlanOku(inv.UUID) || ''),
    invoiceNo: String(ublAlanOku(inv.ID) || ''),
    issueDate: String(ublAlanOku(inv.IssueDate) || '').slice(0, 10),
    supplierVkn: supplier.vkn,
    supplierTitle: supplier.name,
    supplier,
    taxExclusiveAmount: Number(ublAlanOku(monetary?.TaxExclusiveAmount) || 0),
    payableAmount: Number(ublAlanOku(monetary?.PayableAmount) || 0),
    currency: String(ublAlanOku(inv.DocumentCurrencyCode) || 'TRY'),
    lines,
    siparisNo,
  };
}

export async function getInboxInvoiceList(query: {
  createStartDate?: Date;
  createEndDate?: Date;
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
  const c = await getClient();
  const start = query.createStartDate ?? new Date(Date.now() - 30 * 86400000);
  const end = query.createEndDate ?? new Date();
  const pageIndex = query.pageIndex ?? 0;
  const pageSize = query.pageSize ?? 50;

  const [result] = await c.GetInboxInvoiceListAsync({
    userInfo: USER_INFO,
    query: {
      attributes: {
        OnlyNewestInvoices: query.onlyNewest ?? false,
        PageIndex: pageIndex,
        PageSize: pageSize,
      },
      CreateStartDate: start.toISOString(),
      CreateEndDate: end.toISOString(),
      ExecutionStartDate: null,
      ExecutionEndDate: null,
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

export async function getInboxInvoice(documentId: string): Promise<InboxInvoiceDetail | null> {
  const c = await getClient();
  const [result] = await c.GetInboxInvoiceAsync({
    userInfo: USER_INFO,
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

export { getClient, USER_INFO, GONDEREN_BIRIM };
