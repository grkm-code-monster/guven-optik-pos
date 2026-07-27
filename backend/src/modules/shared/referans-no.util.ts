import { prisma } from '../../database/prisma';

/** YYYYMMDD — yerel tarih (sunucu TZ) */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatSeq(n: number): string {
  return String(n).padStart(5, '0');
}

/** Postgres INSERT … ON CONFLICT ile atomik sıra artırımı */
async function nextSequence(key: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ deger: number }>>`
    INSERT INTO "SequenceCounter" ("key", "deger", "updatedAt")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "deger" = "SequenceCounter"."deger" + 1,
          "updatedAt" = NOW()
    RETURNING "deger"
  `;
  return rows[0]?.deger ?? 1;
}

/** GVNU-YYYYAAGG-00001 — global günlük ürün referansı */
export async function generateUrunReferansNo(): Promise<string> {
  const date = todayKey();
  const seq = await nextSequence(`URUN-${date}`);
  return `GVNU-${date}-${formatSeq(seq)}`;
}

/** GVNS-YYYYAAGG-ŞUBEKODU-00001 — şube bazlı günlük satış referansı */
export async function generateSatisReferansNo(subeKodu: string): Promise<string> {
  const date = todayKey();
  const sube = String(subeKodu ?? '').trim().toUpperCase() || 'GVN1';
  const seq = await nextSequence(`SATIS-${date}-${sube}`);
  return `GVNS-${date}-${sube}-${formatSeq(seq)}`;
}
