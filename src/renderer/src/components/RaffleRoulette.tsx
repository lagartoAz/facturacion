import { useEffect, useRef, useState } from 'react'

export interface Participant {
  customer_id: number
  name: string
  entries: number
}

interface Props {
  participants: Participant[]
  /** Winner chosen by the backend; the animation always lands on this one. */
  winnerId: number | null
  /** Flip to true to start the spin. */
  spinning: boolean
  /** 'ruleta' = colored wheel (default), 'minimal' = name reel. */
  variant?: 'ruleta' | 'minimal'
  onFinish: () => void
}

const COLORS = [
  '#2563eb',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#0ea5e9',
  '#a3e635'
]

export default function RaffleRoulette(props: Props): JSX.Element {
  return (props.variant ?? 'ruleta') === 'minimal' ? (
    <ReelRoulette {...props} />
  ) : (
    <WheelRoulette {...props} />
  )
}

// ---- Colored wheel ---------------------------------------------------------

const SPINS = 6

function WheelRoulette({ participants, winnerId, spinning, onFinish }: Props): JSX.Element {
  const [rotation, setRotation] = useState(0)
  const [transition, setTransition] = useState('none')
  const [done, setDone] = useState(false)

  // Weighted arcs (by entries) so a customer with more participations gets a
  // bigger slice — the honest picture of their odds.
  const total = participants.reduce((s, p) => s + p.entries, 0) || 1
  let acc = 0
  const segments = participants.map((p, i) => {
    const start = (acc / total) * 360
    acc += p.entries
    const end = (acc / total) * 360
    return { ...p, start, end, mid: (start + end) / 2, color: COLORS[i % COLORS.length] }
  })
  const gradient =
    segments.length > 0
      ? `conic-gradient(${segments
          .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
          .join(', ')})`
      : 'var(--muted)'

  useEffect(() => {
    if (!spinning || winnerId == null || participants.length === 0) return
    const winner = segments.find((s) => s.customer_id === winnerId) ?? segments[0]
    const finalRotation = 360 * SPINS - winner.mid

    setDone(false)
    setTransition('none')
    setRotation(0)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransition('transform 4.8s cubic-bezier(0.12, 0.75, 0.08, 1)')
        setRotation(finalRotation)
      })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerId, participants])

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative h-64 w-64">
        {/* Pointer */}
        <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-primary" />
        <div
          className="h-full w-full rounded-full border-4 border-background shadow-lg"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition
          }}
          onTransitionEnd={() => {
            if (!done) {
              setDone(true)
              onFinish()
            }
          }}
        />
        {/* Hub */}
        <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-background bg-card shadow" />
      </div>
    </div>
  )
}

// ---- Minimalist name reel --------------------------------------------------

const CELL_W = 176
const REEL_LEN = 48
const WIN_INDEX = REEL_LEN - 6

function ReelRoulette({ participants, winnerId, spinning, onFinish }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [reel, setReel] = useState<Participant[]>([])
  const [offset, setOffset] = useState(0)
  const [transition, setTransition] = useState('none')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!spinning || winnerId == null || participants.length === 0) return

    const pool: Participant[] = []
    participants.forEach((p) => {
      const copies = Math.min(Math.max(p.entries, 1), 8)
      for (let i = 0; i < copies; i++) pool.push(p)
    })
    const winner = participants.find((p) => p.customer_id === winnerId) ?? pool[0]

    const strip = Array.from({ length: REEL_LEN }, () => pool[Math.floor(Math.random() * pool.length)])
    strip[WIN_INDEX] = winner

    setDone(false)
    setReel(strip)
    setTransition('none')
    setOffset(0)

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cw = containerRef.current?.clientWidth ?? 600
        const target = cw / 2 - (WIN_INDEX * CELL_W + CELL_W / 2)
        setTransition('transform 4.6s cubic-bezier(0.1, 0.72, 0.08, 1)')
        setOffset(target)
      })
    })
    return () => cancelAnimationFrame(id)
  }, [spinning, winnerId, participants])

  return (
    <div
      ref={containerRef}
      className="relative h-24 w-full overflow-hidden rounded-xl border bg-muted/30"
    >
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-0.5 -translate-x-1/2 bg-primary/80" />
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-primary" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />

      <div
        className="flex h-full items-center"
        style={{ transform: `translateX(${offset}px)`, transition }}
        onTransitionEnd={() => {
          if (!done) {
            setDone(true)
            onFinish()
          }
        }}
      >
        {reel.map((p, i) => (
          <div key={i} className="flex h-16 w-44 shrink-0 items-center justify-center px-2">
            <div
              className={`flex h-full w-full items-center justify-center truncate rounded-lg border px-3 text-center text-sm font-medium transition-colors ${
                done && i === WIN_INDEX
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card'
              }`}
            >
              {p.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
