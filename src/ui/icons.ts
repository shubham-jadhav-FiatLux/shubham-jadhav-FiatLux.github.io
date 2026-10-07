/** Inline SVG icons (stroke based, inherit currentColor). */
const sj_svg = (sj_body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${sj_body}</svg>`;

export const sj_ICONS = {
  map: sj_svg(
    '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  ),
  soundOn: sj_svg(
    '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/>',
  ),
  soundOff: sj_svg('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>'),
  music: sj_svg(
    '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  ),
  menu: sj_svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: sj_svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  book: sj_svg(
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/>',
  ),
  play: sj_svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: sj_svg('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  next: sj_svg('<path d="M6 5.5v13l8.5-6.5zM18 5.5v13"/>'),
  film: sj_svg(
    '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17M3.5 15h17M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4"/>',
  ),
  travel: sj_svg(
    '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  ),
};
