import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIcon from '../../resources/icon.png?asset'
import { initDatabase, closeDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import {
  isHealthyConnection,
  isHealthyDbFile,
  restoreFromLatestBackup,
  type RestoreInfo
} from './database/recovery'
import { registerAllHandlers } from './ipc'
import { captureHandlers } from './server/handler-registry'
import { startRpcServer } from './server/rpc-server'
import { registerClientHandlers, tryAutoConnect } from './client/client-proxy'
import { getRole, getNetworkConfig } from './services/network-config.service'
import { initBackupService, getBackupService } from './services/backup.service'
import { verifyAtStartup, startWatchdog, isPortable, getUsbDir } from './services/usb.service'
import { clearDbPath, getDbPath } from './services/db-location.service'

function formatDateTime(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Portable (USB) builds keep all their data on the USB itself so the database
// travels with the binary. Installed/dev builds store data in the PC's home dir.
const portableUsbDir = app.isPackaged ? getUsbDir() : null
app.setPath(
  'userData',
  portableUsbDir
    ? join(portableUsbDir, 'facturacion-data')
    : join(homedir(), '.facturacion-pos')
)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createPosWindow(): void {
  const posWindow = new BrowserWindow({
    width: 900,
    height: 700,
    autoHideMenuBar: true,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  posWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    posWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/#/pos-window')
  } else {
    posWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/pos-window' })
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.facturacion')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // CLIENT ("Acceso") build: no local database and no USB license — it is just a
  // terminal. All data goes to the server over the LAN; the renderer shows a
  // connection screen until a server + access key are confirmed. Printing and
  // windows stay local to this machine.
  if (getRole() === 'client') {
    registerClientHandlers()
    void tryAutoConnect()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
    return
  }

  // USB enforcement (portable builds only). No-op for installed/dev builds.
  if (!verifyAtStartup()) {
    app.quit()
    return
  }

  // Initialize database. Two failure modes are handled differently:
  //  - The file is missing/unreadable (USB unplugged, no permissions): fall back
  //    to the default location on next launch.
  //  - The file exists but is corrupt: auto-restore from the most recent valid
  //    backup and tell the user which backup (date/time) was used.
  const backupDir = join(app.getPath('userData'), 'backups')

  const openDb = (): ReturnType<typeof initDatabase> => {
    const d = initDatabase()
    runMigrations(d)
    // A malformed file often opens fine and only blows up on the first real
    // read, so scan every page before we trust it.
    if (!isHealthyConnection(d)) {
      throw new Error('database disk image is malformed')
    }
    return d
  }

  let db: ReturnType<typeof initDatabase>
  let restoreInfo: RestoreInfo | null = null
  try {
    db = openDb()
  } catch (err) {
    closeDatabase()
    const dbPath = getDbPath()
    const corrupt = existsSync(dbPath) && !isHealthyDbFile(dbPath)

    if (corrupt) {
      const info = restoreFromLatestBackup(dbPath, backupDir)
      if (info.restored) {
        try {
          db = openDb()
          restoreInfo = info
        } catch (err2) {
          dialog.showErrorBox(
            'No se pudo restaurar la base de datos',
            `El archivo estaba dañado y el respaldo mas reciente tampoco pudo abrirse.\n\n` +
              `Causa: ${(err2 as Error).message}\n\n` +
              `El archivo dañado se conservo. Contacta a soporte antes de continuar.`
          )
          app.exit(1)
          return
        }
      } else {
        dialog.showErrorBox(
          'Base de datos dañada',
          `Ruta: ${dbPath}\n\n` +
            `El archivo esta corrupto y no se encontro ningun respaldo valido para restaurar.\n\n` +
            `El archivo dañado NO se elimino. Contacta a soporte para intentar recuperarlo.`
        )
        app.exit(1)
        return
      }
    } else {
      dialog.showErrorBox(
        'No se pudo abrir la base de datos',
        `Ruta: ${dbPath}\n\n` +
          `Causa: ${(err as Error).message}\n\n` +
          `Posibles motivos: el disco/USB no esta conectado o sin permisos.\n\n` +
          `Al reiniciar la app volvera a usar la ubicacion por defecto. Tus respaldos siguen disponibles.`
      )
      clearDbPath()
      app.relaunch()
      app.exit(1)
      return
    }
  }

  // Initialize backup service (writes copies to userData/backups, rotates last 50)
  initBackupService(db)
  // Hourly safety-net backup on top of the write-triggered ones.
  getBackupService().startPeriodic()

  // If we recovered from a corrupt file, tell the user exactly which backup was
  // used so they know how much (if any) recent work needs to be re-entered.
  if (restoreInfo?.restored) {
    const when = restoreInfo.backupDate ? formatDateTime(restoreInfo.backupDate) : 'desconocida'
    dialog.showMessageBox({
      type: 'warning',
      title: 'Base de datos restaurada',
      message: 'Se detecto un archivo dañado y se restauro un respaldo.',
      detail:
        `La base de datos estaba corrupta (posible corte de luz o desconexion).\n\n` +
        `Se restauro automaticamente el respaldo del ${when}.\n\n` +
        (restoreInfo.corruptSavedAs
          ? `El archivo dañado se guardo como:\n${restoreInfo.corruptSavedAs}\n\n`
          : '') +
        `Cualquier cambio realizado despues de esa fecha debera reingresarse.`,
      buttons: ['Entendido']
    })
  }

  // Register IPC handlers (while recording them so the LAN server can reuse them)
  captureHandlers(() => registerAllHandlers(db))

  // On the primary (server) build, expose the database to other PCs on the LAN.
  if (getRole() === 'server' && getNetworkConfig().serverEnabled) {
    startRpcServer()
      .then(({ port }) => console.log(`[rpc] servidor LAN escuchando en el puerto ${port}`))
      .catch((err) => {
        dialog.showErrorBox(
          'No se pudo iniciar el servidor de red',
          `Otro programa podria estar usando el puerto ${getNetworkConfig().serverPort}, ` +
            `o el firewall lo bloquea.\n\nCausa: ${(err as Error).message}\n\n` +
            `La aplicacion seguira funcionando localmente; puedes cambiar el puerto en Configuracion.`
        )
      })
  }

  // Window management
  ipcMain.handle('window:openPos', () => {
    createPosWindow()
  })

  createWindow()

  // Watch the USB; if it gets unplugged while running, close the app to keep
  // the in-memory state from being silently lost when the binary's source disk
  // vanishes mid-operation.
  if (isPortable()) {
    startWatchdog(() => {
      dialog.showErrorBox(
        'USB desconectado',
        'El USB de la aplicacion fue removido. La aplicacion se cerrara.\nLa base de datos y los respaldos viven en el USB; vuelve a conectarlo para retomar el trabajo.'
      )
      app.quit()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
