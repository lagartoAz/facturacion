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
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, ImagePlus, X, Package, BarChart3 } from 'lucide-react'
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
  stock: number
  min_stock: number
  is_active: number
  is_by_weight: number
  image_path: string | null
}

interface Category {
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

const emptyForm = {
  barcode: '',
  name: '',
  description: '',
  price_usd: '',
  cost_usd: '',
  category_id: '',
  stock: '',
  min_stock: '',
  is_by_weight: false
}

export default function ProductsPage(): JSX.Element {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
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

  const loadProducts = useCallback(async () => {
    const data = await window.api.getProducts({
      search: search || undefined,
      active_only: false
    })
    setProducts(data)
  }, [search])

  const loadCategories = useCallback(async () => {
    setCategories(await window.api.getCategories())
  }, [])

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [loadProducts, loadCategories])

  function openNewDialog(): void {
    setEditingId(null)
    setForm(emptyForm)
    setImagePreview(null)
    setImageFile(null)
    setExistingImagePath(null)
    setRemoveImage(false)
    setDialogOpen(true)
  }

  function openEditDialog(p: Product): void {
    setEditingId(p.id)
    setForm({
      barcode: p.barcode || '',
      name: p.name,
      description: p.description || '',
      price_usd: String(p.price_usd),
      cost_usd: String(p.cost_usd),
      category_id: p.category_id ? String(p.category_id) : '',
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      is_by_weight: !!p.is_by_weight
    })
    setExistingImagePath(p.image_path)
    setImagePreview(p.image_path ? `file://${p.image_path}` : null)
    setImageFile(null)
    setRemoveImage(false)
    setDialogOpen(true)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setImageFile({ data: dataUrl, extension })
      setRemoveImage(false)
    }
    reader.readAsDataURL(file)

    // Reset file input so the same file can be selected again
    e.target.value = ''
  }

  function handleRemoveImage(): void {
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
    } else if (removeImage && existingImagePath) {
      await window.api.removeProductImage(productId)
    }

    setDialogOpen(false)
    loadProducts()
  }

  async function handleToggleActive(id: number): Promise<void> {
    await window.api.toggleProductActive(id)
    loadProducts()
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
    <div className="p-6 space-y-4">
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
          <span><strong className="text-foreground">{products.length}</strong> productos</span>
          <span><strong className="text-foreground">{products.reduce((sum, p) => sum + (p.is_by_weight ? 0 : p.stock), 0)}</strong> unidades</span>
          <span>Invertido: <strong className="text-foreground">{formatUSD(products.reduce((sum, p) => sum + p.cost_usd * (p.is_by_weight ? 0 : p.stock), 0))}</strong></span>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium w-12">Img</th>
              <th className="text-left p-3 font-medium">Codigo</th>
              <th className="text-left p-3 font-medium">Nombre</th>
              <th className="text-left p-3 font-medium">Categoria</th>
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
                  {p.image_path ? (
                    <img
                      src={`file://${p.image_path}`}
                      alt={p.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">{p.barcode || '-'}</td>
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.category_name || '-'}</td>
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
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No hay productos. Haz clic en "Nuevo Producto" para agregar uno.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    {imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                  </Button>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.name || !form.price_usd}>
              {editingId ? 'Guardar Cambios' : 'Crear Producto'}
            </Button>
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
                {statsProduct.image_path ? (
                  <img
                    src={`file://${statsProduct.image_path}`}
                    alt={statsProduct.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
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
