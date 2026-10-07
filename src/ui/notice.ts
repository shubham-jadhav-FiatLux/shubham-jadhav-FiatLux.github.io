/**
 * A small banner for problems the visitor should know about (lost graphics context,
 * etc.), with an optional action. Returns a function that removes it.
 */
export function notice(
  sj_message: string,
  sj_action?: { label: string; run: () => void },
): () => void {
  const sj_el = document.createElement('div');
  sj_el.className = 'notice';
  sj_el.setAttribute('role', 'alert');
  const sj_text = document.createElement('span');
  sj_text.textContent = sj_message;
  sj_el.appendChild(sj_text);
  if (sj_action) {
    const sj_btn = document.createElement('button');
    sj_btn.type = 'button';
    sj_btn.className = 'btn btn--seal notice__btn';
    sj_btn.textContent = sj_action.label;
    sj_btn.addEventListener('click', sj_action.run);
    sj_el.appendChild(sj_btn);
  }
  document.body.appendChild(sj_el);
  return () => sj_el.remove();
}
