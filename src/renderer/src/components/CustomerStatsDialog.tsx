import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatUSD } from '@/lib/currency'
import { format, subDays, startOfYear, endOfYear } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { DollarSign, Star, Ticket } from 'lucide-react'
import { useLoyalty } from '@/hooks/useLoyalty'

interface DailyRow {
  day: string
  total: number
  count: number
  paidCount?: number
  paidTotal?: number
}
interface Summary {
  total_revenue: number
  total_invoices: number
  average_ticket: number
}
interface Coupon {
  id: number
  name: string
  kind: string
  value: number
  status: 'active' | 'used'
  used_at: string | null
  created_at: string
}

export default function CustomerStatsDialog({
  customer,
  open,
  onOpenChange
}: {
  customer: { id: number; name: string } | null
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { status: loyalty } = useLoyalty()
  const [range, setRange] = useState<'30' | '90' | 'year'>('30')
  const [viewMode, setViewMode] = useState<'money' | 'points'>('money')
  // Off by default: green trend bar for this customer's already-paid debts.
  const [showPaidDebts, setShowPaidDebts] = useState(false)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [dailyDebts, setDailyDebts] = useState<DailyRow[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_revenue: 0,
    total_invoices: 0,
    average_ticket: 0
  })
  const [loyaltyInfo, setLoyaltyInfo] = useState({ points: 0, entries: 0 })
  const [coupons, setCoupons] = useState<Coupon[]>([])

  const points = viewMode === 'points'
  const fmtVal = (n: number): string => (points ? `${Math.round(n)} pts` : formatUSD(n))

  useEffect(() => {
    if (!open || !customer) return
    const to = format(new Date(), 'yyyy-MM-dd')
    const from =
      range === 'year'
        ? format(startOfYear(new Date()), 'yyyy-MM-dd')
        : format(subDays(new Date(), range === '30' ? 30 : 90), 'yyyy-MM-dd')
    const toEnd = range === 'year' ? format(endOfYear(new Date()), 'yyyy-MM-dd') : to

    void (async () => {
      const [d, s, debts] = await Promise.all([
        points
          ? window.api.getLoyaltyDailyPoints(from, toEnd, customer.id)
          : window.api.getDailySales(from, toEnd, customer.id),
        points
          ? window.api.getLoyaltyPointsSummary(from, toEnd, customer.id)
          : window.api.getSalesSummary(from, toEnd, customer.id),
        window.api.getDailyDebts(from, toEnd, customer.id)
      ])
      setDaily(d as DailyRow[])
      setSummary(s as Summary)
      setDailyDebts(debts as DailyRow[])
    })()
  }, [open, customer, range, viewMode, points])

  useEffect(() => {
    if (!open || !customer || !loyalty.enabled) return
    void (async () => {
      const [sum, cps] = await Promise.all([
        window.api.getLoyaltySummaryByCustomer() as Promise<
          Record<number, { points: number; entries: number }>
        >,
        window.api.getAllCoupons(customer.id) as Promise<Coupon[]>
      ])
      setLoyaltyInfo(sum[customer.id] ?? { points: 0, entries: 0 })
      setCoupons(cps)
    })()
  }, [open, customer, loyalty.enabled])

  const couponLabel = (c: Coupon): string =>
    c.kind === 'discount_usd'
      ? `Descuento de $${c.value}`
      : c.kind === 'discount_pct'
        ? `${c.value}% de descuento`
        : c.name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Estadísticas · {customer?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {(['30', '90', 'year'] as const).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={range === r ? 'default' : 'outline'}
                  onClick={() => setRange(r)}
                >
                  {r === 'year' ? 'Año' : `${r} días`}
                </Button>
              ))}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={showPaidDebts ? 'default' : 'outline'}
                className="gap-1"
                onClick={() => setShowPaidDebts((v) => !v)}
                title="Mostrar la tendencia de deudas ya pagadas"
              >
                <span className="h-2.5 w-2.5 rounded-sm bg-green-600" />
                Deudas pagadas
              </Button>
              {loyalty.enabled && (
                <>
                  <Button
                    size="sm"
                    variant={!points ? 'default' : 'outline'}
                    onClick={() => setViewMode('money')}
                    aria-label="Dinero"
                    title="Dinero"
                  >
                    <DollarSign className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={points ? 'default' : 'outline'}
                    onClick={() => setViewMode('points')}
                  >
                    <Star className="mr-1 h-4 w-4" />
                    Puntos
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{points ? 'Puntos' : 'Gastado'}</p>
              <p className="text-xl font-bold">{fmtVal(summary.total_revenue)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Facturas</p>
              <p className="text-xl font-bold">{summary.total_invoices}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Promedio</p>
              <p className="text-xl font-bold">{fmtVal(summary.average_ticket)}</p>
            </div>
          </div>

          {/* Daily bar chart */}
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={daily.map((r) => {
                  const d = dailyDebts.find((x) => x.day === r.day)
                  return { ...r, debts: d?.count ?? 0, paidDebts: d?.paidCount ?? 0 }
                })}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM')}
                  fontSize={11}
                />
                <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => (points ? `${v}` : `$${v}`)} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} fontSize={11} />
                <Tooltip
                  formatter={(value: number, _n, item) =>
                    item?.dataKey === 'debts'
                      ? [value, 'Deudas']
                      : item?.dataKey === 'paidDebts'
                        ? [value, 'Deudas pagadas']
                        : [fmtVal(value), points ? 'Puntos' : 'Total']
                  }
                  labelFormatter={(label) => format(new Date(label + 'T00:00:00'), 'dd/MM/yyyy')}
                />
                <Legend />
                <Bar
                  yAxisId="left"
                  name={points ? 'Puntos' : 'Ventas'}
                  dataKey="total"
                  fill="hsl(221.2, 83.2%, 53.3%)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  name="Deudas"
                  dataKey="debts"
                  fill="hsl(0, 72%, 51%)"
                  radius={[4, 4, 0, 0]}
                />
                {showPaidDebts && (
                  <Bar
                    yAxisId="right"
                    name="Deudas pagadas"
                    dataKey="paidDebts"
                    fill="hsl(142, 71%, 45%)"
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              Sin compras en el periodo seleccionado
            </p>
          )}

          {/* Loyalty detail */}
          {loyalty.enabled && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Star className="h-4 w-4 text-amber-500" />
                  {loyaltyInfo.points} puntos
                </span>
                {loyalty.raffle_enabled && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Ticket className="h-4 w-4" />
                    {loyaltyInfo.entries} cupos de rifa
                  </span>
                )}
              </div>

              <div>
                <p className="mb-1 text-sm font-medium">Cupones</p>
                {coupons.length > 0 ? (
                  <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
                    {coupons.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                        <span className="flex-1">
                          <span className="font-medium">{c.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {couponLabel(c)}
                          </span>
                        </span>
                        {c.status === 'active' ? (
                          <span className="rounded-full bg-green-600/10 px-2 py-0.5 text-xs font-medium text-green-700">
                            Disponible
                          </span>
                        ) : (
                          <span className="text-right text-xs text-muted-foreground">
                            Usado
                            {c.used_at ? (
                              <span className="block">{c.used_at.slice(0, 10)}</span>
                            ) : null}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    Sin cupones canjeados
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
