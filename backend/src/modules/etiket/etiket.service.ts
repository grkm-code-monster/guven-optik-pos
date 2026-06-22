export type EtiketInput = {
  urunAdi: string;
  seriNo: string;
  fiyat: number | string;
  barkod?: string | null;
};

function truncate(str: string, max: number): string {
  const s = String(str ?? '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function formatFiyat(fiyat: number | string): string {
  const n = Number(fiyat);
  if (!Number.isFinite(n)) return '0,00';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeZpl(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~');
}

export function generateZpl(etiketler: EtiketInput[]): string {
  const blocks: string[] = [];
  for (const e of etiketler) {
    const urunAdi = escapeZpl(truncate(e.urunAdi, 28));
    const seriNo = escapeZpl(String(e.seriNo ?? '').trim() || '-');
    const fiyatStr = escapeZpl(`${formatFiyat(e.fiyat)} TL`);
    const barkod = escapeZpl(String(e.barkod ?? '').trim() || seriNo);
    blocks.push(`^XA
^FO20,10^A0N,18,18^FD${urunAdi}^FS
^FO20,32^A0N,15,15^FDSeri: ${seriNo}^FS
^FO20,50^A0N,18,18^FD${fiyatStr}^FS
^FO20,70^BCN,35,Y,N,N^FD${barkod}^FS
^XZ`);
  }
  return blocks.join('\n');
}
