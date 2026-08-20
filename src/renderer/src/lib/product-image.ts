import { useEffect, useState } from 'react'

// Product photos live inside the shared database, so they are fetched on demand
// instead of read from a local file: that's the only way an access terminal can
// show the photos of the primary PC. Results are cached per product id for the
// session; saving or removing a photo invalidates its entry.
const cache = new Map<number, string>()

export async function getProductImageUrl(productId: number): Promise<string | null> {
  const cached = cache.get(productId)
  if (cached) return cached
  try {
    const image = await window.api.getProductImage(productId)
    if (!image) return null
    const url = `data:${image.mime};base64,${image.data}`
    cache.set(productId, url)
    return url
  } catch {
    return null
  }
}

export function invalidateProductImage(productId: number): void {
  cache.delete(productId)
}

const MAX_SIDE = 900
const JPEG_QUALITY = 0.85

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imagen invalida'))
    img.src = dataUrl
  })
}

// Shrinks a picked photo before it is stored. Photos taken with a phone are
// several MB, which would bloat the database, slow every backup, and exceed the
// LAN request limit when saved from an access terminal. A thumbnail-sized JPEG
// is all the inventory screens display.
export async function prepareProductImage(file: File): Promise<{ data: string; extension: string }> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
  const dataUrl = await readAsDataUrl(file)
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    if (scale === 1 && file.size <= 300 * 1024) return { data: dataUrl, extension }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return { data: dataUrl, extension }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { data: canvas.toDataURL('image/jpeg', JPEG_QUALITY), extension: 'jpg' }
  } catch {
    // Fall back to the original file if it can't be decoded here.
    return { data: dataUrl, extension }
  }
}

// True when running inside the Capacitor Android WebView (set by web-api.ts).
export function isMobileApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as { __mobileApi?: boolean }).__mobileApi === true
  )
}

// Opens the device camera (Android) and returns a ready-to-store JPEG data URL.
// The plugin already downscales/compresses (width MAX_SIDE, quality 85),
// matching prepareProductImage, so no extra canvas step is needed. Returns null
// if the user cancels or denies permission. Imported lazily so the desktop
// bundle never pulls in the native plugin.
export async function capturePhoto(): Promise<{ data: string; extension: string } | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const photo = await Camera.getPhoto({
      quality: 85,
      width: MAX_SIDE,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true
    })
    return photo.dataUrl ? { data: photo.dataUrl, extension: 'jpg' } : null
  } catch {
    return null
  }
}

export function useProductImage(productId: number, hasImage: boolean): string | null {
  const [src, setSrc] = useState<string | null>(() => (hasImage ? cache.get(productId) ?? null : null))

  useEffect(() => {
    if (!hasImage) {
      setSrc(null)
      return
    }
    let cancelled = false
    getProductImageUrl(productId).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [productId, hasImage])

  return src
}
