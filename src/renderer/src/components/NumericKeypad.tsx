import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Delete, Check } from 'lucide-react'

interface NumericKeypadProps {
  open: boolean
  title: string
  subtitle?: string
  initialValue?: string
  allowDecimal?: boolean
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

// In-app numeric keypad used on Android so editing quantities/weights never
// pops up the OS keyboard (the display is a plain div, not an <input>).
export function NumericKeypad({
  open,
  title,
  subtitle,
  initialValue = '',
  allowDecimal = false,
  confirmLabel = 'Aceptar',
  onConfirm,
  onCancel
}: NumericKeypadProps): JSX.Element {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [open, initialValue])

  function press(d: string): void {
    setValue((prev) => {
      if (d === '.') {
        if (!allowDecimal || prev.includes('.')) return prev
        return prev === '' ? '0.' : prev + '.'
      }
      if (prev === '0') return d
      return prev + d
    })
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowDecimal ? '.' : 'C', '0', '⌫']

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {subtitle && <p className="text-sm text-muted-foreground -mt-2 truncate">{subtitle}</p>}
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-right text-3xl font-mono font-bold min-h-[3.5rem] flex items-center justify-end break-all">
          {value || '0'}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <Button
              key={k}
              type="button"
              variant="outline"
              className="h-14 text-xl"
              onClick={() => {
                if (k === '⌫') setValue((prev) => prev.slice(0, -1))
                else if (k === 'C') setValue('')
                else press(k)
              }}
            >
              {k === '⌫' ? <Delete className="h-5 w-5" /> : k}
            </Button>
          ))}
        </div>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={() => onConfirm(value)}>
            <Check className="mr-2 h-4 w-4" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
