const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Focusable, visible elements inside `root`, in tab order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hidden && el.getClientRects().length > 0,
  );
}

/**
 * Keeps Tab and Shift+Tab cycling inside a modal dialog while `isOpen()` holds.
 * Listens on the document so focus that slipped out (e.g. to the body) is pulled back in.
 */
export function trapFocus(root: HTMLElement, isOpen: () => boolean): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const items = focusables(root);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    const inside = active instanceof Node && root.contains(active);
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  });
}

/**
 * Drops focus that is still inside a panel being closed, so keys like Space go back to
 * the game instead of a hidden button.
 */
export function releaseFocus(root: HTMLElement): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && root.contains(active)) active.blur();
}
