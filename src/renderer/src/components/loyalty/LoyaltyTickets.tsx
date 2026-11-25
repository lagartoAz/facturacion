import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Ticket, Printer, CheckCircle2 } from 'lucide-react'
import { printRaffleTickets, printManualTickets } from '@/lib/raffle-tickets'

interface EarnedTicket {
  invoice_id: number
  invoice_number: string
  customer_name: string | null
  created_at: string
  tickets: number
  printed: boolean
}

interface ManualTicket {
  id: number
  customer_name: string | null
  tickets: number
  type: string
  note: string | null
  created_at: string
  printed: boolean
}

const MANUAL_TYPE_LABEL: Record<string, string> = {
  redeem: 'Canje por puntos',
  adjust: 'Agregado a mano'
}

// Earned raffle tickets per invoice with their print status, so staff can see
// at a glance what still needs printing and reprint when needed.
export default function LoyaltyTickets(): JSX.Element {
  const [rows, setRows] = useState<EarnedTicket[]>([])
  const [manualRows, setManualRows] = useState<ManualTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const [earned, manual] = await Promise.all([
      window.api.getEarnedTicketsReport() as Promise<EarnedTicket[]>,
      window.api.getManualTicketsReport() as Promise<ManualTicket[]>
    ])
    setRows(earned)
    setManualRows(manual)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function print(invoiceId: number): Promise<void> {
    const res = await printRaffleTickets(invoiceId)
    if (res.ok) {
      setNotice(`${res.count} ticket(s) impresos`)
      await load()
    } else if (res.error) {
      setNotice(res.error)
    }
  }

  async function printManual(ledgerId: number): Promise<void> {
    const res = await printManualTickets(ledgerId)
    if (res.ok) {
      setNotice(`${res.count} ticket(s) impresos`)
      await load()
    } else if (res.error) {
      setNotice(res.error)
    }
  }

  const totalTickets = rows.reduce((s, r) => s + r.tickets, 0)
  const pending = rows.filter((r) => !r.printed)
  const pendingTickets = pending.reduce((s, r) => s + r.tickets, 0)

  const manualTotal = manualRows.reduce((s, r) => s + r.tickets, 0)

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ticket className="h-5 w-5" />
          Tickets ganados
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {totalTickets} ticket(s) en total · {pendingTickets} por imprimir en {pending.length}{' '}
          factura(s)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {notice && (
          <p className="rounded-md bg-primary/10 p-2 text-center text-xs text-primary">{notice}</p>
        )}
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Todavía no se han generado tickets de rifa.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((r) => (
              <div key={r.invoice_id} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {r.customer_name || 'Consumidor Final'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Factura {r.invoice_number} ·{' '}
                    {r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 font-medium">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  {r.tickets}
                </span>
                {r.printed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-green-600"
                    onClick={() => print(r.invoice_id)}
                    title="Reimprimir"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Impresos
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => print(r.invoice_id)}
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ticket className="h-5 w-5" />
          Tickets manuales y por canje
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {manualTotal} ticket(s) generados por canje de puntos o agregados a mano.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Cargando…</p>
        ) : manualRows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Aún no hay tickets manuales ni por canje.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {manualRows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.customer_name || 'Cliente'}</p>
                  <p className="text-xs text-muted-foreground">
                    {MANUAL_TYPE_LABEL[r.type] ?? r.type}
                    {r.note ? ` · ${r.note}` : ''} ·{' '}
                    {r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 font-medium">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  {r.tickets}
                </span>
                {r.printed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-green-600"
                    onClick={() => printManual(r.id)}
                    title="Reimprimir"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Impresos
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => printManual(r.id)}
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  )
}
