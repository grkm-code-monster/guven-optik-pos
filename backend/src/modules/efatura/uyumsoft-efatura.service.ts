import { randomUUID } from 'crypto';
import type { Branch, Customer, Product, Sale, SaleItem } from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  isEInvoiceUser,
  getUserAliasses,
  sendInvoice,
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
  unvan: string;
  vergiDairesi: string;
  adres: string;
  il: string;
  ilce: string;
  telefon: string;
  email: string;
}

const NG_VKN = process.env.UYUMSOFT_NG_VKN ?? '23819441406';

const SIRKET_SUBE_MAP: Record<string, string[]> = {
  ADESE: ['GVN1', 'GVN3', 'GVN6', 'GVN7', 'GVN8', 'GVN9'],
  NG: ['GVN2', 'GVN10', 'ANADEPO'],
  POTENTIAL: ['GVN5'],
};

function sirketForSube(sube: string): 'ADESE' | 'NG' | 'POTENTIAL' {
  if (SIRKET_SUBE_MAP.NG.includes(sube)) return 'NG';
  if (SIRKET_SUBE_MAP.POTENTIAL.includes(sube)) return 'POTENTIAL';
  return 'ADESE';
}

function getSupplierInfo(sube: string, branch?: Branch | null): SupplierInfo {
  const sirket = sirketForSube(sube);
  const branchVkn = branch?.vkn?.trim() || '';

  if (sirket === 'NG') {
    return {
      vkn: branchVkn || NG_VKN,
      unvan: 'NG OPTİK',
      vergiDairesi: 'Konak',
      adres: branch?.adres ?? 'İzmir',
      il: 'İZMİR',
      ilce: 'Konak',
      telefon: branch?.telefon ?? '',
      email: 'info@guvenoptik.com',
    };
  }

  if (sirket === 'POTENTIAL') {
    return {
      vkn: branchVkn || process.env.UYUMSOFT_POTENTIAL_VKN || '',
      unvan: 'POTANSİYEL OPTİK',
      vergiDairesi: 'Konak',
      adres: branch?.adres ?? 'İzmir',
      il: 'İZMİR',
      ilce: 'Konak',
      telefon: branch?.telefon ?? '',
      email: 'info@guvenoptik.com',
    };
  }

  return {
    vkn: branchVkn || process.env.UYUMSOFT_ADESE_VKN || '',
    unvan: 'ADESE OPTİK',
    vergiDairesi: 'Konak',
    adres: branch?.adres ?? 'İzmir',
    il: 'İZMİR',
    ilce: 'Konak',
    telefon: branch?.telefon ?? '',
    email: 'info@guvenoptik.com',
  };
}

export async function mukellefiyetSorgula(vkn: string): Promise<{
  eFaturaMukellef: boolean;
  alias?: string;
}> {
  try {
    const eFaturaMukellef = await isEInvoiceUser(vkn);
    if (!eFaturaMukellef) {
      return { eFaturaMukellef: false };
    }

    const aliasResult = await getUserAliasses(vkn);
    const rows = (aliasResult as { GetUserAliassesResult?: { UserAliasses?: unknown } })
      ?.GetUserAliassesResult?.UserAliasses;
    const aliasList = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const aktifAlias = aliasList.find(
      (a: { Alias?: string; Name?: string }) =>
        a.Alias?.startsWith('urn:mail:') || a.Name?.startsWith('urn:mail:'),
    ) as { Alias?: string; Name?: string } | undefined;

    return {
      eFaturaMukellef: true,
      alias: aktifAlias?.Alias ?? aktifAlias?.Name ?? aliasList[0]?.Alias ?? aliasList[0]?.Name,
    };
  } catch (err) {
    console.error('Mükellef sorgu hatası:', err);
    return { eFaturaMukellef: false };
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

export function buildUBLXML(
  data: FaturaData,
  profileId: 'TEMELFATURA' | 'EARSIVFATURA',
  supplier?: SupplierInfo,
): string {
  const uuid = randomUUID().toUpperCase();
  const satici = supplier ?? getSupplierInfo(data.sube);

  type KdvGrup = { matrah: number; kdvTutar: number; oran: number };
  const kdvGruplari = new Map<number, KdvGrup>();
  let toplamMalHizmet = 0;
  let toplamIskonto = 0;

  const kalemXMLler = data.kalemler
    .map((k) => {
      const brut = k.miktar * k.birimFiyat;
      const iskontoTutar = k.iskonto ? brut * (k.iskonto / 100) : 0;
      const netTutar = brut - iskontoTutar;
      const kdvTutar = netTutar * (k.kdvOrani / 100);

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
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
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
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
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
        <cbc:ID schemeID="VKN">${escapeXML(satici.vkn)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXML(satici.unvan)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXML(satici.adres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXML(satici.ilce)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(satici.il)}</cbc:CityName>
        <cbc:PostalZone>35000</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>TR</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXML(satici.vergiDairesi)}</cbc:Name>
          <cbc:TaxTypeCode>VKN</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        ${satici.telefon ? `<cbc:Telephone>${escapeXML(satici.telefon)}</cbc:Telephone>` : ''}
        <cbc:ElectronicMail>${escapeXML(satici.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${data.aliciVkn.length === 10 ? 'VKN' : 'TCKN'}">${escapeXML(data.aliciVkn)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXML(data.aliciAdi)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXML(data.aliciAdres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXML(data.aliciIlce)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(data.aliciIl)}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>TR</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      ${
        data.aliciVergiDairesi
          ? `<cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXML(data.aliciVergiDairesi)}</cbc:Name>
          <cbc:TaxTypeCode>VKN</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ''
      }
      <cac:Contact>
        ${data.aliciTel ? `<cbc:Telephone>${escapeXML(data.aliciTel)}</cbc:Telephone>` : ''}
        ${data.aliciEmail ? `<cbc:ElectronicMail>${escapeXML(data.aliciEmail)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${data.doviz || 'TRY'}">${toplamKDV.toFixed(2)}</cbc:TaxAmount>
    ${taxSubtotalXML}
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
  const { eFaturaMukellef, alias } = await mukellefiyetSorgula(data.aliciVkn);
  const profileId = eFaturaMukellef ? 'TEMELFATURA' : 'EARSIVFATURA';
  const supplier = getSupplierInfo(data.sube, branch);
  const xmlContent = buildUBLXML(data, profileId, supplier);
  const xmlBase64 = Buffer.from(xmlContent, 'utf8').toString('base64');
  const ettn =
    xmlContent.match(/<cbc:UUID>([^<]+)<\/cbc:UUID>/)?.[1] ?? randomUUID().toUpperCase();

  try {
    const res = await sendInvoice({
      faturaNo: data.faturaNo,
      ettn,
      faturaTarihi: data.faturaTarihi,
      profileId,
      supplierVkn: supplier.vkn,
      aliciVkn: data.aliciVkn,
      receiverAlias: eFaturaMukellef && alias ? alias : undefined,
      xmlBase64,
      xmlContent,
    });

    const basarili =
      res?.IsSucceded === true ||
      res?.IsSucceeded === true ||
      res?.IsSucceded === 'true' ||
      res?.IsSucceeded === 'true';

    if (basarili) {
      const uuid =
        res?.DocumentId ||
        res?.ETTN ||
        ettn ||
        res?.Value?.attributes?.Id ||
        res?.Value?.Id;
      return {
        basarili: true,
        faturaNo: data.faturaNo,
        uuid,
        profileId,
      };
    }

    const hataMsg = res?.Message || res?.ErrorMessage || JSON.stringify(res) || 'Bilinmeyen hata';
    return {
      basarili: false,
      faturaNo: data.faturaNo,
      profileId,
      hata: res?._format ? `${hataMsg} [format: ${res._format}]` : hataMsg,
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

export function faturaNoUret(sube: string, siraNo: number): string {
  const yil = new Date().getFullYear();
  const sira = siraNo.toString().padStart(9, '0');
  const subeKodu = sube.replace('GVN', 'GN').padEnd(3, '0').substring(0, 3);
  return `${subeKodu}${yil}${sira}`;
}

type SaleWithItems = Sale & {
  items: (SaleItem & { product: Product | null })[];
  customer: Customer;
};

export function satistenFaturaData(
  satis: SaleWithItems,
  faturaNo: string,
  branchCode: string,
): FaturaData {
  const simdi = new Date();
  const tarih = simdi.toISOString().split('T')[0];
  const zaman = simdi.toTimeString().split(' ')[0];

  const kalemler: FaturaKalem[] = satis.items.map((item, i) => {
    const brut = Number(item.unitPrice) * item.qty;
    const discountPct =
      brut > 0 ? Math.min(100, (Number(item.discount) / brut) * 100) : undefined;

    return {
      sira: i + 1,
      urunKodu: item.odooProductId || item.product?.barcode || `URUN${i + 1}`,
      urunAdi: item.odooProductName || item.product?.name || 'Ürün',
      miktar: item.qty,
      birim: 'C62',
      birimFiyat: Number(item.unitPrice),
      kdvOrani: Number(item.product?.taxRate ?? 20),
      iskonto: discountPct && discountPct > 0 ? discountPct : undefined,
    };
  });

  const identity = satis.customer.identityNo?.trim() || '11111111111';

  return {
    aliciVkn: identity,
    aliciAdi: satis.customer.name || 'Bireysel Müşteri',
    aliciAdres: '-',
    aliciIl: 'İZMİR',
    aliciIlce: '-',
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

export function transferdenFaturaData(
  transfer: {
    pickingId: number;
    partnerVkn: string;
    partnerName: string;
    partnerPhone?: string;
    kalemler: Array<{ urunAdi: string; miktar: number; birimFiyat: number }>;
  },
  faturaNo: string,
  branchCode: string,
): FaturaData {
  const simdi = new Date();
  const tarih = simdi.toISOString().split('T')[0];
  const zaman = simdi.toTimeString().split(' ')[0];

  return {
    aliciVkn: transfer.partnerVkn || '11111111111',
    aliciAdi: transfer.partnerName || 'Transfer Alıcı',
    aliciAdres: '-',
    aliciIl: 'İZMİR',
    aliciIlce: '-',
    aliciTel: transfer.partnerPhone,
    faturaNo,
    faturaTarihi: tarih,
    faturaZamani: zaman,
    sube: branchCode,
    siparisNo: `TRF-${transfer.pickingId}`,
    kalemler: transfer.kalemler.map((k, i) => ({
      sira: i + 1,
      urunKodu: `TRF${i + 1}`,
      urunAdi: k.urunAdi,
      miktar: k.miktar,
      birim: 'C62',
      birimFiyat: k.birimFiyat,
      kdvOrani: 20,
    })),
    not: `Transfer kabul: ${transfer.pickingId}`,
  };
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

export async function tetikleSatisEFatura(saleId: string): Promise<void> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { include: { product: true }, where: { status: { not: 'VOID' } } },
      customer: true,
    },
  });
  if (!sale || sale.eFaturaDurum === 'GONDERILDI') return;

  const branch = await prisma.branch.findUnique({ where: { id: sale.branchId } });
  const branchCode = branch?.code ?? 'GVN1';

  const count = await prisma.fatura.count({ where: { sube: branchCode } });
  const faturaNo = faturaNoUret(branchCode, count + 1);
  const faturaData = satistenFaturaData(sale, faturaNo, branchCode);

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
    return;
  }

  await kuyrugaAl({ satisId: saleId, faturaNo, faturaData, hata: sonuc.hata });
  await prisma.sale.update({
    where: { id: saleId },
    data: { eFaturaDurum: 'BEKLIYOR' },
  });
}

export async function tetikleTransferEFatura(
  transferId: number,
  branchCode: string,
): Promise<void> {
  const count = await prisma.fatura.count({ where: { sube: branchCode } });
  const faturaNo = faturaNoUret(branchCode, count + 1);

  const faturaData = transferdenFaturaData(
    {
      pickingId: transferId,
      partnerVkn: '11111111111',
      partnerName: 'Transfer Alıcı',
      kalemler: [{ urunAdi: 'Transfer kalemi', miktar: 1, birimFiyat: 0 }],
    },
    faturaNo,
    branchCode,
  );

  const branch = await prisma.branch.findFirst({ where: { code: branchCode } });
  const sonuc = await eFaturaGonder(faturaData, branch);

  if (sonuc.basarili) {
    await faturaKaydet({
      faturaNo: sonuc.faturaNo,
      uuid: sonuc.uuid,
      transferId: String(transferId),
      sube: branchCode,
      aliciVkn: faturaData.aliciVkn,
      aliciAdi: faturaData.aliciAdi,
      tutar: 0,
      profileId: sonuc.profileId,
    });
    return;
  }

  await kuyrugaAl({
    transferId: String(transferId),
    faturaNo,
    faturaData,
    hata: sonuc.hata,
  });
}

export async function processFaturaKuyruk(): Promise<{ islenen: number }> {
  const bekleyenler = await prisma.faturaKuyruk.findMany({
    where: { durum: 'BEKLIYOR', deneme: { lt: 5 } },
    take: 10,
  });

  for (const kayit of bekleyenler) {
    const faturaData = JSON.parse(kayit.faturaData) as FaturaData;
    const branch = await prisma.branch.findFirst({ where: { code: faturaData.sube } });
    const sonuc = await eFaturaGonder(faturaData, branch);

    if (sonuc.basarili) {
      await prisma.faturaKuyruk.update({
        where: { id: kayit.id },
        data: { durum: 'GONDERILDI', gonderilenAt: new Date() },
      });
      await faturaKaydet({
        faturaNo: sonuc.faturaNo,
        uuid: sonuc.uuid,
        satisId: kayit.satisId ?? undefined,
        transferId: kayit.transferId ?? undefined,
        sube: faturaData.sube,
        aliciVkn: faturaData.aliciVkn,
        aliciAdi: faturaData.aliciAdi,
        tutar: faturaData.kalemler.reduce(
          (s, k) => s + k.miktar * k.birimFiyat * (1 + k.kdvOrani / 100),
          0,
        ),
        profileId: sonuc.profileId,
      });
      if (kayit.satisId) {
        await prisma.sale.update({
          where: { id: kayit.satisId },
          data: { eFaturaDurum: 'GONDERILDI' },
        });
      }
    } else {
      await prisma.faturaKuyruk.update({
        where: { id: kayit.id },
        data: {
          deneme: kayit.deneme + 1,
          hata: sonuc.hata,
          durum: kayit.deneme >= 4 ? 'BASARISIZ' : 'BEKLIYOR',
        },
      });
      if (kayit.satisId && kayit.deneme >= 4) {
        await prisma.sale.update({
          where: { id: kayit.satisId },
          data: { eFaturaDurum: 'HATA' },
        });
      }
    }
  }

  return { islenen: bekleyenler.length };
}
