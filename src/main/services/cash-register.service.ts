import type Database from 'better-sqlite3'

export interface CashRegister {
  id: number
  opening_amount: number
  opening_amount_ves: number
  opening_amount_cop: number
  opening_notes: string | null
  closing_amount: number | null
  closing_amount_ves: number | null
  closing_amount_cop: number | null
  closing_notes: string | null
  sales_cash: number
  sales_card: number
  sales_card_ves: number
  sales_transfer: number
  sales_transfer_ves: number
  sales_transfer_cop: number
  sales_credit: number
  total_invoices: number
  expected_cash: number | null
  difference: number | null
  status: string
  opened_at: string
  closed_at: string | null
}

export interface OpenAmounts {
  usd: number
  ves: number
  cop: number
}

export interface CloseAmounts {
  usd: number
  ves: number
  cop: number
}

export interface CashRegisterWithdrawal {
  id: number
  cash_register_id: number
  amount: number
  currency: string
  reason: string
  created_at: string
}

interface SalesByMethod {
  cash: number
  card: number
  card_ves: number
  transfer: number
  transfer_ves: number
  transfer_cop: number
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

  open(amounts: OpenAmounts, notes?: string): CashRegister {
    const current = this.getCurrent()
    if (current) {
      throw new Error('Ya hay una caja abierta. Cierra la caja actual antes de abrir una nueva.')
    }

    const result = this.db
      .prepare(
        'INSERT INTO cash_register (opening_amount, opening_amount_ves, opening_amount_cop, opening_notes) VALUES (?, ?, ?, ?)'
      )
      .run(amounts.usd, amounts.ves, amounts.cop, notes || null)

    return this.db
      .prepare('SELECT * FROM cash_register WHERE id = ?')
      .get(result.lastInsertRowid) as CashRegister
  }

  close(countedAmounts: CloseAmounts, notes?: string): CashRegister {
    const current = this.getCurrent()
    if (!current) {
      throw new Error('No hay caja abierta.')
    }

    const sales = this.getSalesForSession(current.opened_at)
    const totalWithdrawals = this.getTotalWithdrawals(current.id)
    const expectedCash = current.opening_amount + sales.cash - totalWithdrawals
    const difference = countedAmounts.usd - expectedCash

    this.db
      .prepare(
        `UPDATE cash_register SET
          closing_amount = ?, closing_amount_ves = ?, closing_amount_cop = ?,
          closing_notes = ?,
          sales_cash = ?, sales_card = ?, sales_card_ves = ?, sales_transfer = ?, sales_transfer_ves = ?, sales_transfer_cop = ?, sales_credit = ?,
          total_invoices = ?, expected_cash = ?, difference = ?,
          status = 'closed', closed_at = datetime('now')
        WHERE id = ?`
      )
      .run(
        countedAmounts.usd,
        countedAmounts.ves,
        countedAmounts.cop,
        notes || null,
        sales.cash,
        sales.card,
        sales.card_ves,
        sales.transfer,
        sales.transfer_ves,
        sales.transfer_cop,
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

  update(id: number, amounts: CloseAmounts, notes?: string): CashRegister {
    const register = this.db
      .prepare('SELECT * FROM cash_register WHERE id = ?')
      .get(id) as CashRegister | undefined

    if (!register) {
      throw new Error('Registro de caja no encontrado')
    }
    if (register.status !== 'closed') {
      throw new Error('Solo se pueden editar cajas cerradas')
    }

    const totalWithdrawals = this.getTotalWithdrawals(register.id)
    const expectedCash = register.opening_amount + register.sales_cash - totalWithdrawals
    const newDifference = amounts.usd - expectedCash

    this.db
      .prepare(
        `UPDATE cash_register SET
          closing_amount = ?, closing_amount_ves = ?, closing_amount_cop = ?,
          closing_notes = ?, difference = ?
        WHERE id = ?`
      )
      .run(amounts.usd, amounts.ves, amounts.cop, notes || null, newDifference, id)

    return this.db
      .prepare('SELECT * FROM cash_register WHERE id = ?')
      .get(id) as CashRegister
  }

  getSalesForSession(openedAt: string): SalesByMethod {
    // Regular (non-mixed) invoices — use payment_amount_ves/cop when available, fallback to total_ves/cop
    const rows = this.db
      .prepare(
        "SELECT payment_method, COALESCE(SUM(total_usd), 0) as total, COALESCE(SUM(COALESCE(payment_amount_ves, total_ves, 0)), 0) as ves, COALESCE(SUM(COALESCE(payment_amount_cop, total_cop, 0)), 0) as cop, COUNT(*) as count FROM invoices WHERE created_at >= ? AND status = 'completed' AND payment_method != 'mixed' GROUP BY payment_method"
      )
      .all(openedAt) as { payment_method: string; total: number; ves: number; cop: number; count: number }[]

    const result: SalesByMethod = { cash: 0, card: 0, card_ves: 0, transfer: 0, transfer_ves: 0, transfer_cop: 0, credit: 0, count: 0 }
    for (const row of rows) {
      if (row.payment_method in result) {
        result[row.payment_method as keyof Omit<SalesByMethod, 'count' | 'transfer_ves' | 'transfer_cop' | 'card_ves'>] = row.total
      }
      if (row.payment_method === 'transfer') {
        result.transfer_ves = row.ves
        result.transfer_cop = row.cop
      }
      if (row.payment_method === 'card') {
        result.card_ves = row.ves
      }
      result.count += row.count
    }

    // Mixed payment invoices — split amounts by method
    const mixedRows = this.db
      .prepare(
        "SELECT ip.method as payment_method, SUM(ip.amount) as total, SUM(ip.amount * COALESCE(i.rate_ves, 0)) as ves, SUM(ip.amount * COALESCE(i.rate_cop, 0)) as cop, COUNT(DISTINCT ip.invoice_id) as count FROM invoice_payments ip JOIN invoices i ON ip.invoice_id = i.id WHERE i.created_at >= ? AND i.status = 'completed' AND i.payment_method = 'mixed' GROUP BY ip.method"
      )
      .all(openedAt) as { payment_method: string; total: number; ves: number; cop: number; count: number }[]

    const mixedCount = (this.db
      .prepare("SELECT COUNT(*) as count FROM invoices WHERE created_at >= ? AND status = 'completed' AND payment_method = 'mixed'")
      .get(openedAt) as { count: number }).count

    for (const row of mixedRows) {
      if (row.payment_method in result) {
        result[row.payment_method as keyof Omit<SalesByMethod, 'count' | 'transfer_ves' | 'transfer_cop' | 'card_ves'>] += row.total
      }
      if (row.payment_method === 'transfer') {
        result.transfer_ves += row.ves
        result.transfer_cop += row.cop
      }
      if (row.payment_method === 'card') {
        result.card_ves += row.ves
      }
    }
    result.count += mixedCount

    return result
  }

  addWithdrawal(cashRegisterId: number, amount: number, reason: string, currency: string = 'USD'): CashRegisterWithdrawal {
    const register = this.db
      .prepare('SELECT * FROM cash_register WHERE id = ?')
      .get(cashRegisterId) as CashRegister | undefined

    if (!register) {
      throw new Error('Registro de caja no encontrado')
    }
    if (register.status !== 'open') {
      throw new Error('Solo se pueden hacer retiros con la caja abierta')
    }

    const result = this.db
      .prepare('INSERT INTO cash_register_withdrawals (cash_register_id, amount, reason, currency) VALUES (?, ?, ?, ?)')
      .run(cashRegisterId, amount, reason, currency)

    return this.db
      .prepare('SELECT * FROM cash_register_withdrawals WHERE id = ?')
      .get(result.lastInsertRowid) as CashRegisterWithdrawal
  }

  getWithdrawals(cashRegisterId: number): CashRegisterWithdrawal[] {
    return this.db
      .prepare('SELECT * FROM cash_register_withdrawals WHERE cash_register_id = ? ORDER BY created_at ASC')
      .all(cashRegisterId) as CashRegisterWithdrawal[]
  }

  private getTotalWithdrawals(cashRegisterId: number): number {
    const result = this.db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_register_withdrawals WHERE cash_register_id = ? AND currency = 'USD'")
      .get(cashRegisterId) as { total: number }
    return result.total
  }
}
