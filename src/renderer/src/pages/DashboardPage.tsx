import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatUSD, formatVES, formatCOP, convertCurrency } from '@/lib/currency'
import { format, subDays, startOfYear, endOfYear, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { CartesianGrid, Line, LineChart, XAxis, BarChart, Bar } from 'recharts'
import { useLoyalty } from '@/hooks/useLoyalty'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import {
  DollarSign,
  FileText,
  ShoppingCart,
  AlertTriangle,
  Plus,
  TrendingUp,
  Users,
  ArrowRightLeft,
  Trophy,
  Ticket
} from 'lucide-react'

interface DailySale {
  day: string
  total: number
  count: number
}

interface Summary {
  total_revenue: number
  total_invoices: number
  average_ticket: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

interface ExchangeRate {
  currency: string
  rate: number
}

const chartConfig = {
  total: {
    label: 'Ventas (USD)',
    color: 'hsl(221.2, 83.2%, 53.3%)'
  }
} satisfies ChartConfig

const TODAY = (): string => format(new Date(), 'yyyy-MM-dd')

export default function DashboardPage(): JSX.Element {
  const navigate = useNavigate()
  // Period that drives the sales / invoices / top-products cards. Defaults to
  // "today" so the Home opens showing the current day.
  const [periodFrom, setPeriodFrom] = useState(TODAY)
  const [periodTo, setPeriodTo] = useState(TODAY)
  const [periodSummary, setPeriodSummary] = useState<Summary>({
    total_revenue: 0,
    total_invoices: 0,
    average_ticket: 0
  })
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [weekSales, setWeekSales] = useState<DailySale[]>([])
  const [monthSales, setMonthSales] = useState<{ month: string; total: number }[]>([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [criticalDebtors, setCriticalDebtors] = useState(0)
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const { status: loyalty } = useLoyalty()
  const [raffle, setRaffle] = useState<{ name: string; participants: number; entries: number } | null>(
    null
  )

  // Figures tied to the chosen period reload whenever it changes.
  useEffect(() => {
    void loadPeriod()
  }, [periodFrom, periodTo])

  // Figures independent of the period load once.
  useEffect(() => {
    void loadStatic()
  }, [])

  // When the "Año" preset is active, load the last 12 months for the chart.
  useEffect(() => {
    const isYear =
      periodFrom === format(startOfYear(new Date()), 'yyyy-MM-dd') &&
      periodTo === format(endOfYear(new Date()), 'yyyy-MM-dd')
    if (!isYear) {
      setMonthSales([])
      return
    }
    const from = format(startOfMonth(subMonths(new Date(), 11)), 'yyyy-MM-dd')
    const to = format(endOfMonth(new Date()), 'yyyy-MM-dd')
    void (window.api.getMonthlySales(from, to) as Promise<{ month: string; total: number }[]>).then(
      setMonthSales
    )
  }, [periodFrom, periodTo])

  // Active-raffle stats (distinct participants + total participations).
  useEffect(() => {
    if (!loyalty.enabled || !loyalty.raffle_enabled) {
      setRaffle(null)
      return
    }
    void (async () => {
      const r = (await window.api.getActiveRaffle()) as { id: number; name: string } | null
      if (!r) {
        setRaffle(null)
        return
      }
      const parts = (await window.api.getRaffleParticipants(r.id)) as { entries: number }[]
      setRaffle({
        name: r.name,
        participants: parts.length,
        entries: parts.reduce((s, p) => s + p.entries, 0)
      })
    })()
  }, [loyalty.enabled, loyalty.raffle_enabled])

  async function loadPeriod(): Promise<void> {
    const [summary, top] = await Promise.all([
      window.api.getSalesSummary(periodFrom, periodTo) as Promise<Summary>,
      window.api.getTopProducts(periodFrom, periodTo, 5) as Promise<TopProduct[]>
    ])
    setPeriodSummary(summary)
    setTopProducts(top)
  }

  async function loadStatic(): Promise<void> {
    const today = format(new Date(), 'yyyy-MM-dd')
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    const [sales, lowStock, ratesData, balances, thresholdRaw] = await Promise.all([
      window.api.getDailySales(weekAgo, today) as Promise<DailySale[]>,
      window.api.getLowStockCount(),
      window.api.getExchangeRates() as Promise<ExchangeRate[]>,
      window.api.getCustomerBalances() as Promise<Record<number, number>>,
      window.api.getSetting('critical_debt_threshold') as Promise<string | null>
    ])

    setWeekSales(sales)
    setRates(ratesData)
    setLowStockCount(lowStock)

    const threshold = parseFloat(thresholdRaw ?? '') || 40
    setCriticalDebtors(Object.values(balances).filter((b) => b > threshold).length)
  }

  const getRate = (currency: string): number =>
    rates.find((r) => r.currency === currency)?.rate ?? 0

  const isToday = periodFrom === periodTo && periodTo === format(new Date(), 'yyyy-MM-dd')
  const periodLabel = isToday
    ? 'Hoy'
    : periodFrom === periodTo
      ? format(new Date(periodFrom + 'T00:00:00'), 'dd/MM/yyyy')
      : `${format(new Date(periodFrom + 'T00:00:00'), 'dd/MM')} – ${format(new Date(periodTo + 'T00:00:00'), 'dd/MM')}`

  function setToday(): void {
    const t = format(new Date(), 'yyyy-MM-dd')
    setPeriodFrom(t)
    setPeriodTo(t)
  }
  function setYesterday(): void {
    const y = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    setPeriodFrom(y)
    setPeriodTo(y)
  }
  function setLastDays(n: number): void {
    setPeriodFrom(format(subDays(new Date(), n), 'yyyy-MM-dd'))
    setPeriodTo(format(new Date(), 'yyyy-MM-dd'))
  }
  function setYear(): void {
    setPeriodFrom(format(startOfYear(new Date()), 'yyyy-MM-dd'))
    setPeriodTo(format(endOfYear(new Date()), 'yyyy-MM-dd'))
  }

  // Which quick-filter preset matches the current period, so it can be
  // highlighted. Home opens on "Hoy" by default.
  const activePreset = ((): string => {
    const today = format(new Date(), 'yyyy-MM-dd')
    if (periodFrom === today && periodTo === today) return 'hoy'
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    if (periodFrom === yesterday && periodTo === yesterday) return 'ayer'
    if (periodTo === today && periodFrom === format(subDays(new Date(), 7), 'yyyy-MM-dd')) return '7'
    if (periodTo === today && periodFrom === format(subDays(new Date(), 30), 'yyyy-MM-dd'))
      return '30'
    if (
      periodFrom === format(startOfYear(new Date()), 'yyyy-MM-dd') &&
      periodTo === format(endOfYear(new Date()), 'yyyy-MM-dd')
    )
      return 'year'
    return ''
  })()

  // Year preset → show the last 12 months (zero-filled, Spanish labels).
  const showMonthly = activePreset === 'year'
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const monthlyChartData = ((): { label: string; total: number }[] => {
    const byMonth = new Map(monthSales.map((m) => [m.month, m.total]))
    const out: { label: string; total: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const key = format(d, 'yyyy-MM')
      out.push({ label: `${MESES[d.getMonth()]} ${key.slice(2, 4)}`, total: byMonth.get(key) ?? 0 })
    }
    return out
  })()

  return (
    <div className="p-4 landscape:p-6 space-y-6">
      <div className="flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Home</h1>
          <p className="text-muted-foreground">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/pos')}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Nueva Venta
          </Button>
          <Button variant="outline" onClick={() => navigate('/products')}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar Producto
          </Button>
        </div>
      </div>

      {/* Period filter — drives the sales, invoices and top-products cards. */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="w-40" />
        </div>
        <Button variant={activePreset === 'hoy' ? 'default' : 'outline'} size="sm" onClick={setToday}>Hoy</Button>
        <Button variant={activePreset === 'ayer' ? 'default' : 'outline'} size="sm" onClick={setYesterday}>Ayer</Button>
        <Button variant={activePreset === '7' ? 'default' : 'outline'} size="sm" onClick={() => setLastDays(7)}>7 dias</Button>
        <Button variant={activePreset === '30' ? 'default' : 'outline'} size="sm" onClick={() => setLastDays(30)}>30 dias</Button>
        <Button variant={activePreset === 'year' ? 'default' : 'outline'} size="sm" onClick={setYear}>Año</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 landscape:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Ventas (USD)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(periodSummary.total_revenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
            {getRate('VES') > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatVES(convertCurrency(periodSummary.total_revenue, getRate('VES')))}
              </p>
            )}
            {getRate('COP') > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatCOP(convertCurrency(periodSummary.total_revenue, getRate('COP')))}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Facturas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{periodSummary.total_invoices}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(periodSummary.average_ticket)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Tasa de Cambio</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">1 USD</span>
              <span className="text-lg font-bold">
                {getRate('VES') > 0 ? formatVES(getRate('VES')) : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">1 USD</span>
              <span className="text-lg font-bold">
                {getRate('COP') > 0 ? formatCOP(getRate('COP')) : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${lowStockCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`}
            />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-red-500' : ''}`}>
              {lowStockCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">productos</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => navigate('/customers')}
        >
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Deudores Criticos</CardTitle>
            <Users
              className={`h-4 w-4 ${criticalDebtors > 0 ? 'text-red-500' : 'text-muted-foreground'}`}
            />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${criticalDebtors > 0 ? 'text-red-500' : ''}`}>
              {criticalDebtors}
            </p>
            <p className="text-xs text-muted-foreground mt-1">clientes</p>
          </CardContent>
        </Card>
        {raffle && (
          <Card
            className="cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => navigate('/loyalty')}
          >
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-medium">Rifa: {raffle.name}</CardTitle>
              <Ticket className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{raffle.participants}</p>
              <p className="text-xs text-muted-foreground mt-1">
                participantes · {raffle.entries} participaciones
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top 5 products for the selected period */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Top 5 Productos
          </CardTitle>
          <span className="text-sm font-normal text-muted-foreground">{periodLabel}</span>
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-muted-foreground">{p.quantity} uds</span>
                  <span className="font-semibold w-24 text-right">{formatUSD(p.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">
              No hay ventas en el periodo seleccionado
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sales chart: last 12 months when "Año" is selected, else last 7 days */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {showMonthly ? 'Ventas - Ultimos 12 Meses' : 'Ventas - Ultimos 7 Dias'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showMonthly ? (
            <ChartContainer config={chartConfig}>
              <BarChart accessibilityLayer data={monthlyChartData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : weekSales.length > 0 ? (
            <ChartContainer config={chartConfig}>
              <LineChart
                accessibilityLayer
                data={weekSales}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM')}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) =>
                        format(new Date(label + 'T00:00:00'), 'dd/MM/yyyy')
                      }
                    />
                  }
                />
                <Line
                  dataKey="total"
                  type="natural"
                  stroke="var(--color-total)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No hay ventas en los ultimos 7 dias
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
