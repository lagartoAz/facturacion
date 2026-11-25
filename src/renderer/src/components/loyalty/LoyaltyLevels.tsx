import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Award, Plus, Trash2, Save, Gift } from 'lucide-react'
import { useLoyalty } from '@/hooks/useLoyalty'

interface Level {
  id: number
  name: string
  min_points: number
  sort_order: number
  color: string | null
}

type BenefitKind = 'discount_fixed' | 'monthly_coupon' | 'monthly_raffle' | 'custom'

interface Benefit {
  id?: number
  level_id?: number
  kind: BenefitKind
  value: number
  unit: string | null
  note: string | null
}

const BENEFIT_KINDS: { value: BenefitKind; label: string }[] = [
  { value: 'discount_fixed', label: 'Descuento fijo' },
  { value: 'monthly_coupon', label: 'Cupón mensual' },
  { value: 'monthly_raffle', label: 'Rifa mensual del nivel' },
  { value: 'custom', label: 'Personalizado' }
]

function benefitLabel(kind: BenefitKind): string {
  return BENEFIT_KINDS.find((k) => k.value === kind)?.label ?? kind
}

export default function LoyaltyLevels(): JSX.Element {
  const { status, refresh } = useLoyalty()
  const [levels, setLevels] = useState<Level[]>([])
  const [benefits, setBenefits] = useState<Record<number, Benefit[]>>({})
  const [windowMonths, setWindowMonths] = useState(String(status.level_window_months))

  useEffect(() => setWindowMonths(String(status.level_window_months)), [status.level_window_months])

  const load = useCallback(async (): Promise<void> => {
    const ls = (await window.api.listLoyaltyLevels()) as Level[]
    setLevels(ls)
    const map: Record<number, Benefit[]> = {}
    for (const l of ls) {
      map[l.id] = (await window.api.getLevelBenefits(l.id)) as Benefit[]
    }
    setBenefits(map)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveWindow(): Promise<void> {
    await window.api.setLoyaltyConfig({ level_window_months: parseInt(windowMonths, 10) || 0 })
    await refresh()
    alert('Ventana de cálculo guardada')
  }

  function updLevel(id: number, patch: Partial<Level>): void {
    setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function saveLevel(l: Level): Promise<void> {
    await window.api.updateLoyaltyLevel(l.id, {
      name: l.name,
      min_points: l.min_points,
      sort_order: l.sort_order,
      color: l.color
    })
    await window.api.setLevelBenefits(
      l.id,
      (benefits[l.id] ?? []).map((b) => ({
        kind: b.kind,
        value: b.value,
        unit: b.unit,
        note: b.note
      }))
    )
    await load()
    alert(`Nivel "${l.name}" guardado`)
  }

  async function addLevel(): Promise<void> {
    const sort = levels.length ? Math.max(...levels.map((l) => l.sort_order)) + 1 : 0
    await window.api.createLoyaltyLevel({
      name: 'Nuevo nivel',
      min_points: 0,
      sort_order: sort,
      color: '#94a3b8'
    })
    await load()
  }

  async function removeLevel(id: number): Promise<void> {
    if (!confirm('¿Eliminar este nivel?')) return
    await window.api.deleteLoyaltyLevel(id)
    await load()
  }

  function updBenefit(levelId: number, idx: number, patch: Partial<Benefit>): void {
    setBenefits((b) => ({
      ...b,
      [levelId]: (b[levelId] ?? []).map((x, i) => (i === idx ? { ...x, ...patch } : x))
    }))
  }

  function addBenefit(levelId: number): void {
    setBenefits((b) => ({
      ...b,
      [levelId]: [
        ...(b[levelId] ?? []),
        { kind: 'discount_fixed', value: 0, unit: 'pct', note: '' }
      ]
    }))
  }

  function removeBenefit(levelId: number, idx: number): void {
    setBenefits((b) => ({
      ...b,
      [levelId]: (b[levelId] ?? []).filter((_, i) => i !== idx)
    }))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5" />
            Niveles de cliente
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            El nivel se calcula por los puntos <strong>ganados</strong> en los últimos meses.
            Canjear puntos no baja de nivel.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ventana de cálculo (meses)</label>
            <Input
              type="number"
              min="0"
              step="1"
              value={windowMonths}
              onChange={(e) => setWindowMonths(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">0 = puntos ganados de por vida</p>
          </div>
          <Button variant="outline" onClick={saveWindow}>
            <Save className="mr-2 h-4 w-4" />
            Guardar ventana
          </Button>
          <div className="flex-1" />
          <Button onClick={addLevel}>
            <Plus className="mr-1 h-4 w-4" />
            Nuevo nivel
          </Button>
        </CardContent>
      </Card>

      {levels.map((l) => (
        <Card key={l.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <span
                className="inline-block h-4 w-4 rounded-full border"
                style={{ backgroundColor: l.color ?? '#94a3b8' }}
              />
              {l.name}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => removeLevel(l.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input
                  value={l.name}
                  onChange={(e) => updLevel(l.id, { name: e.target.value })}
                  className="w-44"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Puntos mínimos (en ventana)</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={l.min_points}
                  onChange={(e) => updLevel(l.id, { min_points: parseInt(e.target.value) || 0 })}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Orden</label>
                <Input
                  type="number"
                  step="1"
                  value={l.sort_order}
                  onChange={(e) => updLevel(l.id, { sort_order: parseInt(e.target.value) || 0 })}
                  className="w-20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Color</label>
                <Input
                  type="color"
                  value={l.color ?? '#94a3b8'}
                  onChange={(e) => updLevel(l.id, { color: e.target.value })}
                  className="h-10 w-16 p-1"
                />
              </div>
            </div>

            {/* Benefits */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Gift className="h-4 w-4" />
                  Beneficios
                </span>
                <Button variant="outline" size="sm" onClick={() => addBenefit(l.id)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Beneficio
                </Button>
              </div>
              {(benefits[l.id] ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Sin beneficios configurados.</p>
              )}
              {(benefits[l.id] ?? []).map((b, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                  <select
                    value={b.kind}
                    onChange={(e) => updBenefit(l.id, idx, { kind: e.target.value as BenefitKind })}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  >
                    {BENEFIT_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>

                  {(b.kind === 'discount_fixed' || b.kind === 'monthly_coupon') && (
                    <>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={b.value}
                        onChange={(e) =>
                          updBenefit(l.id, idx, { value: parseFloat(e.target.value) || 0 })
                        }
                        className="w-24"
                        placeholder="Valor"
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={b.unit === 'pct' ? 'default' : 'outline'}
                          onClick={() => updBenefit(l.id, idx, { unit: 'pct' })}
                        >
                          %
                        </Button>
                        <Button
                          size="sm"
                          variant={b.unit === 'usd' ? 'default' : 'outline'}
                          onClick={() => updBenefit(l.id, idx, { unit: 'usd' })}
                        >
                          USD
                        </Button>
                      </div>
                    </>
                  )}

                  {(b.kind === 'custom' || b.kind === 'monthly_raffle') && (
                    <Input
                      value={b.note ?? ''}
                      onChange={(e) => updBenefit(l.id, idx, { note: e.target.value })}
                      className="flex-1 min-w-[12rem]"
                      placeholder={
                        b.kind === 'monthly_raffle'
                          ? 'Premio de la rifa (opcional)'
                          : 'Describe el beneficio'
                      }
                    />
                  )}

                  <span className="text-xs text-muted-foreground">{benefitLabel(b.kind)}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeBenefit(l.id, idx)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveLevel(l)}>
                <Save className="mr-2 h-4 w-4" />
                Guardar nivel
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
