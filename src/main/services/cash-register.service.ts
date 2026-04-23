import type Database from 'better-sqlite3'

export interface CashRegister {
  id: number
  opening_amount: number
  opening_notes: string | null
  closing_amount: number | null
  closing_notes: string | null
  sales_cash: number
  sales_card: number
  sales_transfer: number
  sales_credit: number
  total_invoices: number
  expected_cash: number | null
  difference: number | null
  status: string
  opened_at: string
  closed_at: string | null
}

interface SalesByMethod {
  cash: number
  card: number
  transfer: number
  credit: number
  count: number
}

export class CashRegisterService {
  constructor(private db: Database.Database) {}

  getCurrent(): CashRegister | null {
    return (
      (this.db
        .prepare("SELECT * FROM cash_register WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        .get() as CashRegister | undefined) ?? null
    )
  }

  open(amount: number, notes?: string): CashRegister {
    const current = this.getCurrent()
    if (current) {
      throw new Error('Ya hay una caja abierta. Cierra la caja actual antes de abrir una nueva.')
    }

    const result = this.db
      .prepare('INSERT INTO cash_register (opening_amount, opening_notes) VALUES (?, ?)')
      .run(amount, notes || null)

    return this.db
      .prepare('SELECT * FROM cash_register WHERE id = ?')
      .get(result.lastInsertRowid) as CashRegister
  }

  close(countedAmount: number, notes?: string): CashRegister {
    const current = this.getCurrent()
    if (!current) {
      throw new Error('No hay caja abierta.')
    }

    const sales = this.getSalesForSession(current.opened_at)
    const expectedCash = current.opening_amount + sales.cash
    const difference = countedAmount - expectedCash

    this.db
      .prepare(
        `UPDATE cash_register SET
          closing_amount = ?, closing_notes = ?,
          sales_cash = ?, sales_card = ?, sales_transfer = ?, sales_credit = ?,
          total_invoices = ?, expected_cash = ?, difference = ?,
          status = 'closed', closed_at = datetime('now')
        WHERE id = ?`
      )
      .run(
        countedAmount,
        notes || null,
        sales.cash,
        sales.card,
        sales.transfer,
        sales.credit,
        sales.count,
        expectedCash,
        difference,
        current.id
      )

    return this.db
      .prepare('SELECT * FROM cash_register WHERE id = ?')
      .get(current.id) as CashRegister
  }

  getHistory(): CashRegister[] {
    return this.db
      .prepare("SELECT * FROM cash_register WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 20")
      .all() as CashRegister[]
  }

  getSalesForSession(openedAt: string): SalesByMethod {
    const rows = this.db
      .prepare(
        "SELECT payment_method, COALESCE(SUM(total_usd), 0) as total, COUNT(*) as count FROM invoices WHERE created_at >= ? AND status = 'completed' GROUP BY payment_method"
      )
      .all(openedAt) as { payment_method: string; total: number; count: number }[]

    const result: SalesByMethod = { cash: 0, card: 0, transfer: 0, credit: 0, count: 0 }
    for (const row of rows) {
      if (row.payment_method in result) {
        result[row.payment_method as keyof Omit<SalesByMethod, 'count'>] = row.total
      }
      result.count += row.count
    }
    return result
  }
}
