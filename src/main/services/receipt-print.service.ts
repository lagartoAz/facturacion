// Shared receipt-printing dispatcher used by BOTH the server build
// (printer.ipc.ts) and the "Acceso"/client build (client-proxy.ts). Keeps the
// two from drifting apart.
//
// Two modes, chosen per machine in Settings:
//   - 'driver' : render the HTML in a hidden window and print via the Windows
//                driver (webContents.print). Right for laser/inkjet printers.
//   - 'escpos' : send the raw ESC/POS byte stream straight to the printer queue.
//                Right for 58/80mm thermal printers (USB), which otherwise spit
//                out garbage control symbols when fed a GDI job by the driver.

import { BrowserWindow } from 'electron'
import { encodeReceipt } from '../../shared/escpos'
import type { ReceiptData } from '../../shared/receipt'
import { isWindows, sendRawToWindowsPrinter } from './escpos-windows.service'

export interface PrintJobConfig {
  printerName: string // '' => show the system dialog (driver mode only)
  mode: 'driver' | 'escpos'
  width: number // ESC/POS columns: 32 for 58mm, 48 for 80mm
}

export interface PrintResult {
  success: boolean
  error?: string
}

async function hasNoPrinters(): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return false
  try {
    const printers = await win.webContents.getPrintersAsync()
    return printers.length === 0
  } catch {
    return false // unknown: let the print attempt proceed
  }
}

// Raw ESC/POS straight to the installed queue. No HTML, no GDI, no garbage.
async function printEscpos(receipt: ReceiptData, cfg: PrintJobConfig): Promise<PrintResult> {
  try {
    const bytes = encodeReceipt(receipt, { width: cfg.width })
    await sendRawToWindowsPrinter(cfg.printerName, bytes)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

// Legacy path: render the receipt HTML and print it through the OS driver.
async function printViaDriver(html: string, cfg: PrintJobConfig): Promise<PrintResult> {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true }
  })
  try {
    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    return await new Promise<PrintResult>((resolve) => {
      const options: Electron.WebContentsPrintOptions = {
        silent: !!cfg.printerName,
        printBackground: true,
        margins: { marginType: 'none' }
      }
      if (cfg.printerName) options.deviceName = cfg.printerName
      printWindow.webContents.print(options, (success, failureReason) => {
        if (success || failureReason === 'cancelled') resolve({ success: true })
        else resolve({ success: false, error: failureReason })
      })
    })
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close()
  }
}

export async function printReceiptJob(
  html: string,
  receipt: ReceiptData | undefined,
  cfg: PrintJobConfig
): Promise<PrintResult> {
  if (await hasNoPrinters()) {
    return {
      success: false,
      error:
        'No hay ninguna impresora instalada en este equipo. Conecta o instala una impresora en Windows para imprimir facturas.'
    }
  }

  // ESC/POS direct printing: needs Windows, a selected printer and the structured
  // receipt. If any piece is missing we fall back to the driver so printing never
  // silently breaks (the renderer always sends the HTML too).
  if (cfg.mode === 'escpos' && isWindows() && cfg.printerName && receipt) {
    return printEscpos(receipt, cfg)
  }

  return printViaDriver(html, cfg)
}
