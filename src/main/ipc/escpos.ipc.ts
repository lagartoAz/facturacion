import { ipcMain } from 'electron'
import { sendToNetworkPrinter } from '../services/escpos-network.service'

// Servable channel (not under a LOCAL_ONLY prefix): a terminal forwards its
// ESC/POS job here and the server relays it to the LAN printer over TCP. Runs in
// Node on both the desktop server and the embedded Android server.
export function registerEscposHandlers(): void {
  ipcMain.handle(
    'escpos:network',
    async (
      _event,
      ip: string,
      port: number,
      base64: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
        await sendToNetworkPrinter(ip, port && port > 0 ? port : 9100, bytes)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )
}
