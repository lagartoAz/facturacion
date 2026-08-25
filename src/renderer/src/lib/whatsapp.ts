import { registerPlugin } from '@capacitor/core'
import type { ReceiptData } from '../../../shared/receipt'
import { buildReceiptPdfBase64 } from './receipt-pdf'
import { isMobileApp } from './product-image'

interface WhatsAppSharePlugin {
  shareToWhatsApp(options: {
    base64: string
    fileName: string
    mimeType: string
    caption?: string
  }): Promise<void>
}

// Native Android plugin (see android/.../WhatsAppSharePlugin.java). On web/desktop
// the proxy throws when called, so callers must guard with canShareWhatsApp().
const WhatsAppShare = registerPlugin<WhatsAppSharePlugin>('WhatsAppShare')

// WhatsApp sharing is Android-only (needs the native intent + FileProvider).
export function canShareWhatsApp(): boolean {
  return isMobileApp()
}

// Renders the receipt to a PDF and hands it to WhatsApp directly (falls back to
// the system share sheet natively if WhatsApp isn't installed).
export async function shareReceiptToWhatsApp(
  receipt: ReceiptData,
  caption?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const base64 = await buildReceiptPdfBase64(receipt)
    const safe = receipt.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_') || 'recibo'
    await WhatsAppShare.shareToWhatsApp({
      base64,
      fileName: `${safe}.pdf`,
      mimeType: 'application/pdf',
      caption: caption ?? ''
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
