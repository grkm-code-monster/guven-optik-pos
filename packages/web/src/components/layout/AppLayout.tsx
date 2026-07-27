import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar, { POS_SIDEBAR_WIDTH } from './Sidebar'
import { ChatbotButon } from '../ChatbotPanel'
import { useAuthStore } from '../../store/auth.store'
import { getPosBildirimSayac } from '../../api/bildirim.api'
import { hamburgerButtonStyle, useSidebarResponsive } from '../../hooks/useSidebarResponsive'

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const { pathname } = useLocation()
  const [bildirimSayac, setBildirimSayac] = useState(0)
  const { mobil, sidebarAcik, toggleSidebar, closeSidebar } = useSidebarResponsive('sidebarAcik')

  useEffect(() => {
    const yukle = () => {
      getPosBildirimSayac().then(setBildirimSayac).catch(() => setBildirimSayac(0))
    }
    yukle()
    const t = setInterval(yukle, 60000)
    return () => clearInterval(t)
  }, [])

  const pageTitle =
    pathname === '/'
      ? 'Kontrol Paneli'
      : pathname.startsWith('/sales/new')
        ? 'Yeni Satış'
        : pathname.startsWith('/sales')
          ? 'Satışlar'
          : pathname.startsWith('/musteriler')
            ? 'Müşteriler'
            : pathname.startsWith('/transferler')
              ? 'Transferler'
              : pathname.startsWith('/raporlarim')
                ? 'Hazır Raporlarım'
                : pathname.startsWith('/reports')
                  ? 'Günlük Kasa Raporu'
                  : pathname.startsWith('/masraflar')
                    ? 'Masraflar'
                    : pathname.startsWith('/acik-hesap')
                      ? 'Açık Hesap'
                      : pathname.startsWith('/teslimat')
                        ? 'Teslimat'
                        : pathname.startsWith('/atolye')
                          ? 'Atölye'
                          : pathname.startsWith('/garanti')
                            ? 'Garanti & İade'
                            : pathname.startsWith('/stok-sorgula')
                              ? 'Stok Sorgula'
                              : pathname.startsWith('/settings')
                                ? 'Ayarlar'
                                : ''

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', overflowX: 'hidden' }}>
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

      <div style={{ display: 'flex' }}>
        {!mobil ? (
          <div
            style={{
              width: sidebarAcik ? POS_SIDEBAR_WIDTH : 0,
              flexShrink: 0,
              overflow: 'hidden',
              transition: 'width 0.2s ease',
            }}
          >
            <Sidebar acik={sidebarAcik} mobil={false} onKapat={closeSidebar} />
          </div>
        ) : (
          <Sidebar acik={sidebarAcik} mobil onKapat={closeSidebar} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              height: '56px',
              backgroundColor: '#C8102E',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: mobil ? '0 8px' : '0 16px',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <button
                type="button"
                aria-label="Menüyü aç/kapat"
                onClick={toggleSidebar}
                style={hamburgerButtonStyle()}
              >
                ☰
              </button>
              <div
                style={{
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {pageTitle}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{ position: 'relative', fontSize: 18, lineHeight: 1 }} title="Bildirimler">
                🔔
                {bildirimSayac > 0 ? (
                  <span style={{
                    position: 'absolute', top: -6, right: -10, backgroundColor: '#fff',
                    color: '#C8102E', fontSize: 10, fontWeight: 800, borderRadius: 10,
                    minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                  }}>
                    {bildirimSayac > 99 ? '99+' : bildirimSayac}
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: '14px', maxWidth: mobil ? 80 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </span>
            </div>
          </div>
          <div style={{ padding: mobil ? '8px' : '16px' }}>
            <Outlet />
          </div>
        </div>
      </div>
      <ChatbotButon />
    </div>
  )
}
