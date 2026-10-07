/**
 * Runs `sj_task` when the browser has a quiet moment (or after `sj_timeoutMs` at the latest),
 * so work nobody is waiting for does not cost a frame. Falls back to a short timeout
 * where requestIdleCallback is missing (Safari).
 */
export function whenIdle(sj_task: () => void, sj_timeoutMs = 2000): void {
  const sj_w = window as Window & {
    requestIdleCallback?: (sj_cb: () => void, sj_o?: { timeout: number }) => number;
  };
  if (sj_w.requestIdleCallback) sj_w.requestIdleCallback(sj_task, { timeout: sj_timeoutMs });
  else window.setTimeout(sj_task, 200);
}
