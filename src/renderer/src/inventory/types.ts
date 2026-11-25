// Shape of the product rows the inventory app uses (subset of the server's
// Product). Prices are stored in USD; VES/COP are derived with the day's rates.
export interface InvProduct {
  id: number
  barcode: string | null
  name: string
  price_usd: number
  stock: number
  min_stock: number
  is_by_weight: number
  is_active?: number
  has_image?: number
}

export interface Rate {
  currency: string // 'VES' | 'COP'
  rate: number
  updated_at?: string
}

// Everything the app needs to work offline, persisted in IndexedDB.
export interface CachedInventory {
  products: InvProduct[]
  rates: Rate[]
  syncedAt: string // ISO timestamp of the last successful sync
}
