import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The behaviour every modal owes a keyboard and screen-reader user, in one
 * place: Escape closes, Tab stays inside the dialog, the page behind doesn't
 * scroll, and focus returns to whatever opened it. The three modals each
 * handled some of this (two had Escape, none trapped focus or locked scroll).
 *
 * Attach the returned ref to the dialog panel (not the backdrop), and give that
 * element role="dialog" aria-modal="true" and an aria-labelledby.
 *
 * `onClose` is read through a ref so an inline arrow doesn't re-run the effect
 * — which would steal focus back to the first field on every render.
 */
export function useDialog(onClose) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Respect a field the modal already focused itself (firstFieldRef).
    const panel = ref.current
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector(FOCUSABLE)
      ;(first || panel).focus?.()
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); return }
      if (e.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll(FOCUSABLE)]
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [])

  return ref
}
