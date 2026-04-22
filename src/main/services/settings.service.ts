import type Database from 'better-sqlite3'

export class SettingsService {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
      .run(key, value, value)
  }

  getAll(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  getExchangeRates(): { currency: string; rate: number; updated_at: string }[] {
    return this.db.prepare('SELECT currency, rate, updated_at FROM exchange_rates').all() as {
      currency: string
      rate: number
      updated_at: string
    }[]
  }

  updateExchangeRate(currency: string, rate: number): void {
    this.db
      .prepare("UPDATE exchange_rates SET rate = ?, updated_at = datetime('now') WHERE currency = ?")
      .run(rate, currency)
  }
}
