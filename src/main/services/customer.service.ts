import type Database from 'better-sqlite3'

export interface Customer {
  id: number
  name: string
  id_rif: string | null
  address: string | null
  phone: string | null
  email: string | null
  notes: string | null
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
}

export interface UpdateCustomerDTO extends Partial<CreateCustomerDTO> {}

export class CustomerService {
  constructor(private db: Database.Database) {}

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
        'INSERT INTO customers (name, id_rif, address, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        data.name,
        data.id_rif || null,
        data.address || null,
        data.phone || null,
        data.email || null,
        data.notes || null
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

  getCreditInvoices(customerId: number): { id: number; invoice_number: string; total_usd: number; created_at: string }[] {
    return this.db.prepare(
      "SELECT id, invoice_number, total_usd, created_at FROM invoices WHERE customer_id = ? AND payment_method = 'credit' AND status = 'completed' ORDER BY created_at DESC"
    ).all(customerId) as { id: number; invoice_number: string; total_usd: number; created_at: string }[]
  }

  addPayment(customerId: number, amount: number, notes?: string): void {
    this.db.prepare(
      'INSERT INTO customer_payments (customer_id, amount_usd, notes) VALUES (?, ?, ?)'
    ).run(customerId, amount, notes || null)
  }

  getPayments(customerId: number): { id: number; amount_usd: number; notes: string | null; created_at: string }[] {
    return this.db.prepare(
      'SELECT id, amount_usd, notes, created_at FROM customer_payments WHERE customer_id = ? ORDER BY created_at DESC'
    ).all(customerId) as { id: number; amount_usd: number; notes: string | null; created_at: string }[]
  }
}
