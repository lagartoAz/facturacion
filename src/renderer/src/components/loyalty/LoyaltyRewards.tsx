import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Gift, Plus, Trash2, Pencil, X } from 'lucide-react'

interface Reward {
  id: number
  name: string
  kind: 'discount_usd' | 'discount_pct' | 'ticket' | 'custom'
  cost_points: number
  value: number
  tickets: number
  active: number
}

const KINDS: { value: Reward['kind']; label: string }[] = [
  { value: 'discount_usd', label: 'Descuento USD' },
  { value: 'discount_pct', label: 'Descuento %' },
  { value: 'ticket', label: 'Tickets de rifa' },
  { value: 'custom', label: 'Premio libre' }
]

const emptyForm = {
  name: '',
  kind: 'discount_usd' as Reward['kind'],
  cost_points: 100,
  value: 1,
  tickets: 1
}

export function rewardSummary(r: Pick<Reward, 'kind' | 'value' | 'tickets'>): string {
  if (r.kind === 'discount_usd') return `Descuento de $${r.value}`
  if (r.kind === 'discount_pct') return `${r.value}% de descuento`
  if (r.kind === 'ticket') return `${r.tickets} ticket(s) de rifa`
  return 'Premio definido por la tienda'
}

export default function LoyaltyRewards(): JSX.Element {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load(): Promise<void> {
    setRewards((await window.api.listLoyaltyRewards()) as Reward[])
  }

  function startNew(): void {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function startEdit(r: Reward): void {
    setForm({
      name: r.name,
      kind: r.kind,
      cost_points: r.cost_points,
      value: r.value,
      tickets: r.tickets || 1
    })
    setEditingId(r.id)
    setShowForm(true)
  }

  async function submit(): Promise<void> {
    if (!form.name.trim()) {
      alert('Ponle un nombre al premio')
      return
    }
    if (!form.cost_points || form.cost_points <= 0) {
      alert('El costo en puntos debe ser mayor a 0')
      return
    }
    if (editingId) {
      await window.api.updateLoyaltyReward(editingId, { ...form })
    } else {
      await window.api.createLoyaltyReward({ ...form })
    }
    setShowForm(false)
    await load()
  }

  async function toggleActive(r: Reward): Promise<void> {
    await window.api.updateLoyaltyReward(r.id, { active: !r.active })
    await load()
  }

  async function remove(id: number): Promise<void> {
    if (!confirm('¿Eliminar este premio?')) return
    await window.api.deleteLoyaltyReward(id)
    await load()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5" />
          Catálogo de premios
        </CardTitle>
        {!showForm && (
          <Button size="sm" onClick={startNew}>
            <Plus className="mr-1 h-4 w-4" />
            Nuevo premio
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{editingId ? 'Editar premio' : 'Nuevo premio'}</span>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nombre</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Descuento de $5, Producto gratis…"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <Button
                    key={k.value}
                    size="sm"
                    variant={form.kind === k.value ? 'default' : 'outline'}
                    onClick={() => setForm({ ...form, kind: k.value })}
                  >
                    {k.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Costo en puntos</label>
                <Input
                  type="number"
                  min="1"
                  value={form.cost_points}
                  onChange={(e) => setForm({ ...form, cost_points: parseInt(e.target.value) || 0 })}
                  className="w-32"
                />
              </div>
              {(form.kind === 'discount_usd' || form.kind === 'discount_pct') && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {form.kind === 'discount_pct' ? 'Porcentaje' : 'Monto USD'}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step={form.kind === 'discount_pct' ? '1' : '0.01'}
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                    className="w-32"
                  />
                </div>
              )}
              {form.kind === 'ticket' && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tickets que otorga</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.tickets}
                    onChange={(e) => setForm({ ...form, tickets: parseInt(e.target.value) || 0 })}
                    className="w-32"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button onClick={submit}>Guardar</Button>
            </div>
          </div>
        )}

        {rewards.length > 0 ? (
          <div className="divide-y rounded-lg border">
            {rewards.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <p className={`font-medium ${r.active ? '' : 'text-muted-foreground line-through'}`}>
                    {r.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{rewardSummary(r)}</p>
                </div>
                <span className="text-sm font-semibold">{r.cost_points} pts</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActive(r)}
                  title={r.active ? 'Desactivar' : 'Activar'}
                >
                  {r.active ? 'Activo' : 'Inactivo'}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => startEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          !showForm && (
            <p className="py-8 text-center text-muted-foreground">
              Aún no hay premios. Crea el primero con “Nuevo premio”.
            </p>
          )
        )}
      </CardContent>
    </Card>
  )
}
