import { createServer, type Server } from 'http'
import { app } from 'electron'
import { invokeChannel } from './handler-registry'
import { getNetworkConfig } from '../services/network-config.service'

// Channels that only make sense on the machine running them (printing, dialogs,
// USB license, local DB/backup management). Clients keep these local, and the
// server refuses to run them on a client's behalf.
const LOCAL_ONLY_PREFIXES = [
  'printer:',
  'window:',
  'usb:',
  'db:',
  'net:',
  'backup:',
  'export:',
  'import:'
]

export function isServableChannel(channel: string): boolean {
  return !LOCAL_ONLY_PREFIXES.some((p) => channel.startsWith(p))
}

let server: Server | null = null
let listeningPort = 0

export function isRpcRunning(): boolean {
  return server !== null
}

export function getRpcPort(): number {
  return listeningPort
}

function readBody(req: import('http').IncomingMessage, limit = 5 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      data += chunk.toString('utf8')
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export function startRpcServer(): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve({ port: listeningPort })
      return
    }
    const cfg = getNetworkConfig()

    const srv = createServer((req, res) => {
      // Health check so clients can verify the server is reachable.
      if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, role: 'server', version: app.getVersion() }))
        return
      }

      // Key check: clients call this to confirm the access key matches before
      // saving the connection. Returns 401 when the key is wrong.
      if (req.method === 'POST' && req.url === '/auth') {
        if (cfg.token && req.headers['x-auth-token'] !== cfg.token) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'clave incorrecta' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, version: app.getVersion() }))
        return
      }

      if (req.method !== 'POST' || req.url !== '/rpc') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }

      // Optional shared secret.
      if (cfg.token && req.headers['x-auth-token'] !== cfg.token) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'no autorizado' }))
        return
      }

      readBody(req)
        .then(async (raw) => {
          const { channel, args } = JSON.parse(raw || '{}') as {
            channel?: string
            args?: unknown[]
          }
          if (!channel || !isServableChannel(channel)) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: `canal no permitido: ${channel ?? ''}` }))
            return
          }
          try {
            const result = await invokeChannel(channel, args ?? [])
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, result }))
          } catch (err) {
            // Business errors (e.g. "Stock insuficiente") flow back to the client.
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
          }
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
        })
    })

    srv.on('error', (err) => {
      server = null
      reject(err)
    })

    // Bind on all interfaces so LAN clients can reach it.
    srv.listen(cfg.serverPort, '0.0.0.0', () => {
      server = srv
      listeningPort = cfg.serverPort
      resolve({ port: cfg.serverPort })
    })
  })
}

export function stopRpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve()
      return
    }
    const srv = server
    // Drop any keep-alive client sockets so close() doesn't hang on restart.
    ;(srv as unknown as { closeAllConnections?: () => void }).closeAllConnections?.()
    srv.close(() => {
      server = null
      listeningPort = 0
      resolve()
    })
  })
}
