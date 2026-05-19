import { ipcMain, shell } from 'electron'
import { getBackupService } from '../services/backup.service'

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
}
