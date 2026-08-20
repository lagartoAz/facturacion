// Headless validation that the real schema + service-style operations run on the
// node-sqlite3-wasm adapter exactly as they do on better-sqlite3. Run with:
//   npx esbuild scripts/mobile-db-smoketest.ts --bundle --platform=node \
//     --format=esm --external:node-sqlite3-wasm --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
import { existsSync, rmSync } from 'fs'
import { MobileDatabase } from '../src/main/database/mobile-sqlite'
import { runMigrations } from '../src/main/database/migrations'

const DB = '/tmp/fac-smoke-v4.db'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

// Second phase runs in a FRESH process (app restart), proving the file persisted.
if (process.argv.includes('verify-only')) {
  const v = new MobileDatabase(DB) as unknown as import('better-sqlite3').Database
  const persisted = v.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }
  assert(persisted.n === 1, 'data persisted across process restart (file VFS)')
  v.close()
  console.log('\n✅ PERSISTENCE OK')
  process.exit(0)
}

for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) if (existsSync(f)) rmSync(f)

const db = new MobileDatabase(DB) as unknown as import('better-sqlite3').Database

console.log('1) Migrations (real schema)')
runMigrations(db)
const ver = db.pragma('user_version', { simple: true })
assert(typeof ver === 'number' && ver >= 18, `user_version applied = ${ver}`)
const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
  (r) => r.name
)
assert(tables.includes('products') && tables.includes('invoices'), `core tables exist (${tables.length} tables)`)

console.log('2) Prepared statement reuse + lastInsertRowid')
const insCat = db.prepare('INSERT INTO categories(name) VALUES(?)')
const c1 = insCat.run('Bebidas')
const c2 = insCat.run('Snacks')
assert(Number(c1.lastInsertRowid) > 0 && Number(c2.lastInsertRowid) === Number(c1.lastInsertRowid) + 1, 'reused stmt inserts, rowids increment')

const insProd = db.prepare(
  'INSERT INTO products(barcode, name, price_usd, cost_usd, category_id, stock) VALUES(?,?,?,?,?,?)'
)
const p1 = insProd.run('7591', 'Agua 1L', 1.5, 0.9, Number(c1.lastInsertRowid), 100)
assert(Number(p1.changes) === 1, 'product inserted (changes=1)')
const prod = db.prepare('SELECT * FROM products WHERE id=?').get(Number(p1.lastInsertRowid)) as { name: string; stock: number }
assert(prod.name === 'Agua 1L' && prod.stock === 100, 'row read back correctly')

console.log('3) Transaction commit')
const sellTx = db.transaction((qty: number) => {
  const r = db.prepare('UPDATE products SET stock = stock - ? WHERE id=? AND stock >= ?').run(qty, Number(p1.lastInsertRowid), qty)
  if (r.changes === 0) throw new Error('Stock insuficiente')
  return r.changes
})
const changed = sellTx(30)
assert(changed === 1, 'transaction committed stock update')
const after = db.prepare('SELECT stock FROM products WHERE id=?').get(Number(p1.lastInsertRowid)) as { stock: number }
assert(after.stock === 70, `stock now 70 (was 100 - 30)`)

console.log('4) Transaction rollback on error')
let threw = false
try {
  db.transaction(() => {
    db.prepare('UPDATE products SET stock = 5 WHERE id=?').run(Number(p1.lastInsertRowid))
    throw new Error('boom')
  })()
} catch {
  threw = true
}
const afterRb = db.prepare('SELECT stock FROM products WHERE id=?').get(Number(p1.lastInsertRowid)) as { stock: number }
assert(threw && afterRb.stock === 70, 'rollback restored stock to 70 (change discarded)')

console.log('5) pragma query + integrity')
const integ = db.pragma('integrity_check', { simple: true })
assert(integ === 'ok', `integrity_check = ${integ}`)
const fk = db.pragma('foreign_keys', { simple: true })
assert(Number(fk) === 1, 'foreign_keys enabled')

console.log('6) Close (flush to file)')
db.close()
assert(existsSync(DB), 'db file written to disk')

console.log('\n✅ ALL CHECKS PASSED — node-sqlite3-wasm adapter matches better-sqlite3 behavior on the real schema')
