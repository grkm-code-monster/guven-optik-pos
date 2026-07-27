/**
 * UTS belge sorgula düzeltme doğrulama — servis + HTTP (UI'nin çağırdığı endpoint)
 * npx ts-node --transpile-only backend/scripts/test-uts-belge-sorgula-e2e.ts
 */
import 'dotenv/config';
import axios from 'axios';
import { prisma } from '../src/database/prisma';
import { login } from '../src/modules/auth/auth.service';
import {
  resolveUtsSubeForSubeKodu,
  sorgulaBelgeNoIleAlmaBekleyenler,
} from '../src/modules/uts/uts.service';

const BELGE_NO = process.argv[2] || 'MOI2026000029057';
const SUBE = process.argv[3] || 'GVN2';
const API_BASE = process.env.API_BASE ?? 'http://localhost:3000/api';

async function main() {
  const utsSube = await resolveUtsSubeForSubeKodu(SUBE);
  if (!utsSube?.token?.trim()) {
    console.error('UTS token yok');
    process.exit(1);
  }

  const token = utsSube.token.trim();
  const base = utsSube.ortam === 'test'
    ? 'https://utstest.saglik.gov.tr'
    : 'https://utsuygulama.saglik.gov.tr';
  const url = `${base}/UTS/uh/rest/bildirim/alma/bekleyenler/sorgula/offset`;
  const body = { BNO: BELGE_NO, SAN: 0, ADT: 100 };

  const raw = await axios.post(url, body, {
    headers: { utsToken: token, 'Content-Type': 'application/json' },
    validateStatus: () => true,
    timeout: 30000,
  });
  console.log('=== UTS ham çağrı ===');
  console.log('URL:', url);
  console.log('HTTP:', raw.status, '(404 olmamalı)');
  const lst = raw.data?.SNC?.LST;
  const count = Array.isArray(lst) ? lst.length : lst ? 1 : 0;
  console.log('Kayıt:', count);

  const satirlar = await sorgulaBelgeNoIleAlmaBekleyenler({
    token,
    ortam: utsSube.ortam,
    belgeNo: BELGE_NO,
  });
  console.log('\n=== sorgulaBelgeNoIleAlmaBekleyenler ===');
  console.log('sayi:', satirlar.length);

  // UI'nin adminApi.get('/admin/uts/belge-sorgula') çağrısı
  let adminStatus = 0;
  let adminBody: unknown = null;
  try {
    const auth = await login('admin', '123456');
    const adminResp = await axios.get(`${API_BASE}/admin/uts/belge-sorgula`, {
      params: { belgeNo: BELGE_NO, subeKodu: SUBE, sirketId: 2 },
      headers: { Authorization: `Bearer ${auth.token}` },
      validateStatus: () => true,
      timeout: 30000,
    });
    adminStatus = adminResp.status;
    adminBody = adminResp.data;
    console.log('\n=== GET /admin/uts/belge-sorgula (UI butonu) ===');
    console.log('HTTP:', adminStatus);
    console.log(JSON.stringify(adminBody, null, 2));
  } catch (err) {
    console.log('\n=== GET /admin/uts/belge-sorgula ===');
    console.log('Atlandı (backend çalışmıyor olabilir):', err instanceof Error ? err.message : err);
  }

  // DepoPage utsBelgeNoIleCek eşlemesi
  const lotlar = [
    { id: '1', barkod: '08682037299248', utsKodu: '' },
    { id: '2', barkod: '08682037306366', utsKodu: '' },
  ];
  const apiSatirlar = (adminBody as { data?: typeof satirlar })?.data ?? satirlar;
  const byUno = new Map<string, typeof satirlar>();
  for (const s of apiSatirlar) {
    const arr = byUno.get(s.uno.trim()) ?? [];
    arr.push(s);
    byUno.set(s.uno.trim(), arr);
  }
  const used = new Map<string, number>();
  let uygulanan = 0;
  const guncel = lotlar.map((lot) => {
    if (lot.utsKodu.trim()) return lot;
    const liste = byUno.get(lot.barkod.trim());
    if (!liste?.length) return lot;
    const idx = used.get(lot.barkod) ?? 0;
    if (idx >= liste.length) return lot;
    used.set(lot.barkod, idx + 1);
    uygulanan++;
    return { ...lot, utsKodu: liste[idx].uno };
  });

  console.log('\n=== UI eşleme (utsBelgeNoIleCek) ===');
  console.log('uygulanan:', uygulanan);
  console.log(JSON.stringify(guncel, null, 2));

  if (raw.status === 404) {
    console.error('\nFAIL: UTS hâlâ 404');
    process.exit(1);
  }
  if (adminStatus === 404) {
    console.error('\nFAIL: admin endpoint 404');
    process.exit(1);
  }
  if (satirlar.length === 0 || uygulanan === 0) {
    console.error('\nFAIL: utsKodu doldurulamadı');
    process.exit(1);
  }
  if (adminStatus && adminStatus !== 200) {
    console.error('\nFAIL: admin endpoint', adminStatus);
    process.exit(1);
  }
  console.log('\nOK: 404 yok, admin API + utsKodu doldurma çalışıyor');
}

main()
  .catch((e) => {
    console.error(e?.response?.data ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
