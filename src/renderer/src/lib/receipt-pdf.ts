import type { ReceiptData } from '../../../shared/receipt'

// Builds a narrow 58mm receipt PDF (the same layout that gets printed) and
// returns it as a base64 string (without the data: prefix). Used to share the
// receipt to WhatsApp on Android. Courier (monospace) keeps columns aligned and
// makes character-based truncation reliable.
const W = 58 // page width (mm)
const M = 3 // side margin (mm)
const LH = 4.5 // line height (mm)
const NAME_MAX = 26 // max chars for a product name at 8pt on this width

interface Row {
  left?: string
  right?: string
  center?: string
  bold?: boolean
  size?: number
  divider?: boolean
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export async function buildReceiptPdfBase64(r: ReceiptData): Promise<string> {
  // jsPDF (and its html2canvas/dompurify deps) is heavy, so load it only when a
  // receipt is actually shared instead of bloating the initial bundle.
  const { jsPDF } = await import('jspdf')
  const rows: Row[] = []
  if (r.title) rows.push({ center: r.title, bold: true, size: 12 })
  rows.push({ center: r.invoiceNumber, bold: true, size: 11 })
  rows.push({ center: r.dateText, size: 8 })
  if (r.customerName) rows.push({ center: r.customerName, size: 8 })
  rows.push({ divider: true })
  rows.push({ left: 'Producto', right: 'Total', bold: true, size: 8 })
  for (const it of r.items) {
    rows.push({ left: trunc(it.name, NAME_MAX), size: 8 })
    rows.push({ left: `  ${it.qty} x ${it.unitPrice}`, right: it.total, size: 8 })
  }
  rows.push({ divider: true })
  rows.push({ left: 'TOTAL', right: r.totalText, bold: true, size: 11 })
  rows.push({ divider: true })
  if (r.footerTitle) rows.push({ center: r.footerTitle, size: 8 })
  for (const l of r.paymentLines) {
    if (l.label) rows.push({ center: `${l.label}: ${l.amount}`, size: 8 })
    else rows.push({ center: l.amount, bold: true, size: 9 })
  }
  if (r.thanks) rows.push({ center: r.thanks, size: 8 })

  const height = M + 3 + rows.length * LH + M
  const doc = new jsPDF({ unit: 'mm', format: [W, height], compress: true })
  doc.setFont('courier', 'normal')

  let y = M + 3
  for (const row of rows) {
    if (row.divider) {
      doc.setLineWidth(0.2)
      doc.line(M, y - 2, W - M, y - 2)
      y += LH
      continue
    }
    doc.setFontSize(row.size ?? 8)
    doc.setFont('courier', row.bold ? 'bold' : 'normal')
    if (row.center !== undefined) {
      doc.text(row.center, W / 2, y, { align: 'center' })
    } else {
      if (row.left !== undefined) doc.text(row.left, M, y)
      if (row.right !== undefined) doc.text(row.right, W - M, y, { align: 'right' })
    }
    y += LH
  }

  return doc.output('datauristring').split(',')[1]
}
