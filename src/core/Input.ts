import { Vector2 } from 'three';
import { Emitter } from './Emitter';

export type Action =
  'jump' | 'strike' | 'interact' | 'map' | 'mute' | 'help' | 'escape' | 'next' | 'prev';

const sj_KEY_ACTIONS: Record<string, Action> = {
  Space: 'jump',
  KeyF: 'strike',
  KeyJ: 'strike',
  KeyE: 'interact',
  Enter: 'interact',
  NumpadEnter: 'interact',
  KeyM: 'map',
  KeyN: 'mute',
  KeyH: 'help',
  Escape: 'escape',
};

// Letter shortcuts also match the character typed, so "M" opens the map on AZERTY
// (where that key reports the code `Semicolon`) as the on-screen hints promise.
const sj_LETTER_ACTIONS: Record<string, Action> = {
  f: 'strike',
  j: 'strike',
  e: 'interact',
  m: 'map',
  n: 'mute',
  h: 'help',
};

// KeyboardEvent.code is the physical key, so WASD also works on AZERTY/Dvorak layouts.
const sj_MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const sj_GAMEPAD_BUTTONS: Record<number, Action> = {
  0: 'jump', // A / Cross
  1: 'escape', // B / Circle
  2: 'strike', // X / Square
  3: 'interact', // Y / Triangle
  4: 'prev', // LB
  8: 'map', // Back / Select
  9: 'help', // Start
};

function isTextInput(sj_el: EventTarget | null): boolean {
  return (
    sj_el instanceof HTMLInputElement ||
    sj_el instanceof HTMLTextAreaElement ||
    (sj_el instanceof HTMLElement && sj_el.isContentEditable)
  );
}

/**
 * Unifies keyboard, mouse, touch and gamepad into one per-frame state:
 * a movement vector, a run flag, camera look/zoom deltas and edge-triggered actions.
 */
export class Input extends Emitter<{ action: Action; any: void }> {
  /** x = right, y = forward; length in [0, 1] */
  readonly move = new Vector2();
  run = false;
  /** camera orbit delta for this frame, in pixels-ish units */
  readonly look = new Vector2();
  zoom = 0;
  /** when false, movement keys are ignored (e.g. while a scroll is open) */
  gameplayEnabled = true;
  /** performance.now() of the last user input, used for idle behaviour */
  lastActivity = performance.now();
  usingGamepad = false;
  /** last input came from touch (phones start out true; a key press flips it back) */
  usingTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private touchMove = new Vector2();
  private touchRun = false;
  private dragging: number | null = null;
  private lastPointer = new Vector2();
  private padPrev: boolean[] = [];
  private gamepadsBlocked = false;

  constructor(readonly surface: HTMLElement) {
    super();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    surface.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('wheel', this.onWheel, { passive: false });
    surface.addEventListener('contextmenu', (sj_e) => sj_e.preventDefault());
  }

  /** Programmatic action (touch buttons, UI). */
  press(sj_action: Action): void {
    this.pressed.add(sj_action);
    this.touch();
    this.emit('action', sj_action);
  }

  /** Returns true once if the action was triggered this frame. */
  consume(sj_action: Action): boolean {
    if (!this.pressed.has(sj_action)) return false;
    this.pressed.delete(sj_action);
    return true;
  }

  setTouchMove(sj_x: number, sj_y: number, sj_run: boolean): void {
    this.touchMove.set(sj_x, sj_y);
    this.touchRun = sj_run;
    if (sj_x !== 0 || sj_y !== 0) {
      this.usingTouch = true;
      this.touch();
    }
  }

  /** Poll gamepads and compose the movement vector. Call once per frame. */
  update(): void {
    let sj_x = 0;
    let sj_y = 0;
    let sj_run = false;
    if (this.gameplayEnabled) {
      if (sj_MOVE_KEYS.forward.some((sj_k) => this.keys.has(sj_k))) sj_y += 1;
      if (sj_MOVE_KEYS.back.some((sj_k) => this.keys.has(sj_k))) sj_y -= 1;
      if (sj_MOVE_KEYS.left.some((sj_k) => this.keys.has(sj_k))) sj_x -= 1;
      if (sj_MOVE_KEYS.right.some((sj_k) => this.keys.has(sj_k))) sj_x += 1;
      sj_run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      if (this.touchMove.lengthSq() > 0) {
        sj_x += this.touchMove.x;
        sj_y += this.touchMove.y;
        sj_run = sj_run || this.touchRun;
      }
    }
    this.pollGamepad((sj_gx, sj_gy, sj_grun) => {
      sj_x += sj_gx;
      sj_y += sj_gy;
      sj_run = sj_run || sj_grun;
    });
    this.move.set(sj_x, sj_y);
    if (this.move.lengthSq() > 1) this.move.normalize();
    this.run = sj_run;
  }

  /** Clears per-frame deltas and unconsumed actions. */
  endFrame(): void {
    this.pressed.clear();
    this.look.set(0, 0);
    this.zoom = 0;
  }

  get idleSeconds(): number {
    return (performance.now() - this.lastActivity) / 1000;
  }

  private touch(): void {
    this.lastActivity = performance.now();
    this.emit('any', undefined);
  }

  private onKeyDown = (sj_e: KeyboardEvent): void => {
    if (isTextInput(sj_e.target)) return;
    this.usingGamepad = false;
    this.usingTouch = false;
    const sj_isMove = Object.values(sj_MOVE_KEYS).some((sj_list) => sj_list.includes(sj_e.code));
    const sj_letter =
      !sj_isMove && sj_e.key.length === 1 ? sj_LETTER_ACTIONS[sj_e.key.toLowerCase()] : undefined;
    const sj_action = sj_letter ?? sj_KEY_ACTIONS[sj_e.code];
    if (this.gameplayEnabled && (sj_isMove || sj_e.code === 'Space')) sj_e.preventDefault();
    if (!sj_e.repeat && sj_action) {
      // Let focused, visible buttons handle Enter/Space themselves.
      const sj_onButton =
        (sj_e.target instanceof HTMLButtonElement || sj_e.target instanceof HTMLAnchorElement) &&
        sj_e.target.checkVisibility?.({
          visibilityProperty: true,
          checkVisibilityCSS: true,
          opacityProperty: true,
          checkOpacity: true,
        }) !== false;
      if (!(sj_onButton && (sj_e.code === 'Enter' || sj_e.code === 'Space'))) {
        this.pressed.add(sj_action);
        this.emit('action', sj_action);
      }
    }
    this.keys.add(sj_e.code);
    this.touch();
  };

  private onKeyUp = (sj_e: KeyboardEvent): void => {
    this.keys.delete(sj_e.code);
  };

  private onPointerDown = (sj_e: PointerEvent): void => {
    if (sj_e.pointerType === 'touch') this.usingTouch = true;
    if (this.dragging !== null) return;
    this.dragging = sj_e.pointerId;
    this.lastPointer.set(sj_e.clientX, sj_e.clientY);
    this.touch();
  };

  private onPointerMove = (sj_e: PointerEvent): void => {
    if (sj_e.pointerId !== this.dragging) return;
    this.look.x += sj_e.clientX - this.lastPointer.x;
    this.look.y += sj_e.clientY - this.lastPointer.y;
    this.lastPointer.set(sj_e.clientX, sj_e.clientY);
    this.touch();
  };

  private onPointerUp = (sj_e: PointerEvent): void => {
    if (sj_e.pointerId === this.dragging) this.dragging = null;
  };

  private onWheel = (sj_e: WheelEvent): void => {
    sj_e.preventDefault();
    this.zoom += Math.sign(sj_e.deltaY) * Math.min(Math.abs(sj_e.deltaY), 120);
    this.touch();
  };

  private pollGamepad(sj_apply: (sj_x: number, sj_y: number, sj_run: boolean) => void): void {
    if (this.gamepadsBlocked) return;
    let sj_pads: (Gamepad | null)[] | undefined;
    try {
      sj_pads = navigator.getGamepads?.();
    } catch {
      // Throws when a permissions policy blocks gamepads (e.g. inside an embedding iframe).
      this.gamepadsBlocked = true;
      return;
    }
    if (!sj_pads) return;
    for (const sj_pad of sj_pads) {
      if (!sj_pad || !sj_pad.connected) continue;
      const sj_dz = (sj_v: number) => (Math.abs(sj_v) < 0.16 ? 0 : sj_v);
      const sj_lx = sj_dz(sj_pad.axes[0] ?? 0);
      const sj_ly = sj_dz(sj_pad.axes[1] ?? 0);
      const sj_rx = sj_dz(sj_pad.axes[2] ?? 0);
      const sj_ry = sj_dz(sj_pad.axes[3] ?? 0);
      const sj_btn = (sj_i: number) => !!sj_pad.buttons[sj_i]?.pressed;
      const sj_active =
        sj_lx || sj_ly || sj_rx || sj_ry || sj_pad.buttons.some((sj_b) => sj_b.pressed);
      if (sj_active) {
        this.usingGamepad = true;
        this.touch();
      }
      if (this.gameplayEnabled) sj_apply(sj_lx, -sj_ly, sj_btn(5) || sj_btn(7) || sj_btn(10));
      this.look.x += sj_rx * 14;
      this.look.y += sj_ry * 10;
      if (sj_btn(6)) this.zoom += 10;
      if (sj_btn(12) && !this.padPrev[12]) this.zoom -= 120;
      if (sj_btn(13) && !this.padPrev[13]) this.zoom += 120;
      for (const [sj_index, sj_action] of Object.entries(sj_GAMEPAD_BUTTONS)) {
        const sj_i = Number(sj_index);
        if (sj_btn(sj_i) && !this.padPrev[sj_i]) {
          this.pressed.add(sj_action);
          this.emit('action', sj_action);
        }
      }
      if (sj_btn(15) && !this.padPrev[15]) this.press('next');
      if (sj_btn(14) && !this.padPrev[14]) this.press('prev');
      this.padPrev = sj_pad.buttons.map((sj_b) => sj_b.pressed);
      break; // first active pad only
    }
  }
}
