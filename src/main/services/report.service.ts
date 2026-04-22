import type Database from 'better-sqlite3'

export interface DailySale {
  day: string
  total: number
  count: number
}

export interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

export interface SalesSummary {
  total_revenue: number
  total_invoices: number
  average_ticket: number
}

export class ReportService {
  constructor(private db: Database.Database) {}

  dailySales(from: string, to: string): DailySale[] {
    return this.db
      .prepare(
        `SELECT date(created_at) as day, SUM(total_usd) as total, COUNT(*) as count
         FROM invoices
         WHERE status = 'completed' AND date(created_at) >= ? AND date(created_at) <= ?
         GROUP BY day
         ORDER BY day ASC`
      )
      .all(from, to) as DailySale[]
  }

  topProducts(from: string, to: string, limit = 10): TopProduct[] {
    return this.db
      .prepare(
        `SELECT ii.product_name as name, SUM(ii.quantity) as quantity, SUM(ii.subtotal) as revenue
         FROM invoice_items ii
         JOIN invoices i ON ii.invoice_id = i.id
         WHERE i.status = 'completed' AND date(i.created_at) >= ? AND date(i.created_at) <= ?
         GROUP BY ii.product_id
         ORDER BY quantity DESC
         LIMIT ?`
      )
      .all(from, to, limit) as TopProduct[]
  }

  summary(from: string, to: string): SalesSummary {
    const result = this.db
      .prepare(
        `SELECT COALESCE(SUM(total_usd), 0) as total_revenue,
                COUNT(*) as total_invoices,
                COALESCE(AVG(total_usd), 0) as average_ticket
         FROM invoices
         WHERE status = 'completed' AND date(created_at) >= ? AND date(created_at) <= ?`
      )
      .get(from, to) as SalesSummary
    return result
  }
}
