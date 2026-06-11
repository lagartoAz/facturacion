import type Database from 'better-sqlite3'

export interface Supplier {
  id: number
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
  product_count?: number
}

export interface CreateSupplierDTO {
  name: string
  contact_name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}

export interface UpdateSupplierDTO extends Partial<CreateSupplierDTO> {}

export class SupplierService {
  constructor(private db: Database.Database) {}

  getAll(search?: string): Supplier[] {
    let query = `
      SELECT s.*, COUNT(p.id) as product_count
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (search) {
      query += ' AND (s.name LIKE ? OR s.contact_name LIKE ? OR s.phone LIKE ?)'
      const like = `%${search}%`
      params.push(like, like, like)
    }
    query += ' GROUP BY s.id ORDER BY s.name ASC'
    return this.db.prepare(query).all(...params) as Supplier[]
  }

  getById(id: number): Supplier | undefined {
    return this.db
      .prepare(
        `SELECT s.*, COUNT(p.id) as product_count
         FROM suppliers s LEFT JOIN products p ON p.supplier_id = s.id
         WHERE s.id = ? GROUP BY s.id`
      )
      .get(id) as Supplier | undefined
  }

  create(data: CreateSupplierDTO): Supplier {
    const result = this.db
      .prepare(
        `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.name,
        data.contact_name || null,
        data.phone || null,
        data.email || null,
        data.address || null,
        data.notes || null
      )
    return this.getById(Number(result.lastInsertRowid))!
  }

  update(id: number, data: UpdateSupplierDTO): Supplier {
    const fields: string[] = []
    const params: unknown[] = []
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name) }
    if (data.contact_name !== undefined) { fields.push('contact_name = ?'); params.push(data.contact_name || null) }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone || null) }
    if (data.email !== undefined) { fields.push('email = ?'); params.push(data.email || null) }
    if (data.address !== undefined) { fields.push('address = ?'); params.push(data.address || null) }
    if (data.notes !== undefined) { fields.push('notes = ?'); params.push(data.notes || null) }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now', 'localtime')")
      params.push(id)
      this.db.prepare(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    }
    return this.getById(id)!
  }

  delete(id: number): { unlinked: number } {
    const unlinked = (this.db
      .prepare('SELECT COUNT(*) as n FROM products WHERE supplier_id = ?')
      .get(id) as { n: number }).n
    this.db.prepare('UPDATE products SET supplier_id = NULL WHERE supplier_id = ?').run(id)
    this.db.prepare('DELETE FROM suppliers WHERE id = ?').run(id)
    return { unlinked }
  }
}
