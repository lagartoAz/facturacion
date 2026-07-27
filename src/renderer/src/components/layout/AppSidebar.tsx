import { useState } from 'react'
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
  Truck,
  PanelLeftClose,
  PanelLeftOpen
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
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )

  const toggleCollapsed = (): void => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', String(next))
      return next
    })
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-sidebar transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b',
          collapsed ? 'justify-center px-2' : 'px-4'
        )}
      >
        {!collapsed && (
          <>
            <ShoppingCart className="mr-2 h-5 w-5 text-sidebar-primary" />
            <span className="font-semibold text-sidebar-foreground">NOTAS</span>
          </>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir' : 'Encoger'}
          className={cn(
            'flex items-center justify-center rounded-md p-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            !collapsed && 'ml-auto'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        <button
          onClick={() => window.api.openPosWindow()}
          title={collapsed ? 'Punto de Venta' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            collapsed && 'justify-center px-0',
            'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <ShoppingCart className="h-4 w-4 shrink-0" />
          {!collapsed && 'Punto de Venta'}
        </button>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
