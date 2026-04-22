import { Routes, Route } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import DashboardPage from './pages/DashboardPage'
import PosPage from './pages/PosPage'
import ProductsPage from './pages/ProductsPage'
import CustomersPage from './pages/CustomersPage'
import InvoicesPage from './pages/InvoicesPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
