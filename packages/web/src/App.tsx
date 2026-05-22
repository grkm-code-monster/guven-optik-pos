import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import NewSalePage from './pages/NewSalePage'
import ReportsPage from './pages/ReportsPage'
import TransferlerPage from './pages/TransferlerPage'
import SettingsPage from './pages/SettingsPage'
import ShiftOpenPage from './pages/ShiftOpenPage'
import MasraflarPage from './pages/MasraflarPage'
import AcikHesapPage from './pages/AcikHesapPage'
import SaleDetailPage from './pages/SaleDetailPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  return user?.role === 'ADMIN' ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/shift/open"
          element={
            <PrivateRoute>
              <ShiftOpenPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="sales/new" element={<NewSalePage />} />
          <Route path="sales/:id" element={<SaleDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="transferler" element={<TransferlerPage />} />
          <Route path="masraflar" element={<MasraflarPage />} />
          <Route path="acik-hesap" element={<AcikHesapPage />} />
          <Route
            path="settings"
            element={
              <AdminRoute>
                <SettingsPage />
              </AdminRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
