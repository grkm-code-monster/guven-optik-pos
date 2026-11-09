import type { EtiketDil } from '../../api/etiket.api'

/** 09.11.2026 — Etiket yazıcısı dili seçimi (Argox PPLA / Zebra ZPL). Seçim bu bilgisayarda hatırlanır. */
export function yaziciDiliKaydet(dil: EtiketDil): void {
  try {
    localStorage.setItem('etiketYaziciDili', dil)
  } catch {
    // tarayıcı depolaması kapalıysa sadece bu oturumda geçerli
  }
}

/** Ham etiket kodunu .txt olarak İndirilenler'e kaydeder (mağazada yazıcıya bu dosyadan gönderiliyor). */
export function hamEtiketKoduIndir(kod: string, dil: EtiketDil): void {
  if (!kod) return
  const blob = new Blob([kod], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `etiket-${dil === 'zpl' ? 'zebra' : 'argox'}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
