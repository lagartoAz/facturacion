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
import { formatUSD } from '@/lib/currency'
import { format } from 'date-fns'
import {
  Landmark,
  DollarSign,
  CreditCard,
  ArrowRightLeft,
  UserCheck,
  Lock,
  Unlock,
  Clock
} from 'lucide-react'

interface CashRegister {
  id: number
  opening_amount: number
  opening_notes: string | null
  closing_amount: number | null
  closing_notes: string | null
  sales_cash: number
  sales_card: number
  sales_transfer: number
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
  card: number
  transfer: number
  credit: number
  count: number
}

export default function CashRegisterPage(): JSX.Element {
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null)
  const [history, setHistory] = useState<CashRegister[]>([])
  const [sessionSales, setSessionSales] = useState<SessionSales | null>(null)
  const [loading, setLoading] = useState(true)

  // Open form
  const [openAmount, setOpenAmount] = useState('')
  const [openNotes, setOpenNotes] = useState('')

  // Close dialog
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [countedAmount, setCountedAmount] = useState('')
  const [closeNotes, setCloseNotes] = useState('')

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
      const sales = await window.api.getCashRegisterSales(register.opened_at)
      setSessionSales(sales)
    } else {
      setSessionSales(null)
    }
    setLoading(false)
  }

  async function handleOpen(): Promise<void> {
    const amount = parseFloat(openAmount)
    if (isNaN(amount) || amount < 0) {
      showNotification('Ingresa un monto valido')
      return
    }
    try {
      await window.api.openCashRegister(amount, openNotes || undefined)
      setOpenAmount('')
      setOpenNotes('')
      await loadData()
      showNotification('Caja abierta exitosamente')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  async function handleClose(): Promise<void> {
    const counted = parseFloat(countedAmount)
    if (isNaN(counted) || counted < 0) {
      showNotification('Ingresa el monto contado')
      return
    }
    try {
      await window.api.closeCashRegister(counted, closeNotes || undefined)
      setCloseDialogOpen(false)
      setCountedAmount('')
      setCloseNotes('')
      await loadData()
      showNotification('Caja cerrada exitosamente')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  function openCloseDialog(): void {
    setCountedAmount('')
    setCloseNotes('')
    setCloseDialogOpen(true)
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

      {/* Open register form - shown when no register is open */}
      {!currentRegister && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Abrir Caja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="openAmount">Monto inicial (USD)</Label>
              <Input
                id="openAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={openAmount}
                onChange={(e) => setOpenAmount(e.target.value)}
              />
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

      {/* Current session - shown when register is open */}
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
                  <span className="text-muted-foreground">Monto inicial:</span>{' '}
                  <span className="font-medium">{formatUSD(currentRegister.opening_amount)}</span>
                </div>
                {currentRegister.opening_notes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Notas:</span>{' '}
                    {currentRegister.opening_notes}
                  </div>
                )}
              </div>
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-medium">Tarjeta</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatUSD(sessionSales.card)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-medium">Transferencia</CardTitle>
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatUSD(sessionSales.transfer)}</p>
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

          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Total ventas del turno</p>
                  <p className="text-3xl font-bold">{formatUSD(salesTotal)}</p>
                  <p className="text-sm text-muted-foreground mt-1">{sessionSales.count} facturas</p>
                </div>
                <Button onClick={openCloseDialog} variant="destructive" size="lg">
                  <Lock className="mr-2 h-4 w-4" />
                  Cerrar Caja
                </Button>
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
                    <th className="text-left p-3 font-medium">Apertura</th>
                    <th className="text-left p-3 font-medium">Cierre</th>
                    <th className="text-right p-3 font-medium">Ventas</th>
                    <th className="text-right p-3 font-medium">Facturas</th>
                    <th className="text-right p-3 font-medium">Esperado</th>
                    <th className="text-right p-3 font-medium">Contado</th>
                    <th className="text-right p-3 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((reg) => {
                    const totalSales = reg.sales_cash + reg.sales_card + reg.sales_transfer + reg.sales_credit
                    return (
                      <tr key={reg.id} className="border-t">
                        <td className="p-3">{format(new Date(reg.opened_at), 'dd/MM HH:mm')}</td>
                        <td className="p-3">{reg.closed_at ? format(new Date(reg.closed_at), 'dd/MM HH:mm') : '-'}</td>
                        <td className="p-3 text-right">{formatUSD(totalSales)}</td>
                        <td className="p-3 text-right">{reg.total_invoices}</td>
                        <td className="p-3 text-right">{reg.expected_cash != null ? formatUSD(reg.expected_cash) : '-'}</td>
                        <td className="p-3 text-right">{reg.closing_amount != null ? formatUSD(reg.closing_amount) : '-'}</td>
                        <td className={`p-3 text-right font-medium ${reg.difference != null ? (reg.difference < 0 ? 'text-red-500' : reg.difference > 0 ? 'text-green-500' : '') : ''}`}>
                          {reg.difference != null ? (reg.difference >= 0 ? '+' : '') + formatUSD(reg.difference) : '-'}
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Efectivo</span>
                  <span>{formatUSD(sessionSales.cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tarjeta</span>
                  <span>{formatUSD(sessionSales.card)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transferencia</span>
                  <span>{formatUSD(sessionSales.transfer)}</span>
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

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto apertura</span>
                  <span>{formatUSD(currentRegister.opening_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ Ventas efectivo</span>
                  <span>{formatUSD(sessionSales.cash)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Efectivo esperado</span>
                  <span>{formatUSD(currentRegister.opening_amount + sessionSales.cash)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Efectivo contado (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Cuenta el efectivo en caja..."
                  value={countedAmount}
                  onChange={(e) => setCountedAmount(e.target.value)}
                  autoFocus
                />
                {countedAmount && !isNaN(parseFloat(countedAmount)) && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Diferencia: </span>
                    {(() => {
                      const diff = parseFloat(countedAmount) - (currentRegister.opening_amount + sessionSales.cash)
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
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={!countedAmount || isNaN(parseFloat(countedAmount)) || parseFloat(countedAmount) < 0}
            >
              Confirmar Cierre
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
