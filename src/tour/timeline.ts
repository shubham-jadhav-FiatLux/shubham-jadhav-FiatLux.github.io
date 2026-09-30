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
    for (const h of this.hooks.splice(0)) h();
  }

  /** Runs `fn` when the ticket is cancelled (immediately if it already is). */
  onCancel(fn: () => void): void {
    if (this.cancelled) fn();
    else this.hooks.push(fn);
  }

  /** Throws `Cancelled` if the ticket was cancelled. */
  check(): void {
    if (this.cancelled) throw new Cancelled();
  }
}

interface Waiter {
  /** returns true when done */
  poll: (now: number) => boolean;
  resolve: () => void;
  reject: (e: Error) => void;
}

export class Timeline {
  /** seconds of (unpaused, scaled) script time */
  now = 0;
  paused = false;
  /** speeds the script up (tests) or down */
  scale = 1;
  private waiters: Waiter[] = [];

  update(dt: number): void {
    if (this.paused) return;
    this.now += dt * this.scale;
    // Resolve in order; a resolved waiter may add new ones (they are polled next frame).
    const list = this.waiters;
    this.waiters = [];
    const keep: Waiter[] = [];
    for (const w of list) {
      if (w.poll(this.now)) w.resolve();
      else keep.push(w);
    }
    this.waiters.push(...keep);
  }

  /** Resolves after `seconds` of script time. */
  wait(seconds: number, ticket: Ticket): Promise<void> {
    const end = this.now + Math.max(0, seconds);
    return this.until(() => this.now >= end, ticket);
  }

  /**
   * Resolves once `done()` returns true (checked every update while not paused), or after
   * `timeout` seconds of script time.
   */
  until(done: () => boolean, ticket: Ticket, timeout = Infinity): Promise<void> {
    ticket.check();
    const end = this.now + timeout;
    return new Promise<void>((resolve, reject) => {
      const w: Waiter = {
        poll: (now) => done() || now >= end,
        resolve,
        reject,
      };
      this.waiters.push(w);
      ticket.onCancel(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Cancelled());
      });
    });
  }

  /** Drops every pending wait (they reject with `Cancelled`). */
  clear(): void {
    for (const w of this.waiters.splice(0)) w.reject(new Cancelled());
  }

  get pending(): number {
    return this.waiters.length;
  }
}

/** Seconds a visitor needs to read `words` words, within sensible bounds for a film. */
export function readingTime(words: number, min = 7, max = 16): number {
  // ~200 words a minute, plus a moment to take in the scroll
  return Math.min(max, Math.max(min, 2.5 + words / 3.3));
}
