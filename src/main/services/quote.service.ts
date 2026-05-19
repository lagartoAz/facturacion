import type Database from 'better-sqlite3'

export interface QuoteItem {
  productId?: number
  productName: string
  quantity: number
  unitPrice: number
  isCustom?: boolean
}

export interface CreateQuoteDTO {
  customerId?: number
  items: QuoteItem[]
  notes?: string
}

export interface QuoteItemRow {
  id: number
  quote_id: number
  product_id: number | null
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface Quote {
  id: number
  quote_number: string
  customer_id: number | null
  customer_name?: string | null
  subtotal_usd: number
  total_usd: number
  rate_ves: number | null
  rate_cop: number | null
  total_ves: number | null
  total_cop: number | null
  notes: string | null
  created_at: string
  items?: QuoteItemRow[]
}

export interface QuoteFilters {
  from?: string
  to?: string
}

export class QuoteService {
  constructor(private db: Database.Database) {}

  create(data: CreateQuoteDTO): Quote {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare("SELECT value FROM settings WHERE key = 'next_quote_number'")
        .get() as { value: string } | undefined
      const next = parseInt(row?.value ?? '1')
      const quoteNumber = `PRES-${String(next).padStart(6, '0')}`
      this.db
        .prepare("UPDATE settings SET value = ? WHERE key = 'next_quote_number'")
        .run(String(next + 1))

      const rates = this.db
        .prepare('SELECT currency, rate FROM exchange_rates')
        .all() as { currency: string; rate: number }[]
      const rateVes = rates.find((r) => r.currency === 'VES')?.rate ?? 0
      const rateCop = rates.find((r) => r.currency === 'COP')?.rate ?? 0

      const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      const total = subtotal

      const result = this.db
        .prepare(
          `INSERT INTO quotes (quote_number, customer_id, subtotal_usd, total_usd,
             rate_ves, rate_cop, total_ves, total_cop, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
        )
        .run(
          quoteNumber,
          data.customerId ?? null,
          subtotal,
          total,
          rateVes,
          rateCop,
          total * rateVes,
          total * rateCop,
          data.notes ?? null
        )

      const insertItem = this.db.prepare(
        `INSERT INTO quote_items (quote_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const item of data.items) {
        insertItem.run(
          result.lastInsertRowid,
          item.isCustom ? null : item.productId ?? null,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.quantity * item.unitPrice
        )
      }

      return this.getById(Number(result.lastInsertRowid))!
    })
    return tx()
  }

  getAll(filters?: QuoteFilters): Quote[] {
    let query = `
      SELECT q.*, c.name AS customer_name
      FROM quotes q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (filters?.from) {
      query += ' AND q.created_at >= ?'
      params.push(filters.from)
    }
    if (filters?.to) {
      query += ' AND q.created_at <= ?'
      params.push(filters.to + ' 23:59:59')
    }
    query += ' ORDER BY q.created_at DESC'
    return this.db.prepare(query).all(...params) as Quote[]
  }

  getById(id: number): Quote | undefined {
    const quote = this.db
      .prepare(
        `SELECT q.*, c.name AS customer_name
         FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id
         WHERE q.id = ?`
      )
      .get(id) as Quote | undefined
    if (quote) {
      quote.items = this.db
        .prepare('SELECT * FROM quote_items WHERE quote_id = ?')
        .all(id) as QuoteItemRow[]
    }
    return quote
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM quotes WHERE id = ?').run(id)
  }
}
