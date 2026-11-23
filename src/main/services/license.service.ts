import { app } from 'electron'
import { createHmac } from 'crypto'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

// Offline licensing for optional add-ons. A key is an HMAC of the feature name
// under a secret baked into the app, so it can be validated with no server and
// no internet. Rotating LICENSE_SECRET invalidates every key issued before.
// The matching keys are produced by scripts/gen-loyalty-key.mjs.
const LICENSE_SECRET = 'fidelidad-pos-2026-7Kq2pLw9'

export function expectedKey(feature: string): string {
  const h = createHmac('sha256', LICENSE_SECRET).update(feature).digest('hex').toUpperCase()
  return `FID-${h.slice(0, 5)}-${h.slice(5, 10)}-${h.slice(10, 15)}`
}

export function normalizeKey(key: string): string {
  return key.trim().toUpperCase().replace(/\s+/g, '')
}

export function isValidKey(feature: string, key: string): boolean {
  return normalizeKey(key) === expectedKey(feature)
}

function licenseFile(feature: string): string {
  return join(app.getPath('userData'), `${feature}.license`)
}

// True when a valid license file is present. A complement installer can simply
// drop this file into userData; the in-app activation writes the same file.
export function isLicensed(feature: string): boolean {
  try {
    const f = licenseFile(feature)
    if (!existsSync(f)) return false
    return isValidKey(feature, readFileSync(f, 'utf8'))
  } catch {
    return false
  }
}

export function writeLicense(feature: string, key: string): boolean {
  if (!isValidKey(feature, key)) return false
  writeFileSync(licenseFile(feature), normalizeKey(key), 'utf8')
  return true
}

export function removeLicense(feature: string): void {
  try {
    rmSync(licenseFile(feature), { force: true })
  } catch {
    // Nothing to remove.
  }
}
