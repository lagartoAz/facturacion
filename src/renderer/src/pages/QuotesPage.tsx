import { useEffect, useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { useBarcode } from '@/hooks/use-barcode'
import { ProductThumb } from '@/components/ProductThumb'
import { formatUSD, formatVES, formatCOP, convertCurrency } from '@/lib/currency'
import { format } from 'date-fns'
import type { ReceiptData } from '../../../shared/receipt'
import { shareReceiptToWhatsApp } from '@/lib/whatsapp'
import { isMobileApp } from '@/lib/product-image'
import {
  Barcode,
  Plus,
  Minus,
  Trash2,
  Search,
  ClipboardList,
  PlusCircle,
  CheckCircle2,
  FileSignature,
  MessageCircle
} from 'lucide-react'

interface Product {
  id: number
  barcode: string | null
  name: string
  price_usd: number
  stock: number
  has_image: number
  is_by_weight: number
}

interface CartItem {
  productId: number
  productName: string
  unitPrice: number
  quantity: number
  isByWeight: boolean
  isCustom?: boolean
}

interface ExchangeRate {
  currency: string
  rate: number
}

interface CompletedQuote {
  id: number
  quote_number: string
  customer_name: string | null
  total_usd: number
  total_ves: number | null
  total_cop: number | null
  created_at: string
}

export default function QuotesPage(): JSX.Element {
  const [cart, setCart] = useState<CartItem[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [weightDialogOpen, setWeightDialogOpen] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [pendingWeightProduct, setPendingWeightProduct] = useState<Product | null>(null)
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [notification, setNotification] = useState('')
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [completedQuote, setCompletedQuote] = useState<CompletedQuote | null>(null)
  const [saving, setSaving] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadInitialData()
  }, [])

  async function loadInitialData(): Promise<void> {
    const [ratesData, customersData] = await Promise.all([
      window.api.getExchangeRates(),
      window.api.getCustomers()
    ])
    setRates(ratesData)
    setCustomers(customersData)
  }

  const getRate = (currency: string): number =>
    rates.find((r) => r.currency === currency)?.rate ?? 0

  const addToCart = useCallback((product: Product) => {
    if (product.is_by_weight) {
      setPendingWeightProduct(product)
      setWeightInput('')
      setWeightDialogOpen(true)
      return
    }
    addToCartDirect(product, 1, false)
  }, [])

  function addToCartDirect(product: Product, quantity: number, isByWeight: boolean): void {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id)
      if (existing && !isByWeight) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: product.price_usd,
          quantity,
          isByWeight
        }
      ]
    })
  }

  function handleAddCustom(): void {
    const amount = parseFloat(customAmount)
    if (isNaN(amount) || amount <= 0 || !customNote.trim()) return
    setCart((prev) => [
      ...prev,
      {
        productId: 0,
        productName: customNote.trim(),
        unitPrice: amount,
        quantity: 1,
        isByWeight: false,
        isCustom: true
      }
    ])
    setCustomDialogOpen(false)
    setCustomAmount('')
    setCustomNote('')
    barcodeInputRef.current?.focus()
  }

  function handleConfirmWeight(): void {
    const weight = parseFloat(weightInput)
    if (!pendingWeightProduct || isNaN(weight) || weight <= 0) return
    addToCartDirect(pendingWeightProduct, weight, true)
    setWeightDialogOpen(false)
    setPendingWeightProduct(null)
    barcodeInputRef.current?.focus()
  }

  const { handleKeyDown } = useBarcode({
    onScan: async (barcode) => {
      const product = await window.api.getProductByBarcode(barcode)
      if (product) addToCart(product)
      else showNotification(`Producto no encontrado: ${barcode}`)
      if (barcodeInputRef.current) {
        barcodeInputRef.current.value = ''
        barcodeInputRef.current.focus()
      }
    },
    onManualSubmit: async (text) => {
      const product = await window.api.getProductByBarcode(text)
      if (product) addToCart(product)
      else setSearchResults(await window.api.searchProducts(text))
      if (barcodeInputRef.current) {
        barcodeInputRef.current.value = ''
        barcodeInputRef.current.focus()
      }
    }
  })

  async function handleSearch(query: string): Promise<void> {
    setSearchQuery(query)
    if (query.length >= 2) setSearchResults(await window.api.searchProducts(query))
    else setSearchResults([])
  }

  function updateQuantity(productId: number, delta: number): void {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item
          const newQty = item.quantity + delta
          if (newQty <= 0) return null
          return { ...item, quantity: newQty }
        })
        .filter(Boolean) as CartItem[]
    )
  }

  function removeFromCart(productId: number): void {
    setCart((prev) => prev.filter((item) => item.productId !== productId))
  }

  function showNotification(msg: string): void {
    setNotification(msg)
    setTimeout(() => setNotification(''), 3000)
  }

  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  async function handleSaveQuote(): Promise<void> {
    if (cart.length === 0) {
      showNotification('Agrega al menos un producto')
      return
    }
    setSaving(true)
    try {
      const quote = await window.api.createQuote({
        customerId: selectedCustomerId || undefined,
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          isCustom: item.isCustom || false
        })),
        notes: notes.trim() || undefined
      })
      setCompletedQuote(quote)
      setSuccessDialogOpen(true)
      setCart([])
      setSelectedCustomerId(null)
      setNotes('')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  function handleCloseSuccess(): void {
    setSuccessDialogOpen(false)
    setCompletedQuote(null)
    barcodeInputRef.current?.focus()
  }

  async function shareQuoteWhatsApp(): Promise<void> {
    if (!completedQuote) return
    // The created quote summary has no items, so fetch the full one for the PDF.
    const q = await window.api.getQuoteById(completedQuote.id)
    const settings = await window.api.getAllSettings()
    const rTitle = (settings.receipt_title || '').trim()
    const lines: { label: string; amount: string }[] = []
    if (q.total_ves) lines.push({ label: 'Bs.', amount: q.total_ves.toFixed(2) })
    if (q.total_cop) lines.push({ label: 'COP', amount: String(Math.round(q.total_cop)) })
    const receipt: ReceiptData = {
      title: rTitle || undefined,
      invoiceNumber: `PRESUPUESTO ${q.quote_number}`,
      dateText: format(new Date(q.created_at), 'dd/MM/yyyy HH:mm'),
      customerName: q.customer_name || undefined,
      items: (q.items ?? []).map((item: { product_name: string; quantity: number; unit_price: number; subtotal: number }) => ({
        name: item.product_name,
        qty: String(item.quantity),
        unitPrice: `$${item.unit_price.toFixed(2)}`,
        total: `$${item.subtotal.toFixed(2)}`
      })),
      totalText: `$${q.total_usd.toFixed(2)}`,
      footerTitle: 'No es factura. Valido como presupuesto.',
      paymentLines: lines,
      thanks: undefined
    }
    const res = await shareReceiptToWhatsApp(receipt, `Presupuesto ${q.quote_number}`)
    if (!res.ok && res.error) showNotification(`Error al compartir: ${res.error}`)
  }

  return (
    <div className="flex flex-col landscape:flex-row h-full">
      {/* Left: Cart */}
      <div className="flex-1 min-h-0 flex flex-col p-4 landscape:border-r order-last landscape:order-none">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-5 w-5" />
          <h1 className="text-xl font-bold">Nuevo Presupuesto</h1>
        </div>

        <div className="mb-3">
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedCustomerId ?? ''}
            onChange={(e) =>
              setSelectedCustomerId(e.target.value ? parseInt(e.target.value) : null)
            }
          >
            <option value="">Cliente (opcional)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ClipboardList className="h-12 w-12 mb-2 opacity-30" />
              <p>Carrito vacio</p>
              <p className="text-xs">Agrega productos para armar el presupuesto</p>
              <p className="text-xs mt-2 text-amber-500">
                Los presupuestos no afectan stock ni caja
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item, idx) => (
                <div
                  key={item.isCustom || item.isByWeight ? `c-${idx}` : item.productId}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.isCustom
                        ? 'Ingreso personalizado'
                        : `${formatUSD(item.unitPrice)}${item.isByWeight ? '/kg' : ' c/u'}`}
                    </p>
                  </div>
                  {item.isCustom ? (
                    <span className="text-sm font-medium text-blue-500">1</span>
                  ) : item.isByWeight ? (
                    <span className="text-sm font-medium">{item.quantity.toFixed(3)} kg</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.productId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.productId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <p className="w-24 text-right font-semibold">
                    {formatUSD(item.unitPrice * item.quantity)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      item.isByWeight || item.isCustom
                        ? setCart((prev) => prev.filter((_, i) => i !== idx))
                        : removeFromCart(item.productId)
                    }
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-4 mt-4 space-y-2">
          <Input
            placeholder="Notas del presupuesto (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-between text-lg font-bold">
            <span>Total USD</span>
            <span>{formatUSD(total)}</span>
          </div>
          {getRate('VES') > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total VES</span>
              <span>{formatVES(convertCurrency(total, getRate('VES')))}</span>
            </div>
          )}
          {getRate('COP') > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total COP</span>
              <span>{formatCOP(convertCurrency(total, getRate('COP')))}</span>
            </div>
          )}
          <Button
            className="w-full mt-3"
            size="lg"
            disabled={cart.length === 0 || saving}
            onClick={handleSaveQuote}
          >
            <FileSignature className="mr-2 h-5 w-5" />
            {saving ? 'Guardando...' : `Guardar Presupuesto ${formatUSD(total)}`}
          </Button>
        </div>
      </div>

      {/* Right: barcode + search */}
      <div className="w-full landscape:w-80 shrink-0 flex flex-col p-4 border-b landscape:border-b-0 order-first landscape:order-none">
        <Card className="mb-4">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Barcode className="h-4 w-4" />
              Escaner / Buscar
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <Input
              ref={barcodeInputRef}
              onKeyDown={handleKeyDown}
              placeholder="Escanear o nombre..."
              autoFocus
              className="font-mono"
            />
          </CardContent>
        </Card>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar producto..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        <Button
          variant="outline"
          className="mb-4 w-full"
          onClick={() => setCustomDialogOpen(true)}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Item Personalizado
        </Button>

        <div className="overflow-auto space-y-1 max-h-56 landscape:max-h-none landscape:flex-1">
          {searchResults.map((p) => (
            <button
              key={p.id}
              className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => {
                addToCart(p)
                setSearchQuery('')
                setSearchResults([])
                barcodeInputRef.current?.focus()
              }}
            >
              <ProductThumb
                productId={p.id}
                hasImage={!!p.has_image}
                name={p.name}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatUSD(p.price_usd)}
                  {p.is_by_weight ? '/kg' : ''}
                </p>
              </div>
            </button>
          ))}
          {searchQuery.length >= 2 && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se encontraron productos
            </p>
          )}
        </div>
      </div>

      {/* Weight Dialog */}
      <Dialog open={weightDialogOpen} onOpenChange={setWeightDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Peso del Producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pendingWeightProduct?.name} -{' '}
              {pendingWeightProduct ? formatUSD(pendingWeightProduct.price_usd) : ''}/kg
            </p>
            <Input
              type="number"
              step="0.001"
              min="0.001"
              placeholder="Peso en kg"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmWeight()
              }}
              autoFocus
            />
            {weightInput && !isNaN(parseFloat(weightInput)) && parseFloat(weightInput) > 0 && (
              <p className="text-sm text-right font-medium">
                Total:{' '}
                {formatUSD(parseFloat(weightInput) * (pendingWeightProduct?.price_usd ?? 0))}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeightDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmWeight}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Item Dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Item Personalizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Descripcion</label>
              <Input
                placeholder="Ej: Servicio de instalacion"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Monto (USD)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustom()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddCustom}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={(o) => !o && handleCloseSuccess()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Presupuesto Guardado
            </DialogTitle>
          </DialogHeader>
          {completedQuote && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">{completedQuote.quote_number}</p>
              <p className="text-3xl font-bold text-green-600">
                {formatUSD(completedQuote.total_usd)}
              </p>
              <p className="text-xs text-muted-foreground">
                Puedes verlo y convertirlo en venta desde la pagina de Facturas {'>'} pestana
                Presupuestos.
              </p>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-2">
            {isMobileApp() && (
              <Button
                onClick={shareQuoteWhatsApp}
                className="flex-1 bg-green-600 text-white hover:bg-green-700"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Compartir por WhatsApp
              </Button>
            )}
            <Button variant={isMobileApp() ? 'outline' : 'default'} onClick={handleCloseSuccess}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {notification && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-white ${
            notification.includes('Error') ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {notification}
        </div>
      )}
    </div>
  )
}
