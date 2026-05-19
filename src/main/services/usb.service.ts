import { app, dialog } from 'electron'
import { accessSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'

const LICENSE_FILE = 'facturacion-license.dat'
const CHECK_INTERVAL_MS = 5000
const LICENSE_MAGIC = 'FACTURACION-POS-LICENSE'

let watchdog: NodeJS.Timeout | null = null

// In portable mode (electron-builder portable target on Windows), the .exe lives
// on the USB even though it executes from a temp dir. PORTABLE_EXECUTABLE_DIR
// always points to the original location (the USB).
// AppImage on Linux exposes APPIMAGE with the .AppImage path.
export function getUsbDir(): string | null {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR
  if (process.env.APPIMAGE) return dirname(process.env.APPIMAGE)
  return null
}

export function isPortable(): boolean {
  return getUsbDir() !== null && app.isPackaged
}

function getLicensePath(): string | null {
  const dir = getUsbDir()
  return dir ? join(dir, LICENSE_FILE) : null
}

function isUsbAccessible(): boolean {
  const dir = getUsbDir()
  if (!dir) return false
  try {
    accessSync(dir)
    return true
  } catch {
    return false
  }
}

function isLicenseValid(): boolean {
  const path = getLicensePath()
  if (!path || !existsSync(path)) return false
  try {
    const content = readFileSync(path, 'utf8').trim()
    return content.startsWith(LICENSE_MAGIC)
  } catch {
    return false
  }
}

// Initialize a fresh license.dat the very first time the portable binary runs on a USB.
// After that, the same file is reused on any PC.
function bootstrapLicenseIfNeeded(): boolean {
  const path = getLicensePath()
  if (!path) return false
  if (existsSync(path)) return true
  try {
    const id = randomBytes(16).toString('hex')
    const content = `${LICENSE_MAGIC}\nid=${id}\ncreated=${new Date().toISOString()}\n`
    writeFileSync(path, content, 'utf8')
    return true
  } catch (err) {
    console.error('[usb] could not write license.dat:', err)
    return false
  }
}

// Returns true if the app may run.
export function verifyAtStartup(): boolean {
  if (!isPortable()) return true // installed (NSIS) or dev mode: skip check
  if (!isUsbAccessible()) {
    dialog.showErrorBox(
      'USB no detectado',
      'No se puede acceder al USB de la aplicacion. Conecta el USB autorizado y vuelve a abrir la app.'
    )
    return false
  }
  if (!isLicenseValid()) {
    if (!bootstrapLicenseIfNeeded()) {
      dialog.showErrorBox(
        'Error de licencia',
        `No se pudo crear el archivo de licencia en el USB.\nVerifica que el USB no este protegido contra escritura.`
      )
      return false
    }
  }
  return true
}

export function startWatchdog(onLost: () => void): void {
  if (!isPortable()) return
  if (watchdog) clearInterval(watchdog)
  watchdog = setInterval(() => {
    if (!isUsbAccessible() || !isLicenseValid()) {
      stopWatchdog()
      onLost()
    }
  }, CHECK_INTERVAL_MS)
}

export function stopWatchdog(): void {
  if (watchdog) {
    clearInterval(watchdog)
    watchdog = null
  }
}

export interface UsbStatus {
  portable: boolean
  usbDir: string | null
  connected: boolean
  licenseOk: boolean
  licensePath: string | null
}

export function getUsbStatus(): UsbStatus {
  return {
    portable: isPortable(),
    usbDir: getUsbDir(),
    connected: isUsbAccessible(),
    licenseOk: isLicenseValid(),
    licensePath: getLicensePath()
  }
}
