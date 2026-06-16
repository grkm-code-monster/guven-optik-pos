import axios from 'axios';

const BASE_URL = 'https://app.patronpdks.com/api/v4';
const TOKEN = process.env.PDKS_TOKEN ?? 'Nd95w3E276KuZ0dp8DxpQSRmBKXN9cVXq30W7FZe';
const ORG_ID = process.env.PDKS_ORG_ID ?? '2796';

const pdksApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    Token: TOKEN,
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept-Language': 'tr',
  },
});

export async function getPersoneller(): Promise<any[]> {
  const res = await pdksApi.get(`/organizations/${ORG_ID}/users`);
  return res.data;
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
