import type { Input } from '../core/Input';

/**
 * On-screen controls for phones and tablets: a floating joystick on the left half of the
 * screen and action buttons on the right. Appears on the first touch.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private pointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private visible = false;
  private enabled = true;

  constructor(
    sj_root: HTMLElement,
    private readonly input: Input,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.el.innerHTML = `
      <div class="touch__zone" aria-hidden="true">
        <div class="touch__base"><div class="touch__knob"></div></div>
      </div>
      <div class="touch__buttons">
        <button type="button" class="touch__btn touch__btn--e" data-action="interact" aria-label="Read / interact">E</button>
        <button type="button" class="touch__btn" data-action="strike" aria-label="Kung-fu strike">拳</button>
        <button type="button" class="touch__btn touch__btn--jump" data-action="jump" aria-label="Jump">⤒</button>
      </div>`;
    sj_root.appendChild(this.el);
    this.base = this.el.querySelector('.touch__base')!;
    this.knob = this.el.querySelector('.touch__knob')!;
    const sj_zone = this.el.querySelector('.touch__zone') as HTMLElement;
    sj_zone.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((sj_b) => {
      sj_b.addEventListener('pointerdown', (sj_e) => {
        sj_e.preventDefault();
        if (sj_e.pointerType !== 'mouse') this.input.usingTouch = true;
        sj_b.classList.add('touch__btn--down');
        input.press(sj_b.dataset.action as 'jump' | 'strike' | 'interact');
      });
      const sj_up = () => sj_b.classList.remove('touch__btn--down');
      sj_b.addEventListener('pointerup', sj_up);
      sj_b.addEventListener('pointerleave', sj_up);
    });
    const sj_coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (sj_coarse) this.show();
    window.addEventListener(
      'touchstart',
      () => {
        if (!this.visible) this.show();
      },
      { once: true, passive: true },
    );
  }

  show(): void {
    this.visible = true;
    this.el.classList.add('touch--visible');
  }

  /** Called every frame; only acts when the state changes. */
  setEnabled(sj_on: boolean): void {
    if (sj_on === this.enabled) return;
    this.enabled = sj_on;
    this.el.classList.toggle('touch--hidden', !sj_on);
    if (!sj_on) this.reset();
  }

  private onDown = (sj_e: PointerEvent): void => {
    if (this.pointer !== null) return;
    this.pointer = sj_e.pointerId;
    this.origin = { x: sj_e.clientX, y: sj_e.clientY };
    this.base.style.left = `${sj_e.clientX}px`;
    this.base.style.top = `${sj_e.clientY}px`;
    this.base.classList.add('touch__base--active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    sj_e.preventDefault();
  };

  private onMove = (sj_e: PointerEvent): void => {
    if (sj_e.pointerId !== this.pointer) return;
    const sj_dx = sj_e.clientX - this.origin.x;
    const sj_dy = sj_e.clientY - this.origin.y;
    const sj_max = 52;
    const sj_len = Math.hypot(sj_dx, sj_dy);
    const sj_k = sj_len > sj_max ? sj_max / sj_len : 1;
    this.knob.style.transform = `translate(calc(-50% + ${sj_dx * sj_k}px), calc(-50% + ${sj_dy * sj_k}px))`;
    const sj_mag = Math.min(1, sj_len / sj_max);
    const sj_nx = sj_len > 0 ? sj_dx / sj_len : 0;
    const sj_ny = sj_len > 0 ? sj_dy / sj_len : 0;
    this.input.setTouchMove(sj_nx * sj_mag, -sj_ny * sj_mag, sj_mag > 0.92);
  };

  private onUp = (sj_e: PointerEvent): void => {
    if (sj_e.pointerId !== this.pointer) return;
    this.reset();
  };

  private reset(): void {
    this.pointer = null;
    this.base.classList.remove('touch__base--active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.input.setTouchMove(0, 0, false);
  }
}
