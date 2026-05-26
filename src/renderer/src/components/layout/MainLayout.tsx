import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
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
    <div className="flex h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
