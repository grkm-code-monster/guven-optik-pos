/** Gorsel etiketleri tarayici standart yazdirma diyalogu ile yazdir */

export type EtiketGorselSayfa = {
  dataUrl: string
  genislikMm: number
  yukseklikMm: number
}

export function yazdirEtiketGorselleri(sayfalar: EtiketGorselSayfa[]): void {
  if (!sayfalar.length) return

  const w = window.open('', '_blank')
  if (!w) return

  const pagesHtml = sayfalar
    .map(
      (s, i) => `
    <div class="etiket-page${i < sayfalar.length - 1 ? ' page-break' : ''}"
         data-w="${s.genislikMm}" data-h="${s.yukseklikMm}">
      <img src="${s.dataUrl}" alt="Etiket ${i + 1}" />
    </div>`,
    )
    .join('')

  const first = sayfalar[0]
  w.document.write(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Etiket Yazdir</title>
  <style>
    @page {
      size: ${first.genislikMm}mm ${first.yukseklikMm}mm;
      margin: 0;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    .etiket-page { margin: 0; padding: 0; }
    .etiket-page img {
      width: ${first.genislikMm}mm;
      height: ${first.yukseklikMm}mm;
      display: block;
      margin: 0;
    }
    @media print {
      .etiket-page.page-break { page-break-after: always; }
      .etiket-page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`)
  w.document.close()

  w.onload = () => {
    w.focus()
    w.print()
  }
}
