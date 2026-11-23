import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { useLoyalty } from '@/hooks/useLoyalty'
import { Ticket, Trophy, Trash2, Play, PartyPopper, MessageCircle, Copy, Save } from 'lucide-react'
import RaffleRoulette, { type Participant } from '@/components/RaffleRoulette'

const PLACEHOLDER_HINT = '{nombre}, {rifa}, {tienda}, {fecha}'

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
  const { status, refresh } = useLoyalty()
  const [animation, setAnimation] = useState(status.raffle_animation)
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

  // Winner message (WhatsApp copy-paste) + editable template
  const [template, setTemplate] = useState(status.winner_template)
  const [storeName, setStoreName] = useState('')
  const [msgOpen, setMsgOpen] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => setTemplate(status.winner_template), [status.winner_template])
  useEffect(() => {
    void (async () => {
      const s = (await window.api.getAllSettings()) as Record<string, string>
      setStoreName((s.receipt_title || '').trim())
    })()
  }, [])

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

  useEffect(() => setAnimation(status.raffle_animation), [status.raffle_animation])

  async function chooseAnimation(style: string): Promise<void> {
    setAnimation(style)
    await window.api.setLoyaltyConfig({ raffle_animation: style })
    await refresh()
  }

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

  function buildWinnerMessage(name: string, raffleName: string): string {
    const base =
      (template && template.trim()) ||
      '¡Felicidades {nombre}! Ganaste la rifa "{rifa}" en {tienda}.'
    const vars: Record<string, string> = {
      '{nombre}': name,
      '{rifa}': raffleName,
      '{tienda}': storeName || 'nuestra tienda',
      '{fecha}': new Date().toLocaleDateString()
    }
    return base.replace(/\{nombre\}|\{rifa\}|\{tienda\}|\{fecha\}/g, (m) => vars[m] ?? m)
  }

  function openWinnerMessage(name: string, raffleName: string): void {
    setMsgText(buildWinnerMessage(name, raffleName))
    setCopied(false)
    setMsgOpen(true)
  }

  async function copyMessage(): Promise<void> {
    try {
      await navigator.clipboard.writeText(msgText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function saveTemplate(): Promise<void> {
    await window.api.setLoyaltyConfig({ winner_template: template })
    await refresh()
    alert('Plantilla guardada')
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

            {/* Animation style selector */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Animación:</span>
              <Button
                size="sm"
                variant={animation === 'ruleta' ? 'default' : 'outline'}
                onClick={() => void chooseAnimation('ruleta')}
              >
                Ruleta
              </Button>
              <Button
                size="sm"
                variant={animation === 'minimal' ? 'default' : 'outline'}
                onClick={() => void chooseAnimation('minimal')}
              >
                Minimalista
              </Button>
            </div>

            {/* Roulette */}
            <RaffleRoulette
              participants={participants}
              winnerId={winnerId}
              spinning={spinning}
              variant={animation === 'minimal' ? 'minimal' : 'ruleta'}
              onFinish={() => void onSpinFinish()}
            />

            {winnerName && !spinning && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-primary bg-primary/10 p-3 text-center">
                <span className="flex items-center gap-2 font-semibold text-primary">
                  <PartyPopper className="h-5 w-5" />
                  ¡Ganador: {winnerName}!
                </span>
                <Button
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700"
                  onClick={() => openWinnerMessage(winnerName, active.name)}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Mensaje para WhatsApp
                </Button>
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
                  {r.winner_name && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Mensaje para WhatsApp"
                      onClick={() => openWinnerMessage(r.winner_name as string, r.name)}
                    >
                      <MessageCircle className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => removeRaffle(r.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Winner message template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5" />
            Plantilla del mensaje al ganador
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Se usa para generar el mensaje de WhatsApp. Variables: {PLACEHOLDER_HINT}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={5}
            className="w-full rounded-md border bg-background p-3 text-sm"
          />
          <Button onClick={saveTemplate}>
            <Save className="mr-2 h-4 w-4" />
            Guardar plantilla
          </Button>
        </CardContent>
      </Card>

      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mensaje para el ganador</DialogTitle>
          </DialogHeader>
          <textarea
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            rows={6}
            className="w-full rounded-md border bg-background p-3 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsgOpen(false)}>
              Cerrar
            </Button>
            <Button onClick={copyMessage}>
              <Copy className="mr-2 h-4 w-4" />
              {copied ? 'Copiado' : 'Copiar mensaje'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
