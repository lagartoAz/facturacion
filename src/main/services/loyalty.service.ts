import type Database from 'better-sqlite3'

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
      raffle_min_points: parseFloat(this.get('loyalty_raffle_min_points', '0')) || 0
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
        cfg.raffle_min_points === undefined ? undefined : String(cfg.raffle_min_points)
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
    return rows.map((r) => ({
      ...r,
      entries: raffle
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

  // Redeem a catalogue reward: spends its cost in points and records the name.
  redeemReward(customerId: number, rewardId: number): { balance: number; reward: Reward } {
    const reward = this.db.prepare('SELECT * FROM loyalty_rewards WHERE id = ?').get(rewardId) as
      | Reward
      | undefined
    if (!reward || !reward.active) throw new Error('Premio no disponible')
    const balance = this.redeem(customerId, reward.cost_points, `Premio: ${reward.name}`)
    return { balance, reward }
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

  // Accrue points for a completed sale. Called from inside the invoice
  // transaction (same db handle) so it commits atomically with the sale.
  earnForInvoice(ctx: EarnContext): void {
    if (!ctx.customerId) return // only registered customers earn
    const cfg = this.getConfig()
    if (!cfg.enabled) return
    if (cfg.exclude_credit && ctx.paymentMethod === 'credit') return
    if (cfg.currency_filter && ctx.currency !== cfg.currency_filter) return

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
    return rows
      .map((r) => ({
        ...r,
        entries: this.entriesFor(r.points, raffle.points_per_entry, raffle.min_points)
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
