import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatUSD } from '@/lib/currency'
import { Plus, Search, Pencil, Trash2, Wallet, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface Customer {
  id: number
  name: string
  id_rif: string | null
  address: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

interface CreditInvoice {
  id: number
  invoice_number: string
  total_usd: number
  created_at: string
  pendingAmount?: number
}

interface Payment {
  id: number
  amount_usd: number
  notes: string | null
  created_at: string
}

interface InvoiceDetail {
  id: number
  invoice_number: string
  customer_name: string | null
  total_usd: number
  created_at: string
  payment_method: string
  items: { product_name: string; quantity: number; unit_price: number; subtotal: number }[]
}

type DebtFilter = 'all' | 'debtor' | 'solvent' | 'extreme'
const CUSTOMER_PAGE_SIZE = 20

const emptyForm = {
  name: '',
  id_rif: '',
  address: '',
  phone: '',
  email: '',
  notes: ''
}

export default function CustomersPage(): JSX.Element {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [balances, setBalances] = useState<Record<number, number>>({})
  const [debtDialogOpen, setDebtDialogOpen] = useState(false)
  const [debtCustomer, setDebtCustomer] = useState<Customer | null>(null)
  const [debtBalance, setDebtBalance] = useState(0)
  const [creditInvoices, setCreditInvoices] = useState<CreditInvoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [debtFilter, setDebtFilter] = useState<DebtFilter>('all')
  const [customerPage, setCustomerPage] = useState(1)
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false)
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null)
  const [invoiceDetailPending, setInvoiceDetailPending] = useState(0)

  const loadCustomers = useCallback(async () => {
    const [customersData, balancesData] = await Promise.all([
      window.api.getCustomers(search || undefined),
      window.api.getCustomerBalances()
    ])
    setCustomers(customersData)
    setBalances(balancesData)
  }, [search])

  useEffect(() => {
    setCustomerPage(1)
  }, [search, debtFilter])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  function openNew(): void {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(c: Customer): void {
    setEditingId(c.id)
    setForm({
      name: c.name,
      id_rif: c.id_rif || '',
      address: c.address || '',
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || ''
    })
    setDialogOpen(true)
  }

  async function handleSave(): Promise<void> {
    const data = {
      name: form.name,
      id_rif: form.id_rif || undefined,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      notes: form.notes || undefined
    }

    if (editingId) {
      await window.api.updateCustomer(editingId, data)
    } else {
      await window.api.createCustomer(data)
    }

    setDialogOpen(false)
    loadCustomers()
  }

  async function handleDelete(id: number): Promise<void> {
    if (confirm('Estas seguro de eliminar este cliente?')) {
      await window.api.deleteCustomer(id)
      loadCustomers()
    }
  }

  function applyFifoToInvoices(invoices: CreditInvoice[], totalPaid: number): CreditInvoice[] {
    const sorted = [...invoices].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    let remaining = totalPaid
    const result = sorted.map((inv) => {
      if (remaining >= inv.total_usd) {
        remaining -= inv.total_usd
        return { ...inv, pendingAmount: 0 }
      } else {
        const pendingAmount = inv.total_usd - remaining
        remaining = 0
        return { ...inv, pendingAmount }
      }
    })
    return result.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  async function openDebt(c: Customer): Promise<void> {
    setDebtCustomer(c)
    setPaymentAmount('')
    setPaymentNotes('')
    setDebtBalance(balances[c.id] ?? 0)
    setDebtDialogOpen(true)
    const [balance, invoices, pays] = await Promise.all([
      window.api.getCustomerBalance(c.id),
      window.api.getCustomerCreditInvoices(c.id),
      window.api.getCustomerPayments(c.id)
    ])
    const totalPaid = pays.reduce((sum: number, p: Payment) => sum + p.amount_usd, 0)
    setDebtBalance(balance)
    setCreditInvoices(applyFifoToInvoices(invoices, totalPaid))
    setPayments(pays)
  }

  async function handleAddPayment(): Promise<void> {
    if (!debtCustomer) return
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0 || amount > debtBalance) return
    await window.api.addCustomerPayment(debtCustomer.id, amount, paymentNotes || undefined)
    const [balance, invoices, pays] = await Promise.all([
      window.api.getCustomerBalance(debtCustomer.id),
      window.api.getCustomerCreditInvoices(debtCustomer.id),
      window.api.getCustomerPayments(debtCustomer.id)
    ])
    const totalPaid = pays.reduce((sum: number, p: Payment) => sum + p.amount_usd, 0)
    setDebtBalance(balance)
    setCreditInvoices(applyFifoToInvoices(invoices, totalPaid))
    setPayments(pays)
    setPaymentAmount('')
    setPaymentNotes('')
    loadCustomers()
  }

  async function openInvoiceDetail(inv: CreditInvoice): Promise<void> {
    const data = await window.api.getInvoiceById(inv.id)
    setInvoiceDetail(data)
    setInvoiceDetailPending(inv.pendingAmount ?? inv.total_usd)
    setInvoiceDetailOpen(true)
  }

  async function payInvoiceFromDetail(): Promise<void> {
    if (!debtCustomer || !invoiceDetail || invoiceDetailPending <= 0) return
    await window.api.addCustomerPayment(
      debtCustomer.id,
      invoiceDetailPending,
      `Pago factura ${invoiceDetail.invoice_number}`
    )
    setInvoiceDetailOpen(false)
    const [balance, invoices, pays] = await Promise.all([
      window.api.getCustomerBalance(debtCustomer.id),
      window.api.getCustomerCreditInvoices(debtCustomer.id),
      window.api.getCustomerPayments(debtCustomer.id)
    ])
    const totalPaid = pays.reduce((sum: number, p: Payment) => sum + p.amount_usd, 0)
    setDebtBalance(balance)
    setCreditInvoices(applyFifoToInvoices(invoices, totalPaid))
    setPayments(pays)
    loadCustomers()
  }

  function getDebtBadge(customerId: number): { label: string; variant: 'default' | 'secondary' | 'destructive'; className?: string } {
    const balance = balances[customerId] ?? 0
    if (balance <= 0) return { label: 'Solvente', variant: 'default', className: 'bg-green-600 hover:bg-green-700' }
    if (balance <= 50) return { label: `Debe ${formatUSD(balance)}`, variant: 'secondary', className: 'bg-yellow-500 text-white hover:bg-yellow-600' }
    return { label: `Debe ${formatUSD(balance)}`, variant: 'destructive' }
  }

  function updateForm(field: string, value: string): void {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o RIF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {([
            ['all',     'Todos'],
            ['debtor',  'Deudores'],
            ['solvent', 'Solventes'],
            ['extreme', 'Deuda extrema'],
          ] as [DebtFilter, string][]).map(([val, label]) => (
            <Button
              key={val}
              size="sm"
              variant={debtFilter === val ? 'default' : 'ghost'}
              onClick={() => setDebtFilter(val)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {(() => {
        const filtered = customers.filter((c) => {
          const bal = balances[c.id] ?? 0
          if (debtFilter === 'debtor')  return bal > 0
          if (debtFilter === 'solvent') return bal <= 0
          if (debtFilter === 'extreme') return bal > 50
          return true
        })
        const totalPages = Math.ceil(filtered.length / CUSTOMER_PAGE_SIZE)
        const page = Math.min(customerPage, totalPages || 1)
        const paged = filtered.slice((page - 1) * CUSTOMER_PAGE_SIZE, page * CUSTOMER_PAGE_SIZE)
        return (
          <>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">RIF / Cedula</th>
                    <th className="text-left p-3 font-medium">Telefono</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-center p-3 font-medium">Estado</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3">{c.id_rif || '-'}</td>
                      <td className="p-3">{c.phone || '-'}</td>
                      <td className="p-3">{c.email || '-'}</td>
                      <td className="p-3 text-center">
                        {(() => {
                          const badge = getDebtBadge(c.id)
                          return <Badge variant={badge.variant} className={badge.className}>{badge.label}</Badge>
                        })()}
                      </td>
                      <td className="p-3 text-center space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openDebt(c)} title="Ver deuda">
                          <Wallet className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} title="Eliminar">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        {customers.length === 0 ? 'No hay clientes registrados.' : 'Sin resultados para el filtro seleccionado.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > CUSTOMER_PAGE_SIZE && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Mostrando {Math.min((page - 1) * CUSTOMER_PAGE_SIZE + 1, filtered.length)}–{Math.min(page * CUSTOMER_PAGE_SIZE, filtered.length)} de {filtered.length} clientes
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => setCustomerPage((p) => p - 1)} disabled={page <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 font-medium">{page} / {totalPages}</span>
                  <Button variant="outline" size="icon" onClick={() => setCustomerPage((p) => p + 1)} disabled={page >= totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )
      })()}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RIF / Cedula</Label>
                <Input value={form.id_rif} onChange={(e) => updateForm('id_rif', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Direccion</Label>
              <Input
                value={form.address}
                onChange={(e) => updateForm('address', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.name}>
              {editingId ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debt Dialog */}
      <Dialog open={debtDialogOpen} onOpenChange={setDebtDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Deuda: {debtCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          {debtCustomer && (
            <div className="space-y-4">
              {/* Balance total */}
              <div className="text-center p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Balance pendiente</p>
                <p className={`text-3xl font-bold ${debtBalance > 50 ? 'text-red-500' : debtBalance > 0 ? 'text-yellow-500' : 'text-green-500'}`}>
                  {formatUSD(debtBalance)}
                </p>
              </div>

              {/* Credit invoices */}
              {creditInvoices.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Facturas a credito</p>
                  <div className="border rounded overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 font-medium">Factura</th>
                          <th className="text-left p-2 font-medium">Fecha</th>
                          <th className="text-right p-2 font-medium">Total</th>
                          <th className="text-right p-2 font-medium">Pendiente</th>
                          <th className="p-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {creditInvoices.map((inv) => {
                          const pending = inv.pendingAmount ?? inv.total_usd
                          const isPaid = pending === 0
                          const isPartial = pending > 0 && pending < inv.total_usd
                          return (
                            <tr key={inv.id} className={`border-t ${isPaid ? 'opacity-50' : ''}`}>
                              <td className="p-2 font-mono text-xs">{inv.invoice_number}</td>
                              <td className="p-2">{format(new Date(inv.created_at), 'dd/MM/yyyy')}</td>
                              <td className="p-2 text-right text-muted-foreground">{formatUSD(inv.total_usd)}</td>
                              <td className="p-2 text-right">
                                {isPaid ? (
                                  <span className="text-green-600 font-medium">Pagada</span>
                                ) : (
                                  <span className={`font-semibold ${isPartial ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {formatUSD(pending)}
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                {!isPaid && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    title="Ver y pagar factura"
                                    onClick={() => openInvoiceDetail(inv)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Payment history */}
              {payments.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Historial de pagos</p>
                  <div className="border rounded overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 font-medium">Fecha</th>
                          <th className="text-right p-2 font-medium">Monto</th>
                          <th className="text-left p-2 font-medium">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="p-2">{format(new Date(p.created_at), 'dd/MM/yyyy')}</td>
                            <td className="p-2 text-right text-green-600">{formatUSD(p.amount_usd)}</td>
                            <td className="p-2 text-muted-foreground">{p.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Register payment */}
              {debtBalance > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Registrar pago</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={debtBalance}
                        placeholder="Monto USD"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPaymentAmount(String(debtBalance.toFixed(2)))}
                      >
                        Pagar Todo
                      </Button>
                    </div>
                    <Input
                      placeholder="Nota (opcional)"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                    />
                    <Button
                      onClick={handleAddPayment}
                      disabled={!paymentAmount || isNaN(parseFloat(paymentAmount)) || parseFloat(paymentAmount) <= 0 || parseFloat(paymentAmount) > debtBalance}
                      className="w-full"
                    >
                      Registrar Pago
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Invoice detail dialog */}
      <Dialog open={invoiceDetailOpen} onOpenChange={setInvoiceDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {invoiceDetail?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {invoiceDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 text-sm gap-2">
                <div>
                  <span className="text-muted-foreground">Fecha: </span>
                  {format(new Date(invoiceDetail.created_at), 'dd/MM/yyyy HH:mm')}
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente: </span>
                  {invoiceDetail.customer_name || 'Consumidor Final'}
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
                    {invoiceDetail.items?.map((item, i) => (
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

              <div className="flex justify-between text-sm font-bold">
                <span>Total factura</span>
                <span>{formatUSD(invoiceDetail.total_usd)}</span>
              </div>

              {invoiceDetailPending < invoiceDetail.total_usd && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Ya abonado</span>
                  <span className="text-green-600">{formatUSD(invoiceDetail.total_usd - invoiceDetailPending)}</span>
                </div>
              )}

              <div className="flex justify-between items-center p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
                <span className="text-sm font-medium">Pendiente por cobrar</span>
                <span className="text-lg font-bold text-red-600">{formatUSD(invoiceDetailPending)}</span>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setInvoiceDetailOpen(false)}>
                  Cerrar
                </Button>
                <Button onClick={payInvoiceFromDetail} className="bg-green-600 hover:bg-green-700">
                  Registrar pago {formatUSD(invoiceDetailPending)}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
