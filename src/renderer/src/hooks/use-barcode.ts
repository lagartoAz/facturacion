import { useCallback, useRef } from 'react'

interface UseBarcodeOptions {
  onScan: (barcode: string) => void
  onManualSubmit?: (text: string) => void
  maxKeystrokeDelay?: number
  minLength?: number
}

export function useBarcode(options: UseBarcodeOptions) {
  const { onScan, onManualSubmit, maxKeystrokeDelay = 50, minLength = 3 } = options
  const bufferRef = useRef('')
  const lastKeystrokeRef = useRef(0)
  const isScannerRef = useRef(true)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const now = Date.now()
      const timeSinceLast = now - lastKeystrokeRef.current

      if (e.key === 'Enter') {
        e.preventDefault()
        const value = bufferRef.current.trim()
        if (value.length >= minLength && isScannerRef.current) {
          onScan(value)
        } else if (value.length > 0 && onManualSubmit) {
          onManualSubmit(value)
        }
        bufferRef.current = ''
        isScannerRef.current = true
        ;(e.target as HTMLInputElement).value = ''
        return
      }

      if (e.key.length === 1) {
        if (bufferRef.current.length > 0 && timeSinceLast > maxKeystrokeDelay) {
          isScannerRef.current = false
        }
        bufferRef.current += e.key
        lastKeystrokeRef.current = now
      }
    },
    [onScan, onManualSubmit, maxKeystrokeDelay, minLength]
  )

  const reset = useCallback(() => {
    bufferRef.current = ''
    isScannerRef.current = true
  }, [])

  return { handleKeyDown, reset }
}
