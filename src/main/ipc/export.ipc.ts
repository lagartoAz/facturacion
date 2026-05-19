import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import type Database from 'better-sqlite3'
import { ExportService } from '../services/export.service'
import { ImportService } from '../services/import.service'
import { getBackupService } from '../services/backup.service'

function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

async function saveCsv(
  event: Electron.IpcMainInvokeEvent,
  defaultName: string,
  title: string,
  csv: string
): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = win
    ? await dialog.showSaveDialog(win, {
        title,
        defaultPath: defaultName,
        filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
      })
    : await dialog.showSaveDialog({
        title,
        defaultPath: defaultName,
        filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
      })
  if (result.canceled || !result.filePath) return null
  writeFileSync(result.filePath, csv, 'utf8')
  return result.filePath
}

export function registerExportHandlers(db: Database.Database): void {
  const service = new ExportService(db)
  const importer = new ImportService(db)

  ipcMain.handle('export:inventory', async (event) => {
    return await saveCsv(
      event,
      `inventario-${timestamp()}.csv`,
      'Exportar Inventario',
      service.inventoryCsv()
    )
  })

  ipcMain.handle('export:invoices', async (event) => {
    return await saveCsv(
      event,
      `facturas-${timestamp()}.csv`,
      'Exportar Facturas',
      service.invoicesCsv()
    )
  })

  ipcMain.handle('import:inventory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Importar Inventario',
          filters: [{ name: 'CSV (Excel)', extensions: ['csv', 'txt'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          title: 'Importar Inventario',
          filters: [{ name: 'CSV (Excel)', extensions: ['csv', 'txt'] }],
          properties: ['openFile']
        })
    if (result.canceled || result.filePaths.length === 0) return null
    const text = readFileSync(result.filePaths[0], 'utf8')
    // Run a backup BEFORE importing so the user can roll back if anything goes wrong
    try {
      await getBackupService().backupNow()
    } catch (err) {
      console.error('[import] pre-backup failed:', err)
    }
    const importResult = importer.importInventoryCsv(text)
    // Trigger another backup after the import to capture the new state
    getBackupService().schedule()
    return importResult
  })
}
