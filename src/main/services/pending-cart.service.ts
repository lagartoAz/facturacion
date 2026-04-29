import type Database from 'better-sqlite3'

export interface PendingCart {
  id: number
  label: string | null
  cart_data: string
  created_at: string
}

export interface CreatePendingCartDTO {
  label?: string
  cartItems: Array<{
    productId: number
    productName: string
    unitPrice: number
    quantity: number
    stock: number
    isByWeight: boolean
    isCustom?: boolean
  }>
}

export class PendingCartService {
  constructor(private db: Database.Database) {}

  create(data: CreatePendingCartDTO): PendingCart {
    const cartData = JSON.stringify(data.cartItems)
    const result = this.db
      .prepare("INSERT INTO pending_carts (label, cart_data, created_at) VALUES (?, ?, datetime('now', 'localtime'))")
      .run(data.label || null, cartData)

    return this.db
      .prepare('SELECT * FROM pending_carts WHERE id = ?')
      .get(result.lastInsertRowid) as PendingCart
  }

  getAll(): PendingCart[] {
    return this.db
      .prepare('SELECT * FROM pending_carts ORDER BY created_at DESC')
      .all() as PendingCart[]
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM pending_carts WHERE id = ?').run(id)
  }
}
