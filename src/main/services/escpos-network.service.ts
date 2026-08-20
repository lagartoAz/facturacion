// Sends a raw ESC/POS byte stream to a network (WiFi/Ethernet) thermal printer
// over TCP (raw port, typically 9100). Runs in Node, so it works on the desktop
// server and inside the embedded Android server (nodejs-mobile). A client
// terminal without its own socket capability forwards the bytes here and the
// server relays them to the shared LAN printer.

import { Socket } from 'net'

export function sendToNetworkPrinter(
  ip: string,
  port: number,
  data: Uint8Array,
  timeoutMs = 8000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let settled = false
    const finish = (err?: Error): void => {
      if (settled) return
      settled = true
      socket.destroy()
      if (err) reject(err)
      else resolve()
    }

    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => finish(new Error('Tiempo de espera agotado con la impresora')))
    socket.on('error', (e) => finish(new Error(`No se pudo conectar con la impresora: ${e.message}`)))

    socket.connect(port, ip, () => {
      socket.write(Buffer.from(data), (e) => {
        if (e) {
          finish(e)
          return
        }
        // Flush and close cleanly so the printer receives the full job.
        socket.end(() => finish())
      })
    })
  })
}
