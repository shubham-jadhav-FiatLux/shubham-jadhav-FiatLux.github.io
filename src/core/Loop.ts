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
      sj_dt: number,
      sj_elapsed: number,
      sj_frameTime: number,
      sj_render: boolean,
    ) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const sj_step = (sj_now: number) => {
      if (!this.running) return;
      this.handle = requestAnimationFrame(sj_step);
      const sj_frameTime = Math.max(0, (sj_now - this.last) / 1000);
      this.last = sj_now;
      const sj_dt = Math.min(sj_frameTime, 1 / 20);
      this.frame++;
      for (let sj_i = 0; sj_i < this.substeps; sj_i++) {
        this.elapsed += sj_dt;
        this.tick(sj_dt, this.elapsed, sj_frameTime, sj_i === this.substeps - 1);
      }
    };
    this.handle = requestAnimationFrame(sj_step);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
