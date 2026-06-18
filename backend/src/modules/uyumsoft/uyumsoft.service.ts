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

export { getClient, USER_INFO, GONDEREN_BIRIM };
