import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Network, Loader2 } from 'lucide-react'

interface Props {
  initialHost?: string
  onConnected: () => void
}

// Full-screen gate shown on a client ("Acceso") terminal until it connects to the
// primary/server PC with the correct access key.
export default function ConnectScreen({ initialHost, onConnected }: Props): JSX.Element {
  const [host, setHost] = useState(initialHost || '')
  const [key, setKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  async function connect(): Promise<void> {
    setError('')
    if (!host.trim()) {
      setError('Escribe la direccion IP del servidor')
      return
    }
    setConnecting(true)
    try {
      const res = await window.api.clientConnect(host.trim(), key)
      if (res.ok) onConnected()
      else setError(res.error || 'No se pudo conectar')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Network className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Terminal de Acceso</h1>
          <p className="text-sm text-muted-foreground">
            Conecta con el equipo servidor (la base de datos principal) para empezar.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border p-5">
          <div className="space-y-2">
            <Label>Direccion IP del servidor</Label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="Ej: 192.168.1.50"
              onKeyDown={(e) => e.key === 'Enter' && connect()}
            />
            <p className="text-xs text-muted-foreground">
              Es la direccion que aparece en el servidor, en Configuracion → Red / Multi-terminal.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Clave de acceso</Label>
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="La misma clave configurada en el servidor"
              onKeyDown={(e) => e.key === 'Enter' && connect()}
            />
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-md p-2">
              {error}
            </div>
          )}

          <Button className="w-full" onClick={connect} disabled={connecting}>
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              'Conectar'
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Si no conecta: verifica que el servidor este encendido, que la clave sea la misma y que el
          firewall del servidor permita el puerto.
        </p>
      </div>
    </div>
  )
}
