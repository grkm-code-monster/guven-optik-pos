import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth.store'

interface Mesaj {
  role: 'user' | 'assistant'
  content: string
}

function chatApi() {
  const token = useAuthStore.getState().token || localStorage.getItem('admin-token')
  return axios.create({
    baseURL: '/api',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

export default function ChatbotPanel({ onKapat }: { onKapat: () => void }) {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([
    {
      role: 'assistant',
      content:
        'Merhaba! Ben Güven Asistan. Sistem kullanımı hakkında sana adım adım yardımcı olabilirim. Ne yapmak istiyorsun?',
    },
  ])
  const [input, setInput] = useState('')
  const [yukluyor, setYukluyor] = useState(false)
  const [kalanHak, setKalanHak] = useState<number | null>(null)
  const altRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatApi()
      .get('/chatbot/durum')
      .then((r) => setKalanHak(r.data.kalanHak))
      .catch(() => setKalanHak(null))
  }, [])

  useEffect(() => {
    altRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mesajlar])

  const gonder = async () => {
    if (!input.trim() || yukluyor) return

    const yeniMesaj: Mesaj = { role: 'user', content: input.trim() }
    const guncellenmis = [...mesajlar, yeniMesaj]
    setMesajlar(guncellenmis)
    setInput('')
    setYukluyor(true)

    try {
      const { data } = await chatApi().post('/chatbot/mesaj', {
        mesaj: yeniMesaj.content,
        gecmisMesajlar: guncellenmis.slice(-10),
      })

      if (data.basarili) {
        setMesajlar((m) => [...m, { role: 'assistant', content: data.yanit }])
        setKalanHak(data.kalanHak)
      } else {
        setMesajlar((m) => [...m, { role: 'assistant', content: `⚠️ ${data.hata}` }])
      }
    } catch {
      setMesajlar((m) => [...m, { role: 'assistant', content: '⚠️ Bağlantı hatası, tekrar dene.' }])
    } finally {
      setYukluyor(false)
    }
  }

  const hizliSorular = [
    'Satış nasıl yapılır?',
    'Transfer nasıl gönderilir?',
    'UTS bildirimi nasıl yapılır?',
    'Fatura durumu nasıl kontrol edilir?',
  ]

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-white rounded-xl shadow-2xl flex flex-col border border-gray-200 z-50">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-600 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-white text-lg">🤖</span>
          <div>
            <div className="text-white font-semibold text-sm">Güven Asistan</div>
            {kalanHak !== null && (
              <div className="text-blue-200 text-xs">{kalanHak} mesaj hakkın kaldı</div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onKapat}
          className="text-white hover:text-blue-200 text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {mesajlar.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {yukluyor && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-500 rounded-bl-none">
              Yazıyor...
            </div>
          </div>
        )}
        <div ref={altRef} />
      </div>

      {mesajlar.length === 1 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {hizliSorular.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-1 hover:bg-blue-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-3 pb-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && gonder()}
          placeholder="Nasıl yardımcı olabilirim?"
          disabled={yukluyor || kalanHak === 0}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={gonder}
          disabled={yukluyor || !input.trim() || kalanHak === 0}
          className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Gönder
        </button>
      </div>
    </div>
  )
}

export function ChatbotButon() {
  const [acik, setAcik] = useState(false)
  const token = useAuthStore((s) => s.token)
  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('admin-token') : null

  if (!token && !adminToken) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className="fixed bottom-4 right-4 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 text-xl font-bold z-40 flex items-center justify-center"
        title="Yardım"
      >
        ?
      </button>
      {acik && <ChatbotPanel onKapat={() => setAcik(false)} />}
    </>
  )
}
