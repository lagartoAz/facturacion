import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Boxes,
  RefreshCw,
  Wifi,
  WifiOff,
  ArrowLeft,
  Settings,
  Moon,
  Sun
} from 'lucide-react'
import ConnectScreen from '@/components/ConnectScreen'
import { getTheme, setTheme, type Theme } from '@/lib/theme'
import { useInventory } from './useInventory'
import InventoryList from './InventoryList'

// Root of the standalone inventory APK: a LAN client that views the catalogue
// (prices in USD/VES/COP + stock), lets staff add inventory while connected, and
// keeps a local copy so viewing still works offline.
export default function InventoryApp(): JSX.Element {
  const inv = useInventory()
  const [showConnect, setShowConnect] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setThemeState] = useState<Theme>(getTheme())

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  if (inv.loading) return <div className="min-h-screen bg-background" />

  // Must connect at least once (nothing cached yet) or the user asked to connect.
  const needConnect = !inv.connected && !inv.syncedAt && inv.products.length === 0
  if (needConnect || showConnect) {
    return (
      <div className="relative min-h-screen">
        {showConnect && !needConnect && (
          <Button
            variant="outline"
            size="sm"
            className="absolute left-3 top-3 z-10"
            onClick={() => setShowConnect(false)}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Volver
          </Button>
        )}
        <ConnectScreen
          onConnected={async () => {
            setShowConnect(false)
            const ok = await inv.recheck()
            if (ok) await inv.sync()
          }}
        />
      </div>
    )
  }

  const syncedLabel = inv.syncedAt ? new Date(inv.syncedAt).toLocaleString() : null

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 p-3">
          <Boxes className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Inventario</h1>
            {syncedLabel && (
              <p className="text-[11px] text-muted-foreground">Datos del {syncedLabel}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void inv.sync()}
            disabled={!inv.connected || inv.syncing}
            title="Sincronizar"
          >
            <RefreshCw className={`h-5 w-5 ${inv.syncing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            title="Configuraciones"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <InventoryList inv={inv} />
      </main>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configuraciones</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Connection status (moved out of the top bar) */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Conexión</span>
              <span
                className={`inline-flex items-center gap-1 text-sm ${
                  inv.connected ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {inv.connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                {inv.connected ? 'Conectado' : 'Sin conexión'}
              </span>
            </div>

            {/* Theme toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Tema</span>
              <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2">
                {theme === 'dark' ? (
                  <>
                    <Moon className="h-4 w-4" />
                    Oscuro
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4" />
                    Claro
                  </>
                )}
              </Button>
            </div>

            {/* Server connection screen */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSettingsOpen(false)
                setShowConnect(true)
              }}
            >
              Cambiar servidor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
