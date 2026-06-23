import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { ChatbotButon } from '../ChatbotPanel'
import { useAuthStore } from '../../store/auth.store'
import { getPosBildirimSayac } from '../../api/bildirim.api'

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const { pathname } = useLocation()
  const [bildirimSayac, setBildirimSayac] = useState(0)

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
        : pathname.startsWith('/reports')
          ? 'Raporlar'
          : pathname.startsWith('/settings')
            ? 'Ayarlar'
            : ''

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              height: '56px',
              backgroundColor: '#C8102E',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
            }}
          >
            <div style={{ fontWeight: 800, letterSpacing: '0.02em' }}>{pageTitle}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              <span style={{ fontSize: '14px' }}>{user?.name}</span>
            </div>
          </div>
          <div style={{ padding: '16px' }}>
            <Outlet />
          </div>
        </div>
      </div>
      <ChatbotButon />
    </div>
  )
}

