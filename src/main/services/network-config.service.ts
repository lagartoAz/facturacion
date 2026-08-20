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

// Interface-name fragments that belong to virtual or secondary adapters the
// access terminals cannot reach over the LAN: VM bridges, Docker, WSL, VPNs and
// cellular-data interfaces. Matching is case-insensitive substring.
const VIRTUAL_IFACES = [
  'vethernet',
  'virtualbox',
  'vboxnet',
  'vmware',
  'vmnet',
  'hyper-v',
  'docker',
  'br-',
  'veth',
  'wsl',
  'zerotier',
  'tailscale',
  'utun',
  'tun',
  'tap',
  'ppp',
  'rmnet',
  'ccmni'
]

function ifaceLooksVirtual(name: string): boolean {
  const n = name.toLowerCase()
  return VIRTUAL_IFACES.some((frag) => n.includes(frag))
}

// Higher score = more likely to be the real LAN address the terminals connect
// to. Home/office routers almost always hand out 192.168.x; VirtualBox's
// host-only 192.168.56.x is demoted so it never wins.
function addressScore(addr: string): number {
  if (addr.startsWith('192.168.56.')) return 1
  if (addr.startsWith('192.168.')) return 4
  if (addr.startsWith('10.')) return 3
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(addr)) return 2
  return 0
}

// LAN IPv4 addresses of this machine, so the operator can tell the terminals
// which address to connect to. Virtual/secondary adapters are dropped (unless
// they are the only thing available) and the best candidate is returned first,
// so the UI can present it as the recommended one.
export function getLanAddresses(): string[] {
  const ifaces = networkInterfaces()
  const candidates: { address: string; virtual: boolean; score: number }[] = []
  for (const name of Object.keys(ifaces)) {
    const virtual = ifaceLooksVirtual(name)
    for (const info of ifaces[name] ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue
      if (info.address.startsWith('169.254.')) continue // APIPA: no DHCP lease
      candidates.push({ address: info.address, virtual, score: addressScore(info.address) })
    }
  }
  // Real interfaces before virtual ones; within each group, better range first.
  candidates.sort((a, b) => {
    if (a.virtual !== b.virtual) return a.virtual ? 1 : -1
    return b.score - a.score
  })
  const real = candidates.filter((c) => !c.virtual)
  const chosen = real.length > 0 ? real : candidates
  return [...new Set(chosen.map((c) => c.address))]
}
