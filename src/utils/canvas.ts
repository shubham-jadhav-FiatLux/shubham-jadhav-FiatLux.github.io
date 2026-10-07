/**
 * Adds a rounded rectangle to the current path. Uses the native `roundRect` where it
 * exists and falls back to arcs for older browsers (Safari before 16).
 */
export function roundRectPath(
  sj_ctx: CanvasRenderingContext2D,
  sj_x: number,
  sj_y: number,
  sj_w: number,
  sj_h: number,
  sj_r: number,
): void {
  if (typeof sj_ctx.roundRect === 'function') {
    sj_ctx.roundRect(sj_x, sj_y, sj_w, sj_h, sj_r);
    return;
  }
  const sj_rr = Math.min(sj_r, sj_w / 2, sj_h / 2);
  sj_ctx.moveTo(sj_x + sj_rr, sj_y);
  sj_ctx.arcTo(sj_x + sj_w, sj_y, sj_x + sj_w, sj_y + sj_h, sj_rr);
  sj_ctx.arcTo(sj_x + sj_w, sj_y + sj_h, sj_x, sj_y + sj_h, sj_rr);
  sj_ctx.arcTo(sj_x, sj_y + sj_h, sj_x, sj_y, sj_rr);
  sj_ctx.arcTo(sj_x, sj_y, sj_x + sj_w, sj_y, sj_rr);
  sj_ctx.closePath();
}
