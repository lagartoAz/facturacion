import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { existsSync, copyFileSync, unlinkSync, accessSync, constants } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import {
  getDbPath,
  setDbPath,
  getDefaultDbPath,
  isDefaultLocation
} from '../services/db-location.service'
import { closeDatabase } from '../database/connection'
import { getBackupService } from '../services/backup.service'

const DB_FILE = 'facturacion.db'

interface ChangeResult {
  success?: boolean
  canceled?: boolean
  error?: string
  newPath?: string
}

async function pickFolder(event: Electron.IpcMainInvokeEvent): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(event.sender)
  const opts = {
    title: 'Selecciona la carpeta donde se guardara la base de datos',
    buttonLabel: 'Guardar aqui',
    properties: ['openDirectory', 'createDirectory'] as Array<
      'openDirectory' | 'createDirectory'
    >
  }
  const result = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

function verifyDbIntegrity(path: string): boolean {
  let db: Database.Database | null = null
  try {
    db = new Database(path, { readonly: true })
    const ok = db.pragma('integrity_check', { simple: true }) as string
    return ok === 'ok'
  } catch {
    return false
  } finally {
    db?.close()
  }
}

export function registerDbLocationHandlers(): void {
  ipcMain.handle('db:getInfo', () => ({
    currentPath: getDbPath(),
    defaultPath: getDefaultDbPath(),
    isDefault: isDefaultLocation()
  }))

  ipcMain.handle('db:changeLocation', async (event): Promise<ChangeResult> => {
    const newDir = await pickFolder(event)
    if (!newDir) return { canceled: true }

    const oldPath = getDbPath()
    const newPath = join(newDir, DB_FILE)

    if (newPath === oldPath) {
      return { error: 'Esa ya es la ubicacion actual de la base de datos.' }
    }

    // Make sure we can write to the target dir
    try {
      accessSync(newDir, constants.W_OK)
    } catch {
      return { error: 'No tienes permisos de escritura en esa carpeta.' }
    }

    if (existsSync(newPath)) {
      return {
        error:
          'Ya existe un archivo facturacion.db en esa carpeta. Elimina ese archivo primero o elige otra carpeta.'
      }
    }

    try {
      // Safety net: full backup before doing anything destructive
      await getBackupService().backupNow()

      // Consolidate WAL into the main file and release locks
      closeDatabase()

      // Copy the DB to the new location
      copyFileSync(oldPath, newPath)

      // Verify the copy is healthy before deleting the original
      if (!verifyDbIntegrity(newPath)) {
        try {
          unlinkSync(newPath)
        } catch {
          // ignore
        }
        return {
          error:
            'La verificacion de integridad fallo en la nueva ubicacion. No se hizo ningun cambio.'
        }
      }

      // Remove the original DB and any stale WAL/SHM (they were checkpointed on close)
      const oldWal = oldPath + '-wal'
      const oldShm = oldPath + '-shm'
      try {
        if (existsSync(oldWal)) unlinkSync(oldWal)
      } catch {
        // ignore
      }
      try {
        if (existsSync(oldShm)) unlinkSync(oldShm)
      } catch {
        // ignore
      }
      try {
        unlinkSync(oldPath)
      } catch {
        // ignore - leaving the old file is not catastrophic
      }

      // Persist new location and relaunch so the new DB connection opens cleanly
      setDbPath(newPath)
      app.relaunch()
      app.exit(0)
      return { success: true, newPath }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('db:resetToDefault', async (): Promise<ChangeResult> => {
    const current = getDbPath()
    const defaultPath = getDefaultDbPath()
    if (current === defaultPath) {
      return { error: 'Ya estas usando la ubicacion por defecto.' }
    }
    if (existsSync(defaultPath)) {
      return {
        error: 'Ya hay una base de datos en la ubicacion por defecto. Eliminala primero.'
      }
    }
    try {
      await getBackupService().backupNow()
      closeDatabase()
      copyFileSync(current, defaultPath)
      if (!verifyDbIntegrity(defaultPath)) {
        try {
          unlinkSync(defaultPath)
        } catch {
          // ignore
        }
        return { error: 'Verificacion de integridad fallo.' }
      }
      try {
        unlinkSync(current + '-wal')
      } catch {
        // ignore
      }
      try {
        unlinkSync(current + '-shm')
      } catch {
        // ignore
      }
      try {
        unlinkSync(current)
      } catch {
        // ignore
      }
      setDbPath(defaultPath)
      app.relaunch()
      app.exit(0)
      return { success: true, newPath: defaultPath }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
}
