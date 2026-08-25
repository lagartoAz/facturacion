import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  formatUSD,
  formatVES,
  formatCOP,
  getPaidCurrency,
  formatAmountIn,
  plainAmountIn
} from '@/lib/currency'
import { Eye, Ban, Printer, FileText, ClipboardList, ShoppingCart, Trash2, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { format } from 'date-fns'
import type { ReceiptData } from '../../../shared/receipt'
import { shareReceiptToWhatsApp } from '@/lib/whatsapp'
import { isMobileApp } from '@/lib/product-image'

interface Invoice {
  id: number
  invoice_number: string
  customer_id: number | null
  customer_name: string | null
  subtotal_usd: number
  tax_percent: number
  tax_amount_usd: number
  total_usd: number
  rate_ves: number | null
  rate_cop: number | null
  total_ves: number | null
  total_cop: number | null
  payment_method: string
  cash_currency: string | null
  payment_amount_ves: number | null
  payment_amount_cop: number | null
  status: string
  created_at: string
  items?: InvoiceItem[]
  payments?: { method: string; amount: number }[]
}

interface InvoiceItem {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface Quote {
  id: number
  quote_number: string
  customer_id: number | null
  customer_name: string | null
  subtotal_usd: number
  total_usd: number
  rate_ves: number | null
  rate_cop: number | null
  total_ves: number | null
  total_cop: number | null
  notes: string | null
  created_at: string
  items?: InvoiceItem[]
}

type Tab = 'invoices' | 'quotes'

const PAGE_SIZE = 20

export default function InvoicesPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('invoices')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoicePage, setInvoicePage] = useState(1)
  const [invoiceTotal, setInvoiceTotal] = useState(0)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [quoteDetailOpen, setQuoteDetailOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [notification, setNotification] = useState('')

  const loadInvoices = useCallback(async () => {
    const filters = {
      from: dateFrom || undefined,
      to: dateTo || undefined,
      page: invoicePage,
      limit: PAGE_SIZE
    }
    const [data, total] = await Promise.all([
      window.api.getInvoices(filters),
      window.api.countInvoices({ from: dateFrom || undefined, to: dateTo || undefined })
    ])
    setInvoices(data)
    setInvoiceTotal(total)
  }, [dateFrom, dateTo, invoicePage])

  const loadQuotes = useCallback(async () => {
    setQuotes(
      await window.api.getQuotes({
        from: dateFrom || undefined,
        to: dateTo || undefined
      })
    )
  }, [dateFrom, dateTo])

  useEffect(() => {
    setInvoicePage(1)
  }, [dateFrom, dateTo, tab])

  useEffect(() => {
    if (tab === 'invoices') void loadInvoices()
    else void loadQuotes()
  }, [tab, loadInvoices, loadQuotes])

  function showNotification(msg: string): void {
    setNotification(msg)
    setTimeout(() => setNotification(''), 3000)
  }

  async function viewQuote(id: number): Promise<void> {
    const q = await window.api.getQuoteById(id)
    setSelectedQuote(q)
    setQuoteDetailOpen(true)
  }

  async function deleteQuote(id: number): Promise<void> {
    if (!confirm('Eliminar este presupuesto? Esta accion no se puede deshacer.')) return
    await window.api.deleteQuote(id)
    setQuoteDetailOpen(false)
    void loadQuotes()
    showNotification('Presupuesto eliminado')
  }

  async function convertQuoteToCart(id: number): Promise<void> {
    try {
      await window.api.quoteToCart(id)
      setQuoteDetailOpen(false)
      showNotification(
        'Carrito preparado. Abre el Punto de Venta y restauralo desde "Carritos Pendientes".'
      )
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  async function printQuote(): Promise<void> {
    if (!selectedQuote) return
    const q = selectedQuote
    const itemsHtml = (q.items ?? [])
      .map(
        (item) => `
      <tr>
        <td style="padding:2px 0">${item.product_name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">$${item.unit_price.toFixed(2)}</td>
        <td style="text-align:right">$${item.subtotal.toFixed(2)}</td>
      </tr>`
      )
      .join('')
    const settings = await window.api.getAllSettings()
    const fs = parseInt(settings.receipt_font_size) || 14
    const fw = settings.receipt_font_weight || '700'
    const rTitle = (settings.receipt_title || '').trim()
    const rm = parseInt(settings.receipt_margin) || 4

    const html = `
      <html><head><title>${q.quote_number}</title>
      <style>
        @page { size: 58mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: ${fs}px; font-weight: ${fw}; color: #000; width: 58mm; margin: 0; padding: 3mm ${rm}mm; }
        table { width: 100%; border-collapse: collapse; }
        td, th { font-size: ${fs - 1}px; font-weight: ${fw}; padding: 2px 0; }
        .divider { border-top: 1.5px solid #000; margin: 5px 0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: 900; }
        .label { font-size: ${fs - 1}px; font-weight: ${fw}; text-transform: uppercase; }
      </style></head><body>
        ${rTitle ? `<div class="center bold" style="font-size:${fs + 3}px">${rTitle}</div>` : ''}
        <div class="center bold" style="font-size:${fs + 2}px">PRESUPUESTO</div>
        <div class="center bold">${q.quote_number}</div>
        <div class="center">${format(new Date(q.created_at), 'dd/MM/yyyy HH:mm')}</div>
        ${q.customer_name ? `<div class="center">${q.customer_name}</div>` : ''}
        <div class="divider"></div>
        <table>
          <tr><th style="text-align:left">Producto</th><th>Cant</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr>
          ${itemsHtml}
        </table>
        <div class="divider"></div>
        <div class="right bold" style="font-size:${fs + 1}px">TOTAL: $${q.total_usd.toFixed(2)}</div>
        ${q.total_ves ? `<div class="right">Bs. ${q.total_ves.toFixed(2)} (Tasa: ${q.rate_ves?.toFixed(2)})</div>` : ''}
        ${q.total_cop ? `<div class="right">COP ${Math.round(q.total_cop)} (Tasa: ${q.rate_cop?.toFixed(0)})</div>` : ''}
        ${q.notes ? `<div class="divider"></div><div>${q.notes}</div>` : ''}
        <div class="divider"></div>
        <div class="center label">No es factura. Valido como presupuesto.</div>
      </body></html>
    `
    const result = await window.api.printReceipt(html)
    if (!result.success && result.error) {
      showNotification(`Error al imprimir: ${result.error}`)
    }
  }

  async function shareQuoteWhatsApp(): Promise<void> {
    if (!selectedQuote) return
    const q = selectedQuote
    const settings = await window.api.getAllSettings()
    const rTitle = (settings.receipt_title || '').trim()
    const lines: { label: string; amount: string }[] = []
    if (q.total_ves) lines.push({ label: 'Bs.', amount: q.total_ves.toFixed(2) })
    if (q.total_cop) lines.push({ label: 'COP', amount: String(Math.round(q.total_cop)) })
    const receipt: ReceiptData = {
      title: rTitle || undefined,
      invoiceNumber: `PRESUPUESTO ${q.quote_number}`,
      dateText: format(new Date(q.created_at), 'dd/MM/yyyy HH:mm'),
      customerName: q.customer_name || undefined,
      items: (q.items ?? []).map((item) => ({
        name: item.product_name,
        qty: String(item.quantity),
        unitPrice: `$${item.unit_price.toFixed(2)}`,
        total: `$${item.subtotal.toFixed(2)}`
      })),
      totalText: `$${q.total_usd.toFixed(2)}`,
      footerTitle: 'No es factura. Valido como presupuesto.',
      paymentLines: lines,
      thanks: undefined
    }
    const res = await shareReceiptToWhatsApp(receipt, `Presupuesto ${q.quote_number}`)
    if (!res.ok && res.error) showNotification(`Error al compartir: ${res.error}`)
  }

  async function shareInvoiceWhatsApp(): Promise<void> {
    if (!selectedInvoice) return
    const inv = selectedInvoice
    const paid = getPaidCurrency(inv)
    const fmt = (usd: number): string => plainAmountIn(usd, paid, inv.rate_ves, inv.rate_cop)
    const settings = await window.api.getAllSettings()
    const rTitle = (settings.receipt_title || '').trim()
    const methodLabel =
      inv.payment_method === 'mixed'
        ? 'Mixto'
        : paymentLabels[inv.payment_method] || inv.payment_method
    const receipt: ReceiptData = {
      title: rTitle || undefined,
      invoiceNumber: inv.invoice_number,
      dateText: format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm'),
      customerName: inv.customer_name || undefined,
      items: (inv.items ?? []).map((item) => ({
        name: item.product_name,
        qty: String(item.quantity),
        unitPrice: fmt(item.unit_price),
        total: fmt(item.subtotal)
      })),
      totalText: fmt(inv.total_usd),
      footerTitle: `Pago: ${methodLabel}`,
      paymentLines: [],
      thanks: 'Gracias por su compra!'
    }
    const res = await shareReceiptToWhatsApp(receipt, `Factura ${inv.invoice_number}`)
    if (!res.ok && res.error) showNotification(`Error al compartir: ${res.error}`)
  }

  async function viewInvoice(id: number): Promise<void> {
    const inv = await window.api.getInvoiceById(id)
    setSelectedInvoice(inv)
    setDetailOpen(true)
  }

  async function voidInvoice(id: number): Promise<void> {
    if (confirm('Estas seguro de anular esta factura? Se restaurara el stock.')) {
      await window.api.voidInvoice(id)
      setDetailOpen(false)
      loadInvoices()
    }
  }

  async function printInvoice(): Promise<void> {
    if (!selectedInvoice) return
    const inv = selectedInvoice
    const paid = getPaidCurrency(inv)
    const fmt = (usd: number): string => plainAmountIn(usd, paid, inv.rate_ves, inv.rate_cop)
    const itemsHtml = inv.items
      ?.map(
        (item) => `
      <tr>
        <td style="padding:2px 0">${item.product_name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${fmt(item.unit_price)}</td>
        <td style="text-align:right">${fmt(item.subtotal)}</td>
      </tr>`
      )
      .join('') ?? ''
    const totalDisplay = fmt(inv.total_usd)

    const settings = await window.api.getAllSettings()
    const fs = parseInt(settings.receipt_font_size) || 14
    const fw = settings.receipt_font_weight || '700'
    const rTitle = (settings.receipt_title || '').trim()
    const rm = parseInt(settings.receipt_margin) || 4

    const html = `
      <html><head><title>${inv.invoice_number}</title>
      <style>
        @page { size: 58mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: ${fs}px; font-weight: ${fw}; color: #000; width: 58mm; margin: 0; padding: 3mm ${rm}mm; }
        table { width: 100%; border-collapse: collapse; }
        td, th { font-size: ${fs - 1}px; font-weight: ${fw}; padding: 2px 0; }
        .divider { border-top: 1.5px solid #000; margin: 5px 0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: 900; }
      </style></head><body>
        ${rTitle ? `<div class="center bold" style="font-size:${fs + 3}px">${rTitle}</div>` : ''}
        <div class="center bold" style="font-size:${fs + 2}px">${inv.invoice_number}</div>
        <div class="center">${format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</div>
        ${inv.customer_name ? `<div class="center">${inv.customer_name}</div>` : ''}
        <div class="divider"></div>
        <table>
          <tr><th style="text-align:left">Producto</th><th>Cant</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr>
          ${itemsHtml}
        </table>
        <div class="divider"></div>
        <div class="right bold" style="font-size:${fs + 1}px">TOTAL: ${totalDisplay}</div>
        <div class="divider"></div>
        <div class="center">Pago: ${inv.payment_method === 'mixed' && inv.payments ? 'Mixto - ' + inv.payments.map((p: { method: string; amount: number }) => `${p.method}: $${p.amount.toFixed(2)}`).join(', ') : (paymentLabels[inv.payment_method] || inv.payment_method)}</div>
        <div class="center" style="margin-top:8px">Gracias por su compra!</div>
      </body></html>
    `

    const result = await window.api.printReceipt(html)
    if (!result.success && result.error) {
      showNotification(`Error al imprimir: ${result.error}`)
    }
  }

  const paymentLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    mixed: 'Mixto'
  }

  return (
    <div className="p-4 landscape:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {tab === 'invoices' ? 'Facturas' : 'Presupuestos'}
        </h1>
        <div className="flex gap-1 rounded-lg border p-1">
          <Button
            variant={tab === 'invoices' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('invoices')}
          >
            <FileText className="mr-2 h-4 w-4" />
            Facturas
          </Button>
          <Button
            variant={tab === 'quotes' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('quotes')}
          >
            <ClipboardList className="mr-2 h-4 w-4" />
            Presupuestos
          </Button>
        </div>
      </div>

      <div className="flex gap-4 items-end">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Desde</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Hasta</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
        <Button variant="outline" onClick={() => { setDateFrom(''); setDateTo('') }}>
          Limpiar
        </Button>
      </div>

      {tab === 'invoices' && (
        <>
          <div className="border rounded-lg overflow-x-auto hidden landscape:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Factura</th>
                  <th className="text-left p-3 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Cliente</th>
                  <th className="text-right p-3 font-medium">Total USD</th>
                  <th className="text-center p-3 font-medium">Pago</th>
                  <th className="text-center p-3 font-medium">Estado</th>
                  <th className="text-center p-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="p-3">{format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="p-3">{inv.customer_name || 'Consumidor Final'}</td>
                    <td className="p-3 text-right font-semibold">{formatUSD(inv.total_usd)}</td>
                    <td className="p-3 text-center">{paymentLabels[inv.payment_method] || inv.payment_method}</td>
                    <td className="p-3 text-center">
                      <Badge variant={inv.status === 'completed' ? 'default' : 'destructive'}>
                        {inv.status === 'completed' ? 'Completada' : 'Anulada'}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Button variant="ghost" size="icon" onClick={() => viewInvoice(inv.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No hay facturas en el periodo seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="landscape:hidden space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-medium font-mono text-xs">{inv.invoice_number}</span>
                  <span className="font-semibold">{formatUSD(inv.total_usd)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium text-foreground">{format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium text-foreground">{inv.customer_name || 'Consumidor Final'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Pago</span>
                  <span className="font-medium text-foreground">{paymentLabels[inv.payment_method] || inv.payment_method}</span>
                </div>
                <div className="flex justify-between text-xs items-center">
                  <span className="text-muted-foreground">Estado</span>
                  <Badge variant={inv.status === 'completed' ? 'default' : 'destructive'}>
                    {inv.status === 'completed' ? 'Completada' : 'Anulada'}
                  </Badge>
                </div>
                <div className="flex justify-end gap-1 pt-1 border-t">
                  <Button variant="ghost" size="icon" onClick={() => viewInvoice(inv.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {invoices.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No hay facturas en el periodo seleccionado.
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'invoices' && invoiceTotal > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Mostrando {Math.min((invoicePage - 1) * PAGE_SIZE + 1, invoiceTotal)}–{Math.min(invoicePage * PAGE_SIZE, invoiceTotal)} de {invoiceTotal} facturas
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setInvoicePage((p) => p - 1)}
              disabled={invoicePage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 font-medium">
              {invoicePage} / {Math.ceil(invoiceTotal / PAGE_SIZE)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setInvoicePage((p) => p + 1)}
              disabled={invoicePage * PAGE_SIZE >= invoiceTotal}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {tab === 'quotes' && (
        <>
          <div className="border rounded-lg overflow-x-auto hidden landscape:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Presupuesto</th>
                  <th className="text-left p-3 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Cliente</th>
                  <th className="text-right p-3 font-medium">Total USD</th>
                  <th className="text-center p-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{q.quote_number}</td>
                    <td className="p-3">{format(new Date(q.created_at), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="p-3">{q.customer_name || 'Sin cliente'}</td>
                    <td className="p-3 text-right font-semibold">{formatUSD(q.total_usd)}</td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalle"
                          onClick={() => viewQuote(q.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Pasar al carrito"
                          onClick={() => convertQuoteToCart(q.id)}
                        >
                          <ShoppingCart className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Eliminar"
                          onClick={() => deleteQuote(q.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {quotes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No hay presupuestos en el periodo seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="landscape:hidden space-y-2">
            {quotes.map((q) => (
              <div key={q.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-medium font-mono text-xs">{q.quote_number}</span>
                  <span className="font-semibold">{formatUSD(q.total_usd)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium text-foreground">{format(new Date(q.created_at), 'dd/MM/yyyy HH:mm')}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium text-foreground">{q.customer_name || 'Sin cliente'}</span>
                </div>
                <div className="flex justify-end gap-1 pt-1 border-t">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Ver detalle"
                    onClick={() => viewQuote(q.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Pasar al carrito"
                    onClick={() => convertQuoteToCart(q.id)}
                  >
                    <ShoppingCart className="h-4 w-4 text-blue-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Eliminar"
                    onClick={() => deleteQuote(q.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
            {quotes.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No hay presupuestos en el periodo seleccionado.
              </div>
            )}
          </div>
        </>
      )}

      {/* Invoice Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Factura {selectedInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 text-sm gap-2">
                <div>
                  <span className="text-muted-foreground">Fecha:</span>{' '}
                  {format(new Date(selectedInvoice.created_at), 'dd/MM/yyyy HH:mm')}
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente:</span>{' '}
                  {selectedInvoice.customer_name || 'Consumidor Final'}
                </div>
                <div>
                  <span className="text-muted-foreground">Pago:</span>{' '}
                  {paymentLabels[selectedInvoice.payment_method] || selectedInvoice.payment_method}
                  {selectedInvoice.payment_method === 'mixed' && selectedInvoice.payments && (
                    <div className="mt-1 space-y-0.5">
                      {selectedInvoice.payments.map((p: { method: string; amount: number }, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground">
                          {paymentLabels[p.method] || p.method}: {formatUSD(p.amount)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Badge variant={selectedInvoice.status === 'completed' ? 'default' : 'destructive'}>
                    {selectedInvoice.status === 'completed' ? 'Completada' : 'Anulada'}
                  </Badge>
                </div>
              </div>

              <div className="border rounded overflow-x-auto hidden landscape:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Producto</th>
                      <th className="text-center p-2 font-medium">Cant</th>
                      <th className="text-right p-2 font-medium">P.U.</th>
                      <th className="text-right p-2 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items?.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{item.product_name}</td>
                        <td className="p-2 text-center">{item.quantity}</td>
                        <td className="p-2 text-right">{formatUSD(item.unit_price)}</td>
                        <td className="p-2 text-right">{formatUSD(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="landscape:hidden space-y-2">
                {selectedInvoice.items?.map((item, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium">{item.product_name}</span>
                      <span className="font-semibold">{formatUSD(item.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Cant</span>
                      <span className="font-medium text-foreground">{item.quantity}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">P.U.</span>
                      <span className="font-medium text-foreground">{formatUSD(item.unit_price)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              {(() => {
                const paid = getPaidCurrency(selectedInvoice)
                const paidLabel =
                  paid === 'VES' ? 'Total Bs.' : paid === 'COP' ? 'Total COP' : 'Total USD'
                const paidAmount = formatAmountIn(
                  selectedInvoice.total_usd,
                  paid,
                  selectedInvoice.rate_ves,
                  selectedInvoice.rate_cop
                )
                return (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between font-bold text-base">
                      <span>{paidLabel}</span>
                      <span>{paidAmount}</span>
                    </div>
                    {paid !== 'USD' && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total USD</span>
                        <span>{formatUSD(selectedInvoice.total_usd)}</span>
                      </div>
                    )}
                    {paid !== 'VES' && selectedInvoice.total_ves && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total VES (Tasa: {selectedInvoice.rate_ves?.toFixed(2)})</span>
                        <span>{formatVES(selectedInvoice.total_ves)}</span>
                      </div>
                    )}
                    {paid !== 'COP' && selectedInvoice.total_cop && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total COP (Tasa: {selectedInvoice.rate_cop?.toFixed(0)})</span>
                        <span>{formatCOP(selectedInvoice.total_cop)}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              <div className="flex flex-wrap gap-2 justify-end">
                {isMobileApp() && (
                  <Button
                    onClick={shareInvoiceWhatsApp}
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    WhatsApp
                  </Button>
                )}
                <Button variant="outline" onClick={printInvoice}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>
                {selectedInvoice.status === 'completed' && (
                  <Button variant="destructive" onClick={() => voidInvoice(selectedInvoice.id)}>
                    <Ban className="mr-2 h-4 w-4" />
                    Anular
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quote Detail Dialog */}
      <Dialog open={quoteDetailOpen} onOpenChange={setQuoteDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Presupuesto {selectedQuote?.quote_number}
            </DialogTitle>
          </DialogHeader>
          {selectedQuote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 text-sm gap-2">
                <div>
                  <span className="text-muted-foreground">Fecha:</span>{' '}
                  {format(new Date(selectedQuote.created_at), 'dd/MM/yyyy HH:mm')}
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente:</span>{' '}
                  {selectedQuote.customer_name || 'Sin cliente'}
                </div>
              </div>

              <div className="border rounded overflow-x-auto hidden landscape:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Producto</th>
                      <th className="text-center p-2 font-medium">Cant</th>
                      <th className="text-right p-2 font-medium">P.U.</th>
                      <th className="text-right p-2 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuote.items?.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{item.product_name}</td>
                        <td className="p-2 text-center">{item.quantity}</td>
                        <td className="p-2 text-right">{formatUSD(item.unit_price)}</td>
                        <td className="p-2 text-right">{formatUSD(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="landscape:hidden space-y-2">
                {selectedQuote.items?.map((item, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium">{item.product_name}</span>
                      <span className="font-semibold">{formatUSD(item.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Cant</span>
                      <span className="font-medium text-foreground">{item.quantity}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">P.U.</span>
                      <span className="font-medium text-foreground">{formatUSD(item.unit_price)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedQuote.notes && (
                <div className="text-sm border rounded p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  {selectedQuote.notes}
                </div>
              )}

              <Separator />

              <div className="space-y-1 text-sm">
                <div className="flex justify-between font-bold text-base">
                  <span>Total USD</span>
                  <span>{formatUSD(selectedQuote.total_usd)}</span>
                </div>
                {selectedQuote.total_ves && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total VES (Tasa: {selectedQuote.rate_ves?.toFixed(2)})</span>
                    <span>{formatVES(selectedQuote.total_ves)}</span>
                  </div>
                )}
                {selectedQuote.total_cop && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total COP (Tasa: {selectedQuote.rate_cop?.toFixed(0)})</span>
                    <span>{formatCOP(selectedQuote.total_cop)}</span>
                  </div>
                )}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-xs text-muted-foreground">
                Los presupuestos no afectan el inventario ni la caja. Solo se convierten en venta
                real cuando los pasas al carrito y completas el cobro en el Punto de Venta.
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                {isMobileApp() && (
                  <Button
                    onClick={shareQuoteWhatsApp}
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    WhatsApp
                  </Button>
                )}
                <Button variant="outline" onClick={printQuote}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>
                <Button onClick={() => convertQuoteToCart(selectedQuote.id)}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Pasar al Carrito
                </Button>
                <Button variant="destructive" onClick={() => deleteQuote(selectedQuote.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {notification && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-white max-w-md ${
            notification.includes('Error') ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {notification}
        </div>
      )}
    </div>
  )
}
