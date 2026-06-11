import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  BarChart3,
  Settings,
  Landmark,
  ClipboardList,
  Truck
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Productos', icon: Package },
  { to: '/suppliers', label: 'Proveedores', icon: Truck },
  { to: '/customers', label: 'Clientes', icon: Users },
  { to: '/quotes', label: 'Presupuestos', icon: ClipboardList },
  { to: '/invoices', label: 'Facturas', icon: FileText },
  { to: '/cash-register', label: 'Caja', icon: Landmark },
  { to: '/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/settings', label: 'Configuracion', icon: Settings }
]

export function AppSidebar(): JSX.Element {
  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <ShoppingCart className="mr-2 h-5 w-5 text-sidebar-primary" />
        <span className="font-semibold text-sidebar-foreground">Facturacion</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        <button
          onClick={() => window.api.openPosWindow()}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <ShoppingCart className="h-4 w-4" />
          Punto de Venta
        </button>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
