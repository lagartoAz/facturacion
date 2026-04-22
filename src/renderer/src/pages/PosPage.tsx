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
  Package
} from 'lucide-react'

interface Product {
  id: number
  barcode: string | null
  name: string
  price_usd: number
  stock: number
  image_path: string | null
}

interface CartItem {
  productId: number
  productName: string
  unitPrice: number
  quantity: number
  stock: number
}

interface ExchangeRate {
  currency: string
  rate: number
}

export default function PosPage(): JSX.Element {
  const [cart, setCart] = useState<CartItem[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [taxPercent, setTaxPercent] = useState(16)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notification, setNotification] = useState('')
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData(): Promise<void> {
    const [ratesData, settings, customersData] = await Promise.all([
      window.api.getExchangeRates(),
      window.api.getAllSettings(),
      window.api.getCustomers()
    ])
    setRates(ratesData)
    setTaxPercent(parseFloat(settings.tax_percent) || 16)
    setCustomers(customersData)
  }

  const getRate = (currency: string): number =>
    rates.find((r) => r.currency === currency)?.rate ?? 0

  const addToCart = useCallback(
    (product: Product) => {
      setCart((prev) => {
        const existing = prev.find((item) => item.productId === product.id)
        if (existing) {
          if (existing.quantity >= product.stock) {
            showNotification(`Stock insuficiente para ${product.name}`)
            return prev
          }
          return prev.map((item) =>
            item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
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
            quantity: 1,
            stock: product.stock
          }
        ]
      })
    },
    []
  )

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

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const taxAmount = subtotal * (taxPercent / 100)
  const total = subtotal + taxAmount

  async function handleConfirmPayment(): Promise<void> {
    try {
      await window.api.createInvoice({
        customerId: selectedCustomerId || undefined,
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        })),
        paymentMethod
      })

      showNotification('Venta registrada exitosamente!')
      setCart([])
      setSelectedCustomerId(null)
      setPaymentDialogOpen(false)
      setPaymentMethod('cash')
      barcodeInputRef.current?.focus()

      // Reload rates in case they changed
      const newRates = await window.api.getExchangeRates()
      setRates(newRates)
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
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
              {cart.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatUSD(item.unitPrice)} c/u
                    </p>
                  </div>
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
                  <p className="w-20 text-right font-semibold">
                    {formatUSD(item.unitPrice * item.quantity)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeFromCart(item.productId)}
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
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{formatUSD(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>IVA ({taxPercent}%)</span>
            <span>{formatUSD(taxAmount)}</span>
          </div>
          <Separator />
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
                {formatUSD(p.price_usd)}
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
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'cash', label: 'Efectivo', icon: DollarSign },
                  { value: 'card', label: 'Tarjeta', icon: CreditCard },
                  { value: 'transfer', label: 'Transfer', icon: ArrowRightLeft }
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
