import type Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'

export interface Product {
  id: number
  barcode: string | null
  name: string
  description: string | null
  price_usd: number
  cost_usd: number
  category_id: number | null
  category_name?: string
  stock: number
  min_stock: number
  is_active: number
  is_by_weight: number
  image_path: string | null
  created_at: string
  updated_at: string
}

export interface CreateProductDTO {
  barcode?: string
  name: string
  description?: string
  price_usd: number
  cost_usd?: number
  category_id?: number
  stock?: number
  min_stock?: number
  is_by_weight?: number
}

export interface UpdateProductDTO extends Partial<CreateProductDTO> {}

export interface ProductFilters {
  category_id?: number
  search?: string
  active_only?: boolean
}

export class ProductService {
  constructor(private db: Database.Database) {}

  getAll(filters?: ProductFilters): Product[] {
    let query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
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

    query += ' ORDER BY p.name ASC'
    return this.db.prepare(query).all(...params) as Product[]
  }

  getByBarcode(barcode: string): Product | undefined {
    return this.db
      .prepare(
        `SELECT p.*, c.name as category_name
         FROM products p LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.barcode = ? AND p.is_active = 1`
      )
      .get(barcode) as Product | undefined
  }

  search(query: string): Product[] {
    const s = `%${query}%`
    return this.db
      .prepare(
        `SELECT p.*, c.name as category_name
         FROM products p LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_active = 1 AND (p.name LIKE ? OR p.barcode LIKE ?)
         ORDER BY p.name ASC LIMIT 20`
      )
      .all(s, s) as Product[]
  }

  create(data: CreateProductDTO): Product {
    const result = this.db
      .prepare(
        `INSERT INTO products (barcode, name, description, price_usd, cost_usd, category_id, stock, min_stock, is_by_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.barcode || null,
        data.name,
        data.description || null,
        data.price_usd,
        data.cost_usd ?? 0,
        data.category_id || null,
        data.stock ?? 0,
        data.min_stock ?? 0,
        data.is_by_weight ?? 0
      )
    return this.db
      .prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?')
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
    if (data.stock !== undefined) { fields.push('stock = ?'); params.push(data.stock) }
    if (data.min_stock !== undefined) { fields.push('min_stock = ?'); params.push(data.min_stock) }
    if (data.is_by_weight !== undefined) { fields.push('is_by_weight = ?'); params.push(data.is_by_weight) }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      params.push(id)
      this.db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    }

    return this.db
      .prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?')
      .get(id) as Product
  }

  toggleActive(id: number): void {
    this.db
      .prepare("UPDATE products SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?")
      .run(id)
  }

  saveImage(productId: number, imageData: string, extension: string): string {
    const imagesDir = join(app.getPath('userData'), 'product-images')
    if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })

    // Remove old image if exists
    const product = this.db.prepare('SELECT image_path FROM products WHERE id = ?').get(productId) as { image_path: string | null } | undefined
    if (product?.image_path && existsSync(product.image_path)) {
      try { unlinkSync(product.image_path) } catch { /* ignore */ }
    }

    // Save new image
    const fileName = `product_${productId}_${Date.now()}.${extension}`
    const filePath = join(imagesDir, fileName)
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    writeFileSync(filePath, Buffer.from(base64Data, 'base64'))

    // Update DB
    this.db.prepare("UPDATE products SET image_path = ?, updated_at = datetime('now') WHERE id = ?").run(filePath, productId)

    return filePath
  }

  removeImage(productId: number): void {
    const product = this.db.prepare('SELECT image_path FROM products WHERE id = ?').get(productId) as { image_path: string | null } | undefined
    if (product?.image_path && existsSync(product.image_path)) {
      try { unlinkSync(product.image_path) } catch { /* ignore */ }
    }
    this.db.prepare("UPDATE products SET image_path = NULL, updated_at = datetime('now') WHERE id = ?").run(productId)
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
