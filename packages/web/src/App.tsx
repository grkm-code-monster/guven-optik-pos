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
import StokSorgulaPage from './pages/StokSorgulaPage'
import TeslimatPage from './pages/TeslimatPage'
import GarantiPage from './pages/GarantiPage'
import SaleDetailPage from './pages/SaleDetailPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminLayout from './pages/admin/AdminLayout'
import TanimlamalarPage from './pages/admin/TanimlamalarPage'
import KampanyalarPage from './pages/admin/KampanyalarPage'
import DepoPage from './pages/admin/DepoPage'
import MuhasebePage from './pages/admin/MuhasebePage'
import IKPage from './pages/admin/IKPage'
import FinansPage from './pages/admin/FinansPage'
import PatronPage from './pages/admin/PatronPage'
import RaporMatrisPage from './pages/admin/RaporMatrisPage'
import GarantiYonetimPage from './pages/admin/GarantiYonetimPage'
import UrunYapilandirmaPage from './pages/admin/UrunYapilandirmaPage'
import StokYonetimiPage from './pages/admin/StokYonetimiPage'
import EtiketTasarimciPage from './pages/admin/EtiketTasarimciPage'
import UtsYonetimiPage from './pages/admin/UtsYonetimiPage'
import BelgeYuklePage from './pages/BelgeYuklePage'
import SatislarPage from './pages/SatislarPage'
import MusterilerPage from './pages/MusterilerPage'
import RaporlarimPage from './pages/RaporlarimPage'

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
        <Route path="/belge-yukle/:personelId" element={<BelgeYuklePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<Navigate to="/admin/tanimlamalar" replace />} />
          <Route path="tanimlamalar" element={<TanimlamalarPage />} />
          <Route path="komisyon" element={<Navigate to="/admin/tanimlamalar" replace />} />
          <Route path="kullanicilar" element={<Navigate to="/admin/tanimlamalar" replace />} />
          <Route path="subeler" element={<Navigate to="/admin/tanimlamalar" replace />} />
          <Route path="kampanyalar" element={<KampanyalarPage />} />
          <Route path="depo" element={<DepoPage />} />
          <Route path="stok-yonetimi" element={<StokYonetimiPage />} />
          <Route path="etiket-tasarimci" element={<EtiketTasarimciPage />} />
          <Route path="urun-yapilandirma" element={<UrunYapilandirmaPage />} />
          <Route path="garanti" element={<GarantiYonetimPage />} />
          <Route path="uts" element={<UtsYonetimiPage />} />
          <Route path="muhasebe" element={<MuhasebePage />} />
          <Route path="ik" element={<IKPage />} />
          <Route path="finans" element={<FinansPage />} />
          <Route path="patron" element={<PatronPage />} />
          <Route path="rapor-matris" element={<RaporMatrisPage />} />
        </Route>
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
          <Route path="musteriler" element={<MusterilerPage />} />
          <Route path="sales" element={<SatislarPage />} />
          <Route path="sales/new" element={<NewSalePage />} />
          <Route path="sales/:id" element={<SaleDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="raporlarim" element={<RaporlarimPage />} />
          <Route path="transferler" element={<TransferlerPage />} />
          <Route path="masraflar" element={<MasraflarPage />} />
          <Route path="acik-hesap" element={<AcikHesapPage />} />
          <Route path="teslimat" element={<TeslimatPage />} />
          <Route path="garanti" element={<GarantiPage />} />
          <Route path="stok-sorgula" element={<StokSorgulaPage />} />
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
