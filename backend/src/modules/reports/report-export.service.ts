import path from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { DIMENSIONS, MEASURES } from './report-engine.service';

const FONT_DIR = path.join(__dirname, '../../../../packages/web/src/assets/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Roboto-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Roboto-Bold.ttf');

function columnLabels(keys: string[], dict: Record<string, { label: string }>) {
  return keys.map((key) => dict[key]?.label ?? key);
}

function formatCell(value: unknown): string | number {
  if (value == null) return '';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toLocaleDateString('tr-TR');
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : Number(value.toFixed(2));
  }
  if (typeof value === 'object' && value !== null) {
    const maybeDecimal = value as { toString?: () => string };
    if (typeof maybeDecimal.toString === 'function') {
      const n = Number(maybeDecimal.toString());
      if (!Number.isNaN(n)) return Number.isInteger(n) ? n : Number(n.toFixed(2));
      return maybeDecimal.toString();
    }
  }
  return String(value);
}

function rowValues(row: Record<string, unknown>, keys: string[]) {
  return keys.map((key) => formatCell(row[key]));
}

export async function exportReportExcel(
  queryResult: Record<string, unknown>[],
  dimensions: string[],
  measures: string[],
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rapor');

  ws.addRow(['GÜVEN OPTİK - Rapor']);
  ws.addRow(['Oluşturulma', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
  ws.addRow([]);

  const headers = [...columnLabels(dimensions, DIMENSIONS), ...columnLabels(measures, MEASURES)];
  ws.addRow(headers);

  if (queryResult.length === 0) {
    ws.addRow(['Veri yok']);
  } else {
    for (const row of queryResult) {
      ws.addRow(rowValues(row, [...dimensions, ...measures]));
    }
  }

  ws.getRow(4).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function drawPdfTable(
  doc: InstanceType<typeof PDFDocument>,
  headers: string[],
  rows: Array<Array<string | number>>,
  startY: number,
) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / Math.max(headers.length, 1);
  let y = startY;
  const rowHeight = 18;

  doc.font('Roboto-Bold').fontSize(9);
  headers.forEach((header, i) => {
    doc.text(header, doc.page.margins.left + i * colWidth, y, {
      width: colWidth - 4,
      lineBreak: false,
      ellipsis: true,
    });
  });
  y += rowHeight;

  doc.font('Roboto').fontSize(9);
  for (const row of rows) {
    if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    row.forEach((cell, i) => {
      doc.text(String(cell), doc.page.margins.left + i * colWidth, y, {
        width: colWidth - 4,
        lineBreak: false,
        ellipsis: true,
      });
    });
    y += rowHeight;
  }

  return y;
}

export type TableExportOpts = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

export async function exportTableExcel(opts: TableExportOpts): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Veri');

  ws.addRow(['GÜVEN OPTİK - ' + opts.title]);
  ws.addRow(['Oluşturulma', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
  ws.addRow([]);
  ws.addRow(opts.headers);

  if (opts.rows.length === 0) {
    ws.addRow(['Veri yok']);
  } else {
    for (const row of opts.rows) {
      ws.addRow(row);
    }
  }

  ws.getRow(4).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function exportTablePdf(opts: TableExportOpts): Promise<Buffer> {
  const dataRows =
    opts.rows.length === 0
      ? [['Veri yok', ...opts.headers.slice(1).map(() => '')]]
      : opts.rows;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: opts.headers.length > 5 ? 'landscape' : 'portrait',
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Roboto', FONT_REGULAR);
    doc.registerFont('Roboto-Bold', FONT_BOLD);

    doc.font('Roboto-Bold').fontSize(16).text(opts.title);
    doc.moveDown(0.5);
    doc
      .font('Roboto')
      .fontSize(10)
      .text(`Oluşturulma: ${new Date().toLocaleString('tr-TR')}`);
    doc.moveDown(1);

    drawPdfTable(doc, opts.headers, dataRows, doc.y);

    doc.end();
  });
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportTableCsv(opts: TableExportOpts): Buffer {
  const lines = [
    opts.headers.map(csvEscape).join(';'),
    ...opts.rows.map((row) => row.map(csvEscape).join(';')),
  ];
  return Buffer.from('\uFEFF' + lines.join('\n'), 'utf-8');
}

export async function exportReportPdf(
  queryResult: Record<string, unknown>[],
  dimensions: string[],
  measures: string[],
  reportAdi = 'Rapor',
) {
  const headers = [...columnLabels(dimensions, DIMENSIONS), ...columnLabels(measures, MEASURES)];
  const dataRows =
    queryResult.length === 0
      ? [['Veri yok', ...headers.slice(1).map(() => '')]]
      : queryResult.map((row) => rowValues(row, [...dimensions, ...measures]));

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: headers.length > 5 ? 'landscape' : 'portrait',
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Roboto', FONT_REGULAR);
    doc.registerFont('Roboto-Bold', FONT_BOLD);

    doc.font('Roboto-Bold').fontSize(16).text(reportAdi);
    doc.moveDown(0.5);
    doc
      .font('Roboto')
      .fontSize(10)
      .text(`Oluşturulma: ${new Date().toLocaleString('tr-TR')}`);
    doc.moveDown(1);

    drawPdfTable(doc, headers, dataRows, doc.y);

    doc.end();
  });
}
