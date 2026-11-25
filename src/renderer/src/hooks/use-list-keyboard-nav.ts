import { useEffect, useRef, useState } from 'react'

// Teclado para listas/tablas: ↑/↓ mueven la fila resaltada y Enter abre la
// activa. Se ignora cuando el foco está en un campo de texto o cuando hay un
// diálogo abierto (para no abrir una fila por detrás del modal).
export function useListKeyboardNav(
  count: number,
  onEnter: (index: number) => void
): { activeIndex: number; setActiveIndex: (i: number) => void } {
  const [activeIndex, setActiveIndex] = useState(-1)
  const onEnterRef = useRef(onEnter)
  onEnterRef.current = onEnter
  const countRef = useRef(count)
  countRef.current = count

  // Mantener el índice dentro del rango cuando la lista cambia de tamaño.
  useEffect(() => {
    setActiveIndex((i) => (i >= count ? count - 1 : i))
  }, [count])

  // Desplazar la fila activa a la vista.
  useEffect(() => {
    if (activeIndex < 0) return
    document.querySelector('[data-kbd-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return
      // Un modal abierto tiene prioridad: no navegar la lista de fondo.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const n = countRef.current
      if (n === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min((i < 0 ? -1 : i) + 1, n - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max((i < 0 ? n : i) - 1, 0))
      } else if (e.key === 'Enter') {
        setActiveIndex((i) => {
          if (i >= 0 && i < n) {
            e.preventDefault()
            onEnterRef.current(i)
          }
          return i
        })
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return { activeIndex, setActiveIndex }
}
