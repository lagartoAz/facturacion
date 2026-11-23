import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save } from 'lucide-react'
import { useLoyalty, type LoyaltyStatus } from '@/hooks/useLoyalty'
import { Toggle } from './controls'

interface Product {
  id: number
  name: string
}

const CURRENCIES = ['', 'USD', 'VES', 'COP']

export default function LoyaltyRules(): JSX.Element {
  const { status, refresh } = useLoyalty()
  const [cfg, setCfg] = useState<LoyaltyStatus>(status)
  const [products, setProducts] = useState<Product[]>([])
  const [productPoints, setProductPoints] = useState<Record<number, number>>({})
  const [productSearch, setProductSearch] = useState('')

  useEffect(() => setCfg(status), [status])

  useEffect(() => {
    void (async () => {
      const [prods, pp] = await Promise.all([
        window.api.getProducts() as Promise<Product[]>,
        window.api.getLoyaltyProductPoints() as Promise<{ product_id: number; points: number }[]>
      ])
      setProducts(prods)
      setProductPoints(Object.fromEntries(pp.map((p) => [p.product_id, p.points])))
    })()
  }, [])

  const upd = <K extends keyof LoyaltyStatus>(key: K, value: LoyaltyStatus[K]): void =>
    setCfg((c) => ({ ...c, [key]: value }))

  async function save(): Promise<void> {
    await window.api.setLoyaltyConfig({
      earn_money: cfg.earn_money,
      points_per_usd: cfg.points_per_usd,
      earn_product: cfg.earn_product,
      earn_invoice: cfg.earn_invoice,
      points_per_invoice: cfg.points_per_invoice,
      currency_filter: cfg.currency_filter,
      exclude_credit: cfg.exclude_credit,
      rewards_enabled: cfg.rewards_enabled,
      raffle_enabled: cfg.raffle_enabled,
      raffle_points_per_entry: cfg.raffle_points_per_entry,
      raffle_min_points: cfg.raffle_min_points
    })
    await refresh()
    alert('Reglas guardadas')
  }

  async function saveProductPoints(productId: number, value: string): Promise<void> {
    const pts = parseInt(value, 10) || 0
    setProductPoints((m) => ({ ...m, [productId]: pts }))
    await window.api.setLoyaltyProductPoints(productId, pts)
  }

  const shownProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Earning rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Formas de ganar puntos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Puedes activar varias a la vez; los puntos de cada regla se suman. Solo las facturas de
            un cliente registrado acumulan.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="Por dinero gastado"
            hint="Puntos por cada 1 USD de la venta"
            checked={cfg.earn_money}
            onChange={(v) => upd('earn_money', v)}
          />
          {cfg.earn_money && (
            <div className="ml-3 flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Puntos por 1 USD</label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={cfg.points_per_usd}
                onChange={(e) => upd('points_per_usd', parseFloat(e.target.value) || 0)}
                className="w-28"
              />
            </div>
          )}

          <Toggle
            label="Por factura finalizada"
            hint="Puntos fijos por cada factura"
            checked={cfg.earn_invoice}
            onChange={(v) => upd('earn_invoice', v)}
          />
          {cfg.earn_invoice && (
            <div className="ml-3 flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Puntos por factura</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={cfg.points_per_invoice}
                onChange={(e) => upd('points_per_invoice', parseFloat(e.target.value) || 0)}
                className="w-28"
              />
            </div>
          )}

          <Toggle
            label="Por producto"
            hint="Cada producto otorga sus propios puntos (configúralos abajo)"
            checked={cfg.earn_product}
            onChange={(v) => upd('earn_product', v)}
          />
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Condiciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="Excluir facturas a crédito"
            hint="No acumular puntos en ventas a crédito"
            checked={cfg.exclude_credit}
            onChange={(v) => upd('exclude_credit', v)}
          />
          <div className="space-y-1">
            <label className="text-sm font-medium">Solo compras en divisa</label>
            <p className="text-xs text-muted-foreground">
              Si eliges una divisa, solo acumulan las ventas pagadas en esa moneda.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {CURRENCIES.map((c) => (
                <Button
                  key={c || 'none'}
                  size="sm"
                  variant={cfg.currency_filter === c ? 'default' : 'outline'}
                  onClick={() => upd('currency_filter', c)}
                >
                  {c === '' ? 'Todas' : c}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What points unlock */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uso de los puntos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="Premios / descuentos"
            hint="Los clientes canjean puntos por premios del catálogo"
            checked={cfg.rewards_enabled}
            onChange={(v) => upd('rewards_enabled', v)}
          />
          <Toggle
            label="Rifa"
            hint="Los puntos otorgan participaciones en una rifa"
            checked={cfg.raffle_enabled}
            onChange={(v) => upd('raffle_enabled', v)}
          />
          {cfg.raffle_enabled && (
            <div className="ml-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="w-56 text-sm text-muted-foreground">
                  Puntos por participación
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={cfg.raffle_points_per_entry}
                  onChange={(e) =>
                    upd('raffle_points_per_entry', parseFloat(e.target.value) || 0)
                  }
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">(0 = una sola por cliente)</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-56 text-sm text-muted-foreground">
                  Puntos mínimos para participar
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={cfg.raffle_min_points}
                  onChange={(e) => upd('raffle_min_points', parseFloat(e.target.value) || 0)}
                  className="w-28"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save}>
          <Save className="mr-2 h-4 w-4" />
          Guardar reglas
        </Button>
      </div>

      {/* Per-product points */}
      {cfg.earn_product && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Puntos por producto</CardTitle>
            <p className="text-sm text-muted-foreground">
              Puntos otorgados por cada unidad vendida. Deja 0 para no dar puntos.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Buscar producto…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="max-h-96 divide-y overflow-y-auto rounded-lg border">
              {shownProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-2">
                  <span className="truncate text-sm">{p.name}</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={productPoints[p.id] ?? 0}
                    onBlur={(e) => void saveProductPoints(p.id, e.target.value)}
                    className="w-24"
                  />
                </div>
              ))}
              {shownProducts.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">Sin productos</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
