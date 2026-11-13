import { ipcMain, BrowserWindow, app } from 'electron'
import { request } from 'http'
import { join } from 'path'
import { PROXIED_CHANNELS, SERVER_ONLY_CHANNELS } from '../shared/channels'
import { getNetworkConfig, setNetworkConfig, DEFAULT_PORT } from '../services/network-config.service'
import { localGet, localSet } from './local-store'
import { printReceiptJob } from '../services/receipt-print.service'
import type { ReceiptData } from '../../shared/receipt'

interface Target {
  host: string
  port: number
  token: string
}

let target: Target | null = null
let connected = false

export function isClientConnected(): boolean {
  return connected
}

// Low-level JSON POST to the server. Rejects with a friendly message on network
// failure and surfaces business errors ({ ok:false, error }) as thrown errors.
function post<T>(path: string, body: unknown, host: string, port: number, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = request(
      {
        host,
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(token ? { 'x-auth-token': token } : {})
        },
        timeout: 10000
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          if (res.statusCode === 401) {
            reject(new Error('Clave de acceso incorrecta'))
            return
          }
          try {
            const parsed = JSON.parse(data || '{}') as { ok: boolean; result?: T; error?: string }
            if (parsed.ok) resolve(parsed.result as T)
            else reject(new Error(parsed.error || 'Error del servidor'))
          } catch {
            reject(new Error('Respuesta invalida del servidor'))
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('Tiempo de espera agotado'))
    })
    req.on('error', (err) => reject(new Error(`No se pudo conectar al servidor: ${err.message}`)))
    req.write(payload)
    req.end()
  })
}

// Verifies reachability + access key. Throws on failure.
export async function testConnection(host: string, port: number, token: string): Promise<void> {
  await post('/auth', {}, host, port, token)
}

// Saves the connection and marks the client connected. Called after a successful test.
export function applyConnection(host: string, port: number, token: string): void {
  target = { host, port, token }
  connected = true
  setNetworkConfig({ serverHost: host, serverPort: port, token })
}

// On startup: if we already have a saved server, try to reconnect silently.
export async function tryAutoConnect(): Promise<boolean> {
  const cfg = getNetworkConfig()
  if (!cfg.serverHost) return false
  try {
    await testConnection(cfg.serverHost, cfg.serverPort, cfg.token)
    applyConnection(cfg.serverHost, cfg.serverPort, cfg.token)
    return true
  } catch {
    connected = false
    return false
  }
}

// Registers all IPC handlers for a client terminal:
//  - data channels  -> forwarded to the server
//  - server-only     -> friendly "not available" errors
//  - printer         -> local (per-machine), stored in client-local.json
//  - net/window/usb  -> local control
export function registerClientHandlers(): void {
  // Data channels proxied to the server.
  for (const channel of PROXIED_CHANNELS) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      if (!target) throw new Error('Sin conexion con el servidor')
      return post('/rpc', { channel, args }, target.host, target.port, target.token)
    })
  }

  // Server-only features are not available from an access terminal.
  for (const channel of SERVER_ONLY_CHANNELS) {
    ipcMain.handle(channel, () => {
      throw new Error('Esta funcion solo esta disponible en el equipo servidor')
    })
  }

  // Local printer handling (per-machine config, no shared DB).
  ipcMain.handle('printer:list', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return []
    try {
      const list = await win.webContents.getPrintersAsync()
      return list.map((p) => ({
        name: p.name,
        displayName: p.displayName ?? p.name,
        description: p.description ?? '',
        status: p.status,
        isDefault: p.isDefault
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle('printer:print', async (_event, html: string, receipt?: ReceiptData) => {
    return printReceiptJob(html, receipt, {
      printerName: localGet('default_printer') || '',
      mode: localGet('print_mode') === 'escpos' ? 'escpos' : 'driver',
      width: localGet('escpos_width') === '48' ? 48 : 32
    })
  })

  ipcMain.handle('printer:setDefault', (_event, deviceName: string | null) => {
    localSet('default_printer', deviceName ?? '')
  })
  ipcMain.handle('printer:setSilent', (_event, silent: boolean) => {
    localSet('print_silent', silent ? '1' : '0')
  })
  ipcMain.handle('printer:setMode', (_event, mode: 'driver' | 'escpos', width: number) => {
    localSet('print_mode', mode === 'escpos' ? 'escpos' : 'driver')
    localSet('escpos_width', width === 48 ? '48' : '32')
  })
  ipcMain.handle('printer:getConfig', () => ({
    defaultPrinter: localGet('default_printer') ?? '',
    silent: localGet('print_silent') === '1',
    mode: localGet('print_mode') === 'escpos' ? 'escpos' : 'driver',
    width: localGet('escpos_width') === '48' ? 48 : 32
  }))

  // Window + USB (local, no DB needed).
  ipcMain.handle('window:openPos', () => {
    // Reuse the same POS window creation as the main app.
    const posWindow = new BrowserWindow({
      width: 900,
      height: 700,
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, '../preload/index.mjs'), sandbox: false }
    })
    posWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    if (process.env['ELECTRON_RENDERER_URL']) {
      posWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/#/pos-window')
    } else {
      posWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/pos-window' })
    }
  })
  ipcMain.handle('usb:getStatus', () => ({
    portable: false,
    usbDir: null,
    connected: true,
    licenseOk: true,
    licensePath: null
  }))

  // Network control for the connection screen / settings card.
  ipcMain.handle('net:getInfo', () => {
    const cfg = getNetworkConfig()
    return {
      role: 'client',
      serverEnabled: false,
      serverPort: cfg.serverPort || DEFAULT_PORT,
      token: cfg.token,
      serverHost: cfg.serverHost,
      running: false,
      runningPort: 0,
      addresses: [],
      version: app.getVersion(),
      connected
    }
  })

  ipcMain.handle(
    'net:clientConnect',
    async (_event, host: string, token: string, port?: number) => {
      const p = port && port > 0 ? port : getNetworkConfig().serverPort || DEFAULT_PORT
      try {
        await testConnection(host.trim(), p, token)
        applyConnection(host.trim(), p, token)
        return { ok: true }
      } catch (err) {
        connected = false
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('net:clientStatus', () => ({ connected }))

  // Fast reconnect to the last saved server (host + token), used before the
  // discovery scan so a returning terminal re-attaches without retyping.
  ipcMain.handle('net:autoReconnect', async () => ({ ok: await tryAutoConnect() }))
}
