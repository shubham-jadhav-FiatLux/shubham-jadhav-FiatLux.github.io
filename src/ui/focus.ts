const sj_FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Focusable, visible elements inside `sj_root`, in tab order. */
export function focusables(sj_root: HTMLElement): HTMLElement[] {
  return [...sj_root.querySelectorAll<HTMLElement>(sj_FOCUSABLE)].filter(
    (sj_el) => !sj_el.hidden && sj_el.getClientRects().length > 0,
  );
}

/**
 * Keeps Tab and Shift+Tab cycling inside a modal dialog while `isOpen()` holds.
 * Listens on the document so focus that slipped out (e.g. to the body) is pulled back in.
 */
export function trapFocus(sj_root: HTMLElement, sj_isOpen: () => boolean): void {
  document.addEventListener('keydown', (sj_e) => {
    if (sj_e.key !== 'Tab' || !sj_isOpen()) return;
    const sj_items = focusables(sj_root);
    if (!sj_items.length) return;
    const sj_first = sj_items[0]!;
    const sj_last = sj_items[sj_items.length - 1]!;
    const sj_active = document.activeElement;
    const sj_inside = sj_active instanceof Node && sj_root.contains(sj_active);
    if (sj_e.shiftKey && (!sj_inside || sj_active === sj_first)) {
      sj_e.preventDefault();
      sj_last.focus();
    } else if (!sj_e.shiftKey && (!sj_inside || sj_active === sj_last)) {
      sj_e.preventDefault();
      sj_first.focus();
    }
  });
}

/**
 * Drops focus that is still inside a panel being closed, so keys like Space go back to
 * the game instead of a hidden button.
 */
export function releaseFocus(sj_root: HTMLElement): void {
  const sj_active = document.activeElement;
  if (sj_active instanceof HTMLElement && sj_root.contains(sj_active)) sj_active.blur();
}
