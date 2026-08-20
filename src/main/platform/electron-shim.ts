// Minimal stand-in for the Electron modules the servable backend imports, so the
// SAME services + RPC server run under plain Node (nodejs-mobile) when the phone
// acts as the server. The mobile build aliases `electron` to this file; the
// desktop build keeps the real Electron, so the desktop is completely untouched.
//
// Only the surface the backend actually touches is implemented. UI-bound APIs
// (windows, dialogs, shell) are inert stubs: on a mobile server those belong to
// LOCAL_ONLY channels that are never invoked remotely, so their handlers register
// but never run.

import { join } from 'path'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'

// The native (nodejs-mobile) layer passes the app's private data directory via
// this env var. Falls back to a temp dir for headless runs/tests.
const baseDir = process.env.FACT_DATA_DIR || join(tmpdir(), 'facturacion-mobile')
try {
  mkdirSync(baseDir, { recursive: true })
} catch {
  // ignore; a real failure surfaces when the DB/config is written
}

export const app = {
  getPath(name: string): string {
    if (name === 'userData' || name === 'appData') return baseDir
    const p = join(baseDir, name)
    try {
      mkdirSync(p, { recursive: true })
    } catch {
      // ignore
    }
    return p
  },
  getAppPath: (): string => baseDir,
  getVersion: (): string => process.env.FACT_VERSION || '1.13.0',
  getName: (): string => 'facturacion',
  isPackaged: true,
  setPath: (): void => {},
  relaunch: (): void => {},
  exit: (): void => {},
  quit: (): void => {},
  on(): typeof app {
    return app
  },
  once(): typeof app {
    return app
  },
  whenReady: (): Promise<void> => Promise.resolve()
}

type Handler = (...args: unknown[]) => unknown

// captureHandlers() monkeypatches `.handle` on this shared singleton, exactly as
// it does with Electron's real ipcMain — so the RPC server can dispatch handlers.
export const ipcMain = {
  handle: (_channel: string, _listener: Handler): void => {},
  removeHandler: (_channel: string): void => {},
  on: (): void => {}
}

export class BrowserWindow {
  static getAllWindows(): BrowserWindow[] {
    return []
  }
  static getFocusedWindow(): BrowserWindow | null {
    return null
  }
  static fromWebContents(): BrowserWindow | null {
    return null
  }
}

export const dialog = {
  showErrorBox: (): void => {},
  showOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
    canceled: true,
    filePaths: []
  }),
  showSaveDialog: async (): Promise<{ canceled: boolean; filePath?: string }> => ({
    canceled: true
  }),
  showMessageBox: async (): Promise<{ response: number }> => ({ response: 0 })
}

export const shell = {
  openPath: async (): Promise<string> => '',
  openExternal: async (): Promise<void> => {}
}

export default { app, ipcMain, BrowserWindow, dialog, shell }
