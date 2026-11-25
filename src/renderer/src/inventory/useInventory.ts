import { useCallback, useEffect, useRef, useState } from 'react'
import type { InvProduct, Rate } from './types'
import { loadInventory, saveInventory } from './offline-store'

// Pull the whole catalogue in one go for the offline cache.
const SYNC_LIMIT = 100000

export interface InventoryApi {
  connected: boolean
  loading: boolean
  syncing: boolean
  syncedAt: string | null
  rates: Rate[]
  products: InvProduct[]
  recheck: () => Promise<boolean>
  sync: () => Promise<void>
  search: (q: string) => Promise<InvProduct[]>
  findByBarcode: (code: string) => Promise<InvProduct | null>
}

// Shared inventory state: connection status, the cached catalogue + rates, and
// online/offline-aware reads. Viewing always works (from cache when offline);
// the UI uses `connected` to gate the "add" actions.
export function useInventory(): InventoryApi {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [rates, setRates] = useState<Rate[]>([])
  const [products, setProducts] = useState<InvProduct[]>([])
  const productsRef = useRef<InvProduct[]>([])
  productsRef.current = products

  // Live connection check (the client transport pings the server).
  const recheck = useCallback(async (): Promise<boolean> => {
    try {
      const info = (await window.api.getNetworkInfo()) as { connected?: boolean }
      const ok = !!info.connected
      setConnected(ok)
      return ok
    } catch {
      setConnected(false)
      return false
    }
  }, [])

  // Pull the full catalogue + rates from the server and refresh the cache.
  const sync = useCallback(async (): Promise<void> => {
    setSyncing(true)
    try {
      const [prods, rateRows] = await Promise.all([
        window.api.getProducts({ active_only: true, limit: SYNC_LIMIT }) as Promise<InvProduct[]>,
        window.api.getExchangeRates() as Promise<Rate[]>
      ])
      const stamp = new Date().toISOString()
      setProducts(prods)
      setRates(rateRows)
      setSyncedAt(stamp)
      setConnected(true)
      await saveInventory({ products: prods, rates: rateRows, syncedAt: stamp })
    } catch {
      // Unreachable: keep showing whatever is cached and mark as offline.
      setConnected(false)
    } finally {
      setSyncing(false)
    }
  }, [])

  // Boot: hydrate from cache first (instant, works offline), then try to connect
  // and sync fresh data.
  useEffect(() => {
    let active = true
    void (async () => {
      const cached = await loadInventory()
      if (active && cached) {
        setProducts(cached.products)
        setRates(cached.rates)
        setSyncedAt(cached.syncedAt)
      }
      if (active) setLoading(false)
      try {
        await window.api.autoReconnect()
      } catch {
        // ignore; recheck below reflects the real state
      }
      if (!active) return
      const ok = await recheck()
      if (ok && active) await sync()
    })()
    return () => {
      active = false
    }
  }, [recheck, sync])

  // Re-check connectivity periodically so the "add" gate stays accurate.
  useEffect(() => {
    const id = setInterval(() => void recheck(), 10000)
    return () => clearInterval(id)
  }, [recheck])

  const search = useCallback(
    async (q: string): Promise<InvProduct[]> => {
      const term = q.trim()
      // Empty query: show the WHOLE synced catalogue (not a 100-row server page),
      // so the list reflects the real total of products in the database.
      if (!term) return productsRef.current
      if (connected) {
        try {
          const rows = (await window.api.getProducts({
            active_only: true,
            search: term,
            limit: 500
          })) as InvProduct[]
          return rows
        } catch {
          setConnected(false)
        }
      }
      // Offline: filter the cached catalogue by name or barcode.
      const low = term.toLowerCase()
      return productsRef.current.filter(
        (p) => p.name.toLowerCase().includes(low) || (p.barcode ?? '').toLowerCase().includes(low)
      )
    },
    [connected]
  )

  const findByBarcode = useCallback(
    async (code: string): Promise<InvProduct | null> => {
      const c = code.trim()
      if (!c) return null
      if (connected) {
        try {
          const p = (await window.api.getProductByBarcode(c)) as InvProduct | null
          return p ?? null
        } catch {
          setConnected(false)
        }
      }
      return productsRef.current.find((p) => (p.barcode ?? '') === c) ?? null
    },
    [connected]
  )

  return {
    connected,
    loading,
    syncing,
    syncedAt,
    rates,
    products,
    recheck,
    sync,
    search,
    findByBarcode
  }
}
