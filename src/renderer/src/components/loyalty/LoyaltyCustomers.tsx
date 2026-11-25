import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { formatUSD } from '@/lib/currency'
import { useLoyalty, pointsActive, ticketsActive } from '@/hooks/useLoyalty'
import { Star, Ticket, ChevronRight } from 'lucide-react'
import { rewardSummary } from './LoyaltyRewards'

interface CustomerPoints {
  customer_id: number
  name: string
  points: number
  tickets: number
  entries: number
  level_name: string | null
  level_color: string | null
}

interface LoyaltyEntry {
  id: number
  points: number
  type: string
  note: string | null
  created_at: string
}

interface Reward {
  id: number
  name: string
  kind: 'discount_usd' | 'discount_pct' | 'ticket' | 'custom'
  cost_points: number
  value: number
  tickets: number
  active: number
}

const TYPE_LABEL: Record<string, string> = {
  earn: 'Compra',
  redeem: 'Canje',
  adjust: 'Ajuste'
}

export default function LoyaltyCustomers(): JSX.Element {
  const { status } = useLoyalty()
  const withPoints = pointsActive(status.mode)
  const withTickets = ticketsActive(status.mode)
  const [balances, setBalances] = useState<CustomerPoints[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [selected, setSelected] = useState<CustomerPoints | null>(null)
  const [history, setHistory] = useState<LoyaltyEntry[]>([])
  const [redeemPoints, setRedeemPoints] = useState('')
  const [addPoints, setAddPoints] = useState('')
  const [addTickets, setAddTickets] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load(): Promise<void> {
    const [b, r] = await Promise.all([
      window.api.getLoyaltyBalances() as Promise<CustomerPoints[]>,
      window.api.listLoyaltyRewards(true) as Promise<Reward[]>
    ])
    setBalances(b)
    setRewards(r)
  }

  async function openCustomer(c: CustomerPoints): Promise<void> {
    setSelected(c)
    setRedeemPoints('')
    setAddPoints('')
    setAddTickets('')
    setOpen(true)
    setHistory((await window.api.getLoyaltyHistory(c.customer_id, 50)) as LoyaltyEntry[])
  }

  async function refreshSelected(customerId: number): Promise<void> {
    const fresh = (await window.api.getLoyaltyBalances()) as CustomerPoints[]
    setBalances(fresh)
    setRewards((await window.api.listLoyaltyRewards(true)) as Reward[])
    setSelected(fresh.find((x) => x.customer_id === customerId) ?? null)
    setHistory((await window.api.getLoyaltyHistory(customerId, 50)) as LoyaltyEntry[])
  }

  async function doRedeem(): Promise<void> {
    if (!selected) return
    const pts = parseInt(redeemPoints, 10)
    if (!pts || pts <= 0) {
      alert('Ingresa una cantidad de puntos valida')
      return
    }
    try {
      await window.api.redeemLoyaltyPoints(selected.customer_id, pts, 'Canje manual')
      setRedeemPoints('')
      await refreshSelected(selected.customer_id)
    } catch (e) {
      alert((e as Error).message || 'No se pudo canjear')
    }
  }

  async function doAddPoints(): Promise<void> {
    if (!selected) return
    const n = parseInt(addPoints, 10)
    if (!n || n <= 0) {
      alert('Ingresa una cantidad de puntos valida')
      return
    }
    try {
      await window.api.adjustLoyaltyPoints(selected.customer_id, n, 'Ajuste manual')
      setAddPoints('')
      await refreshSelected(selected.customer_id)
    } catch (e) {
      alert((e as Error).message || 'No se pudieron agregar los puntos')
    }
  }

  async function doAddTickets(): Promise<void> {
    if (!selected) return
    const n = parseInt(addTickets, 10)
    if (!n || n <= 0) {
      alert('Ingresa una cantidad de tickets valida')
      return
    }
    try {
      await window.api.adjustLoyaltyTickets(selected.customer_id, n, 'Ajuste manual')
      setAddTickets('')
      await refreshSelected(selected.customer_id)
    } catch (e) {
      alert((e as Error).message || 'No se pudieron agregar los tickets')
    }
  }

  async function redeemReward(reward: Reward): Promise<void> {
    if (!selected) return
    if (selected.points < reward.cost_points) {
      alert('El cliente no tiene suficientes puntos para este premio')
      return
    }
    if (!confirm(`Canjear "${reward.name}" por ${reward.cost_points} puntos?`)) return
    try {
      await window.api.redeemLoyaltyReward(selected.customer_id, reward.id)
      await refreshSelected(selected.customer_id)
      alert(`Premio canjeado: ${reward.name}`)
    } catch (e) {
      alert((e as Error).message || 'No se pudo canjear el premio')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Clientes participando</CardTitle>
        <p className="text-sm text-muted-foreground">
          Toca un cliente para ver su saldo, canjear premios y ver su historial.
        </p>
      </CardHeader>
      <CardContent>
        {balances.length > 0 ? (
          <div className="divide-y rounded-lg border">
            {balances.map((c) => (
              <button
                key={c.customer_id}
                onClick={() => void openCustomer(c)}
                className="flex w-full items-center gap-3 p-3 text-sm transition-colors hover:bg-muted/60"
              >
                <span className="flex-1 truncate text-left font-medium">{c.name}</span>
                {withPoints && c.level_name && (
                  <span
                    className="rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={{
                      borderColor: c.level_color ?? undefined,
                      color: c.level_color ?? undefined
                    }}
                  >
                    {c.level_name}
                  </span>
                )}
                {withPoints && (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 text-amber-500" />
                    {c.points}
                  </span>
                )}
                {withTickets && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Ticket className="h-4 w-4" />
                    {c.tickets}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            Aún no hay clientes con saldo acumulado
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.name ?? 'Cliente'}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {withPoints && selected.level_name && (
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium"
                  style={{
                    borderColor: selected.level_color ?? undefined,
                    color: selected.level_color ?? undefined
                  }}
                >
                  Nivel {selected.level_name}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {withPoints && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Puntos</p>
                    <p className="text-3xl font-bold">{selected.points}</p>
                    <p className="text-xs text-muted-foreground">
                      ≈ {formatUSD(selected.points * status.redeem_value_usd)}
                    </p>
                  </div>
                )}
                {withTickets && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Tickets</p>
                    <p className="text-3xl font-bold">{selected.tickets}</p>
                    <p className="text-xs text-muted-foreground">acumulados para la rifa</p>
                  </div>
                )}
                {status.raffle_enabled && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Participaciones</p>
                    <p className="text-3xl font-bold">{selected.entries}</p>
                    <p className="text-xs text-muted-foreground">en la rifa activa</p>
                  </div>
                )}
              </div>

              {withPoints && status.rewards_enabled && rewards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Canjear premio</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {rewards.map((r) => {
                      const affordable = selected.points >= r.cost_points
                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 rounded-md border p-2 text-sm"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{r.name}</p>
                            <p className="text-xs text-muted-foreground">{rewardSummary(r)}</p>
                          </div>
                          <span className="text-xs font-semibold">{r.cost_points} pts</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!affordable}
                            onClick={() => redeemReward(r)}
                          >
                            Canjear
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {(withPoints || withTickets) && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Agregar a gusto</p>
                  <div className="flex flex-wrap items-end gap-2">
                    {withPoints && (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Puntos</label>
                          <Input
                            type="number"
                            min="1"
                            value={addPoints}
                            onChange={(e) => setAddPoints(e.target.value)}
                            className="w-24"
                            placeholder="0"
                          />
                        </div>
                        <Button size="sm" onClick={doAddPoints}>
                          <Star className="mr-1 h-4 w-4" />
                          Agregar puntos
                        </Button>
                      </>
                    )}
                    {withTickets && (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Tickets</label>
                          <Input
                            type="number"
                            min="1"
                            value={addTickets}
                            onChange={(e) => setAddTickets(e.target.value)}
                            className="w-24"
                            placeholder="0"
                          />
                        </div>
                        <Button size="sm" variant="outline" onClick={doAddTickets}>
                          <Ticket className="mr-1 h-4 w-4" />
                          Agregar tickets
                        </Button>
                      </>
                    )}
                  </div>
                  {withTickets && (
                    <p className="text-xs text-muted-foreground">
                      Los tickets agregados se pueden imprimir desde la pestaña Tickets.
                    </p>
                  )}
                </div>
              )}

              {withPoints && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Canje manual (puntos)</label>
                    <Input
                      type="number"
                      min="1"
                      value={redeemPoints}
                      onChange={(e) => setRedeemPoints(e.target.value)}
                      className="w-32"
                      placeholder="0"
                    />
                  </div>
                  <Button variant="outline" onClick={doRedeem}>
                    Canjear
                  </Button>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium">Movimientos recientes</p>
                {history.length > 0 ? (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between border-b py-1.5 text-sm last:border-0"
                      >
                        <span className="text-muted-foreground">
                          {TYPE_LABEL[h.type] ?? h.type}
                          {h.note ? ` · ${h.note}` : ''}
                        </span>
                        <span
                          className={`font-semibold ${h.points < 0 ? 'text-red-500' : 'text-green-600'}`}
                        >
                          {h.points > 0 ? '+' : ''}
                          {h.points}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-muted-foreground">Sin movimientos</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
