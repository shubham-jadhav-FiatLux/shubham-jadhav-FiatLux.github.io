/**
 * Runs `task` when the browser has a quiet moment (or after `timeoutMs` at the latest),
 * so work nobody is waiting for does not cost a frame. Falls back to a short timeout
 * where requestIdleCallback is missing (Safari).
 */
export function whenIdle(task: () => void, timeoutMs = 2000): void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(task, { timeout: timeoutMs });
  else window.setTimeout(task, 200);
}
