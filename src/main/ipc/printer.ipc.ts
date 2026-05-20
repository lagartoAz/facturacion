import { BrowserWindow, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { SettingsService } from '../services/settings.service'

interface PrinterEntry {
  name: string
  displayName: string
  description: string
  status: number
  isDefault: boolean
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
      html: string
    ): Promise<{ success: boolean; error?: string }> => {
      const defaultPrinter = settings.get('default_printer')
      const silent = settings.get('print_silent') === '1'

      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true }
      })

      try {
        await printWindow.loadURL(
          'data:text/html;charset=utf-8,' + encodeURIComponent(html)
        )

        const result = await new Promise<{ success: boolean; error?: string }>(
          (resolve) => {
            const options: Electron.WebContentsPrintOptions = {
              silent: silent && !!defaultPrinter,
              printBackground: true,
              margins: { marginType: 'none' }
            }
            if (defaultPrinter) options.deviceName = defaultPrinter

            printWindow.webContents.print(options, (success, failureReason) => {
              if (success) resolve({ success: true })
              else if (failureReason === 'cancelled')
                resolve({ success: true })
              else resolve({ success: false, error: failureReason })
            })
          }
        )
        return result
      } catch (err) {
        return { success: false, error: (err as Error).message }
      } finally {
        if (!printWindow.isDestroyed()) printWindow.close()
      }
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
    'printer:getConfig',
    (): { defaultPrinter: string; silent: boolean } => ({
      defaultPrinter: settings.get('default_printer') ?? '',
      silent: settings.get('print_silent') === '1'
    })
  )
}
