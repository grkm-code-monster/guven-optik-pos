import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ChatbotButon } from '../../components/ChatbotPanel'
import FiyatBildirimPanel from '../../components/admin/FiyatBildirimPanel'
import { getFiyatBildirimSayac } from '../../api/stok.api'

export const adminApi = axios.create({ baseURL: '/api' })

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin-token')
      localStorage.removeItem('admin-user')
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  },
)

type MenuItem = {
  label: string
  icon?: string
  to: string
}

type MenuGroup = {
  title: string
  items: MenuItem[]
}

const MENU: MenuGroup[] = [
  {
    title: '📊 MAĞAZA YÖNETİMİ',
    items: [
      { label: 'Tanımlamalar', icon: '⚙️', to: '/admin/tanimlamalar' },
      { label: 'Kampanyalar', icon: '🎯', to: '/admin/kampanyalar' },
    ],
  },
  {
    title: '📦 DEPO',
    items: [
      { label: 'Depo Yönetimi', icon: '📦', to: '/admin/depo' },
      { label: 'Stok Yönetimi', icon: '🏷️', to: '/admin/stok-yonetimi' },
      { label: 'Ürün Yapılandırma', icon: '⚙️', to: '/admin/urun-yapilandirma' },
      { label: 'Garanti & İade', icon: '🔧', to: '/admin/garanti' },
      { label: 'UTS Yönetimi', icon: '🏥', to: '/admin/uts' },
    ],
  },
  {
    title: '💰 MUHASEBE & FİNANS',
    items: [
      { label: 'Muhasebe', to: '/admin/muhasebe' },
      { label: 'Finans Yönetimi', to: '/admin/finans' },
      { label: 'İK & Prim', to: '/admin/ik' },
    ],
  },
  {
    title: '👑 PATRON PANELİ',
    items: [{ label: 'Patron Görünümü', icon: '👑', to: '/admin/patron' }],
  },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [bildirimSayac, setBildirimSayac] = useState(0)
  const [bildirimAcik, setBildirimAcik] = useState(false)

  const adminUser = (() => {
    try {
      const raw = localStorage.getItem('admin-user')
      return raw ? JSON.parse(raw) as { role?: string } : null
    } catch {
      return null
    }
  })()

  const menu = useMemo(() => {
    const role = adminUser?.role
    if (role === 'STORE_MANAGER') {
      return MENU.map((g) => ({
        ...g,
        items: g.items.filter((i) => i.to !== '/admin/stok-yonetimi'),
      }))
    }
    return MENU
  }, [adminUser?.role])

  useEffect(() => {
    if (!localStorage.getItem('admin-token')) {
      navigate('/admin/login', { replace: true })
    }
  }, [navigate])

  const sayacYukle = () => {
    getFiyatBildirimSayac()
      .then(setBildirimSayac)
      .catch(() => setBildirimSayac(0))
  }

  useEffect(() => {
    sayacYukle()
    const t = setInterval(sayacYukle, 60000)
    return () => clearInterval(t)
  }, [])

  function logout() {
    localStorage.removeItem('admin-token')
    localStorage.removeItem('admin-user')
    navigate('/admin/login', { replace: true })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          backgroundColor: '#1a1a2e',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 0',
        }}
      >
        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Yönetim Paneli</div>
          <button
            type="button"
            onClick={() => setBildirimAcik(true)}
            title="Fiyat değişiklik bildirimleri"
            style={{
              position: 'relative', border: 'none', background: 'rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16,
            }}
          >
            🔔
            {bildirimSayac > 0 ? (
              <span style={{
                position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444',
                color: 'white', fontSize: 10, fontWeight: 800, borderRadius: 10,
                minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {bildirimSayac > 99 ? '99+' : bildirimSayac}
              </span>
            ) : null}
          </button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {menu.map((group) => (
            <div key={group.title} style={{ marginBottom: 16 }}>
              <div
                style={{
                  padding: '8px 20px',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                {group.title}
              </div>
              {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 20px',
                      fontSize: 14,
                      fontWeight: isActive ? 800 : 500,
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                      textDecoration: 'none',
                      backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                    })}
                  >
                    {item.icon ? <span>{item.icon}</span> : null}
                    {item.label}
                  </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={logout}
          style={{
            margin: '12px 20px 0',
            padding: '12px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Çıkış
        </button>
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <Outlet />
      </main>
      <ChatbotButon />
      <FiyatBildirimPanel
        acik={bildirimAcik}
        onKapat={() => setBildirimAcik(false)}
        onSayacGuncelle={sayacYukle}
      />
    </div>
  )
}
