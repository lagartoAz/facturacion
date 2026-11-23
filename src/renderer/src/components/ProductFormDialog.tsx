import { useEffect, useRef, useState } from 'react'
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
import {
  getProductImageUrl,
  invalidateProductImage,
  prepareProductImage,
  capturePhoto,
  isMobileApp
} from '@/lib/product-image'
import { Plus, ImagePlus, Camera, X, Trash2, Star } from 'lucide-react'
import { useLoyalty } from '@/hooks/useLoyalty'

export interface ProductForForm {
  id: number
  barcode: string | null
  name: string
  description: string | null
  price_usd: number
  cost_usd: number
  category_id: number | null
  supplier_id: number | null
  stock: number
  min_stock: number
  is_by_weight: number
  has_image: number
}

interface Category {
  id: number
  name: string
}

interface Supplier {
  id: number
  name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Product to edit, or null to create a new one. */
  product?: ProductForForm | null
  /** Called after a successful create/update with the saved product. */
  onSaved: (product: ProductForForm, isNew: boolean) => void
  /** Whether to show the delete button (hidden when embedded in other flows). */
  allowDelete?: boolean
}

const emptyForm = {
  barcode: '',
  name: '',
  description: '',
  price_usd: '',
  cost_usd: '',
  category_id: '',
  supplier_id: '',
  stock: '',
  min_stock: '',
  is_by_weight: false
}

// The full product create/edit dialog, shared between the Products page and the
// "Ingreso de productos" window so the same form behaves identically everywhere.
export default function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
  allowDelete = true
}: Props): JSX.Element {
  const editingId = product?.id ?? null
  const { status: loyalty } = useLoyalty()
  const [loyaltyPoints, setLoyaltyPoints] = useState('0')
  const [form, setForm] = useState(emptyForm)
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<{ data: string; extension: string } | null>(null)
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Bumped every time the photo of the open dialog changes, so a photo still
  // loading from the database can't overwrite a newer choice.
  const imageSessionRef = useRef(0)

  useEffect(() => {
    if (!open) return
    window.api.getCategories().then((c) => setCategories(c as Category[]))
    window.api.getSuppliers().then((s) => setSuppliers(s as Supplier[]))

    imageSessionRef.current++
    setNewCategoryName('')
    setImageFile(null)
    setRemoveImage(false)
    setImagePreview(null)
    setLoyaltyPoints('0')

    // Load this product's loyalty points (only relevant with the add-on active).
    if (loyalty.enabled && product) {
      window.api.getLoyaltyProductPoints().then((rows) => {
        const match = (rows as { product_id: number; points: number }[]).find(
          (r) => r.product_id === product.id
        )
        setLoyaltyPoints(String(match?.points ?? 0))
      })
    }

    if (product) {
      setForm({
        barcode: product.barcode || '',
        name: product.name,
        description: product.description || '',
        price_usd: String(product.price_usd),
        cost_usd: String(product.cost_usd),
        category_id: product.category_id ? String(product.category_id) : '',
        supplier_id: product.supplier_id ? String(product.supplier_id) : '',
        stock: String(product.stock),
        min_stock: String(product.min_stock),
        is_by_weight: !!product.is_by_weight
      })
      setExistingImagePath(product.has_image ? String(product.id) : null)
      if (product.has_image) {
        const session = ++imageSessionRef.current
        getProductImageUrl(product.id).then((url) => {
          if (imageSessionRef.current === session) setImagePreview(url)
        })
      }
    } else {
      setForm(emptyForm)
      setExistingImagePath(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product])

  function updateForm(field: string, value: string): void {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    imageSessionRef.current++
    const picked = await prepareProductImage(file)
    setImagePreview(picked.data)
    setImageFile(picked)
    setRemoveImage(false)
  }

  async function handleCapturePhoto(): Promise<void> {
    const picked = await capturePhoto()
    if (!picked) return
    imageSessionRef.current++
    setImagePreview(picked.data)
    setImageFile(picked)
    setRemoveImage(false)
  }

  function handleRemoveImage(): void {
    imageSessionRef.current++
    setImagePreview(null)
    setImageFile(null)
    setRemoveImage(true)
  }

  async function handleCreateCategory(): Promise<void> {
    if (!newCategoryName.trim()) return
    const cat = (await window.api.createCategory(newCategoryName.trim())) as Category
    setNewCategoryName('')
    setCategories(await (window.api.getCategories() as Promise<Category[]>))
    setForm((f) => ({ ...f, category_id: String(cat.id) }))
  }

  async function handleSave(): Promise<void> {
    const data = {
      barcode: form.barcode || undefined,
      name: form.name,
      description: form.description || undefined,
      price_usd: parseFloat(form.price_usd) || 0,
      cost_usd: parseFloat(form.cost_usd) || 0,
      category_id: form.category_id ? parseInt(form.category_id) : undefined,
      supplier_id: form.supplier_id ? parseInt(form.supplier_id) : undefined,
      stock: parseInt(form.stock) || 0,
      min_stock: parseInt(form.min_stock) || 0,
      is_by_weight: form.is_by_weight ? 1 : 0
    }

    let saved: ProductForForm
    if (editingId) {
      saved = (await window.api.updateProduct(editingId, data)) as ProductForForm
    } else {
      saved = (await window.api.createProduct(data)) as ProductForForm
    }

    if (imageFile) {
      await window.api.saveProductImage(saved.id, imageFile.data, imageFile.extension)
      invalidateProductImage(saved.id)
    } else if (removeImage && existingImagePath) {
      await window.api.removeProductImage(saved.id)
      invalidateProductImage(saved.id)
    }

    if (loyalty.enabled) {
      await window.api.setLoyaltyProductPoints(saved.id, parseInt(loyaltyPoints) || 0)
    }

    onOpenChange(false)
    onSaved(saved, editingId == null)
  }

  async function handleDelete(): Promise<void> {
    if (!editingId) return
    if (!confirm('Eliminar este producto del inventario? Esta accion no se puede deshacer.')) return
    try {
      const result = await window.api.deleteProduct(editingId)
      if (!result.hardDeleted) {
        alert('El producto tiene ventas registradas, por lo que fue ocultado del inventario en lugar de eliminado para preservar el historial.')
      }
      onOpenChange(false)
      onSaved({ ...(product as ProductForForm) }, false)
    } catch (err) {
      alert(`No se pudo eliminar el producto: ${(err as Error).message}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Image section */}
          <div className="space-y-2">
            <Label>Imagen del Producto</Label>
            <div className="flex items-start gap-4">
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="h-24 w-24 rounded-lg object-cover border"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground mt-1">Agregar</span>
                </div>
              )}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {isMobileApp() && (
                    <Button type="button" variant="outline" size="sm" onClick={handleCapturePhoto}>
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
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG o WebP. Se redimensiona automaticamente.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Codigo de Barras</Label>
            <Input
              value={form.barcode}
              onChange={(e) => updateForm('barcode', e.target.value)}
              placeholder="Escanear o escribir codigo"
            />
          </div>
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="Nombre del producto"
            />
          </div>
          <div className="space-y-2">
            <Label>Descripcion</Label>
            <Input
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Precio USD *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price_usd}
                onChange={(e) => updateForm('price_usd', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Costo USD</Label>
              <Input
                type="number"
                step="0.01"
                value={form.cost_usd}
                onChange={(e) => updateForm('cost_usd', e.target.value)}
              />
            </div>
          </div>
          {loyalty.enabled && (
            <div className="space-y-2">
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
                Puntos que otorga este producto por unidad vendida (si la regla “por producto” está
                activa). 0 = no da puntos.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_by_weight"
              checked={form.is_by_weight}
              onChange={(e) => setForm((f) => ({ ...f, is_by_weight: e.target.checked }))}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="is_by_weight" className="cursor-pointer">
              Precio por peso (kg)
            </Label>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <div className="flex gap-2">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.category_id}
                onChange={(e) => updateForm('category_id', e.target.value)}
              >
                <option value="">Sin categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nueva categoria..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="outline" onClick={handleCreateCategory} className="h-8">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Proveedor</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.supplier_id}
              onChange={(e) => updateForm('supplier_id', e.target.value)}
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
                No hay proveedores creados. Crealos en el apartado Proveedores del menu.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stock</Label>
              <Input
                type="number"
                value={form.stock}
                onChange={(e) => updateForm('stock', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Stock Minimo</Label>
              <Input
                type="number"
                value={form.min_stock}
                onChange={(e) => updateForm('min_stock', e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {editingId && allowDelete ? (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.name || !form.price_usd}>
              {editingId ? 'Guardar Cambios' : 'Crear Producto'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
