// LAN auto-discovery for "Acceso" terminals. The Android client is a WebView
// (only `fetch`, no UDP/mDNS), so discovery is an HTTP sweep of the likely /24
// subnets looking for the server's unauthenticated `GET /ping` endpoint.

const DEFAULT_PORT = 47600

export interface FoundServer {
  host: string
  port: number
  version?: string
  addresses?: string[]
}

interface DiscoverOptions {
  port?: number
  lastHost?: string
  signal?: AbortSignal
  onProgress?: (scanned: number, total: number) => void
}

// GET /ping on one host. Resolves to the server info if it answers as a server,
// or null on timeout / error / non-server response.
async function probePing(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<FoundServer | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onAbort = (): void => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(`http://${host}:${port}/ping`, { signal: ctrl.signal })
    if (!res.ok) return null
    const json = (await res.json()) as {
      role?: string
      version?: string
      addresses?: string[]
    }
    if (json?.role !== 'server') return null
    return { host, port, version: json.version, addresses: json.addresses }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// Does the server require an access password? POST /auth with no token:
//   401 -> password required, 200 -> open (auto-connect). Defaults to true
// (ask for the password) if the check itself fails, to stay on the safe side.
export async function serverNeedsAuth(host: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    return res.status === 401
  } catch {
    return true
  }
}

// Best-effort local IPv4s via WebRTC ICE candidates, used only to prioritise the
// right subnet. Returns [] when the WebView hides them behind mDNS (.local).
function localIpsViaWebRTC(timeoutMs: number): Promise<string[]> {
  return new Promise((resolve) => {
    const RTC = (window as unknown as { RTCPeerConnection?: typeof RTCPeerConnection })
      .RTCPeerConnection
    if (!RTC) return resolve([])
    let pc: RTCPeerConnection
    try {
      pc = new RTC({ iceServers: [] })
    } catch {
      return resolve([])
    }
    const ips = new Set<string>()
    const finish = (): void => {
      clearTimeout(timer)
      try {
        pc.close()
      } catch {
        // ignore
      }
      resolve(Array.from(ips))
    }
    const timer = setTimeout(finish, timeoutMs)
    pc.onicecandidate = (e): void => {
      if (!e.candidate) return finish()
      const m = e.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/)
      if (m && !m[1].startsWith('0.')) ips.add(m[1])
    }
    try {
      pc.createDataChannel('discovery')
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(finish)
    } catch {
      finish()
    }
  })
}

// Ordered list of "a.b.c" /24 prefixes to scan: the last server's subnet first,
// then any WebRTC-detected local subnets, then the common home/office ranges.
function buildPrefixes(lastHost: string | undefined, localIps: string[]): string[] {
  const set = new Set<string>()
  const add = (ip?: string): void => {
    const m = ip?.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/)
    if (m) set.add(m[1])
  }
  add(lastHost)
  localIps.forEach(add)
  for (const p of ['192.168.1', '192.168.0', '192.168.100', '10.0.0', '10.0.1']) set.add(p)
  return Array.from(set)
}

// Scans one /24 prefix fully and returns every server that answers on it.
async function scanPrefix(
  prefix: string,
  port: number,
  timeoutMs: number,
  concurrency: number,
  onHost: () => void,
  signal?: AbortSignal
): Promise<FoundServer[]> {
  const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`)
  const found: FoundServer[] = []
  let next = 0
  async function worker(): Promise<void> {
    while (!signal?.aborted) {
      const idx = next++
      if (idx >= hosts.length) return
      const result = await probePing(hosts[idx], port, timeoutMs, signal)
      onHost()
      if (result) found.push(result)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker))
  return found
}

// Sweeps the candidate subnets one at a time and returns ALL servers found on
// the first subnet that has any (a shop LAN lives on one subnet). Returns [] if
// none respond or the scan is aborted.
export async function discoverServers(opts: DiscoverOptions = {}): Promise<FoundServer[]> {
  const port = opts.port ?? DEFAULT_PORT
  const timeoutMs = 700
  const concurrency = 40

  const localIps = await localIpsViaWebRTC(600)
  if (opts.signal?.aborted) return []
  const prefixes = buildPrefixes(opts.lastHost, localIps)

  const total = prefixes.length * 254
  let scanned = 0
  const tick = (): void => opts.onProgress?.(++scanned, total)

  for (const prefix of prefixes) {
    if (opts.signal?.aborted) return []
    const found = await scanPrefix(prefix, port, timeoutMs, concurrency, tick, opts.signal)
    if (found.length) {
      // Dedupe by host in case the same server answered on more than one IP.
      const seen = new Set<string>()
      return found.filter((s) => (seen.has(s.host) ? false : (seen.add(s.host), true)))
    }
  }
  return []
}
