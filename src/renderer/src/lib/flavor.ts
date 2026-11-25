// Build flavor, injected at build time by electron.vite.config.ts (define).
//   'pos'       → the full "Acceso" POS client (default)
//   'inventory' → the standalone inventory Android app (second APK)
export const APP_FLAVOR: 'pos' | 'inventory' =
  typeof __APP_FLAVOR__ === 'undefined' ? 'pos' : __APP_FLAVOR__

export function isInventoryApp(): boolean {
  return APP_FLAVOR === 'inventory'
}
