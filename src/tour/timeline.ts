/**
 * A tiny scheduler for scripted sequences that run on game time: waits and conditions
 * resolve from `update(dt)`, so pausing the clock pauses the whole script, and a ticket
 * can cancel everything that is waiting on it (skipping a chapter, leaving the tour).
 */

/** Thrown into a script when its ticket is cancelled. */
export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

export class Ticket {
  cancelled = false;
  private hooks: (() => void)[] = [];

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const sj_h of this.hooks.splice(0)) sj_h();
  }

  /** Runs `sj_fn` when the ticket is cancelled (immediately if it already is). */
  onCancel(sj_fn: () => void): void {
    if (this.cancelled) sj_fn();
    else this.hooks.push(sj_fn);
  }

  /** Throws `Cancelled` if the ticket was cancelled. */
  check(): void {
    if (this.cancelled) throw new Cancelled();
  }
}

interface Waiter {
  /** returns true when done */
  poll: (sj_now: number) => boolean;
  resolve: () => void;
  reject: (sj_e: Error) => void;
}

export class Timeline {
  /** seconds of (unpaused, scaled) script time */
  now = 0;
  paused = false;
  /** speeds the script up (tests) or down */
  scale = 1;
  private waiters: Waiter[] = [];

  update(sj_dt: number): void {
    if (this.paused) return;
    this.now += sj_dt * this.scale;
    // Resolve in order; a resolved waiter may add new ones (they are polled next frame).
    const sj_list = this.waiters;
    this.waiters = [];
    const sj_keep: Waiter[] = [];
    for (const sj_w of sj_list) {
      if (sj_w.poll(this.now)) sj_w.resolve();
      else sj_keep.push(sj_w);
    }
    this.waiters.push(...sj_keep);
  }

  /** Resolves after `sj_seconds` of script time. */
  wait(sj_seconds: number, sj_ticket: Ticket): Promise<void> {
    const sj_end = this.now + Math.max(0, sj_seconds);
    return this.until(() => this.now >= sj_end, sj_ticket);
  }

  /**
   * Resolves once `done()` returns true (checked every update while not paused), or after
   * `sj_timeout` seconds of script time.
   */
  until(sj_done: () => boolean, sj_ticket: Ticket, sj_timeout = Infinity): Promise<void> {
    sj_ticket.check();
    const sj_end = this.now + sj_timeout;
    return new Promise<void>((sj_resolve, sj_reject) => {
      const sj_w: Waiter = {
        poll: (sj_now) => sj_done() || sj_now >= sj_end,
        resolve: sj_resolve,
        reject: sj_reject,
      };
      this.waiters.push(sj_w);
      sj_ticket.onCancel(() => {
        const sj_i = this.waiters.indexOf(sj_w);
        if (sj_i >= 0) this.waiters.splice(sj_i, 1);
        sj_reject(new Cancelled());
      });
    });
  }

  /** Drops every pending wait (they reject with `Cancelled`). */
  clear(): void {
    for (const sj_w of this.waiters.splice(0)) sj_w.reject(new Cancelled());
  }

  get pending(): number {
    return this.waiters.length;
  }
}

/** Seconds a visitor needs to read `sj_words` words, within sensible bounds for a film. */
export function readingTime(sj_words: number, sj_min = 7, sj_max = 16): number {
  // ~200 words a minute, plus a moment to take in the scroll
  return Math.min(sj_max, Math.max(sj_min, 2.5 + sj_words / 3.3));
}
