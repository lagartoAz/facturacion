// Capacitor/web transport for the renderer.
//
// On Electron the preload injects `window.api` (IPC transport). On Android
// (Capacitor WebView) and in a plain browser there is no preload, so we install
// `window.api` here using the same createApi() factory with an HTTP transport.
//
// The Android app supports two roles, chosen by the user on first launch:
//   - server: this device runs the embedded backend (nodejs-mobile) on
//             localhost:47600 and stores the database; the WebView is a client
//             of its own local server, and other terminals connect over the LAN.
//   - client: a terminal that connects to a remote server (PC or another Android).
// Until a role is chosen the mode is '' and getNetworkInfo reports 'unselected'.

import { createApi, type ThermalConfig } from '../../../shared/create-api'
import { encodeReceipt } from '../../../shared/escpos'
import type { ReceiptData } from '../../../shared/receipt'
import { PROXIED_CHANNELS, SERVER_ONLY_CHANNELS } from '../../../main/shared/channels'

const DEFAULT_PORT = 47600
const STORE_KEY = 'facturacion.connection'
const MODE_KEY = 'facturacion.mode'
const PRINTER_KEY = 'facturacion.printer'
const LOCAL_HOST = '127.0.0.1'
// Kept in sync with package.json; shown in the network info card.
const APP_VERSION = '1.14.1'

type Mode = '' | 'server' | 'client'

interface Conn {
  host: string
  port: number
  token: string
}

let mode: Mode = loadMode()
let conn: Conn | null = loadConn()
let connected = false
let printer: ThermalConfig = loadPrinter()

function loadPrinter(): ThermalConfig {
  try {
    const raw = localStorage.getItem(PRINTER_KEY)
    if (raw) return JSON.parse(raw) as ThermalConfig
  } catch {
    // ignore
  }
  return { transport: 'none' }
}

function savePrinter(cfg: ThermalConfig): void {
  try {
    localStorage.setItem(PRINTER_KEY, JSON.stringify(cfg))
  } catch {
    // ignore
  }
}

// base64 of a byte array, chunked to avoid arg-count limits on large receipts.
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function loadMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return m === 'server' || m === 'client' ? m : ''
  } catch {
    return ''
  }
}

function saveMode(m: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    // ignore
  }
}

function loadConn(): Conn | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<Conn>
    if (!c.host) return null
    return { host: c.host, port: c.port && c.port > 0 ? c.port : DEFAULT_PORT, token: c.token ?? '' }
  } catch {
    return null
  }
}

function saveConn(c: Conn): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(c))
  } catch {
    // ignore storage failures; connection still works for this session
  }
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) }
}

// Verifies reachability + access key against /auth. Throws on failure.
async function testConnection(host: string, port: number, token: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`http://${host}:${port}/auth`, {
      method: 'POST',
      headers: authHeaders(token),
      body: '{}'
    })
  } catch (err) {
    throw new Error(`No se pudo conectar al servidor: ${(err as Error).message}`)
  }
  if (res.status === 401) throw new Error('Clave de acceso incorrecta')
  if (!res.ok) throw new Error('No se pudo conectar al servidor')
}

// GET /ping — returns { ok, role, version, addresses } or null if unreachable.
async function pingInfo(
  host: string,
  port: number
): Promise<{ role?: string; version?: string; addresses?: string[] } | null> {
  try {
    const res = await fetch(`http://${host}:${port}/ping`)
    if (!res.ok) return null
    return (await res.json()) as { role?: string; version?: string; addresses?: string[] }
  } catch {
    return null
  }
}

// Data-channel call: forwards to the active server's /rpc (remote for a client,
// localhost for a server device), surfacing business errors.
async function rpc(channel: string, args: unknown[]): Promise<unknown> {
  if (!conn) throw new Error('Sin conexion con el servidor')
  let res: Response
  try {
    res = await fetch(`http://${conn.host}:${conn.port}/rpc`, {
      method: 'POST',
      headers: authHeaders(conn.token),
      body: JSON.stringify({ channel, args })
    })
  } catch (err) {
    throw new Error(`No se pudo conectar al servidor: ${(err as Error).message}`)
  }
  if (res.status === 401) throw new Error('Clave de acceso incorrecta')
  const parsed = (await res.json().catch(() => null)) as {
    ok: boolean
    result?: unknown
    error?: string
  } | null
  if (!parsed) throw new Error('Respuesta invalida del servidor')
  if (parsed.ok) return parsed.result
  throw new Error(parsed.error || 'Error del servidor')
}

// Channels handled on the device itself (no server round-trip).
const localHandlers: Record<string, (args: unknown[]) => Promise<unknown> | unknown> = {
  'device:getRole': () => (mode === '' ? 'unselected' : mode),
  'device:setRole': ([role]) => {
    const r: Mode = role === 'server' ? 'server' : 'client'
    mode = r
    saveMode(r)
    if (r === 'server') {
      // The WebView becomes a client of the embedded local server.
      conn = { host: LOCAL_HOST, port: DEFAULT_PORT, token: '' }
      saveConn(conn)
    }
    return undefined
  },

  'net:getInfo': async () => {
    if (mode === '') {
      return {
        role: 'unselected',
        serverEnabled: false,
        serverPort: DEFAULT_PORT,
        token: '',
        serverHost: '',
        running: false,
        runningPort: 0,
        addresses: [],
        version: APP_VERSION,
        connected: false
      }
    }
    if (mode === 'server') {
      const ping = await pingInfo(LOCAL_HOST, DEFAULT_PORT)
      connected = !!ping
      return {
        role: 'server',
        serverEnabled: true,
        serverPort: DEFAULT_PORT,
        token: conn?.token ?? '',
        serverHost: LOCAL_HOST,
        running: !!ping,
        runningPort: ping ? DEFAULT_PORT : 0,
        addresses: ping?.addresses ?? [],
        version: ping?.version ?? APP_VERSION,
        connected
      }
    }
    // client
    if (conn) {
      try {
        await testConnection(conn.host, conn.port, conn.token)
        connected = true
      } catch {
        connected = false
      }
    }
    return {
      role: 'client',
      serverEnabled: false,
      serverPort: conn?.port ?? DEFAULT_PORT,
      token: conn?.token ?? '',
      serverHost: conn?.host ?? '',
      running: false,
      runningPort: 0,
      addresses: [],
      version: APP_VERSION,
      connected
    }
  },
  'net:clientConnect': async ([host, token, port]) => {
    const h = String(host ?? '').trim()
    const p = port && Number(port) > 0 ? Number(port) : conn?.port ?? DEFAULT_PORT
    const t = String(token ?? '')
    try {
      await testConnection(h, p, t)
      conn = { host: h, port: p, token: t }
      saveConn(conn)
      connected = true
      return { ok: true }
    } catch (err) {
      connected = false
      return { ok: false, error: (err as Error).message }
    }
  },
  'net:clientStatus': () => ({ connected }),
  'net:setServerConfig': ([patch]) => {
    const p = (patch ?? {}) as Partial<Conn>
    conn = {
      host: p.host ?? conn?.host ?? '',
      port: p.port && p.port > 0 ? p.port : conn?.port ?? DEFAULT_PORT,
      token: typeof p.token === 'string' ? p.token : conn?.token ?? ''
    }
    saveConn(conn)
    return { info: {} }
  },

  // No secondary POS window on mobile: the whole app is one screen.
  'window:openPos': () => undefined,

  // USB licensing does not apply on Android.
  'usb:getStatus': () => ({
    portable: false,
    usbDir: null,
    connected: true,
    licenseOk: true,
    licensePath: null
  }),

  // Thermal (ESC/POS) printing on Android.
  'printer:getThermal': () => printer,
  'printer:setThermal': ([cfg]) => {
    printer = (cfg as ThermalConfig) ?? { transport: 'none' }
    savePrinter(printer)
    return undefined
  },
  'printer:print': async ([, receipt]) => {
    const data = receipt as ReceiptData | undefined
    if (printer.transport === 'none') {
      return { success: false, error: 'No hay impresora configurada. Ve a Ajustes > Impresora.' }
    }
    if (!data) {
      return { success: false, error: 'Esta impresion no admite impresora termica todavia.' }
    }
    const bytes = encodeReceipt(data, { width: printer.width ?? 32 })
    if (printer.transport === 'network') {
      if (!printer.ip) return { success: false, error: 'Configura la IP de la impresora en Ajustes.' }
      try {
        return (await rpc('escpos:network', [printer.ip, printer.port ?? 9100, toBase64(bytes)])) as {
          success: boolean
          error?: string
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
    // bluetooth: needs a native classic-BT plugin (device-only, pending).
    return {
      success: false,
      error: 'Impresion Bluetooth: falta integrar el plugin nativo en el dispositivo.'
    }
  },

  // Desktop-oriented printer channels are inert on Android.
  'printer:list': () => [],
  'printer:setDefault': () => undefined,
  'printer:setSilent': () => undefined,
  'printer:getConfig': () => ({ defaultPrinter: '', silent: false })
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const local = localHandlers[channel]
  if (local) return local(args)
  if (SERVER_ONLY_CHANNELS.includes(channel)) {
    throw new Error('Esta funcion solo esta disponible en el equipo servidor')
  }
  if (PROXIED_CHANNELS.includes(channel)) return rpc(channel, args)
  throw new Error(`Canal no soportado en esta plataforma: ${channel}`)
}

// Installs window.api when running outside Electron (Capacitor WebView / browser).
// No-op when the preload already provided it, so desktop is untouched.
export function installWebApi(): void {
  if (typeof window === 'undefined') return
  if ((window as unknown as { api?: unknown }).api) return
  ;(window as unknown as { api: unknown }).api = createApi(invoke)
  // Lets the UI show mobile-only options (e.g. the thermal printer settings).
  ;(window as unknown as { __mobileApi?: boolean }).__mobileApi = true
}
