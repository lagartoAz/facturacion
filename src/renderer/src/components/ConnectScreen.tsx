import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Network, Loader2, Radar, CheckCircle2, Server, ChevronRight } from 'lucide-react'
import { discoverServers, serverNeedsAuth, type FoundServer } from '@/lib/discovery'

interface Props {
  initialHost?: string
  onConnected: () => void
}

type Phase = 'scanning' | 'pick' | 'password' | 'manual'

// Full-screen gate shown on a client ("Acceso") terminal until it connects to the
// primary/server PC. It first tries to reconnect to the last server, then scans
// the LAN; it connects automatically to an open server and only asks for the
// access key when the server requires one. Manual IP entry stays as a fallback.
export default function ConnectScreen({ initialHost, onConnected }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [server, setServer] = useState<FoundServer | null>(null)
  const [servers, setServers] = useState<FoundServer[]>([])
  const [host, setHost] = useState(initialHost || '')
  const [key, setKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<{ scanned: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Take one chosen server: connect silently if it is open, otherwise show the
  // access-key field.
  const proceedWith = useCallback(
    async (srv: FoundServer) => {
      setServer(srv)
      setHost(srv.host)
      setError('')
      setConnecting(true)
      try {
        const needs = await serverNeedsAuth(srv.host, srv.port)
        if (!needs) {
          const res = await window.api.clientConnect(srv.host, '', srv.port)
          if (res.ok) {
            onConnected()
            return
          }
          setError(res.error || '')
        }
        setPhase('password')
      } finally {
        setConnecting(false)
      }
    },
    [onConnected]
  )

  const runDiscovery = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setPhase('scanning')
    setError('')
    setKey('')
    setProgress(null)
    setServers([])

    // 1. Fast reconnect to the last saved server (host + token).
    try {
      const re = await window.api.autoReconnect()
      if (re?.ok) {
        onConnected()
        return
      }
    } catch {
      // channel unavailable on some builds; fall through to scanning
    }
    if (ac.signal.aborted) return

    // 2. Scan the LAN for servers.
    let found: FoundServer[] = []
    try {
      found = await discoverServers({
        lastHost: (initialHost || '').trim() || undefined,
        signal: ac.signal,
        onProgress: (scanned, total) => setProgress({ scanned, total })
      })
    } catch {
      found = []
    }
    if (ac.signal.aborted) return

    // 3. 0 -> manual, 1 -> auto, many -> let the user pick.
    if (found.length === 0) {
      setPhase('manual')
    } else if (found.length === 1) {
      await proceedWith(found[0])
    } else {
      setServers(found)
      setPhase('pick')
    }
  }, [initialHost, onConnected, proceedWith])

  useEffect(() => {
    void runDiscovery()
    return () => abortRef.current?.abort()
  }, [runDiscovery])

  async function connect(targetHost: string, targetPort?: number): Promise<void> {
    setError('')
    const h = targetHost.trim()
    if (!h) {
      setError('Escribe la direccion IP del servidor')
      return
    }
    setConnecting(true)
    try {
      const res = await window.api.clientConnect(h, key, targetPort)
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

        {phase === 'scanning' && (
          <div className="space-y-4 rounded-lg border p-5 text-center">
            <Radar className="mx-auto h-10 w-10 text-primary animate-pulse" />
            <div className="space-y-1">
              <p className="font-medium">Buscando la base en la red...</p>
              <p className="text-xs text-muted-foreground">
                {progress
                  ? `Revisando equipos (${progress.scanned}/${progress.total})`
                  : 'Esto toma unos segundos.'}
              </p>
            </div>
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                abortRef.current?.abort()
                setPhase('manual')
              }}
            >
              Escribir IP manualmente
            </Button>
          </div>
        )}

        {phase === 'pick' && (
          <div className="space-y-4 rounded-lg border p-5">
            <p className="text-sm text-muted-foreground">
              Se encontraron varias bases en la red. Elige a cuál conectarte:
            </p>
            <div className="space-y-2">
              {servers.map((s) => (
                <button
                  key={`${s.host}:${s.port}`}
                  disabled={connecting}
                  onClick={() => void proceedWith(s)}
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-muted/50 disabled:opacity-50"
                >
                  <Server className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.host}</div>
                    {s.version && (
                      <div className="text-xs text-muted-foreground">Versión {s.version}</div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-md p-2">
                {error}
              </div>
            )}
            <div className="flex justify-between text-xs">
              <button className="text-primary hover:underline" onClick={() => void runDiscovery()}>
                Buscar de nuevo
              </button>
              <button
                className="text-muted-foreground hover:underline"
                onClick={() => {
                  abortRef.current?.abort()
                  setPhase('manual')
                }}
              >
                Escribir IP manualmente
              </button>
            </div>
          </div>
        )}

        {phase === 'password' && (
          <div className="space-y-4 rounded-lg border p-5">
            <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/30 p-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <span>
                Base encontrada en <strong>{server?.host || host}</strong>. Escribe la clave de
                acceso para conectar.
              </span>
            </div>
            <div className="space-y-2">
              <Label>Clave de acceso</Label>
              <Input
                type="password"
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="La misma clave configurada en el servidor"
                onKeyDown={(e) => e.key === 'Enter' && connect(server?.host || host, server?.port)}
              />
            </div>
            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-md p-2">
                {error}
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => connect(server?.host || host, server?.port)}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                'Conectar'
              )}
            </Button>
            <div className="flex justify-between text-xs">
              <button className="text-primary hover:underline" onClick={() => void runDiscovery()}>
                Buscar de nuevo
              </button>
              <button
                className="text-muted-foreground hover:underline"
                onClick={() => setPhase('manual')}
              >
                Escribir otra IP
              </button>
            </div>
          </div>
        )}

        {phase === 'manual' && (
          <div className="space-y-4 rounded-lg border p-5">
            <div className="space-y-2">
              <Label>Direccion IP del servidor</Label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="Ej: 192.168.1.50"
                onKeyDown={(e) => e.key === 'Enter' && connect(host)}
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
                onKeyDown={(e) => e.key === 'Enter' && connect(host)}
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-md p-2">
                {error}
              </div>
            )}

            <Button className="w-full" onClick={() => connect(host)} disabled={connecting}>
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                'Conectar'
              )}
            </Button>
            <button
              className="w-full text-center text-xs text-primary hover:underline"
              onClick={() => void runDiscovery()}
            >
              Buscar automáticamente en la red
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Si no conecta: verifica que el servidor este encendido, que esten en la misma red Wi-Fi y
          que el firewall del servidor permita el puerto.
        </p>
      </div>
    </div>
  )
}
