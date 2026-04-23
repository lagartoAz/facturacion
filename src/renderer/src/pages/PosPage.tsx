import { useEffect, useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { useBarcode } from '@/hooks/use-barcode'
import { formatUSD, formatVES, formatCOP, convertCurrency } from '@/lib/currency'
import {
  Barcode,
  Plus,
  Minus,
  Trash2,
  Search,
  ShoppingCart,
  DollarSign,
  CreditCard,
  ArrowRightLeft,
  Package,
  Printer,
  CheckCircle2,
  UserCheck,
  PlusCircle
} from 'lucide-react'
import { format } from 'date-fns'

interface Product {
  id: number
  barcode: string | null
  name: string
  price_usd: number
  stock: number
  image_path: string | null
  is_by_weight: number
}

interface CartItem {
  productId: number
  productName: string
  unitPrice: number
  quantity: number
  stock: number
  isByWeight: boolean
  isCustom?: boolean
}

interface CompletedInvoice {
  id: number
  invoice_number: string
  customer_name: string | null
  subtotal_usd: number
  total_usd: number
  rate_ves: number | null
  rate_cop: number | null
  total_ves: number | null
  total_cop: number | null
  payment_method: string
  created_at: string
  items: { product_name: string; quantity: number; unit_price: number; subtotal: number }[]
}

interface ExchangeRate {
  currency: string
  rate: number
}

export default function PosPage(): JSX.Element {
  const [cart, setCart] = useState<CartItem[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [weightDialogOpen, setWeightDialogOpen] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [pendingWeightProduct, setPendingWeightProduct] = useState<Product | null>(null)
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notification, setNotification] = useState('')
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [completedInvoice, setCompletedInvoice] = useState<CompletedInvoice | null>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadInitialData()
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

  const addToCart = useCallback(
    (product: Product) => {
      if (product.is_by_weight) {
        setPendingWeightProduct(product)
        setWeightInput('')
        setWeightDialogOpen(true)
        return
      }
      addToCartDirect(product, 1, false)
    },
    []
  )

  function addToCartDirect(product: Product, quantity: number, isByWeight: boolean): void {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id)
      if (existing && !isByWeight) {
        if (existing.quantity >= product.stock) {
          showNotification(`Stock insuficiente para ${product.name}`)
          return prev
        }
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item
        )
      }
      if (product.stock <= 0) {
        showNotification(`Sin stock: ${product.name}`)
        return prev
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: product.price_usd,
          quantity,
          stock: product.stock,
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
        stock: 9999,
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
      if (product) {
        addToCart(product)
      } else {
        showNotification(`Producto no encontrado: ${barcode}`)
      }
      if (barcodeInputRef.current) {
        barcodeInputRef.current.value = ''
        barcodeInputRef.current.focus()
      }
    },
    onManualSubmit: async (text) => {
      // Try barcode first, then search
      const product = await window.api.getProductByBarcode(text)
      if (product) {
        addToCart(product)
      } else {
        const results = await window.api.searchProducts(text)
        setSearchResults(results)
      }
      if (barcodeInputRef.current) {
        barcodeInputRef.current.value = ''
        barcodeInputRef.current.focus()
      }
    }
  })

  async function handleSearch(query: string): Promise<void> {
    setSearchQuery(query)
    if (query.length >= 2) {
      setSearchResults(await window.api.searchProducts(query))
    } else {
      setSearchResults([])
    }
  }

  function updateQuantity(productId: number, delta: number): void {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item
          const newQty = item.quantity + delta
          if (newQty <= 0) return null
          if (newQty > item.stock) {
            showNotification('Stock insuficiente')
            return item
          }
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

  async function handleConfirmPayment(): Promise<void> {
    if (paymentMethod === 'credit' && !selectedCustomerId) {
      showNotification('Debe seleccionar un cliente para pago a credito')
      return
    }
    try {
      const invoice = await window.api.createInvoice({
        customerId: selectedCustomerId || undefined,
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          isCustom: item.isCustom || false
        })),
        paymentMethod
      })

      // Fetch full invoice with items for printing
      const fullInvoice = await window.api.getInvoiceById(invoice.id)
      setCompletedInvoice(fullInvoice)

      setCart([])
      setSelectedCustomerId(null)
      setPaymentDialogOpen(false)
      setPaymentMethod('cash')
      setSuccessDialogOpen(true)

      // Reload rates in case they changed
      const newRates = await window.api.getExchangeRates()
      setRates(newRates)
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  function handlePrintInvoice(): void {
    if (!completedInvoice) return
    const inv = completedInvoice
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) return

    const itemsHtml = inv.items
      .map(
        (item) => `
      <tr>
        <td style="padding:2px 0">${item.product_name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">$${item.unit_price.toFixed(2)}</td>
        <td style="text-align:right">$${item.subtotal.toFixed(2)}</td>
      </tr>`
      )
      .join('')

    printWindow.document.write(`
      <html><head><title>${inv.invoice_number}</title>
      <style>
        body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 10px; }
        table { width: 100%; border-collapse: collapse; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
      </style></head><body>
        <div class="center bold">${inv.invoice_number}</div>
        <div class="center">${format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</div>
        ${inv.customer_name ? `<div class="center">${inv.customer_name}</div>` : ''}
        <div class="divider"></div>
        <table>
          <tr><th style="text-align:left">Producto</th><th>Cant</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr>
          ${itemsHtml}
        </table>
        <div class="divider"></div>
        <div class="right bold">TOTAL: $${inv.total_usd.toFixed(2)}</div>
        ${inv.total_ves ? `<div class="right">Bs. ${inv.total_ves.toFixed(2)} (Tasa: ${inv.rate_ves?.toFixed(2)})</div>` : ''}
        ${inv.total_cop ? `<div class="right">COP ${Math.round(inv.total_cop)} (Tasa: ${inv.rate_cop?.toFixed(0)})</div>` : ''}
        <div class="divider"></div>
        <div class="center">Pago: ${inv.payment_method}</div>
        <div class="center" style="margin-top:10px">Gracias por su compra!</div>
      </body></html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  function handleCloseSuccess(): void {
    setSuccessDialogOpen(false)
    setCompletedInvoice(null)
    barcodeInputRef.current?.focus()
  }

  return (
    <div className="flex h-full">
      {/* Left panel - Cart */}
      <div className="flex-1 flex flex-col p-4 border-r">
        {/* Customer selector */}
        <div className="mb-4">
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedCustomerId ?? ''}
            onChange={(e) => setSelectedCustomerId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Consumidor Final</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-2 opacity-30" />
              <p>Carrito vacio</p>
              <p className="text-xs">Escanea un producto para comenzar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item, idx) => (
                <div
                  key={item.isCustom || item.isByWeight ? `custom-${idx}` : item.productId}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.isCustom ? 'Ingreso personalizado' : `${formatUSD(item.unitPrice)}${item.isByWeight ? '/kg' : ' c/u'}`}
                    </p>
                  </div>
                  {item.isCustom ? (
                    <span className="text-sm font-medium text-blue-500">
                      <PlusCircle className="h-4 w-4 inline mr-1" />
                      1
                    </span>
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
                  <p className="w-20 text-right font-semibold">
                    {formatUSD(item.unitPrice * item.quantity)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => (item.isByWeight || item.isCustom) ? setCart(prev => prev.filter((_, i) => i !== idx)) : removeFromCart(item.productId)}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t pt-4 mt-4 space-y-2">
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
            disabled={cart.length === 0}
            onClick={() => setPaymentDialogOpen(true)}
          >
            <DollarSign className="mr-2 h-5 w-5" />
            Cobrar {formatUSD(total)}
          </Button>
        </div>
      </div>

      {/* Right panel - Barcode + Search */}
      <div className="w-80 flex flex-col p-4">
        {/* Barcode input */}
        <Card className="mb-4">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Barcode className="h-4 w-4" />
              Escaner de Codigo
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <Input
              ref={barcodeInputRef}
              onKeyDown={handleKeyDown}
              placeholder="Escanear codigo de barras..."
              autoFocus
              className="font-mono"
            />
          </CardContent>
        </Card>

        {/* Product search */}
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

        {/* Custom income button */}
        <Button
          variant="outline"
          className="mb-4 w-full"
          onClick={() => setCustomDialogOpen(true)}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Ingreso Personalizado
        </Button>

        {/* Search results / product list */}
        <div className="flex-1 overflow-auto space-y-1">
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
              {p.image_path ? (
                <img
                  src={`file://${p.image_path}`}
                  alt={p.name}
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  Stock: {p.stock}
                  {p.barcode && ` | ${p.barcode}`}
                </p>
              </div>
              <Badge variant="secondary" className="ml-2 shrink-0">
                {formatUSD(p.price_usd)}{p.is_by_weight ? '/kg' : ''}
              </Badge>
            </button>
          ))}
          {searchQuery.length >= 2 && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se encontraron productos
            </p>
          )}
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-3xl font-bold">{formatUSD(total)}</p>
              <p className="text-sm text-muted-foreground">
                {formatVES(convertCurrency(total, getRate('VES')))} |{' '}
                {formatCOP(convertCurrency(total, getRate('COP')))}
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Metodo de Pago</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 'cash', label: 'Efectivo', icon: DollarSign },
                  { value: 'card', label: 'Tarjeta', icon: CreditCard },
                  { value: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
                  { value: 'credit', label: 'Credito', icon: UserCheck }
                ].map((method) => (
                  <Button
                    key={method.value}
                    variant={paymentMethod === method.value ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod(method.value)}
                    className="flex flex-col h-auto py-3"
                  >
                    <method.icon className="h-5 w-5 mb-1" />
                    <span className="text-xs">{method.label}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Items:</span> {cart.length}
              </p>
              <p>
                <span className="text-muted-foreground">Unidades:</span>{' '}
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPayment} size="lg">
              Confirmar Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog - Print or Continue */}
      <Dialog open={successDialogOpen} onOpenChange={(open) => { if (!open) handleCloseSuccess() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Venta Registrada
            </DialogTitle>
          </DialogHeader>
          {completedInvoice && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  {completedInvoice.invoice_number}
                </p>
                <p className="text-3xl font-bold text-green-600">
                  {formatUSD(completedInvoice.total_usd)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {completedInvoice.total_ves
                    ? formatVES(completedInvoice.total_ves)
                    : ''}{' '}
                  |{' '}
                  {completedInvoice.total_cop
                    ? formatCOP(completedInvoice.total_cop)
                    : ''}
                </p>
              </div>
              <Separator />
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente</span>
                  <span>{completedInvoice.customer_name || 'Consumidor Final'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items</span>
                  <span>{completedInvoice.items.length} productos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pago</span>
                  <span>
                    {completedInvoice.payment_method === 'cash'
                      ? 'Efectivo'
                      : completedInvoice.payment_method === 'card'
                        ? 'Tarjeta'
                        : 'Transferencia'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleCloseSuccess} className="flex-1">
              Continuar sin imprimir
            </Button>
            <Button
              onClick={() => {
                handlePrintInvoice()
                handleCloseSuccess()
              }}
              className="flex-1"
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Weight Dialog */}
      <Dialog open={weightDialogOpen} onOpenChange={setWeightDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Peso del Producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pendingWeightProduct?.name} - {pendingWeightProduct ? formatUSD(pendingWeightProduct.price_usd) : ''}/kg
            </p>
            <div className="space-y-2">
              <Input
                type="number"
                step="0.001"
                min="0.001"
                placeholder="Peso en kg (ej: 0.500)"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmWeight() }}
                autoFocus
              />
              {weightInput && !isNaN(parseFloat(weightInput)) && parseFloat(weightInput) > 0 && (
                <p className="text-sm text-right font-medium">
                  Total: {formatUSD(parseFloat(weightInput) * (pendingWeightProduct?.price_usd ?? 0))}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeightDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmWeight} disabled={!weightInput || isNaN(parseFloat(weightInput)) || parseFloat(weightInput) <= 0}>
              Agregar al Carrito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Income Dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Ingreso Personalizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Descripcion</label>
              <Input
                placeholder="Ej: Servicio de reparacion"
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
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustom() }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddCustom}
              disabled={!customNote.trim() || !customAmount || isNaN(parseFloat(customAmount)) || parseFloat(customAmount) <= 0}
            >
              Agregar al Carrito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification */}
      {notification && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-white ${
            notification.includes('Error') || notification.includes('insuficiente') || notification.includes('Sin stock')
              ? 'bg-red-600'
              : 'bg-green-600'
          }`}
        >
          {notification}
        </div>
      )}
    </div>
  )
}
