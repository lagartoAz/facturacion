// Generates the activation key for an optional add-on (offline licensing).
// Keep LICENSE_SECRET in sync with src/main/services/license.service.ts.
//
// Usage:
//   node scripts/gen-loyalty-key.mjs          # key for the "loyalty" feature
//   node scripts/gen-loyalty-key.mjs loyalty  # same, explicit feature name
//
// The printed key is what you give the customer to paste in
// Configuracion → Complemento: Fidelidad (or what the complement installer
// writes into <userData>/loyalty.license).

import { createHmac } from 'crypto'

const LICENSE_SECRET = 'fidelidad-pos-2026-7Kq2pLw9'

function expectedKey(feature) {
  const h = createHmac('sha256', LICENSE_SECRET).update(feature).digest('hex').toUpperCase()
  return `FID-${h.slice(0, 5)}-${h.slice(5, 10)}-${h.slice(10, 15)}`
}

const feature = process.argv[2] || 'loyalty'
console.log(`Feature: ${feature}`)
console.log(`Clave:   ${expectedKey(feature)}`)
