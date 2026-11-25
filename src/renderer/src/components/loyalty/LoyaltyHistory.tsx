import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, Gift } from 'lucide-react'

interface Raffle {
  id: number
  name: string
  status: 'open' | 'drawn'
  winner_name: string | null
  drawn_at: string | null
  kind: 'general' | 'level'
}

interface Redemption {
  id: number
  customer_id: number
  customer_name: string | null
  points: number
  note: string | null
  created_at: string
}

// Read-only history: raffles already drawn and point redemptions made.
export default function LoyaltyHistory(): JSX.Element {
  const [raffles, setRaffles] = useState<Raffle[]>([])
  const [redemptions, setRedemptions] = useState<Redemption[]>([])

  useEffect(() => {
    void (async () => {
      const [list, reds] = await Promise.all([
        window.api.listRaffles() as Promise<Raffle[]>,
        window.api.getRedemptionsReport() as Promise<Redemption[]>
      ])
      setRaffles(list.filter((r) => r.status === 'drawn'))
      setRedemptions(reds)
    })()
  }, [])

  const fmt = (s: string | null): string => (s ? s.slice(0, 16).replace('T', ' ') : '')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5" />
            Historial de rifas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {raffles.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Aún no hay rifas sorteadas.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {raffles.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.kind === 'level' ? 'Por nivel' : 'General'} · {fmt(r.drawn_at)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    {r.winner_name ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gift className="h-5 w-5" />
            Canjes de puntos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {redemptions.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Aún no hay canjes registrados.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {redemptions.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.customer_name || 'Cliente'}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.note || 'Canje de puntos'} · {fmt(r.created_at)}
                    </p>
                  </div>
                  <span className="font-medium text-red-500">{r.points} pts</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
