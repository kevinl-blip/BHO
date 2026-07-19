import { useEffect, useRef } from 'react'

// Scrollt sanft zum Bearbeiten-Formular und fokussiert das erste Eingabefeld,
// sobald der Bearbeiten-Modus startet (`trigger` wechselt auf einen Wert wie
// die editingId). Respektiert prefers-reduced-motion. Rückgabe: ref, das auf
// das Formular (oder seinen Container) gesetzt wird.
//
// Einheitliches Muster für alle „Bearbeiten öffnet ein Formular an anderer
// Stelle"-Fälle im Portal und in der Veranstalter-Ansicht.
export function useEditScroll(trigger) {
  const ref = useRef(null)
  useEffect(() => {
    if (trigger === null || trigger === undefined || trigger === false) return
    const node = ref.current
    if (!node) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    const field = node.querySelector('input, select, textarea')
    if (field) field.focus({ preventScroll: true })
  }, [trigger])
  return ref
}
