// End-to-end check of the Android "this device is the server" loop:
//   embedded server (no Electron)  <--HTTP-->  web-api transport (WebView side)
// Proves RoleSelect -> server mode -> the WebView talks to its own localhost
// server and data flows, using the SAME code the APK will run.
//
// Build + run:
//   npx esbuild scripts/mobile-role-smoketest.ts --bundle --platform=node \
//     --format=cjs --external:node-sqlite3-wasm \
//     --alias:electron=./src/main/platform/electron-shim.ts \
//     --define:__APP_ROLE__='"server"' --outfile=.role.cjs && node .role.cjs
import { startMobileServer } from '../src/main/mobile/server-main'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function main(): Promise<void> {
  console.log('0) Start embedded server (the phone acting as server)')
  const { port } = await startMobileServer()
  assert(port === 47600, `server up on ${port}`)

  // Minimal browser globals so web-api (which reads localStorage at import) loads.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k)
  }
  ;(globalThis as unknown as { window: unknown }).window = globalThis

  const { installWebApi } = await import('../src/renderer/src/platform/web-api')
  installWebApi()
  const api = (globalThis as unknown as { api: Record<string, (...a: unknown[]) => Promise<unknown>> }).window
    ? (globalThis as unknown as { window: { api: Record<string, (...a: unknown[]) => Promise<unknown>> } }).window.api
    : (globalThis as unknown as { api: Record<string, (...a: unknown[]) => Promise<unknown>> }).api

  console.log('1) Fresh device has no role')
  assert((await api.getDeviceRole()) === 'unselected', 'getDeviceRole() = unselected')

  console.log('2) User picks "this device is the server"')
  await api.setDeviceRole('server')
  assert((await api.getDeviceRole()) === 'server', 'role persisted = server')

  console.log('3) net:getInfo reports server + its LAN address (from /ping)')
  const info = (await api.getNetworkInfo()) as {
    role: string
    connected: boolean
    running: boolean
    addresses: string[]
  }
  assert(info.role === 'server', `role = ${info.role}`)
  assert(info.connected && info.running, 'WebView connected to its own local server')
  assert(Array.isArray(info.addresses), `addresses reported: [${info.addresses.join(', ')}]`)

  console.log('4) Data flows: WebView -> localhost server -> mobile DB')
  assert(((await api.getProducts()) as unknown[]).length === 0, 'getProducts() -> [] on fresh DB')
  await api.createCategory('Lacteos')
  const cats = (await api.getCategories()) as { name: string }[]
  assert(cats.some((c) => c.name === 'Lacteos'), 'createCategory + getCategories round-trip works')

  console.log('\n✅ ANDROID-AS-SERVER LOOP WORKS — role selection + local transport + data all verified end-to-end')
  process.exit(0)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
