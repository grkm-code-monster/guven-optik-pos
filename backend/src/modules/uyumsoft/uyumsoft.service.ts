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

export { getClient, USER_INFO };
