import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
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
import { isMobileApp } from '@/lib/product-image'

export const navItems = [
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

interface AppSidebarProps {
  /** Whether the mobile (portrait) drawer is open. Ignored in landscape. */
  drawerOpen?: boolean
  /** Called after tapping any nav item — used to close the drawer in portrait. */
  onNavigate?: () => void
}

export function AppSidebar({ drawerOpen = false, onNavigate }: AppSidebarProps): JSX.Element {
  // `collapsed` only affects landscape/desktop. In portrait the sidebar is an
  // off-canvas drawer that always shows full-width labels.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )
  const navigate = useNavigate()

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
        'z-50 flex h-full min-h-0 flex-col border-r bg-sidebar transition-[transform,width] duration-200',
        // Portrait: fixed off-canvas drawer that slides in when open.
        'fixed inset-y-0 left-0 w-64 shadow-xl',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
        // Landscape / desktop: static in-flow column, no overlay, own width.
        'landscape:static landscape:translate-x-0 landscape:shadow-none',
        collapsed ? 'landscape:w-16' : 'landscape:w-56'
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b px-4',
          collapsed && 'landscape:justify-center landscape:px-2'
        )}
      >
        <ShoppingCart
          className={cn(
            'mr-2 h-5 w-5 shrink-0 text-sidebar-primary',
            collapsed && 'landscape:mr-0'
          )}
        />
        <span
          className={cn(
            'font-semibold text-sidebar-foreground',
            collapsed && 'landscape:hidden'
          )}
        >
          NOTAS
        </span>
        {/* Collapse toggle is desktop/landscape only — the drawer has no need for it. */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir' : 'Encoger'}
          className={cn(
            'ml-auto hidden items-center justify-center rounded-md p-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground landscape:flex',
            collapsed && 'landscape:ml-0'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        <button
          onClick={() => {
            // On mobile there is no secondary window: navigate to the in-app POS
            // view instead (same screen the Dashboard "Nueva Venta" button opens).
            if (isMobileApp()) {
              navigate('/pos')
            } else {
              window.api.openPosWindow()
            }
            onNavigate?.()
          }}
          title={collapsed ? 'Punto de Venta' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            collapsed && 'landscape:justify-center landscape:px-0',
            'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <ShoppingCart className="h-4 w-4 shrink-0" />
          <span className={cn('truncate', collapsed && 'landscape:hidden')}>Punto de Venta</span>
        </button>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => onNavigate?.()}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                collapsed && 'landscape:justify-center landscape:px-0',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className={cn('truncate', collapsed && 'landscape:hidden')}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
