import { BrowserWindow, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { SettingsService } from '../services/settings.service'
import { printReceiptJob } from '../services/receipt-print.service'
import type { ReceiptData } from '../../shared/receipt'

interface PrinterEntry {
  name: string
  displayName: string
  description: string
  status: number
  isDefault: boolean
}

function readMode(settings: SettingsService): 'driver' | 'escpos' {
  return settings.get('print_mode') === 'escpos' ? 'escpos' : 'driver'
}

function readWidth(settings: SettingsService): number {
  return settings.get('escpos_width') === '48' ? 48 : 32
}

export function registerPrinterHandlers(db: Database.Database): void {
  const settings = new SettingsService(db)

  ipcMain.handle('printer:list', async (): Promise<PrinterEntry[]> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return []
    try {
      const list = await win.webContents.getPrintersAsync()
      return list.map((p) => ({
        name: p.name,
        displayName: p.displayName ?? p.name,
        description: p.description ?? '',
        status: p.status,
        isDefault: p.isDefault
      }))
    } catch (err) {
      console.error('[printer] could not list printers:', err)
      return []
    }
  })

  ipcMain.handle(
    'printer:print',
    async (
      _event,
      html: string,
      receipt?: ReceiptData
    ): Promise<{ success: boolean; error?: string }> => {
      return printReceiptJob(html, receipt, {
        printerName: settings.get('default_printer') ?? '',
        mode: readMode(settings),
        width: readWidth(settings)
      })
    }
  )

  ipcMain.handle(
    'printer:setDefault',
    (_event, deviceName: string | null): void => {
      settings.set('default_printer', deviceName ?? '')
    }
  )

  ipcMain.handle('printer:setSilent', (_event, silent: boolean): void => {
    settings.set('print_silent', silent ? '1' : '0')
  })

  ipcMain.handle(
    'printer:setMode',
    (_event, mode: 'driver' | 'escpos', width: number): void => {
      settings.set('print_mode', mode === 'escpos' ? 'escpos' : 'driver')
      settings.set('escpos_width', width === 48 ? '48' : '32')
    }
  )

  ipcMain.handle(
    'printer:getConfig',
    (): { defaultPrinter: string; silent: boolean; mode: 'driver' | 'escpos'; width: number } => ({
      defaultPrinter: settings.get('default_printer') ?? '',
      silent: settings.get('print_silent') === '1',
      mode: readMode(settings),
      width: readWidth(settings)
    })
  )
}
