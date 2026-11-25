import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScanLine, Plus, Search, PackagePlus } from 'lucide-react'
import { formatUSD, formatVES, formatCOP } from '@/lib/currency'
import { scanBarcode } from '@/lib/barcode-scanner'
import type { InvProduct, Rate } from './types'
import type { InventoryApi } from './useInventory'
import { ProductThumb } from '@/components/ProductThumb'
import CreateProductDialog from './CreateProductDialog'
import AddStockDialog from './AddStockDialog'

function priceLines(p: InvProduct, rates: Rate[]): string[] {
  const ves = rates.find((r) => r.currency === 'VES')?.rate
  const cop = rates.find((r) => r.currency === 'COP')?.rate
  const out = [formatUSD(p.price_usd)]
  if (ves) out.push(formatVES(p.price_usd * ves))
  if (cop) out.push(formatCOP(p.price_usd * cop))
  return out
}

export default function InventoryList({ inv }: { inv: InventoryApi }): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InvProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [addStock, setAddStock] = useState<InvProduct | null>(null)
  const [createFor, setCreateFor] = useState<{ barcode?: string } | null>(null)

  // Debounced search; re-runs when the catalogue syncs or connectivity flips.
  useEffect(() => {
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      void inv.search(query).then((rows) => {
        if (active) {
          setResults(rows)
          setSearching(false)
        }
      })
    }, 250)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query, inv.search, inv.products, inv.connected])

  async function onScan(): Promise<void> {
    const code = await scanBarcode()
    if (!code) return
    setQuery(code)
    const found = await inv.findByBarcode(code)
    if (found) {
      if (inv.connected) setAddStock(found)
    } else if (inv.connected) {
      setCreateFor({ barcode: code })
    } else {
      alert('Producto no encontrado. Conéctate al servidor para crearlo.')
    }
  }

  function onSaved(): void {
    setAddStock(null)
    setCreateFor(null)
    void inv.sync()
  }

  return (
    <div className="space-y-3 p-3">
      {/* Search + scan */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o código"
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={onScan} title="Escanear código">
          <ScanLine className="h-5 w-5" />
        </Button>
      </div>

      {/* New product */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {searching
            ? 'Buscando…'
            : query.trim()
              ? `${results.length} resultado(s)`
              : `${inv.products.length} producto(s) en total`}
        </span>
        <Button
          size="sm"
          onClick={() => setCreateFor({})}
          disabled={!inv.connected}
          title={inv.connected ? 'Crear producto' : 'Requiere conexión'}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nuevo producto
        </Button>
      </div>

      {!inv.connected && (
        <p className="rounded-md bg-amber-500/10 p-2 text-center text-xs text-amber-600">
          Sin conexión — solo lectura. Para agregar inventario conéctate al servidor.
        </p>
      )}

      {/* List */}
      <div className="divide-y rounded-lg border">
        {results.map((p) => {
          const low = p.stock <= p.min_stock
          return (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <ProductThumb
                productId={p.id}
                hasImage={!!p.has_image}
                name={p.name}
                className="h-12 w-12 shrink-0"
                iconClassName="h-5 w-5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.barcode ? `${p.barcode} · ` : ''}
                  <span className={low ? 'font-semibold text-red-500' : ''}>
                    Existencia: {p.stock}
                    {p.is_by_weight ? ' (por peso)' : ''}
                  </span>
                </p>
                <p className="mt-0.5 text-xs">
                  {priceLines(p, inv.rates).map((s, i) => (
                    <span key={i} className="mr-2 inline-block">
                      {s}
                    </span>
                  ))}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAddStock(p)}
                disabled={!inv.connected}
                title={inv.connected ? 'Sumar stock' : 'Requiere conexión'}
              >
                <PackagePlus className="h-5 w-5" />
              </Button>
            </div>
          )
        })}
        {results.length === 0 && !searching && (
          <p className="py-10 text-center text-sm text-muted-foreground">Sin resultados</p>
        )}
      </div>

      {addStock && (
        <AddStockDialog product={addStock} onClose={() => setAddStock(null)} onSaved={onSaved} />
      )}
      {createFor && (
        <CreateProductDialog
          barcode={createFor.barcode}
          onClose={() => setCreateFor(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
