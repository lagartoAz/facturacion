import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  barcode?: string
  onClose: () => void
  onSaved: () => void
}

// Create a brand-new product on the server. Only available while connected
// (the caller gates on that).
export default function CreateProductDialog({ barcode, onClose, onSaved }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [code, setCode] = useState(barcode ?? '')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [byWeight, setByWeight] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(): Promise<void> {
    if (!name.trim()) {
      setError('Ponle un nombre al producto')
      return
    }
    const priceNum = parseFloat(price)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Precio de venta inválido')
      return
    }
    setSaving(true)
    setError('')
    try {
      await window.api.createProduct({
        name: name.trim(),
        barcode: code.trim() || undefined,
        price_usd: priceNum,
        stock: parseInt(stock, 10) || 0,
        min_stock: parseInt(minStock, 10) || 0,
        is_by_weight: byWeight ? 1 : 0
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message || 'No se pudo crear el producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Código de barras</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label>Precio de venta (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="w-28 space-y-1">
              <Label>Stock inicial</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="w-28 space-y-1">
              <Label>Stock mínimo</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={byWeight}
                onChange={(e) => setByWeight(e.target.checked)}
              />
              Se vende por peso
            </label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Crear producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
