// Entry point for the embedded backend when an Android device is the server.
// Runs inside nodejs-mobile with `electron` aliased to ../platform/electron-shim.
// It brings up the exact same schema, services and RPC server used on desktop —
// only the SQLite engine differs (node-sqlite3-wasm via MobileDatabase).

import type Database from 'better-sqlite3'
import { app } from 'electron' // aliased to electron-shim in the mobile build
import { join } from 'path'
import { MobileDatabase } from '../database/mobile-sqlite'
import { runMigrations } from '../database/migrations'
import { registerAllHandlers } from '../ipc'
import { captureHandlers } from '../server/handler-registry'
import { startRpcServer } from '../server/rpc-server'
import { initBackupService, getBackupService } from '../services/backup.service'

let db: Database.Database | null = null

// Starts the LAN server. Returns the bound port so the UI can show the address
// (http://<phone-ip>:<port>) that other terminals connect to.
export async function startMobileServer(): Promise<{ port: number }> {
  const dbPath = join(app.getPath('userData'), 'facturacion.db')
  db = new MobileDatabase(dbPath) as unknown as Database.Database
  runMigrations(db)

  // Same data-safety net as the desktop server: write-triggered + hourly backups.
  initBackupService(db)
  getBackupService().startPeriodic()

  // Record every ipcMain.handle registration so the RPC server can dispatch the
  // same handlers to LAN clients (identical to the desktop server path).
  captureHandlers(() => registerAllHandlers(db as Database.Database))

  return startRpcServer()
}

export function getMobileDb(): Database.Database | null {
  return db
}
