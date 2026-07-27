/**
 * Adım 3 — Personel backfill (Odoo bağlantısı + şube ataması)
 * npx tsx backend/scripts/personel-backfill-adim3.ts
 */
import axios from 'axios';
import { prisma } from '../src/database/prisma';
import { execute } from '../src/modules/odoo/odoo.service';
import { getKonumlar } from '../src/modules/pdks/pdks.service';
import {
  ODOO_SKIP_IDS,
  branchCodeFromOdooDepartment,
  personelMatchesOdooName,
  syncPersonelSubeFromBranchCode,
  syncPersonelSubeFromUserId,
} from '../src/modules/admin/personel-sube-sync';

const PDKS_ORG_ID = process.env.PDKS_ORG_ID!;
const PDKS_TOKEN = process.env.PDKS_TOKEN!;
const PDKS_BASE = 'https://app.patronpdks.com/api/v4';
const PDKS_GUN = 45;

type OdooEmp = { id: number; name: string; department_id?: [number, string] | false };

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
}

function placeBranchCodeFromName(name: string): string | null {
  const m = name.match(/1959\s*[-–]?\s*(\d+)/i) || name.match(/\b(\d+)\b/);
  if (m && name.toUpperCase().includes('OPTİK')) {
    const n = m[1];
    if (n === '0') return null;
    return `GVN${n}`;
  }
  if (/yönetim/i.test(name)) return 'YONETIM';
  if (/depo/i.test(name)) return 'ANADEPO';
  return null;
}

async function buildPlaceToBranchMap(): Promise<Map<number, string>> {
  const raw = await getKonumlar();
  const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data ?? [];
  const map = new Map<number, string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = Number(o.id);
    const name = String(o.name ?? o.title ?? '');
    if (!Number.isFinite(id)) continue;
    const code = placeBranchCodeFromName(name);
    if (code) map.set(id, code);
  }
  return map;
}

async function fetchPdksEntriesSince(since: string): Promise<Array<{ userId: number; placeId: number; typeCode: string }>> {
  const res = await axios.get(`${PDKS_BASE}/organizations/${PDKS_ORG_ID}/entries`, {
    headers: { Token: PDKS_TOKEN, 'Accept-Language': 'tr' },
    params: { 'created[gte]': `${since} 00:00:00`, limit: 5000 },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    throw new Error(`PDKS entries HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`);
  }
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows.map((e: { userId: number; placeId: number; typeCode: string }) => ({
    userId: Number(e.userId),
    placeId: Number(e.placeId),
    typeCode: String(e.typeCode),
  }));
}

function mostFrequentPlace(
  pdksId: string,
  entries: Array<{ userId: number; placeId: number; typeCode: string }>,
): number | null {
  const uid = Number(pdksId);
  const counts = new Map<number, number>();
  for (const e of entries) {
    if (e.userId !== uid || e.typeCode !== 'in') continue;
    counts.set(e.placeId, (counts.get(e.placeId) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [placeId, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = placeId;
    }
  }
  return bestN > 0 ? best : null;
}

async function main() {
  console.log('=== Adım 3: Personel backfill ===\n');

  const personeller = await prisma.personel.findMany({ where: { aktif: true } });
  const odooRaw = await execute(
    'hr.employee',
    'search_read',
    [[['active', '=', true]]],
    { fields: ['id', 'name', 'department_id'], limit: 500 },
  ) as OdooEmp[];

  const odooById = new Map(odooRaw.map((e) => [e.id, e]));

  // ── Odoo bağlantısı ──
  let odooBaglandi = 0;
  let odooAtlandi = 0;
  const odooAtlanan: string[] = [];

  for (const emp of odooRaw) {
    if (ODOO_SKIP_IDS.has(emp.id)) {
      odooAtlandi++;
      odooAtlanan.push(`${emp.name} (id=${emp.id}) — skip list`);
      continue;
    }
    const mevcut = personeller.find((p) => p.odooEmployeeId === emp.id);
    if (mevcut) continue;

    const aday = personeller.find(
      (p) => !p.odooEmployeeId && personelMatchesOdooName(p, emp.name),
    );
    if (!aday) {
      odooAtlandi++;
      odooAtlanan.push(`${emp.name} (id=${emp.id}) — Personel eşleşmesi yok`);
      continue;
    }

    await prisma.personel.update({
      where: { id: aday.id },
      data: { odooEmployeeId: emp.id },
    });
    aday.odooEmployeeId = emp.id;
    odooBaglandi++;
  }

  console.log('── Odoo odooEmployeeId bağlantısı ──');
  console.log(`Bağlandı: ${odooBaglandi}`);
  console.log(`Atlandı:  ${odooAtlandi}`);
  if (odooAtlanan.length) {
    for (const s of odooAtlanan) console.log(`  • ${s}`);
  }
  console.log('');

  // ── Şube ataması ──
  const placeMap = await buildPlaceToBranchMap();
  const since = daysAgoYmd(PDKS_GUN);
  console.log(`PDKS giriş kayıtları çekiliyor (${since} → bugün)...`);
  const pdksEntries = await fetchPdksEntriesSince(since);
  console.log(`  ${pdksEntries.length} kayıt alındı\n`);

  let subeOdoo = 0;
  let subePdks = 0;
  let subeUser = 0;
  let subeZaten = 0;
  let subeBulunamadi = 0;
  const bulunamayan: string[] = [];

  const freshPersonel = await prisma.personel.findMany({ where: { aktif: true } });

  for (const p of freshPersonel) {
    if (p.subeId && p.subeAdi) {
      subeZaten++;
      continue;
    }

    // 1) User.branch (POS bağlı)
    if (p.userId) {
      const ok = await syncPersonelSubeFromUserId(p.id, p.userId);
      if (ok) {
        subeUser++;
        continue;
      }
    }

    // 2) Odoo departman
    if (p.odooEmployeeId) {
      const emp = odooById.get(p.odooEmployeeId);
      const deptName = Array.isArray(emp?.department_id) ? emp.department_id[1] : '';
      const code = branchCodeFromOdooDepartment(deptName);
      if (code) {
        const ok = await syncPersonelSubeFromBranchCode(p.id, code);
        if (ok) {
          subeOdoo++;
          continue;
        }
      }
    }

    // 3) PDKS giriş logu
    if (p.pdksId) {
      const placeId = mostFrequentPlace(p.pdksId, pdksEntries);
      if (placeId != null) {
        const code = placeMap.get(placeId);
        if (code) {
          const ok = await syncPersonelSubeFromBranchCode(p.id, code);
          if (ok) {
            subePdks++;
            continue;
          }
        }
      }
    }

    subeBulunamadi++;
    bulunamayan.push(`${p.ad} ${p.soyad} (pdks=${p.pdksId ?? '—'}, odoo=${p.odooEmployeeId ?? '—'})`);
  }

  console.log('── Şube (subeId/subeAdi) ataması ──');
  console.log(`Odoo departman:     ${subeOdoo}`);
  console.log(`PDKS giriş logu:    ${subePdks}`);
  console.log(`User.branch:        ${subeUser}`);
  console.log(`Zaten dolu:         ${subeZaten}`);
  console.log(`Bulunamayan (boş):  ${subeBulunamadi}`);
  if (bulunamayan.length) {
    console.log('\nŞube atanamayanlar:');
    for (const s of bulunamayan) console.log(`  • ${s}`);
  }

  // ── Son durum ──
  const son = {
    toplam: await prisma.personel.count({ where: { aktif: true } }),
    odooDolu: await prisma.personel.count({ where: { aktif: true, odooEmployeeId: { not: null } } }),
    subeIdDolu: await prisma.personel.count({ where: { aktif: true, subeId: { not: null } } }),
    subeAdiDolu: await prisma.personel.count({ where: { aktif: true, subeAdi: { not: null } } }),
    subeBos: await prisma.personel.count({
      where: { aktif: true, OR: [{ subeId: null }, { subeAdi: null }] },
    }),
  };

  console.log('\n── Son durum ──');
  console.log(`Aktif Personel:     ${son.toplam}`);
  console.log(`odooEmployeeId:     ${son.odooDolu}`);
  console.log(`subeId dolu:        ${son.subeIdDolu}`);
  console.log(`subeAdi dolu:       ${son.subeAdiDolu}`);
  console.log(`Şube boş ("—"):     ${son.subeBos}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
