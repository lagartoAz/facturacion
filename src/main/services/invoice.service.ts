import type Database from 'better-sqlite3'
import { SettingsService } from './settings.service'

export interface InvoiceItem {
  productId?: number
  productName: string
  quantity: number
  unitPrice: number
  isCustom?: boolean
}

export interface PaymentSplit {
  method: string
  amount: number
}

export interface CreateInvoiceDTO {
  customerId?: number
  items: InvoiceItem[]
  paymentMethod: string
  payments?: PaymentSplit[]
  paymentAmountVes?: number
  notes?: string
}

export interface Invoice {
  id: number
  invoice_number: string
  customer_id: number | null
  customer_name?: string
  subtotal_usd: number
  tax_percent: number
  tax_amount_usd: number
  total_usd: number
  rate_ves: number | null
  rate_cop: number | null
  total_ves: number | null
  total_cop: number | null
  payment_method: string
  payment_amount_ves: number | null
  notes: string | null
  status: string
  created_at: string
  items?: InvoiceItemRow[]
  payments?: PaymentSplit[]
}

export interface InvoiceItemRow {
  id: number
  invoice_id: number
  product_id: number
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface InvoiceFilters {
  from?: string
  to?: string
  status?: string
  customer_id?: number
}

export class InvoiceService {
  private settingsService: SettingsService

  constructor(private db: Database.Database) {
    this.settingsService = new SettingsService(db)
  }

  create(data: CreateInvoiceDTO): Invoice {
    const createTransaction = this.db.transaction(() => {
      // Get exchange rates
      const rates = this.settingsService.getExchangeRates()
      const rateVes = rates.find((r) => r.currency === 'VES')?.rate ?? 0
      const rateCop = rates.find((r) => r.currency === 'COP')?.rate ?? 0

      // Get and increment invoice number
      const nextNum = parseInt(this.settingsService.get('next_invoice_number') ?? '1')
      const invoiceNumber = `FAC-${String(nextNum).padStart(6, '0')}`
      this.settingsService.set('next_invoice_number', String(nextNum + 1))

      // Calculate totals
      const subtotal = data.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      )
      const total = subtotal

      // Insert invoice
      const result = this.db
        .prepare(
          `INSERT INTO invoices (invoice_number, customer_id, subtotal_usd, tax_percent,
            tax_amount_usd, total_usd, rate_ves, rate_cop, total_ves, total_cop,
            payment_method, payment_amount_ves, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          invoiceNumber,
          data.customerId || null,
          subtotal,
          0,
          0,
          total,
          rateVes,
          rateCop,
          total * rateVes,
          total * rateCop,
          data.paymentMethod,
          data.paymentAmountVes ?? null,
          data.notes || null
        )
      const invoiceId = result.lastInsertRowid

      // Insert line items and decrement stock
      const insertItem = this.db.prepare(
        `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      const decrementStock = this.db.prepare(
        `UPDATE products SET stock = stock - ?, updated_at = datetime('now')
         WHERE id = ? AND stock >= ?`
      )

      for (const item of data.items) {
        insertItem.run(
          invoiceId,
          item.isCustom ? null : item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.quantity * item.unitPrice
        )
        if (!item.isCustom && item.productId) {
          const stockResult = decrementStock.run(item.quantity, item.productId, item.quantity)
          if (stockResult.changes === 0) {
            throw new Error(`Stock insuficiente para: ${item.productName}`)
          }
        }
      }

      // Insert payment splits for mixed payments
      if (data.paymentMethod === 'mixed' && data.payments) {
        const insertPayment = this.db.prepare(
          'INSERT INTO invoice_payments (invoice_id, method, amount) VALUES (?, ?, ?)'
        )
        for (const payment of data.payments) {
          if (payment.amount > 0) {
            insertPayment.run(invoiceId, payment.method, payment.amount)
          }
        }
      }

      return this.getById(Number(invoiceId))!
    })

    return createTransaction()
  }

  getAll(filters?: InvoiceFilters): Invoice[] {
    let query = `
      SELECT i.*, c.name as customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (filters?.from) {
      query += ' AND i.created_at >= ?'
      params.push(filters.from)
    }
    if (filters?.to) {
      query += ' AND i.created_at <= ?'
      params.push(filters.to + ' 23:59:59')
    }
    if (filters?.status) {
      query += ' AND i.status = ?'
      params.push(filters.status)
    }
    if (filters?.customer_id) {
      query += ' AND i.customer_id = ?'
      params.push(filters.customer_id)
    }

    query += ' ORDER BY i.created_at DESC'
    return this.db.prepare(query).all(...params) as Invoice[]
  }

  getById(id: number): Invoice | undefined {
    const invoice = this.db
      .prepare(
        `SELECT i.*, c.name as customer_name
         FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
         WHERE i.id = ?`
      )
      .get(id) as Invoice | undefined

    if (invoice) {
      invoice.items = this.db
        .prepare('SELECT * FROM invoice_items WHERE invoice_id = ?')
        .all(id) as InvoiceItemRow[]
      if (invoice.payment_method === 'mixed') {
        invoice.payments = this.db
          .prepare('SELECT method, amount FROM invoice_payments WHERE invoice_id = ?')
          .all(id) as PaymentSplit[]
      }
    }

    return invoice
  }

  void(id: number): void {
    const voidTransaction = this.db.transaction(() => {
      // Restore stock
      const items = this.db
        .prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?')
        .all(id) as { product_id: number; quantity: number }[]

      const restoreStock = this.db.prepare(
        "UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?"
      )

      for (const item of items) {
        if (item.product_id) {
          restoreStock.run(item.quantity, item.product_id)
        }
      }

      // Mark as voided
      this.db.prepare("UPDATE invoices SET status = 'voided' WHERE id = ?").run(id)
    })

    voidTransaction()
  }
}
