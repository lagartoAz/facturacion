import type Database from 'better-sqlite3'
import type { DailySale, HourlySale, MonthlySale, SalesSummary, TopProduct } from './report.service'

export interface LoyaltyConfig {
  enabled: boolean
  // Program mode: which currencies are active.
  mode: 'points' | 'tickets' | 'both'
  // Earning rules (additive) — points
  earn_money: boolean
  points_per_usd: number
  earn_product: boolean
  earn_invoice: boolean
  points_per_invoice: number
  currency_filter: string // '' | 'USD' | 'VES' | 'COP'
  exclude_credit: boolean
  // Per-invoice caps
  cap_points_enabled: boolean
  max_points_per_invoice: number
  cap_tickets_enabled: boolean
  max_tickets_per_invoice: number
  // Accumulation cap (tickets a customer may hold in the current raffle; 0 = unlimited)
  max_tickets_accumulable: number
  // Earning rules — tickets (independent from points)
  tickets_earn_invoice: boolean
  tickets_per_invoice: number
  tickets_earn_money: boolean
  usd_per_ticket: number
  // Levels
  levels_enabled: boolean
  level_window_months: number
  // Rewards
  rewards_enabled: boolean
  redeem_value_usd: number
  // Raffle
  raffle_enabled: boolean
  raffle_points_per_entry: number
  raffle_min_points: number
  exclude_red_debtors: boolean
  raffle_animation: string // 'ruleta' | 'minimal'
  tickets_enabled: boolean // physical printable tickets
  winner_template: string
  show_reward_on_receipt: boolean // print earned points/tickets on the sale receipt
  show_raffle_on_receipt: boolean // print the active raffle name on the sale receipt
}

// Whether points / tickets are active under the current mode.
export function pointsActive(mode: string): boolean {
  return mode === 'points' || mode === 'both'
}
export function ticketsActive(mode: string): boolean {
  return mode === 'tickets' || mode === 'both'
}

export interface LoyaltyLevel {
  id: number
  name: string
  min_points: number
  sort_order: number
  color: string | null
}

export interface LevelBenefit {
  id: number
  level_id: number
  kind: 'discount_fixed' | 'monthly_coupon' | 'monthly_raffle' | 'custom'
  value: number
  unit: string | null // 'usd' | 'pct'
  note: string | null
}

export interface CustomerLevel {
  level: LoyaltyLevel | null
  earned_window: number
  benefits: LevelBenefit[]
}

export interface Coupon {
  id: number
  customer_id: number
  reward_id: number | null
  name: string
  kind: 'discount_usd' | 'discount_pct' | 'custom'
  value: number
  cost_points: number
  status: 'active' | 'used'
  created_at: string
  used_at: string | null
  invoice_id: number | null
}

export interface InvoiceTickets {
  invoiceNumber: string
  customerName: string | null
  raffleName: string | null
  count: number
  codes: string[]
}

export interface LoyaltyEntry {
  id: number
  customer_id: number
  invoice_id: number | null
  points: number
  type: string
  note: string | null
  created_at: string
}

export interface CustomerPoints {
  customer_id: number
  name: string
  points: number
  tickets: number
  entries: number
  level_name: string | null
  level_color: string | null
}

export interface Reward {
  id: number
  name: string
  kind: 'discount_usd' | 'discount_pct' | 'ticket' | 'custom'
  cost_points: number
  value: number
  tickets: number
  active: number
}

export interface Raffle {
  id: number
  name: string
  status: 'open' | 'drawn'
  points_per_entry: number
  min_points: number
  winner_customer_id: number | null
  winner_name: string | null
  drawn_at: string | null
  created_at: string
  kind: 'general' | 'level'
  level_id: number | null
  period: string | null
}

export interface RaffleParticipant {
  customer_id: number
  name: string
  points: number
  entries: number
}

export interface EarnContext {
  customerId: number | null
  invoiceId: number
  totalUsd: number
  paymentMethod: string
  currency: string // resolved sale currency: 'USD' | 'VES' | 'COP'
  items: { productId?: number | null; quantity: number }[]
}

// Loyalty points ("Fidelidad") data access. The ledger is append-only, so a
// customer's balance is SUM(points) over their rows. Raffle entries derive from
// that balance, so nothing can drift.
export class LoyaltyService {
  constructor(private db: Database.Database) {}

  private get(key: string, fallback: string): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? fallback
  }

  private set(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }

  getConfig(): LoyaltyConfig {
    const mode = this.get('loyalty_mode', 'points')
    return {
      enabled: this.get('loyalty_enabled', '0') === '1',
      mode: (mode === 'tickets' || mode === 'both' ? mode : 'points') as LoyaltyConfig['mode'],
      earn_money: this.get('loyalty_earn_money', '1') === '1',
      points_per_usd: parseFloat(this.get('loyalty_points_per_usd', '1')) || 0,
      earn_product: this.get('loyalty_earn_product', '0') === '1',
      earn_invoice: this.get('loyalty_earn_invoice', '0') === '1',
      points_per_invoice: parseFloat(this.get('loyalty_points_per_invoice', '0')) || 0,
      currency_filter: this.get('loyalty_currency_filter', ''),
      exclude_credit: this.get('loyalty_exclude_credit', '1') === '1',
      cap_points_enabled: this.get('loyalty_cap_points_enabled', '1') === '1',
      max_points_per_invoice: parseFloat(this.get('loyalty_max_points_per_invoice', '100')) || 0,
      cap_tickets_enabled: this.get('loyalty_cap_tickets_enabled', '1') === '1',
      max_tickets_per_invoice: parseFloat(this.get('loyalty_max_tickets_per_invoice', '3')) || 0,
      max_tickets_accumulable: parseFloat(this.get('loyalty_max_tickets_accumulable', '5')) || 0,
      tickets_earn_invoice: this.get('loyalty_tickets_earn_invoice', '1') === '1',
      tickets_per_invoice: parseFloat(this.get('loyalty_tickets_per_invoice', '1')) || 0,
      tickets_earn_money: this.get('loyalty_tickets_earn_money', '0') === '1',
      usd_per_ticket: parseFloat(this.get('loyalty_usd_per_ticket', '0')) || 0,
      levels_enabled: this.get('loyalty_levels_enabled', '1') === '1',
      level_window_months: parseInt(this.get('loyalty_level_window_months', '12'), 10) || 0,
      rewards_enabled: this.get('loyalty_rewards_enabled', '1') === '1',
      redeem_value_usd: parseFloat(this.get('loyalty_redeem_value_usd', '0.01')) || 0,
      raffle_enabled: this.get('loyalty_raffle_enabled', '0') === '1',
      raffle_points_per_entry: parseFloat(this.get('loyalty_raffle_points_per_entry', '0')) || 0,
      raffle_min_points: parseFloat(this.get('loyalty_raffle_min_points', '0')) || 0,
      exclude_red_debtors: this.get('loyalty_exclude_red_debtors', '0') === '1',
      raffle_animation: this.get('loyalty_raffle_animation', 'ruleta'),
      tickets_enabled: this.get('loyalty_tickets_enabled', '0') === '1',
      winner_template: this.get('loyalty_winner_template', ''),
      show_reward_on_receipt: this.get('loyalty_show_reward_on_receipt', '1') === '1',
      show_raffle_on_receipt: this.get('loyalty_show_raffle_on_receipt', '1') === '1'
    }
  }

  setConfig(cfg: Partial<LoyaltyConfig>): LoyaltyConfig {
    const bool = (b: boolean): string => (b ? '1' : '0')
    const map: Record<string, string | undefined> = {
      loyalty_mode: cfg.mode === undefined ? undefined : cfg.mode,
      loyalty_cap_points_enabled:
        cfg.cap_points_enabled === undefined ? undefined : bool(cfg.cap_points_enabled),
      loyalty_max_points_per_invoice:
        cfg.max_points_per_invoice === undefined ? undefined : String(cfg.max_points_per_invoice),
      loyalty_cap_tickets_enabled:
        cfg.cap_tickets_enabled === undefined ? undefined : bool(cfg.cap_tickets_enabled),
      loyalty_max_tickets_per_invoice:
        cfg.max_tickets_per_invoice === undefined ? undefined : String(cfg.max_tickets_per_invoice),
      loyalty_max_tickets_accumulable:
        cfg.max_tickets_accumulable === undefined ? undefined : String(cfg.max_tickets_accumulable),
      loyalty_tickets_earn_invoice:
        cfg.tickets_earn_invoice === undefined ? undefined : bool(cfg.tickets_earn_invoice),
      loyalty_tickets_per_invoice:
        cfg.tickets_per_invoice === undefined ? undefined : String(cfg.tickets_per_invoice),
      loyalty_tickets_earn_money:
        cfg.tickets_earn_money === undefined ? undefined : bool(cfg.tickets_earn_money),
      loyalty_usd_per_ticket:
        cfg.usd_per_ticket === undefined ? undefined : String(cfg.usd_per_ticket),
      loyalty_levels_enabled:
        cfg.levels_enabled === undefined ? undefined : bool(cfg.levels_enabled),
      loyalty_level_window_months:
        cfg.level_window_months === undefined ? undefined : String(cfg.level_window_months),
      loyalty_earn_money: cfg.earn_money === undefined ? undefined : bool(cfg.earn_money),
      loyalty_points_per_usd: cfg.points_per_usd === undefined ? undefined : String(cfg.points_per_usd),
      loyalty_earn_product: cfg.earn_product === undefined ? undefined : bool(cfg.earn_product),
      loyalty_earn_invoice: cfg.earn_invoice === undefined ? undefined : bool(cfg.earn_invoice),
      loyalty_points_per_invoice:
        cfg.points_per_invoice === undefined ? undefined : String(cfg.points_per_invoice),
      loyalty_currency_filter: cfg.currency_filter === undefined ? undefined : cfg.currency_filter,
      loyalty_exclude_credit: cfg.exclude_credit === undefined ? undefined : bool(cfg.exclude_credit),
      loyalty_rewards_enabled:
        cfg.rewards_enabled === undefined ? undefined : bool(cfg.rewards_enabled),
      loyalty_redeem_value_usd:
        cfg.redeem_value_usd === undefined ? undefined : String(cfg.redeem_value_usd),
      loyalty_raffle_enabled: cfg.raffle_enabled === undefined ? undefined : bool(cfg.raffle_enabled),
      loyalty_raffle_points_per_entry:
        cfg.raffle_points_per_entry === undefined ? undefined : String(cfg.raffle_points_per_entry),
      loyalty_raffle_min_points:
        cfg.raffle_min_points === undefined ? undefined : String(cfg.raffle_min_points),
      loyalty_exclude_red_debtors:
        cfg.exclude_red_debtors === undefined ? undefined : bool(cfg.exclude_red_debtors),
      loyalty_raffle_animation:
        cfg.raffle_animation === undefined ? undefined : cfg.raffle_animation,
      loyalty_tickets_enabled:
        cfg.tickets_enabled === undefined ? undefined : bool(cfg.tickets_enabled),
      loyalty_winner_template:
        cfg.winner_template === undefined ? undefined : cfg.winner_template,
      loyalty_show_reward_on_receipt:
        cfg.show_reward_on_receipt === undefined ? undefined : bool(cfg.show_reward_on_receipt),
      loyalty_show_raffle_on_receipt:
        cfg.show_raffle_on_receipt === undefined ? undefined : bool(cfg.show_raffle_on_receipt)
    }
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined) this.set(k, v)
    }
    return this.getConfig()
  }

  // ---- Points ----------------------------------------------------------------

  balance(customerId: number): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(points), 0) as pts FROM loyalty_ledger WHERE customer_id = ?')
      .get(customerId) as { pts: number }
    return row.pts
  }

  // Entries a given balance earns in a raffle with the given rule.
  private entriesFor(balance: number, pointsPerEntry: number, minPoints: number): number {
    if (balance < minPoints || balance <= 0) return 0
    if (pointsPerEntry > 0) return Math.floor(balance / pointsPerEntry)
    return 1 // threshold-only raffle: one entry once eligible
  }

  // Ids of "red" (critical) debtors — debt above the configured threshold.
  // Used to bar them from the raffle when that option is on.
  private redDebtorIds(): Set<number> {
    const threshold = parseFloat(this.get('critical_debt_threshold', '40')) || 40
    const credit = this.db
      .prepare(
        "SELECT customer_id, COALESCE(SUM(total_usd), 0) as total FROM invoices WHERE payment_method = 'credit' AND status = 'completed' AND customer_id IS NOT NULL GROUP BY customer_id"
      )
      .all() as { customer_id: number; total: number }[]
    const pays = this.db
      .prepare('SELECT customer_id, COALESCE(SUM(amount_usd), 0) as total FROM customer_payments GROUP BY customer_id')
      .all() as { customer_id: number; total: number }[]
    const payMap = new Map(pays.map((p) => [p.customer_id, p.total]))
    const set = new Set<number>()
    for (const c of credit) {
      if (c.total - (payMap.get(c.customer_id) ?? 0) > threshold) set.add(c.customer_id)
    }
    return set
  }

  // Points granted by each invoice (earn rows only), keyed by invoice id.
  pointsByInvoice(): Record<number, number> {
    const rows = this.db
      .prepare(
        "SELECT invoice_id, COALESCE(SUM(points), 0) as pts FROM loyalty_ledger WHERE type = 'earn' AND invoice_id IS NOT NULL GROUP BY invoice_id"
      )
      .all() as { invoice_id: number; pts: number }[]
    const out: Record<number, number> = {}
    for (const r of rows) out[r.invoice_id] = r.pts
    return out
  }

  // Raffle tickets granted by each invoice (earn rows only), keyed by invoice id.
  // These already honour the per-invoice cap applied when the sale was closed.
  ticketsByInvoice(): Record<number, number> {
    const rows = this.db
      .prepare(
        "SELECT invoice_id, COALESCE(SUM(tickets), 0) as t FROM loyalty_tickets_ledger WHERE type = 'earn' AND invoice_id IS NOT NULL GROUP BY invoice_id"
      )
      .all() as { invoice_id: number; t: number }[]
    const out: Record<number, number> = {}
    for (const r of rows) out[r.invoice_id] = r.t
    return out
  }

  // ---- Physical raffle tickets ----------------------------------------------

  // How many printable tickets an invoice generates for the active raffle, with
  // their codes. Mirrors the entry rule and honours the red-debtor block.
  ticketsForInvoice(invoiceId: number): InvoiceTickets {
    const inv = this.db
      .prepare(
        'SELECT i.invoice_number as invoice_number, i.customer_id as customer_id, c.name as customer_name FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?'
      )
      .get(invoiceId) as
      | { invoice_number: string; customer_id: number | null; customer_name: string | null }
      | undefined
    const empty: InvoiceTickets = {
      invoiceNumber: inv?.invoice_number ?? '',
      customerName: inv?.customer_name ?? null,
      raffleName: null,
      count: 0,
      codes: []
    }
    if (!inv || !inv.customer_id) return empty
    const raffle = this.getActiveRaffle()
    if (!raffle) return empty
    const cfg = this.getConfig()
    if (cfg.exclude_red_debtors && this.redDebtorIds().has(inv.customer_id)) return empty

    let count: number
    if (ticketsActive(cfg.mode)) {
      // With a ticket currency, physical tickets mirror the tickets the sale earned.
      const row = this.db
        .prepare(
          "SELECT COALESCE(SUM(tickets), 0) as t FROM loyalty_tickets_ledger WHERE invoice_id = ? AND type = 'earn'"
        )
        .get(invoiceId) as { t: number }
      count = row.t
    } else {
      // Points-only mode: derive tickets from the points the sale earned.
      const row = this.db
        .prepare(
          "SELECT COALESCE(SUM(points), 0) as pts FROM loyalty_ledger WHERE invoice_id = ? AND type = 'earn'"
        )
        .get(invoiceId) as { pts: number }
      const points = row.pts
      count =
        raffle.points_per_entry > 0
          ? Math.floor(points / raffle.points_per_entry)
          : points > 0
            ? 1
            : 0
    }
    const codes = Array.from({ length: count }, (_, i) => `${inv.invoice_number}-${i + 1}`)
    return {
      invoiceNumber: inv.invoice_number,
      customerName: inv.customer_name,
      raffleName: raffle.name,
      count,
      codes
    }
  }

  markTicketsPrinted(invoiceId: number): void {
    this.db
      .prepare(
        "INSERT INTO loyalty_ticket_prints (invoice_id, printed_at) VALUES (?, datetime('now', 'localtime')) ON CONFLICT(invoice_id) DO UPDATE SET printed_at = excluded.printed_at"
      )
      .run(invoiceId)
  }

  // Agrega (o quita, si es negativo) tickets a mano. Crea una fila de tipo
  // 'adjust' sin factura; devuelve el id de la fila para poder imprimirla.
  adjustTickets(customerId: number, tickets: number, note?: string): { balance: number; id: number } {
    if (!Number.isFinite(tickets) || tickets === 0) throw new Error('Ajuste de tickets invalido')
    const info = this.db
      .prepare(
        "INSERT INTO loyalty_tickets_ledger (customer_id, invoice_id, raffle_id, tickets, type, note) VALUES (?, NULL, NULL, ?, 'adjust', ?)"
      )
      .run(customerId, Math.round(tickets), note ?? null)
    return { balance: this.ticketBalance(customerId), id: Number(info.lastInsertRowid) }
  }

  // Tickets que no vienen de una venta: canjes por puntos ('redeem') y ajustes
  // manuales ('adjust'). Una fila por lote, con su estado de impresión, para
  // que el personal pueda imprimirlos (y reimprimir) desde la pestaña Tickets.
  manualTicketsReport(): {
    id: number
    customer_name: string | null
    tickets: number
    type: string
    note: string | null
    created_at: string
    printed: boolean
  }[] {
    const rows = this.db
      .prepare(
        `SELECT t.id as id, c.name as customer_name, t.tickets as tickets, t.type as type,
                t.note as note, t.created_at as created_at,
                CASE WHEN p.ledger_id IS NULL THEN 0 ELSE 1 END as printed
         FROM loyalty_tickets_ledger t
         LEFT JOIN customers c ON c.id = t.customer_id
         LEFT JOIN loyalty_manual_ticket_prints p ON p.ledger_id = t.id
         WHERE t.invoice_id IS NULL AND t.tickets > 0 AND t.type IN ('redeem', 'adjust')
         ORDER BY t.id DESC`
      )
      .all() as {
      id: number
      customer_name: string | null
      tickets: number
      type: string
      note: string | null
      created_at: string
      printed: number
    }[]
    return rows.map((r) => ({ ...r, printed: !!r.printed }))
  }

  // Datos para imprimir los tickets de un lote manual/por canje. Reutiliza la
  // forma InvoiceTickets; los códigos se prefijan con "M" + id del lote.
  manualTicketPrintData(ledgerId: number): InvoiceTickets {
    const row = this.db
      .prepare(
        `SELECT t.tickets as tickets, c.name as customer_name
         FROM loyalty_tickets_ledger t
         LEFT JOIN customers c ON c.id = t.customer_id
         WHERE t.id = ? AND t.invoice_id IS NULL`
      )
      .get(ledgerId) as { tickets: number; customer_name: string | null } | undefined
    const ref = `M${ledgerId}`
    if (!row || row.tickets <= 0) {
      return { invoiceNumber: ref, customerName: null, raffleName: null, count: 0, codes: [] }
    }
    const raffle = this.getActiveRaffle()
    const count = Math.floor(row.tickets)
    return {
      invoiceNumber: ref,
      customerName: row.customer_name,
      raffleName: raffle?.name ?? null,
      count,
      codes: Array.from({ length: count }, (_, i) => `${ref}-${i + 1}`)
    }
  }

  markManualTicketsPrinted(ledgerId: number): void {
    this.db
      .prepare(
        "INSERT INTO loyalty_manual_ticket_prints (ledger_id, printed_at) VALUES (?, datetime('now', 'localtime')) ON CONFLICT(ledger_id) DO UPDATE SET printed_at = excluded.printed_at"
      )
      .run(ledgerId)
  }

  ticketsPrintedIds(): number[] {
    return (this.db.prepare('SELECT invoice_id FROM loyalty_ticket_prints').all() as {
      invoice_id: number
    }[]).map((r) => r.invoice_id)
  }

  // Earned raffle tickets grouped by invoice, with their print status. Feeds the
  // loyalty "tickets ganados" view (newest first).
  earnedTicketsReport(): {
    invoice_id: number
    invoice_number: string
    customer_name: string | null
    created_at: string
    tickets: number
    printed: boolean
  }[] {
    const rows = this.db
      .prepare(
        `SELECT t.invoice_id as invoice_id, i.invoice_number as invoice_number,
                c.name as customer_name, i.created_at as created_at,
                COALESCE(SUM(t.tickets), 0) as tickets,
                CASE WHEN p.invoice_id IS NULL THEN 0 ELSE 1 END as printed
         FROM loyalty_tickets_ledger t
         JOIN invoices i ON i.id = t.invoice_id
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN loyalty_ticket_prints p ON p.invoice_id = t.invoice_id
         WHERE t.type = 'earn' AND t.invoice_id IS NOT NULL
         GROUP BY t.invoice_id
         HAVING tickets > 0
         ORDER BY i.id DESC`
      )
      .all() as {
      invoice_id: number
      invoice_number: string
      customer_name: string | null
      created_at: string
      tickets: number
      printed: number
    }[]
    return rows.map((r) => ({ ...r, printed: !!r.printed }))
  }

  // Point redemptions (type 'redeem'), newest first, for the history view.
  redemptionsReport(limit = 200): {
    id: number
    customer_id: number
    customer_name: string | null
    points: number
    note: string | null
    created_at: string
  }[] {
    return this.db
      .prepare(
        `SELECT l.id as id, l.customer_id as customer_id, c.name as customer_name,
                l.points as points, l.note as note, l.created_at as created_at
         FROM loyalty_ledger l
         LEFT JOIN customers c ON c.id = l.customer_id
         WHERE l.type = 'redeem'
         ORDER BY l.id DESC
         LIMIT ?`
      )
      .all(limit) as {
      id: number
      customer_id: number
      customer_name: string | null
      points: number
      note: string | null
      created_at: string
    }[]
  }

  // ---- Points-based reporting (mirror of money reports, in points) ----------

  dailyPoints(from: string, to: string, customerId?: number): DailySale[] {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [from, to, customerId] : [from, to]
    return this.db
      .prepare(
        `SELECT date(created_at) as day, COALESCE(SUM(points), 0) as total,
                COUNT(DISTINCT invoice_id) as count
         FROM loyalty_ledger
         WHERE type = 'earn' AND date(created_at) >= ? AND date(created_at) <= ?${cust}
         GROUP BY day ORDER BY day ASC`
      )
      .all(...args) as DailySale[]
  }

  hourlyPoints(day: string, customerId?: number): HourlySale[] {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [day, customerId] : [day]
    return this.db
      .prepare(
        `SELECT strftime('%H', created_at) as hour, COALESCE(SUM(points), 0) as total,
                COUNT(DISTINCT invoice_id) as count
         FROM loyalty_ledger
         WHERE type = 'earn' AND date(created_at) = ?${cust}
         GROUP BY hour ORDER BY hour ASC`
      )
      .all(...args) as HourlySale[]
  }

  pointsSummary(from: string, to: string, customerId?: number): SalesSummary {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [from, to, customerId] : [from, to]
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(points), 0) as total_revenue,
                COUNT(DISTINCT invoice_id) as total_invoices
         FROM loyalty_ledger
         WHERE type = 'earn' AND date(created_at) >= ? AND date(created_at) <= ?${cust}`
      )
      .get(...args) as { total_revenue: number; total_invoices: number }
    return {
      total_revenue: row.total_revenue,
      total_invoices: row.total_invoices,
      average_ticket: row.total_invoices ? row.total_revenue / row.total_invoices : 0
    }
  }

  monthlyPoints(from: string, to: string, customerId?: number): MonthlySale[] {
    const cust = customerId ? ' AND customer_id = ?' : ''
    const args = customerId ? [from, to, customerId] : [from, to]
    return this.db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(points), 0) as total,
                COUNT(DISTINCT invoice_id) as count
         FROM loyalty_ledger
         WHERE type = 'earn' AND date(created_at) >= ? AND date(created_at) <= ?${cust}
         GROUP BY month ORDER BY month ASC`
      )
      .all(...args) as MonthlySale[]
  }

  // Top products by the points their per-product rule granted.
  topProductsByPoints(from: string, to: string, limit = 10): TopProduct[] {
    return this.db
      .prepare(
        `SELECT ii.product_name as name, SUM(ii.quantity) as quantity,
                SUM(ii.quantity * lpp.points) as revenue
         FROM invoice_items ii
         JOIN invoices i ON ii.invoice_id = i.id
         JOIN loyalty_product_points lpp ON lpp.product_id = ii.product_id
         WHERE i.status = 'completed' AND date(i.created_at) >= ? AND date(i.created_at) <= ?
           AND lpp.points > 0
         GROUP BY ii.product_id ORDER BY revenue DESC LIMIT ?`
      )
      .all(from, to, limit) as TopProduct[]
  }

  // Every customer that holds points or tickets, with their points/ticket
  // balance, raffle entries and current level. Works in every mode.
  allBalances(): CustomerPoints[] {
    const cfg = this.getConfig()
    // Points balance per customer.
    const pointRows = this.db
      .prepare(
        `SELECT l.customer_id as customer_id, c.name as name,
                COALESCE(SUM(l.points), 0) as points
         FROM loyalty_ledger l JOIN customers c ON c.id = l.customer_id
         GROUP BY l.customer_id HAVING points > 0`
      )
      .all() as { customer_id: number; name: string; points: number }[]
    // General ticket pool balance per customer.
    const ticketRows = this.db
      .prepare(
        `SELECT t.customer_id as customer_id, c.name as name,
                COALESCE(SUM(t.tickets), 0) as tickets
         FROM loyalty_tickets_ledger t JOIN customers c ON c.id = t.customer_id
         WHERE t.raffle_id IS NULL
         GROUP BY t.customer_id HAVING tickets > 0`
      )
      .all() as { customer_id: number; name: string; tickets: number }[]

    const map = new Map<number, { customer_id: number; name: string; points: number; tickets: number }>()
    for (const r of pointRows)
      map.set(r.customer_id, { customer_id: r.customer_id, name: r.name, points: r.points, tickets: 0 })
    for (const r of ticketRows) {
      const cur = map.get(r.customer_id)
      if (cur) cur.tickets = r.tickets
      else
        map.set(r.customer_id, {
          customer_id: r.customer_id,
          name: r.name,
          points: 0,
          tickets: r.tickets
        })
    }

    const raffle = this.getActiveRaffle()
    const blocked = raffle && cfg.exclude_red_debtors ? this.redDebtorIds() : null
    const out: CustomerPoints[] = []
    for (const r of map.values()) {
      const lvl = cfg.levels_enabled && pointsActive(cfg.mode) ? this.customerLevel(r.customer_id).level : null
      let entries = 0
      if (raffle && !(blocked && blocked.has(r.customer_id))) {
        entries = ticketsActive(cfg.mode)
          ? r.tickets
          : this.entriesFor(r.points, raffle.points_per_entry, raffle.min_points)
      }
      out.push({
        customer_id: r.customer_id,
        name: r.name,
        points: r.points,
        tickets: r.tickets,
        entries,
        level_name: lvl?.name ?? null,
        level_color: lvl?.color ?? null
      })
    }
    return out.sort((a, b) => b.points - a.points || b.tickets - a.tickets)
  }

  // Points/tickets/entries keyed by customer id, for the customers list.
  summaryByCustomer(): Record<number, { points: number; tickets: number; entries: number }> {
    const out: Record<number, { points: number; tickets: number; entries: number }> = {}
    for (const b of this.allBalances())
      out[b.customer_id] = { points: b.points, tickets: b.tickets, entries: b.entries }
    return out
  }

  // The loyalty level of every customer with earn history, keyed by customer id.
  // Unlike `summaryByCustomer` this does not require a live points balance (a
  // customer keeps their level after redeeming), so the customers list can show
  // and sort by level for everyone. `rank` grows with the level (0 = lowest) for
  // easy sorting. Empty when levels are off or not applicable to the mode.
  levelsByCustomer(): Record<number, { name: string; color: string | null; rank: number }> {
    const cfg = this.getConfig()
    if (!cfg.levels_enabled || !pointsActive(cfg.mode)) return {}
    const levels = this.listLevels() // ascending by sort_order, then min_points
    if (levels.length === 0) return {}

    const months = cfg.level_window_months
    const where =
      months > 0
        ? `AND created_at >= datetime('now', 'localtime', '-${Math.round(months)} months')`
        : ''
    const rows = this.db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(points), 0) as pts FROM loyalty_ledger
         WHERE type = 'earn' ${where} GROUP BY customer_id`
      )
      .all() as { customer_id: number; pts: number }[]

    const out: Record<number, { name: string; color: string | null; rank: number }> = {}
    for (const r of rows) {
      let rank = -1
      for (let i = 0; i < levels.length; i++) {
        if (r.pts >= levels[i].min_points) rank = i
      }
      if (rank >= 0)
        out[r.customer_id] = {
          name: levels[rank].name,
          color: levels[rank].color,
          rank
        }
    }
    return out
  }

  history(customerId: number, limit = 100): LoyaltyEntry[] {
    return this.db
      .prepare(
        'SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT ?'
      )
      .all(customerId, limit) as LoyaltyEntry[]
  }

  redeem(customerId: number, points: number, note?: string): number {
    if (!Number.isFinite(points) || points <= 0) throw new Error('Puntos a canjear invalidos')
    if (points > this.balance(customerId)) throw new Error('El cliente no tiene suficientes puntos')
    this.db
      .prepare(
        "INSERT INTO loyalty_ledger (customer_id, invoice_id, points, type, note) VALUES (?, NULL, ?, 'redeem', ?)"
      )
      .run(customerId, -Math.floor(points), note ?? null)
    return this.balance(customerId)
  }

  adjust(customerId: number, points: number, note?: string): number {
    if (!Number.isFinite(points) || points === 0) throw new Error('Ajuste invalido')
    this.db
      .prepare(
        "INSERT INTO loyalty_ledger (customer_id, invoice_id, points, type, note) VALUES (?, ?, ?, 'adjust', ?)"
      )
      .run(customerId, null, Math.round(points), note ?? null)
    return this.balance(customerId)
  }

  // Redeem a catalogue reward: spends its cost in points. A discount reward also
  // mints a single-use coupon the customer can apply to a sale later; a custom
  // reward is just claimed (ledger only).
  redeemReward(
    customerId: number,
    rewardId: number
  ): { balance: number; reward: Reward; coupon: Coupon | null } {
    const reward = this.db.prepare('SELECT * FROM loyalty_rewards WHERE id = ?').get(rewardId) as
      | Reward
      | undefined
    if (!reward || !reward.active) throw new Error('Premio no disponible')
    const balance = this.redeem(customerId, reward.cost_points, `Premio: ${reward.name}`)
    let coupon: Coupon | null = null
    if (reward.kind === 'discount_usd' || reward.kind === 'discount_pct') {
      const info = this.db
        .prepare(
          "INSERT INTO loyalty_coupons (customer_id, reward_id, name, kind, value, cost_points, status) VALUES (?, ?, ?, ?, ?, ?, 'active')"
        )
        .run(customerId, reward.id, reward.name, reward.kind, reward.value, reward.cost_points)
      coupon = this.db
        .prepare('SELECT * FROM loyalty_coupons WHERE id = ?')
        .get(info.lastInsertRowid) as Coupon
    } else if (reward.kind === 'ticket' && reward.tickets > 0) {
      // A "ticket" reward turns points into raffle participations (general pool).
      this.db
        .prepare(
          "INSERT INTO loyalty_tickets_ledger (customer_id, invoice_id, raffle_id, tickets, type, note) VALUES (?, NULL, NULL, ?, 'redeem', ?)"
        )
        .run(customerId, Math.floor(reward.tickets), `Premio: ${reward.name}`)
    }
    return { balance, reward, coupon }
  }

  // ---- Discount coupons ------------------------------------------------------

  activeCoupons(customerId: number): Coupon[] {
    return this.db
      .prepare(
        "SELECT * FROM loyalty_coupons WHERE customer_id = ? AND status = 'active' ORDER BY id ASC"
      )
      .all(customerId) as Coupon[]
  }

  // All of a customer's coupons (active first, then used by most recent use).
  allCoupons(customerId: number): Coupon[] {
    return this.db
      .prepare(
        "SELECT * FROM loyalty_coupons WHERE customer_id = ? ORDER BY (status = 'active') DESC, datetime(COALESCE(used_at, created_at)) DESC, id DESC"
      )
      .all(customerId) as Coupon[]
  }

  // Discount rewards the customer can afford right now (to redeem on the spot).
  affordableDiscountRewards(customerId: number): Reward[] {
    const balance = this.balance(customerId)
    return this.db
      .prepare(
        "SELECT * FROM loyalty_rewards WHERE active = 1 AND kind IN ('discount_usd', 'discount_pct') AND cost_points <= ? ORDER BY cost_points ASC"
      )
      .all(balance) as Reward[]
  }

  // USD discount a coupon yields on a given pre-discount subtotal.
  couponDiscount(coupon: Pick<Coupon, 'kind' | 'value'>, subtotal: number): number {
    if (subtotal <= 0) return 0
    let d = 0
    if (coupon.kind === 'discount_usd') d = coupon.value
    else if (coupon.kind === 'discount_pct') d = (subtotal * coupon.value) / 100
    d = Math.round(d * 100) / 100
    return Math.min(Math.max(d, 0), subtotal)
  }

  getCoupon(couponId: number): Coupon | undefined {
    return this.db.prepare('SELECT * FROM loyalty_coupons WHERE id = ?').get(couponId) as
      | Coupon
      | undefined
  }

  // Discount for an active coupon owned by the customer; throws if not usable.
  // Does NOT mark it used — the invoice transaction calls markCouponUsed.
  validateCouponDiscount(couponId: number, customerId: number | null, subtotal: number): number {
    const c = this.getCoupon(couponId)
    if (!c || c.status !== 'active') throw new Error('Cupón no disponible')
    if (customerId == null || c.customer_id !== customerId)
      throw new Error('El cupón no pertenece a este cliente')
    return this.couponDiscount(c, subtotal)
  }

  markCouponUsed(couponId: number, invoiceId: number): void {
    const res = this.db
      .prepare(
        "UPDATE loyalty_coupons SET status = 'used', used_at = datetime('now', 'localtime'), invoice_id = ? WHERE id = ? AND status = 'active'"
      )
      .run(invoiceId, couponId)
    if (res.changes === 0) throw new Error('El cupón ya fue usado')
  }

  // ---- Earning ---------------------------------------------------------------

  productPoints(): { product_id: number; points: number }[] {
    return this.db.prepare('SELECT product_id, points FROM loyalty_product_points').all() as {
      product_id: number
      points: number
    }[]
  }

  setProductPoints(productId: number, points: number): void {
    if (points > 0) {
      this.db
        .prepare(
          'INSERT INTO loyalty_product_points (product_id, points) VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET points = excluded.points'
        )
        .run(productId, Math.round(points))
    } else {
      this.db.prepare('DELETE FROM loyalty_product_points WHERE product_id = ?').run(productId)
    }
  }

  // Pure points calculation for a sale (no DB write), shared by the earning
  // hook and the POS preview so both always agree.
  computeEarnedPoints(ctx: EarnContext): number {
    if (!ctx.customerId) return 0
    const cfg = this.getConfig()
    if (!cfg.enabled || !pointsActive(cfg.mode)) return 0
    // Las ventas a crédito nunca acumulan puntos (independiente del ajuste).
    if (ctx.paymentMethod === 'credit') return 0
    if (cfg.currency_filter && ctx.currency !== cfg.currency_filter) return 0

    let points = 0
    if (cfg.earn_money && cfg.points_per_usd > 0) {
      points += Math.floor(ctx.totalUsd * cfg.points_per_usd)
    }
    if (cfg.earn_invoice && cfg.points_per_invoice > 0) {
      points += Math.floor(cfg.points_per_invoice)
    }
    if (cfg.earn_product) {
      const map = new Map(this.productPoints().map((p) => [p.product_id, p.points]))
      for (const item of ctx.items) {
        if (item.productId && map.has(item.productId)) {
          points += (map.get(item.productId) ?? 0) * item.quantity
        }
      }
    }
    // Per-invoice cap on points.
    if (cfg.cap_points_enabled && cfg.max_points_per_invoice > 0) {
      points = Math.min(points, Math.floor(cfg.max_points_per_invoice))
    }
    return points
  }

  // ---- Tickets (raffle currency, independent from points) --------------------

  // A customer's ticket balance. Tickets tied to a drawn raffle are expired, so
  // the live balance is SUM over rows (expiry rows are negative).
  ticketBalance(customerId: number): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(tickets), 0) as t FROM loyalty_tickets_ledger WHERE customer_id = ?'
      )
      .get(customerId) as { t: number }
    return row.t
  }

  // Tickets a sale earns under the ticket-earning rules, honouring the shared
  // credit/currency filters, the per-invoice cap and the accumulation cap.
  computeEarnedTickets(ctx: EarnContext): number {
    if (!ctx.customerId) return 0
    const cfg = this.getConfig()
    if (!cfg.enabled || !ticketsActive(cfg.mode)) return 0
    // Las ventas a crédito nunca acumulan tickets (independiente del ajuste).
    if (ctx.paymentMethod === 'credit') return 0
    if (cfg.currency_filter && ctx.currency !== cfg.currency_filter) return 0

    let tickets = 0
    if (cfg.tickets_earn_invoice && cfg.tickets_per_invoice > 0) {
      tickets += Math.floor(cfg.tickets_per_invoice)
    }
    if (cfg.tickets_earn_money && cfg.usd_per_ticket > 0) {
      tickets += Math.floor(ctx.totalUsd / cfg.usd_per_ticket)
    }
    // Per-invoice cap.
    if (cfg.cap_tickets_enabled && cfg.max_tickets_per_invoice > 0) {
      tickets = Math.min(tickets, Math.floor(cfg.max_tickets_per_invoice))
    }
    // Accumulation cap: never let the running balance exceed the limit.
    if (cfg.max_tickets_accumulable > 0) {
      const room = Math.floor(cfg.max_tickets_accumulable) - this.ticketBalance(ctx.customerId)
      tickets = Math.max(0, Math.min(tickets, room))
    }
    return tickets
  }

  // Accrue tickets for a completed sale. Called inside the invoice transaction.
  earnTicketsForInvoice(ctx: EarnContext): void {
    const tickets = this.computeEarnedTickets(ctx)
    if (tickets <= 0) return
    this.db
      .prepare(
        "INSERT INTO loyalty_tickets_ledger (customer_id, invoice_id, tickets, type) VALUES (?, ?, ?, 'earn')"
      )
      .run(ctx.customerId, ctx.invoiceId, tickets)
  }

  // ---- Levels ----------------------------------------------------------------

  listLevels(): LoyaltyLevel[] {
    return this.db
      .prepare('SELECT * FROM loyalty_levels ORDER BY sort_order ASC, min_points ASC')
      .all() as LoyaltyLevel[]
  }

  createLevel(l: Omit<LoyaltyLevel, 'id'>): LoyaltyLevel {
    const info = this.db
      .prepare(
        'INSERT INTO loyalty_levels (name, min_points, sort_order, color) VALUES (?, ?, ?, ?)'
      )
      .run(l.name, Math.round(l.min_points), Math.round(l.sort_order), l.color ?? null)
    return this.db
      .prepare('SELECT * FROM loyalty_levels WHERE id = ?')
      .get(info.lastInsertRowid) as LoyaltyLevel
  }

  updateLevel(id: number, l: Partial<LoyaltyLevel>): void {
    const cur = this.db.prepare('SELECT * FROM loyalty_levels WHERE id = ?').get(id) as
      | LoyaltyLevel
      | undefined
    if (!cur) throw new Error('Nivel no encontrado')
    this.db
      .prepare(
        'UPDATE loyalty_levels SET name = ?, min_points = ?, sort_order = ?, color = ? WHERE id = ?'
      )
      .run(
        l.name ?? cur.name,
        Math.round(l.min_points ?? cur.min_points),
        Math.round(l.sort_order ?? cur.sort_order),
        l.color === undefined ? cur.color : l.color,
        id
      )
  }

  deleteLevel(id: number): void {
    this.db.prepare('DELETE FROM loyalty_levels WHERE id = ?').run(id)
  }

  // Points EARNED by a customer within the configured rolling window — the
  // metric levels are based on (redeeming points never demotes a customer).
  earnedPointsInWindow(customerId: number): number {
    const months = this.getConfig().level_window_months
    const where =
      months > 0
        ? `AND created_at >= datetime('now', 'localtime', '-${Math.round(months)} months')`
        : ''
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(points), 0) as pts FROM loyalty_ledger
         WHERE customer_id = ? AND type = 'earn' ${where}`
      )
      .get(customerId) as { pts: number }
    return row.pts
  }

  levelBenefits(levelId: number): LevelBenefit[] {
    return this.db
      .prepare('SELECT * FROM loyalty_level_benefits WHERE level_id = ? ORDER BY id ASC')
      .all(levelId) as LevelBenefit[]
  }

  // Replace the whole benefit set of a level (simplest edit model for the UI).
  setLevelBenefits(levelId: number, benefits: Omit<LevelBenefit, 'id' | 'level_id'>[]): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM loyalty_level_benefits WHERE level_id = ?').run(levelId)
      const ins = this.db.prepare(
        'INSERT INTO loyalty_level_benefits (level_id, kind, value, unit, note) VALUES (?, ?, ?, ?, ?)'
      )
      for (const b of benefits) {
        ins.run(levelId, b.kind, b.value ?? 0, b.unit ?? null, b.note ?? null)
      }
    })
    tx()
  }

  // The level a customer currently sits at, with its benefits.
  customerLevel(customerId: number): CustomerLevel {
    const earned = this.earnedPointsInWindow(customerId)
    const levels = this.listLevels()
    let level: LoyaltyLevel | null = null
    for (const l of levels) {
      if (earned >= l.min_points) level = l
    }
    return {
      level,
      earned_window: earned,
      benefits: level ? this.levelBenefits(level.id) : []
    }
  }

  // Automatic USD discount a customer's level grants on a sale (sum of its
  // 'discount_fixed' benefits). Applied on top of any coupon in the POS.
  levelDiscountFor(customerId: number | null, subtotal: number): number {
    if (!customerId || subtotal <= 0) return 0
    const cfg = this.getConfig()
    if (!cfg.enabled || !cfg.levels_enabled || !pointsActive(cfg.mode)) return 0
    const { benefits } = this.customerLevel(customerId)
    let d = 0
    for (const b of benefits) {
      if (b.kind !== 'discount_fixed') continue
      d += b.unit === 'pct' ? (subtotal * b.value) / 100 : b.value
    }
    d = Math.round(d * 100) / 100
    return Math.min(Math.max(d, 0), subtotal)
  }

  // Tickets/cupos a points amount yields for the active raffle (ignores the
  // per-customer min threshold — this is the per-sale contribution).
  private ticketsForPoints(points: number): number {
    const raffle = this.getActiveRaffle()
    if (!raffle || points <= 0) return 0
    return raffle.points_per_entry > 0 ? Math.floor(points / raffle.points_per_entry) : 1
  }

  // Preview of what a sale would grant, for the POS (points + raffle tickets).
  // Tickets come from their own rules when the ticket currency is active;
  // otherwise they are derived from the points the sale earns (legacy).
  previewSale(ctx: EarnContext): { points: number; tickets: number } {
    const cfg = this.getConfig()
    const points = this.computeEarnedPoints(ctx)
    const tickets = ticketsActive(cfg.mode)
      ? this.computeEarnedTickets(ctx)
      : this.ticketsForPoints(points)
    return { points, tickets }
  }

  // Points + tickets a finalized invoice actually granted (for the receipt /
  // success screen and invoice list).
  invoiceLoyaltySummary(invoiceId: number): { points: number; tickets: number } {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(points), 0) as pts FROM loyalty_ledger WHERE invoice_id = ? AND type = 'earn'"
      )
      .get(invoiceId) as { pts: number }
    return { points: row.pts, tickets: this.ticketsForInvoice(invoiceId).count }
  }

  // Accrue points for a completed sale. Called from inside the invoice
  // transaction (same db handle) so it commits atomically with the sale.
  earnForInvoice(ctx: EarnContext): void {
    const points = this.computeEarnedPoints(ctx)
    if (points <= 0) return
    this.db
      .prepare(
        "INSERT INTO loyalty_ledger (customer_id, invoice_id, points, type) VALUES (?, ?, ?, 'earn')"
      )
      .run(ctx.customerId, ctx.invoiceId, points)
  }

  // ---- Rewards ---------------------------------------------------------------

  listRewards(activeOnly = false): Reward[] {
    const sql = activeOnly
      ? 'SELECT * FROM loyalty_rewards WHERE active = 1 ORDER BY cost_points ASC'
      : 'SELECT * FROM loyalty_rewards ORDER BY cost_points ASC'
    return this.db.prepare(sql).all() as Reward[]
  }

  createReward(r: Omit<Reward, 'id' | 'active'> & { active?: boolean }): Reward {
    const info = this.db
      .prepare(
        'INSERT INTO loyalty_rewards (name, kind, cost_points, value, tickets, active) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        r.name,
        r.kind,
        Math.round(r.cost_points),
        r.value ?? 0,
        Math.round(r.tickets ?? 0),
        r.active === false ? 0 : 1
      )
    return this.db
      .prepare('SELECT * FROM loyalty_rewards WHERE id = ?')
      .get(info.lastInsertRowid) as Reward
  }

  updateReward(id: number, r: Partial<Reward>): void {
    const cur = this.db.prepare('SELECT * FROM loyalty_rewards WHERE id = ?').get(id) as
      | Reward
      | undefined
    if (!cur) throw new Error('Premio no encontrado')
    this.db
      .prepare(
        'UPDATE loyalty_rewards SET name = ?, kind = ?, cost_points = ?, value = ?, tickets = ?, active = ? WHERE id = ?'
      )
      .run(
        r.name ?? cur.name,
        r.kind ?? cur.kind,
        Math.round(r.cost_points ?? cur.cost_points),
        r.value ?? cur.value,
        Math.round(r.tickets ?? cur.tickets),
        r.active === undefined ? cur.active : r.active ? 1 : 0,
        id
      )
  }

  deleteReward(id: number): void {
    this.db.prepare('DELETE FROM loyalty_rewards WHERE id = ?').run(id)
  }

  // ---- Raffle ----------------------------------------------------------------

  // The open GENERAL raffle (level raffles live alongside it, one per level/month).
  getActiveRaffle(): Raffle | null {
    const cfg = this.getConfig()
    if (!cfg.raffle_enabled) return null
    return (
      (this.db
        .prepare(
          "SELECT * FROM loyalty_raffles WHERE status = 'open' AND kind = 'general' ORDER BY id DESC LIMIT 1"
        )
        .get() as Raffle | undefined) ?? null
    )
  }

  listRaffles(): Raffle[] {
    return this.db
      .prepare('SELECT * FROM loyalty_raffles ORDER BY id DESC')
      .all() as Raffle[]
  }

  createRaffle(name: string, pointsPerEntry: number, minPoints: number): Raffle {
    const open = this.db
      .prepare("SELECT id FROM loyalty_raffles WHERE status = 'open' AND kind = 'general'")
      .get()
    if (open) throw new Error('Ya hay una rifa abierta. Ciérrala antes de crear otra.')
    const info = this.db
      .prepare(
        "INSERT INTO loyalty_raffles (name, points_per_entry, min_points, kind) VALUES (?, ?, ?, 'general')"
      )
      .run(name, Math.round(pointsPerEntry), Math.round(minPoints))
    return this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(info.lastInsertRowid) as Raffle
  }

  deleteRaffle(id: number): void {
    this.db.prepare('DELETE FROM loyalty_raffles WHERE id = ?').run(id)
  }

  // Current participants of a raffle, one row per customer with their entry
  // count. A customer can hold several entries (several tickets).
  raffleParticipants(raffleId: number): RaffleParticipant[] {
    const raffle = this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(raffleId) as Raffle | undefined
    if (!raffle) return []
    const cfg = this.getConfig()
    const blocked = cfg.exclude_red_debtors ? this.redDebtorIds() : null

    // Ticket-based raffles: entries = the customer's tickets in this pool.
    //  - level raffle  → monthly tickets scoped to this raffle (raffle_id = id)
    //  - general raffle → the general pool (raffle_id IS NULL)
    if (raffle.kind === 'level' || ticketsActive(cfg.mode)) {
      const scope = raffle.kind === 'level' ? 't.raffle_id = ?' : 't.raffle_id IS NULL'
      const args = raffle.kind === 'level' ? [raffleId] : []
      const rows = this.db
        .prepare(
          `SELECT t.customer_id as customer_id, c.name as name,
                  COALESCE(SUM(t.tickets), 0) as entries
           FROM loyalty_tickets_ledger t
           JOIN customers c ON c.id = t.customer_id
           WHERE ${scope}
           GROUP BY t.customer_id
           HAVING entries > 0`
        )
        .all(...args) as { customer_id: number; name: string; entries: number }[]
      return rows
        .map((r) => ({
          customer_id: r.customer_id,
          name: r.name,
          points: r.entries,
          entries: blocked && blocked.has(r.customer_id) ? 0 : r.entries
        }))
        .filter((r) => r.entries > 0)
        .sort((a, b) => b.entries - a.entries)
    }

    // Points-only mode: entries are derived from the customer's points balance.
    const rows = this.db
      .prepare(
        `SELECT l.customer_id as customer_id, c.name as name,
                COALESCE(SUM(l.points), 0) as points
         FROM loyalty_ledger l
         JOIN customers c ON c.id = l.customer_id
         GROUP BY l.customer_id
         HAVING points > 0`
      )
      .all() as { customer_id: number; name: string; points: number }[]
    return rows
      .map((r) => ({
        ...r,
        entries:
          blocked && blocked.has(r.customer_id)
            ? 0
            : this.entriesFor(r.points, raffle.points_per_entry, raffle.min_points)
      }))
      .filter((r) => r.entries > 0)
      .sort((a, b) => b.entries - a.entries)
  }

  // Expire the tickets that fed a drawn raffle, so the next one starts clean.
  // General raffle → the general pool (raffle_id IS NULL); level raffle → its
  // own monthly tickets (raffle_id = id). Points-only raffles expire nothing.
  private expireRaffleTickets(raffle: Raffle): void {
    const cfg = this.getConfig()
    if (raffle.kind !== 'level' && !ticketsActive(cfg.mode)) return
    const scope = raffle.kind === 'level' ? 'raffle_id = ?' : 'raffle_id IS NULL'
    const args = raffle.kind === 'level' ? [raffle.id] : []
    const balances = this.db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(tickets), 0) as bal
         FROM loyalty_tickets_ledger WHERE ${scope}
         GROUP BY customer_id HAVING bal > 0`
      )
      .all(...args) as { customer_id: number; bal: number }[]
    const ins = this.db.prepare(
      "INSERT INTO loyalty_tickets_ledger (customer_id, invoice_id, raffle_id, tickets, type, note) VALUES (?, NULL, ?, ?, 'expire', ?)"
    )
    const raffleRef = raffle.kind === 'level' ? raffle.id : null
    for (const b of balances) {
      ins.run(b.customer_id, raffleRef, -b.bal, `Rifa: ${raffle.name}`)
    }
  }

  // Weighted random draw. The winner is picked here (authoritative) so the
  // persisted result always matches whatever the roulette animates to.
  drawRaffle(raffleId: number, rand: number): RaffleParticipant | null {
    const raffle = this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(raffleId) as Raffle | undefined
    if (!raffle) throw new Error('Rifa no encontrada')
    if (raffle.status === 'drawn') throw new Error('La rifa ya fue sorteada')
    const participants = this.raffleParticipants(raffleId)
    if (participants.length === 0) return null

    const totalEntries = participants.reduce((s, p) => s + p.entries, 0)
    // rand is a [0,1) value supplied by the caller (Math.random is unavailable
    // in some contexts); map it onto the weighted entry range.
    let target = Math.min(Math.max(rand, 0), 0.999999) * totalEntries
    let winner = participants[participants.length - 1]
    for (const p of participants) {
      target -= p.entries
      if (target < 0) {
        winner = p
        break
      }
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE loyalty_raffles SET status = 'drawn', winner_customer_id = ?, winner_name = ?, drawn_at = datetime('now', 'localtime') WHERE id = ?"
        )
        .run(winner.customer_id, winner.name, raffleId)
      this.expireRaffleTickets(raffle)
    })
    tx()
    return winner
  }

  // "Redo" a drawn raffle: give back the tickets that were spent (undo the
  // expiration this draw created) and reopen it so a new winner can be drawn.
  // Points-only raffles expire nothing, so only the status/winner reset applies.
  redrawRaffle(raffleId: number): Raffle {
    const raffle = this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(raffleId) as Raffle | undefined
    if (!raffle) throw new Error('Rifa no encontrada')
    if (raffle.status !== 'drawn') throw new Error('La rifa no ha sido sorteada todavía')
    if (raffle.kind === 'general') {
      const open = this.db
        .prepare("SELECT id FROM loyalty_raffles WHERE status = 'open' AND kind = 'general'")
        .get()
      if (open) throw new Error('Ya hay una rifa abierta. Ciérrala antes de rehacer esta.')
    }
    const tx = this.db.transaction(() => {
      // Remove the expiration rows this draw inserted, returning those tickets
      // to each customer's balance. Scope mirrors expireRaffleTickets().
      const conds = ["type = 'expire'"]
      const args: unknown[] = []
      if (raffle.kind === 'level') {
        conds.push('raffle_id = ?')
        args.push(raffle.id)
      } else {
        conds.push('raffle_id IS NULL', 'note = ?')
        args.push(`Rifa: ${raffle.name}`)
      }
      if (raffle.drawn_at) {
        conds.push('created_at >= ?')
        args.push(raffle.drawn_at)
      }
      this.db
        .prepare(`DELETE FROM loyalty_tickets_ledger WHERE ${conds.join(' AND ')}`)
        .run(...args)
      this.db
        .prepare(
          "UPDATE loyalty_raffles SET status = 'open', winner_customer_id = NULL, winner_name = NULL, drawn_at = NULL WHERE id = ?"
        )
        .run(raffleId)
    })
    tx()
    return this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(raffleId) as Raffle
  }

  // Create a one-off raffle exclusive to a customer level. Unlike the automatic
  // monthly level raffle, this does NOT require tickets: it seeds the customers
  // currently at that level as participants (1 entry each), and the operator can
  // add/remove participants by hand afterwards. period is left NULL so it never
  // collides with the auto monthly raffle (which keys on level_id + YYYY-MM).
  createLevelRaffle(name: string, levelId: number): Raffle {
    const level = this.listLevels().find((l) => l.id === levelId)
    if (!level) throw new Error('Nivel no encontrado')
    const info = this.db
      .prepare(
        "INSERT INTO loyalty_raffles (name, points_per_entry, min_points, kind, level_id, period) VALUES (?, 0, 0, 'level', ?, NULL)"
      )
      .run(name.trim() || `Rifa ${level.name}`, levelId)
    const raffleId = Number(info.lastInsertRowid)
    const tx = this.db.transaction(() => {
      const ins = this.db.prepare(
        "INSERT INTO loyalty_tickets_ledger (customer_id, invoice_id, raffle_id, tickets, type, note) VALUES (?, NULL, ?, 1, 'adjust', ?)"
      )
      // Una rifa de un nivel incluye también a los niveles superiores: si es de
      // Oro, entran Oro y todos los de arriba (p. ej. Platino).
      for (const m of this.membersOfLevelOrHigher(levelId)) {
        ins.run(m.customer_id, raffleId, `Nivel ${level.name} o superior`)
      }
    })
    tx()
    return this.db.prepare('SELECT * FROM loyalty_raffles WHERE id = ?').get(raffleId) as Raffle
  }

  // Add a customer to a level raffle as a single participation (idempotent).
  addRaffleParticipant(raffleId: number, customerId: number): void {
    const raffle = this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(raffleId) as Raffle | undefined
    if (!raffle) throw new Error('Rifa no encontrada')
    if (raffle.kind !== 'level') throw new Error('Solo las rifas por nivel admiten participantes manuales')
    if (raffle.status !== 'open') throw new Error('La rifa ya fue sorteada')
    const bal = this.db
      .prepare(
        'SELECT COALESCE(SUM(tickets), 0) as b FROM loyalty_tickets_ledger WHERE raffle_id = ? AND customer_id = ?'
      )
      .get(raffleId, customerId) as { b: number }
    if (bal.b > 0) return
    this.db
      .prepare(
        "INSERT INTO loyalty_tickets_ledger (customer_id, invoice_id, raffle_id, tickets, type, note) VALUES (?, NULL, ?, 1, 'adjust', 'Agregado manualmente')"
      )
      .run(customerId, raffleId)
  }

  // Remove a customer from a level raffle (drops all their ledger rows for it).
  removeRaffleParticipant(raffleId: number, customerId: number): void {
    const raffle = this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(raffleId) as Raffle | undefined
    if (!raffle) throw new Error('Rifa no encontrada')
    if (raffle.kind !== 'level') throw new Error('Solo las rifas por nivel admiten participantes manuales')
    if (raffle.status !== 'open') throw new Error('La rifa ya fue sorteada')
    this.db
      .prepare('DELETE FROM loyalty_tickets_ledger WHERE raffle_id = ? AND customer_id = ?')
      .run(raffleId, customerId)
  }

  // ---- Monthly level benefits (idempotent per YYYY-MM) -----------------------

  // Members currently sitting at a given level.
  private membersOfLevel(levelId: number): { customer_id: number }[] {
    const levels = this.listLevels()
    const level = levels.find((l) => l.id === levelId)
    if (!level) return []
    // A customer belongs to this level when it's the highest level their
    // points-in-window reach. Compute per customer that has earned points.
    const customers = this.db
      .prepare(
        `SELECT DISTINCT customer_id FROM loyalty_ledger WHERE type = 'earn'`
      )
      .all() as { customer_id: number }[]
    return customers.filter((c) => this.customerLevel(c.customer_id).level?.id === levelId)
  }

  // Members of a level AND every level above it. `listLevels()` is ascending
  // (lowest first), so "this level or higher" = this index onward.
  private membersOfLevelOrHigher(levelId: number): { customer_id: number }[] {
    const levels = this.listLevels()
    const idx = levels.findIndex((l) => l.id === levelId)
    if (idx < 0) return []
    const eligible = new Set(levels.slice(idx).map((l) => l.id))
    const customers = this.db
      .prepare(`SELECT DISTINCT customer_id FROM loyalty_ledger WHERE type = 'earn'`)
      .all() as { customer_id: number }[]
    return customers.filter((c) => {
      const lv = this.customerLevel(c.customer_id).level
      return lv ? eligible.has(lv.id) : false
    })
  }

  // Runs the monthly perks: ensures each level's monthly raffle exists and its
  // members hold a monthly ticket; issues monthly coupons. Safe to call often —
  // every grant is deduplicated by period (YYYY-MM).
  processMonthlyBenefits(period?: string): void {
    const cfg = this.getConfig()
    if (!cfg.enabled || !pointsActive(cfg.mode) || !cfg.levels_enabled) return
    const ym =
      period ??
      (this.db.prepare("SELECT strftime('%Y-%m', 'now', 'localtime') as p").get() as { p: string }).p

    const tx = this.db.transaction(() => {
      for (const level of this.listLevels()) {
        const benefits = this.levelBenefits(level.id)
        const hasRaffle = benefits.some((b) => b.kind === 'monthly_raffle')
        const monthlyCoupon = benefits.find((b) => b.kind === 'monthly_coupon')

        if (hasRaffle) {
          let raffle = this.db
            .prepare(
              "SELECT * FROM loyalty_raffles WHERE kind = 'level' AND level_id = ? AND period = ? LIMIT 1"
            )
            .get(level.id, ym) as Raffle | undefined
          if (!raffle) {
            const info = this.db
              .prepare(
                "INSERT INTO loyalty_raffles (name, points_per_entry, min_points, kind, level_id, period) VALUES (?, 0, 0, 'level', ?, ?)"
              )
              .run(`Rifa ${level.name} ${ym}`, level.id, ym)
            raffle = this.db
              .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
              .get(info.lastInsertRowid) as Raffle
          }
          if (raffle.status === 'open') {
            for (const m of this.membersOfLevel(level.id)) {
              const already = this.db
                .prepare(
                  "SELECT 1 FROM loyalty_tickets_ledger WHERE customer_id = ? AND raffle_id = ? AND type = 'monthly' LIMIT 1"
                )
                .get(m.customer_id, raffle.id)
              if (!already) {
                this.db
                  .prepare(
                    "INSERT INTO loyalty_tickets_ledger (customer_id, invoice_id, raffle_id, tickets, type, note) VALUES (?, NULL, ?, 1, 'monthly', ?)"
                  )
                  .run(m.customer_id, raffle.id, `Ticket mensual ${level.name} ${ym}`)
              }
            }
          }
        }

        if (monthlyCoupon) {
          const kind = monthlyCoupon.unit === 'pct' ? 'discount_pct' : 'discount_usd'
          for (const m of this.membersOfLevel(level.id)) {
            const already = this.db
              .prepare(
                "SELECT 1 FROM loyalty_coupons WHERE customer_id = ? AND source = 'level_monthly' AND period = ? LIMIT 1"
              )
              .get(m.customer_id, ym)
            if (!already) {
              this.db
                .prepare(
                  "INSERT INTO loyalty_coupons (customer_id, reward_id, name, kind, value, cost_points, status, source, period) VALUES (?, NULL, ?, ?, ?, 0, 'active', 'level_monthly', ?)"
                )
                .run(m.customer_id, `Cupón ${level.name} ${ym}`, kind, monthlyCoupon.value, ym)
            }
          }
        }
      }
    })
    tx()
  }
}
