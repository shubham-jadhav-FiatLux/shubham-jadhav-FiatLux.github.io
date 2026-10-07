export const sj_reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Scrolls `sj_container` so `sj_target` is visible. Unlike `Element.scrollIntoView`, it never
 * scrolls the page that embeds the game (for example when it runs inside an iframe).
 */
export function scrollWithin(
  sj_container: HTMLElement,
  sj_target: Element,
  sj_align: 'start' | 'center' = 'start',
  sj_offset = 0,
): void {
  const sj_box = sj_container.getBoundingClientRect();
  const sj_rect = sj_target.getBoundingClientRect();
  let sj_top = sj_rect.top - sj_box.top + sj_container.scrollTop - sj_offset;
  if (sj_align === 'center') sj_top -= (sj_container.clientHeight - sj_rect.height) / 2;
  sj_container.scrollTo({
    top: Math.max(0, sj_top),
    behavior: sj_reduceMotion() ? 'auto' : 'smooth',
  });
}
