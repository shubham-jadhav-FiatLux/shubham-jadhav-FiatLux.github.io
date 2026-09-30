import { Vector2 } from 'three';
import { Emitter } from './Emitter';

export type Action =
  'jump' | 'strike' | 'interact' | 'map' | 'mute' | 'help' | 'escape' | 'next' | 'prev';

const KEY_ACTIONS: Record<string, Action> = {
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
const LETTER_ACTIONS: Record<string, Action> = {
  f: 'strike',
  j: 'strike',
  e: 'interact',
  m: 'map',
  n: 'mute',
  h: 'help',
};

// KeyboardEvent.code is the physical key, so WASD also works on AZERTY/Dvorak layouts.
const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const GAMEPAD_BUTTONS: Record<number, Action> = {
  0: 'jump', // A / Cross
  1: 'escape', // B / Circle
  2: 'strike', // X / Square
  3: 'interact', // Y / Triangle
  4: 'prev', // LB
  8: 'map', // Back / Select
  9: 'help', // Start
};

function isTextInput(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
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
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Programmatic action (touch buttons, UI). */
  press(action: Action): void {
    this.pressed.add(action);
    this.touch();
    this.emit('action', action);
  }

  /** Returns true once if the action was triggered this frame. */
  consume(action: Action): boolean {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  setTouchMove(x: number, y: number, run: boolean): void {
    this.touchMove.set(x, y);
    this.touchRun = run;
    if (x !== 0 || y !== 0) {
      this.usingTouch = true;
      this.touch();
    }
  }

  /** Poll gamepads and compose the movement vector. Call once per frame. */
  update(): void {
    let x = 0;
    let y = 0;
    let run = false;
    if (this.gameplayEnabled) {
      if (MOVE_KEYS.forward.some((k) => this.keys.has(k))) y += 1;
      if (MOVE_KEYS.back.some((k) => this.keys.has(k))) y -= 1;
      if (MOVE_KEYS.left.some((k) => this.keys.has(k))) x -= 1;
      if (MOVE_KEYS.right.some((k) => this.keys.has(k))) x += 1;
      run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      if (this.touchMove.lengthSq() > 0) {
        x += this.touchMove.x;
        y += this.touchMove.y;
        run = run || this.touchRun;
      }
    }
    this.pollGamepad((gx, gy, grun) => {
      x += gx;
      y += gy;
      run = run || grun;
    });
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
    this.run = run;
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

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTextInput(e.target)) return;
    this.usingGamepad = false;
    this.usingTouch = false;
    const isMove = Object.values(MOVE_KEYS).some((list) => list.includes(e.code));
    const letter = !isMove && e.key.length === 1 ? LETTER_ACTIONS[e.key.toLowerCase()] : undefined;
    const action = letter ?? KEY_ACTIONS[e.code];
    if (this.gameplayEnabled && (isMove || e.code === 'Space')) e.preventDefault();
    if (!e.repeat && action) {
      // Let focused, visible buttons handle Enter/Space themselves.
      const onButton =
        (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) &&
        e.target.checkVisibility?.({
          visibilityProperty: true,
          checkVisibilityCSS: true,
          opacityProperty: true,
          checkOpacity: true,
        }) !== false;
      if (!(onButton && (e.code === 'Enter' || e.code === 'Space'))) {
        this.pressed.add(action);
        this.emit('action', action);
      }
    }
    this.keys.add(e.code);
    this.touch();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.usingTouch = true;
    if (this.dragging !== null) return;
    this.dragging = e.pointerId;
    this.lastPointer.set(e.clientX, e.clientY);
    this.touch();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragging) return;
    this.look.x += e.clientX - this.lastPointer.x;
    this.look.y += e.clientY - this.lastPointer.y;
    this.lastPointer.set(e.clientX, e.clientY);
    this.touch();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.dragging) this.dragging = null;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoom += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120);
    this.touch();
  };

  private pollGamepad(apply: (x: number, y: number, run: boolean) => void): void {
    if (this.gamepadsBlocked) return;
    let pads: (Gamepad | null)[] | undefined;
    try {
      pads = navigator.getGamepads?.();
    } catch {
      // Throws when a permissions policy blocks gamepads (e.g. inside an embedding iframe).
      this.gamepadsBlocked = true;
      return;
    }
    if (!pads) return;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : v);
      const lx = dz(pad.axes[0] ?? 0);
      const ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0);
      const ry = dz(pad.axes[3] ?? 0);
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const active = lx || ly || rx || ry || pad.buttons.some((b) => b.pressed);
      if (active) {
        this.usingGamepad = true;
        this.touch();
      }
      if (this.gameplayEnabled) apply(lx, -ly, btn(5) || btn(7) || btn(10));
      this.look.x += rx * 14;
      this.look.y += ry * 10;
      if (btn(6)) this.zoom += 10;
      if (btn(12) && !this.padPrev[12]) this.zoom -= 120;
      if (btn(13) && !this.padPrev[13]) this.zoom += 120;
      for (const [index, action] of Object.entries(GAMEPAD_BUTTONS)) {
        const i = Number(index);
        if (btn(i) && !this.padPrev[i]) {
          this.pressed.add(action);
          this.emit('action', action);
        }
      }
      if (btn(15) && !this.padPrev[15]) this.press('next');
      if (btn(14) && !this.padPrev[14]) this.press('prev');
      this.padPrev = pad.buttons.map((b) => b.pressed);
      break; // first active pad only
    }
  }
}
