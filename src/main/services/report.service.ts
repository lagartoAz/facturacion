import type Database from 'better-sqlite3'

export interface DailySale {
  day: string
  total: number
  count: number
  // Only populated by the debt series: paid-off credit invoices in the bucket.
  paidTotal?: number
  paidCount?: number
}

export interface HourlySale {
  hour: string
  total: number
  count: number
  paidTotal?: number
  paidCount?: number
}

export interface MonthlySale {
  month: string
  total: number
  count: number
  paidTotal?: number
  paidCount?: number
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

  dailySales(from: string, to: string, customerId?: number): DailySale[] {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [from, to, customerId] : [from, to]
    return this.db
      .prepare(
        `SELECT date(created_at) as day, SUM(total_usd) as total, COUNT(*) as count
         FROM invoices
         WHERE status = 'completed' AND date(created_at) >= ? AND date(created_at) <= ?${cust}
         GROUP BY day
         ORDER BY day ASC`
      )
      .all(...args) as DailySale[]
  }

  hourlySales(day: string, customerId?: number): HourlySale[] {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [day, customerId] : [day]
    return this.db
      .prepare(
        `SELECT strftime('%H', created_at) as hour, SUM(total_usd) as total, COUNT(*) as count
         FROM invoices
         WHERE status = 'completed' AND date(created_at) = ?${cust}
         GROUP BY hour
         ORDER BY hour ASC`
      )
      .all(...args) as HourlySale[]
  }

  monthlySales(from: string, to: string, customerId?: number): MonthlySale[] {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [from, to, customerId] : [from, to]
    return this.db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) as month, SUM(total_usd) as total, COUNT(*) as count
         FROM invoices
         WHERE status = 'completed' AND date(created_at) >= ? AND date(created_at) <= ?${cust}
         GROUP BY month
         ORDER BY month ASC`
      )
      .all(...args) as MonthlySale[]
  }

  // ---- Debts (credit invoices) by time bucket --------------------------------
  // A credit invoice counts as a *debt* only while it still owes money. Payments
  // are stored net per customer (not tied to a specific invoice), so we settle
  // them oldest-first (FIFO) — the same rule the debt dialog uses — to know which
  // invoices are fully paid. The charts then show only the unpaid ones (`count`/
  // `total`), with the settled ones available separately (`paidCount`/`paidTotal`)
  // for the optional "paid debts" trend bar.
  private creditInvoiceStatuses(
    customerId?: number
  ): { created_at: string; total_usd: number; unpaid: number; paid: boolean }[] {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const invArgs = customerId ? [customerId] : []
    const invoices = this.db
      .prepare(
        `SELECT customer_id, total_usd, created_at
         FROM invoices
         WHERE status = 'completed' AND payment_method = 'credit'${cust}
         ORDER BY customer_id, datetime(created_at) ASC, id ASC`
      )
      .all(...invArgs) as { customer_id: number | null; total_usd: number; created_at: string }[]

    const payRows = this.db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(amount_usd), 0) as total
         FROM customer_payments${customerId ? ' WHERE customer_id = ?' : ''}
         GROUP BY customer_id`
      )
      .all(...invArgs) as { customer_id: number; total: number }[]
    const paidByCustomer = new Map(payRows.map((p) => [p.customer_id, p.total]))

    const out: { created_at: string; total_usd: number; unpaid: number; paid: boolean }[] = []
    let curCust: number | null | undefined
    let remaining = 0
    for (const inv of invoices) {
      if (inv.customer_id !== curCust) {
        curCust = inv.customer_id
        remaining = inv.customer_id == null ? 0 : paidByCustomer.get(inv.customer_id) ?? 0
      }
      let unpaid: number
      if (remaining >= inv.total_usd) {
        remaining -= inv.total_usd
        unpaid = 0
      } else {
        unpaid = inv.total_usd - remaining
        remaining = 0
      }
      out.push({
        created_at: inv.created_at,
        total_usd: inv.total_usd,
        unpaid,
        paid: unpaid <= 0.009
      })
    }
    return out
  }

  // Group FIFO-settled credit invoices into time buckets. `key` extracts the
  // bucket id from a `created_at` timestamp; `inRange` keeps only the wanted rows.
  private bucketDebts(
    customerId: number | undefined,
    keyName: 'day' | 'hour' | 'month',
    key: (createdAt: string) => string,
    inRange: (createdAt: string) => boolean
  ): (DailySale & HourlySale & MonthlySale)[] {
    const map = new Map<
      string,
      { total: number; count: number; paidTotal: number; paidCount: number }
    >()
    for (const inv of this.creditInvoiceStatuses(customerId)) {
      if (!inRange(inv.created_at)) continue
      const k = key(inv.created_at)
      const e = map.get(k) ?? { total: 0, count: 0, paidTotal: 0, paidCount: 0 }
      if (inv.paid) {
        e.paidCount += 1
        e.paidTotal += inv.total_usd
      } else {
        e.count += 1
        e.total += inv.unpaid
      }
      map.set(k, e)
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, v]) => ({ [keyName]: k, ...v })) as (DailySale & HourlySale & MonthlySale)[]
  }

  dailyDebts(from: string, to: string, customerId?: number): DailySale[] {
    return this.bucketDebts(
      customerId,
      'day',
      (c) => c.slice(0, 10),
      (c) => {
        const d = c.slice(0, 10)
        return d >= from && d <= to
      }
    )
  }

  hourlyDebts(day: string, customerId?: number): HourlySale[] {
    return this.bucketDebts(
      customerId,
      'hour',
      (c) => c.slice(11, 13),
      (c) => c.slice(0, 10) === day
    )
  }

  monthlyDebts(from: string, to: string, customerId?: number): MonthlySale[] {
    return this.bucketDebts(
      customerId,
      'month',
      (c) => c.slice(0, 7),
      (c) => {
        const d = c.slice(0, 10)
        return d >= from && d <= to
      }
    )
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

  summary(from: string, to: string, customerId?: number): SalesSummary {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [from, to, customerId] : [from, to]
    const result = this.db
      .prepare(
        `SELECT COALESCE(SUM(total_usd), 0) as total_revenue,
                COUNT(*) as total_invoices,
                COALESCE(AVG(total_usd), 0) as average_ticket
         FROM invoices
         WHERE status = 'completed' AND date(created_at) >= ? AND date(created_at) <= ?${cust}`
      )
      .get(...args) as SalesSummary
    return result
  }
}
