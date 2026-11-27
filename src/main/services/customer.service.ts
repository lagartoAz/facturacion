import type Database from 'better-sqlite3'
import { SettingsService } from './settings.service'
import { LoyaltyService } from './loyalty.service'

export interface Customer {
  id: number
  name: string
  id_rif: string | null
  address: string | null
  phone: string | null
  email: string | null
  notes: string | null
  sector: string | null
  /** Prórroga de pago: mientras esté vigente no cuenta como deudor crítico. */
  credit_grace_until: string | null
  created_at: string
  updated_at: string
}

export interface CreateCustomerDTO {
  name: string
  id_rif?: string
  address?: string
  phone?: string
  email?: string
  notes?: string
  sector?: string
}

export interface UpdateCustomerDTO extends Partial<CreateCustomerDTO> {}

// How a debt payment was actually received, mirroring the point-of-sale charge:
// a method (cash/card/transfer) and, for cash, the currency used.
export interface PaymentDetails {
  method?: 'cash' | 'card' | 'transfer'
  currency?: 'USD' | 'VES' | 'COP'
}

export class CustomerService {
  private settings: SettingsService
  private loyalty: LoyaltyService

  constructor(private db: Database.Database) {
    this.settings = new SettingsService(db)
    this.loyalty = new LoyaltyService(db)
  }

  getAll(search?: string): Customer[] {
    if (search) {
      const s = `%${search}%`
      return this.db
        .prepare(
          'SELECT * FROM customers WHERE name LIKE ? OR id_rif LIKE ? ORDER BY name ASC'
        )
        .all(s, s) as Customer[]
    }
    return this.db.prepare('SELECT * FROM customers ORDER BY name ASC').all() as Customer[]
  }

  getById(id: number): Customer | undefined {
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer | undefined
  }

  create(data: CreateCustomerDTO): Customer {
    const result = this.db
      .prepare(
        'INSERT INTO customers (name, id_rif, address, phone, email, notes, sector) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        data.name,
        data.id_rif || null,
        data.address || null,
        data.phone || null,
        data.email || null,
        data.notes || null,
        data.sector?.trim() || null
      )
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid) as Customer
  }

  update(id: number, data: UpdateCustomerDTO): Customer {
    const fields: string[] = []
    const params: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name) }
    if (data.id_rif !== undefined) { fields.push('id_rif = ?'); params.push(data.id_rif || null) }
    if (data.address !== undefined) { fields.push('address = ?'); params.push(data.address || null) }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone || null) }
    if (data.email !== undefined) { fields.push('email = ?'); params.push(data.email || null) }
    if (data.notes !== undefined) { fields.push('notes = ?'); params.push(data.notes || null) }
    if (data.sector !== undefined) { fields.push('sector = ?'); params.push(data.sector?.trim() || null) }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      params.push(id)
      this.db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    }

    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  }

  getBalance(customerId: number): number {
    const creditTotal = (this.db.prepare(
      "SELECT COALESCE(SUM(total_usd), 0) as total FROM invoices WHERE customer_id = ? AND payment_method = 'credit' AND status = 'completed'"
    ).get(customerId) as { total: number }).total

    const paymentsTotal = (this.db.prepare(
      'SELECT COALESCE(SUM(amount_usd), 0) as total FROM customer_payments WHERE customer_id = ?'
    ).get(customerId) as { total: number }).total

    return Math.max(0, creditTotal - paymentsTotal)
  }

  getBalances(): Record<number, number> {
    const credits = this.db.prepare(
      "SELECT customer_id, COALESCE(SUM(total_usd), 0) as total FROM invoices WHERE payment_method = 'credit' AND status = 'completed' AND customer_id IS NOT NULL GROUP BY customer_id"
    ).all() as { customer_id: number; total: number }[]

    const payments = this.db.prepare(
      'SELECT customer_id, COALESCE(SUM(amount_usd), 0) as total FROM customer_payments GROUP BY customer_id'
    ).all() as { customer_id: number; total: number }[]

    const paymentMap = new Map(payments.map(p => [p.customer_id, p.total]))
    const result: Record<number, number> = {}

    for (const c of credits) {
      const balance = c.total - (paymentMap.get(c.customer_id) ?? 0)
      if (balance > 0) {
        result[c.customer_id] = balance
      }
    }

    return result
  }

  // Meses de atraso de cada cliente = antigüedad (en meses calendario) de su
  // factura a crédito más vieja que AÚN tiene saldo pendiente. Los pagos no se
  // atan a una factura, así que se saldan en orden (FIFO, la más vieja primero),
  // igual que en reportes y en el diálogo de deudas. Un cliente crítico es el
  // que llega al umbral de meses (2 por defecto). Solo aparecen los que deben.
  getOverdueMonths(): Record<number, number> {
    const invoices = this.db
      .prepare(
        `SELECT customer_id, total_usd, created_at
         FROM invoices
         WHERE payment_method = 'credit' AND status = 'completed' AND customer_id IS NOT NULL
         ORDER BY customer_id, datetime(created_at) ASC, id ASC`
      )
      .all() as { customer_id: number; total_usd: number; created_at: string }[]

    const payRows = this.db
      .prepare(
        'SELECT customer_id, COALESCE(SUM(amount_usd), 0) as total FROM customer_payments GROUP BY customer_id'
      )
      .all() as { customer_id: number; total: number }[]
    const paidByCustomer = new Map(payRows.map((p) => [p.customer_id, p.total]))

    // Tolerancia de centavos: pagos en Bs/Pesos y precios por peso dejan restos
    // de fracciones de centavo. Sin esto, alguien que "pagó todo" podía quedar
    // con US$0.0001 pendiente y aparecer como crítico aunque figure solvente.
    const EPS = 0.01
    // Deuda neta por cliente (crédito − pagos). Si ya saldó (≤ EPS), no atrasa.
    const owed = new Map<number, number>()
    for (const inv of invoices) {
      owed.set(inv.customer_id, (owed.get(inv.customer_id) ?? 0) + inv.total_usd)
    }
    owed.forEach((total, cid) => owed.set(cid, total - (paidByCustomer.get(cid) ?? 0)))
    // Clientes con prórroga vigente: no cuentan como atrasados hasta que venza.
    const graced = new Set(
      (
        this.db
          .prepare(
            "SELECT id FROM customers WHERE credit_grace_until IS NOT NULL AND date(credit_grace_until) >= date('now','localtime')"
          )
          .all() as { id: number }[]
      ).map((r) => r.id)
    )

    const now = new Date()
    const out: Record<number, number> = {}
    let curCust: number | null = null
    let remaining = 0
    for (const inv of invoices) {
      if (inv.customer_id !== curCust) {
        curCust = inv.customer_id
        remaining = paidByCustomer.get(inv.customer_id) ?? 0
        // Deuda saldada o prórroga vigente → marcado como no atrasado (0 meses).
        if (graced.has(inv.customer_id) || (owed.get(inv.customer_id) ?? 0) <= EPS) {
          out[inv.customer_id] = 0
        }
      }
      if (out[inv.customer_id] !== undefined) continue // ya resuelto para este cliente
      if (remaining >= inv.total_usd - EPS) {
        remaining -= inv.total_usd
        continue // esta factura quedó saldada por pagos previos
      }
      // Primera factura con saldo pendiente para este cliente → su atraso.
      remaining = 0
      const then = new Date(inv.created_at.replace(' ', 'T'))
      let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
      if (now.getDate() < then.getDate()) months--
      out[inv.customer_id] = Math.max(0, months)
    }
    return out
  }

  // Fija (o quita, con null) una prórroga de pago para un deudor: mientras la
  // fecha esté vigente, el cliente deja de contar como crítico y puede
  // participar/ganar en la rifa, aunque siga debiendo.
  setCreditGrace(customerId: number, until: string | null): void {
    this.db
      .prepare("UPDATE customers SET credit_grace_until = ?, updated_at = datetime('now') WHERE id = ?")
      .run(until || null, customerId)
  }

  // Sectores ya usados (para sugerir al registrar un cliente). Orden alfabético.
  getSectors(): string[] {
    return (
      this.db
        .prepare(
          "SELECT DISTINCT sector FROM customers WHERE sector IS NOT NULL AND TRIM(sector) != '' ORDER BY sector COLLATE NOCASE ASC"
        )
        .all() as { sector: string }[]
    ).map((r) => r.sector)
  }

  // Cantidad de clientes por sector de vivienda, para la gráfica de barras.
  getSectorCounts(): { sector: string; count: number }[] {
    return this.db
      .prepare(
        `SELECT sector, COUNT(*) as count
         FROM customers
         WHERE sector IS NOT NULL AND TRIM(sector) != ''
         GROUP BY sector
         ORDER BY count DESC, sector COLLATE NOCASE ASC`
      )
      .all() as { sector: string; count: number }[]
  }

  getCreditInvoices(customerId: number): { id: number; invoice_number: string; total_usd: number; created_at: string }[] {
    return this.db.prepare(
      "SELECT id, invoice_number, total_usd, created_at FROM invoices WHERE customer_id = ? AND payment_method = 'credit' AND status = 'completed' ORDER BY created_at DESC"
    ).all(customerId) as { id: number; invoice_number: string; total_usd: number; created_at: string }[]
  }

  addPayment(customerId: number, amount: number, notes?: string, details?: PaymentDetails): void {
    const method = details?.method ?? 'cash'
    // Card/transfer debt payments land in the bank in bolivares; a cash payment
    // may be in dollars, bolivares or pesos.
    const currency = method === 'cash' ? details?.currency ?? 'USD' : 'VES'

    const rates = this.settings.getExchangeRates()
    const rateVes = rates.find((r) => r.currency === 'VES')?.rate ?? 0
    const rateCop = rates.find((r) => r.currency === 'COP')?.rate ?? 0

    // Store the figure in the currency actually handed over, for the cash
    // register. amount_usd always reduces the balance.
    const amountVes = currency === 'VES' ? amount * rateVes : null
    const amountCop = currency === 'COP' ? amount * rateCop : null

    // El pago y el otorgamiento de fidelidad de las facturas que queden saldadas
    // se hacen juntos (misma transacción) para que no puedan quedar a medias.
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO customer_payments
            (customer_id, amount_usd, notes, method, currency, amount_ves, amount_cop, rate_ves, rate_cop, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
        )
        .run(customerId, amount, notes || null, method, currency, amountVes, amountCop, rateVes, rateCop)
      this.grantLoyaltyForPaidCredit(customerId, method, currency)
    })
    tx()
  }

  // Tras registrar un pago, otorga los puntos/tickets de las facturas a crédito
  // que, en orden (FIFO, la más vieja primero), hayan quedado completamente
  // saldadas. Las ventas a crédito no acumulan al emitirse: lo hacen al pagarse.
  // Es idempotente por factura, así que pagos parciales no duplican nada.
  private grantLoyaltyForPaidCredit(
    customerId: number,
    paymentMethod: string,
    currency: string
  ): void {
    const credits = this.db
      .prepare(
        "SELECT id, total_usd FROM invoices WHERE customer_id = ? AND payment_method = 'credit' AND status = 'completed' ORDER BY datetime(created_at) ASC, id ASC"
      )
      .all(customerId) as { id: number; total_usd: number }[]
    if (credits.length === 0) return
    const paid = (
      this.db
        .prepare('SELECT COALESCE(SUM(amount_usd), 0) as t FROM customer_payments WHERE customer_id = ?')
        .get(customerId) as { t: number }
    ).t
    const EPS = 0.01
    let remaining = paid
    for (const inv of credits) {
      if (remaining < inv.total_usd - EPS) break // esta factura aún no está saldada
      remaining -= inv.total_usd
      const items = this.db
        .prepare('SELECT product_id as productId, quantity FROM invoice_items WHERE invoice_id = ?')
        .all(inv.id) as { productId: number | null; quantity: number }[]
      this.loyalty.grantCreditInvoiceEarnings(
        inv.id,
        customerId,
        inv.total_usd,
        paymentMethod,
        currency,
        items
      )
    }
  }

  getPayments(customerId: number): {
    id: number
    amount_usd: number
    notes: string | null
    method: string
    currency: string
    amount_ves: number | null
    amount_cop: number | null
    created_at: string
  }[] {
    return this.db.prepare(
      'SELECT id, amount_usd, notes, method, currency, amount_ves, amount_cop, created_at FROM customer_payments WHERE customer_id = ? ORDER BY created_at DESC'
    ).all(customerId) as {
      id: number
      amount_usd: number
      notes: string | null
      method: string
      currency: string
      amount_ves: number | null
      amount_cop: number | null
      created_at: string
    }[]
  }
}
