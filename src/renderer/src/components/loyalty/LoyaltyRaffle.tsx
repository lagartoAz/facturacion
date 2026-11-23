import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLoyalty } from '@/hooks/useLoyalty'
import { Ticket, Trophy, Trash2, Play, PartyPopper } from 'lucide-react'
import RaffleRoulette, { type Participant } from '@/components/RaffleRoulette'

interface Raffle {
  id: number
  name: string
  status: 'open' | 'drawn'
  points_per_entry: number
  min_points: number
  winner_customer_id: number | null
  winner_name: string | null
  drawn_at: string | null
  created_at: string
}

export default function LoyaltyRaffle(): JSX.Element {
  const { status } = useLoyalty()
  const [active, setActive] = useState<Raffle | null>(null)
  const [raffles, setRaffles] = useState<Raffle[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [name, setName] = useState('')
  const [pointsPerEntry, setPointsPerEntry] = useState(String(status.raffle_points_per_entry))
  const [minPoints, setMinPoints] = useState(String(status.raffle_min_points))

  // Roulette state
  const [spinning, setSpinning] = useState(false)
  const [winnerId, setWinnerId] = useState<number | null>(null)
  const [winnerName, setWinnerName] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const [a, list] = await Promise.all([
      window.api.getActiveRaffle() as Promise<Raffle | null>,
      window.api.listRaffles() as Promise<Raffle[]>
    ])
    setActive(a)
    setRaffles(list)
    if (a) {
      setParticipants((await window.api.getRaffleParticipants(a.id)) as Participant[])
    } else {
      setParticipants([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createRaffle(): Promise<void> {
    if (!name.trim()) {
      alert('Ponle un nombre a la rifa')
      return
    }
    try {
      await window.api.createRaffle(
        name.trim(),
        parseInt(pointsPerEntry, 10) || 0,
        parseInt(minPoints, 10) || 0
      )
      setName('')
      await load()
    } catch (e) {
      alert((e as Error).message || 'No se pudo crear la rifa')
    }
  }

  async function launch(): Promise<void> {
    if (!active || participants.length === 0) return
    setWinnerId(null)
    setWinnerName(null)
    // The backend picks the weighted winner; the reel just animates to it.
    const winner = (await window.api.drawRaffle(active.id, Math.random())) as Participant | null
    if (!winner) {
      alert('No hay participantes en la rifa')
      return
    }
    setWinnerId(winner.customer_id)
    setWinnerName(winner.name)
    setSpinning(true)
  }

  async function onSpinFinish(): Promise<void> {
    setSpinning(false)
    await load()
  }

  async function removeRaffle(id: number): Promise<void> {
    if (!confirm('¿Eliminar esta rifa?')) return
    await window.api.deleteRaffle(id)
    if (active?.id === id) {
      setWinnerId(null)
      setWinnerName(null)
    }
    await load()
  }

  const totalEntries = participants.reduce((s, p) => s + p.entries, 0)
  const pastRaffles = raffles.filter((r) => r.status === 'drawn')

  return (
    <div className="space-y-6">
      {active ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ticket className="h-5 w-5" />
              {active.name}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => removeRaffle(active.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span>
                {active.points_per_entry > 0
                  ? `1 participación por cada ${active.points_per_entry} pts`
                  : 'Una participación por cliente elegible'}
              </span>
              <span>Mínimo {active.min_points} pts para participar</span>
              <span>
                {participants.length} participantes · {totalEntries} participaciones
              </span>
            </div>

            {/* Roulette */}
            <RaffleRoulette
              participants={participants}
              winnerId={winnerId}
              spinning={spinning}
              onFinish={() => void onSpinFinish()}
            />

            {winnerName && !spinning && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 p-3 text-center font-semibold text-primary">
                <PartyPopper className="h-5 w-5" />
                ¡Ganador: {winnerName}!
              </div>
            )}

            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={launch}
                disabled={spinning || participants.length === 0}
              >
                <Play className="mr-2 h-5 w-5" />
                {spinning ? 'Girando…' : 'Lanzar ruleta'}
              </Button>
            </div>

            {participants.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Todavía no hay participantes que cumplan el mínimo de puntos.
              </p>
            )}

            {/* Participants */}
            {participants.length > 0 && (
              <div className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                {participants.map((p) => (
                  <div
                    key={p.customer_id}
                    className="flex items-center justify-between p-2 text-sm"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Ticket className="h-3.5 w-3.5" />
                      {p.entries}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Crear rifa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nombre de la rifa</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Rifa de Navidad"
                className="max-w-sm"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Puntos por participación</label>
                <Input
                  type="number"
                  min="0"
                  value={pointsPerEntry}
                  onChange={(e) => setPointsPerEntry(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Puntos mínimos</label>
                <Input
                  type="number"
                  min="0"
                  value={minPoints}
                  onChange={(e) => setMinPoints(e.target.value)}
                  className="w-36"
                />
              </div>
            </div>
            <Button onClick={createRaffle}>Crear rifa</Button>
          </CardContent>
        </Card>
      )}

      {/* Past raffles */}
      {pastRaffles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5" />
              Rifas anteriores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {pastRaffles.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.drawn_at ? r.drawn_at.slice(0, 16).replace('T', ' ') : ''}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    {r.winner_name ?? '—'}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => removeRaffle(r.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
