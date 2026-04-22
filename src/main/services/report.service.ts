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

export interface ProductStats {
  total_quantity: number
  total_revenue: number
  total_invoices: number
  first_sale: string | null
  last_sale: string | null
  monthly_sales: { month: string; quantity: number; revenue: number }[]
}

export class ReportService {
  constructor(private db: Database.Database) {}

  productStats(productId: number): ProductStats {
    const totals = this.db
      .prepare(
        `SELECT COALESCE(SUM(ii.quantity), 0) as total_quantity,
                COALESCE(SUM(ii.subtotal), 0) as total_revenue,
                COUNT(DISTINCT ii.invoice_id) as total_invoices,
                MIN(i.created_at) as first_sale,
                MAX(i.created_at) as last_sale
         FROM invoice_items ii
         JOIN invoices i ON ii.invoice_id = i.id
         WHERE ii.product_id = ? AND i.status = 'completed'`
      )
      .get(productId) as {
      total_quantity: number
      total_revenue: number
      total_invoices: number
      first_sale: string | null
      last_sale: string | null
    }

    const monthly_sales = this.db
      .prepare(
        `SELECT strftime('%Y-%m', i.created_at) as month,
                SUM(ii.quantity) as quantity,
                SUM(ii.subtotal) as revenue
         FROM invoice_items ii
         JOIN invoices i ON ii.invoice_id = i.id
         WHERE ii.product_id = ? AND i.status = 'completed'
         GROUP BY month
         ORDER BY month DESC
         LIMIT 12`
      )
      .all(productId) as { month: string; quantity: number; revenue: number }[]

    return { ...totals, monthly_sales }
  }

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
