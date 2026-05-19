import type Database from 'better-sqlite3'

export interface ImportResult {
  added: number
  updated: number
  errors: { row: number; reason: string }[]
}

export class ImportService {
  constructor(private db: Database.Database) {}

  importInventoryCsv(text: string): ImportResult {
    const rows = parseCsv(text)
    const records = rowsToRecords(rows)
    return this.importInventoryRecords(records)
  }

  private importInventoryRecords(records: Record<string, string>[]): ImportResult {
    const result: ImportResult = { added: 0, updated: 0, errors: [] }

    const byBarcode = this.db.prepare('SELECT id FROM products WHERE barcode = ?')
    const byName = this.db.prepare('SELECT id FROM products WHERE name = ?')
    const findCategory = this.db.prepare('SELECT id FROM categories WHERE name = ?')
    const insertCategory = this.db.prepare('INSERT INTO categories (name) VALUES (?)')
    const insertProduct = this.db.prepare(
      `INSERT INTO products
         (barcode, name, description, category_id, price_usd, cost_usd,
          stock, min_stock, is_active, is_by_weight, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    const updateProduct = this.db.prepare(
      `UPDATE products SET barcode = ?, name = ?, description = ?, category_id = ?,
         price_usd = ?, cost_usd = ?, stock = ?, min_stock = ?, is_active = ?,
         is_by_weight = ?, updated_at = datetime('now')
       WHERE id = ?`
    )

    const tx = this.db.transaction(() => {
      records.forEach((row, idx) => {
        const rowNum = idx + 2 // header is row 1
        try {
          const name = (row.nombre ?? '').trim()
          if (!name) {
            result.errors.push({ row: rowNum, reason: 'Nombre vacio' })
            return
          }
          const price = parseFloat(row.precio_usd ?? '')
          if (isNaN(price) || price < 0) {
            result.errors.push({ row: rowNum, reason: 'Precio USD invalido' })
            return
          }

          const barcode = (row.codigo_de_barras ?? '').trim() || null
          const description = (row.descripcion ?? '').trim() || null
          const cost = numOrDefault(row.costo_usd, 0)
          const stock = Math.trunc(numOrDefault(row.stock, 0))
          const minStock = Math.trunc(numOrDefault(row.stock_minimo, 0))
          const active = parseYesNo(row.activo, true)
          const byWeight = parseYesNo(row.por_peso, false)

          // Resolve / auto-create category
          let categoryId: number | null = null
          const categoryName = (row.categoria ?? '').trim()
          if (categoryName) {
            const existing = findCategory.get(categoryName) as { id: number } | undefined
            categoryId = existing
              ? existing.id
              : Number(insertCategory.run(categoryName).lastInsertRowid)
          }

          // Match existing product: by barcode first, then by name
          let existingId: number | undefined
          if (barcode) {
            existingId = (byBarcode.get(barcode) as { id: number } | undefined)?.id
          }
          if (!existingId) {
            existingId = (byName.get(name) as { id: number } | undefined)?.id
          }

          if (existingId) {
            updateProduct.run(
              barcode,
              name,
              description,
              categoryId,
              price,
              cost,
              stock,
              minStock,
              active ? 1 : 0,
              byWeight ? 1 : 0,
              existingId
            )
            result.updated++
          } else {
            insertProduct.run(
              barcode,
              name,
              description,
              categoryId,
              price,
              cost,
              stock,
              minStock,
              active ? 1 : 0,
              byWeight ? 1 : 0
            )
            result.added++
          }
        } catch (err) {
          result.errors.push({ row: rowNum, reason: (err as Error).message })
        }
      })
    })

    tx()
    return result
  }
}

function parseCsv(text: string): string[][] {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  // Auto-detect separator: prefer ; (Excel ES), fallback to ,
  const firstNewline = text.search(/[\r\n]/)
  const firstLine = firstNewline > 0 ? text.slice(0, firstNewline) : text
  const separator = firstLine.includes(';') ? ';' : ','

  const result: string[][] = []
  let line: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true
    } else if (ch === separator) {
      line.push(cell)
      cell = ''
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      line.push(cell)
      cell = ''
      if (line.some((c) => c !== '')) result.push(line)
      line = []
    } else {
      cell += ch
    }
  }
  if (cell !== '' || line.length > 0) {
    line.push(cell)
    if (line.some((c) => c !== '')) result.push(line)
  }
  return result
}

function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return []
  const headers = rows[0].map(normalizeKey)
  return rows.slice(1).map((row) => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      rec[h] = row[i] ?? ''
    })
    return rec
  })
}

function parseYesNo(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  const v = value.trim().toLowerCase()
  if (['si', 'sí', 'yes', '1', 'true', 'verdadero', 'x'].includes(v)) return true
  if (['no', '0', 'false', 'falso', ''].includes(v)) return false
  return fallback
}

function numOrDefault(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = parseFloat(value.replace(',', '.'))
  return isNaN(n) ? fallback : n
}
