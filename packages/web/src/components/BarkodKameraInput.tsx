import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  onScan?: (code: string) => void | Promise<void>
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  kameraEnabled?: boolean
  kameraOpen?: boolean
  onKameraOpenChange?: (open: boolean) => void
  placeholder?: string
  disabled?: boolean
  inputStyle?: React.CSSProperties
  containerStyle?: React.CSSProperties
}

export default function BarkodKameraInput({
  value,
  onChange,
  onScan,
  onKeyDown,
  kameraEnabled = true,
  kameraOpen,
  onKameraOpenChange,
  placeholder,
  disabled,
  inputStyle,
  containerStyle,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = kameraOpen ?? internalOpen
  const setOpen = onKameraOpenChange ?? setInternalOpen
  const videoHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!kameraEnabled && open) setOpen(false)
  }, [kameraEnabled, open, setOpen])

  useEffect(() => {
    if (!open || !kameraEnabled || !videoHostRef.current) return

    let stopped = false
    let stream: MediaStream | null = null
    const host = videoHostRef.current

    async function kapat() {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
      if (host) host.innerHTML = ''
      setOpen(false)
    }

    async function baslat() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })

        const video = document.createElement('video')
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        video.style.width = '100%'
        video.style.maxHeight = '280px'
        video.style.objectFit = 'cover'
        host.innerHTML = ''
        host.appendChild(video)
        await video.play()

        async function kodIsle(kod: string) {
          stopped = true
          if (onScan) await onScan(kod)
          else onChange(kod)
          await kapat()
        }

        if ('BarcodeDetector' in window) {
          const detector = new (window as Window & { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({
            formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'data_matrix'],
          })

          async function tara() {
            if (stopped) return
            try {
              const codes = await detector.detect(video)
              if (codes.length > 0) {
                await kodIsle(codes[0].rawValue)
                return
              }
            } catch {
              // scan frame failed, retry
            }
            if (!stopped) requestAnimationFrame(tara)
          }
          requestAnimationFrame(tara)
        } else {
          const { default: jsQR } = await import('jsqr')
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            await kapat()
            return
          }

          async function tara() {
            if (stopped) return
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              ctx.drawImage(video, 0, 0)
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const code = jsQR(imageData.data, imageData.width, imageData.height)
              if (code?.data) {
                await kodIsle(code.data)
                return
              }
            }
            if (!stopped) requestAnimationFrame(tara)
          }
          requestAnimationFrame(tara)
        }
      } catch {
        setOpen(false)
      }
    }

    void baslat()

    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
      if (host) host.innerHTML = ''
    }
  }, [open, kameraEnabled, onChange, onScan, setOpen])

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            marginBottom: 0,
            ...inputStyle,
          }}
        />
        {kameraEnabled ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            disabled={disabled}
            style={{
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              backgroundColor: open ? '#fee2e2' : 'white',
              fontSize: 18,
              cursor: disabled ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              opacity: disabled ? 0.5 : 1,
            }}
            title={open ? 'Kamerayı kapat' : 'Kamera ile barkod oku'}
          >
            {open ? '✕' : '📷'}
          </button>
        ) : null}
      </div>
      {open && kameraEnabled ? (
        <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
          <div ref={videoHostRef} style={{ width: '100%', maxHeight: 280, overflow: 'hidden' }} />
        </div>
      ) : null}
    </div>
  )
}
