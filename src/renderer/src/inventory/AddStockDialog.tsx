import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InvProduct } from './types'

interface Props {
  product: InvProduct
  onClose: () => void
  onSaved: () => void
}

// Add stock to an existing product via a purchase/intake (increments stock on
// the server). Optionally updates cost and selling price. Only available while
// connected (the caller gates on that).
export default function AddStockDialog({ product, onClose, onSaved }: Props): JSX.Element {
  const [quantity, setQuantity] = useState('1')
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(): Promise<void> {
    const qty = parseFloat(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Cantidad inválida')
      return
    }
    setSaving(true)
    setError('')
    try {
      await window.api.createPurchase({
        items: [
          {
            productId: product.id,
            productName: product.name,
            quantity: qty,
            unitCost: cost.trim() ? parseFloat(cost) : undefined,
            unitPrice: price.trim() ? parseFloat(price) : undefined
          }
        ]
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message || 'No se pudo registrar el ingreso')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sumar stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{product.name}</p>
            <p className="text-muted-foreground">
              {product.barcode ? `${product.barcode} · ` : ''}Existencia actual: {product.stock}
            </p>
          </div>
          <div className="space-y-1">
            <Label>Cantidad a sumar</Label>
            <Input
              type="number"
              min="0"
              step={product.is_by_weight ? '0.001' : '1'}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label>Nuevo costo (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Nuevo precio (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Sumar stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
