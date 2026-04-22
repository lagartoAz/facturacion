import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatUSD } from '@/lib/currency'
import { format, subDays } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { TrendingUp, FileText, DollarSign } from 'lucide-react'

interface DailySale {
  day: string
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
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dailySales, setDailySales] = useState<DailySale[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_revenue: 0,
    total_invoices: 0,
    average_ticket: 0
  })

  useEffect(() => {
    loadData()
  }, [dateFrom, dateTo])

  async function loadData(): Promise<void> {
    const [sales, products, sum] = await Promise.all([
      window.api.getDailySales(dateFrom, dateTo),
      window.api.getTopProducts(dateFrom, dateTo, 10),
      window.api.getSalesSummary(dateFrom, dateTo)
    ])
    setDailySales(sales)
    setTopProducts(products)
    setSummary(sum)
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Reportes</h1>

      <div className="flex gap-4 items-end">
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
          variant="outline"
          onClick={() => {
            const today = format(new Date(), 'yyyy-MM-dd')
            setDateFrom(today)
            setDateTo(today)
          }}
        >
          Hoy
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
            setDateFrom(yesterday)
            setDateTo(yesterday)
          }}
        >
          Ayer
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setDateFrom(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
            setDateTo(format(new Date(), 'yyyy-MM-dd'))
          }}
        >
          7 dias
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setDateFrom(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
            setDateTo(format(new Date(), 'yyyy-MM-dd'))
          }}
        >
          30 dias
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(summary.total_revenue)}</p>
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
            <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(summary.average_ticket)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily sales chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ventas Diarias</CardTitle>
        </CardHeader>
        <CardContent>
          {dailySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" />
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
              No hay datos para el periodo seleccionado
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top 10 Productos</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">#</th>
                    <th className="text-left p-3 font-medium">Producto</th>
                    <th className="text-right p-3 font-medium">Cantidad</th>
                    <th className="text-right p-3 font-medium">Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 text-muted-foreground">{i + 1}</td>
                      <td className="p-3">{p.name}</td>
                      <td className="p-3 text-right">{p.quantity}</td>
                      <td className="p-3 text-right font-semibold">{formatUSD(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
