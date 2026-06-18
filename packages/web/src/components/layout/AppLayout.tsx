import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { ChatbotButon } from '../ChatbotPanel'
import { useAuthStore } from '../../store/auth.store'

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const { pathname } = useLocation()

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
            <div style={{ fontSize: '14px' }}>{user?.name}</div>
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

