import type Database from 'better-sqlite3'

interface ProductRow {
  id: number
  barcode: string | null
  name: string
  description: string | null
  category: string | null
  price_usd: number
  cost_usd: number | null
  stock: number
  min_stock: number
  is_active: number
  is_by_weight: number
  created_at: string
  updated_at: string
}

interface InvoiceRow {
  invoice_number: string
  created_at: string
  customer: string | null
  items_count: number
  subtotal_usd: number
  total_usd: number
  rate_ves: number | null
  total_ves: number | null
  rate_cop: number | null
  total_cop: number | null
  payment_method: string
  cash_currency: string | null
  status: string
  notes: string | null
}

export class ExportService {
  constructor(private db: Database.Database) {}

  inventoryCsv(): string {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.barcode, p.name, p.description, c.name AS category,
                p.price_usd, p.cost_usd, p.stock, p.min_stock,
                p.is_active, p.is_by_weight, p.created_at, p.updated_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         ORDER BY p.name`
      )
      .all() as ProductRow[]

    const headers = [
      'ID',
      'Codigo de barras',
      'Nombre',
      'Descripcion',
      'Categoria',
      'Precio USD',
      'Costo USD',
      'Stock',
      'Stock minimo',
      'Activo',
      'Por peso',
      'Creado',
      'Actualizado'
    ]
    const body = rows.map((p) => [
      p.id,
      p.barcode ?? '',
      p.name,
      p.description ?? '',
      p.category ?? '',
      p.price_usd,
      p.cost_usd ?? 0,
      p.stock,
      p.min_stock,
      p.is_active ? 'Si' : 'No',
      p.is_by_weight ? 'Si' : 'No',
      p.created_at,
      p.updated_at
    ])
    return toCsv(headers, body)
  }

  invoicesCsv(): string {
    const rows = this.db
      .prepare(
        `SELECT i.invoice_number, i.created_at, c.name AS customer,
                (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS items_count,
                i.subtotal_usd, i.total_usd,
                i.rate_ves, i.total_ves, i.rate_cop, i.total_cop,
                i.payment_method, i.cash_currency, i.status, i.notes
         FROM invoices i
         LEFT JOIN customers c ON i.customer_id = c.id
         ORDER BY i.created_at DESC`
      )
      .all() as InvoiceRow[]

    const headers = [
      'Numero',
      'Fecha',
      'Cliente',
      'Items',
      'Subtotal USD',
      'Total USD',
      'Tasa VES',
      'Total VES',
      'Tasa COP',
      'Total COP',
      'Metodo de pago',
      'Moneda efectivo',
      'Estado',
      'Notas'
    ]
    const body = rows.map((i) => [
      i.invoice_number,
      i.created_at,
      i.customer ?? 'Consumidor Final',
      i.items_count,
      i.subtotal_usd,
      i.total_usd,
      i.rate_ves ?? '',
      i.total_ves ?? '',
      i.rate_cop ?? '',
      i.total_cop ?? '',
      i.payment_method,
      i.cash_currency ?? '',
      i.status,
      i.notes ?? ''
    ])
    return toCsv(headers, body)
  }
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // UTF-8 BOM so Excel auto-detects encoding for accents.
  // Semicolon separator is what Excel in Spanish locale expects.
  const allRows = [headers, ...rows]
  return '﻿' + allRows.map((r) => r.map(csvCell).join(';')).join('\r\n')
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[;\r\n"]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
