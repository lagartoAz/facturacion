// Boots the embedded mobile server (no Electron) and exercises it over real HTTP,
// exactly like a LAN terminal would. Proves the full backend — services, schema,
// RPC server — runs under plain Node with the electron-shim.
//
// Build + run:
//   npx esbuild scripts/mobile-server-smoketest.ts --bundle --platform=node \
//     --format=cjs --external:node-sqlite3-wasm \
//     --alias:electron=./src/main/platform/electron-shim.ts \
//     --define:__APP_ROLE__='"server"' --outfile=.srv.cjs && node .srv.cjs
import { request } from 'http'
import { startMobileServer } from '../src/main/mobile/server-main'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

function http(method: string, path: string, port: number, body?: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = request(
      { host: '127.0.0.1', port, path, method, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve({ status: res.statusCode || 0, json: data ? JSON.parse(data) : null }))
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const rpc = (port: number, channel: string, args: unknown[] = []): Promise<{ status: number; json: any }> =>
  http('POST', '/rpc', port, { channel, args })

async function main(): Promise<void> {
  console.log('0) Boot embedded server WITHOUT Electron')
  const { port } = await startMobileServer()
  assert(port > 0, `RPC server listening on port ${port}`)

  console.log('1) /ping health check')
  const ping = await http('GET', '/ping', port)
  assert(ping.status === 200 && ping.json.ok && ping.json.role === 'server', `ping ok, role=${ping.json.role}`)

  console.log('2) /rpc data channels reach services + mobile DB')
  const empty = await rpc(port, 'products:getAll', [])
  assert(empty.status === 200 && empty.json.ok && Array.isArray(empty.json.result) && empty.json.result.length === 0, 'products:getAll -> [] on fresh DB')

  const created = await rpc(port, 'categories:create', ['Bebidas'])
  assert(created.json.ok, 'categories:create -> ok')

  const cats = await rpc(port, 'categories:getAll', [])
  assert(cats.json.ok && cats.json.result.some((c: { name: string }) => c.name === 'Bebidas'), 'categories:getAll returns the created category')

  console.log('3) business errors flow back through RPC')
  const bad = await rpc(port, 'products:getByBarcode', ['does-not-exist'])
  assert(bad.status === 200 && bad.json.ok, `unknown barcode handled gracefully (result=${JSON.stringify(bad.json.result)})`)

  console.log('4) non-servable channel is rejected (printer is local-only)')
  const local = await rpc(port, 'printer:print', ['<html>'])
  assert(local.json.ok === false && /no permitido/i.test(local.json.error || ''), `printer:print rejected: "${local.json.error}"`)

  console.log('\n✅ FULL BACKEND RUNS WITHOUT ELECTRON — services, schema and RPC server all working under plain Node')
  process.exit(0)
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err)
  process.exit(1)
})
