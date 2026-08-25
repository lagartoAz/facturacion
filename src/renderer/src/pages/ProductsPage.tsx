import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { formatUSD } from '@/lib/currency'
import { ProductThumb } from '@/components/ProductThumb'
import { getProductImageUrl, invalidateProductImage, prepareProductImage, capturePhoto, isMobileApp } from '@/lib/product-image'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, ImagePlus, Camera, X, BarChart3, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

interface Product {
  id: number
  barcode: string | null
  name: string
  description: string | null
  price_usd: number
  cost_usd: number
  category_id: number | null
  category_name: string | null
  supplier_id: number | null
  supplier_name: string | null
  stock: number
  min_stock: number
  is_active: number
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

interface ProductStats {
  total_quantity: number
  total_revenue: number
  total_invoices: number
  first_sale: string | null
  last_sale: string | null
  monthly_sales: { month: string; quantity: number; revenue: number }[]
}

const PRODUCT_PAGE_SIZE = 20

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

export default function ProductsPage(): JSX.Element {
  const [products, setProducts] = useState<Product[]>([])
  const [productTotal, setProductTotal] = useState(0)
  const [productPage, setProductPage] = useState(1)
  const [inventoryTotals, setInventoryTotals] = useState({ total_units: 0, total_invested: 0 })
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<{ data: string; extension: string } | null>(null)
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)
  const [statsProduct, setStatsProduct] = useState<Product | null>(null)
  const [stats, setStats] = useState<ProductStats | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Bumped every time the photo of the open dialog changes, so a photo still
  // loading from the database can't overwrite a newer choice.
  const imageSessionRef = useRef(0)

  const loadProducts = useCallback(async () => {
    const baseFilters = { search: search || undefined, active_only: false }
    const [data, total, totals] = await Promise.all([
      window.api.getProducts({ ...baseFilters, page: productPage, limit: PRODUCT_PAGE_SIZE }),
      window.api.countProducts(baseFilters),
      window.api.getInventoryTotals(baseFilters)
    ])
    setProducts(data)
    setProductTotal(total)
    setInventoryTotals(totals)
  }, [search, productPage])

  const loadCategories = useCallback(async () => {
    setCategories(await window.api.getCategories())
  }, [])

  const loadSuppliers = useCallback(async () => {
    setSuppliers(await window.api.getSuppliers())
  }, [])

  useEffect(() => {
    setProductPage(1)
  }, [search])

  useEffect(() => {
    loadProducts()
    loadCategories()
    loadSuppliers()
  }, [loadProducts, loadCategories, loadSuppliers])

  function openNewDialog(): void {
    imageSessionRef.current++
    setEditingId(null)
    setForm(emptyForm)
    setImagePreview(null)
    setImageFile(null)
    setExistingImagePath(null)
    setRemoveImage(false)
    setDialogOpen(true)
  }

  async function openEditDialog(p: Product): Promise<void> {
    setEditingId(p.id)
    setForm({
      barcode: p.barcode || '',
      name: p.name,
      description: p.description || '',
      price_usd: String(p.price_usd),
      cost_usd: String(p.cost_usd),
      category_id: p.category_id ? String(p.category_id) : '',
      supplier_id: p.supplier_id ? String(p.supplier_id) : '',
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      is_by_weight: !!p.is_by_weight
    })
    setExistingImagePath(p.has_image ? String(p.id) : null)
    setImageFile(null)
    setRemoveImage(false)
    setImagePreview(null)
    setDialogOpen(true)
    if (p.has_image) {
      // The photo comes from the database (possibly over the LAN), so it arrives
      // after the dialog opens. Drop it if the user meanwhile picked another
      // photo, removed it, or opened a different product.
      const session = ++imageSessionRef.current
      const url = await getProductImageUrl(p.id)
      if (imageSessionRef.current === session) setImagePreview(url)
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    // Reset file input so the same file can be selected again
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

    let productId: number

    if (editingId) {
      await window.api.updateProduct(editingId, data)
      productId = editingId
    } else {
      const created = await window.api.createProduct(data)
      productId = created.id
    }

    // Handle image
    if (imageFile) {
      await window.api.saveProductImage(productId, imageFile.data, imageFile.extension)
      invalidateProductImage(productId)
    } else if (removeImage && existingImagePath) {
      await window.api.removeProductImage(productId)
      invalidateProductImage(productId)
    }

    setDialogOpen(false)
    loadProducts()
  }

  async function handleToggleActive(id: number): Promise<void> {
    await window.api.toggleProductActive(id)
    loadProducts()
  }

  async function handleDeleteProduct(): Promise<void> {
    if (!editingId) return
    if (!confirm('Eliminar este producto del inventario? Esta accion no se puede deshacer.')) return
    try {
      const result = await window.api.deleteProduct(editingId)
      if (!result.hardDeleted) {
        alert('El producto tiene ventas registradas, por lo que fue ocultado del inventario en lugar de eliminado para preservar el historial.')
      }
      setDialogOpen(false)
      loadProducts()
    } catch (err) {
      alert(`No se pudo eliminar el producto: ${(err as Error).message}`)
    }
  }

  async function handleCreateCategory(): Promise<void> {
    if (!newCategoryName.trim()) return
    const cat = await window.api.createCategory(newCategoryName.trim())
    setNewCategoryName('')
    await loadCategories()
    setForm((f) => ({ ...f, category_id: String(cat.id) }))
  }

  async function openStats(p: Product): Promise<void> {
    setStatsProduct(p)
    setStats(null)
    setStatsDialogOpen(true)
    const data = await window.api.getProductStats(p.id)
    setStats(data)
  }

  function updateForm(field: string, value: string): void {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <div className="p-4 landscape:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Button onClick={openNewDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o codigo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{productTotal}</strong> productos</span>
          <span><strong className="text-foreground">{inventoryTotals.total_units}</strong> unidades</span>
          <span>Invertido: <strong className="text-foreground">{formatUSD(inventoryTotals.total_invested)}</strong></span>
        </div>
      </div>

      <div className="hidden landscape:block border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium w-12">Img</th>
              <th className="text-left p-3 font-medium">Codigo</th>
              <th className="text-left p-3 font-medium">Nombre</th>
              <th className="text-left p-3 font-medium">Categoria</th>
              <th className="text-left p-3 font-medium">Proveedor</th>
              <th className="text-right p-3 font-medium">Precio USD</th>
              <th className="text-right p-3 font-medium">Stock</th>
              <th className="text-center p-3 font-medium">Estado</th>
              <th className="text-center p-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="p-2">
                  <ProductThumb productId={p.id} hasImage={!!p.has_image} name={p.name} />
                </td>
                <td className="p-3 font-mono text-xs">{p.barcode || '-'}</td>
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.category_name || '-'}</td>
                <td className="p-3 text-muted-foreground text-xs">{p.supplier_name || '-'}</td>
                <td className="p-3 text-right">${p.price_usd.toFixed(2)}{p.is_by_weight ? '/kg' : ''}</td>
                <td className="p-3 text-right">
                  <span className={p.stock <= p.min_stock ? 'text-red-500 font-semibold' : ''}>
                    {p.stock}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <Badge variant={p.is_active ? 'default' : 'secondary'}>
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
                <td className="p-3 text-center space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => openStats(p)} title="Estadisticas">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(p)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleToggleActive(p.id)} title={p.is_active ? 'Desactivar' : 'Activar'}>
                    {p.is_active ? (
                      <ToggleRight className="h-4 w-4" />
                    ) : (
                      <ToggleLeft className="h-4 w-4" />
                    )}
                  </Button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  No hay productos. Haz clic en "Nuevo Producto" para agregar uno.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="landscape:hidden space-y-2">
        {products.map((p) => (
          <div key={p.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ProductThumb productId={p.id} hasImage={!!p.has_image} name={p.name} />
                <span className="font-medium">{p.name}</span>
              </div>
              <Badge variant={p.is_active ? 'default' : 'secondary'}>
                {p.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Codigo</span>
              <span className="font-medium text-foreground">{p.barcode || '-'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Categoria</span>
              <span className="font-medium text-foreground">{p.category_name || '-'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Proveedor</span>
              <span className="font-medium text-foreground">{p.supplier_name || '-'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Precio USD</span>
              <span className="font-medium text-foreground">${p.price_usd.toFixed(2)}{p.is_by_weight ? '/kg' : ''}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Stock</span>
              <span className={p.stock <= p.min_stock ? 'text-red-500 font-semibold' : 'font-medium text-foreground'}>
                {p.stock}
              </span>
            </div>
            <div className="flex justify-end gap-1 pt-1 border-t">
              <Button variant="ghost" size="icon" onClick={() => openStats(p)} title="Estadisticas">
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => openEditDialog(p)} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleToggleActive(p.id)} title={p.is_active ? 'Desactivar' : 'Activar'}>
                {p.is_active ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ))}
        {products.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No hay productos. Haz clic en "Nuevo Producto" para agregar uno.
          </div>
        )}
      </div>

      {productTotal > PRODUCT_PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Mostrando {Math.min((productPage - 1) * PRODUCT_PAGE_SIZE + 1, productTotal)}–{Math.min(productPage * PRODUCT_PAGE_SIZE, productTotal)} de {productTotal} productos
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setProductPage((p) => p - 1)} disabled={productPage <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 font-medium">{productPage} / {Math.ceil(productTotal / PRODUCT_PAGE_SIZE)}</span>
            <Button variant="outline" size="icon" onClick={() => setProductPage((p) => p + 1)} disabled={productPage * PRODUCT_PAGE_SIZE >= productTotal}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            {editingId ? (
              <Button variant="destructive" onClick={handleDeleteProduct}>
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!form.name || !form.price_usd}>
                {editingId ? 'Guardar Cambios' : 'Crear Producto'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Dialog */}
      <Dialog open={statsDialogOpen} onOpenChange={setStatsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Estadisticas: {statsProduct?.name}
            </DialogTitle>
          </DialogHeader>
          {statsProduct && (
            <div className="space-y-4">
              {/* Product info */}
              <div className="flex items-center gap-3">
                <ProductThumb
                  productId={statsProduct.id}
                  hasImage={!!statsProduct.has_image}
                  name={statsProduct.name}
                  className="h-12 w-12"
                  iconClassName="h-6 w-6"
                />
                <div>
                  <p className="font-medium">{statsProduct.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {statsProduct.barcode || 'Sin codigo'} | {formatUSD(statsProduct.price_usd)}
                  </p>
                </div>
              </div>

              <Separator />

              {!stats ? (
                <p className="text-center text-muted-foreground py-4">Cargando...</p>
              ) : stats.total_invoices === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Este producto no tiene ventas registradas.
                </p>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold">{stats.total_quantity}</p>
                      <p className="text-xs text-muted-foreground">Unidades vendidas</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold">{formatUSD(stats.total_revenue)}</p>
                      <p className="text-xs text-muted-foreground">Ingresos totales</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold">{stats.total_invoices}</p>
                      <p className="text-xs text-muted-foreground">Facturas</p>
                    </div>
                  </div>

                  {/* Date range */}
                  <div className="text-sm text-muted-foreground flex justify-between">
                    <span>Primera venta: {stats.first_sale ? new Date(stats.first_sale).toLocaleDateString('es') : '-'}</span>
                    <span>Ultima venta: {stats.last_sale ? new Date(stats.last_sale).toLocaleDateString('es') : '-'}</span>
                  </div>

                  {/* Monthly chart */}
                  {stats.monthly_sales.length > 1 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-sm font-medium mb-2">Ventas mensuales (unidades)</p>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={[...stats.monthly_sales].reverse()}>
                            <XAxis dataKey="month" fontSize={11} />
                            <YAxis fontSize={11} />
                            <Tooltip
                              formatter={(value: number, name: string) => [
                                name === 'quantity' ? `${value} uds` : formatUSD(value),
                                name === 'quantity' ? 'Cantidad' : 'Ingreso'
                              ]}
                            />
                            <Bar dataKey="quantity" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
