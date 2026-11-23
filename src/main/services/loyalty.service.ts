import type Database from 'better-sqlite3'
import type { DailySale, HourlySale, MonthlySale, SalesSummary, TopProduct } from './report.service'

export interface LoyaltyConfig {
  enabled: boolean
  // Earning rules (additive)
  earn_money: boolean
  points_per_usd: number
  earn_product: boolean
  earn_invoice: boolean
  points_per_invoice: number
  currency_filter: string // '' | 'USD' | 'VES' | 'COP'
  exclude_credit: boolean
  // Rewards
  rewards_enabled: boolean
  redeem_value_usd: number
  // Raffle
  raffle_enabled: boolean
  raffle_points_per_entry: number
  raffle_min_points: number
  exclude_red_debtors: boolean
  raffle_animation: string // 'ruleta' | 'minimal'
  tickets_enabled: boolean
  winner_template: string
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
  entries: number
}

export interface Reward {
  id: number
  name: string
  kind: 'discount_usd' | 'discount_pct' | 'custom'
  cost_points: number
  value: number
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
    return {
      enabled: this.get('loyalty_enabled', '0') === '1',
      earn_money: this.get('loyalty_earn_money', '1') === '1',
      points_per_usd: parseFloat(this.get('loyalty_points_per_usd', '1')) || 0,
      earn_product: this.get('loyalty_earn_product', '0') === '1',
      earn_invoice: this.get('loyalty_earn_invoice', '0') === '1',
      points_per_invoice: parseFloat(this.get('loyalty_points_per_invoice', '0')) || 0,
      currency_filter: this.get('loyalty_currency_filter', ''),
      exclude_credit: this.get('loyalty_exclude_credit', '1') === '1',
      rewards_enabled: this.get('loyalty_rewards_enabled', '1') === '1',
      redeem_value_usd: parseFloat(this.get('loyalty_redeem_value_usd', '0.01')) || 0,
      raffle_enabled: this.get('loyalty_raffle_enabled', '0') === '1',
      raffle_points_per_entry: parseFloat(this.get('loyalty_raffle_points_per_entry', '0')) || 0,
      raffle_min_points: parseFloat(this.get('loyalty_raffle_min_points', '0')) || 0,
      exclude_red_debtors: this.get('loyalty_exclude_red_debtors', '0') === '1',
      raffle_animation: this.get('loyalty_raffle_animation', 'ruleta'),
      tickets_enabled: this.get('loyalty_tickets_enabled', '0') === '1',
      winner_template: this.get('loyalty_winner_template', '')
    }
  }

  setConfig(cfg: Partial<LoyaltyConfig>): LoyaltyConfig {
    const bool = (b: boolean): string => (b ? '1' : '0')
    const map: Record<string, string | undefined> = {
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
        cfg.winner_template === undefined ? undefined : cfg.winner_template
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

    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(points), 0) as pts FROM loyalty_ledger WHERE invoice_id = ? AND type = 'earn'"
      )
      .get(invoiceId) as { pts: number }
    const points = row.pts
    const count =
      raffle.points_per_entry > 0 ? Math.floor(points / raffle.points_per_entry) : points > 0 ? 1 : 0
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

  ticketsPrintedIds(): number[] {
    return (this.db.prepare('SELECT invoice_id FROM loyalty_ticket_prints').all() as {
      invoice_id: number
    }[]).map((r) => r.invoice_id)
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

  // Every customer that has points, with their entries in the active raffle.
  allBalances(): CustomerPoints[] {
    const rows = this.db
      .prepare(
        `SELECT l.customer_id as customer_id, c.name as name,
                COALESCE(SUM(l.points), 0) as points
         FROM loyalty_ledger l
         JOIN customers c ON c.id = l.customer_id
         GROUP BY l.customer_id
         HAVING points > 0
         ORDER BY points DESC`
      )
      .all() as { customer_id: number; name: string; points: number }[]
    const raffle = this.getActiveRaffle()
    const blocked = raffle && this.getConfig().exclude_red_debtors ? this.redDebtorIds() : null
    return rows.map((r) => ({
      ...r,
      entries:
        raffle && !(blocked && blocked.has(r.customer_id))
          ? this.entriesFor(r.points, raffle.points_per_entry, raffle.min_points)
          : 0
    }))
  }

  // Points + entries keyed by customer id, for the customers list.
  summaryByCustomer(): Record<number, { points: number; entries: number }> {
    const out: Record<number, { points: number; entries: number }> = {}
    for (const b of this.allBalances()) out[b.customer_id] = { points: b.points, entries: b.entries }
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
    if (!cfg.enabled) return 0
    if (cfg.exclude_credit && ctx.paymentMethod === 'credit') return 0
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
    return points
  }

  // Tickets/cupos a points amount yields for the active raffle (ignores the
  // per-customer min threshold — this is the per-sale contribution).
  private ticketsForPoints(points: number): number {
    const raffle = this.getActiveRaffle()
    if (!raffle || points <= 0) return 0
    return raffle.points_per_entry > 0 ? Math.floor(points / raffle.points_per_entry) : 1
  }

  // Preview of what a sale would grant, for the POS (points + raffle tickets).
  previewSale(ctx: EarnContext): { points: number; tickets: number } {
    const points = this.computeEarnedPoints(ctx)
    return { points, tickets: this.ticketsForPoints(points) }
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
        'INSERT INTO loyalty_rewards (name, kind, cost_points, value, active) VALUES (?, ?, ?, ?, ?)'
      )
      .run(r.name, r.kind, Math.round(r.cost_points), r.value ?? 0, r.active === false ? 0 : 1)
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
        'UPDATE loyalty_rewards SET name = ?, kind = ?, cost_points = ?, value = ?, active = ? WHERE id = ?'
      )
      .run(
        r.name ?? cur.name,
        r.kind ?? cur.kind,
        Math.round(r.cost_points ?? cur.cost_points),
        r.value ?? cur.value,
        r.active === undefined ? cur.active : r.active ? 1 : 0,
        id
      )
  }

  deleteReward(id: number): void {
    this.db.prepare('DELETE FROM loyalty_rewards WHERE id = ?').run(id)
  }

  // ---- Raffle ----------------------------------------------------------------

  getActiveRaffle(): Raffle | null {
    const cfg = this.getConfig()
    if (!cfg.raffle_enabled) return null
    return (
      (this.db
        .prepare("SELECT * FROM loyalty_raffles WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        .get() as Raffle | undefined) ?? null
    )
  }

  listRaffles(): Raffle[] {
    return this.db
      .prepare('SELECT * FROM loyalty_raffles ORDER BY id DESC')
      .all() as Raffle[]
  }

  createRaffle(name: string, pointsPerEntry: number, minPoints: number): Raffle {
    const open = this.db.prepare("SELECT id FROM loyalty_raffles WHERE status = 'open'").get()
    if (open) throw new Error('Ya hay una rifa abierta. Ciérrala antes de crear otra.')
    const info = this.db
      .prepare(
        'INSERT INTO loyalty_raffles (name, points_per_entry, min_points) VALUES (?, ?, ?)'
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
  // count (a customer can hold several entries).
  raffleParticipants(raffleId: number): RaffleParticipant[] {
    const raffle = this.db
      .prepare('SELECT * FROM loyalty_raffles WHERE id = ?')
      .get(raffleId) as Raffle | undefined
    if (!raffle) return []
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
    const blocked = this.getConfig().exclude_red_debtors ? this.redDebtorIds() : null
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
    this.db
      .prepare(
        "UPDATE loyalty_raffles SET status = 'drawn', winner_customer_id = ?, winner_name = ?, drawn_at = datetime('now', 'localtime') WHERE id = ?"
      )
      .run(winner.customer_id, winner.name, raffleId)
    return winner
  }
}
