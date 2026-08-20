// Pure ESC/POS encoder: turns a ReceiptData into the byte stream a thermal
// printer understands. No I/O and no platform APIs, so it runs anywhere and is
// unit-testable. The transport (Bluetooth / TCP) just writes these bytes.

import type { ReceiptData } from './receipt'

// Common receipt widths in monospace columns: 32 for 58mm paper, 48 for 80mm.
export interface EscposOptions {
  width?: number
  cut?: boolean
}

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

// Minimal UTF-8 -> CP850 map for the accented characters Spanish receipts use.
// Anything unmapped falls back to its ASCII base letter so it never prints garbage.
const CP850: Record<string, number> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  Á: 0xb5,
  É: 0x90,
  Í: 0xd6,
  Ó: 0xe0,
  Ú: 0xe9,
  ü: 0x81,
  Ü: 0x9a,
  '¿': 0xa8,
  '¡': 0xad,
  '°': 0xf8,
  '€': 0xd5
}
const ASCII_FALLBACK: Record<string, string> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ñ: 'n',
  Ñ: 'N',
  Á: 'A',
  É: 'E',
  Í: 'I',
  Ó: 'O',
  Ú: 'U',
  ü: 'u',
  Ü: 'U'
}

class Builder {
  private bytes: number[] = []

  raw(...b: number[]): this {
    this.bytes.push(...b)
    return this
  }

  text(s: string): this {
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 0
      if (code < 0x80) {
        this.bytes.push(code)
      } else if (CP850[ch] !== undefined) {
        this.bytes.push(CP850[ch])
      } else if (ASCII_FALLBACK[ch] !== undefined) {
        this.bytes.push(ASCII_FALLBACK[ch].charCodeAt(0))
      } else {
        this.bytes.push(0x3f) // '?'
      }
    }
    return this
  }

  line(s = ''): this {
    return this.text(s).raw(LF)
  }

  align(a: 'left' | 'center' | 'right'): this {
    return this.raw(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0)
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0)
  }

  // n: bit0-2 = height multiplier, bit4-6 = width multiplier (0 = 1x).
  size(double: boolean): this {
    return this.raw(GS, 0x21, double ? 0x11 : 0x00)
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

// Lays out "left ..... right" padded to `width` columns; truncates if too long.
function lr(left: string, right: string, width: number): string {
  const space = width - left.length - right.length
  if (space >= 1) return left + ' '.repeat(space) + right
  // Not enough room: trim the left part.
  const trimmed = left.slice(0, Math.max(0, width - right.length - 1))
  return trimmed + ' ' + right
}

function divider(width: number): string {
  return '-'.repeat(width)
}

export function encodeReceipt(data: ReceiptData, opts: EscposOptions = {}): Uint8Array {
  const width = opts.width ?? 32
  const b = new Builder()

  b.raw(ESC, 0x40) // ESC @  -> initialize
  b.raw(ESC, 0x74, 0x02) // ESC t 2 -> code page CP850 (Latin)

  b.align('center')
  if (data.title) {
    b.bold(true).size(true).line(data.title).size(false).bold(false)
  }
  b.bold(true).line(data.invoiceNumber).bold(false)
  b.line(data.dateText)
  if (data.customerName) b.line(data.customerName)
  b.line(divider(width))

  // Items: name on its own line, then "qty x unit" left / total right.
  b.align('left')
  for (const it of data.items) {
    b.line(it.name)
    b.line(lr(`  ${it.qty} x ${it.unitPrice}`, it.total, width))
  }

  b.line(divider(width))
  b.align('right').bold(true).size(true)
  b.line(`TOTAL: ${data.totalText}`)
  b.size(false).bold(false)

  b.align('center').line(divider(width))
  if (data.footerTitle) b.line(data.footerTitle)
  for (const pl of data.paymentLines) {
    b.line(pl.label ? `${pl.label}: ${pl.amount}` : pl.amount)
  }
  if (data.thanks) b.line().line(data.thanks)

  b.raw(LF, LF, LF) // feed before cut
  if (opts.cut ?? true) b.raw(GS, 0x56, 0x00) // GS V 0 -> full cut

  return b.build()
}
