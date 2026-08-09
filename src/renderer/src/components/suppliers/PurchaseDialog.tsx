import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Plus, Minus, Package, Save, PackagePlus } from 'lucide-react'

interface SupplierLite {
  id: number
  name: string
}

interface SupplierProduct {
  id: number
  barcode: string | null
  name: string
  stock: number
  cost_usd: number
  price_usd: number
  is_by_weight: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: SupplierLite | null
  onSaved: (msg: string) => void
}

const emptyNew = { name: '', barcode: '', price_usd: '', cost_usd: '' }

export default function PurchaseDialog({ open, onOpenChange, supplier, onSaved }: Props): JSX.Element {
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [qty, setQty] = useState<Record<number, string>>({})
  const [cost, setCost] = useState<Record<number, string>>({})
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState(emptyNew)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!supplier) return
    const list = (await window.api.getSupplierProducts(supplier.id)) as SupplierProduct[]
    setProducts(list)
    setCost((prev) => {
      const next = { ...prev }
      for (const p of list) if (next[p.id] === undefined) next[p.id] = String(p.cost_usd || '')
      return next
    })
  }, [supplier])

  useEffect(() => {
    if (open) {
      setQty({})
      setCost({})
      setReference('')
      setNotes('')
      setShowNew(false)
      setNewForm(emptyNew)
      load()
    }
  }, [open, load])

  function setQuantity(id: number, value: string): void {
    setQty((q) => ({ ...q, [id]: value }))
  }

  function bump(id: number, delta: number): void {
    setQty((q) => {
      const current = parseFloat(q[id] || '0') || 0
      const next = Math.max(0, current + delta)
      return { ...q, [id]: next ? String(next) : '' }
    })
  }

  const items = products
    .map((p) => ({ p, quantity: parseFloat(qty[p.id] || '0') || 0, unitCost: parseFloat(cost[p.id] || '0') || 0 }))
    .filter((x) => x.quantity > 0)

  const totalUnits = items.reduce((s, x) => s + x.quantity, 0)
  const totalCost = items.reduce((s, x) => s + x.quantity * x.unitCost, 0)

  async function handleSave(): Promise<void> {
    if (!supplier || items.length === 0) return
    setSaving(true)
    try {
      await window.api.createPurchase({
        supplierId: supplier.id,
        reference: reference || undefined,
        notes: notes || undefined,
        items: items.map((x) => ({
          productId: x.p.id,
          productName: x.p.name,
          quantity: x.quantity,
          unitCost: x.unitCost
        }))
      })
      onSaved(`Ingreso registrado: ${totalUnits} unidad(es) sumadas al inventario`)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateProduct(): Promise<void> {
    if (!supplier || !newForm.name.trim()) return
    setCreating(true)
    try {
      const created = (await window.api.createProduct({
        name: newForm.name.trim(),
        barcode: newForm.barcode.trim() || undefined,
        price_usd: parseFloat(newForm.price_usd) || 0,
        cost_usd: parseFloat(newForm.cost_usd) || 0,
        supplier_id: supplier.id,
        stock: 0
      })) as { id: number }
      setShowNew(false)
      setNewForm(emptyNew)
      await load()
      // Pre-fill quantity 1 for the freshly added product so it's ready to receive.
      if (created?.id) setQuantity(created.id, '1')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Nueva Factura de Ingreso — {supplier?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">N° de factura del proveedor (opcional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: 00123" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones del pedido" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Ajusta la cantidad recibida de cada producto. Se sumara al inventario.
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowNew((v) => !v)}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Producto nuevo
          </Button>
        </div>

        {showNew && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">Crear producto (se asigna a {supplier?.name})</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nombre *</Label>
                <Input value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Codigo de barras</Label>
                <Input value={newForm.barcode} onChange={(e) => setNewForm((f) => ({ ...f, barcode: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Precio venta (USD) *</Label>
                <Input type="text" inputMode="decimal" value={newForm.price_usd} onChange={(e) => setNewForm((f) => ({ ...f, price_usd: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Costo (USD)</Label>
                <Input type="text" inputMode="decimal" value={newForm.cost_usd} onChange={(e) => setNewForm((f) => ({ ...f, cost_usd: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleCreateProduct} disabled={!newForm.name.trim() || creating}>
                {creating ? 'Creando...' : 'Crear y agregar'}
              </Button>
            </div>
          </div>
        )}

        <div className="border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Producto</th>
                <th className="text-center p-2 font-medium">Stock actual</th>
                <th className="text-center p-2 font-medium">Cantidad a ingresar</th>
                <th className="text-right p-2 font-medium">Costo unit. (USD)</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{p.name}</div>
                    {p.barcode && <div className="text-xs text-muted-foreground font-mono">{p.barcode}</div>}
                  </td>
                  <td className="p-2 text-center text-muted-foreground">{p.stock}</td>
                  <td className="p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(p.id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        className="h-8 w-20 text-center"
                        type="text"
                        inputMode="decimal"
                        value={qty[p.id] || ''}
                        placeholder="0"
                        onChange={(e) => setQuantity(p.id, e.target.value)}
                      />
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(p.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-2">
                    <Input
                      className="h-8 w-24 ml-auto text-right"
                      type="text"
                      inputMode="decimal"
                      value={cost[p.id] ?? ''}
                      onChange={(e) => setCost((c) => ({ ...c, [p.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Este proveedor no tiene productos asignados. Usa &quot;Producto nuevo&quot; para agregar uno.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Total a ingresar: </span>
            <strong>{totalUnits}</strong> unidad(es)
            {totalCost > 0 && <span className="text-muted-foreground"> · Costo: <strong>${totalCost.toFixed(2)}</strong></span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={items.length === 0 || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar Ingreso'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
