import type Database from 'better-sqlite3'

export interface PurchaseItemInput {
  productId: number
  productName: string
  quantity: number
  unitCost?: number
}

export interface CreatePurchaseDTO {
  supplierId: number
  reference?: string
  notes?: string
  items: PurchaseItemInput[]
}

export interface Purchase {
  id: number
  supplier_id: number | null
  supplier_name: string | null
  reference: string | null
  notes: string | null
  total_cost: number
  total_items: number
  created_at: string
  items?: PurchaseItemRow[]
}

export interface PurchaseItemRow {
  id: number
  purchase_id: number
  product_id: number | null
  product_name: string
  quantity: number
  unit_cost: number
  subtotal: number
}

// A product as shown in the restock screen — current stock/cost included.
export interface SupplierProduct {
  id: number
  barcode: string | null
  name: string
  stock: number
  cost_usd: number
  price_usd: number
  is_by_weight: number
}

export class PurchaseService {
  constructor(private db: Database.Database) {}

  // Active products assigned to a supplier, for the restock screen.
  getSupplierProducts(supplierId: number): SupplierProduct[] {
    return this.db
      .prepare(
        `SELECT id, barcode, name, stock, cost_usd, price_usd, is_by_weight
         FROM products
         WHERE supplier_id = ? AND is_active = 1
         ORDER BY name ASC`
      )
      .all(supplierId) as SupplierProduct[]
  }

  create(data: CreatePurchaseDTO): Purchase {
    const tx = this.db.transaction(() => {
      const supplier = this.db
        .prepare('SELECT name FROM suppliers WHERE id = ?')
        .get(data.supplierId) as { name: string } | undefined

      const items = data.items.filter((i) => i.quantity > 0)
      const totalCost = items.reduce((s, i) => s + i.quantity * (i.unitCost ?? 0), 0)
      const totalItems = items.reduce((s, i) => s + i.quantity, 0)

      const result = this.db
        .prepare(
          `INSERT INTO purchases (supplier_id, supplier_name, reference, notes, total_cost, total_items, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
        )
        .run(
          data.supplierId,
          supplier?.name ?? null,
          data.reference || null,
          data.notes || null,
          totalCost,
          totalItems
        )
      const purchaseId = Number(result.lastInsertRowid)

      const insertItem = this.db.prepare(
        `INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, unit_cost, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      const addStock = this.db.prepare(
        `UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?`
      )
      // Keep the product's cost up to date with the latest purchase price.
      const updateCost = this.db.prepare(
        `UPDATE products SET cost_usd = ?, updated_at = datetime('now') WHERE id = ?`
      )

      for (const item of items) {
        const unitCost = item.unitCost ?? 0
        insertItem.run(
          purchaseId,
          item.productId,
          item.productName,
          item.quantity,
          unitCost,
          item.quantity * unitCost
        )
        addStock.run(item.quantity, item.productId)
        if (unitCost > 0) updateCost.run(unitCost, item.productId)
      }

      return this.getById(purchaseId)!
    })

    return tx()
  }

  getBySupplier(supplierId: number): Purchase[] {
    return this.db
      .prepare(
        `SELECT * FROM purchases WHERE supplier_id = ? ORDER BY created_at DESC, id DESC`
      )
      .all(supplierId) as Purchase[]
  }

  getById(id: number): Purchase | undefined {
    const purchase = this.db
      .prepare('SELECT * FROM purchases WHERE id = ?')
      .get(id) as Purchase | undefined
    if (purchase) {
      purchase.items = this.db
        .prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id')
        .all(id) as PurchaseItemRow[]
    }
    return purchase
  }
}
