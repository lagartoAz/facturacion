import { isMobileApp } from './product-image'

// Opens the phone camera (Android, via @capacitor-mlkit/barcode-scanning) and
// returns the first scanned barcode's raw value, or null if it can't scan
// (unsupported, permission denied, or the user cancels). Imported lazily so the
// desktop/web bundle never pulls in the native plugin. On the first use the
// Google barcode-scanner module may need to download; if it isn't ready yet the
// scan fails gracefully and the user can retry.
export async function scanBarcode(): Promise<string | null> {
  if (!isMobileApp()) return null
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')

    const supported = await BarcodeScanner.isSupported()
    if (!supported.supported) return null

    // scan() uses Google's ready-to-use scanner (Play Services), which needs no
    // camera permission but does need a downloadable module on some devices.
    // Ensure it's installed before scanning; ignore if the API is unavailable.
    try {
      const mod = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!mod.available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule()
      }
    } catch {
      // Not all devices/versions expose the module API; fall through to scan().
    }

    const { barcodes } = await BarcodeScanner.scan()
    return barcodes[0]?.rawValue ?? null
  } catch {
    return null
  }
}
