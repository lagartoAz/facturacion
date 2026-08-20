import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import type { ReceiptData } from '../../../shared/receipt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ProductThumb } from '@/components/ProductThumb'
import {
  formatUSD,
  formatVES,
  formatCOP,
  convertCurrency,
  getPaidCurrency,
  plainAmountIn
} from '@/lib/currency'
import {
  Barcode,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Search,
  ShoppingCart,
  DollarSign,
  CreditCard,
  ArrowRightLeft,
  Printer,
  CheckCircle2,
  UserCheck,
  PlusCircle,
  Layers,
  Check,
  Pause,
  Clock
} from 'lucide-react'
import { format } from 'date-fns'

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
  cash_currency: string | null
  payment_amount_ves: number | null
  payment_amount_cop: number | null
  payments?: { method: string; amount: number }[]
  created_at: string
  items: { product_name: string; quantity: number; unit_price: number; subtotal: number }[]
}

interface ExchangeRate {
  currency: string
  rate: number
}

interface PendingCart {
  id: number
  label: string | null
  cart_data: string
  created_at: string
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  credit: 'Credito',
  mixed: 'Pago Mixto'
}

interface PaymentLine {
  label: string
  amount: string
}

function getPaymentSummary(inv: CompletedInvoice): { title: string; lines: PaymentLine[] } {
  const title = PAYMENT_METHOD_LABEL[inv.payment_method] ?? inv.payment_method

  if (inv.payment_method === 'cash') {
    let amount = formatUSD(inv.total_usd)
    if (inv.cash_currency === 'VES' && inv.total_ves) amount = formatVES(inv.total_ves)
    else if (inv.cash_currency === 'COP' && inv.total_cop) amount = formatCOP(inv.total_cop)
    return { title, lines: [{ label: 'Efectivo recibido', amount }] }
  }

  if (inv.payment_method === 'card') {
    const amount = inv.payment_amount_ves
      ? formatVES(inv.payment_amount_ves)
      : formatUSD(inv.total_usd)
    return { title, lines: [{ label: 'Cobrado en tarjeta', amount }] }
  }

  if (inv.payment_method === 'transfer') {
    let amount = formatUSD(inv.total_usd)
    if (inv.payment_amount_ves) amount = formatVES(inv.payment_amount_ves)
    else if (inv.payment_amount_cop) amount = formatCOP(inv.payment_amount_cop)
    return { title, lines: [{ label: 'Transferido', amount }] }
  }

  if (inv.payment_method === 'credit') {
    return { title, lines: [{ label: 'Monto fiado', amount: formatUSD(inv.total_usd) }] }
  }

  if (inv.payment_method === 'mixed' && inv.payments) {
    return {
      title,
      lines: inv.payments.map((p) => ({
        label: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
        amount: formatUSD(p.amount)
      }))
    }
  }

  return { title, lines: [{ label: 'Total', amount: formatUSD(inv.total_usd) }] }
}

export default function PosPage(): JSX.Element {
  const location = useLocation()
  const isStandaloneWindow = location.pathname === '/pos-window'

  const [cart, setCart] = useState<CartItem[]>([])
  const [editingQtyId, setEditingQtyId] = useState<number | null>(null)
  const [editingQtyValue, setEditingQtyValue] = useState('')
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
  const [cashCurrency, setCashCurrency] = useState('USD')
  const [transferCurrency, setTransferCurrency] = useState<'VES' | 'COP'>('VES')
  const [paymentVes, setPaymentVes] = useState('')
  const [paymentCop, setPaymentCop] = useState('')
  const [mixedPayments, setMixedPayments] = useState({ cash: '', card: '', transfer: '', credit: '' })
  const [notification, setNotification] = useState('')
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [completedInvoice, setCompletedInvoice] = useState<CompletedInvoice | null>(null)
  const [pendingCarts, setPendingCarts] = useState<PendingCart[]>([])
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false)
  const [pauseLabel, setPauseLabel] = useState('')
  const [pendingCartsOpen, setPendingCartsOpen] = useState(false)
  const [printBehavior, setPrintBehavior] = useState<'ask' | 'always' | 'never'>('ask')
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  // Prevent accidental close with unsaved cart in standalone window
  const cartRef = useRef(cart)
  cartRef.current = cart
  useEffect(() => {
    if (!isStandaloneWindow) return
    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (cartRef.current.length > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isStandaloneWindow])

  // Pressing Space always focuses the barcode input (unless already typing in a field)
  useEffect(() => {
    const handleGlobalSpace = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return
      e.preventDefault()
      barcodeInputRef.current?.focus()
    }
    document.addEventListener('keydown', handleGlobalSpace)
    return () => document.removeEventListener('keydown', handleGlobalSpace)
  }, [])

  async function loadInitialData(): Promise<void> {
    const [ratesData, customersData, pendingCartsData, settings] = await Promise.all([
      window.api.getExchangeRates(),
      window.api.getCustomers(),
      window.api.getPendingCarts(),
      window.api.getAllSettings()
    ])
    setRates(ratesData)
    setCustomers(customersData)
    setPendingCarts(pendingCartsData)
    const pas = settings.print_after_sale
    if (pas === 'always' || pas === 'never') setPrintBehavior(pas)
    else setPrintBehavior('ask')
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

  function setQuantityExact(productId: number, value: string): void {
    const qty = parseInt(value, 10)
    if (!Number.isFinite(qty) || qty <= 0) {
      setEditingQtyId(null)
      setEditingQtyValue('')
      return
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item
        if (qty > item.stock) {
          showNotification('Stock insuficiente')
          return { ...item, quantity: item.stock }
        }
        return { ...item, quantity: qty }
      })
    )
    setEditingQtyId(null)
    setEditingQtyValue('')
  }

  function removeFromCart(productId: number): void {
    setCart((prev) => prev.filter((item) => item.productId !== productId))
  }

  function showNotification(msg: string): void {
    setNotification(msg)
    setTimeout(() => setNotification(''), 3000)
  }

  async function handleConfirmPause(): Promise<void> {
    try {
      await window.api.createPendingCart({
        label: pauseLabel.trim() || undefined,
        cartItems: cart
      })
      setCart([])
      setPauseLabel('')
      setPauseDialogOpen(false)
      const updated = await window.api.getPendingCarts()
      setPendingCarts(updated)
      showNotification('Carrito pausado')
      barcodeInputRef.current?.focus()
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  async function handleRestoreCart(pendingCart: PendingCart): Promise<void> {
    try {
      const cartItems = JSON.parse(pendingCart.cart_data)
      setCart(cartItems)
      await window.api.deletePendingCart(pendingCart.id)
      const updated = await window.api.getPendingCarts()
      setPendingCarts(updated)
      setPendingCartsOpen(false)
      showNotification('Carrito restaurado')
      barcodeInputRef.current?.focus()
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  async function handleDeletePendingCart(id: number): Promise<void> {
    try {
      await window.api.deletePendingCart(id)
      const updated = await window.api.getPendingCarts()
      setPendingCarts(updated)
      showNotification('Carrito eliminado')
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  async function handleConfirmPayment(): Promise<void> {
    if (paymentMethod === 'credit' && !selectedCustomerId) {
      showNotification('Debe seleccionar un cliente para pago a credito')
      return
    }
    if (paymentMethod === 'mixed') {
      const payments = [
        { method: 'cash', amount: parseFloat(mixedPayments.cash) || 0 },
        { method: 'card', amount: parseFloat(mixedPayments.card) || 0 },
        { method: 'transfer', amount: parseFloat(mixedPayments.transfer) || 0 },
        { method: 'credit', amount: parseFloat(mixedPayments.credit) || 0 }
      ].filter((p) => p.amount > 0)
      const assignedTotal = payments.reduce((s, p) => s + p.amount, 0)
      const diff = Math.abs(assignedTotal - total)
      if (diff > 0.01) {
        showNotification(`El monto asignado (${formatUSD(assignedTotal)}) no coincide con el total (${formatUSD(total)})`)
        return
      }
      if (payments.some((p) => p.method === 'credit') && !selectedCustomerId) {
        showNotification('Debe seleccionar un cliente para incluir pago a credito')
        return
      }
    }
    try {
      const invoiceData: Record<string, unknown> = {
        customerId: selectedCustomerId || undefined,
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          isCustom: item.isCustom || false
        })),
        paymentMethod,
        cashCurrency: paymentMethod === 'cash' ? cashCurrency : undefined,
        paymentAmountVes: (paymentMethod === 'card' || (paymentMethod === 'transfer' && transferCurrency === 'VES')) && paymentVes ? parseFloat(paymentVes) || undefined : undefined,
        paymentAmountCop: paymentMethod === 'transfer' && transferCurrency === 'COP' && paymentCop ? parseFloat(paymentCop) || undefined : undefined
      }
      if (paymentMethod === 'mixed') {
        invoiceData.payments = [
          { method: 'cash', amount: parseFloat(mixedPayments.cash) || 0 },
          { method: 'card', amount: parseFloat(mixedPayments.card) || 0 },
          { method: 'transfer', amount: parseFloat(mixedPayments.transfer) || 0 },
          { method: 'credit', amount: parseFloat(mixedPayments.credit) || 0 }
        ].filter((p) => p.amount > 0)
      }
      const invoice = await window.api.createInvoice(invoiceData)

      // Fetch full invoice with items for printing
      const fullInvoice = await window.api.getInvoiceById(invoice.id)
      setCompletedInvoice(fullInvoice)

      setCart([])
      setSelectedCustomerId(null)
      setPaymentDialogOpen(false)
      setPaymentMethod('cash')
      setCashCurrency('USD')
      setPaymentVes('')
      setPaymentCop('')
      setMixedPayments({ cash: '', card: '', transfer: '', credit: '' })

      setSuccessDialogOpen(true)

      if (printBehavior === 'always') {
        handlePrintInvoice(fullInvoice)
      }

      // Reload rates in case they changed
      const newRates = await window.api.getExchangeRates()
      setRates(newRates)
    } catch (err) {
      showNotification(`Error: ${(err as Error).message}`)
    }
  }

  async function handlePrintInvoice(invoiceArg?: typeof completedInvoice): Promise<void> {
    const inv = invoiceArg ?? completedInvoice
    if (!inv) return

    const paid = getPaidCurrency(inv)
    const fmt = (usd: number): string => plainAmountIn(usd, paid, inv.rate_ves, inv.rate_cop)
    const itemsHtml = inv.items
      .map(
        (item) => `
      <tr>
        <td style="padding:2px 0">${item.product_name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${fmt(item.unit_price)}</td>
        <td style="text-align:right">${fmt(item.subtotal)}</td>
      </tr>`
      )
      .join('')

    const summary = getPaymentSummary(inv)
    const paymentLinesHtml = summary.lines
      .map((line) => {
        if (summary.lines.length > 1) {
          return `<div class="center">${line.label}: ${line.amount}</div>`
        }
        return `<div class="center bold">${line.amount}</div>`
      })
      .join('')

    const settings = await window.api.getAllSettings()
    const fs = parseInt(settings.receipt_font_size) || 14
    const fw = settings.receipt_font_weight || '700'
    const rTitle = (settings.receipt_title || '').trim()
    const rm = parseInt(settings.receipt_margin) || 4

    const html = `
      <html><head><title>${inv.invoice_number}</title>
      <style>
        @page { size: 58mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: ${fs}px; font-weight: ${fw}; color: #000; width: 58mm; margin: 0; padding: 3mm ${rm}mm; }
        table { width: 100%; border-collapse: collapse; }
        td, th { font-size: ${fs - 1}px; font-weight: ${fw}; padding: 2px 0; }
        .divider { border-top: 1.5px solid #000; margin: 5px 0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: 900; }
        .label { font-size: ${fs - 1}px; font-weight: ${fw}; text-transform: uppercase; }
      </style></head><body>
        ${rTitle ? `<div class="center bold" style="font-size:${fs + 3}px">${rTitle}</div>` : ''}
        <div class="center bold" style="font-size:${fs + 2}px">${inv.invoice_number}</div>
        <div class="center">${format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}</div>
        ${inv.customer_name ? `<div class="center">${inv.customer_name}</div>` : ''}
        <div class="divider"></div>
        <table>
          <tr><th style="text-align:left">Producto</th><th>Cant</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr>
          ${itemsHtml}
        </table>
        <div class="divider"></div>
        <div class="right bold" style="font-size:${fs + 1}px">TOTAL: ${fmt(inv.total_usd)}</div>
        <div class="divider"></div>
        <div class="center label">Compra en ${summary.title}</div>
        ${paymentLinesHtml}
        <div class="center" style="margin-top:8px">Gracias por su compra!</div>
      </body></html>
    `

    const receipt: ReceiptData = {
      title: rTitle || undefined,
      invoiceNumber: inv.invoice_number,
      dateText: format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm'),
      customerName: inv.customer_name || undefined,
      items: inv.items.map((item) => ({
        name: item.product_name,
        qty: String(item.quantity),
        unitPrice: fmt(item.unit_price),
        total: fmt(item.subtotal)
      })),
      totalText: fmt(inv.total_usd),
      footerTitle: summary.title ? `Compra en ${summary.title}` : undefined,
      paymentLines: summary.lines.map((line) => ({
        label: summary.lines.length > 1 ? line.label : '',
        amount: line.amount
      })),
      thanks: 'Gracias por su compra!'
    }

    const result = await window.api.printReceipt(html, receipt)
    if (!result.success && result.error) {
      showNotification(`Error al imprimir: ${result.error}`)
    }
  }

  function handleCloseSuccess(): void {
    setSuccessDialogOpen(false)
    setCompletedInvoice(null)
    if (isStandaloneWindow) {
      window.close()
      return
    }
    barcodeInputRef.current?.focus()
  }

  return (
    <div className={`flex flex-col landscape:flex-row ${isStandaloneWindow ? 'h-screen' : 'h-full'}`}>
      {/* Left panel - Cart */}
      <div className="flex-1 min-h-0 flex flex-col p-4 landscape:border-r order-last landscape:order-none">
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
                    {!item.isCustom && (getRate('VES') > 0 || getRate('COP') > 0) && (
                      <p className="text-xs text-muted-foreground/80">
                        {getRate('VES') > 0 && (
                          <span>{formatVES(convertCurrency(item.unitPrice, getRate('VES')))}</span>
                        )}
                        {getRate('VES') > 0 && getRate('COP') > 0 && <span> · </span>}
                        {getRate('COP') > 0 && (
                          <span>{formatCOP(convertCurrency(item.unitPrice, getRate('COP')))}</span>
                        )}
                        {item.isByWeight ? '/kg' : ' c/u'}
                      </p>
                    )}
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
                      <div className="flex flex-col items-center gap-1">
                        {editingQtyId === item.productId ? (
                          <Input
                            autoFocus
                            type="text"
                            inputMode="numeric"
                            value={editingQtyValue}
                            onChange={(e) =>
                              setEditingQtyValue(e.target.value.replace(/[^0-9]/g, ''))
                            }
                            onBlur={() => setQuantityExact(item.productId, editingQtyValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setQuantityExact(item.productId, editingQtyValue)
                              if (e.key === 'Escape') {
                                setEditingQtyId(null)
                                setEditingQtyValue('')
                              }
                            }}
                            className="h-7 w-12 text-center px-1"
                          />
                        ) : (
                          <span className="w-12 text-center font-medium">{item.quantity}</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => {
                            setEditingQtyId(item.productId)
                            setEditingQtyValue(String(item.quantity))
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
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
                  <div className="w-28 text-right">
                    <p className="font-semibold">
                      {formatUSD(item.unitPrice * item.quantity)}
                    </p>
                    {(getRate('VES') > 0 || getRate('COP') > 0) && (
                      <p className="text-xs text-muted-foreground/80 leading-tight">
                        {getRate('VES') > 0 && (
                          <span className="block">
                            {formatVES(convertCurrency(item.unitPrice * item.quantity, getRate('VES')))}
                          </span>
                        )}
                        {getRate('COP') > 0 && (
                          <span className="block">
                            {formatCOP(convertCurrency(item.unitPrice * item.quantity, getRate('COP')))}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
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
          {pendingCarts.length > 0 && (
            <Button
              variant="outline"
              className="w-full mt-3"
              onClick={() => setPendingCartsOpen(true)}
            >
              <Layers className="mr-2 h-4 w-4" />
              Carritos Pendientes
              <Badge variant="secondary" className="ml-auto">
                {pendingCarts.length}
              </Badge>
            </Button>
          )}
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              disabled={cart.length === 0}
              onClick={() => setPauseDialogOpen(true)}
            >
              <Pause className="mr-2 h-4 w-4" />
              Pausar
            </Button>
            <Button
              className="flex-1"
              size="lg"
              disabled={cart.length === 0}
              onClick={() => setPaymentDialogOpen(true)}
            >
              <DollarSign className="mr-2 h-5 w-5" />
              Cobrar {formatUSD(total)}
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel - Barcode + Search */}
      <div className="w-full landscape:w-80 shrink-0 flex flex-col p-4 border-b landscape:border-b-0 order-first landscape:order-none">
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
              <div className="grid grid-cols-5 gap-2">
                {[
                  { value: 'cash', label: 'Efectivo', icon: DollarSign },
                  { value: 'card', label: 'Tarjeta', icon: CreditCard },
                  { value: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
                  { value: 'credit', label: 'Credito', icon: UserCheck },
                  { value: 'mixed', label: 'Mixto', icon: Layers }
                ].map((method) => (
                  <Button
                    key={method.value}
                    variant={paymentMethod === method.value ? 'default' : 'outline'}
                    onClick={() => {
                      setPaymentMethod(method.value)
                      setCashCurrency('USD')
                      if (method.value !== 'mixed') {
                        setMixedPayments({ cash: '', card: '', transfer: '', credit: '' })
                      }
                      if (method.value === 'card') {
                        setPaymentVes(String(convertCurrency(total, getRate('VES')).toFixed(2)))
                        setPaymentCop('')
                      } else if (method.value === 'transfer') {
                        setTransferCurrency('VES')
                        setPaymentVes(String(convertCurrency(total, getRate('VES')).toFixed(2)))
                        setPaymentCop('')
                      } else {
                        setPaymentVes('')
                        setPaymentCop('')
                      }
                    }}
                    className="flex flex-col h-auto py-3"
                  >
                    <method.icon className="h-5 w-5 mb-1" />
                    <span className="text-xs">{method.label}</span>
                  </Button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs text-muted-foreground">Moneda del efectivo</label>
                  <div className="flex gap-2">
                    {(['USD', 'VES', 'COP'] as const).map((cur) => (
                      <Button
                        key={cur}
                        type="button"
                        variant={cashCurrency === cur ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1"
                        onClick={() => setCashCurrency(cur)}
                      >
                        {cur === 'USD' ? 'Dolares' : cur === 'VES' ? 'Bolivares' : 'Pesos'}
                      </Button>
                    ))}
                  </div>
                  {cashCurrency === 'VES' && (
                    <p className="text-xs text-muted-foreground">
                      Equivalente: {formatVES(convertCurrency(total, getRate('VES')))}
                    </p>
                  )}
                  {cashCurrency === 'COP' && (
                    <p className="text-xs text-muted-foreground">
                      Equivalente: {formatCOP(convertCurrency(total, getRate('COP')))}
                    </p>
                  )}
                </div>
              )}
              {paymentMethod === 'card' && (
                <div className="space-y-2 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Monto en Bs</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={paymentVes}
                      onChange={(e) => setPaymentVes(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {paymentMethod === 'transfer' && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs text-muted-foreground">Moneda de la transferencia</label>
                  <div className="flex gap-2">
                    {(['VES', 'COP'] as const).map((cur) => (
                      <Button
                        key={cur}
                        type="button"
                        variant={transferCurrency === cur ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() => {
                          setTransferCurrency(cur)
                          if (cur === 'VES') {
                            setPaymentVes(String(convertCurrency(total, getRate('VES')).toFixed(2)))
                            setPaymentCop('')
                          } else {
                            setPaymentCop(String(convertCurrency(total, getRate('COP')).toFixed(0)))
                            setPaymentVes('')
                          }
                        }}
                      >
                        {transferCurrency === cur && <Check className="h-4 w-4" />}
                        {cur === 'VES' ? 'Bolivares' : 'Pesos'}
                      </Button>
                    ))}
                  </div>
                  {transferCurrency === 'VES' && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Monto en Bs</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={paymentVes}
                        onChange={(e) => setPaymentVes(e.target.value)}
                      />
                    </div>
                  )}
                  {transferCurrency === 'COP' && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Monto en Pesos (COP)</label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="0"
                        value={paymentCop}
                        onChange={(e) => setPaymentCop(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              {paymentMethod === 'mixed' && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground">Distribuya el total entre los metodos de pago</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Efectivo
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={mixedPayments.cash}
                        onChange={(e) => setMixedPayments((p) => ({ ...p, cash: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Tarjeta
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={mixedPayments.card}
                        onChange={(e) => setMixedPayments((p) => ({ ...p, card: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <ArrowRightLeft className="h-3 w-3" /> Transferencia
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={mixedPayments.transfer}
                        onChange={(e) => setMixedPayments((p) => ({ ...p, transfer: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <UserCheck className="h-3 w-3" /> Credito
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={mixedPayments.credit}
                        onChange={(e) => setMixedPayments((p) => ({ ...p, credit: e.target.value }))}
                      />
                    </div>
                  </div>
                  {(() => {
                    const assigned = (parseFloat(mixedPayments.cash) || 0) + (parseFloat(mixedPayments.card) || 0) + (parseFloat(mixedPayments.transfer) || 0) + (parseFloat(mixedPayments.credit) || 0)
                    const remaining = total - assigned
                    return (
                      <div className="flex justify-between text-sm font-medium">
                        <span>Asignado: {formatUSD(assigned)}</span>
                        <span className={remaining > 0.01 ? 'text-red-500' : remaining < -0.01 ? 'text-red-500' : 'text-green-500'}>
                          {Math.abs(remaining) < 0.01 ? 'Completo' : `Faltan: ${formatUSD(remaining)}`}
                        </span>
                      </div>
                    )
                  })()}
                </div>
              )}
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
          {completedInvoice && (() => {
            const summary = getPaymentSummary(completedInvoice)
            return (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {completedInvoice.invoice_number}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total
                  </p>
                  <p className="text-4xl font-bold text-green-600">
                    {formatUSD(completedInvoice.total_usd)}
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/40 p-3 text-center space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Compra realizada en {summary.title}
                  </p>
                  {summary.lines.map((line, idx) => (
                    <p key={idx} className="text-lg font-semibold">
                      {line.amount}
                      {summary.lines.length > 1 && (
                        <span className="text-xs text-muted-foreground font-normal ml-2">
                          ({line.label})
                        </span>
                      )}
                    </p>
                  ))}
                  {(completedInvoice.total_ves || completedInvoice.total_cop) && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Equivalencias:{' '}
                      {completedInvoice.total_ves
                        ? formatVES(completedInvoice.total_ves)
                        : ''}
                      {completedInvoice.total_ves && completedInvoice.total_cop ? ' · ' : ''}
                      {completedInvoice.total_cop
                        ? formatCOP(completedInvoice.total_cop)
                        : ''}
                    </p>
                  )}
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
                </div>
              </div>
            )
          })()}
          <DialogFooter className="flex gap-2 sm:gap-2">
            {printBehavior === 'ask' ? (
              <>
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
              </>
            ) : (
              <Button onClick={handleCloseSuccess} className="flex-1">
                {printBehavior === 'always' ? (
                  <><Printer className="mr-2 h-4 w-4" />Imprimiendo... Continuar</>
                ) : (
                  'Continuar'
                )}
              </Button>
            )}
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

      {/* Pause Cart Dialog */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Pausar Carrito</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleConfirmPause() }} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Guarda este carrito para continuarlo mas tarde
            </p>
            <div className="space-y-2">
              <Label>Etiqueta (opcional)</Label>
              <Input
                placeholder="Ej: Cliente Juan, Mesa 5..."
                value={pauseLabel}
                onChange={(e) => setPauseLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Items en carrito: {cart.length} | Total: {formatUSD(total)}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPauseDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                Pausar Carrito
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pending Carts List Dialog */}
      <Dialog open={pendingCartsOpen} onOpenChange={setPendingCartsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Carritos Pendientes ({pendingCarts.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pendingCarts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay carritos pendientes
              </p>
            ) : (
              pendingCarts.map((pc) => {
                const items = JSON.parse(pc.cart_data) as CartItem[]
                const pcTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
                return (
                  <div
                    key={pc.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {pc.label || 'Sin etiqueta'}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(pc.created_at), 'dd/MM/yyyy HH:mm')}
                      </p>
                      <p className="text-sm mt-1">
                        {items.length} items · {formatUSD(pcTotal)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleRestoreCart(pc)}
                      >
                        Restaurar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDeletePendingCart(pc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCartsOpen(false)}>
              Cerrar
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
