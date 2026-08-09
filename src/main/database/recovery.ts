import Database from 'better-sqlite3'
import { join, dirname, basename } from 'path'
import { existsSync, copyFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'fs'

export interface RestoreInfo {
  restored: boolean
  reason?: 'no-backup' | 'copy-failed'
  backupName?: string
  backupDate?: Date
  corruptSavedAs?: string
}

// Opens the file read-only and runs a full page scan. Returns true only if
// SQLite reports "ok" — the same check that would otherwise blow up at runtime
// with "database disk image is malformed".
export function isHealthyDbFile(path: string): boolean {
  if (!existsSync(path)) return false
  let db: Database.Database | null = null
  try {
    db = new Database(path, { readonly: true, fileMustExist: true })
    const ok = db.pragma('quick_check', { simple: true }) as string
    return ok === 'ok'
  } catch {
    return false
  } finally {
    db?.close()
  }
}

// Runs quick_check on an already-open connection. Throws nothing; returns bool.
export function isHealthyConnection(db: Database.Database): boolean {
  try {
    return (db.pragma('quick_check', { simple: true }) as string) === 'ok'
  } catch {
    return false
  }
}

// Parse the timestamp baked into a backup filename: facturacion-YYYYMMDD-HHMMSS.db
function parseBackupDate(name: string): Date | null {
  const m = name.match(/facturacion-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return new Date(+y, +mo - 1, +d, +h, +mi, +s)
}

interface BackupEntry {
  path: string
  name: string
  date: Date
}

// All backups, newest first, using the filename timestamp (falling back to mtime).
export function listBackups(backupDir: string): BackupEntry[] {
  if (!existsSync(backupDir)) return []
  return readdirSync(backupDir)
    .filter((f) => f.startsWith('facturacion-') && f.endsWith('.db'))
    .map((f) => {
      const path = join(backupDir, f)
      const date = parseBackupDate(f) ?? statSync(path).mtime
      return { path, name: f, date }
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

// Removes the -wal / -shm sidecar files that belong to a database path.
function removeSidecars(dbPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const p = dbPath + suffix
    if (existsSync(p)) {
      try {
        unlinkSync(p)
      } catch {
        // ignore
      }
    }
  }
}

function stamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// Replaces the database file at `dbPath` with `sourcePath`, first moving the
// existing file aside (never deleting it) as facturacion.<suffix>-<ts>.db and
// clearing the stale -wal/-shm sidecars. Caller must ensure sourcePath is valid.
function swapInDatabase(
  dbPath: string,
  sourcePath: string,
  savedSuffix: string
): { savedAs?: string } {
  let savedAs: string | undefined
  if (existsSync(dbPath)) {
    savedAs = join(
      dirname(dbPath),
      `${basename(dbPath, '.db')}.${savedSuffix}-${stamp(new Date())}.db`
    )
    renameSync(dbPath, savedAs)
  }
  removeSidecars(dbPath)
  copyFileSync(sourcePath, dbPath)
  return { savedAs }
}

// Attempts to replace a corrupt database with the most recent *valid* backup.
// The corrupt file is never deleted — it is moved aside as
// facturacion.corrupt-<timestamp>.db so nothing is lost.
export function restoreFromLatestBackup(dbPath: string, backupDir: string): RestoreInfo {
  const candidates = listBackups(backupDir)
  const good = candidates.find((b) => isHealthyDbFile(b.path))
  if (!good) return { restored: false, reason: 'no-backup' }

  try {
    const { savedAs } = swapInDatabase(dbPath, good.path, 'corrupt')
    return { restored: true, backupName: good.name, backupDate: good.date, corruptSavedAs: savedAs }
  } catch (err) {
    console.error('[recovery] restore failed:', err)
    return { restored: false, reason: 'copy-failed' }
  }
}

// Restores a specific backup chosen by the user. Validates the backup first so
// we never overwrite a working database with a broken copy. The replaced file is
// preserved as facturacion.prev-<timestamp>.db.
export function restoreFromFile(dbPath: string, backupPath: string): RestoreInfo {
  if (!isHealthyDbFile(backupPath)) return { restored: false, reason: 'copy-failed' }
  try {
    const { savedAs } = swapInDatabase(dbPath, backupPath, 'prev')
    const name = basename(backupPath)
    return { restored: true, backupName: name, backupDate: parseBackupDate(name) ?? undefined, corruptSavedAs: savedAs }
  } catch (err) {
    console.error('[recovery] manual restore failed:', err)
    return { restored: false, reason: 'copy-failed' }
  }
}
