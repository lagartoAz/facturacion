// Structured receipt model shared by the HTML renderer (desktop) and the ESC/POS
// encoder (Android thermal printing). Amounts are kept as pre-formatted strings
// so they match exactly what the rest of the app already formats.

export interface ReceiptItem {
  name: string
  qty: string // e.g. "2" or "1.5" (by weight)
  unitPrice: string // pre-formatted, e.g. "1.50"
  total: string // pre-formatted, e.g. "3.00"
}

export interface ReceiptLine {
  label: string
  amount: string
}

export interface ReceiptData {
  title?: string // business/header title (receipt_title)
  invoiceNumber: string
  dateText: string // already formatted "dd/MM/yyyy HH:mm"
  customerName?: string
  items: ReceiptItem[]
  totalText: string // pre-formatted grand total
  footerTitle?: string // e.g. "Compra en Mi Tienda"
  paymentLines: ReceiptLine[] // currency breakdown / amount paid
  thanks?: string // e.g. "Gracias por su compra!"
}
