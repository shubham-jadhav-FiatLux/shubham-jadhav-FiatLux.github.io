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
    root: HTMLElement,
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
    root.appendChild(this.el);
    this.base = this.el.querySelector('.touch__base')!;
    this.knob = this.el.querySelector('.touch__knob')!;
    const zone = this.el.querySelector('.touch__zone') as HTMLElement;
    zone.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (e.pointerType !== 'mouse') this.input.usingTouch = true;
        b.classList.add('touch__btn--down');
        input.press(b.dataset.action as 'jump' | 'strike' | 'interact');
      });
      const up = () => b.classList.remove('touch__btn--down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
    });
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse) this.show();
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
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.el.classList.toggle('touch--hidden', !on);
    if (!on) this.reset();
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointer !== null) return;
    this.pointer = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.base.classList.add('touch__base--active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const max = 52;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    const mag = Math.min(1, len / max);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    this.input.setTouchMove(nx * mag, -ny * mag, mag > 0.92);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    this.reset();
  };

  private reset(): void {
    this.pointer = null;
    this.base.classList.remove('touch__base--active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.input.setTouchMove(0, 0, false);
  }
}
