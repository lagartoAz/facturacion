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
import { Plus, Minus, PackagePlus, Save, Search } from 'lucide-react'
import ProductFormDialog, { type ProductForForm } from '@/components/ProductFormDialog'

interface ProductLite {
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
  onSaved: (msg: string) => void
}

// General "Ingreso de productos": search for existing products and record how
// many came in today. Saves as a purchase (factura de ingreso) with no supplier
// and adds the quantities to inventory in one transaction. New products can be
// created on the spot with the same form used on the Products page.
export default function ProductIntakeDialog({ open, onOpenChange, onSaved }: Props): JSX.Element {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ProductLite[]>([])
  const [qty, setQty] = useState<Record<number, string>>({})
  const [cost, setCost] = useState<Record<number, string>>({})
  const [price, setPrice] = useState<Record<number, string>>({})
  // Remembers chosen products across searches so the summary/save keep them.
  const [picked, setPicked] = useState<Record<number, ProductLite>>({})
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [newProductOpen, setNewProductOpen] = useState(false)

  // The list only shows search results; it stays empty until the user types, so
  // the window doesn't open pre-filled with the whole inventory.
  const load = useCallback(async () => {
    const term = search.trim()
    if (!term) {
      setResults([])
      return
    }
    const list = (await window.api.getProducts({
      search: term,
      active_only: true,
      page: 1,
      limit: 50
    })) as ProductLite[]
    setResults(list)
  }, [search])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (open) {
      setSearch('')
      setResults([])
      setQty({})
      setCost({})
      setPrice({})
      setPicked({})
      setReference('')
      setNotes('')
    }
  }, [open])

  function setQuantity(p: ProductLite, value: string): void {
    setQty((q) => ({ ...q, [p.id]: value }))
    setPicked((prev) => ({ ...prev, [p.id]: p }))
  }

  function bump(p: ProductLite, delta: number): void {
    const current = parseFloat(qty[p.id] || '0') || 0
    const next = Math.max(0, current + delta)
    setQuantity(p, next ? String(next) : '')
  }

  function handleProductCreated(created: ProductForForm): void {
    const lite: ProductLite = {
      id: created.id,
      barcode: created.barcode,
      name: created.name,
      stock: created.stock,
      cost_usd: created.cost_usd,
      price_usd: created.price_usd,
      is_by_weight: created.is_by_weight
    }
    // Pre-select the new product with quantity 1 so it shows up ready to save.
    setPicked((prev) => ({ ...prev, [lite.id]: lite }))
    setQty((q) => ({ ...q, [lite.id]: '1' }))
    setResults((r) => (r.some((x) => x.id === lite.id) ? r : [lite, ...r]))
  }

  const items = Object.keys(qty)
    .map((id) => Number(id))
    .map((id) => ({
      p: picked[id],
      quantity: parseFloat(qty[id] || '0') || 0,
      unitCost: parseFloat(cost[id] || '0') || 0,
      unitPrice: parseFloat(price[id] || '0') || 0
    }))
    .filter((x) => x.p && x.quantity > 0)

  const totalUnits = items.reduce((s, x) => s + x.quantity, 0)
  const totalCost = items.reduce((s, x) => s + x.quantity * x.unitCost, 0)

  // Rows to render: the live search results plus any picked products that aren't
  // in the current result set (so selections never disappear while searching).
  const pickedExtras = Object.values(picked).filter(
    (p) => (parseFloat(qty[p.id] || '0') || 0) > 0 && !results.some((r) => r.id === p.id)
  )
  const rows = [...pickedExtras, ...results]

  async function handleSave(): Promise<void> {
    if (items.length === 0) return
    setSaving(true)
    try {
      await window.api.createPurchase({
        supplierId: null,
        reference: reference || undefined,
        notes: notes || undefined,
        items: items.map((x) => ({
          productId: x.p.id,
          productName: x.p.name,
          quantity: x.quantity,
          unitCost: x.unitCost,
          // Omit the price when left blank so the existing one is kept.
          unitPrice: x.unitPrice > 0 ? x.unitPrice : undefined
        }))
      })
      onSaved(`Ingreso registrado: ${totalUnits} agregado(s) al inventario`)
      onOpenChange(false)
    } catch (err) {
      onSaved(`Error al registrar ingreso: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Ingreso de productos
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Busca los productos que ingresaron hoy y la cantidad. Se sumará al inventario.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Referencia (opcional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej: entrega del lunes"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar producto por nombre o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <Button variant="outline" onClick={() => setNewProductOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Producto
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Producto</th>
                <th className="text-center p-2 font-medium">Stock</th>
                <th className="text-center p-2 font-medium">Cantidad a ingresar</th>
                <th className="text-right p-2 font-medium">Costo unit. (USD)</th>
                <th className="text-right p-2 font-medium">Precio venta (USD)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const selected = (parseFloat(qty[p.id] || '0') || 0) > 0
                return (
                  <tr key={p.id} className={`border-t ${selected ? 'bg-primary/5' : ''}`}>
                    <td className="p-2">
                      <div className="font-medium">{p.name}</div>
                      {p.barcode && (
                        <div className="text-xs text-muted-foreground font-mono">{p.barcode}</div>
                      )}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">
                      {p.stock}
                      {p.is_by_weight ? ' kg' : ''}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => bump(p, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="h-8 w-20 text-center"
                          type="text"
                          inputMode="decimal"
                          value={qty[p.id] || ''}
                          placeholder="0"
                          onChange={(e) => setQuantity(p, e.target.value)}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => bump(p, 1)}
                        >
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
                        placeholder={p.cost_usd ? String(p.cost_usd) : '0'}
                        onChange={(e) => setCost((c) => ({ ...c, [p.id]: e.target.value }))}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-8 w-24 ml-auto text-right"
                        type="text"
                        inputMode="decimal"
                        value={price[p.id] ?? ''}
                        placeholder={p.price_usd ? String(p.price_usd) : '0'}
                        onChange={(e) => setPrice((c) => ({ ...c, [p.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {search.trim()
                      ? 'No se encontraron productos. Usa "Nuevo Producto" para crearlo.'
                      : 'Escribe el nombre o código de un producto para buscarlo.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Deja el precio de venta vacío para mantener el actual. Si lo escribes, se reemplazará el costo y el precio por los nuevos.
        </p>

        <DialogFooter className="items-center sm:justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">A ingresar: </span>
            <strong>{totalUnits}</strong>
            {items.length > 0 && (
              <span className="text-muted-foreground"> · {items.length} producto(s)</span>
            )}
            {totalCost > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · Costo: <strong>${totalCost.toFixed(2)}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={items.length === 0 || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar Ingreso'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Create a brand-new product without leaving the intake window. */}
      <ProductFormDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        product={null}
        allowDelete={false}
        onSaved={(created, isNew) => {
          if (isNew) handleProductCreated(created)
        }}
      />
    </Dialog>
  )
}
