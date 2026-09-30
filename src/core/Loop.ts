/**
 * requestAnimationFrame driver. Hands out a clamped delta (so a background tab does not
 * teleport the panda) plus the real frame time for performance monitoring.
 */
export class Loop {
  elapsed = 0;
  frame = 0;
  /**
   * Simulation steps per rendered frame. 1 in normal use; automated tests raise it to
   * fast-forward game time on slow software renderers (`?sim=N`).
   */
  substeps = 1;
  private last = 0;
  private handle = 0;
  private running = false;

  constructor(
    private readonly tick: (
      dt: number,
      elapsed: number,
      frameTime: number,
      render: boolean,
    ) => void,
  ) {}

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
      this.frame++;
      for (let i = 0; i < this.substeps; i++) {
        this.elapsed += dt;
        this.tick(dt, this.elapsed, frameTime, i === this.substeps - 1);
      }
    };
    this.handle = requestAnimationFrame(step);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
