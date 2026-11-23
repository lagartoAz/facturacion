import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save } from 'lucide-react'
import { useLoyalty, type LoyaltyStatus } from '@/hooks/useLoyalty'
import { Toggle } from './controls'

const CURRENCIES = ['', 'USD', 'VES', 'COP']

export default function LoyaltyRules(): JSX.Element {
  const { status, refresh } = useLoyalty()
  const [cfg, setCfg] = useState<LoyaltyStatus>(status)

  useEffect(() => setCfg(status), [status])

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
      raffle_min_points: cfg.raffle_min_points,
      exclude_red_debtors: cfg.exclude_red_debtors,
      tickets_enabled: cfg.tickets_enabled
    })
    await refresh()
    alert('Reglas guardadas')
  }

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
            hint="Cada producto otorga sus propios puntos (se editan en cada producto, en Productos)"
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
              <Toggle
                label="Bloquear deudores en rojo"
                hint="Un cliente deudor crítico (rojo) no participa aunque tenga puntos"
                checked={cfg.exclude_red_debtors}
                onChange={(v) => upd('exclude_red_debtors', v)}
              />
              <Toggle
                label="Tickets físicos imprimibles"
                hint="Imprime tickets por compra para un pote físico (se pueden imprimir luego desde Facturas)"
                checked={cfg.tickets_enabled}
                onChange={(v) => upd('tickets_enabled', v)}
              />
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

      {cfg.earn_product && (
        <p className="text-sm text-muted-foreground">
          Los puntos de cada producto se configuran al editar el producto, en la sección
          <strong> Productos</strong>.
        </p>
      )}
    </div>
  )
}
