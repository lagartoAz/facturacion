// Validates ESC/POS receipt encoding and network (WiFi) printing end-to-end:
// encode a receipt, then relay it through the embedded server's escpos:network
// channel to a MOCK TCP printer, asserting the exact bytes arrive.
//
// Build + run:
//   npx esbuild scripts/escpos-smoketest.ts --bundle --platform=node \
//     --format=cjs --external:node-sqlite3-wasm \
//     --alias:electron=./src/main/platform/electron-shim.ts \
//     --define:__APP_ROLE__='"server"' --outfile=.esc.cjs && node .esc.cjs
import { createServer, type Server } from 'net'
import { request } from 'http'
import { encodeReceipt } from '../src/shared/escpos'
import type { ReceiptData } from '../src/shared/receipt'
import { startMobileServer } from '../src/main/mobile/server-main'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

const RECEIPT: ReceiptData = {
  title: 'Bodegón Doña Ñ',
  invoiceNumber: 'F-000123',
  dateText: '20/08/2026 14:35',
  customerName: 'José Pérez',
  items: [
    { name: 'Café molido 250g', qty: '2', unitPrice: '3.50', total: '7.00' },
    { name: 'Pan canilla', qty: '5', unitPrice: '0.40', total: '2.00' }
  ],
  totalText: '9.00',
  footerTitle: 'Compra en Bodegón',
  paymentLines: [{ label: 'Efectivo USD', amount: '9.00' }],
  thanks: '¡Gracias por su compra!'
}

const ascii = (b: Uint8Array): string =>
  Array.from(b)
    .map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : ' '))
    .join('')

function mockPrinter(port: number): Promise<{ server: Server; received: () => Buffer }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    const server = createServer((sock) => {
      sock.on('data', (d) => chunks.push(d))
    })
    server.listen(port, '127.0.0.1', () => resolve({ server, received: () => Buffer.concat(chunks) }))
  })
}

function rpc(port: number, channel: string, args: unknown[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ channel, args })
    const req = request(
      { host: '127.0.0.1', port, path: '/rpc', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(JSON.parse(data)))
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main(): Promise<void> {
  console.log('1) Encode receipt to ESC/POS')
  const bytes = encodeReceipt(RECEIPT, { width: 32, cut: true })
  const txt = ascii(bytes)
  assert(bytes[0] === 0x1b && bytes[1] === 0x40, 'starts with ESC @ (init)')
  const n = bytes.length
  assert(bytes[n - 3] === 0x1d && bytes[n - 2] === 0x56 && bytes[n - 1] === 0x00, 'ends with GS V 0 (full cut)')
  assert(txt.includes('F-000123'), 'invoice number present')
  assert(txt.includes('Caf') && txt.includes('Pan canilla'), 'item names present')
  assert(txt.includes('TOTAL: 9.00'), 'total present')
  assert(txt.includes('Gracias por su compra'), 'thanks present')
  // Accented "ñ"/"é" must be mapped to CP850 bytes, never dropped to '?'
  assert(!txt.includes('?'), 'no unmapped characters (accents handled)')

  console.log('2) Mock network printer + embedded server')
  const PRINTER_PORT = 9199
  const { server, received } = await mockPrinter(PRINTER_PORT)
  const { port } = await startMobileServer()
  assert(port === 47600, `server up on ${port}`)

  console.log('3) Relay ESC/POS to the printer via escpos:network channel')
  const b64 = Buffer.from(bytes).toString('base64')
  const res = await rpc(port, 'escpos:network', ['127.0.0.1', PRINTER_PORT, b64])
  assert(res.ok && res.result.success, 'escpos:network -> success')

  // Give the socket a tick to flush to the mock printer.
  await new Promise((r) => setTimeout(r, 150))
  const got = received()
  assert(got.length === bytes.length, `printer received all ${bytes.length} bytes`)
  assert(Buffer.from(bytes).equals(got), 'printer received the EXACT ESC/POS stream')

  server.close()
  console.log('\n✅ ESC/POS ENCODING + NETWORK PRINTING VERIFIED end-to-end (encode -> server relay -> printer)')
  process.exit(0)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
