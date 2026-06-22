import type jsPDF from 'jspdf'

/** jsPDF metin tabanlı PDF'lerde kullanılacak Türkçe destekli font ailesi */
export const PDF_FONT_FAMILY = 'Roboto'

const FONT_NORMAL_FILE = 'Roboto-Regular.ttf'
const FONT_BOLD_FILE = 'Roboto-Bold.ttf'

const regularFontUrl = new URL('../assets/fonts/Roboto-Regular.ttf', import.meta.url).href
const boldFontUrl = new URL('../assets/fonts/Roboto-Bold.ttf', import.meta.url).href

type FontCache = { regular: string; bold: string }

let fontCache: FontCache | null = null
let fontLoadPromise: Promise<FontCache> | null = null

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function loadFontCache(): Promise<FontCache> {
  if (fontCache) return fontCache
  if (!fontLoadPromise) {
    fontLoadPromise = Promise.all([
      fetch(regularFontUrl).then((res) => {
        if (!res.ok) throw new Error('Roboto-Regular.ttf yüklenemedi')
        return res.arrayBuffer()
      }),
      fetch(boldFontUrl).then((res) => {
        if (!res.ok) throw new Error('Roboto-Bold.ttf yüklenemedi')
        return res.arrayBuffer()
      }),
    ]).then(([regularBuf, boldBuf]) => {
      fontCache = {
        regular: arrayBufferToBase64(regularBuf),
        bold: arrayBufferToBase64(boldBuf),
      }
      return fontCache
    })
  }
  return fontLoadPromise
}

const registeredDocs = new WeakSet<jsPDF>()

/** jsPDF belgesine Roboto normal + bold fontlarını ekler (bir kez / belge) */
export async function registerPdfFonts(doc: jsPDF): Promise<void> {
  const fonts = await loadFontCache()
  if (!registeredDocs.has(doc)) {
    doc.addFileToVFS(FONT_NORMAL_FILE, fonts.regular)
    doc.addFont(FONT_NORMAL_FILE, PDF_FONT_FAMILY, 'normal')
    doc.addFileToVFS(FONT_BOLD_FILE, fonts.bold)
    doc.addFont(FONT_BOLD_FILE, PDF_FONT_FAMILY, 'bold')
    registeredDocs.add(doc)
  }
  doc.setFont(PDF_FONT_FAMILY, 'normal')
}

export async function createPdfDoc(
  options?: ConstructorParameters<typeof import('jspdf').default>[0],
): Promise<jsPDF> {
  const { default: JsPDF } = await import('jspdf')
  const doc = new JsPDF(options)
  await registerPdfFonts(doc)
  return doc
}
