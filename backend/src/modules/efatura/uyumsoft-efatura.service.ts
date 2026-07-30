import { randomUUID } from 'crypto';
import type { Branch, Customer, Product, Sale, SaleItem } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { ODOO_TAX_CHART_COMPANY_ID, readProductSaleTaxRate } from '../odoo/odoo-tax.util';
import { splitInclusiveVat } from '../sales/sale-tax.util';
import { transferMaliyetHataMesaji, transferMaliyetSatisFiyati, type TransferEFaturaKalem } from '../transfer/transfer-maliyet.util';
import {
  belgeNoPrefixFromSube,
  belgeNoUret,
  parseBelgeSiraNo,
} from './belge-no.util';
import {
  isEInvoiceUser,
  getUserAliasses,
  sendInvoice,
  pollOutboxInvoiceStatus,
  queryOutboxInvoiceStatus,
  isOutboxInvoiceError,
} from '../uyumsoft/uyumsoft.service';

export interface FaturaKalem {
  sira: number;
  urunKodu: string;
  urunAdi: string;
  miktar: number;
  birim: string;
  birimFiyat: number;
  kdvOrani: number;
  iskonto?: number;
}

export interface FaturaData {
  aliciVkn: string;
  aliciAdi: string;
  aliciAdres: string;
  aliciIl: string;
  aliciIlce: string;
  aliciEmail?: string;
  aliciTel?: string;
  aliciVergiDairesi?: string;
  faturaNo: string;
  faturaTarihi: string;
  faturaZamani: string;
  sube: string;
  siparisNo?: string;
  kalemler: FaturaKalem[];
  doviz?: string;
  not?: string;
}

interface SupplierInfo {
  vkn: string;
  idScheme: 'VKN' | 'TCKN';
  unvan: string;
  vergiDairesi: string;
  adres: string;
  il: string;
  ilce: string;
  telefon: string;
  email: string;
}

const NG_VKN = process.env.UYUMSOFT_NG_VKN ?? '23819441406';
const UYUMSOFT_ACCOUNT_VKN = process.env.UYUMSOFT_DEFAULT_VKN ?? NG_VKN;
const UYUMSOFT_SENDER_UNVAN =
  process.env.UYUMSOFT_SENDER_UNVAN ?? 'NEJLA GÜMÜŞKESEN';

const SIRKET_SUBE_MAP: Record<string, string[]> = {
  ADESE: ['GVN1', 'GVN3', 'GVN6', 'GVN8', 'GVN9'],
  // ETICARET: sanal E-Ticaret şubesinin kodu — bu şube üzerinden kesilen tüm
  // e-fatura ve gün sonu belgeleri her zaman NG (Nejla Gümüşkesen) üzerinden gider,
  // hangi fiziksel şubenin stoğu kullanılırsa kullanılsın.
  // GVN7: yeni açılan mağaza, Odoo'da NG şirketine taşındı (test verisi vardı, önemsiz).
  NG: ['GVN2', 'GVN10', 'ANADEPO', 'ETICARET', 'GVN7'],
  POTENTIAL: ['GVN5'],
};

function sirketForSube(sube: string): 'ADESE' | 'NG' | 'POTENTIAL' {
  if (SIRKET_SUBE_MAP.NG.includes(sube)) return 'NG';
  if (SIRKET_SUBE_MAP.POTENTIAL.includes(sube)) return 'POTENTIAL';
  return 'ADESE';
}

export function sirketKoduToAyarId(sirket: 'ADESE' | 'NG' | 'POTENTIAL'): string {
  return sirket.toLowerCase();
}

export function subeToSirketAyarId(sube: string): string {
  return sirketKoduToAyarId(sirketForSube(sube));
}

function supplierIdScheme(vknOrTckn: string): 'VKN' | 'TCKN' {
  return vknOrTckn.replace(/\D/g, '').length === 11 ? 'TCKN' : 'VKN';
}

function buildSupplierInfo(
  vknOrTckn: string,
  unvan: string,
  vergiDairesi: string,
  adres: string,
  il: string,
  ilce: string,
  telefon: string,
  email: string,
): SupplierInfo {
  return {
    vkn: vknOrTckn,
    idScheme: supplierIdScheme(vknOrTckn),
    unvan,
    vergiDairesi,
    adres,
    il,
    ilce,
    telefon,
    email,
  };
}

function getSupplierInfoFallback(sube: string, branch?: Branch | null): SupplierInfo {
  const sirket = sirketForSube(sube);
  const branchVkn = branch?.vkn?.trim() || '';
  const adres = branch?.adres?.trim() || '';
  const il = branch?.il?.trim() || '';
  const ilce = branch?.ilce?.trim() || '';

  if (sirket === 'NG') {
    const vkn = branchVkn || NG_VKN || UYUMSOFT_ACCOUNT_VKN;
    return buildSupplierInfo(
      vkn,
      'NG OPTİK',
      'Konak',
      adres || 'İzmir',
      il || 'İZMİR',
      ilce || 'Konak',
      branch?.telefon ?? '',
      'info@guvenoptik.com',
    );
  }

  if (sirket === 'POTENTIAL') {
    const vkn = branchVkn || process.env.UYUMSOFT_POTENTIAL_VKN || UYUMSOFT_ACCOUNT_VKN;
    return buildSupplierInfo(
      vkn,
      'POTANSİYEL OPTİK',
      'Konak',
      adres || 'İzmir',
      il || 'İZMİR',
      ilce || 'Konak',
      branch?.telefon ?? '',
      'info@guvenoptik.com',
    );
  }

  const vkn = branchVkn || process.env.UYUMSOFT_ADESE_VKN || UYUMSOFT_ACCOUNT_VKN;
  return buildSupplierInfo(
    vkn,
    branchVkn ? 'ADESE OPTİK' : UYUMSOFT_SENDER_UNVAN,
    'Konak',
    adres || 'İzmir',
    il || 'İZMİR',
    ilce || 'Konak',
    branch?.telefon ?? '',
    'info@guvenoptik.com',
  );
}

const SIRKET_BILGI_ANAHTARLARI = [
  'sirket_vkn',
  'sirket_unvan',
  'sirket_adres',
  'sirket_il',
  'sirket_ilce',
  'sirket_vergi_dairesi',
  'sirket_telefon',
  'sirket_eposta',
] as const;

async function loadSirketBilgileri(sirketId: string): Promise<Record<string, string>> {
  const rows = await prisma.sirketAyar.findMany({
    where: {
      sirketId,
      anahtar: { in: [...SIRKET_BILGI_ANAHTARLARI] },
    },
  });
  const map: Record<string, string> = {};
  for (const row of rows) {
    const val = row.deger?.trim();
    if (val) map[row.anahtar] = val;
  }
  return map;
}

function applySirketBilgileri(
  base: SupplierInfo,
  ayarlar: Record<string, string>,
  branch?: Branch | null,
): SupplierInfo {
  const vkn = ayarlar.sirket_vkn?.trim() || base.vkn;
  const branchAdres = branch?.adres?.trim();
  const branchIl = branch?.il?.trim();
  const branchIlce = branch?.ilce?.trim();
  return {
    ...base,
    vkn,
    idScheme: supplierIdScheme(vkn),
    unvan: ayarlar.sirket_unvan || base.unvan,
    adres: branchAdres || ayarlar.sirket_adres || base.adres,
    il: branchIl || ayarlar.sirket_il || base.il,
    ilce: branchIlce || ayarlar.sirket_ilce || base.ilce,
    vergiDairesi: ayarlar.sirket_vergi_dairesi || base.vergiDairesi,
    telefon: ayarlar.sirket_telefon || base.telefon,
    email: ayarlar.sirket_eposta || base.email,
  };
}

export async function getSupplierInfo(sube: string, branch?: Branch | null): Promise<SupplierInfo> {
  const code = sube.trim().toUpperCase();
  const resolvedBranch =
    branch ?? (await prisma.branch.findFirst({ where: { code } }));
  const base = getSupplierInfoFallback(sube, resolvedBranch);
  const ayarlar = await loadSirketBilgileri(subeToSirketAyarId(sube));
  return applySirketBilgileri(base, ayarlar, resolvedBranch);
}

function parseInvoiceReceiverAlias(aliasResult: unknown): string | undefined {
  const root = aliasResult as {
    GetUserAliassesResult?: {
      Value?: { ReceiverboxAliases?: unknown };
      UserAliasses?: unknown;
    };
  };
  const boxes =
    root?.GetUserAliassesResult?.Value?.ReceiverboxAliases
    ?? root?.GetUserAliassesResult?.UserAliasses;
  const list = Array.isArray(boxes) ? boxes : boxes ? [boxes] : [];
  for (const row of list) {
    const rec = row as { attributes?: { Alias?: string; Name?: string }; Alias?: string; Name?: string };
    const alias = rec.attributes?.Alias ?? rec.attributes?.Name ?? rec.Alias ?? rec.Name;
    if (alias?.startsWith('urn:mail:') && !alias.toLowerCase().includes('defaultpk')) {
      return alias;
    }
  }
  return undefined;
}

export async function mukellefiyetSorgula(
  vkn: string,
  sirketId?: string,
): Promise<{
  eFaturaMukellef: boolean;
  alias?: string;
}> {
  const resolvedSirketId = sirketId ?? 'ng';
  try {
    const eFaturaMukellef = await isEInvoiceUser(vkn, resolvedSirketId);
    if (!eFaturaMukellef) {
      return { eFaturaMukellef: false };
    }

    const aliasResult = await getUserAliasses(vkn, resolvedSirketId);
    return {
      eFaturaMukellef: true,
      alias: parseInvoiceReceiverAlias(aliasResult),
    };
  } catch (err) {
    console.error('Mükellef sorgu hatası:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
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

function splitAdSoyad(name: string): { ad: string; soyad: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { ad: 'MÜŞTERİ', soyad: 'MÜŞTERİ' };
  if (parts.length === 1) return { ad: toTrUpper(parts[0]), soyad: toTrUpper(parts[0]) };
  const soyad = parts.pop()!;
  return { ad: toTrUpper(parts.join(' ')), soyad: toTrUpper(soyad) };
}

function buildPartyLegalEntityXml(unvan: string, vkn: string, idScheme: 'VKN' | 'TCKN'): string {
  if (idScheme === 'TCKN') return '';
  const cleanVkn = vkn.replace(/\D/g, '');
  return `
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXML(toTrUpper(unvan))}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="${idScheme}">${escapeXML(cleanVkn)}</cbc:CompanyID>
      </cac:PartyLegalEntity>`;
}

function buildKdvTaxCategoryXml(kdvTutar: number): string {
  const exemptionXml =
    kdvTutar === 0
      ? `<cbc:TaxExemptionReasonCode>351</cbc:TaxExemptionReasonCode>
          <cbc:TaxExemptionReason>Diğer istisna</cbc:TaxExemptionReason>`
      : '';
  return `<cac:TaxCategory>
          ${exemptionXml}
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>`;
}

function buildCustomerPartyXml(data: FaturaData): string {
  const idScheme = data.aliciVkn.replace(/\D/g, '').length === 10 ? 'VKN' : 'TCKN';
  const { ad, soyad } = splitAdSoyad(data.aliciAdi);
  const isTckn = idScheme === 'TCKN';

  const kimlikXML = isTckn
    ? `<cac:Person>
      <cbc:FirstName>${escapeXML(ad)}</cbc:FirstName>
      <cbc:FamilyName>${escapeXML(soyad)}</cbc:FamilyName>
    </cac:Person>`
    : `<cac:PartyName>
      <cbc:Name>${escapeXML(toTrUpper(data.aliciAdi))}</cbc:Name>
    </cac:PartyName>`;

  return `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${idScheme}">${escapeXML(data.aliciVkn)}</cbc:ID>
      </cac:PartyIdentification>
      ${kimlikXML}
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXML(data.aliciAdres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXML(data.aliciIlce)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(data.aliciIl)}</cbc:CityName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      ${
        data.aliciVergiDairesi
          ? `<cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXML(data.aliciVergiDairesi)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ''
      }
      ${buildPartyLegalEntityXml(data.aliciAdi, data.aliciVkn, idScheme)}
      <cac:Contact>
        ${data.aliciTel ? `<cbc:Telephone>${escapeXML(data.aliciTel)}</cbc:Telephone>` : ''}
        ${data.aliciEmail ? `<cbc:ElectronicMail>${escapeXML(data.aliciEmail)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

export function buildUBLXML(
  data: FaturaData,
  profileId: 'TEMELFATURA' | 'EARSIVFATURA',
  supplier?: SupplierInfo,
): string {
  const uuid = randomUUID().toUpperCase();
  const satici = supplier ?? getSupplierInfoFallback(data.sube);

  type KdvGrup = { matrah: number; kdvTutar: number; oran: number };
  const kdvGruplari = new Map<number, KdvGrup>();
  let toplamMalHizmet = 0;
  let toplamIskonto = 0;

  const kalemXMLler = data.kalemler
    .map((k) => {
      const brut = k.miktar * k.birimFiyat;
      const iskontoTutar = k.iskonto ? brut * (k.iskonto / 100) : 0;
      const inclusiveNet = brut - iskontoTutar;
      const { matrah: netTutar, kdvTutar } = splitInclusiveVat(inclusiveNet, k.kdvOrani);

      toplamMalHizmet += netTutar;
      toplamIskonto += iskontoTutar;

      const mevcut = kdvGruplari.get(k.kdvOrani) || {
        matrah: 0,
        kdvTutar: 0,
        oran: k.kdvOrani,
      };
      mevcut.matrah += netTutar;
      mevcut.kdvTutar += kdvTutar;
      kdvGruplari.set(k.kdvOrani, mevcut);

      const iskontoXML = k.iskonto
        ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:MultiplierFactorNumeric>${(k.iskonto / 100).toFixed(4)}</cbc:MultiplierFactorNumeric>
      <cbc:Amount currencyID="${data.doviz || 'TRY'}">${iskontoTutar.toFixed(2)}</cbc:Amount>
      <cbc:BaseAmount currencyID="${data.doviz || 'TRY'}">${brut.toFixed(2)}</cbc:BaseAmount>
    </cac:AllowanceCharge>`
        : '';

      return `
  <cac:InvoiceLine>
    <cbc:ID>${k.sira}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${k.birim}">${k.miktar}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${data.doviz || 'TRY'}">${netTutar.toFixed(2)}</cbc:LineExtensionAmount>
    ${iskontoXML}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${data.doviz || 'TRY'}">${kdvTutar.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.doviz || 'TRY'}">${netTutar.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${data.doviz || 'TRY'}">${kdvTutar.toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${k.kdvOrani}</cbc:Percent>
        ${buildKdvTaxCategoryXml(kdvTutar)}
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXML(k.urunAdi)}</cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${escapeXML(k.urunKodu)}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${data.doviz || 'TRY'}">${k.birimFiyat.toFixed(4)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('');

  let toplamKDV = 0;
  const taxSubtotalXML = Array.from(kdvGruplari.values())
    .map((g) => {
      toplamKDV += g.kdvTutar;
      return `
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${data.doviz || 'TRY'}">${g.matrah.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${data.doviz || 'TRY'}">${g.kdvTutar.toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${g.oran}</cbc:Percent>
        ${buildKdvTaxCategoryXml(g.kdvTutar)}
      </cac:TaxSubtotal>`;
    })
    .join('');

  const toplamVergiDahil = toplamMalHizmet + toplamKDV;
  const siparisXML = data.siparisNo
    ? `
  <cac:OrderReference>
    <cbc:ID>${escapeXML(data.siparisNo)}</cbc:ID>
    <cbc:IssueDate>${data.faturaTarihi}</cbc:IssueDate>
  </cac:OrderReference>`
    : '';
  const notXML = data.not ? `<cbc:Note>${escapeXML(data.not)}</cbc:Note>` : '';

  const { ad: saticiAd, soyad: saticiSoyad } = splitAdSoyad(satici.unvan);
  const saticiKimlikXML =
    satici.idScheme === 'TCKN'
      ? `<cac:Person>
      <cbc:FirstName>${escapeXML(saticiAd)}</cbc:FirstName>
      <cbc:FamilyName>${escapeXML(saticiSoyad)}</cbc:FamilyName>
    </cac:Person>`
      : `<cac:PartyName>
      <cbc:Name>${escapeXML(satici.unvan)}</cbc:Name>
    </cac:PartyName>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${escapeXML(data.faturaNo)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${data.faturaTarihi}</cbc:IssueDate>
  <cbc:IssueTime>${data.faturaZamani}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  ${notXML}
  <cbc:DocumentCurrencyCode>${data.doviz || 'TRY'}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${data.kalemler.length}</cbc:LineCountNumeric>
  ${siparisXML}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:WebsiteURI>https://guvenoptik.com</cbc:WebsiteURI>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${satici.idScheme}">${escapeXML(satici.vkn)}</cbc:ID>
      </cac:PartyIdentification>
      ${saticiKimlikXML}
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXML(satici.adres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXML(satici.ilce)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(satici.il)}</cbc:CityName>
        <cbc:PostalZone>35000</cbc:PostalZone>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXML(satici.vergiDairesi)}</cbc:Name>
          <cbc:TaxTypeCode>VKN</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      ${buildPartyLegalEntityXml(satici.unvan, satici.vkn, satici.idScheme)}
      <cac:Contact>
        ${satici.telefon ? `<cbc:Telephone>${escapeXML(satici.telefon)}</cbc:Telephone>` : ''}
        <cbc:ElectronicMail>${escapeXML(satici.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  ${buildCustomerPartyXml(data)}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${data.doviz || 'TRY'}">${toplamKDV.toFixed(2)}</cbc:TaxAmount>
    ${toplamKDV === 0 ? '' : taxSubtotalXML}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${data.doviz || 'TRY'}">${toplamMalHizmet.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${data.doviz || 'TRY'}">${toplamMalHizmet.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${data.doviz || 'TRY'}">${toplamVergiDahil.toFixed(2)}</cbc:TaxInclusiveAmount>
    ${
      toplamIskonto > 0
        ? `<cbc:AllowanceTotalAmount currencyID="${data.doviz || 'TRY'}">${toplamIskonto.toFixed(2)}</cbc:AllowanceTotalAmount>`
        : ''
    }
    <cbc:PayableAmount currencyID="${data.doviz || 'TRY'}">${toplamVergiDahil.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${kalemXMLler}
</Invoice>`;
}

function isEArsivPermissionDenied(hata: string): boolean {
  const t = hata.toLowerCase();
  return (
    (t.includes('e-arşiv') || t.includes('earsiv'))
    && (t.includes('yetkisi yok') || t.includes('gönderme yetkisi'))
  );
}

/** EARSIV reddi — TEMELFATURA ile yeniden denenebilir (mükellef/alias uyumsuzluğu veya e-Arşiv yetkisi yok) */
function shouldRetryAsTemelFatura(hata: string): boolean {
  const t = hata.toLowerCase();
  if (t.includes('earsivfatura') && t.includes('profileid')) return true;
  return isEArsivPermissionDenied(hata);
}

function parseSendInvoiceSuccess(
  res: Awaited<ReturnType<typeof sendInvoice>>,
  ettn: string,
  faturaNo: string,
  profileId: 'TEMELFATURA' | 'EARSIVFATURA',
): { basarili: true; faturaNo: string; uuid?: string; profileId: string } | null {
  const basarili =
    res?.IsSucceded === true ||
    res?.IsSucceeded === true ||
    res?.IsSucceded === 'true' ||
    res?.IsSucceeded === 'true';
  if (!basarili) return null;
  const value = Array.isArray(res?.Value) ? res?.Value[0] : res?.Value;
  const uuid =
    value?.attributes?.Id ||
    value?.Id ||
    res?.DocumentId ||
    res?.ETTN ||
    ettn;
  return {
    basarili: true,
    faturaNo: value?.attributes?.Number || value?.Number || faturaNo,
    uuid,
    profileId,
  };
}

async function confirmInvoiceOutboxStatus(
  ettn: string,
  sirketId: string,
  ok: { basarili: true; faturaNo: string; uuid?: string; profileId: string },
): Promise<{
  basarili: boolean;
  faturaNo: string;
  uuid?: string;
  profileId?: string;
  hata?: string;
}> {
  const outbox = await pollOutboxInvoiceStatus(ettn, sirketId);
  if (outbox.sorgulandi && isOutboxInvoiceError(outbox.statusEnum)) {
    const hata = outbox.mesaj ?? `Uyumsoft zarf hatası (${outbox.statusEnum})`;
    console.log('[eFaturaGonder] outbox hata:', hata);
    return { basarili: false, faturaNo: ok.faturaNo, profileId: ok.profileId, hata };
  }
  if (outbox.sorgulandi && outbox.nihaiBasarili) {
    console.log('[eFaturaGonder] outbox onaylandı', outbox.statusEnum);
  } else if (outbox.sorgulandi) {
    console.log('[eFaturaGonder] outbox bekliyor:', outbox.statusEnum, outbox.mesaj);
  }
  return ok;
}

export async function eFaturaGonder(
  data: FaturaData,
  branch?: Branch | null,
): Promise<{
  basarili: boolean;
  faturaNo: string;
  uuid?: string;
  profileId?: string;
  hata?: string;
}> {
  const sirketId = subeToSirketAyarId(data.sube);
  let eFaturaMukellef = false;
  let alias: string | undefined;
  try {
    const muk = await mukellefiyetSorgula(data.aliciVkn, sirketId);
    eFaturaMukellef = muk.eFaturaMukellef;
    alias = muk.alias;
  } catch (err) {
    console.error('[eFaturaGonder] mükellefiyet sorgusu başarısız, EARSIV ile denenecek:', err);
  }

  let profileId: 'TEMELFATURA' | 'EARSIVFATURA' = eFaturaMukellef ? 'TEMELFATURA' : 'EARSIVFATURA';
  const supplier = await getSupplierInfo(data.sube, branch);
  let xmlContent = buildUBLXML(data, profileId, supplier);
  const ettn =
    xmlContent.match(/<cbc:UUID>([^<]+)<\/cbc:UUID>/)?.[1] ?? randomUUID().toUpperCase();

  try {
    let res = await sendInvoice(sirketId, {
      faturaNo: data.faturaNo,
      ettn,
      faturaTarihi: data.faturaTarihi,
      profileId,
      supplierVkn: supplier.vkn,
      aliciVkn: data.aliciVkn,
      aliciAdi: data.aliciAdi,
      receiverAlias: profileId === 'TEMELFATURA' && alias ? alias : undefined,
      xmlContent,
    });

    const ok = parseSendInvoiceSuccess(res, ettn, data.faturaNo, profileId);
    if (ok) return confirmInvoiceOutboxStatus(ettn, sirketId, ok);

    let hataMsg = res?.Message || res?.ErrorMessage || JSON.stringify(res) || 'Bilinmeyen hata';

    // Güvenlik ağı: ön sorgu yanlış EARSIV seçtiyse TEMEL + alias ile bir kez daha dene
    if (profileId === 'EARSIVFATURA' && shouldRetryAsTemelFatura(hataMsg)) {
      console.warn(
        `[eFaturaGonder] EARSIV reddi — TEMELFATURA ile yeniden denenecek (VKN=${data.aliciVkn})`,
      );
      profileId = 'TEMELFATURA';
      if (!alias) {
        try {
          alias = parseInvoiceReceiverAlias(await getUserAliasses(data.aliciVkn, sirketId));
        } catch (aliasErr) {
          console.warn('[eFaturaGonder] alias çekilemedi:', aliasErr);
        }
      }
      xmlContent = buildUBLXML(data, profileId, supplier);
      // Aynı ETTN/faturaNo korunur — sadece ProfileID + alias düzeltilir
      const xmlWithSameEttn = xmlContent.replace(
        /<cbc:UUID>[^<]+<\/cbc:UUID>/,
        `<cbc:UUID>${ettn}</cbc:UUID>`,
      );
      res = await sendInvoice(sirketId, {
        faturaNo: data.faturaNo,
        ettn,
        faturaTarihi: data.faturaTarihi,
        profileId,
        supplierVkn: supplier.vkn,
        aliciVkn: data.aliciVkn,
        aliciAdi: data.aliciAdi,
        receiverAlias: alias,
        xmlContent: xmlWithSameEttn,
      });
      const retryOk = parseSendInvoiceSuccess(res, ettn, data.faturaNo, profileId);
      if (retryOk) return confirmInvoiceOutboxStatus(ettn, sirketId, retryOk);
      hataMsg = res?.Message || res?.ErrorMessage || JSON.stringify(res) || hataMsg;
    }

    return {
      basarili: false,
      faturaNo: data.faturaNo,
      profileId,
      hata: hataMsg,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      basarili: false,
      faturaNo: data.faturaNo,
      profileId,
      hata: message,
    };
  }
}

export function faturaNoPrefixFromSube(sube: string, yil = new Date().getFullYear()): string {
  return belgeNoPrefixFromSube(sube, yil);
}

export function faturaNoUret(sube: string, siraNo: number): string {
  return belgeNoUret(sube, siraNo);
}

function parseFaturaSiraNo(faturaNo: string, prefix: string): number | null {
  return parseBelgeSiraNo(faturaNo, prefix);
}

/** DB + kuyruk + Uyumsoft çakışmalarını önlemek için prefix bazlı sıra numarası */
export async function allocateNextFaturaNo(branchCode: string): Promise<string> {
  const code = branchCode.trim().toUpperCase();
  const prefix = faturaNoPrefixFromSube(code);
  let maxSira = 0;

  const faturalar = await prisma.fatura.findMany({
    where: { faturaNo: { startsWith: prefix } },
    select: { faturaNo: true },
  });
  for (const row of faturalar) {
    const sira = parseFaturaSiraNo(row.faturaNo, prefix);
    if (sira != null && sira > maxSira) maxSira = sira;
  }

  const kuyruklar = await prisma.faturaKuyruk.findMany({
    where: {
      faturaNo: { startsWith: prefix },
      durum: { in: ['BEKLIYOR', 'GONDERILDI'] },
    },
    select: { faturaNo: true },
  });
  for (const row of kuyruklar) {
    const sira = parseFaturaSiraNo(row.faturaNo, prefix);
    if (sira != null && sira > maxSira) maxSira = sira;
  }

  return faturaNoUret(code, maxSira + 1);
}

export function isDuplicateFaturaNoError(hata?: string): boolean {
  const m = (hata ?? '').toLowerCase();
  return m.includes('11603') || (m.includes('fatura numarası') && m.includes('daha önce kullanılmış'));
}

async function reallocateFaturaDataNo(faturaData: FaturaData): Promise<FaturaData> {
  const yeniNo = await allocateNextFaturaNo(faturaData.sube);
  if (yeniNo === faturaData.faturaNo) return faturaData;
  return { ...faturaData, faturaNo: yeniNo };
}

type SaleWithItems = Sale & {
  items: (SaleItem & { product: Product | null })[];
  customer: Customer;
};

export async function satistenFaturaData(
  satis: SaleWithItems,
  faturaNo: string,
  branchCode: string,
  branch?: Pick<Branch, 'adres' | 'il' | 'ilce'> | null,
): Promise<FaturaData> {
  const simdi = new Date();
  const tarih = simdi.toISOString().split('T')[0];
  const zaman = simdi.toTimeString().split(' ')[0];

  const kalemler: FaturaKalem[] = [];
  for (let i = 0; i < satis.items.length; i++) {
    const item = satis.items[i];
    const brut = Number(item.unitPrice) * item.qty;
    const discountPct =
      brut > 0 ? Math.min(100, (Number(item.discount) / brut) * 100) : undefined;

    let kdvOrani = 20;
    if (item.odooProductId) {
      const pid = parseInt(item.odooProductId, 10);
      if (Number.isFinite(pid)) {
        kdvOrani = await readProductSaleTaxRate(pid, ODOO_TAX_CHART_COMPANY_ID);
      }
    } else if (item.product?.taxRate != null && Number(item.product.taxRate) > 0) {
      kdvOrani = Number(item.product.taxRate);
    }

    kalemler.push({
      sira: i + 1,
      urunKodu: item.odooProductId || item.product?.barcode || `URUN${i + 1}`,
      urunAdi: item.odooProductName || item.product?.name || 'Ürün',
      miktar: item.qty,
      birim: 'C62',
      birimFiyat: Number(item.unitPrice),
      kdvOrani,
      iskonto: discountPct && discountPct > 0 ? discountPct : undefined,
    });
  }

  const identity = satis.customer.identityNo?.trim() || '11111111111';
  const aliciAdres = satis.customer.adres?.trim() || branch?.adres?.trim() || '-';
  const aliciIl = satis.customer.il?.trim() || branch?.il?.trim() || 'İZMİR';
  const aliciIlce = satis.customer.ilce?.trim() || branch?.ilce?.trim() || '-';

  return {
    aliciVkn: identity,
    aliciAdi: satis.customer.name || 'Bireysel Müşteri',
    aliciAdres,
    aliciIl,
    aliciIlce,
    aliciTel: satis.customer.phone,
    faturaNo,
    faturaTarihi: tarih,
    faturaZamani: zaman,
    sube: branchCode,
    siparisNo: satis.id,
    kalemler,
    not: satis.customer.note ?? undefined,
  };
}

export { transferMaliyetSatisFiyati, type TransferEFaturaKalem } from '../transfer/transfer-maliyet.util';

export function transferdenFaturaData(
  transfer: {
    transferRef: string;
    partnerVkn: string;
    partnerName: string;
    partnerPhone?: string;
    partnerAdres?: string;
    partnerIl?: string;
    partnerIlce?: string;
    partnerVergiDairesi?: string;
    kalemler: Array<{
      urunAdi: string;
      urunKodu?: string;
      miktar: number;
      birimFiyat: number;
      kdvOrani?: number;
    }>;
  },
  faturaNo: string,
  branchCode: string,
): FaturaData {
  const simdi = new Date();
  const tarih = simdi.toISOString().split('T')[0];
  const zaman = simdi.toTimeString().split(' ')[0];

  return {
    aliciVkn: transfer.partnerVkn.replace(/\D/g, '') || '11111111111',
    aliciAdi: transfer.partnerName || 'Transfer Alıcı',
    aliciAdres: transfer.partnerAdres?.trim() || '-',
    aliciIl: transfer.partnerIl?.trim() || 'İZMİR',
    aliciIlce: transfer.partnerIlce?.trim() || '-',
    aliciVergiDairesi: transfer.partnerVergiDairesi?.trim() || undefined,
    aliciTel: transfer.partnerPhone,
    faturaNo,
    faturaTarihi: tarih,
    faturaZamani: zaman,
    sube: branchCode,
    siparisNo: transfer.transferRef,
    kalemler: transfer.kalemler.map((k, i) => ({
      sira: i + 1,
      urunKodu: k.urunKodu || `TRF${i + 1}`,
      urunAdi: k.urunAdi,
      miktar: k.miktar,
      birim: 'C62',
      birimFiyat: k.birimFiyat,
      kdvOrani: k.kdvOrani ?? 20,
    })),
    not: `Şirketler arası transfer ${transfer.transferRef}`,
  };
}

function transferFaturaTutarHesapla(kalemler: FaturaData['kalemler']): number {
  return kalemler.reduce((s, k) => {
    const brut = k.miktar * k.birimFiyat;
    const iskonto = k.iskonto ? brut * (k.iskonto / 100) : 0;
    return s + (brut - iskonto);
  }, 0);
}

async function kuyrugaAl(opts: {
  satisId?: string;
  transferId?: string;
  faturaNo: string;
  faturaData: FaturaData;
  hata?: string;
}) {
  await prisma.faturaKuyruk.create({
    data: {
      satisId: opts.satisId,
      transferId: opts.transferId,
      faturaNo: opts.faturaNo,
      faturaData: JSON.stringify(opts.faturaData),
      hata: opts.hata,
      deneme: opts.hata ? 1 : 0,
    },
  });
}

async function faturaKaydet(opts: {
  faturaNo: string;
  uuid?: string;
  satisId?: string;
  transferId?: string;
  sube: string;
  aliciVkn: string;
  aliciAdi: string;
  tutar: number;
  profileId?: string;
  durum?: string;
  hata?: string;
}) {
  return prisma.fatura.create({
    data: {
      faturaNo: opts.faturaNo,
      uuid: opts.uuid,
      satisId: opts.satisId,
      transferId: opts.transferId,
      sube: opts.sube,
      aliciVkn: opts.aliciVkn,
      aliciAdi: opts.aliciAdi,
      tutar: opts.tutar,
      durum: opts.durum ?? 'GONDERILDI',
      profileId: opts.profileId ?? 'EARSIVFATURA',
      hata: opts.hata,
      gonderilenAt: opts.durum === 'GONDERILDI' ? new Date() : undefined,
    },
  });
}

/** BEKLIYOR iken yeni numara üretmeden önce beklenecek süre (ms) */
export const EFATURA_RETRY_AFTER_MS = 5 * 60 * 1000;

export type TetikleSatisEFaturaSonuc = {
  action: 'gonderildi' | 'kuyruk' | 'processing' | 'synced' | 'already_sent' | 'hata';
  mesaj?: string;
  eFaturaDurum?: string | null;
  processing?: boolean;
};

const EFATURA_PROCESSING_MESAJ =
  'e-Fatura hâlâ işleniyor. Birkaç dakika bekleyip tekrar deneyin.';

function processingSonuc(eFaturaDurum: string | null | undefined): TetikleSatisEFaturaSonuc {
  return {
    action: 'processing',
    processing: true,
    mesaj: EFATURA_PROCESSING_MESAJ,
    eFaturaDurum: eFaturaDurum ?? 'BEKLIYOR',
  };
}

async function tryResolvePendingSaleEFatura(
  saleId: string,
  kuyruk: { id: string; faturaNo: string; faturaData: string },
): Promise<TetikleSatisEFaturaSonuc | null> {
  const fatura = await prisma.fatura.findFirst({
    where: { OR: [{ satisId: saleId }, { faturaNo: kuyruk.faturaNo }] },
    orderBy: { createdAt: 'desc' },
  });
  if (!fatura?.uuid) return null;

  const faturaData = JSON.parse(kuyruk.faturaData) as FaturaData;
  const sirketId = subeToSirketAyarId(faturaData.sube);
  const outbox = await queryOutboxInvoiceStatus(fatura.uuid, sirketId);

  if (outbox.nihaiBasarili) {
    await prisma.faturaKuyruk.update({
      where: { id: kuyruk.id },
      data: { durum: 'GONDERILDI', gonderilenAt: new Date() },
    });
    await prisma.sale.update({
      where: { id: saleId },
      data: { eFaturaId: fatura.id, eFaturaDurum: 'GONDERILDI' },
    });
    return { action: 'synced', eFaturaDurum: 'GONDERILDI' };
  }

  if (outbox.sorgulandi && isOutboxInvoiceError(outbox.statusEnum)) {
    const hata = outbox.mesaj ?? `Uyumsoft zarf hatası (${outbox.statusEnum})`;
    await prisma.faturaKuyruk.update({
      where: { id: kuyruk.id },
      data: { durum: 'BASARISIZ', hata },
    });
    await prisma.sale.update({
      where: { id: saleId },
      data: { eFaturaDurum: 'HATA' },
    });
    return { action: 'hata', mesaj: hata, eFaturaDurum: 'HATA' };
  }

  return null;
}

export async function tetikleSatisEFatura(saleId: string): Promise<TetikleSatisEFaturaSonuc> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { include: { product: true }, where: { status: { not: 'VOID' } } },
      customer: true,
    },
  });
  if (!sale) return { action: 'hata', mesaj: 'Satış bulunamadı' };

  const existingFatura = await prisma.fatura.findFirst({
    where: { satisId: saleId },
    orderBy: { createdAt: 'desc' },
  });
  if (existingFatura || sale.eFaturaDurum === 'GONDERILDI') {
    if (existingFatura && sale.eFaturaDurum !== 'GONDERILDI') {
      await prisma.sale.update({
        where: { id: saleId },
        data: { eFaturaId: existingFatura.id, eFaturaDurum: 'GONDERILDI' },
      });
    }
    return { action: 'already_sent', eFaturaDurum: 'GONDERILDI' };
  }

  const branch = await prisma.branch.findUnique({ where: { id: sale.branchId } });
  const lastKuyruk = await prisma.faturaKuyruk.findFirst({
    where: { satisId: saleId },
    orderBy: { createdAt: 'desc' },
  });

  if (lastKuyruk?.durum === 'BEKLIYOR') {
    const resolved = await tryResolvePendingSaleEFatura(saleId, lastKuyruk);
    if (resolved) return resolved;
  }

  const now = Date.now();
  const refTime =
    lastKuyruk?.createdAt ?? (sale.eFaturaDurum === 'BEKLIYOR' ? sale.updatedAt : null);
  if (sale.eFaturaDurum === 'BEKLIYOR' && refTime) {
    const ageMs = now - refTime.getTime();
    if (ageMs < EFATURA_RETRY_AFTER_MS) {
      return processingSonuc(sale.eFaturaDurum);
    }
  }

  const retryBefore = new Date(now - EFATURA_RETRY_AFTER_MS);
  const claim = await prisma.sale.updateMany({
    where: {
      id: saleId,
      eFaturaDurum: { not: 'GONDERILDI' },
      OR: [
        { eFaturaDurum: null },
        { eFaturaDurum: 'HATA' },
        { eFaturaDurum: 'BEKLIYOR', updatedAt: { lte: retryBefore } },
      ],
    },
    data: { eFaturaDurum: 'BEKLIYOR' },
  });

  if (claim.count === 0) {
    const fresh = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { eFaturaDurum: true },
    });
    if (fresh?.eFaturaDurum === 'GONDERILDI') {
      return { action: 'already_sent', eFaturaDurum: 'GONDERILDI' };
    }
    return processingSonuc(fresh?.eFaturaDurum);
  }

  const branchCode = branch?.code ?? 'GVN1';

  const faturaNo = await allocateNextFaturaNo(branchCode);
  const faturaData = await satistenFaturaData(sale, faturaNo, branchCode, branch);

  const sonuc = await eFaturaGonder(faturaData, branch);

  if (sonuc.basarili) {
    const fatura = await faturaKaydet({
      faturaNo: sonuc.faturaNo,
      uuid: sonuc.uuid,
      satisId: saleId,
      sube: branchCode,
      aliciVkn: faturaData.aliciVkn,
      aliciAdi: faturaData.aliciAdi,
      tutar: Number(sale.netTotal),
      profileId: sonuc.profileId,
    });
    await prisma.sale.update({
      where: { id: saleId },
      data: { eFaturaId: fatura.id, eFaturaDurum: 'GONDERILDI' },
    });
    return { action: 'gonderildi', eFaturaDurum: 'GONDERILDI' };
  }

  await kuyrugaAl({ satisId: saleId, faturaNo, faturaData, hata: sonuc.hata });
  const kaliciHata = isEArsivPermissionDenied(sonuc.hata ?? '');
  const yeniDurum = kaliciHata ? 'HATA' : 'BEKLIYOR';
  await prisma.sale.update({
    where: { id: saleId },
    data: { eFaturaDurum: yeniDurum },
  });
  return {
    action: 'kuyruk',
    eFaturaDurum: yeniDurum,
    mesaj: sonuc.hata,
  };
}

export async function tetikleTransferEFatura(
  transferRef: string,
  kaynakBranchCode: string,
  hedefPartner: {
    vkn: string;
    unvan: string;
    adres?: string;
    il?: string;
    ilce?: string;
    vergiDairesi?: string;
    telefon?: string;
  },
  kalemler: TransferEFaturaKalem[],
): Promise<{
  basarili: boolean;
  faturaNo?: string;
  uuid?: string;
  faturaId?: string;
  hata?: string;
}> {
  if (!kalemler.length) {
    return { basarili: false, hata: 'e-Fatura için kalem yok' };
  }

  for (const k of kalemler) {
    const birimFiyat = k.birimFiyat ?? transferMaliyetSatisFiyati(k.maliyet);
    if (!Number.isFinite(birimFiyat) || birimFiyat <= 0) {
      return { basarili: false, hata: transferMaliyetHataMesaji(k.urunAdi || 'Ürün') };
    }
  }

  const existing = await prisma.fatura.findFirst({ where: { transferId: transferRef } });
  if (existing) {
    return {
      basarili: true,
      faturaNo: existing.faturaNo,
      uuid: existing.uuid ?? undefined,
      faturaId: existing.id,
    };
  }

  const bekleyenKuyruk = await prisma.faturaKuyruk.findFirst({
    where: { transferId: transferRef, durum: 'BEKLIYOR' },
  });
  if (bekleyenKuyruk && !isDuplicateFaturaNoError(bekleyenKuyruk.hata ?? '')) {
    return { basarili: false, hata: 'e-Fatura kuyrukta bekliyor' };
  }

  const branchCode = kaynakBranchCode.trim().toUpperCase();
  let localFaturaNo = await allocateNextFaturaNo(branchCode);
  if (bekleyenKuyruk && isDuplicateFaturaNoError(bekleyenKuyruk.hata ?? '')) {
    const eskiData = JSON.parse(bekleyenKuyruk.faturaData) as FaturaData;
    const yeniData = await reallocateFaturaDataNo(eskiData);
    localFaturaNo = yeniData.faturaNo;
    await prisma.faturaKuyruk.update({
      where: { id: bekleyenKuyruk.id },
      data: {
        faturaNo: yeniData.faturaNo,
        faturaData: JSON.stringify(yeniData),
        deneme: 0,
        hata: null,
      },
    });
  }

  const faturaKalemler = kalemler.map((k) => ({
    urunAdi: k.urunAdi,
    urunKodu: k.urunKodu,
    miktar: k.miktar,
    birimFiyat: k.birimFiyat ?? transferMaliyetSatisFiyati(k.maliyet),
    kdvOrani: k.kdvOrani,
  }));

  let faturaData = transferdenFaturaData(
    {
      transferRef,
      partnerVkn: hedefPartner.vkn,
      partnerName: hedefPartner.unvan,
      partnerPhone: hedefPartner.telefon,
      partnerAdres: hedefPartner.adres,
      partnerIl: hedefPartner.il,
      partnerIlce: hedefPartner.ilce,
      partnerVergiDairesi: hedefPartner.vergiDairesi,
      kalemler: faturaKalemler,
    },
    localFaturaNo,
    branchCode,
  );

  const tutar = transferFaturaTutarHesapla(faturaData.kalemler);
  const branch = await prisma.branch.findFirst({ where: { code: branchCode } });
  const sonuc = await eFaturaGonder(faturaData, branch);

  if (sonuc.basarili) {
    const fatura = await faturaKaydet({
      faturaNo: sonuc.faturaNo,
      uuid: sonuc.uuid,
      transferId: transferRef,
      sube: branchCode,
      aliciVkn: faturaData.aliciVkn,
      aliciAdi: faturaData.aliciAdi,
      tutar,
      profileId: sonuc.profileId,
    });
    if (bekleyenKuyruk) {
      await prisma.faturaKuyruk.update({
        where: { id: bekleyenKuyruk.id },
        data: { durum: 'GONDERILDI', gonderilenAt: new Date(), hata: null },
      });
    }
    return {
      basarili: true,
      faturaNo: sonuc.faturaNo,
      uuid: sonuc.uuid,
      faturaId: fatura.id,
    };
  }

  if (!sonuc.basarili && isDuplicateFaturaNoError(sonuc.hata)) {
    const yeniData = await reallocateFaturaDataNo(faturaData);
    const retry = await eFaturaGonder(yeniData, branch);
    if (retry.basarili) {
      const fatura = await faturaKaydet({
        faturaNo: retry.faturaNo,
        uuid: retry.uuid,
        transferId: transferRef,
        sube: branchCode,
        aliciVkn: yeniData.aliciVkn,
        aliciAdi: yeniData.aliciAdi,
        tutar,
        profileId: retry.profileId,
      });
      if (bekleyenKuyruk) {
        await prisma.faturaKuyruk.update({
          where: { id: bekleyenKuyruk.id },
          data: {
            durum: 'GONDERILDI',
            gonderilenAt: new Date(),
            faturaNo: yeniData.faturaNo,
            faturaData: JSON.stringify(yeniData),
            hata: null,
          },
        });
      }
      return {
        basarili: true,
        faturaNo: retry.faturaNo,
        uuid: retry.uuid,
        faturaId: fatura.id,
      };
    }
    sonuc.hata = retry.hata;
    faturaData = yeniData;
    localFaturaNo = yeniData.faturaNo;
  }

  if (bekleyenKuyruk) {
    await prisma.faturaKuyruk.update({
      where: { id: bekleyenKuyruk.id },
      data: {
        faturaNo: localFaturaNo,
        faturaData: JSON.stringify(faturaData),
        hata: sonuc.hata,
        deneme: bekleyenKuyruk.deneme + 1,
      },
    });
  } else {
    await kuyrugaAl({
      transferId: transferRef,
      faturaNo: localFaturaNo,
      faturaData,
      hata: sonuc.hata,
    });
  }

  return {
    basarili: false,
    faturaNo: localFaturaNo,
    hata: sonuc.hata,
  };
}

export async function processFaturaKuyruk(): Promise<{ islenen: number }> {
  const bekleyenler = await prisma.faturaKuyruk.findMany({
    where: { durum: 'BEKLIYOR', deneme: { lt: 5 } },
    take: 10,
  });

  for (const kayit of bekleyenler) {
    let faturaData = JSON.parse(kayit.faturaData) as FaturaData;
    if (isDuplicateFaturaNoError(kayit.hata ?? '')) {
      faturaData = await reallocateFaturaDataNo(faturaData);
      await prisma.faturaKuyruk.update({
        where: { id: kayit.id },
        data: {
          faturaNo: faturaData.faturaNo,
          faturaData: JSON.stringify(faturaData),
        },
      });
    }
    const branch = await prisma.branch.findFirst({ where: { code: faturaData.sube } });
    let sonuc = await eFaturaGonder(faturaData, branch);

    if (!sonuc.basarili && isDuplicateFaturaNoError(sonuc.hata)) {
      faturaData = await reallocateFaturaDataNo(faturaData);
      await prisma.faturaKuyruk.update({
        where: { id: kayit.id },
        data: {
          faturaNo: faturaData.faturaNo,
          faturaData: JSON.stringify(faturaData),
        },
      });
      sonuc = await eFaturaGonder(faturaData, branch);
    }

    if (sonuc.basarili) {
      await prisma.faturaKuyruk.update({
        where: { id: kayit.id },
        data: { durum: 'GONDERILDI', gonderilenAt: new Date() },
      });
      const tutar = faturaData.kalemler.reduce((s, k) => {
        const brut = k.miktar * k.birimFiyat;
        const iskonto = k.iskonto ? brut * (k.iskonto / 100) : 0;
        return s + (brut - iskonto);
      }, 0);
      let fatura = await prisma.fatura.findUnique({ where: { faturaNo: sonuc.faturaNo } });
      if (!fatura) {
        fatura = await faturaKaydet({
          faturaNo: sonuc.faturaNo,
          uuid: sonuc.uuid,
          satisId: kayit.satisId ?? undefined,
          transferId: kayit.transferId ?? undefined,
          sube: faturaData.sube,
          aliciVkn: faturaData.aliciVkn,
          aliciAdi: faturaData.aliciAdi,
          tutar,
          profileId: sonuc.profileId,
        });
      }
      if (kayit.satisId) {
        await prisma.sale.update({
          where: { id: kayit.satisId },
          data: { eFaturaId: fatura.id, eFaturaDurum: 'GONDERILDI' },
        });
      }
    } else {
      const kaliciHata = isEArsivPermissionDenied(sonuc.hata ?? '');
      await prisma.faturaKuyruk.update({
        where: { id: kayit.id },
        data: {
          deneme: kayit.deneme + 1,
          hata: sonuc.hata,
          durum: kaliciHata || kayit.deneme >= 4 ? 'BASARISIZ' : 'BEKLIYOR',
        },
      });
      if (kayit.satisId && (kaliciHata || kayit.deneme >= 4)) {
        await prisma.sale.update({
          where: { id: kayit.satisId },
          data: { eFaturaDurum: 'HATA' },
        });
      }
    }
  }

  return { islenen: bekleyenler.length };
}
