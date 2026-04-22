import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatUSD, formatVES, formatCOP, convertCurrency } from '@/lib/currency'
import { format, subDays } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import {
  DollarSign,
  FileText,
  ShoppingCart,
  AlertTriangle,
  Plus,
  TrendingUp
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

interface ExchangeRate {
  currency: string
  rate: number
}

export default function DashboardPage(): JSX.Element {
  const navigate = useNavigate()
  const [todaySummary, setTodaySummary] = useState<Summary>({
    total_revenue: 0,
    total_invoices: 0,
    average_ticket: 0
  })
  const [weekSales, setWeekSales] = useState<DailySale[]>([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [rates, setRates] = useState<ExchangeRate[]>([])

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard(): Promise<void> {
    const today = format(new Date(), 'yyyy-MM-dd')
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    const [summary, sales, products, ratesData] = await Promise.all([
      window.api.getSalesSummary(today, today),
      window.api.getDailySales(weekAgo, today),
      window.api.getProducts({ active_only: true }),
      window.api.getExchangeRates()
    ])

    setTodaySummary(summary)
    setWeekSales(sales)
    setRates(ratesData)

    // Count low stock products
    const lowStock = products.filter(
      (p: { stock: number; min_stock: number }) => p.stock <= p.min_stock
    )
    setLowStockCount(lowStock.length)
  }

  const getRate = (currency: string): number =>
    rates.find((r) => r.currency === currency)?.rate ?? 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
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

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Ventas Hoy (USD)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(todaySummary.total_revenue)}</p>
            {getRate('VES') > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatVES(convertCurrency(todaySummary.total_revenue, getRate('VES')))}
              </p>
            )}
            {getRate('COP') > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatCOP(convertCurrency(todaySummary.total_revenue, getRate('COP')))}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Facturas Hoy</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{todaySummary.total_invoices}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(todaySummary.average_ticket)}</p>
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
      </div>

      {/* Week chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ventas - Ultimos 7 Dias</CardTitle>
        </CardHeader>
        <CardContent>
          {weekSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weekSales}>
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM')}
                  fontSize={12}
                />
                <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value: number) => [formatUSD(value), 'Total']}
                  labelFormatter={(label) => format(new Date(label + 'T00:00:00'), 'dd/MM/yyyy')}
                />
                <Bar dataKey="total" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
