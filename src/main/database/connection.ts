import Database from 'better-sqlite3'
import { dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { getDbPath } from '../services/db-location.service'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Force fsync on every commit so committed transactions survive power loss
  // (the default NORMAL only protects against app crashes, not sudden power off)
  db.pragma('synchronous = FULL')

  return db
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // ignore
    }
    db.close()
    db = null
  }
}
