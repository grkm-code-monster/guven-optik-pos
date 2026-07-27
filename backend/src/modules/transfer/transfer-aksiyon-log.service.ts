import { prisma } from '../../database/prisma';

export type TransferAksiyonTipi =
  | 'EFATURA'
  | 'EIRSALIYE'
  | 'UTS_VERME'
  | 'UTS_ALMA'
  | 'ENVANTER';

export type TransferAksiyonDurumu = 'basarili' | 'basarisiz' | 'atlandi';

export async function logTransferAksiyon(input: {
  transferRef: string;
  aksiyon: TransferAksiyonTipi;
  durum: TransferAksiyonDurumu;
  mesaj?: string;
  kayitId?: string;
}): Promise<void> {
  try {
    await prisma.transferAksiyonLog.create({
      data: {
        transferRef: input.transferRef,
        aksiyon: input.aksiyon,
        durum: input.durum,
        mesaj: input.mesaj,
        kayitId: input.kayitId,
      },
    });
  } catch (err) {
    console.warn('[TransferAksiyonLog]', err instanceof Error ? err.message : err);
  }
}

/** En son aksiyon kaydını güncelle (outbox doğrulama sonrası) */
export async function updateLatestTransferAksiyonLog(input: {
  transferRef: string;
  aksiyon: TransferAksiyonTipi;
  durum: TransferAksiyonDurumu;
  mesaj?: string;
  kayitId?: string;
}): Promise<boolean> {
  try {
    const latest = await prisma.transferAksiyonLog.findFirst({
      where: { transferRef: input.transferRef, aksiyon: input.aksiyon },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return false;
    await prisma.transferAksiyonLog.update({
      where: { id: latest.id },
      data: {
        durum: input.durum,
        mesaj: input.mesaj,
        kayitId: input.kayitId ?? latest.kayitId,
      },
    });
    return true;
  } catch (err) {
    console.warn('[TransferAksiyonLog] update', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function listTransferAksiyonLogs(opts: {
  transferRef?: string;
  transferRefs?: string[];
  limit?: number;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const refs = [
    ...(opts.transferRef ? [opts.transferRef.trim()] : []),
    ...(opts.transferRefs ?? []).map((r) => r.trim()).filter(Boolean),
  ];
  const uniqueRefs = [...new Set(refs)];

  return prisma.transferAksiyonLog.findMany({
    where: uniqueRefs.length ? { transferRef: { in: uniqueRefs } } : undefined,
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });
}

/** transferRef → { EFATURA, EIRSALIYE, UTS_VERME, UTS_ALMA } son durum */
export function summarizeTransferAksiyonLogs(
  logs: Array<{ transferRef: string; aksiyon: string; durum: string; mesaj: string | null }>,
): Record<string, Record<string, { durum: string; mesaj: string | null }>> {
  const out: Record<string, Record<string, { durum: string; mesaj: string | null }>> = {};
  for (const row of logs) {
    if (!out[row.transferRef]) out[row.transferRef] = {};
    const prev = out[row.transferRef][row.aksiyon];
    if (!prev) {
      out[row.transferRef][row.aksiyon] = { durum: row.durum, mesaj: row.mesaj };
    }
  }
  return out;
}
