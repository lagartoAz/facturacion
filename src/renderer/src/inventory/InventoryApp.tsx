import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Boxes, RefreshCw, Wifi, WifiOff, ArrowLeft } from 'lucide-react'
import ConnectScreen from '@/components/ConnectScreen'
import { useInventory } from './useInventory'
import InventoryList from './InventoryList'

// Root of the standalone inventory APK: a LAN client that views the catalogue
// (prices in USD/VES/COP + stock), lets staff add inventory while connected, and
// keeps a local copy so viewing still works offline.
export default function InventoryApp(): JSX.Element {
  const inv = useInventory()
  const [showConnect, setShowConnect] = useState(false)

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 p-3">
          <Boxes className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Inventario</h1>
            {syncedLabel && (
              <p className="text-[11px] text-muted-foreground">Datos del {syncedLabel}</p>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              inv.connected ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {inv.connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {inv.connected ? 'Conectado' : 'Sin conexión'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void inv.sync()}
            disabled={!inv.connected || inv.syncing}
            title="Sincronizar"
          >
            <RefreshCw className={`h-5 w-5 ${inv.syncing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowConnect(true)}>
            Servidor
          </Button>
        </div>
      </header>

      <InventoryList inv={inv} />
    </div>
  )
}
