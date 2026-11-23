import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatUSD } from '@/lib/currency'
import { useLoyalty } from '@/hooks/useLoyalty'
import { Star, Ticket } from 'lucide-react'
import { rewardSummary } from './LoyaltyRewards'

interface CustomerPoints {
  customer_id: number
  name: string
  points: number
  entries: number
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
  kind: 'discount_usd' | 'discount_pct' | 'custom'
  cost_points: number
  value: number
  active: number
}

const TYPE_LABEL: Record<string, string> = {
  earn: 'Compra',
  redeem: 'Canje',
  adjust: 'Ajuste'
}

export default function LoyaltyCustomers(): JSX.Element {
  const { status } = useLoyalty()
  const [balances, setBalances] = useState<CustomerPoints[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [selected, setSelected] = useState<CustomerPoints | null>(null)
  const [history, setHistory] = useState<LoyaltyEntry[]>([])
  const [redeemPoints, setRedeemPoints] = useState('')

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
    setHistory((await window.api.getLoyaltyHistory(c.customer_id, 50)) as LoyaltyEntry[])
  }

  async function refreshSelected(customerId: number): Promise<void> {
    await load()
    const fresh = (await window.api.getLoyaltyBalances()) as CustomerPoints[]
    const match = fresh.find((x) => x.customer_id === customerId) ?? null
    setSelected(match)
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
    <div className="grid grid-cols-1 gap-4 landscape:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clientes con puntos</CardTitle>
        </CardHeader>
        <CardContent>
          {balances.length > 0 ? (
            <div className="space-y-1">
              {balances.map((c) => (
                <button
                  key={c.customer_id}
                  onClick={() => void openCustomer(c)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/60 ${
                    selected?.customer_id === c.customer_id ? 'bg-muted' : ''
                  }`}
                >
                  <span className="flex-1 truncate text-left">{c.name}</span>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 text-amber-500" />
                    {c.points}
                  </span>
                  {status.raffle_enabled && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Ticket className="h-4 w-4" />
                      {c.entries}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              Aún no hay clientes con puntos acumulados
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {selected ? selected.name : 'Selecciona un cliente'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Puntos</p>
                  <p className="text-3xl font-bold">{selected.points}</p>
                  <p className="text-xs text-muted-foreground">
                    ≈ {formatUSD(selected.points * status.redeem_value_usd)}
                  </p>
                </div>
                {status.raffle_enabled && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Participaciones</p>
                    <p className="text-3xl font-bold">{selected.entries}</p>
                    <p className="text-xs text-muted-foreground">en la rifa activa</p>
                  </div>
                )}
              </div>

              {status.rewards_enabled && rewards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Canjear premio</p>
                  <div className="space-y-1">
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

              <div>
                <p className="mb-2 text-sm font-medium">Movimientos recientes</p>
                {history.length > 0 ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto">
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
            </>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              Elige un cliente para ver su saldo, canjear premios y ver su historial
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
