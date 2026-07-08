import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

export default function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div
      style={{
        width: '240px',
        backgroundColor: '#C8102E',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
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
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        <NavLink
          to="/"
          end
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
        <NavLink
          to="/garanti"
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
        <NavLink
          to="/stok-sorgula"
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
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginTop: '2px' }}>{user?.role}</div>
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

