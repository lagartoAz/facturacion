// Local notifications — Android only. On PC (Electron) this is a no-op: the
// @capacitor/local-notifications web implementation is unavailable there, so we
// gate every call behind isMobileApp() and load the plugin lazily.
import { isMobileApp } from './product-image'
import { formatUSD } from './currency'

// Sales at or above this USD amount fire a phone notification.
export const LARGE_SALE_THRESHOLD_USD = 50

/**
 * Fire a phone notification for a sale whose USD total exceeds the threshold.
 * Best-effort: never throws, so it can't break the checkout flow.
 */
export async function notifyLargeSale(totalUsd: number, invoiceNumber: string): Promise<void> {
  if (!isMobileApp()) return
  if (!(totalUsd > LARGE_SALE_THRESHOLD_USD)) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')

    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions()
    }
    if (perm.display !== 'granted') return

    await LocalNotifications.schedule({
      notifications: [
        {
          // Fits Android's 32-bit notification id range; unique enough per sale.
          id: Date.now() % 2147483647,
          title: 'Venta grande registrada',
          body: `Factura ${invoiceNumber} por ${formatUSD(totalUsd)}`
        }
      ]
    })
  } catch {
    // Notifications are best-effort; ignore any plugin/permission failure.
  }
}
