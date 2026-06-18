import * as soap from 'soap';
import { gzipSync } from 'zlib';
import { parseStringPromise, processors } from 'xml2js';

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
  receiverAlias?: string;
  xmlBase64: string;
  xmlContent: string;
}

export interface SendInvoiceResult {
  IsSucceded?: boolean | string;
  IsSucceeded?: boolean | string;
  DocumentId?: string;
  ETTN?: string;
  Message?: string;
  ErrorMessage?: string;
  Value?: {
    attributes?: {
      Id?: string;
      Number?: string;
    };
    Id?: string;
    Number?: string;
  };
  _format?: string;
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

function buildHeader(
  request: SendInvoiceRequest,
  opts: { refField: 'GIBRefNo' | 'LocalReferenceId' },
): Record<string, string | undefined> {
  const header: Record<string, string | undefined> = {
    ETTN: request.ettn,
    InvoiceDate: request.faturaTarihi,
    Scenario: request.profileId,
    InvoiceType: 'SATIS',
    SenderVKN: request.supplierVkn,
    ReceiverVKN: request.aliciVkn,
    ReceiverAlias: request.receiverAlias,
  };
  header[opts.refField] = request.faturaNo;
  return header;
}

function buildInvoiceInfoWSDL(
  request: SendInvoiceRequest,
  invoiceValue: string | { $xml: string } | unknown,
): Record<string, unknown> {
  const scenario = request.profileId === 'TEMELFATURA' ? 'eInvoice' : 'eArchive';
  const invoiceInfo: Record<string, unknown> = {
    Invoice: invoiceValue,
    TargetCustomer: {
      attributes: {
        VknTckn: request.aliciVkn,
        ...(request.receiverAlias ? { Alias: request.receiverAlias } : {}),
      },
    },
    Scenario: scenario,
    CreateDateUtc: new Date().toISOString(),
    attributes: {
      LocalDocumentId: request.faturaNo,
    },
  };
  if (scenario === 'eArchive') {
    invoiceInfo.EArchiveInvoiceInfo = {
      attributes: { DeliveryType: 'Electronic' },
    };
  }
  return invoiceInfo;
}

function xmlWithoutDeclaration(xml: string): string {
  return xml.replace(/^<\?xml[^>]*\?>\s*/i, '');
}

function soapifyValue(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(soapifyValue);

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (key === '$') {
      out.attributes = soapifyValue(val);
      continue;
    }
    if (key === '_') {
      if (Object.keys(out).length === 0) return val;
      out.$value = val;
      continue;
    }
    out[key] = soapifyValue(val);
  }

  return out;
}

async function ublToInvoiceObject(xml: string): Promise<unknown> {
  const parsed = await parseStringPromise(xmlWithoutDeclaration(xml), {
    explicitArray: false,
    attrkey: '$',
    charkey: '_',
    tagNameProcessors: [processors.stripPrefix],
    attrNameProcessors: [processors.stripPrefix],
  });
  const invoice = (parsed as { Invoice?: unknown }).Invoice ?? parsed;
  return soapifyValue(invoice);
}

function buildPayloadVariants(
  request: SendInvoiceRequest,
  invoiceObject?: unknown,
): Array<{ format: string; invoices: unknown }> {
  const headerGib = buildHeader(request, { refField: 'GIBRefNo' });
  const headerLocal = buildHeader(request, { refField: 'LocalReferenceId' });
  const xmlBody = xmlWithoutDeclaration(request.xmlContent);

  const variants: Array<{ format: string; invoices: unknown }> = [];

  if (invoiceObject) {
    variants.push({
      format: 'InvoiceInfo(WSDL)+parsedInvoice',
      invoices: {
        InvoiceInfo: [buildInvoiceInfoWSDL(request, invoiceObject)],
      },
    });
  }

  variants.push(
    {
      format: 'Invoice.Header+Content',
      invoices: {
        Invoice: [{ Header: headerGib, Content: request.xmlBase64 }],
      },
    },
    {
      format: 'Invoice.Header+XMLContent',
      invoices: {
        Invoice: [{ Header: headerGib, XMLContent: request.xmlBase64 }],
      },
    },
    {
      format: 'Invoice.Header(LocalReferenceId)+Content',
      invoices: {
        Invoice: [{ Header: headerLocal, Content: request.xmlBase64 }],
      },
    },
    {
      format: 'Invoice.Header(LocalReferenceId)+XMLContent',
      invoices: {
        Invoice: [{ Header: headerLocal, XMLContent: request.xmlBase64 }],
      },
    },
    {
      format: 'InvoiceInfo(WSDL)+xml',
      invoices: {
        InvoiceInfo: [buildInvoiceInfoWSDL(request, request.xmlContent)],
      },
    },
    {
      format: 'InvoiceInfo(WSDL)+xmlNoDecl',
      invoices: {
        InvoiceInfo: [buildInvoiceInfoWSDL(request, xmlBody)],
      },
    },
    {
      format: 'InvoiceInfo(WSDL)+xmlBase64',
      invoices: {
        InvoiceInfo: [buildInvoiceInfoWSDL(request, request.xmlBase64)],
      },
    },
    {
      format: 'InvoiceInfo(WSDL)+$xml',
      invoices: {
        InvoiceInfo: [buildInvoiceInfoWSDL(request, { $xml: xmlBody })],
      },
    },
  );

  return variants;
}

async function tryCompressedSendInvoice(
  c: soap.Client,
  request: SendInvoiceRequest,
): Promise<SendInvoiceResult | undefined> {
  const gzipped = gzipSync(Buffer.from(request.xmlContent, 'utf8'));
  const [result] = await c.CompressedSendInvoiceAsync({
    userInfo: USER_INFO,
    data: {
      Data: gzipped.toString('base64'),
      Hash: '',
    },
  });
  const parsed = parseSendInvoiceResult(result?.CompressedSendInvoiceResult);
  if (parsed) parsed._format = 'CompressedSendInvoice(gzip)';
  return parsed;
}

export async function sendInvoice(
  request: SendInvoiceRequest,
): Promise<SendInvoiceResult | undefined> {
  const c = await getClient();
  let invoiceObject: unknown;
  try {
    invoiceObject = await ublToInvoiceObject(request.xmlContent);
  } catch (err) {
    console.log('[Uyumsoft] UBL parse hatası:', err instanceof Error ? err.message : err);
  }
  const variants = buildPayloadVariants(request, invoiceObject);
  let lastResult: SendInvoiceResult | undefined;

  for (const variant of variants) {
    try {
      const [result] = await c.SendInvoiceAsync({
        userInfo: USER_INFO,
        invoices: variant.invoices,
      });
      const parsed = parseSendInvoiceResult(result?.SendInvoiceResult);
      if (parsed) {
        parsed._format = variant.format;
        lastResult = parsed;
        if (isSoapSuccess(parsed)) {
          console.log(`[Uyumsoft] SendInvoice başarılı: ${variant.format}`);
          return parsed;
        }
        const msg = parsed.Message || parsed.ErrorMessage || '';
        console.log(`[Uyumsoft] SendInvoice deneme (${variant.format}): ${msg || JSON.stringify(parsed)}`);
        if (msg.includes('InternalServiceFault') || msg.includes('deserializing')) {
          continue;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[Uyumsoft] SendInvoice hata (${variant.format}):`, message.slice(0, 200));
      lastResult = { IsSucceded: false, Message: message, _format: variant.format };
    }
  }

  try {
    const compressed = await tryCompressedSendInvoice(c, request);
    if (compressed) {
      lastResult = compressed;
      if (isSoapSuccess(compressed)) {
        console.log('[Uyumsoft] CompressedSendInvoice başarılı');
        return compressed;
      }
      console.log(
        '[Uyumsoft] CompressedSendInvoice:',
        compressed.Message || compressed.ErrorMessage || JSON.stringify(compressed),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[Uyumsoft] CompressedSendInvoice hata:', message.slice(0, 200));
    lastResult = { IsSucceded: false, Message: message, _format: 'CompressedSendInvoice' };
  }

  return lastResult;
}

export { getClient, USER_INFO, GONDEREN_BIRIM };
