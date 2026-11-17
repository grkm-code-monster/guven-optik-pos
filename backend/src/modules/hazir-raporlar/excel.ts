import ExcelJS from 'exceljs';
import type { RaporSonuc } from './tipler';

const FORMAT: Record<string, string | undefined> = {
  para: '#,##0.00',
  sayi: '#,##0.##',
  yuzde: '0.0"%"',
};

export async function excelUret(baslik: string, altBaslik: string, sonuc: RaporSonuc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Güven Optik POS';
  const ws = wb.addWorksheet('Rapor', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.getCell('A1').value = baslik;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = altBaslik;
  ws.getCell('A2').font = { color: { argb: 'FF475569' } };

  const kol = sonuc.kolonlar;
  const baslikSatiri = ws.getRow(4);
  kol.forEach((k, i) => {
    const c = baslikSatiri.getCell(i + 1);
    c.value = k.label;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });

  let r = 5;
  for (const s of sonuc.satirlar) {
    const row = ws.getRow(r++);
    kol.forEach((k, i) => {
      const v = s[k.key];
      const c = row.getCell(i + 1);
      c.value = v === undefined ? null : (v as never);
      const fmt = FORMAT[k.tip];
      if (fmt && typeof v === 'number') c.numFmt = fmt;
    });
  }
  if (kol.some((k) => k.toplam) && sonuc.satirlar.length) {
    const row = ws.getRow(r++);
    kol.forEach((k, i) => {
      const c = row.getCell(i + 1);
      if (i === 0) c.value = 'TOPLAM';
      else if (k.toplam) {
        c.value = sonuc.satirlar.reduce((a, s) => a + (typeof s[k.key] === 'number' ? (s[k.key] as number) : 0), 0);
        const fmt = FORMAT[k.tip];
        if (fmt) c.numFmt = fmt;
      }
      c.font = { bold: true };
      c.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
    });
  }
  if (sonuc.notlar?.length) {
    r++;
    for (const n of sonuc.notlar) {
      ws.getCell(`A${r++}`).value = n;
    }
  }
  kol.forEach((k, i) => {
    const uzun = Math.max(k.label.length, ...sonuc.satirlar.slice(0, 500).map((s) => String(s[k.key] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(10, uzun + 2));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
