import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { networkInterfaces } from 'os'

// The role is baked in at build time so a "server" (primary) build can never be
// turned into a client and vice-versa. `__APP_ROLE__` is injected by
// electron.vite.config.ts; it defaults to 'server' for the main/primary build.
export type AppRole = 'server' | 'client'

export function getRole(): AppRole {
  const role = typeof __APP_ROLE__ === 'string' ? __APP_ROLE__ : 'server'
  return role === 'client' ? 'client' : 'server'
}

export const DEFAULT_PORT = 47600

export interface NetworkConfig {
  serverEnabled: boolean // server build: expose the DB over the LAN
  serverPort: number // port used by both server (listen) and client (connect)
  token: string // optional shared secret; '' = no auth
  serverHost: string // client build: IP/hostname of the primary PC
}

const DEFAULTS: NetworkConfig = {
  serverEnabled: true,
  serverPort: DEFAULT_PORT,
  token: '',
  serverHost: ''
}

function configPath(): string {
  return join(app.getPath('userData'), 'network-config.json')
}

export function getNetworkConfig(): NetworkConfig {
  const p = configPath()
  if (!existsSync(p)) return { ...DEFAULTS }
  try {
    const data = JSON.parse(readFileSync(p, 'utf8')) as Partial<NetworkConfig>
    return {
      serverEnabled: data.serverEnabled ?? DEFAULTS.serverEnabled,
      serverPort: data.serverPort && data.serverPort > 0 ? data.serverPort : DEFAULTS.serverPort,
      token: typeof data.token === 'string' ? data.token : DEFAULTS.token,
      serverHost: typeof data.serverHost === 'string' ? data.serverHost : DEFAULTS.serverHost
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setNetworkConfig(patch: Partial<NetworkConfig>): NetworkConfig {
  const next = { ...getNetworkConfig(), ...patch }
  writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

// LAN IPv4 addresses of this machine, so the operator can tell the clients which
// address to connect to.
export function getLanAddresses(): string[] {
  const out: string[] = []
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address)
    }
  }
  return out
}
