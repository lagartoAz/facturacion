import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, Coins, Ticket } from 'lucide-react'
import {
  useLoyalty,
  pointsActive,
  ticketsActive,
  type LoyaltyStatus
} from '@/hooks/useLoyalty'
import { Toggle } from './controls'

const CURRENCIES = ['', 'USD', 'VES', 'COP']

const MODES: { value: LoyaltyStatus['mode']; label: string; hint: string }[] = [
  { value: 'points', label: 'Solo puntos', hint: 'Los clientes acumulan puntos (con niveles y premios).' },
  { value: 'tickets', label: 'Solo tickets', hint: 'Los clientes acumulan tickets para la rifa.' },
  { value: 'both', label: 'Puntos y tickets', hint: 'Ambas monedas, con reglas independientes.' }
]

export default function LoyaltyRules(): JSX.Element {
  const { status, refresh } = useLoyalty()
  const [cfg, setCfg] = useState<LoyaltyStatus>(status)

  useEffect(() => setCfg(status), [status])

  const upd = <K extends keyof LoyaltyStatus>(key: K, value: LoyaltyStatus[K]): void =>
    setCfg((c) => ({ ...c, [key]: value }))

  const withPoints = pointsActive(cfg.mode)
  const withTickets = ticketsActive(cfg.mode)

  async function save(): Promise<void> {
    await window.api.setLoyaltyConfig({
      mode: cfg.mode,
      earn_money: cfg.earn_money,
      points_per_usd: cfg.points_per_usd,
      earn_product: cfg.earn_product,
      earn_invoice: cfg.earn_invoice,
      points_per_invoice: cfg.points_per_invoice,
      currency_filter: cfg.currency_filter,
      exclude_credit: cfg.exclude_credit,
      cap_points_enabled: cfg.cap_points_enabled,
      max_points_per_invoice: cfg.max_points_per_invoice,
      cap_tickets_enabled: cfg.cap_tickets_enabled,
      max_tickets_per_invoice: cfg.max_tickets_per_invoice,
      max_tickets_accumulable: cfg.max_tickets_accumulable,
      tickets_earn_invoice: cfg.tickets_earn_invoice,
      tickets_per_invoice: cfg.tickets_per_invoice,
      tickets_earn_money: cfg.tickets_earn_money,
      usd_per_ticket: cfg.usd_per_ticket,
      levels_enabled: cfg.levels_enabled,
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
      {/* Mode selector — the first card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modo del programa</CardTitle>
          <p className="text-sm text-muted-foreground">
            Elige qué monedas usa tu programa de fidelidad.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => upd('mode', m.value)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  cfg.mode === m.value
                    ? 'border-primary bg-primary/10'
                    : 'hover:bg-muted/40'
                }`}
              >
                <span className="block font-semibold">{m.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Earning rules — points */}
      {withPoints && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5" />
              Formas de ganar puntos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Puedes activar varias a la vez; los puntos de cada regla se suman. Solo las
              facturas de un cliente registrado acumulan.
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

            <Toggle
              label="Limitar puntos por factura"
              hint="Tope máximo de puntos que puede dar una sola factura"
              checked={cfg.cap_points_enabled}
              onChange={(v) => upd('cap_points_enabled', v)}
            />
            {cfg.cap_points_enabled && (
              <div className="ml-3 flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Máximo de puntos por factura</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={cfg.max_points_per_invoice}
                  onChange={(e) => upd('max_points_per_invoice', parseFloat(e.target.value) || 0)}
                  className="w-28"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Earning rules — tickets */}
      {withTickets && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ticket className="h-5 w-5" />
              Formas de ganar tickets
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Los tickets son participaciones de rifa y se ganan con reglas propias,
              independientes de los puntos.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Toggle
              label="Por factura finalizada"
              hint="Tickets fijos por cada factura"
              checked={cfg.tickets_earn_invoice}
              onChange={(v) => upd('tickets_earn_invoice', v)}
            />
            {cfg.tickets_earn_invoice && (
              <div className="ml-3 flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Tickets por factura</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={cfg.tickets_per_invoice}
                  onChange={(e) => upd('tickets_per_invoice', parseFloat(e.target.value) || 0)}
                  className="w-28"
                />
              </div>
            )}

            <Toggle
              label="Por dinero gastado"
              hint="1 ticket por cada N USD de la venta"
              checked={cfg.tickets_earn_money}
              onChange={(v) => upd('tickets_earn_money', v)}
            />
            {cfg.tickets_earn_money && (
              <div className="ml-3 flex items-center gap-2">
                <label className="text-sm text-muted-foreground">USD por cada ticket</label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={cfg.usd_per_ticket}
                  onChange={(e) => upd('usd_per_ticket', parseFloat(e.target.value) || 0)}
                  className="w-28"
                />
              </div>
            )}

            <Toggle
              label="Limitar tickets por factura"
              hint="Tope máximo de tickets que puede dar una sola factura"
              checked={cfg.cap_tickets_enabled}
              onChange={(v) => upd('cap_tickets_enabled', v)}
            />
            {cfg.cap_tickets_enabled && (
              <div className="ml-3 flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Máximo de tickets por factura</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={cfg.max_tickets_per_invoice}
                  onChange={(e) => upd('max_tickets_per_invoice', parseFloat(e.target.value) || 0)}
                  className="w-28"
                />
              </div>
            )}

            <div className="flex items-center gap-2 rounded-lg border p-3">
              <label className="flex-1 text-sm">
                <span className="block font-medium">Máximo de tickets acumulables</span>
                <span className="block text-xs text-muted-foreground">
                  Tope de tickets que un cliente puede acumular para la rifa (0 = sin límite)
                </span>
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={cfg.max_tickets_accumulable}
                onChange={(e) => upd('max_tickets_accumulable', parseFloat(e.target.value) || 0)}
                className="w-24"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Condiciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="Excluir facturas a crédito"
            hint="No acumular en ventas a crédito"
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

      {/* What points/tickets unlock */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {withPoints && (
            <>
              <Toggle
                label="Premios / descuentos"
                hint="Los clientes canjean puntos por premios del catálogo"
                checked={cfg.rewards_enabled}
                onChange={(v) => upd('rewards_enabled', v)}
              />
              <Toggle
                label="Niveles de cliente"
                hint="Clasifica a los clientes por nivel (casual, bronce, plata, oro, diamante) con sus beneficios"
                checked={cfg.levels_enabled}
                onChange={(v) => upd('levels_enabled', v)}
              />
            </>
          )}
          <Toggle
            label="Rifa"
            hint={
              withTickets
                ? 'Los tickets otorgan participaciones en la rifa'
                : 'Los puntos otorgan participaciones en la rifa'
            }
            checked={cfg.raffle_enabled}
            onChange={(v) => upd('raffle_enabled', v)}
          />
          {cfg.raffle_enabled && !withTickets && (
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
                  onChange={(e) => upd('raffle_points_per_entry', parseFloat(e.target.value) || 0)}
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
          {cfg.raffle_enabled && (
            <div className="ml-3 space-y-2">
              <Toggle
                label="Bloquear deudores en rojo"
                hint="Un cliente deudor crítico (rojo) no participa aunque acumule"
                checked={cfg.exclude_red_debtors}
                onChange={(v) => upd('exclude_red_debtors', v)}
              />
              <Toggle
                label="Imprimir tickets físicos"
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

      {withPoints && cfg.earn_product && (
        <p className="text-sm text-muted-foreground">
          Los puntos de cada producto se configuran al editar el producto, en la sección
          <strong> Productos</strong>.
        </p>
      )}
    </div>
  )
}
