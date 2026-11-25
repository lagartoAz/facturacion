// Tiny IndexedDB-backed cache so the inventory app keeps showing products and
// prices (with the day's rates) when the LAN server is unreachable. IndexedDB is
// used instead of localStorage because a full catalogue can exceed the ~5 MB
// localStorage quota. One object store, one record under a fixed key.

import type { CachedInventory } from './types'

const DB_NAME = 'facturacion-inventory'
const STORE = 'cache'
const KEY = 'inventory'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB no disponible'))
  })
}

export async function saveInventory(data: CachedInventory): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar la caché'))
    })
    db.close()
  } catch {
    // A failed cache write must never break the online experience.
  }
}

export async function loadInventory(): Promise<CachedInventory | null> {
  try {
    const db = await openDb()
    const data = await new Promise<CachedInventory | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as CachedInventory) ?? null)
      req.onerror = () => reject(req.error ?? new Error('No se pudo leer la caché'))
    })
    db.close()
    return data
  } catch {
    return null
  }
}
