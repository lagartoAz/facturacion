import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatUSD } from '@/lib/currency'
import { format, subDays, startOfYear, endOfYear, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { TrendingUp, FileText, DollarSign, List, Trophy, Star } from 'lucide-react'
import { useLoyalty } from '@/hooks/useLoyalty'

interface DailySale {
  day: string
  total: number
  count: number
}

interface HourlySale {
  hour: string
  total: number
  count: number
}

interface MonthlySale {
  month: string
  total: number
  count: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

interface Summary {
  total_revenue: number
  total_invoices: number
  average_ticket: number
}

export default function ReportsPage(): JSX.Element {
  const { status: loyalty } = useLoyalty()
  // Default to the full current year (1 Jan – 31 Dec).
  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfYear(new Date()), 'yyyy-MM-dd'))
  const [dailySales, setDailySales] = useState<DailySale[]>([])
  const [hourlySales, setHourlySales] = useState<HourlySale[]>([])
  const [monthlySales, setMonthlySales] = useState<MonthlySale[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [viewMode, setViewMode] = useState<'money' | 'points'>('money')
  const [summary, setSummary] = useState<Summary>({
    total_revenue: 0,
    total_invoices: 0,
    average_ticket: 0
  })

  useEffect(() => {
    loadData()
  }, [dateFrom, dateTo, showAllProducts, viewMode])

  const points = viewMode === 'points'
  // Format a metric value per the current view (money vs loyalty points).
  const fmtVal = (n: number): string => (points ? `${Math.round(n)} pts` : formatUSD(n))

  // The chart adapts to the range: a single day → by hour, the "Año" filter →
  // by month (last 12 months), anything else → by day.
  const isSingleDay = dateFrom === dateTo
  const isYear =
    dateFrom === format(startOfYear(new Date()), 'yyyy-MM-dd') &&
    dateTo === format(endOfYear(new Date()), 'yyyy-MM-dd')
  const chartMode: 'hour' | 'month' | 'day' = isSingleDay ? 'hour' : isYear ? 'month' : 'day'

  async function loadData(): Promise<void> {
    const limit = showAllProducts ? 99999 : 10
    // Rolling 12-month window ending this month, for the monthly chart.
    const monthFrom = format(startOfMonth(subMonths(new Date(), 11)), 'yyyy-MM-dd')
    const monthTo = format(endOfMonth(new Date()), 'yyyy-MM-dd')
    const [sales, hourly, monthly, products, sum] = await Promise.all([
      chartMode === 'day'
        ? viewMode === 'points'
          ? window.api.getLoyaltyDailyPoints(dateFrom, dateTo)
          : window.api.getDailySales(dateFrom, dateTo)
        : Promise.resolve([]),
      chartMode === 'hour'
        ? viewMode === 'points'
          ? window.api.getLoyaltyHourlyPoints(dateFrom)
          : window.api.getHourlySales(dateFrom)
        : Promise.resolve([]),
      chartMode === 'month'
        ? viewMode === 'points'
          ? window.api.getLoyaltyMonthlyPoints(monthFrom, monthTo)
          : window.api.getMonthlySales(monthFrom, monthTo)
        : Promise.resolve([]),
      viewMode === 'points'
        ? window.api.getLoyaltyTopProductsByPoints(dateFrom, dateTo, limit)
        : window.api.getTopProducts(dateFrom, dateTo, limit),
      viewMode === 'points'
        ? window.api.getLoyaltyPointsSummary(dateFrom, dateTo)
        : window.api.getSalesSummary(dateFrom, dateTo)
    ])
    setDailySales(sales as DailySale[])
    setHourlySales(hourly as HourlySale[])
    setMonthlySales(monthly as MonthlySale[])
    setTopProducts(products as TopProduct[])
    setSummary(sum as Summary)
  }

  // Fill the gaps between the first and last hour with sales so the bars sit on
  // a continuous timeline (e.g. 08:00 → 20:00) instead of skipping empty hours.
  const hourlyChartData = ((): HourlySale[] => {
    if (hourlySales.length === 0) return []
    const hours = hourlySales.map((h) => parseInt(h.hour, 10))
    const min = Math.min(...hours)
    const max = Math.max(...hours)
    const byHour = new Map(hourlySales.map((h) => [parseInt(h.hour, 10), h]))
    const filled: HourlySale[] = []
    for (let h = min; h <= max; h++) {
      const label = String(h).padStart(2, '0')
      filled.push(byHour.get(h) ?? { hour: label, total: 0, count: 0 })
    }
    return filled
  })()

  // 12 month slots ending this month, zero-filled, with Spanish labels.
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const monthlyChartData = ((): { label: string; total: number }[] => {
    const byMonth = new Map(monthlySales.map((m) => [m.month, m.total]))
    const out: { label: string; total: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const key = format(d, 'yyyy-MM')
      out.push({ label: `${MESES[d.getMonth()]} ${key.slice(2, 4)}`, total: byMonth.get(key) ?? 0 })
    }
    return out
  })()

  // Which quick-filter preset matches the current range, so it can be highlighted.
  const activePreset = ((): string => {
    const today = format(new Date(), 'yyyy-MM-dd')
    if (dateFrom === today && dateTo === today) return 'hoy'
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    if (dateFrom === yesterday && dateTo === yesterday) return 'ayer'
    if (dateTo === today && dateFrom === format(subDays(new Date(), 7), 'yyyy-MM-dd')) return '7'
    if (dateTo === today && dateFrom === format(subDays(new Date(), 30), 'yyyy-MM-dd')) return '30'
    if (
      dateFrom === format(startOfYear(new Date()), 'yyyy-MM-dd') &&
      dateTo === format(endOfYear(new Date()), 'yyyy-MM-dd')
    )
      return 'year'
    return ''
  })()

  return (
    <div className="p-4 landscape:p-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Reportes</h1>
        {loyalty.enabled && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={viewMode === 'money' ? 'default' : 'outline'}
              onClick={() => setViewMode('money')}
            >
              <DollarSign className="mr-1 h-4 w-4" />
              Dinero
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'points' ? 'default' : 'outline'}
              onClick={() => setViewMode('points')}
            >
              <Star className="mr-1 h-4 w-4" />
              Puntos
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Desde</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Hasta</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
        <Button
          variant={activePreset === 'hoy' ? 'default' : 'outline'}
          onClick={() => {
            const today = format(new Date(), 'yyyy-MM-dd')
            setDateFrom(today)
            setDateTo(today)
          }}
        >
          Hoy
        </Button>
        <Button
          variant={activePreset === 'ayer' ? 'default' : 'outline'}
          onClick={() => {
            const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
            setDateFrom(yesterday)
            setDateTo(yesterday)
          }}
        >
          Ayer
        </Button>
        <Button
          variant={activePreset === '7' ? 'default' : 'outline'}
          onClick={() => {
            setDateFrom(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
            setDateTo(format(new Date(), 'yyyy-MM-dd'))
          }}
        >
          7 dias
        </Button>
        <Button
          variant={activePreset === '30' ? 'default' : 'outline'}
          onClick={() => {
            setDateFrom(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
            setDateTo(format(new Date(), 'yyyy-MM-dd'))
          }}
        >
          30 dias
        </Button>
        <Button
          variant={activePreset === 'year' ? 'default' : 'outline'}
          onClick={() => {
            setDateFrom(format(startOfYear(new Date()), 'yyyy-MM-dd'))
            setDateTo(format(endOfYear(new Date()), 'yyyy-MM-dd'))
          }}
        >
          Año
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 landscape:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">
              {points ? 'Puntos Otorgados' : 'Ingresos Totales'}
            </CardTitle>
            {points ? (
              <Star className="h-4 w-4 text-amber-500" />
            ) : (
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtVal(summary.total_revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Total Facturas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.total_invoices}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">
              {points ? 'Puntos por Factura' : 'Ticket Promedio'}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtVal(summary.average_ticket)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales chart — by hour for a single day, by date for a range */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {(points ? 'Puntos' : 'Ventas') +
              (chartMode === 'hour' ? ' por Hora' : chartMode === 'month' ? ' por Mes' : chartMode === 'day' ? ' Diarias' : '')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartMode === 'month' ? (
            monthlySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => (points ? `${v}` : `$${v}`)} />
                  <Tooltip
                    formatter={(value: number) => [fmtVal(value), points ? 'Puntos' : 'Total']}
                  />
                  <Bar dataKey="total" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No hay datos en los ultimos 12 meses
              </p>
            )
          ) : chartMode === 'hour' ? (
            hourlySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(v) => `${v}:00`}
                    fontSize={12}
                    interval={1}
                  />
                  <YAxis fontSize={12} tickFormatter={(v) => (points ? `${v}` : `$${v}`)} />
                  <Tooltip
                    formatter={(value: number) => [fmtVal(value), points ? 'Puntos' : 'Total']}
                    labelFormatter={(label) => `${label}:00 - ${label}:59`}
                  />
                  <Bar dataKey="total" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No hay ventas en el dia seleccionado
              </p>
            )
          ) : dailySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM')}
                  fontSize={12}
                />
                <YAxis fontSize={12} tickFormatter={(v) => (points ? `${v}` : `$${v}`)} />
                <Tooltip
                  formatter={(value: number) => [fmtVal(value), points ? 'Puntos' : 'Total']}
                  labelFormatter={(label) => format(new Date(label + 'T00:00:00'), 'dd/MM/yyyy')}
                />
                <Bar dataKey="total" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No hay datos para el periodo seleccionado
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top products */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            {showAllProducts ? 'Todos los Productos' : 'Top 10 Productos'}
            {topProducts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({topProducts.length})
              </span>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={!showAllProducts ? 'default' : 'outline'}
              className="gap-1"
              onClick={() => setShowAllProducts(false)}
            >
              <Trophy className="h-3.5 w-3.5" />
              Top 10
            </Button>
            <Button
              size="sm"
              variant={showAllProducts ? 'default' : 'outline'}
              className="gap-1"
              onClick={() => setShowAllProducts(true)}
            >
              <List className="h-3.5 w-3.5" />
              Todos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            <>
              <div className="hidden landscape:block border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">Producto</th>
                      <th className="text-right p-3 font-medium">Cantidad</th>
                      <th className="text-right p-3 font-medium">{points ? 'Puntos' : 'Ingreso'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3">{p.name}</td>
                        <td className="p-3 text-right">{p.quantity}</td>
                        <td className="p-3 text-right font-semibold">{fmtVal(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="landscape:hidden space-y-2">
                {topProducts.map((p, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="font-medium">
                      <span className="text-muted-foreground">{i + 1}. </span>
                      {p.name}
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Cantidad</span>
                      <span className="font-medium text-foreground">{p.quantity}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{points ? 'Puntos' : 'Ingreso'}</span>
                      <span className="font-medium text-foreground">{fmtVal(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No hay datos para el periodo seleccionado
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
