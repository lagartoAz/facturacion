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
import { formatUSD, formatVES, formatCOP } from '@/lib/currency'
import { Eye, Ban, Printer } from 'lucide-react'
import { format } from 'date-fns'

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
  status: string
  created_at: string
  items?: InvoiceItem[]
}

interface InvoiceItem {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export default function InvoicesPage(): JSX.Element {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadInvoices = useCallback(async () => {
    setInvoices(
      await window.api.getInvoices({
        from: dateFrom || undefined,
        to: dateTo || undefined
      })
    )
  }, [dateFrom, dateTo])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

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

  function printInvoice(): void {
    if (!selectedInvoice) return
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) return

    const inv = selectedInvoice
    const itemsHtml = inv.items
      ?.map(
        (item) => `
      <tr>
        <td style="padding:2px 0">${item.product_name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">$${item.unit_price.toFixed(2)}</td>
        <td style="text-align:right">$${item.subtotal.toFixed(2)}</td>
      </tr>`
      )
      .join('') ?? ''

    printWindow.document.write(`
      <html><head><title>${inv.invoice_number}</title>
      <style>
        body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 10px; }
        table { width: 100%; border-collapse: collapse; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
      </style></head><body>
        <div class="center bold">${inv.invoice_number}</div>
        <div class="center">${format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</div>
        ${inv.customer_name ? `<div class="center">${inv.customer_name}</div>` : ''}
        <div class="divider"></div>
        <table>
          <tr><th style="text-align:left">Producto</th><th>Cant</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr>
          ${itemsHtml}
        </table>
        <div class="divider"></div>
        <div class="right">Subtotal: $${inv.subtotal_usd.toFixed(2)}</div>
        <div class="right">IVA (${inv.tax_percent}%): $${inv.tax_amount_usd.toFixed(2)}</div>
        <div class="right bold">TOTAL: $${inv.total_usd.toFixed(2)}</div>
        ${inv.total_ves ? `<div class="right">Bs. ${inv.total_ves.toFixed(2)} (Tasa: ${inv.rate_ves?.toFixed(2)})</div>` : ''}
        ${inv.total_cop ? `<div class="right">COP ${Math.round(inv.total_cop)} (Tasa: ${inv.rate_cop?.toFixed(0)})</div>` : ''}
        <div class="divider"></div>
        <div class="center">Pago: ${inv.payment_method}</div>
        <div class="center" style="margin-top:10px">Gracias por su compra!</div>
      </body></html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const paymentLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia'
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Facturas</h1>

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

      <div className="border rounded-lg overflow-hidden">
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
                </div>
                <div>
                  <Badge variant={selectedInvoice.status === 'completed' ? 'default' : 'destructive'}>
                    {selectedInvoice.status === 'completed' ? 'Completada' : 'Anulada'}
                  </Badge>
                </div>
              </div>

              <div className="border rounded overflow-hidden">
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

              <Separator />

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatUSD(selectedInvoice.subtotal_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA ({selectedInvoice.tax_percent}%)</span>
                  <span>{formatUSD(selectedInvoice.tax_amount_usd)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total USD</span>
                  <span>{formatUSD(selectedInvoice.total_usd)}</span>
                </div>
                {selectedInvoice.total_ves && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total VES (Tasa: {selectedInvoice.rate_ves?.toFixed(2)})</span>
                    <span>{formatVES(selectedInvoice.total_ves)}</span>
                  </div>
                )}
                {selectedInvoice.total_cop && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total COP (Tasa: {selectedInvoice.rate_cop?.toFixed(0)})</span>
                    <span>{formatCOP(selectedInvoice.total_cop)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
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
    </div>
  )
}
