/**
 * Focus management for overlay panels.
 *
 * The exhibition is operated by mouse, touch and keyboard; an overlay that opens on
 * top of the HUD must therefore trap Tab inside itself and return focus to whatever
 * was focused before it opened, otherwise Tab walks into the controls behind it and
 * a keyboard visitor gets lost (§53). Escape is handled by the caller, because only
 * the caller knows what "close" means for that panel.
 */
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(container: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const element = container.current
    if (!active || !element) return
    const previous = document.activeElement as HTMLElement | null

    const focusables = () =>
      [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (candidate) => candidate.offsetParent !== null || candidate === document.activeElement,
      )

    const first = focusables()[0]
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const head = list[0]
      const tail = list[list.length - 1]
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }

    element.addEventListener('keydown', onKeyDown)
    return () => {
      element.removeEventListener('keydown', onKeyDown)
      // Only restore focus when it is still inside the panel that is closing.
      if (previous && document.activeElement && element.contains(document.activeElement)) {
        previous.focus?.()
      }
    }
  }, [container, active])
}
