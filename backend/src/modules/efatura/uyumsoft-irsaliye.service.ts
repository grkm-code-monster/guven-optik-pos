import { randomUUID } from 'crypto';
import * as soap from 'soap';
import { prisma } from '../../database/prisma';
import {
  DEFAULT_SIRKET_ID,
  getCredentialsForSirket,
  type UyumsoftCredentials,
} from '../uyumsoft/uyumsoft.service';

import {
  belgeNoPrefixFromSube,
  belgeNoUret,
  irsaliyeNoUret,
  parseBelgeSiraNo,
} from './belge-no.util';

export { irsaliyeNoUret } from './belge-no.util';

const DESPATCH_WSDL_URL =
  'https://efatura.uyumsoft.com.tr/Services/DespatchIntegration?singleWsdl';

const CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const CAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

const despatchClients = new Map<string, soap.Client>();

const EIRSALIYE_CREDS_KEYS = [
  'uyumsoft_eirsaliye_username',
  'uyumsoft_eirsaliye_password',
  'uyumsoft_eirsaliye_gonderen_birim',
] as const;

/**
 * e-İrsaliye hesabı e-Fatura'dan ayrı olabilir.
 * Önce uyumsoft_eirsaliye_* anahtarlarına bakılır; yoksa e-Fatura kimliğine düşülür.
 */
export async function getDespatchCredentialsForSirket(
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<UyumsoftCredentials & { kaynak: 'eirsaliye' | 'efatura' }> {
  const rows = await prisma.sirketAyar.findMany({
    where: {
      sirketId,
      anahtar: { in: [...EIRSALIYE_CREDS_KEYS] },
    },
  });
  const map = Object.fromEntries(rows.map((r) => [r.anahtar, r.deger?.trim() ?? '']));
  const username = map.uyumsoft_eirsaliye_username;
  const password = map.uyumsoft_eirsaliye_password;

  if (username && password) {
    const efaturaFallback = await getCredentialsForSirket(sirketId).catch(() => null);
    return {
      username,
      password,
      gonderenBirim:
        map.uyumsoft_eirsaliye_gonderen_birim
        || efaturaFallback?.gonderenBirim
        || '',
      kaynak: 'eirsaliye',
    };
  }

  const efatura = await getCredentialsForSirket(sirketId);
  return { ...efatura, kaynak: 'efatura' };
}

export type DespatchPartyInfo = {
  vkn: string;
  idScheme: 'VKN' | 'TCKN';
  unvan: string;
  adres: string;
  il: string;
  ilce: string;
  vergiDairesi?: string;
  telefon?: string;
  email?: string;
};

export type DespatchKalem = {
  sira: number;
  urunAdi: string;
  urunKodu?: string;
  barkod?: string;
  miktar: number;
  birim?: string;
};

export type DespatchAdviceInput = {
  irsaliyeNo: string;
  ettn?: string;
  issueDate: string;
  issueTime: string;
  sevkTarihi: string;
  gonderen: DespatchPartyInfo;
  alici: DespatchPartyInfo;
  kalemler: DespatchKalem[];
  transferRef?: string;
  not?: string;
};

export type SendDespatchInput = DespatchAdviceInput & {
  aliciAlias?: string;
  localDocumentId?: string;
};

export type SendDespatchResult = {
  basarili: boolean;
  irsaliyeId?: string;
  irsaliyeNo?: string;
  ettn?: string;
  mesaj?: string;
  /** Uyumsoft giden kutusu nihai durumu (SendDespatch kabulünden sonra) */
  outboxStatus?: string;
  outboxMesaj?: string;
  /** true = outbox Success/onaylı; false = henüz kesinleşmedi (arka plan kontrolü devam edebilir) */
  outboxOnaylandi?: boolean;
};

export type OutboxDespatchStatusResult = {
  sorgulandi: boolean;
  statusEnum?: string;
  statusCode?: string;
  mesaj?: string;
  nihaiBasarili?: boolean;
};

const PLACEHOLDER_ADDRESS_VALUES = new Set(['-', '—', '']);

export function isMissingPartyAddressField(value?: string): boolean {
  const trimmed = value?.trim() ?? '';
  return !trimmed || PLACEHOLDER_ADDRESS_VALUES.has(trimmed);
}

export class DespatchPartyAddressError extends Error {
  constructor(
    public subeLabel: string,
    public eksikAlanlar: string[],
  ) {
    super(
      `Şube adres/il/ilçe bilgisi eksik (${subeLabel}): ${eksikAlanlar.join(', ')} — e-İrsaliye gönderilemez`,
    );
    this.name = 'DespatchPartyAddressError';
  }
}

export function validateDespatchPartyInfo(party: DespatchPartyInfo, subeLabel: string): void {
  const eksik: string[] = [];
  if (isMissingPartyAddressField(party.adres)) eksik.push('adres');
  if (isMissingPartyAddressField(party.il)) eksik.push('il');
  if (isMissingPartyAddressField(party.ilce)) eksik.push('ilce');
  if (eksik.length) throw new DespatchPartyAddressError(subeLabel, eksik);
}

function isOutboxDespatchSuccess(statusEnum?: string): boolean {
  if (!statusEnum) return false;
  const s = statusEnum.toLowerCase();
  return s === 'success' || s === 'approved' || s === 'sent' || s === 'completed';
}

export function isOutboxDespatchError(statusEnum?: string): boolean {
  if (!statusEnum) return false;
  const s = statusEnum.toLowerCase();
  return s === 'error' || s === 'failed' || s === 'rejected' || s === 'cancelled';
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queryOutboxDespatchStatus(
  ettn: string,
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<OutboxDespatchStatusResult> {
  const client = await getDespatchClient(sirketId);
  try {
    const [result] = await client.QueryOutboxDespatchStatusAsync({
      despatchIds: { string: [ettn] },
    });
    const root = result?.QueryOutboxDespatchStatusResult as {
      attributes?: { IsSucceded?: boolean | string; Message?: string };
      Value?: unknown;
    } | undefined;
    if (!parseUyumsoftBool(root?.attributes?.IsSucceded)) {
      return {
        sorgulandi: false,
        mesaj: String(root?.attributes?.Message ?? 'Outbox durum sorgusu başarısız'),
      };
    }
    const items = root?.Value;
    const first = Array.isArray(items) ? items[0] : items;
    const attrs = (first as { attributes?: Record<string, string> })?.attributes ?? {};
    const statusEnum = attrs.StatusEnum ?? attrs.statusEnum;
    const mesaj = attrs.Message ?? attrs.message;
    const statusCode = attrs.StatusCode ?? attrs.statusCode;
    return {
      sorgulandi: true,
      statusEnum,
      statusCode,
      mesaj,
      nihaiBasarili: isOutboxDespatchSuccess(statusEnum),
    };
  } catch (err) {
    return {
      sorgulandi: false,
      mesaj: err instanceof Error ? err.message : String(err),
    };
  }
}

const OUTBOX_POLL_DELAYS_MS = [6000, 10000, 20000];

export async function pollOutboxDespatchStatus(
  ettn: string,
  sirketId: string = DEFAULT_SIRKET_ID,
  delaysMs: number[] = OUTBOX_POLL_DELAYS_MS,
): Promise<OutboxDespatchStatusResult> {
  let last: OutboxDespatchStatusResult = { sorgulandi: false };
  for (const delay of delaysMs) {
    await sleepMs(delay);
    last = await queryOutboxDespatchStatus(ettn, sirketId);
    if (!last.sorgulandi) continue;
    if (isOutboxDespatchError(last.statusEnum)) return last;
    if (last.nihaiBasarili) return last;
  }
  return last;
}

type OutboxRecheckCallback = (status: OutboxDespatchStatusResult) => void | Promise<void>;

const pendingOutboxRechecks = new Set<string>();

/** İlk poll kesin sonuç vermezse arka planda tekrar kontrol et */
export function scheduleDespatchOutboxRecheck(
  ettn: string,
  sirketId: string,
  onFinal: OutboxRecheckCallback,
  delaysMs: number[] = [60000, 120000],
): void {
  if (pendingOutboxRechecks.has(ettn)) return;
  pendingOutboxRechecks.add(ettn);
  setTimeout(async () => {
    try {
      const status = await pollOutboxDespatchStatus(ettn, sirketId, delaysMs);
      await onFinal(status);
    } catch (err) {
      console.warn('[Uyumsoft] Outbox recheck hatası:', err instanceof Error ? err.message : err);
    } finally {
      pendingOutboxRechecks.delete(ettn);
    }
  }, 0);
}

function parseUyumsoftBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function parseDateResponse(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const attrs = (obj.attributes ?? obj) as Record<string, unknown>;
  if (attrs.Value != null) return String(attrs.Value);
  if (obj.Value != null) return String(obj.Value);
  return '';
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toTrUpper(text: string): string {
  return text.toLocaleUpperCase('tr-TR');
}

function postalZoneForParty(party: DespatchPartyInfo): string {
  const ilce = party.ilce?.trim().toLocaleUpperCase('tr-TR');
  if (ilce === 'MİLAS' || ilce === 'MILAS') return '48200';
  if (ilce === 'MENTEŞE' || ilce === 'MENTESE') return '48000';
  if (ilce === 'BORNOVA') return '35040';
  const il = party.il?.trim().toLocaleUpperCase('tr-TR');
  if (il === 'MUĞLA' || il === 'MUGLA') return '48000';
  if (il === 'İZMİR' || il === 'IZMIR') return '35000';
  return '35000';
}

function partyIdScheme(vkn: string): 'VKN' | 'TCKN' {
  return vkn.replace(/\D/g, '').length === 11 ? 'TCKN' : 'VKN';
}

function xmlWithoutDeclaration(xml: string): string {
  return xml.replace(/^<\?xml[^>]*\?>\s*/i, '');
}

function ublToUyumsoftDespatchContent(xml: string): string {
  let body = xmlWithoutDeclaration(xml);
  body = body.replace(/^<DespatchAdvice\b[^>]*>/i, '').replace(/<\/DespatchAdvice>\s*$/i, '');

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

function buildPartyXml(party: DespatchPartyInfo, tag: 'DespatchSupplierParty' | 'DeliveryCustomerParty'): string {
  const scheme = party.idScheme ?? partyIdScheme(party.vkn);
  const isTckn = scheme === 'TCKN';
  const nameXml = isTckn
    ? `<cac:Person>
        <cbc:FirstName>${escapeXML(toTrUpper(party.unvan.split(/\s+/)[0] ?? party.unvan))}</cbc:FirstName>
        <cbc:FamilyName>${escapeXML(toTrUpper(party.unvan.split(/\s+/).slice(1).join(' ') || party.unvan))}</cbc:FamilyName>
      </cac:Person>`
    : `<cac:PartyName>
        <cbc:Name>${escapeXML(toTrUpper(party.unvan))}</cbc:Name>
      </cac:PartyName>`;

  const vergiDairesiXml = party.vergiDairesi
    ? `<cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXML(party.vergiDairesi)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
    : '';

  const partyLegalEntityXml = isTckn
    ? ''
    : `<cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXML(toTrUpper(party.unvan))}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="${scheme}">${escapeXML(party.vkn.replace(/\D/g, ''))}</cbc:CompanyID>
      </cac:PartyLegalEntity>`;

  return `
  <cac:${tag}>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${scheme}">${escapeXML(party.vkn.replace(/\D/g, ''))}</cbc:ID>
      </cac:PartyIdentification>
      ${nameXml}
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXML(party.adres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXML(party.ilce)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(party.il)}</cbc:CityName>
        <cbc:PostalZone>${postalZoneForParty(party)}</cbc:PostalZone>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      ${vergiDairesiXml}
      ${partyLegalEntityXml}
      <cac:Contact>
        ${party.telefon ? `<cbc:Telephone>${escapeXML(party.telefon)}</cbc:Telephone>` : ''}
        ${party.email ? `<cbc:ElectronicMail>${escapeXML(party.email)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>
    </cac:Party>
  </cac:${tag}>`;
}

export function normalizePartyVkn(vkn: string): string {
  return vkn.replace(/\D/g, '');
}

/** Aynı VKN/TCKN — şirket içi şube transferi; GİB e-İrsaliye 1195 reddeder */
export function isSameDespatchLegalEntity(a: DespatchPartyInfo, b: DespatchPartyInfo): boolean {
  const av = normalizePartyVkn(a.vkn);
  const bv = normalizePartyVkn(b.vkn);
  return av.length > 0 && av === bv;
}

export function buildDespatchAdviceUbl(input: DespatchAdviceInput): string {
  const ettn = (input.ettn ?? randomUUID()).toUpperCase();
  const notXml = input.not ? `<cbc:Note>${escapeXML(input.not)}</cbc:Note>` : '';
  const transferNot = input.transferRef
    ? `<cbc:Note>${escapeXML(`Transfer ref: ${input.transferRef}`)}</cbc:Note>`
    : '';

  const kalemXml = input.kalemler.map((k) => {
    const birim = k.birim || 'C62';
    const kod = k.urunKodu || k.barkod || String(k.sira);
    const barkodXml = k.barkod
      ? `<cac:StandardItemIdentification>
          <cbc:ID schemeID="GTIN">${escapeXML(k.barkod)}</cbc:ID>
        </cac:StandardItemIdentification>`
      : '';
    return `
  <cac:DespatchLine>
    <cbc:ID>${k.sira}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${birim}">${k.miktar}</cbc:DeliveredQuantity>
    <cac:OrderLineReference>
      <cbc:LineID>${k.sira}</cbc:LineID>
    </cac:OrderLineReference>
    <cac:Item>
      <cbc:Name>${escapeXML(k.urunAdi)}</cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${escapeXML(kod)}</cbc:ID>
      </cac:SellersItemIdentification>
      ${barkodXml}
    </cac:Item>
  </cac:DespatchLine>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2.1</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>${escapeXML(input.irsaliyeNo)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${input.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${input.issueTime}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  ${notXml}
  ${transferNot}
  <cbc:LineCountNumeric>${input.kalemler.length}</cbc:LineCountNumeric>
  ${buildPartyXml(input.gonderen, 'DespatchSupplierParty')}
  ${buildPartyXml(input.alici, 'DeliveryCustomerParty')}
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cac:Delivery>
      ${buildDeliveryAddressXml(input.alici)}
      <cac:Despatch>
        <cbc:ActualDespatchDate>${input.sevkTarihi}</cbc:ActualDespatchDate>
      </cac:Despatch>
      ${buildCarrierPartyXml(input.gonderen)}
    </cac:Delivery>
  </cac:Shipment>
  ${kalemXml}
</DespatchAdvice>`;
}

function buildDeliveryAddressXml(party: DespatchPartyInfo): string {
  return `
      <cac:DeliveryAddress>
        <cbc:StreetName>${escapeXML(party.adres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXML(party.ilce)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(party.il)}</cbc:CityName>
        <cbc:PostalZone>${postalZoneForParty(party)}</cbc:PostalZone>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:DeliveryAddress>`;
}

function buildCarrierPartyXml(gonderen: DespatchPartyInfo): string {
  const scheme = gonderen.idScheme ?? partyIdScheme(gonderen.vkn);
  const vkn = gonderen.vkn.replace(/\D/g, '');
  const isTckn = scheme === 'TCKN';
  const nameXml = isTckn
    ? `<cac:Person>
        <cbc:FirstName>${escapeXML(toTrUpper(gonderen.unvan.split(/\s+/)[0] ?? gonderen.unvan))}</cbc:FirstName>
        <cbc:FamilyName>${escapeXML(toTrUpper(gonderen.unvan.split(/\s+/).slice(1).join(' ') || gonderen.unvan))}</cbc:FamilyName>
      </cac:Person>`
    : `<cac:PartyName>
        <cbc:Name>${escapeXML(toTrUpper(gonderen.unvan))}</cbc:Name>
      </cac:PartyName>`;
  return `
      <cac:CarrierParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="${scheme}">${escapeXML(vkn)}</cbc:ID>
        </cac:PartyIdentification>
        ${nameXml}
        <cac:PostalAddress>
          <cbc:StreetName>${escapeXML(gonderen.adres)}</cbc:StreetName>
          <cbc:CitySubdivisionName>${escapeXML(gonderen.ilce)}</cbc:CitySubdivisionName>
          <cbc:CityName>${escapeXML(gonderen.il)}</cbc:CityName>
          <cbc:PostalZone>${postalZoneForParty(gonderen)}</cbc:PostalZone>
          <cac:Country>
            <cbc:Name>Türkiye</cbc:Name>
          </cac:Country>
        </cac:PostalAddress>
      </cac:CarrierParty>`;
}

export async function getDespatchClient(
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<soap.Client> {
  const existing = despatchClients.get(sirketId);
  if (existing) return existing;

  const creds = await getDespatchCredentialsForSirket(sirketId);
  console.log(
    `[uyumsoft-eirsaliye] DespatchClient sirketId=${sirketId} kaynak=${creds.kaynak} user=${creds.username}`,
  );
  const client = await soap.createClientAsync(DESPATCH_WSDL_URL);
  client.setSecurity(new soap.WSSecurity(creds.username, creds.password));
  despatchClients.set(sirketId, client);
  return client;
}

/** Kimlik bilgisi değişince cache'i temizle (admin kaydı sonrası) */
export function clearDespatchClientCache(sirketId?: string): void {
  if (sirketId) despatchClients.delete(sirketId);
  else despatchClients.clear();
}

export async function getDespatchSystemDate(
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<string> {
  const c = await getDespatchClient(sirketId);
  const [result] = await c.GetSystemDateAsync({});
  return parseDateResponse(result?.GetSystemDateResult);
}

export async function verifyDespatchConnection(
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<{ yontem: 'GetSystemDate' | 'UserInfoWithNoCheck'; deger: string }> {
  try {
    const tarih = await getDespatchSystemDate(sirketId);
    if (tarih) return { yontem: 'GetSystemDate', deger: tarih };
  } catch {
    // ADESE gibi hesaplarda GetSystemDate yetkisi olmayabilir
  }

  const c = await getDespatchClient(sirketId);
  const [result] = await c.UserInfoWithNoCheckAsync({});
  const value = (result?.UserInfoWithNoCheckResult as { Value?: { User?: { Username?: string } } })?.Value;
  const username = value?.User?.Username ?? '';
  if (!username) {
    throw new Error('DespatchIntegration bağlantısı doğrulanamadı');
  }
  return { yontem: 'UserInfoWithNoCheck', deger: username };
}

export async function isEDespatchUser(
  vknTckn: string,
  alias?: string,
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<boolean> {
  const c = await getDespatchClient(sirketId);
  const payload: { vknTckn: string; alias?: string } = { vknTckn };
  if (alias != null && alias !== '') payload.alias = alias;
  const [result] = await c.IsEDespatchUserAsync(payload);
  const raw = result?.IsEDespatchUserResult;
  if (typeof raw === 'object' && raw && 'attributes' in (raw as object)) {
    const attrs = (raw as { attributes?: Record<string, unknown> }).attributes;
    return parseUyumsoftBool(attrs?.Value ?? attrs?.IsSucceded);
  }
  return parseUyumsoftBool(raw);
}

export async function getUserAliasses(
  vknTckn: string,
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<unknown> {
  const c = await getDespatchClient(sirketId);
  const [result] = await c.GetUserAliassesAsync({ vknTckn });
  return result;
}

const PLACEHOLDER_ALIAS_MARKERS = ['defaultpk', 'default@', 'test@', 'noreply@'];

export function isPlaceholderDespatchAlias(alias?: string): boolean {
  if (!alias?.trim()) return true;
  const local = alias.replace(/^urn:mail:/i, '').trim().toLowerCase();
  return PLACEHOLDER_ALIAS_MARKERS.some((m) => local.includes(m));
}

/** Uyumsoft'a gönderilecek geçerli e-İrsaliye alias — placeholder/default değerleri eler */
export function sanitizeDespatchReceiverAlias(alias?: string): string | undefined {
  const trimmed = alias?.trim();
  if (!trimmed?.startsWith('urn:mail:')) return undefined;
  if (isPlaceholderDespatchAlias(trimmed)) return undefined;
  return trimmed;
}

function isAliasRelatedDespatchError(mesaj?: string): boolean {
  const m = (mesaj ?? '').toLowerCase();
  return m.includes('alias') && (m.includes('bulunmuyor') || m.includes('not found') || m.includes('geçersiz'));
}

export function parseDespatchReceiverAlias(aliasResult: unknown): string | undefined {
  const root = aliasResult as {
    GetUserAliassesResult?: {
      Value?: {
        ReceiverboxAliases?: unknown;
        DespatchReceiverboxAliases?: unknown;
      };
    };
  };
  const value = root?.GetUserAliassesResult?.Value;
  // e-İrsaliye için önce DespatchReceiverboxAliases — ReceiverboxAliases'teki defaultpk placeholder olabilir
  const sources = [value?.DespatchReceiverboxAliases, value?.ReceiverboxAliases];

  for (const boxes of sources) {
    const list = Array.isArray(boxes) ? boxes : boxes ? [boxes] : [];
    for (const row of list) {
      const rec = row as { attributes?: { Alias?: string }; Alias?: string };
      const alias = rec.attributes?.Alias ?? rec.Alias;
      const clean = sanitizeDespatchReceiverAlias(alias);
      if (clean) return clean;
    }
  }
  return undefined;
}

function parseSendDespatchResponse(raw: unknown, ettn: string): SendDespatchResult {
  const parsed = raw as {
    SendDespatchResult?: {
      attributes?: { IsSucceded?: boolean | string; Message?: string; ErrorMessage?: string };
      Value?: unknown;
    };
  };
  const result = parsed?.SendDespatchResult;
  const attrs = result?.attributes ?? {};
  const basarili = parseUyumsoftBool(attrs.IsSucceded);
  const mesaj = String(attrs.Message || attrs.ErrorMessage || '');

  const values = result?.Value;
  const first = Array.isArray(values) ? values[0] : values;
  const identity = first as { attributes?: { Id?: string; Number?: string }; Id?: string; Number?: string } | undefined;
  const irsaliyeId = identity?.attributes?.Id ?? identity?.Id;
  const irsaliyeNo = identity?.attributes?.Number ?? identity?.Number;

  return {
    basarili,
    irsaliyeId: irsaliyeId ? String(irsaliyeId) : undefined,
    irsaliyeNo: irsaliyeNo ? String(irsaliyeNo) : undefined,
    ettn,
    mesaj: mesaj || undefined,
  };
}

async function sendDespatchOnce(
  client: Awaited<ReturnType<typeof getDespatchClient>>,
  input: SendDespatchInput,
  ettn: string,
  aliciAlias?: string,
) {
  const xmlContent = buildDespatchAdviceUbl({ ...input, ettn });
  const despatchInfo: Record<string, unknown> = {
    attributes: {
      LocalDocumentId: input.localDocumentId ?? input.irsaliyeNo,
    },
    DespatchAdvice: {
      $xml: ublToUyumsoftDespatchContent(xmlContent),
    },
    TargetCustomer: {
      attributes: {
        VknTckn: input.alici.vkn.replace(/\D/g, ''),
        Title: input.alici.unvan,
        ...(aliciAlias ? { Alias: aliciAlias } : {}),
      },
    },
  };
  const [result] = await client.SendDespatchAsync({
    despatches: {
      DespatchInfo: [despatchInfo],
    },
  });
  return parseSendDespatchResponse(result, ettn);
}

export async function sendDespatch(
  input: SendDespatchInput,
  sirketId: string = DEFAULT_SIRKET_ID,
): Promise<SendDespatchResult> {
  validateDespatchPartyInfo(input.gonderen, 'gönderen');
  validateDespatchPartyInfo(input.alici, 'alıcı');

  const ettn = (input.ettn ?? randomUUID()).toUpperCase();
  const baseInput = { ...input, ettn };
  const client = await getDespatchClient(sirketId);
  const safeAlias = sanitizeDespatchReceiverAlias(input.aliciAlias);

  console.log(
    `[Uyumsoft] SendDespatch sirketId=${sirketId} irsaliyeNo=${input.irsaliyeNo} ettn=${ettn}` +
    (safeAlias ? ` alias=${safeAlias}` : ' alias=(yok)'),
  );

  let parsed = await sendDespatchOnce(client, baseInput, ettn, safeAlias);
  if (!parsed.basarili && safeAlias && isAliasRelatedDespatchError(parsed.mesaj)) {
    console.warn('[Uyumsoft] SendDespatch alias hatası — alias olmadan yeniden denenecek');
    parsed = await sendDespatchOnce(client, baseInput, ettn, undefined);
  }

  if (!parsed.basarili) {
    console.log('[Uyumsoft] SendDespatch hata:', parsed.mesaj);
    return { ...parsed, ettn };
  }

  console.log('[Uyumsoft] SendDespatch kabul edildi', parsed.irsaliyeNo ?? parsed.irsaliyeId);

  const outbox = await pollOutboxDespatchStatus(ettn, sirketId);
  if (outbox.sorgulandi && isOutboxDespatchError(outbox.statusEnum)) {
    const mesaj = outbox.mesaj ?? `Uyumsoft zarf hatası (${outbox.statusEnum})`;
    console.log('[Uyumsoft] SendDespatch outbox hata:', mesaj);
    return {
      basarili: false,
      irsaliyeId: parsed.irsaliyeId ?? ettn,
      irsaliyeNo: parsed.irsaliyeNo,
      ettn,
      mesaj,
      outboxStatus: outbox.statusEnum,
      outboxMesaj: outbox.mesaj,
      outboxOnaylandi: false,
    };
  }

  if (outbox.sorgulandi && outbox.nihaiBasarili) {
    console.log('[Uyumsoft] SendDespatch outbox onaylandı', outbox.statusEnum);
    return {
      ...parsed,
      ettn,
      irsaliyeId: parsed.irsaliyeId ?? ettn,
      outboxStatus: outbox.statusEnum,
      outboxMesaj: outbox.mesaj,
      outboxOnaylandi: true,
    };
  }

  const bekleyenMesaj = outbox.sorgulandi
    ? `Uyumsoft kuyruğunda (${outbox.statusEnum ?? 'bekleniyor'})`
    : 'Uyumsoft kuyruğunda (durum henüz sorgulanamadı)';
  console.log('[Uyumsoft] SendDespatch outbox bekliyor:', bekleyenMesaj);
  return {
    ...parsed,
    ettn,
    irsaliyeId: parsed.irsaliyeId ?? ettn,
    mesaj: parsed.irsaliyeNo ?? parsed.mesaj,
    outboxStatus: outbox.statusEnum,
    outboxMesaj: outbox.mesaj ?? bekleyenMesaj,
    outboxOnaylandi: false,
  };
}

export function isEirsaliyeTransferEnabled(): boolean {
  return process.env.E_IRSALIYE_TRANSFER_ENABLED === 'true';
}

/** e-İrsaliye belge numarası — GİB formatı: 3 seri + 4 yıl + 9 sıra = 16 karakter */
export async function allocateNextIrsaliyeNo(branchCode: string): Promise<string> {
  const code = branchCode.trim().toUpperCase();
  const prefix = belgeNoPrefixFromSube(code);
  let maxSira = 0;

  const rows = await prisma.irsaliye.findMany({
    where: { irsaliyeNo: { startsWith: prefix } },
    select: { irsaliyeNo: true },
  });
  for (const row of rows) {
    const sira = parseBelgeSiraNo(row.irsaliyeNo, prefix);
    if (sira != null && sira > maxSira) maxSira = sira;
  }

  return belgeNoUret(code, maxSira + 1);
}

export async function resolveIrsaliyeNoForTransfer(
  transferRef: string,
  branchCode: string,
): Promise<string> {
  const existing = await prisma.irsaliye.findUnique({
    where: { transferRef },
  });
  if (existing?.irsaliyeNo) return existing.irsaliyeNo;
  return allocateNextIrsaliyeNo(branchCode);
}

export async function saveIrsaliyeKayit(input: {
  irsaliyeNo: string;
  sube: string;
  transferRef: string;
  ettn?: string;
  durum?: string;
}): Promise<void> {
  await prisma.irsaliye.upsert({
    where: { transferRef: input.transferRef },
    create: {
      irsaliyeNo: input.irsaliyeNo,
      sube: input.sube,
      transferRef: input.transferRef,
      ettn: input.ettn,
      durum: input.durum ?? 'GONDERILDI',
    },
    update: {
      irsaliyeNo: input.irsaliyeNo,
      ettn: input.ettn ?? undefined,
      durum: input.durum ?? undefined,
    },
  });
}
