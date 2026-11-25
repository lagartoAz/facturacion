import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { formatUSD } from '@/lib/currency'
import { ProductThumb } from '@/components/ProductThumb'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, BarChart3, ChevronLeft, ChevronRight, PackagePlus, Star } from 'lucide-react'
import { useLoyalty } from '@/hooks/useLoyalty'
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav'
import ProductIntakeDialog from '@/components/ProductIntakeDialog'
import ProductFormDialog, { type ProductForForm } from '@/components/ProductFormDialog'
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

interface ProductStats {
  total_quantity: number
  total_revenue: number
  total_invoices: number
  first_sale: string | null
  last_sale: string | null
  monthly_sales: { month: string; quantity: number; revenue: number }[]
}

const PRODUCT_PAGE_SIZE = 20

export default function ProductsPage(): JSX.Element {
  const { status: loyalty } = useLoyalty()
  const [productPoints, setProductPoints] = useState<Record<number, number>>({})
  const [products, setProducts] = useState<Product[]>([])
  const [productTotal, setProductTotal] = useState(0)
  const [productPage, setProductPage] = useState(1)
  const [inventoryTotals, setInventoryTotals] = useState({ total_units: 0, total_invested: 0 })
  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'high'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductForForm | null>(null)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)
  const [statsProduct, setStatsProduct] = useState<Product | null>(null)
  const [stats, setStats] = useState<ProductStats | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [notification, setNotification] = useState('')

  const loadProducts = useCallback(async () => {
    const baseFilters = {
      search: search || undefined,
      active_only: false,
      stock_level: stockFilter === 'all' ? undefined : stockFilter
    }
    const [data, total, totals] = await Promise.all([
      window.api.getProducts({ ...baseFilters, page: productPage, limit: PRODUCT_PAGE_SIZE }),
      window.api.countProducts(baseFilters),
      window.api.getInventoryTotals(baseFilters)
    ])
    setProducts(data)
    setProductTotal(total)
    setInventoryTotals(totals)
    if (loyalty.enabled) {
      const rows = (await window.api.getLoyaltyProductPoints()) as {
        product_id: number
        points: number
      }[]
      setProductPoints(Object.fromEntries(rows.map((r) => [r.product_id, r.points])))
    }
  }, [search, stockFilter, productPage, loyalty.enabled])

  useEffect(() => {
    setProductPage(1)
  }, [search, stockFilter])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Teclado: ↑/↓ resaltan una fila, Enter la edita.
  const { activeIndex, setActiveIndex } = useListKeyboardNav(products.length, (i) => {
    const p = products[i]
    if (p) openEditDialog(p)
  })
  useEffect(() => setActiveIndex(-1), [productPage, search, stockFilter, setActiveIndex])

  function openNewDialog(): void {
    setEditingProduct(null)
    setDialogOpen(true)
  }

  function openEditDialog(p: Product): void {
    setEditingProduct(p)
    setDialogOpen(true)
  }

  async function handleToggleActive(id: number): Promise<void> {
    await window.api.toggleProductActive(id)
    loadProducts()
  }

  async function openStats(p: Product): Promise<void> {
    setStatsProduct(p)
    setStats(null)
    setStatsDialogOpen(true)
    const data = await window.api.getProductStats(p.id)
    setStats(data)
  }

  return (
    <div className="p-4 landscape:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIntakeOpen(true)}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Ingreso de productos
          </Button>
          <Button onClick={openNewDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Producto
          </Button>
        </div>
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
        <div className="flex gap-1 rounded-lg border p-1">
          {([
            ['all',  'Todos'],
            ['low',  'Stock bajo'],
            ['high', 'Stock alto'],
          ] as ['all' | 'low' | 'high', string][]).map(([val, label]) => (
            <Button
              key={val}
              size="sm"
              variant={stockFilter === val ? 'default' : 'ghost'}
              onClick={() => setStockFilter(val)}
            >
              {label}
            </Button>
          ))}
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
              {loyalty.enabled && <th className="text-right p-3 font-medium">Puntos</th>}
              <th className="text-center p-3 font-medium">Estado</th>
              <th className="text-center p-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr
                key={p.id}
                data-kbd-active={i === activeIndex}
                className={`border-t hover:bg-muted/30 ${i === activeIndex ? 'bg-accent' : ''}`}
              >
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
                {loyalty.enabled && (
                  <td className="p-3 text-right">
                    <span className="inline-flex items-center gap-1 justify-end">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      {productPoints[p.id] ?? 0}
                    </span>
                  </td>
                )}
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
                <td colSpan={loyalty.enabled ? 10 : 9} className="p-8 text-center text-muted-foreground">
                  No hay productos. Haz clic en "Nuevo Producto" para agregar uno.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="landscape:hidden space-y-2">
        {products.map((p, i) => (
          <div
            key={p.id}
            data-kbd-active={i === activeIndex}
            className={`border rounded-lg p-3 space-y-2 ${i === activeIndex ? 'bg-accent' : ''}`}
          >
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
            {loyalty.enabled && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Puntos</span>
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Star className="h-3.5 w-3.5 text-amber-500" />
                  {productPoints[p.id] ?? 0}
                </span>
              </div>
            )}
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

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
        onSaved={() => loadProducts()}
      />

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

      <ProductIntakeDialog
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        onSaved={(msg) => {
          setNotification(msg)
          setTimeout(() => setNotification(''), 3000)
          loadProducts()
        }}
      />

      {notification && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {notification}
        </div>
      )}
    </div>
  )
}
