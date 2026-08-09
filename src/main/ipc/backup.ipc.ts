import { ipcMain, shell, app, dialog } from 'electron'
import { getBackupService } from '../services/backup.service'
import { closeDatabase } from '../database/connection'
import { getDbPath } from '../services/db-location.service'
import { restoreFromFile } from '../database/recovery'

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:now', async () => {
    return await getBackupService().backupNow()
  })

  ipcMain.handle('backup:list', () => {
    return getBackupService().list()
  })

  ipcMain.handle('backup:openFolder', async () => {
    const dir = getBackupService().getDir()
    await shell.openPath(dir)
    return dir
  })

  ipcMain.handle('backup:getDir', () => {
    return getBackupService().getDir()
  })

  // Restore a user-chosen backup over the live database, then relaunch so the
  // whole app reopens against the restored file cleanly. The current database is
  // preserved (renamed aside) in case the user changes their mind.
  ipcMain.handle('backup:restore', async (_event, backupPath: string): Promise<{ success: boolean; error?: string }> => {
    const dbPath = getDbPath()
    // Close first so the file isn't locked while we swap it.
    try {
      closeDatabase()
    } catch {
      // ignore — we're about to overwrite anyway
    }
    const info = restoreFromFile(dbPath, backupPath)
    if (!info.restored) {
      return {
        success: false,
        error: 'El respaldo seleccionado no es valido o no se pudo copiar.'
      }
    }
    await dialog.showMessageBox({
      type: 'info',
      title: 'Respaldo restaurado',
      message: 'La base de datos fue reemplazada por el respaldo seleccionado.',
      detail:
        `Se restauro: ${info.backupName}\n\n` +
        (info.corruptSavedAs
          ? `La base anterior se guardo como:\n${info.corruptSavedAs}\n\n`
          : '') +
        `La aplicacion se reiniciara ahora.`,
      buttons: ['Reiniciar']
    })
    app.relaunch()
    app.exit(0)
    return { success: true }
  })
}
