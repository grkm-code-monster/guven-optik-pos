import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ChatbotButon } from '../../components/ChatbotPanel'
import BildirimPanel from '../../components/admin/BildirimPanel'
import { getToplamBildirimSayac } from '../../api/bildirim.api'
import { canSeeAdminMenuItem, type AdminUserLite } from '../../constants/ekYetki'
import { hamburgerButtonStyle, useSidebarResponsive } from '../../hooks/useSidebarResponsive'

export const adminApi = axios.create({ baseURL: '/api' })

const ADMIN_SIDEBAR_WIDTH = 260

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:admin-session-expired'))
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
      { label: 'Etiket Tasarımcısı', icon: '🎨', to: '/admin/etiket-tasarimci' },
      { label: 'Etiket Şablonları (Yeni)', icon: '🏷️', to: '/admin/etiket-sablon-duzenleyici' },
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
  const { mobil, sidebarAcik, toggleSidebar, closeSidebar } = useSidebarResponsive('adminSidebarAcik')

  const adminUser = (() => {
    try {
      const raw = localStorage.getItem('admin-user')
      return raw ? JSON.parse(raw) as AdminUserLite : null
    } catch {
      return null
    }
  })()

  const menu = useMemo(() => {
    const role = adminUser?.role
    let groups = MENU.map((g) => ({
      ...g,
      items: g.items.filter((item) =>
        adminUser ? canSeeAdminMenuItem(adminUser, item.to) : false,
      ),
    })).filter((g) => g.items.length > 0)

    if (role === 'ADMIN') {
      groups = [
        ...groups.slice(0, 1),
        {
          title: '📈 RAPOR MOTORU',
          items: [{ label: 'Rapor Matrisi', icon: '📈', to: '/admin/rapor-matris' }],
        },
        {
          title: '🚀 SİSTEM',
          items: [{ label: 'Sunucu Güncelle', icon: '🚀', to: '/admin/deploy' }],
        },
        ...groups.slice(1),
      ]
    }
    return groups
  }, [adminUser])

  useEffect(() => {
    if (!localStorage.getItem('admin-token')) {
      navigate('/admin/login', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    const onExpired = () => {
      localStorage.removeItem('admin-token')
      localStorage.removeItem('admin-user')
      navigate('/admin/login', { replace: true })
    }
    window.addEventListener('auth:admin-session-expired', onExpired)
    return () => window.removeEventListener('auth:admin-session-expired', onExpired)
  }, [navigate])

  const sayacYukle = () => {
    getToplamBildirimSayac()
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

  const linkKapat = () => {
    if (mobil) closeSidebar()
  }

  const asideStyle = {
    width: ADMIN_SIDEBAR_WIDTH,
    backgroundColor: '#1a1a2e',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '20px 0',
    minHeight: mobil ? '100vh' : '100%',
    height: mobil ? '100vh' : 'auto',
    ...(mobil
      ? {
          position: 'fixed' as const,
          top: 0,
          left: 0,
          zIndex: 50,
          transform: sidebarAcik ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease',
        }
      : {}),
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4f6', overflowX: 'hidden' }}>
      {mobil && sidebarAcik ? (
        <button
          type="button"
          aria-label="Menüyü kapat"
          onClick={closeSidebar}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            border: 'none',
            background: 'rgba(0,0,0,0.4)',
            cursor: 'pointer',
            padding: 0,
          }}
        />
      ) : null}

      {!mobil ? (
        <div
          style={{
            width: sidebarAcik ? ADMIN_SIDEBAR_WIDTH : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}
        >
          <aside style={asideStyle}>
            <AdminSidebarNav
              menu={menu}
              linkKapat={linkKapat}
              logout={logout}
            />
          </aside>
        </div>
      ) : (
        <aside style={asideStyle}>
          <AdminSidebarNav
            menu={menu}
            linkKapat={linkKapat}
            logout={logout}
          />
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: 56,
            backgroundColor: '#1a1a2e',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: mobil ? '0 8px' : '0 16px',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <button
              type="button"
              aria-label="Menüyü aç/kapat"
              onClick={toggleSidebar}
              style={hamburgerButtonStyle({ background: 'rgba(255,255,255,0.1)' })}
            >
              ☰
            </button>
            <div
              style={{
                fontWeight: 900,
                fontSize: 18,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Yönetim Paneli
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBildirimAcik(true)}
            title="Bildirimler"
            style={{
              position: 'relative',
              border: 'none',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 16,
              flexShrink: 0,
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
        </header>

        <main style={{ flex: 1, padding: mobil ? 12 : 24, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>

      <ChatbotButon />
      <BildirimPanel
        acik={bildirimAcik}
        onKapat={() => setBildirimAcik(false)}
        onSayacGuncelle={sayacYukle}
      />
    </div>
  )
}

function AdminSidebarNav({
  menu,
  linkKapat,
  logout,
}: {
  menu: MenuGroup[]
  linkKapat: () => void
  logout: () => void
}) {
  return (
    <>
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
                onClick={linkKapat}
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
    </>
  )
}
