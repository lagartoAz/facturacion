import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Server, Smartphone, Loader2, Wifi } from 'lucide-react'

interface Props {
  onDone: () => void
}

// Shown on an Android device the first time it runs, before any role is chosen.
// The user decides whether this device stores the database (server) or is a
// terminal that connects to one (client). Desktop builds never reach this screen.
export default function RoleSelectScreen({ onDone }: Props): JSX.Element {
  const [step, setStep] = useState<'choose' | 'server'>('choose')
  const [busy, setBusy] = useState<'server' | 'client' | null>(null)
  const [addresses, setAddresses] = useState<string[]>([])
  const [port, setPort] = useState(47600)

  async function chooseServer(): Promise<void> {
    setBusy('server')
    try {
      await window.api.setDeviceRole('server')
      const info = (await window.api.getNetworkInfo()) as {
        addresses?: string[]
        serverPort?: number
      }
      setAddresses(info.addresses ?? [])
      setPort(info.serverPort ?? 47600)
      setStep('server')
    } finally {
      setBusy(null)
    }
  }

  async function chooseClient(): Promise<void> {
    setBusy('client')
    try {
      await window.api.setDeviceRole('client')
      onDone()
    } finally {
      setBusy(null)
    }
  }

  if (step === 'server') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Server className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Este equipo es el servidor</h1>
            <p className="text-sm text-muted-foreground">
              La base de datos se guarda en este dispositivo. Las demas terminales se conectan a las
              siguientes direcciones (misma red WiFi):
            </p>
          </div>

          <div className="rounded-lg border p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wifi className="h-4 w-4" /> Direccion para las terminales
            </div>
            {addresses.length > 0 ? (
              <ul className="space-y-1">
                {addresses.map((ip) => (
                  <li key={ip} className="font-mono text-lg font-semibold">
                    {ip}:{port}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                La direccion se mostrara cuando el servidor este activo y conectado a una red WiFi.
                Puedes verla luego en Ajustes.
              </p>
            )}
          </div>

          <Button className="w-full" onClick={onDone}>
            Continuar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Configura este dispositivo</h1>
          <p className="text-sm text-muted-foreground">
            Elige como funcionara este equipo. Podras cambiarlo luego en Ajustes.
          </p>
        </div>

        <button
          onClick={chooseServer}
          disabled={busy !== null}
          className="w-full text-left rounded-lg border p-5 hover:bg-accent transition-colors disabled:opacity-60"
        >
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              {busy === 'server' ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <Server className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <div className="font-semibold">Servidor (base principal)</div>
              <p className="text-sm text-muted-foreground">
                Guarda la base de datos en este dispositivo y atiende a las demas terminales. Elige
                esta opcion si no tienes una PC servidor.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={chooseClient}
          disabled={busy !== null}
          className="w-full text-left rounded-lg border p-5 hover:bg-accent transition-colors disabled:opacity-60"
        >
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              {busy === 'client' ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <Smartphone className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <div className="font-semibold">Terminal (Acceso)</div>
              <p className="text-sm text-muted-foreground">
                Se conecta por WiFi a un servidor (una PC u otro dispositivo Android) que tiene la
                base de datos.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
