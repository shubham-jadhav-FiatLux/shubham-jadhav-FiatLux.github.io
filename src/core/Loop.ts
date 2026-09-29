/**
 * requestAnimationFrame driver. Hands out a clamped delta (so a background tab does not
 * teleport the panda) plus the real frame time for performance monitoring.
 */
export class Loop {
  elapsed = 0;
  frame = 0;
  private last = 0;
  private handle = 0;
  private running = false;

  constructor(private readonly tick: (dt: number, elapsed: number, frameTime: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const step = (now: number) => {
      if (!this.running) return;
      this.handle = requestAnimationFrame(step);
      const frameTime = Math.max(0, (now - this.last) / 1000);
      this.last = now;
      const dt = Math.min(frameTime, 1 / 20);
      this.elapsed += dt;
      this.frame++;
      this.tick(dt, this.elapsed, frameTime);
    };
    this.handle = requestAnimationFrame(step);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
