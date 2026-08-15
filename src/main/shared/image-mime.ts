// Mime type helpers for product photos, shared by the migration that imports
// the old image files and by the service that stores new ones.

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
}

export function mimeFromExtension(extension: string): string {
  return BY_EXTENSION[extension.replace(/^\./, '').toLowerCase()] ?? 'image/png'
}

export function mimeFromPath(path: string): string {
  return mimeFromExtension(path.split('.').pop() ?? '')
}

// Reads the mime out of a `data:image/png;base64,...` URL, when present.
export function mimeFromDataUrl(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl)
  return match ? match[1] : null
}
