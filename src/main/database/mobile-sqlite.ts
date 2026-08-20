// Adapter that presents the subset of the better-sqlite3 API used across the
// services on top of node-sqlite3-wasm, so the SAME service/migration code runs
// unchanged when the backend is embedded in Android (nodejs-mobile).
//
// Supported surface (audited against src/main): prepare(), exec(), pragma(),
// transaction(), close(); statement run()/get()/all() with positional (?) params
// and { changes, lastInsertRowid } results. No named params, pluck, raw or
// iterate are used in this codebase.

import { rmSync, copyFileSync } from 'fs'
import { Database as WasmDatabase } from 'node-sqlite3-wasm'

type Params = unknown[]

interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

// Mirrors better-sqlite3's Statement for the calls the services make. Positional
// arguments are collected and forwarded to node-sqlite3-wasm as a params array.
class MobileStatement {
  constructor(private readonly stmt: import('node-sqlite3-wasm').Statement) {}

  run(...params: Params): RunResult {
    const r = this.stmt.run(params as never)
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid }
  }

  get(...params: Params): unknown {
    return this.stmt.get(params as never) ?? undefined
  }

  all(...params: Params): unknown[] {
    return this.stmt.all(params as never)
  }
}

export interface PragmaOptions {
  simple?: boolean
}

export class MobileDatabase {
  private readonly db: WasmDatabase
  private readonly path: string

  constructor(path: string) {
    this.path = path
    // node-sqlite3-wasm guards the file with a `<path>.lock` directory. If the
    // app is killed by the OS without a clean close (common on Android), that
    // lock is orphaned and every later open fails with "database is locked".
    // Only one process ever opens this DB, so a leftover lock is always stale.
    try {
      rmSync(`${path}.lock`, { recursive: true, force: true })
    } catch {
      // ignore; opening below will surface any real problem
    }
    this.db = new WasmDatabase(path)
    // Enforce referential integrity like the desktop engine. WAL is intentionally
    // NOT enabled here: the wasm VFS does not support it; the default rollback
    // journal is used instead.
    this.db.exec('PRAGMA foreign_keys = ON')
  }

  prepare(sql: string): MobileStatement {
    return new MobileStatement(this.db.prepare(sql))
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  // Emulates better-sqlite3's db.pragma(source, { simple }). Assignment pragmas
  // (contain '=' or '(...)') are executed; query pragmas return rows, or the
  // first scalar when { simple: true }.
  pragma(source: string, opts?: PragmaOptions): unknown {
    const isAssignment = source.includes('=') || source.includes('(')
    if (opts?.simple) {
      const row = this.db.get(`PRAGMA ${source}`) as Record<string, unknown> | undefined
      return row ? Object.values(row)[0] : undefined
    }
    if (isAssignment) {
      try {
        this.db.exec(`PRAGMA ${source}`)
      } catch {
        // e.g. journal_mode = WAL / wal_checkpoint are no-ops on the wasm VFS
      }
      return undefined
    }
    return this.db.all(`PRAGMA ${source}`)
  }

  // better-sqlite3 returns a callable that runs `fn` inside a transaction. None of
  // the callers nest transactions, so plain BEGIN/COMMIT/ROLLBACK is sufficient.
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      this.db.exec('BEGIN')
      try {
        const result = fn(...args)
        this.db.exec('COMMIT')
        return result
      } catch (err) {
        try {
          this.db.exec('ROLLBACK')
        } catch {
          // ignore rollback failure; surface the original error
        }
        throw err
      }
    }
  }

  // better-sqlite3 exposes an online backup(); node-sqlite3-wasm has none. As a
  // single-process file DB with no open transaction at call time (the backup
  // service checkpoints first), a plain file copy is a consistent snapshot.
  async backup(target: string): Promise<void> {
    copyFileSync(this.path, target)
  }

  close(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      // ignore
    }
    this.db.close()
  }
}
