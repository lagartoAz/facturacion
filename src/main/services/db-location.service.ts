import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

interface DbConfig {
  dbPath: string
}

const DEFAULT_FILENAME = 'facturacion.db'

function configFilePath(): string {
  // Lives in userData so it survives app reinstalls and is per-user.
  return join(app.getPath('userData'), 'db-config.json')
}

function defaultDbPath(): string {
  return join(app.getPath('userData'), DEFAULT_FILENAME)
}

export function getDbPath(): string {
  const cfg = configFilePath()
  if (!existsSync(cfg)) return defaultDbPath()
  try {
    const data = JSON.parse(readFileSync(cfg, 'utf8')) as DbConfig
    return data.dbPath?.trim() ? data.dbPath : defaultDbPath()
  } catch {
    return defaultDbPath()
  }
}

export function setDbPath(path: string): void {
  const cfg: DbConfig = { dbPath: path }
  writeFileSync(configFilePath(), JSON.stringify(cfg, null, 2), 'utf8')
}

export function clearDbPath(): void {
  const cfg: DbConfig = { dbPath: '' }
  writeFileSync(configFilePath(), JSON.stringify(cfg, null, 2), 'utf8')
}

export function getDefaultDbPath(): string {
  return defaultDbPath()
}

export function isDefaultLocation(): boolean {
  return getDbPath() === defaultDbPath()
}
