import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { canAccessAtolye } from '../../utils/atolyeAccess'

const SIDEBAR_WIDTH = 240

type Props = {
  acik: boolean
  mobil: boolean
  onKapat: () => void
}

const ETICARET_ROLES = new Set(['STORE_MANAGER', 'ADMIN'])

export default function Sidebar({ acik, mobil, onKapat }: Props) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const showAtolye = canAccessAtolye(user)
  const showEticaret = !!user?.role && ETICARET_ROLES.has(user.role)

  const linkKapat = () => {
    if (mobil) onKapat()
  }

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        backgroundColor: '#C8102E',
        minHeight: mobil ? '100vh' : '100%',
        height: mobil ? '100vh' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        ...(mobil
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              zIndex: 50,
              transform: acik ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.2s ease',
            }
          : {}),
      }}
    >
      {/* LOGO */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
        <div style={{ color: 'white', fontSize: '20px', fontWeight: '800', letterSpacing: '0.02em' }}>
          GÜVEN OPTİK
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '2px' }}>1959 · Optik Mağaza POS</div>
      </div>

      {/* NAV */}
      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        <NavLink
          to="/"
          end
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          ⊞ Kontrol Paneli
        </NavLink>
        <div style={{ marginBottom: 4 }}>
          <NavLink
            to="/sales"
            end
            onClick={linkKapat}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px 8px 0 0',
              backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
              color: 'white',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '700',
            })}
          >
            🧾 Satışlar
          </NavLink>
          <NavLink
            to="/sales/new"
            onClick={linkKapat}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px 8px 28px',
              borderRadius: '0 0 8px 8px',
              backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.85)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: '500',
            })}
          >
            ＋ Yeni Satış
          </NavLink>
          <NavLink
            to="/musteriler"
            onClick={linkKapat}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 12px 8px 28px', borderRadius: '8px', marginBottom: '4px',
              backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.85)', textDecoration: 'none',
              fontSize: '13px', fontWeight: '500',
            })}
          >
            👥 Müşteriler
          </NavLink>
        </div>
        <NavLink
          to="/transferler"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          ⇄ Transferler
        </NavLink>
        <NavLink
          to="/raporlarim"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          📈 Hazır Raporlarım
        </NavLink>
        <NavLink
          to="/reports"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          📊 Günlük Kasa Raporu
        </NavLink>
        <NavLink
          to="/masraflar"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          💸 Masraflar
        </NavLink>
        <NavLink
          to="/acik-hesap"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          📋 Açık Hesap
        </NavLink>
        <NavLink
          to="/teslimat"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          🚚 Teslimat
        </NavLink>
        {showAtolye && (
          <NavLink
            to="/atolye"
            onClick={linkKapat}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              marginBottom: '4px',
              backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: 'white',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '500',
            })}
          >
            🔬 Atölye
          </NavLink>
        )}
        <NavLink
          to="/garanti"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          🔧 Garanti & İade
        </NavLink>
        {showEticaret && (
          <NavLink
            to="/eticaret"
            onClick={linkKapat}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              marginBottom: '4px',
              backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: 'white',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '500',
            })}
          >
            🛒 E-Ticaret
          </NavLink>
        )}
        <NavLink
          to="/stok-sorgula"
          onClick={linkKapat}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          })}
        >
          📦 Stok Sorgula
        </NavLink>
      </nav>

      {/* ALT: Kullanıcı */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
        <div style={{ color: 'white', fontSize: '13px', fontWeight: '600' }}>{user?.name}</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginTop: '2px' }}>
          {user?.role}
          {user?.branchCode ? ` · ${user.branchCode}` : ''}
        </div>
        <button
          onClick={logout}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: '10px 16px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '6px',
            color: 'white',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          type="button"
        >
          Çıkış Yap
        </button>
      </div>
    </div>
  )
}

export { SIDEBAR_WIDTH as POS_SIDEBAR_WIDTH }
