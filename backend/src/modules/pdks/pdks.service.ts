import axios from 'axios';

const BASE_URL = 'https://app.patronpdks.com/api/v4';

const TOKEN = process.env.PDKS_TOKEN || (() => {
  throw new Error('PDKS_TOKEN ortam değişkeni tanımlı değil — .env dosyasını kontrol edin');
})();

const ORG_ID = process.env.PDKS_ORG_ID || (() => {
  throw new Error('PDKS_ORG_ID ortam değişkeni tanımlı değil — .env dosyasını kontrol edin');
})();
const PDKS_REQUEST_TIMEOUT_MS = 5000;

const pdksApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    Token: TOKEN,
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept-Language': 'tr',
  },
  timeout: PDKS_REQUEST_TIMEOUT_MS,
});

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

async function hasTodayEntryAtPlace(employeeId: string, placeId: number): Promise<boolean | null> {
  try {
    const date = todayYmd();
    const res = await pdksApi.get(`/organizations/${ORG_ID}/entries`, {
      params: { 'created[gte]': `${date} 00:00:00`, userId: employeeId, limit: 100 },
      validateStatus: () => true,
    });
    if (res.status >= 500) return null;
    const entries = res.data?.data ?? [];
    if (!Array.isArray(entries)) return false;
    return entries.some((e) => e.typeCode === 'in' && Number(e.placeId) === placeId);
  } catch {
    return null;
  }
}

/** true = giriş var, false = yok, null = API hatası (kullanıcıyı bloklama) */
export async function hasTodayAttendance(
  employeeId: string,
  placeId?: number | null,
): Promise<boolean | null> {
  const date = todayYmd();
  try {
    const res = await pdksApi.get('/attendances', {
      params: { organizationId: ORG_ID, date, employeeId },
      validateStatus: () => true,
    });
    if (res.status === 404 || res.data?.error?.code === 404) {
      if (placeId) return hasTodayEntryAtPlace(employeeId, placeId);
      return false;
    }
    if (res.status >= 500) return null;
    if (res.data?.data) return true;
    if (placeId) return hasTodayEntryAtPlace(employeeId, placeId);
    return false;
  } catch {
    return null;
  }
}

export async function getPersoneller(): Promise<any[]> {
  const res = await pdksApi.get(`/organizations/${ORG_ID}/users`);
  return res.data;
}

export async function getPdksUserStatus(userId: string): Promise<number | null> {
  try {
    const res = await pdksApi.get(`/users/${userId}`, { validateStatus: () => true });
    if (res.status >= 400) return null;
    const row = Array.isArray(res.data?.data) ? res.data.data[0] : res.data?.data;
    const status = row?.status;
    return typeof status === 'number' ? status : null;
  } catch {
    return null;
  }
}

/** status: 1=aktif, 0=pasif (Patron panelindeki devre dışı bırak ile aynı) */
export async function setPdksUserStatus(
  userId: string,
  active: boolean,
): Promise<{ success: boolean; status?: number; message?: string }> {
  try {
    const res = await pdksApi.put(
      `/users/${userId}`,
      { status: active ? 1 : 0 },
      { validateStatus: () => true },
    );
    if (res.status >= 400) {
      const msg = res.data?.error?.message ?? `HTTP ${res.status}`;
      return { success: false, message: msg };
    }
    const verified = await getPdksUserStatus(userId);
    const expected = active ? 1 : 0;
    if (verified !== expected) {
      return {
        success: false,
        message: verified == null ? 'PDKS durumu doğrulanamadı' : `Beklenen status=${expected}, gelen=${verified}`,
      };
    }
    return { success: true, status: verified };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'PDKS güncelleme hatası',
    };
  }
}

export async function getGirisler(params?: {
  baslangic?: string; // created[gte]=2026-06-01
  bitis?: string; // created[lte]=2026-06-16
  limit?: number;
}): Promise<any[]> {
  const query: any = {};
  if (params?.baslangic) query['created[gte]'] = params.baslangic;
  if (params?.bitis) query['created[lte]'] = params.bitis;
  if (params?.limit) query['limit'] = params.limit;
  const res = await pdksApi.get(`/organizations/${ORG_ID}/entries`, { params: query });
  return res.data;
}

export async function getKonumlar(): Promise<any[]> {
  const res = await pdksApi.get(`/organizations/${ORG_ID}/places`);
  return res.data;
}

export async function getUserGirisler(
  userId: string,
  params?: { baslangic?: string; bitis?: string },
): Promise<any[]> {
  const query: any = {};
  if (params?.baslangic) query['created[gte]'] = params.baslangic;
  if (params?.bitis) query['created[lte]'] = params.bitis;
  const res = await pdksApi.get(`/users/${userId}/entries`, { params: query });
  return res.data;
}

export async function getPuantaj(params?: {
  baslangic?: string;
  bitis?: string;
}): Promise<any[]> {
  const query: any = {};
  if (params?.baslangic) query['created[gte]'] = params.baslangic;
  if (params?.bitis) query['created[lte]'] = params.bitis;
  const res = await pdksApi.get(`/organizations/${ORG_ID}/reports/timesheet/durations`, { params: query });
  return res.data;
}
