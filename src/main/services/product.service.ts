import type Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { mimeFromDataUrl, mimeFromExtension } from '../shared/image-mime'

// Explicit column list instead of `p.*`: the photo blob must never travel with
// a product listing (it would be copied into every row and, on a terminal, sent
// over the LAN). `has_image` tells the UI whether to request the photo.
const PRODUCT_FIELDS = `p.id, p.barcode, p.name, p.description, p.price_usd, p.cost_usd,
         p.category_id, p.supplier_id, p.stock, p.min_stock, p.is_active, p.is_by_weight,
         p.created_at, p.updated_at, (p.image_blob IS NOT NULL) AS has_image`

export interface Product {
  id: number
  barcode: string | null
  name: string
  description: string | null
  price_usd: number
  cost_usd: number
  category_id: number | null
  category_name?: string
  supplier_id: number | null
  supplier_name?: string
  stock: number
  min_stock: number
  is_active: number
  is_by_weight: number
  has_image: number
  created_at: string
  updated_at: string
}

export interface ProductImage {
  mime: string
  data: string
}

export interface CreateProductDTO {
  barcode?: string
  name: string
  description?: string
  price_usd: number
  cost_usd?: number
  category_id?: number
  supplier_id?: number
  stock?: number
  min_stock?: number
  is_by_weight?: number
}

export interface UpdateProductDTO extends Partial<CreateProductDTO> {}

export interface ProductFilters {
  category_id?: number
  search?: string
  active_only?: boolean
  page?: number
  limit?: number
}

export class ProductService {
  constructor(private db: Database.Database) {}

  getAll(filters?: ProductFilters): Product[] {
    let query = `
      SELECT ${PRODUCT_FIELDS}, c.name as category_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (filters?.active_only !== false) {
      query += ' AND p.is_active = 1'
    }
    if (filters?.category_id) {
      query += ' AND p.category_id = ?'
      params.push(filters.category_id)
    }
    if (filters?.search) {
      query += ' AND (p.name LIKE ? OR p.barcode LIKE ?)'
      const s = `%${filters.search}%`
      params.push(s, s)
    }

    query += ' ORDER BY p.stock ASC, p.name ASC'
    const limit = filters?.limit ?? 20
    const page = filters?.page ?? 1
    query += ' LIMIT ? OFFSET ?'
    params.push(limit, (page - 1) * limit)
    return this.db.prepare(query).all(...params) as Product[]
  }

  count(filters?: ProductFilters): number {
    let query = 'SELECT COUNT(*) as n FROM products p WHERE 1=1'
    const params: unknown[] = []
    if (filters?.active_only !== false) { query += ' AND p.is_active = 1' }
    if (filters?.category_id) { query += ' AND p.category_id = ?'; params.push(filters.category_id) }
    if (filters?.search) {
      query += ' AND (p.name LIKE ? OR p.barcode LIKE ?)'
      const s = `%${filters.search}%`
      params.push(s, s)
    }
    return (this.db.prepare(query).get(...params) as { n: number }).n
  }

  getInventoryTotals(filters?: ProductFilters): { total_units: number; total_invested: number } {
    let query = `
      SELECT
        COALESCE(SUM(CASE WHEN p.is_by_weight = 0 THEN p.stock ELSE 0 END), 0) as total_units,
        COALESCE(SUM(CASE WHEN p.is_by_weight = 0 THEN (CASE WHEN p.cost_usd > 0 THEN p.cost_usd ELSE p.price_usd END) * p.stock ELSE 0 END), 0) as total_invested
      FROM products p WHERE 1=1
    `
    const params: unknown[] = []
    if (filters?.active_only !== false) { query += ' AND p.is_active = 1' }
    if (filters?.category_id) { query += ' AND p.category_id = ?'; params.push(filters.category_id) }
    if (filters?.search) {
      query += ' AND (p.name LIKE ? OR p.barcode LIKE ?)'
      const s = `%${filters.search}%`
      params.push(s, s)
    }
    return this.db.prepare(query).get(...params) as { total_units: number; total_invested: number }
  }

  getByBarcode(barcode: string): Product | undefined {
    return this.db
      .prepare(
        `SELECT ${PRODUCT_FIELDS}, c.name as category_name, s.name as supplier_name
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN suppliers s ON p.supplier_id = s.id
         WHERE p.barcode = ? AND p.is_active = 1`
      )
      .get(barcode) as Product | undefined
  }

  search(query: string): Product[] {
    const s = `%${query}%`
    return this.db
      .prepare(
        `SELECT ${PRODUCT_FIELDS}, c.name as category_name, s.name as supplier_name
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN suppliers s ON p.supplier_id = s.id
         WHERE p.is_active = 1 AND (p.name LIKE ? OR p.barcode LIKE ?)
         ORDER BY p.name ASC LIMIT 20`
      )
      .all(s, s) as Product[]
  }

  create(data: CreateProductDTO): Product {
    const result = this.db
      .prepare(
        `INSERT INTO products (barcode, name, description, price_usd, cost_usd, category_id, supplier_id, stock, min_stock, is_by_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.barcode || null,
        data.name,
        data.description || null,
        data.price_usd,
        data.cost_usd ?? 0,
        data.category_id || null,
        data.supplier_id || null,
        data.stock ?? 0,
        data.min_stock ?? 0,
        data.is_by_weight ?? 0
      )
    return this.db
      .prepare(`SELECT ${PRODUCT_FIELDS}, c.name as category_name, s.name as supplier_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                WHERE p.id = ?`)
      .get(result.lastInsertRowid) as Product
  }

  update(id: number, data: UpdateProductDTO): Product {
    const fields: string[] = []
    const params: unknown[] = []

    if (data.barcode !== undefined) { fields.push('barcode = ?'); params.push(data.barcode || null) }
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description || null) }
    if (data.price_usd !== undefined) { fields.push('price_usd = ?'); params.push(data.price_usd) }
    if (data.cost_usd !== undefined) { fields.push('cost_usd = ?'); params.push(data.cost_usd) }
    if (data.category_id !== undefined) { fields.push('category_id = ?'); params.push(data.category_id || null) }
    if (data.supplier_id !== undefined) { fields.push('supplier_id = ?'); params.push(data.supplier_id || null) }
    if (data.stock !== undefined) { fields.push('stock = ?'); params.push(data.stock) }
    if (data.min_stock !== undefined) { fields.push('min_stock = ?'); params.push(data.min_stock) }
    if (data.is_by_weight !== undefined) { fields.push('is_by_weight = ?'); params.push(data.is_by_weight) }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      params.push(id)
      this.db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    }

    return this.db
      .prepare(`SELECT ${PRODUCT_FIELDS}, c.name as category_name, s.name as supplier_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                WHERE p.id = ?`)
      .get(id) as Product
  }

  toggleActive(id: number): void {
    this.db
      .prepare("UPDATE products SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?")
      .run(id)
  }

  // Deletes a product from the inventory. If the product has invoice history,
  // the FK constraint (ON DELETE RESTRICT) prevents removal — in that case we
  // soft-delete (is_active = 0) so historical invoices keep their reference.
  delete(id: number): { hardDeleted: boolean } {
    const refs = this.db
      .prepare('SELECT COUNT(*) as c FROM invoice_items WHERE product_id = ?')
      .get(id) as { c: number }
    if (refs.c > 0) {
      this.db
        .prepare("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .run(id)
      return { hardDeleted: false }
    }
    const product = this.db
      .prepare('SELECT image_path FROM products WHERE id = ?')
      .get(id) as { image_path: string | null } | undefined
    if (product?.image_path && existsSync(product.image_path)) {
      try { unlinkSync(product.image_path) } catch { /* ignore */ }
    }
    this.db.prepare('DELETE FROM products WHERE id = ?').run(id)
    return { hardDeleted: true }
  }

  // Stores the photo inside the database, so it belongs to the shared inventory:
  // an access terminal saving a product writes the photo to the primary PC's
  // database, and every backup/restore of that database carries it along.
  saveImage(productId: number, imageData: string, extension: string): void {
    const base64Data = imageData.replace(/^data:[^;,]*;base64,/, '')
    const mime = mimeFromDataUrl(imageData) ?? mimeFromExtension(extension)
    this.deleteLegacyFile(productId)
    this.db
      .prepare(
        "UPDATE products SET image_blob = ?, image_mime = ?, image_path = NULL, updated_at = datetime('now') WHERE id = ?"
      )
      .run(Buffer.from(base64Data, 'base64'), mime, productId)
  }

  getImage(productId: number): ProductImage | null {
    const row = this.db
      .prepare('SELECT image_blob, image_mime FROM products WHERE id = ?')
      .get(productId) as { image_blob: Buffer | null; image_mime: string | null } | undefined
    if (!row?.image_blob) return null
    return {
      mime: row.image_mime || 'image/png',
      data: Buffer.from(row.image_blob).toString('base64')
    }
  }

  removeImage(productId: number): void {
    this.deleteLegacyFile(productId)
    this.db
      .prepare(
        "UPDATE products SET image_blob = NULL, image_mime = NULL, image_path = NULL, updated_at = datetime('now') WHERE id = ?"
      )
      .run(productId)
  }

  // Photos saved before v1.12 also left a file under userData; drop it when the
  // product's photo is replaced or removed so those files don't pile up.
  private deleteLegacyFile(productId: number): void {
    const product = this.db
      .prepare('SELECT image_path FROM products WHERE id = ?')
      .get(productId) as { image_path: string | null } | undefined
    if (product?.image_path && existsSync(product.image_path)) {
      try { unlinkSync(product.image_path) } catch { /* ignore */ }
    }
  }

  getImagesDir(): string {
    return join(app.getPath('userData'), 'product-images')
  }

  // Categories
  getCategories(): { id: number; name: string; description: string | null }[] {
    return this.db.prepare('SELECT * FROM categories ORDER BY name').all() as {
      id: number
      name: string
      description: string | null
    }[]
  }

  createCategory(name: string): { id: number; name: string } {
    const result = this.db.prepare('INSERT INTO categories (name) VALUES (?)').run(name)
    return { id: Number(result.lastInsertRowid), name }
  }
}
