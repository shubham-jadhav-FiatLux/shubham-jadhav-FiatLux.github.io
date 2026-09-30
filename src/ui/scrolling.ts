const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Scrolls `container` so `target` is visible. Unlike `Element.scrollIntoView`, it never
 * scrolls the page that embeds the game (for example when it runs inside an iframe).
 */
export function scrollWithin(
  container: HTMLElement,
  target: Element,
  align: 'start' | 'center' = 'start',
  offset = 0,
): void {
  const box = container.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  let top = rect.top - box.top + container.scrollTop - offset;
  if (align === 'center') top -= (container.clientHeight - rect.height) / 2;
  container.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' });
}
