export interface InvoiceTickets {
  invoiceNumber: string
  customerName: string | null
  raffleName: string | null
  count: number
  codes: string[]
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}

// Builds a 58mm print document with one slip per raffle ticket, separated by a
// cut line, to drop in the physical pot.
function buildTicketsHtml(t: InvoiceTickets, store: string): string {
  const slips = t.codes
    .map(
      (code) => `
      <div class="ticket">
        ${store ? `<div class="store">${esc(store)}</div>` : ''}
        <div class="title">RIFA</div>
        ${t.raffleName ? `<div class="raffle">${esc(t.raffleName)}</div>` : ''}
        <div class="name">${esc(t.customerName ?? '')}</div>
        <div class="code">N° ${esc(code)}</div>
        <div class="cut">- - - - - - - - - - - - - - -</div>
      </div>`
    )
    .join('')
  return `
    <html><head><title>Tickets ${esc(t.invoiceNumber)}</title>
    <style>
      @page { size: 58mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { font-family: 'Courier New', Courier, monospace; color:#000; width:58mm; margin:0; padding:2mm; }
      .ticket { text-align:center; padding:4px 0; }
      .store { font-size:13px; font-weight:700; }
      .title { font-size:16px; font-weight:900; letter-spacing:2px; margin-top:2px; }
      .raffle { font-size:13px; font-weight:700; }
      .name { font-size:14px; margin-top:4px; }
      .code { font-size:15px; font-weight:900; margin-top:2px; }
      .cut { margin-top:6px; color:#555; font-size:11px; }
    </style></head><body>${slips}</body></html>`
}

// Fetches an invoice's raffle tickets, prints them, and records them as printed.
export async function printRaffleTickets(
  invoiceId: number
): Promise<{ ok: boolean; count: number; error?: string }> {
  const t = (await window.api.getInvoiceTickets(invoiceId)) as InvoiceTickets
  if (!t || t.count === 0) {
    return { ok: false, count: 0, error: 'Esta factura no genera tickets de rifa' }
  }
  const settings = (await window.api.getAllSettings()) as Record<string, string>
  const store = (settings.receipt_title || '').trim()
  const res = (await window.api.printReceipt(buildTicketsHtml(t, store))) as {
    success: boolean
    error?: string
  }
  if (res && res.success === false) return { ok: false, count: t.count, error: res.error }
  await window.api.markTicketsPrinted(invoiceId)
  return { ok: true, count: t.count }
}

// Prints the tickets of a manual / points-redeemed batch (no invoice) and
// records them as printed. Mirrors printRaffleTickets but keyed by ledger id.
export async function printManualTickets(
  ledgerId: number
): Promise<{ ok: boolean; count: number; error?: string }> {
  const t = (await window.api.getManualTicketPrintData(ledgerId)) as InvoiceTickets
  if (!t || t.count === 0) {
    return { ok: false, count: 0, error: 'No hay tickets para imprimir' }
  }
  const settings = (await window.api.getAllSettings()) as Record<string, string>
  const store = (settings.receipt_title || '').trim()
  const res = (await window.api.printReceipt(buildTicketsHtml(t, store))) as {
    success: boolean
    error?: string
  }
  if (res && res.success === false) return { ok: false, count: t.count, error: res.error }
  await window.api.markManualTicketsPrinted(ledgerId)
  return { ok: true, count: t.count }
}
