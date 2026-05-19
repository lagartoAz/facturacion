import type Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'

const MAX_BACKUPS = 50
const DEBOUNCE_MS = 1000

let instance: BackupService | null = null

export class BackupService {
  private backupDir: string
  private debounceTimer: NodeJS.Timeout | null = null
  private running = false
  private pending = false

  constructor(private db: Database.Database) {
    this.backupDir = join(app.getPath('userData'), 'backups')
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true })
    }
  }

  // Force WAL contents into the main .db file. Cheap, safe to call often.
  checkpoint(): void {
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)')
    } catch (err) {
      console.error('[backup] checkpoint failed:', err)
    }
  }

  // Debounced backup: multiple rapid writes (e.g. several sales in a row)
  // coalesce into one backup ~1s after the last call.
  schedule(): void {
    this.checkpoint()
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.runBackup()
    }, DEBOUNCE_MS)
  }

  private async runBackup(): Promise<void> {
    if (this.running) {
      this.pending = true
      return
    }
    this.running = true
    try {
      const target = join(this.backupDir, `facturacion-${timestamp()}.db`)
      await this.db.backup(target)
      this.rotate()
    } catch (err) {
      console.error('[backup] failed:', err)
    } finally {
      this.running = false
      if (this.pending) {
        this.pending = false
        void this.runBackup()
      }
    }
  }

  async backupNow(): Promise<string> {
    this.checkpoint()
    const target = join(this.backupDir, `facturacion-${timestamp()}.db`)
    await this.db.backup(target)
    this.rotate()
    return target
  }

  private rotate(): void {
    try {
      const files = readdirSync(this.backupDir)
        .filter((f) => f.startsWith('facturacion-') && f.endsWith('.db'))
        .map((f) => ({ name: f, path: join(this.backupDir, f) }))
        .sort((a, b) => statSync(a.path).mtimeMs - statSync(b.path).mtimeMs)
      while (files.length > MAX_BACKUPS) {
        const oldest = files.shift()!
        unlinkSync(oldest.path)
      }
    } catch (err) {
      console.error('[backup] rotate failed:', err)
    }
  }

  list(): { name: string; path: string; size: number; createdAt: Date }[] {
    if (!existsSync(this.backupDir)) return []
    return readdirSync(this.backupDir)
      .filter((f) => f.startsWith('facturacion-') && f.endsWith('.db'))
      .map((f) => {
        const path = join(this.backupDir, f)
        const stat = statSync(path)
        return { name: f, path, size: stat.size, createdAt: stat.mtime }
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  getDir(): string {
    return this.backupDir
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function timestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export function initBackupService(db: Database.Database): BackupService {
  if (!instance) instance = new BackupService(db)
  return instance
}

export function getBackupService(): BackupService {
  if (!instance) throw new Error('BackupService not initialized')
  return instance
}
