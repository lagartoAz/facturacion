import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { History, ChevronRight, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'

interface SupplierLite {
  id: number
  name: string
}

interface PurchaseItem {
  id: number
  product_name: string
  quantity: number
  unit_cost: number
  subtotal: number
}

interface Purchase {
  id: number
  reference: string | null
  notes: string | null
  total_cost: number
  total_items: number
  created_at: string
  items?: PurchaseItem[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: SupplierLite | null
}

function fmtDate(s: string): string {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'))
  if (isNaN(d.getTime())) return s
  return format(d, 'dd/MM/yyyy HH:mm')
}

export default function PurchaseHistoryDialog({ open, onOpenChange, supplier }: Props): JSX.Element {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [expanded, setExpanded] = useState<Record<number, PurchaseItem[]>>({})
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supplier) return
    setLoading(true)
    try {
      setPurchases((await window.api.getSupplierPurchases(supplier.id)) as Purchase[])
    } finally {
      setLoading(false)
    }
  }, [supplier])

  useEffect(() => {
    if (open) {
      setExpanded({})
      load()
    }
  }, [open, load])

  async function toggle(id: number): Promise<void> {
    if (expanded[id]) {
      setExpanded((e) => {
        const next = { ...e }
        delete next[id]
        return next
      })
      return
    }
    const full = (await window.api.getPurchaseById(id)) as Purchase
    setExpanded((e) => ({ ...e, [id]: full.items || [] }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Ingresos — {supplier?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {loading && <p className="text-sm text-muted-foreground p-4 text-center">Cargando...</p>}
          {!loading && purchases.length === 0 && (
            <p className="text-sm text-muted-foreground p-6 text-center">
              Aun no hay facturas de ingreso para este proveedor.
            </p>
          )}
          {purchases.map((pu) => (
            <div key={pu.id} className="border rounded-md">
              <button
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40"
                onClick={() => toggle(pu.id)}
              >
                {expanded[pu.id] ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <div className="font-medium text-sm">{fmtDate(pu.created_at)}</div>
                  <div className="text-xs text-muted-foreground">
                    {pu.reference ? `Factura ${pu.reference} · ` : ''}
                    {pu.total_items} unidad(es)
                    {pu.notes ? ` · ${pu.notes}` : ''}
                  </div>
                </div>
                {pu.total_cost > 0 && (
                  <div className="text-sm font-semibold">${pu.total_cost.toFixed(2)}</div>
                )}
              </button>
              {expanded[pu.id] && (
                <div className="border-t px-3 pb-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left py-1 font-medium">Producto</th>
                        <th className="text-center py-1 font-medium">Cantidad</th>
                        <th className="text-right py-1 font-medium">Costo unit.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expanded[pu.id].map((it) => (
                        <tr key={it.id} className="border-t">
                          <td className="py-1">{it.product_name}</td>
                          <td className="py-1 text-center">{it.quantity}</td>
                          <td className="py-1 text-right">
                            {it.unit_cost > 0 ? `$${it.unit_cost.toFixed(2)}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
