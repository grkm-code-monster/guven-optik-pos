/**
 * e-İrsaliye kimlik doğrulama + servis eşleşmesi teşhisi (tek seferlik)
 * Kullanım: npx tsx backend/scripts/test-uyumsoft-despatch-auth-v2.ts
 */
import * as soap from 'soap';
import {
  DEFAULT_SIRKET_ID,
  getCredentialsForSirket,
  getSystemDate as basicGetSystemDate,
  testConnection as basicTestConnection,
} from '../src/modules/uyumsoft/uyumsoft.service';
import {
  getDespatchSystemDate,
  isEDespatchUser,
  verifyDespatchConnection,
} from '../src/modules/efatura/uyumsoft-irsaliye.service';

const DESPATCH_WSDL = 'https://efatura.uyumsoft.com.tr/Services/DespatchIntegration?singleWsdl';
const INTEGRATION_WSDLS = [
  'https://efatura.uyumsoft.com.tr/Services/Integration?singleWsdl',
  'https://efatura.uyumsoft.com.tr/Services/Integration?wsdl',
  'http://efatura.uyumsoft.com.tr/Services/Integration?wsdl',
];

const NG_VKN = process.env.UYUMSOFT_NG_VKN ?? '23819441406';

type TestSonuc = { durum: 'basarili' | 'basarisiz' | 'denenmedi'; detay: string };

function fmtErr(err: unknown): string {
  if (err instanceof Error) {
    const soapBody = (err as { body?: string }).body;
    if (soapBody) {
      const msgMatch = soapBody.match(/<Message[^>]*>([^<]+)<\/Message>/i)
        ?? soapBody.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
      if (msgMatch?.[1]) return msgMatch[1].trim();
      return soapBody.slice(0, 400).replace(/\s+/g, ' ');
    }
    return err.message.slice(0, 300);
  }
  return String(err).slice(0, 300);
}

function buildUserInfo(creds: { username: string; password: string }) {
  return {
    attributes: {
      Username: creds.username,
      Password: creds.password,
    },
  };
}

async function despatchClientBasicAuth(sirketId: string): Promise<soap.Client> {
  const creds = await getCredentialsForSirket(sirketId);
  const client = await soap.createClientAsync(DESPATCH_WSDL, {
    wsdl_headers: {
      Authorization: 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64'),
    },
  });
  client.setSecurity(new soap.BasicAuthSecurity(creds.username, creds.password));
  return client;
}

async function despatchClientWsSecurity(sirketId: string): Promise<soap.Client> {
  const creds = await getCredentialsForSirket(sirketId);
  const client = await soap.createClientAsync(DESPATCH_WSDL);
  client.setSecurity(new soap.WSSecurity(creds.username, creds.password));
  return client;
}

async function integrationClient(
  wsdl: string,
  auth: 'basic' | 'ws',
  sirketId: string,
): Promise<soap.Client> {
  const creds = await getCredentialsForSirket(sirketId);
  const opts = auth === 'basic'
    ? {
      wsdl_headers: {
        Authorization: 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64'),
      },
    }
    : {};
  const client = await soap.createClientAsync(wsdl, opts);
  if (auth === 'basic') {
    client.setSecurity(new soap.BasicAuthSecurity(creds.username, creds.password));
  } else {
    client.setSecurity(new soap.WSSecurity(creds.username, creds.password));
  }
  return client;
}

async function callDespatchOp(
  client: soap.Client,
  op: 'GetSystemDate' | 'UserInfoWithNoCheck' | 'IsEDespatchUser',
  extra?: Record<string, unknown>,
): Promise<TestSonuc> {
  try {
    if (op === 'GetSystemDate') {
      const [result] = await client.GetSystemDateAsync({});
      const val = JSON.stringify(result?.GetSystemDateResult ?? result).slice(0, 120);
      return { durum: 'basarili', detay: val || 'OK' };
    }
    if (op === 'UserInfoWithNoCheck') {
      const [result] = await client.UserInfoWithNoCheckAsync({});
      const user = (result?.UserInfoWithNoCheckResult as { Value?: { User?: { Username?: string } } })
        ?.Value?.User?.Username;
      return { durum: user ? 'basarili' : 'basarisiz', detay: user ?? JSON.stringify(result).slice(0, 120) };
    }
    const [result] = await client.IsEDespatchUserAsync({ vknTckn: NG_VKN, ...extra });
    return { durum: 'basarili', detay: JSON.stringify(result?.IsEDespatchUserResult ?? result).slice(0, 160) };
  } catch (err) {
    return { durum: 'basarisiz', detay: fmtErr(err) };
  }
}

async function callIntegrationOp(client: soap.Client, ops: string[]): Promise<TestSonuc> {
  const creds = await getCredentialsForSirket(DEFAULT_SIRKET_ID);
  const userInfo = buildUserInfo(creds);

  for (const op of ops) {
    try {
      const fn = (client as Record<string, unknown>)[`${op}Async`] as
        | ((args: unknown) => Promise<[unknown]>)
        | undefined;
      if (!fn) continue;

      let args: unknown = {};
      if (op === 'TestConnection' || op === 'GetSystemDate') {
        args = { userInfo };
      } else if (op === 'UserInfoWithNoCheck') {
        args = {};
      } else if (op === 'IsEDespatchUser' || op === 'IsEInvoiceUser') {
        args = { userInfo, vknTckn: NG_VKN };
      }

      const [result] = await fn(args);
      return { durum: 'basarili', detay: `${op}: ${JSON.stringify(result).slice(0, 160)}` };
    } catch (err) {
      const msg = fmtErr(err);
      if (msg.includes('not a function') || msg.includes('undefined')) continue;
      return { durum: 'basarisiz', detay: `${op}: ${msg}` };
    }
  }
  return { durum: 'basarisiz', detay: `Denenen ops yok/başarısız: ${ops.join(', ')}` };
}

async function describeService(wsdl: string, label: string) {
  try {
    const client = await soap.createClientAsync(wsdl);
    const desc = client.describe();
    const serviceName = Object.keys(desc)[0] ?? '?';
    const portName = Object.keys(desc[serviceName] ?? {})[0] ?? '?';
    const ops = Object.keys(desc[serviceName]?.[portName] ?? {});
    console.log(`\n[describe] ${label}`);
    console.log(`  WSDL: ${wsdl}`);
    console.log(`  Operasyonlar (${ops.length}): ${ops.slice(0, 25).join(', ')}${ops.length > 25 ? '…' : ''}`);
    return ops;
  } catch (err) {
    console.log(`\n[describe] ${label} — HATA: ${fmtErr(err)}`);
    return [] as string[];
  }
}

async function main() {
  const sirketId = DEFAULT_SIRKET_ID;
  console.log('=== Uyumsoft e-İrsaliye auth teşhisi v2 ===');
  console.log(`sirketId=${sirketId}, test VKN=${NG_VKN}`);

  const creds = await getCredentialsForSirket(sirketId);
  console.log(`username=${creds.username}, gonderenBirim=${creds.gonderenBirim}`);

  // ── Adım 1: Baseline (mevcut kod — DespatchIntegration + WSSecurity) ──
  console.log('\n── ADIM 1: DespatchIntegration + WS-Security (mevcut kod) ──');

  const adim1: Record<string, TestSonuc> = {};

  try {
    const tarih = await getDespatchSystemDate(sirketId);
    adim1.getDespatchSystemDate = { durum: tarih ? 'basarili' : 'basarisiz', detay: tarih || 'boş' };
  } catch (err) {
    adim1.getDespatchSystemDate = { durum: 'basarisiz', detay: fmtErr(err) };
  }

  try {
    const v = await verifyDespatchConnection(sirketId);
    adim1.verifyDespatchConnection = { durum: 'basarili', detay: `${v.yontem}=${v.deger}` };
  } catch (err) {
    adim1.verifyDespatchConnection = { durum: 'basarisiz', detay: fmtErr(err) };
  }

  try {
    const ok = await isEDespatchUser(NG_VKN, undefined, sirketId);
    adim1.isEDespatchUser_NG = { durum: 'basarili', detay: `sonuç=${ok}` };
  } catch (err) {
    adim1.isEDespatchUser_NG = { durum: 'basarisiz', detay: fmtErr(err) };
  }

  for (const [k, v] of Object.entries(adim1)) {
    console.log(`  ${k}: [${v.durum}] ${v.detay}`);
  }

  // ── Adım 2: DespatchIntegration + Basic Auth ──
  console.log('\n── ADIM 2: DespatchIntegration + Basic Auth ──');
  await describeService(DESPATCH_WSDL, 'DespatchIntegration');

  const despatchBasic = await despatchClientBasicAuth(sirketId);
  const adim2 = {
    GetSystemDate: await callDespatchOp(despatchBasic, 'GetSystemDate'),
    UserInfoWithNoCheck: await callDespatchOp(despatchBasic, 'UserInfoWithNoCheck'),
    IsEDespatchUser_NG: await callDespatchOp(despatchBasic, 'IsEDespatchUser'),
  };
  for (const [k, v] of Object.entries(adim2)) {
    console.log(`  ${k}: [${v.durum}] ${v.detay}`);
  }

  // Despatch WSSecurity direct (Adım 1 detay)
  console.log('\n── DespatchIntegration + WS-Security (doğrudan client) ──');
  const despatchWs = await despatchClientWsSecurity(sirketId);
  const adim1Direct = {
    GetSystemDate: await callDespatchOp(despatchWs, 'GetSystemDate'),
    UserInfoWithNoCheck: await callDespatchOp(despatchWs, 'UserInfoWithNoCheck'),
    IsEDespatchUser_NG: await callDespatchOp(despatchWs, 'IsEDespatchUser'),
  };
  for (const [k, v] of Object.entries(adim1Direct)) {
    console.log(`  ${k}: [${v.durum}] ${v.detay}`);
  }

  // ── Adım 3: Integration servisi ──
  console.log('\n── ADIM 3: Integration servisi ──');
  let integrationWsdl = '';
  let integrationOps: string[] = [];
  for (const url of INTEGRATION_WSDLS) {
    const ops = await describeService(url, 'Integration');
    if (ops.length > 0) {
      integrationWsdl = url;
      integrationOps = ops;
      break;
    }
  }

  let integrationBasic: TestSonuc = { durum: 'denenmedi', detay: 'WSDL yüklenemedi' };
  let integrationWs: TestSonuc = { durum: 'denenmedi', detay: 'WSDL yüklenemedi' };

  if (integrationWsdl) {
    const probeOps = [
      'GetSystemDate',
      'TestConnection',
      'UserInfoWithNoCheck',
      'IsEDespatchUser',
      'IsEInvoiceUser',
    ].filter((op) => integrationOps.includes(op));

    const intBasicClient = await integrationClient(integrationWsdl, 'basic', sirketId);
    integrationBasic = await callIntegrationOp(intBasicClient, probeOps.length ? probeOps : integrationOps.slice(0, 5));

    const intWsClient = await integrationClient(integrationWsdl, 'ws', sirketId);
    integrationWs = await callIntegrationOp(intWsClient, probeOps.length ? probeOps : integrationOps.slice(0, 5));

    console.log(`  Integration Basic Auth: [${integrationBasic.durum}] ${integrationBasic.detay}`);
    console.log(`  Integration WS-Security: [${integrationWs.durum}] ${integrationWs.detay}`);
  }

  // ── Referans: BasicIntegration ──
  console.log('\n── Referans: BasicIntegration (e-Fatura, mevcut kod) ──');
  let basicRef: TestSonuc = { durum: 'denenmedi', detay: '' };
  try {
    const tc = await basicTestConnection(sirketId);
    const sd = await basicGetSystemDate(sirketId);
    basicRef = { durum: 'basarili', detay: `TestConnection OK, GetSystemDate=${sd}, raw=${JSON.stringify(tc).slice(0, 80)}` };
  } catch (err) {
    basicRef = { durum: 'basarisiz', detay: fmtErr(err) };
  }
  console.log(`  [${basicRef.durum}] ${basicRef.detay}`);

  // ── SendDespatch benzeri hata simülasyonu (mevcut WSSecurity) ──
  console.log('\n── Ek: SendDespatch yetki hatası repro (minimal payload) ──');
  try {
    const c = await despatchClientWsSecurity(sirketId);
    const [result] = await c.SendDespatchAsync({
      despatchInfo: {
        attributes: { LocalDocumentId: 'TEST-DIAG-' + Date.now() },
        DespatchAdvice: { $xml: '<cbc:ID xmlns="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">TEST</cbc:ID>' },
        TargetCustomer: {
          attributes: { VknTckn: NG_VKN, Title: 'NG OPTİK TEST' },
        },
      },
    });
    const attrs = (result?.SendDespatchResult as { attributes?: Record<string, unknown> })?.attributes;
    console.log(`  SendDespatch: IsSucceded=${attrs?.IsSucceded}, Message=${attrs?.Message ?? attrs?.ErrorMessage ?? JSON.stringify(result).slice(0, 200)}`);
  } catch (err) {
    console.log(`  SendDespatch exception: ${fmtErr(err)}`);
  }

  // ── Özet tablo ──
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('ÖZET TABLO');
  console.log('══════════════════════════════════════════════════════════');

  const despatchWsOk = adim1Direct.GetSystemDate.durum === 'basarili'
    || adim1Direct.UserInfoWithNoCheck.durum === 'basarili';
  const despatchBasicOk = adim2.GetSystemDate.durum === 'basarili'
    || adim2.UserInfoWithNoCheck.durum === 'basarili';

  const rows = [
    ['BasicIntegration (e-Fatura)', basicRef.durum === 'basarili' ? '✅ ' + basicRef.detay.slice(0, 60) : '❌ ' + basicRef.detay.slice(0, 60), 'denenmedi'],
    ['Integration', integrationBasic.durum === 'basarili' ? '✅ ' + integrationBasic.detay.slice(0, 60) : integrationBasic.durum === 'denenmedi' ? 'denenmedi' : '❌ ' + integrationBasic.detay.slice(0, 60), integrationWs.durum === 'basarili' ? '✅ ' + integrationWs.detay.slice(0, 60) : integrationWs.durum === 'denenmedi' ? 'denenmedi' : '❌ ' + integrationWs.detay.slice(0, 60)],
    ['DespatchIntegration', despatchBasicOk ? '✅ ' + (adim2.GetSystemDate.durum === 'basarili' ? adim2.GetSystemDate.detay : adim2.UserInfoWithNoCheck.detay).slice(0, 60) : '❌ ' + (adim2.GetSystemDate.detay || adim2.UserInfoWithNoCheck.detay).slice(0, 60), despatchWsOk ? '✅ ' + (adim1Direct.GetSystemDate.durum === 'basarili' ? adim1Direct.GetSystemDate.detay : adim1Direct.UserInfoWithNoCheck.detay).slice(0, 60) : '❌ ' + (adim1Direct.GetSystemDate.detay || adim1Direct.UserInfoWithNoCheck.detay).slice(0, 60)],
  ];

  console.log('| Servis | Basic Auth | WS-Security |');
  console.log('|--------|-----------|-------------|');
  for (const r of rows) {
    console.log(`| ${r[0]} | ${r[1]} | ${r[2]} |`);
  }

  console.log('\n── Yorum ──');
  if (despatchWsOk && !despatchBasicOk) {
    console.log('→ İhtimal 3 adayı: DespatchIntegration yalnızca WS-Security ile çalışıyor olabilir.');
  } else if (!despatchWsOk && !despatchBasicOk && integrationBasic.durum === 'basarili') {
    console.log('→ İhtimal 1 adayı: DespatchIntegration kapalı, Integration servisi erişilebilir.');
  } else if (!despatchWsOk && !despatchBasicOk && integrationBasic.durum !== 'basarili') {
    console.log('→ İhtimal 2 adayı: Hesap seviyesinde yetki/kimlik eksikliği (Integration da çalışmıyor).');
  } else if (despatchWsOk && despatchBasicOk) {
    console.log('→ Auth yöntemi fark etmiyor; SendDespatch yetki hatası ayrı bir modül/yetki konusu olabilir.');
  } else {
    console.log('→ Karışık sonuç — detaylara bakın.');
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
