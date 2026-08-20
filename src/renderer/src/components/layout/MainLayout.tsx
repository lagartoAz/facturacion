import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSidebar } from './AppSidebar'

function matchesShortcut(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const needsCtrl = parts.includes('ctrl')
  const needsAlt = parts.includes('alt')
  const needsShift = parts.includes('shift')
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === needsCtrl &&
    e.altKey === needsAlt &&
    e.shiftKey === needsShift
  )
}

export function MainLayout(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const shortcutsRef = useRef<Record<string, string>>({})
  // Portrait-only drawer state. In landscape/desktop the sidebar is always visible.
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the drawer whenever the route changes (e.g. tapping a nav item).
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    window.api.getAllSettings().then((s) => {
      shortcutsRef.current = s
    })
  }, [location])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return

      const sc = shortcutsRef.current
      if (matchesShortcut(e, sc.shortcut_open_pos_window ?? 'p')) {
        e.preventDefault()
        window.api.openPosWindow()
      } else if (matchesShortcut(e, sc.shortcut_nav_pos ?? '')) {
        e.preventDefault()
        navigate('/pos')
      } else if (matchesShortcut(e, sc.shortcut_nav_invoices ?? '')) {
        e.preventDefault()
        navigate('/invoices')
      } else if (matchesShortcut(e, sc.shortcut_nav_products ?? '')) {
        e.preventDefault()
        navigate('/products')
      } else if (matchesShortcut(e, sc.shortcut_nav_cash ?? '')) {
        e.preventDefault()
        navigate('/cash-register')
      } else if (matchesShortcut(e, sc.shortcut_nav_reports ?? '')) {
        e.preventDefault()
        navigate('/reports')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Backdrop behind the drawer — portrait only, and only while open. */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity landscape:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />

      <AppSidebar drawerOpen={drawerOpen} onNavigate={() => setDrawerOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with the hamburger — hidden in landscape/desktop. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 landscape:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="flex items-center justify-center rounded-md p-1.5 text-foreground transition-colors hover:bg-accent"
          >
            <Menu className="h-6 w-6" />
          </button>
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="font-semibold">NOTAS</span>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
