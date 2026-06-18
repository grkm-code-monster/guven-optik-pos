import axios from 'axios'
import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

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
      { label: 'Ürün Yapılandırma', icon: '⚙️', to: '/admin/urun-yapilandirma' },
      { label: 'Garanti & İade', icon: '🔧', to: '/admin/garanti' },
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

  useEffect(() => {
    if (!localStorage.getItem('admin-token')) {
      navigate('/admin/login', { replace: true })
    }
  }, [navigate])

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
        <div style={{ padding: '0 20px 20px', fontWeight: 900, fontSize: 18 }}>Yönetim Paneli</div>
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {MENU.map((group) => (
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
    </div>
  )
}
