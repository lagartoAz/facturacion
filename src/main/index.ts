import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import { registerAllHandlers } from './ipc'
import { initBackupService } from './services/backup.service'
import { verifyAtStartup, startWatchdog, isPortable, getUsbDir } from './services/usb.service'
import { clearDbPath, getDbPath } from './services/db-location.service'

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

  // USB enforcement (portable builds only). No-op for installed/dev builds.
  if (!verifyAtStartup()) {
    app.quit()
    return
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database. If it fails (e.g. user moved DB to a USB and it's not
  // connected right now), fall back to the default location on next launch.
  let db: ReturnType<typeof initDatabase>
  try {
    db = initDatabase()
    runMigrations(db)
  } catch (err) {
    dialog.showErrorBox(
      'No se pudo abrir la base de datos',
      `Ruta: ${getDbPath()}\n\n` +
        `Causa: ${(err as Error).message}\n\n` +
        `Posibles motivos: el disco/USB no esta conectado, sin permisos, o el archivo esta corrupto.\n\n` +
        `Al reiniciar la app volvera a usar la ubicacion por defecto. Tus respaldos siguen disponibles.`
    )
    clearDbPath()
    app.relaunch()
    app.exit(1)
    return
  }

  // Initialize backup service (writes copies to userData/backups, rotates last 50)
  initBackupService(db)

  // Register IPC handlers
  registerAllHandlers(db)

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
