/**
 * A small banner for problems the visitor should know about (lost graphics context,
 * etc.), with an optional action. Returns a function that removes it.
 */
export function notice(message: string, action?: { label: string; run: () => void }): () => void {
  const el = document.createElement('div');
  el.className = 'notice';
  el.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--seal notice__btn';
    btn.textContent = action.label;
    btn.addEventListener('click', action.run);
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  return () => el.remove();
}
