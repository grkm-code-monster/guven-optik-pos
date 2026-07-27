/** GİB belge numarası: 3 hane seri + 4 hane yıl + 9 hane sıra = 16 karakter */

export function belgeNoPrefixFromSube(sube: string, yil = new Date().getFullYear()): string {
  const subeKodu = sube.replace('GVN', 'GN').padEnd(3, '0').substring(0, 3);
  return `${subeKodu}${yil}`;
}

export function belgeNoUret(sube: string, siraNo: number, yil?: number): string {
  const prefix = belgeNoPrefixFromSube(sube, yil);
  const sira = siraNo.toString().padStart(9, '0');
  return `${prefix}${sira}`;
}

export function parseBelgeSiraNo(belgeNo: string, prefix: string): number | null {
  if (!belgeNo.startsWith(prefix)) return null;
  const sira = Number.parseInt(belgeNo.slice(prefix.length), 10);
  return Number.isFinite(sira) ? sira : null;
}

export const irsaliyeNoUret = belgeNoUret;
export const faturaNoUret = belgeNoUret;
