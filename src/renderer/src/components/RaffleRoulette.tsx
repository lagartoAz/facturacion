import { useEffect, useRef, useState } from 'react'

export interface Participant {
  customer_id: number
  name: string
  entries: number
}

interface Props {
  participants: Participant[]
  /** Winner chosen by the backend; the reel always lands on this one. */
  winnerId: number | null
  /** Flip to true to start the spin. */
  spinning: boolean
  onFinish: () => void
}

const CELL_W = 176 // px, matches w-44
const REEL_LEN = 48
const WIN_INDEX = REEL_LEN - 6 // land a few cells before the end

// Minimalist raffle reel: a horizontal strip of names that glides past a center
// marker and eases to a stop on the winner. Entries are weighted so customers
// with more participations appear more often in the strip.
export default function RaffleRoulette({
  participants,
  winnerId,
  spinning,
  onFinish
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [reel, setReel] = useState<Participant[]>([])
  const [offset, setOffset] = useState(0)
  const [transition, setTransition] = useState('none')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!spinning || winnerId == null || participants.length === 0) return

    // Weighted pool (capped so one whale doesn't flood the strip visually).
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

    // Two frames so the reset paints before the eased transform kicks in.
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
      {/* Center marker */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-0.5 -translate-x-1/2 bg-primary/80" />
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-primary" />
      {/* Fades on the edges for a cleaner look */}
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
          <div
            key={i}
            className="flex h-16 w-44 shrink-0 items-center justify-center px-2"
          >
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
