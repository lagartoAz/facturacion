import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { formatUSD, formatVES, formatCOP } from '@/lib/currency'
import { format } from 'date-fns'
import {
  Landmark,
  DollarSign,
  CreditCard,
  ArrowRightLeft,
  UserCheck,
  Lock,
  Unlock,
  Clock,
  Pencil,
  ArrowDownToLine
} from 'lucide-react'

interface CashRegister {
  id: number
  opening_amount: number
  opening_amount_ves: number
  opening_amount_cop: number
  opening_notes: string | null
  closing_amount: number | null
  closing_amount_ves: number | null
  closing_amount_cop: number | null
  closing_notes: string | null
  sales_cash: number
  sales_cash_ves: number
  sales_cash_cop: number
  sales_card: number
  sales_card_ves: number
  sales_transfer: number
  sales_transfer_ves: number
  sales_transfer_cop: number
  sales_credit: number
  total_invoices: number
  expected_cash: number | null
  difference: number | null
  status: string
  opened_at: string
  closed_at: string | null
}

interface SessionSales {
  cash: number
  cash_ves: number
  cash_cop: number
  card: number
  card_ves: number
  transfer: number
  transfer_ves: number
  transfer_cop: number
  credit: number
  count: number
}

interface Withdrawal {
  id: number
  cash_register_id: number
  amount: number
  currency: string
  reason: string
  created_at: string
}

export default function CashRegisterPage(): JSX.Element {
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null)
  const [history, setHistory] = useState<CashRegister[]>([])
  const [sessionSales, setSessionSales] = useState<SessionSales | null>(null)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)

  // Open form
  const [openUsd, setOpenUsd] = useState('')
  const [openVes, setOpenVes] = useState('')
  const [openCop, setOpenCop] = useState('')
  const [openNotes, setOpenNotes] = useState('')

  // Close dialog
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeUsd, setCloseUsd] = useState('')
  const [closeVes, setCloseVes] = useState('')
  const [closeCop, setCloseCop] = useState('')
  const [closeNotes, setCloseNotes] = useState('')

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRegister, setEditingRegister] = useState<CashRegister | null>(null)
  const [editWithdrawals, setEditWithdrawals] = useState<Withdrawal[]>([])
  const [editUsd, setEditUsd] = useState('')
  const [editVes, setEditVes] = useState('')
  const [editCop, setEditCop] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Withdrawal dialog
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [withdrawalCurrency, setWithdrawalCurrency] = useState('USD')

  // Notification
  const [notification, setNotification] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData(): Promise<void> {
    setLoading(true)
    const [register, hist] = await Promise.all([
      window.api.getCashRegister(),
      window.api.getCashRegisterHistory()
    ])
    setCurrentRegister(register)
    setHistory(hist)

    if (register) {
      const [sales, w] = await Promise.all([
        window.api.getCashRegisterSales(register.opened_at),
        window.api.getCashRegisterWithdrawals(register.id)
      ])
      setSessionSales(sales)
      setWithdrawals(w)
    } else {
      setSessionSales(null)
      setWithdrawals([])
    }
    setLoading(false)
  }

  async function handleOpen(): Promise<void> {
    const usd = parseFloat(openUsd) || 0
    const ves = parseFloat(openVes) || 0
    const cop = parseFloat(openCop) || 0
    if (usd < 0 || ves < 0 || cop < 0) {
      showNotification('Los montos no pueden ser negativos')
      return
    }
    try {
      await window.api.openCashRegister({ usd, ves, cop }, openNotes || undefined)
      setOpenUsd('')
      setOpenVes('')
      setOpenCop('')
      setOpenNotes('')
      await loadData()
      showNotification('Caja abierta exitosamente')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  async function handleClose(): Promise<void> {
    const usd = parseFloat(closeUsd) || 0
    const ves = parseFloat(closeVes) || 0
    const cop = parseFloat(closeCop) || 0
    if (usd < 0 || ves < 0 || cop < 0) {
      showNotification('Los montos no pueden ser negativos')
      return
    }
    try {
      await window.api.closeCashRegister({ usd, ves, cop }, closeNotes || undefined)
      setCloseDialogOpen(false)
      setCloseUsd('')
      setCloseVes('')
      setCloseCop('')
      setCloseNotes('')
      await loadData()
      showNotification('Caja cerrada exitosamente')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  function openCloseDialog(): void {
    setCloseUsd('')
    setCloseVes('')
    setCloseCop('')
    setCloseNotes('')
    setCloseDialogOpen(true)
  }

  async function openEditDialog(register: CashRegister): Promise<void> {
    setEditingRegister(register)
    setEditUsd(String(register.closing_amount ?? 0))
    setEditVes(String(register.closing_amount_ves ?? 0))
    setEditCop(String(register.closing_amount_cop ?? 0))
    setEditNotes(register.closing_notes ?? '')
    const w = await window.api.getCashRegisterWithdrawals(register.id)
    setEditWithdrawals(w)
    setEditDialogOpen(true)
  }

  async function handleEdit(): Promise<void> {
    if (!editingRegister) return
    const usd = parseFloat(editUsd) || 0
    const ves = parseFloat(editVes) || 0
    const cop = parseFloat(editCop) || 0
    if (usd < 0 || ves < 0 || cop < 0) {
      showNotification('Los montos no pueden ser negativos')
      return
    }
    try {
      await window.api.updateCashRegister(editingRegister.id, { usd, ves, cop }, editNotes || undefined)
      setEditDialogOpen(false)
      setEditingRegister(null)
      await loadData()
      showNotification('Caja actualizada exitosamente')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  async function handleWithdrawal(): Promise<void> {
    if (!currentRegister) return
    const amount = parseFloat(withdrawalAmount)
    if (!amount || amount <= 0) {
      showNotification('El monto debe ser mayor a 0')
      return
    }
    if (!withdrawalReason.trim()) {
      showNotification('Debe indicar la razon del retiro')
      return
    }
    try {
      await window.api.addCashRegisterWithdrawal(currentRegister.id, amount, withdrawalReason.trim(), withdrawalCurrency)
      setWithdrawalDialogOpen(false)
      setWithdrawalAmount('')
      setWithdrawalReason('')
      setWithdrawalCurrency('USD')
      await loadData()
      showNotification('Retiro registrado exitosamente')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  function showNotification(msg: string): void {
    setNotification(msg)
    setTimeout(() => setNotification(''), 3000)
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  const salesTotal = sessionSales
    ? sessionSales.cash + sessionSales.card + sessionSales.transfer + sessionSales.credit
    : 0

  const totalWithdrawalsUsd = withdrawals.filter((w) => w.currency === 'USD').reduce((sum, w) => sum + w.amount, 0)
  const totalWithdrawalsVes = withdrawals.filter((w) => w.currency === 'VES').reduce((sum, w) => sum + w.amount, 0)
  const totalWithdrawalsCop = withdrawals.filter((w) => w.currency === 'COP').reduce((sum, w) => sum + w.amount, 0)

  function formatWithdrawalAmount(w: Withdrawal): string {
    if (w.currency === 'VES') return formatVES(w.amount)
    if (w.currency === 'COP') return formatCOP(w.amount)
    return formatUSD(w.amount)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="h-6 w-6" />
          Caja
        </h1>
        {currentRegister && (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-sm px-3 py-1">
            <Unlock className="h-3 w-3 mr-1" />
            Abierta
          </Badge>
        )}
        {!currentRegister && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Lock className="h-3 w-3 mr-1" />
            Cerrada
          </Badge>
        )}
      </div>

      {/* Open register form */}
      {!currentRegister && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Abrir Caja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Efectivo inicial en caja</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="openUsd">Dolares (USD)</Label>
                <Input
                  id="openUsd"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openUsd}
                  onChange={(e) => setOpenUsd(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openVes">Bolivares (VES)</Label>
                <Input
                  id="openVes"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={openVes}
                  onChange={(e) => setOpenVes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openCop">Pesos (COP)</Label>
                <Input
                  id="openCop"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="0"
                  value={openCop}
                  onChange={(e) => setOpenCop(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openNotes">Notas (opcional)</Label>
              <Input
                id="openNotes"
                placeholder="Observaciones de apertura..."
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
              />
            </div>
            <Button onClick={handleOpen} size="lg" className="w-full">
              <Unlock className="mr-2 h-4 w-4" />
              Abrir Caja
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current session */}
      {currentRegister && sessionSales && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sesion Actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Apertura:</span>{' '}
                  {format(new Date(currentRegister.opened_at), 'dd/MM/yyyy HH:mm')}
                </div>
                <div>
                  <span className="text-muted-foreground">Efectivo inicial:</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-muted-foreground text-xs">USD</p>
                  <p className="font-medium">{formatUSD(currentRegister.opening_amount)}</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-muted-foreground text-xs">VES</p>
                  <p className="font-medium">{formatVES(currentRegister.opening_amount_ves)}</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-muted-foreground text-xs">COP</p>
                  <p className="font-medium">{formatCOP(currentRegister.opening_amount_cop)}</p>
                </div>
              </div>
              {currentRegister.opening_notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notas:</span>{' '}
                  {currentRegister.opening_notes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sales summary */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-medium">Efectivo</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatUSD(sessionSales.cash)}</p>
                {sessionSales.cash_ves > 0 && (
                  <p className="text-xs text-muted-foreground">{formatVES(sessionSales.cash_ves)}</p>
                )}
                {sessionSales.cash_cop > 0 && (
                  <p className="text-xs text-muted-foreground">{formatCOP(sessionSales.cash_cop)}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-medium">Tarjeta (Banco)</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatVES(sessionSales.card_ves)}</p>
                <p className="text-xs text-muted-foreground">{formatUSD(sessionSales.card)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-medium">Transferencia (Banco)</CardTitle>
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatVES(sessionSales.transfer_ves)}</p>
                {sessionSales.transfer_cop > 0 && (
                  <p className="text-xs text-muted-foreground">{formatCOP(sessionSales.transfer_cop)}</p>
                )}
                <p className="text-xs text-muted-foreground">{formatUSD(sessionSales.transfer)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-medium">Credito</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatUSD(sessionSales.credit)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Withdrawals list */}
          {withdrawals.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4" />
                  Retiros del turno
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {withdrawals.map((w) => (
                    <div key={w.id} className="flex justify-between items-start text-sm border-b pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium">{w.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(w.created_at), 'HH:mm')} · {w.currency}
                        </p>
                      </div>
                      <span className="text-orange-500 font-medium">-{formatWithdrawalAmount(w)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Total ventas del turno</p>
                  <p className="text-3xl font-bold">{formatUSD(salesTotal)}</p>
                  <p className="text-sm text-muted-foreground mt-1">{sessionSales.count} facturas</p>
                  {totalWithdrawalsUsd > 0 && (
                    <p className="text-sm text-orange-500 mt-1">Retiros USD: -{formatUSD(totalWithdrawalsUsd)}</p>
                  )}
                  {totalWithdrawalsVes > 0 && (
                    <p className="text-sm text-orange-500 mt-1">Retiros VES: -{formatVES(totalWithdrawalsVes)}</p>
                  )}
                  {totalWithdrawalsCop > 0 && (
                    <p className="text-sm text-orange-500 mt-1">Retiros COP: -{formatCOP(totalWithdrawalsCop)}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setWithdrawalAmount('')
                      setWithdrawalReason('')
                      setWithdrawalCurrency('USD')
                      setWithdrawalDialogOpen(true)
                    }}
                    variant="outline"
                    size="lg"
                  >
                    <ArrowDownToLine className="mr-2 h-4 w-4" />
                    Retiro
                  </Button>
                  <Button onClick={openCloseDialog} variant="destructive" size="lg">
                    <Lock className="mr-2 h-4 w-4" />
                    Cerrar Caja
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Historial de Cajas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Fecha</th>
                    <th className="text-right p-3 font-medium">Efect. USD</th>
                    <th className="text-right p-3 font-medium">Efect. VES</th>
                    <th className="text-right p-3 font-medium">Efect. COP</th>
                    <th className="text-right p-3 font-medium">Bs Banco</th>
                    <th className="text-right p-3 font-medium">COP Banco</th>
                    <th className="text-right p-3 font-medium">Facturas</th>
                    <th className="text-right p-3 font-medium">Dif. USD</th>
                    <th className="text-center p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((reg) => {
                    const totalBsBanco = (reg.sales_card_ves || 0) + (reg.sales_transfer_ves || 0)
                    return (
                      <tr key={reg.id} className="border-t">
                        <td className="p-3">
                          <div>{format(new Date(reg.opened_at), 'dd/MM')}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(reg.opened_at), 'HH:mm')}{reg.closed_at ? ` - ${format(new Date(reg.closed_at), 'HH:mm')}` : ''}</div>
                        </td>
                        <td className="p-3 text-right">{reg.closing_amount != null ? formatUSD(reg.closing_amount) : '-'}</td>
                        <td className="p-3 text-right">{reg.closing_amount_ves ? formatVES(reg.closing_amount_ves) : '-'}</td>
                        <td className="p-3 text-right">{reg.closing_amount_cop ? formatCOP(reg.closing_amount_cop) : '-'}</td>
                        <td className="p-3 text-right text-blue-500 font-medium">{totalBsBanco > 0 ? formatVES(totalBsBanco) : '-'}</td>
                        <td className="p-3 text-right text-blue-500 font-medium">{(reg.sales_transfer_cop || 0) > 0 ? formatCOP(reg.sales_transfer_cop) : '-'}</td>
                        <td className="p-3 text-right">{reg.total_invoices}</td>
                        <td className={`p-3 text-right font-medium ${reg.difference != null ? (reg.difference < 0 ? 'text-red-500' : reg.difference > 0 ? 'text-green-500' : '') : ''}`}>
                          {reg.difference != null ? (reg.difference >= 0 ? '+' : '') + formatUSD(reg.difference) : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(reg)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Withdrawal Dialog */}
      <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retiro de Caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moneda</Label>
              <div className="flex gap-2">
                {(['USD', 'VES', 'COP'] as const).map((cur) => (
                  <Button
                    key={cur}
                    type="button"
                    variant={withdrawalCurrency === cur ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setWithdrawalCurrency(cur)}
                  >
                    {cur}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monto ({withdrawalCurrency})</Label>
              <Input
                type="number"
                step={withdrawalCurrency === 'COP' ? '1' : '0.01'}
                min="0.01"
                placeholder={withdrawalCurrency === 'COP' ? '0' : '0.00'}
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Razon del retiro</Label>
              <Input
                placeholder="Ej: Pago a proveedor, compra de insumos..."
                value={withdrawalReason}
                onChange={(e) => setWithdrawalReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawalDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleWithdrawal}>
              Registrar Retiro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar Caja</DialogTitle>
          </DialogHeader>
          {currentRegister && sessionSales && (
            <div className="space-y-4">
              {/* Sales breakdown */}
              <div className="space-y-2 text-sm">
                <p className="font-medium">Ventas en caja (efectivo)</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Efectivo USD</span>
                  <span>{formatUSD(sessionSales.cash)}</span>
                </div>
                {sessionSales.cash_ves > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo VES</span>
                    <span>{formatVES(sessionSales.cash_ves)}</span>
                  </div>
                )}
                {sessionSales.cash_cop > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo COP</span>
                    <span>{formatCOP(sessionSales.cash_cop)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tarjeta</span>
                  <span>{formatUSD(sessionSales.card)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credito</span>
                  <span>{formatUSD(sessionSales.credit)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total ventas</span>
                  <span>{formatUSD(salesTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Facturas</span>
                  <span>{sessionSales.count}</span>
                </div>
              </div>

              {/* Bank payments (card + transfer) */}
              {(sessionSales.card > 0 || sessionSales.transfer > 0) && (
                <>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-blue-500">Banco (Tarjeta + Transferencia)</p>
                    {sessionSales.card > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tarjeta</span>
                        <span>{formatVES(sessionSales.card_ves)}</span>
                      </div>
                    )}
                    {sessionSales.transfer > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Transferencia Bs</span>
                          <span>{formatVES(sessionSales.transfer_ves)}</span>
                        </div>
                        {sessionSales.transfer_cop > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Transferencia COP</span>
                            <span>{formatCOP(sessionSales.transfer_cop)}</span>
                          </div>
                        )}
                      </>
                    )}
                    <Separator />
                    <div className="flex justify-between font-medium text-blue-500">
                      <span>Total Bs banco</span>
                      <span>{formatVES(sessionSales.card_ves + sessionSales.transfer_ves)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">No afecta el efectivo en caja</p>
                  </div>
                </>
              )}

              {/* Withdrawals in close dialog */}
              {withdrawals.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-orange-500">Retiros</p>
                    {withdrawals.map((w) => (
                      <div key={w.id} className="flex justify-between">
                        <span className="text-muted-foreground">{w.reason} ({w.currency})</span>
                        <span className="text-orange-500">-{formatWithdrawalAmount(w)}</span>
                      </div>
                    ))}
                    <Separator />
                    {totalWithdrawalsUsd > 0 && (
                      <div className="flex justify-between font-medium text-orange-500">
                        <span>Total retiros USD</span>
                        <span>-{formatUSD(totalWithdrawalsUsd)}</span>
                      </div>
                    )}
                    {totalWithdrawalsVes > 0 && (
                      <div className="flex justify-between font-medium text-orange-500">
                        <span>Total retiros VES</span>
                        <span>-{formatVES(totalWithdrawalsVes)}</span>
                      </div>
                    )}
                    {totalWithdrawalsCop > 0 && (
                      <div className="flex justify-between font-medium text-orange-500">
                        <span>Total retiros COP</span>
                        <span>-{formatCOP(totalWithdrawalsCop)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              {/* Expected USD cash */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Apertura USD</span>
                  <span>{formatUSD(currentRegister.opening_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ Ventas efectivo</span>
                  <span>{formatUSD(sessionSales.cash)}</span>
                </div>
                {totalWithdrawalsUsd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-orange-500">- Retiros USD</span>
                    <span className="text-orange-500">-{formatUSD(totalWithdrawalsUsd)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Efectivo USD esperado</span>
                  <span>{formatUSD(currentRegister.opening_amount + sessionSales.cash - totalWithdrawalsUsd)}</span>
                </div>
              </div>

              <Separator />

              {/* Counted amounts */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Efectivo contado en caja</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Dolares (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={closeUsd}
                      onChange={(e) => setCloseUsd(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bolivares (VES)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={closeVes}
                      onChange={(e) => setCloseVes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pesos (COP)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="0"
                      value={closeCop}
                      onChange={(e) => setCloseCop(e.target.value)}
                    />
                  </div>
                </div>

                {/* USD difference */}
                {closeUsd && !isNaN(parseFloat(closeUsd)) && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Diferencia USD: </span>
                    {(() => {
                      const diff = parseFloat(closeUsd) - (currentRegister.opening_amount + sessionSales.cash - totalWithdrawalsUsd)
                      return (
                        <span className={`font-medium ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-green-500' : ''}`}>
                          {diff >= 0 ? '+' : ''}{formatUSD(diff)}
                          {diff < 0 ? ' (Faltante)' : diff > 0 ? ' (Sobrante)' : ' (Cuadra)'}
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notas de cierre (opcional)</Label>
                <Input
                  placeholder="Observaciones..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleClose}>
              Confirmar Cierre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cierre de Caja</DialogTitle>
          </DialogHeader>
          {editingRegister && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm bg-muted/50 p-3 rounded">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Apertura:</span>
                  <span>{format(new Date(editingRegister.opened_at), 'dd/MM/yyyy HH:mm')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Apertura USD:</span>
                  <span>{formatUSD(editingRegister.opening_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ventas efectivo:</span>
                  <span>{formatUSD(editingRegister.sales_cash)}</span>
                </div>
                {editWithdrawals.length > 0 && (
                  <>
                    <Separator />
                    <p className="font-medium text-orange-500">Retiros:</p>
                    {editWithdrawals.map((w) => (
                      <div key={w.id} className="flex justify-between">
                        <span className="text-muted-foreground">{w.reason} ({format(new Date(w.created_at), 'HH:mm')}) · {w.currency}</span>
                        <span className="text-orange-500">-{formatWithdrawalAmount(w)}</span>
                      </div>
                    ))}
                  </>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Efectivo USD esperado:</span>
                  <span>{formatUSD(editingRegister.opening_amount + editingRegister.sales_cash - editWithdrawals.filter((w) => w.currency === 'USD').reduce((s, w) => s + w.amount, 0))}</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Efectivo contado en caja</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Dolares (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={editUsd}
                      onChange={(e) => setEditUsd(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bolivares (VES)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={editVes}
                      onChange={(e) => setEditVes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pesos (COP)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="0"
                      value={editCop}
                      onChange={(e) => setEditCop(e.target.value)}
                    />
                  </div>
                </div>
                {editUsd && !isNaN(parseFloat(editUsd)) && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Diferencia USD: </span>
                    {(() => {
                      const editTotalWithdrawals = editWithdrawals.filter((w) => w.currency === 'USD').reduce((s, w) => s + w.amount, 0)
                      const diff = parseFloat(editUsd) - (editingRegister.opening_amount + editingRegister.sales_cash - editTotalWithdrawals)
                      return (
                        <span className={`font-medium ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-green-500' : ''}`}>
                          {diff >= 0 ? '+' : ''}{formatUSD(diff)}
                          {diff < 0 ? ' (Faltante)' : diff > 0 ? ' (Sobrante)' : ' (Cuadra)'}
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Input
                  placeholder="Observaciones..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification */}
      {notification && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-white ${notification.includes('Error') ? 'bg-red-600' : 'bg-green-600'}`}>
          {notification}
        </div>
      )}
    </div>
  )
}
