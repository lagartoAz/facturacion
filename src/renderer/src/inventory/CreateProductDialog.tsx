import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Camera, ImagePlus, X, Plus, Star } from 'lucide-react'
import {
  prepareProductImage,
  capturePhoto,
  isMobileApp,
  invalidateProductImage
} from '@/lib/product-image'

interface Props {
  barcode?: string
  onClose: () => void
  onSaved: () => void
}

interface Category {
  id: number
  name: string
}
interface Supplier {
  id: number
  name: string
}

// Create a brand-new product on the server. Only available while connected
// (the caller gates on that). Supports a photo (file or camera), category,
// supplier and — when loyalty is active on the primary terminal — the points
// the product grants per unit.
export default function CreateProductDialog({ barcode, onClose, onSaved }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [code, setCode] = useState(barcode ?? '')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [byWeight, setByWeight] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Catalogue associations
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')

  // Loyalty (only shown if the program is active)
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false)
  const [loyaltyPoints, setLoyaltyPoints] = useState('0')

  // Photo
  const [imageFile, setImageFile] = useState<{ data: string; extension: string } | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [cats, sups] = await Promise.all([
          window.api.getCategories() as Promise<Category[]>,
          window.api.getSuppliers() as Promise<Supplier[]>
        ])
        setCategories(cats)
        setSuppliers(sups)
      } catch {
        // keep going; associations are optional
      }
      try {
        const status = (await window.api.getLoyaltyStatus()) as { enabled?: boolean }
        setLoyaltyEnabled(!!status.enabled)
      } catch {
        setLoyaltyEnabled(false)
      }
    })()
  }, [])

  async function handlePickFile(file: File | undefined): Promise<void> {
    if (!file) return
    try {
      const prepared = await prepareProductImage(file)
      setImageFile(prepared)
      setImagePreview(prepared.data)
    } catch (e) {
      setError((e as Error).message || 'No se pudo procesar la imagen')
    }
  }

  async function handleCapture(): Promise<void> {
    const photo = await capturePhoto()
    if (photo) {
      setImageFile(photo)
      setImagePreview(photo.data)
    }
  }

  function removeImage(): void {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleCreateCategory(): Promise<void> {
    const n = newCategoryName.trim()
    if (!n) return
    try {
      const cat = (await window.api.createCategory(n)) as Category
      setCategories((await window.api.getCategories()) as Category[])
      setCategoryId(String(cat.id))
      setNewCategoryName('')
    } catch (e) {
      setError((e as Error).message || 'No se pudo crear la categoría')
    }
  }

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
      const created = (await window.api.createProduct({
        name: name.trim(),
        barcode: code.trim() || undefined,
        price_usd: priceNum,
        stock: parseInt(stock, 10) || 0,
        min_stock: parseInt(minStock, 10) || 0,
        is_by_weight: byWeight ? 1 : 0,
        category_id: categoryId ? Number(categoryId) : null,
        supplier_id: supplierId ? Number(supplierId) : null
      })) as { id: number }

      if (imageFile && created?.id) {
        await window.api.saveProductImage(created.id, imageFile.data, imageFile.extension)
        invalidateProductImage(created.id)
      }
      if (loyaltyEnabled && created?.id) {
        await window.api.setLoyaltyProductPoints(created.id, parseInt(loyaltyPoints, 10) || 0)
      }
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
          {/* Photo */}
          <div className="flex items-start gap-3">
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Producto"
                  className="h-24 w-24 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground"
              >
                <ImagePlus className="h-6 w-6" />
                <span className="mt-1 text-[10px]">Foto</span>
              </div>
            )}
            <div className="flex flex-1 flex-col gap-2">
              {isMobileApp() && (
                <Button type="button" variant="outline" size="sm" onClick={handleCapture}>
                  <Camera className="mr-2 h-4 w-4" />
                  Tomar foto
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                {imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void handlePickFile(e.target.files?.[0])}
              />
            </div>
          </div>

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

          {/* Category */}
          <div className="space-y-1">
            <Label>Categoría</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input
                placeholder="Nueva categoría…"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-1">
            <Label>Proveedor</Label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay proveedores. Créalos en la terminal principal.
              </p>
            )}
          </div>

          {/* Loyalty points */}
          {loyaltyEnabled && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-amber-500" />
                Puntos de fidelidad por unidad
              </Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={loyaltyPoints}
                onChange={(e) => setLoyaltyPoints(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Puntos que otorga este producto por unidad vendida (si la regla «por producto» está
                activa). 0 = no da puntos.
              </p>
            </div>
          )}

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
