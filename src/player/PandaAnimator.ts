import { Emitter } from '../core/Emitter';
import { clamp, clamp01, damp, lerp, wrapAngle, TAU } from '../utils/math';
import type { Panda } from './Panda';
import type { PlayerController } from './PlayerController';
import { PLAYER } from './PlayerController';

export type AnimatorEvents = {
  step: { side: 'left' | 'right'; run: boolean };
  paddle: void;
  strikeWhoosh: void;
  strikeImpact: void;
  strikeEnd: void;
  bowPeak: void;
  meditateStart: void;
};

type Action = 'strike' | 'bow' | 'wave';

const ACTION_DURATION: Record<Action, number> = { strike: 0.62, bow: 1.5, wave: 1.9 };

/** 0 → 1 → 0 bump between a and b. */
function bump(s: number, a: number, b: number): number {
  const t = clamp01((s - a) / (b - a));
  return Math.sin(Math.PI * t);
}

function smooth01(s: number, a: number, b: number): number {
  const t = clamp01((s - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Procedural animation for the panda. No keyframes: every pose is computed from the
 * controller state (speed, air time, water) plus one-shot actions (strike, bow, wave)
 * and idle behaviours (breathing, blinking, looking at landmarks, meditating).
 */
export class PandaAnimator extends Emitter<AnimatorEvents> {
  /** world position the head should look at, or null */
  lookTarget: { x: number; y: number; z: number } | null = null;
  meditating = false;

  private time = 0;
  private phase = 0;
  private swimPhase = 0;
  private airW = 0;
  private swimW = 0;
  private medW = 0;
  private landSquash = 0;
  private landVel = 0;
  private headYaw = 0;
  private headPitch = 0;
  private blinkTimer = 2.5;
  private blinkT = -1;
  private earTimer = 3;
  private earT = -1;
  private earSide = 1;
  private action: Action | null = null;
  private actionT = 0;
  private actionEvents = new Set<string>();
  private idleLook = 0;
  private lastStepSign = 0;
  private lastPaddle = 0;

  constructor(
    private readonly panda: Panda,
    private readonly controller: PlayerController,
  ) {
    super();
  }

  get busy(): boolean {
    return this.action !== null;
  }

  play(action: Action): boolean {
    if (this.action === 'strike' && action === 'strike') return false;
    this.action = action;
    this.actionT = 0;
    this.actionEvents.clear();
    return true;
  }

  /** Called by the controller events. */
  land(impact: number): void {
    this.landVel -= clamp(impact / 40, 0.05, 0.5) * 6;
  }

  private fire(name: keyof AnimatorEvents & string, at: number, s: number): void {
    if (s >= at && !this.actionEvents.has(name)) {
      this.actionEvents.add(name);
      this.emit(name, undefined as never);
    }
  }

  update(dt: number, idleSeconds: number): void {
    const c = this.controller;
    const p = this.panda;
    this.time += dt;
    const t = this.time;

    // --- state weights ---
    const speed = c.speed;
    const walkBlend = clamp01(speed / PLAYER.walkSpeed);
    const runBlend = clamp01((speed - PLAYER.walkSpeed) / (PLAYER.runSpeed - PLAYER.walkSpeed));
    this.airW = damp(this.airW, !c.grounded && !c.swimming ? 1 : 0, 14, dt);
    this.swimW = damp(this.swimW, c.swimming ? 1 : 0, 6, dt);
    const wantsMeditate =
      idleSeconds > 12 && c.grounded && !c.swimming && speed < 0.1 && this.action === null;
    if (wantsMeditate && !this.meditating) this.emit('meditateStart', undefined);
    this.meditating = wantsMeditate;
    this.medW = damp(this.medW, this.meditating ? 1 : 0, this.meditating ? 1.6 : 7, dt);

    // --- locomotion phase (distance driven, so feet do not slide) ---
    const cycleLength = lerp(1.05, 1.9, runBlend);
    const prevSin = Math.sin(this.phase);
    if (c.grounded && !c.swimming) this.phase += ((speed * dt) / cycleLength) * TAU;
    const curSin = Math.sin(this.phase);
    if (walkBlend > 0.25 && c.grounded && !c.swimming) {
      const sign = Math.sign(curSin);
      if (sign !== 0 && sign !== Math.sign(prevSin) && sign !== this.lastStepSign) {
        this.lastStepSign = sign;
        this.emit('step', { side: sign > 0 ? 'left' : 'right', run: runBlend > 0.4 });
      }
    }
    this.swimPhase += dt * (2.2 + speed * 1.4);
    if (this.swimW > 0.5 && Math.floor(this.swimPhase / Math.PI) !== this.lastPaddle) {
      this.lastPaddle = Math.floor(this.swimPhase / Math.PI);
      if (speed > 0.3) this.emit('paddle', undefined);
    }

    const ph = this.phase;
    const s1 = Math.sin(ph);
    const walk = walkBlend * (1 - this.swimW);

    // --- base pose: idle + walk/run ---
    const breathe = Math.sin(t * 2.1);
    let rootY = (Math.abs(Math.cos(ph)) - 0.64) * lerp(0.05, 0.09, runBlend) * walk;
    let lean = (0.05 + 0.16 * runBlend) * walk;
    let roll = s1 * lerp(0.09, 0.045, runBlend) * walk;
    let twist = s1 * 0.1 * walk;
    let squash = 1 + breathe * 0.012 * (1 - walk);
    const legAmp = lerp(0.6, 1.0, runBlend) * walk;
    const armAmp = lerp(0.45, 1.05, runBlend) * walk;
    let legLX = -s1 * legAmp;
    let legRX = s1 * legAmp;
    let legLZ = 0;
    let legRZ = 0;
    let armLX = s1 * armAmp - 0.05;
    let armRX = -s1 * armAmp - 0.05;
    let armLZ = 0.22 + runBlend * 0.25 + breathe * 0.02 * (1 - walk);
    let armRZ = -armLZ;
    let headX = -lean * 0.45 + Math.sin(t * 0.9) * 0.025 * (1 - walk);
    let headZ = -roll * 0.65;
    let eyeOpen = 1;

    // turning: lean into the curve
    roll += clamp(-c.turnRate * speed * 0.012, -0.28, 0.28);

    // --- airborne ---
    if (this.airW > 0.001) {
      const vy = c.velocity.y;
      const w = this.airW;
      const stretch = clamp(1 + vy * 0.014, 0.9, 1.12);
      squash = lerp(squash, stretch, w);
      legLX = lerp(legLX, -0.55 + Math.sin(t * 14) * 0.05, w);
      legRX = lerp(legRX, -0.35 - Math.sin(t * 14) * 0.05, w);
      armLZ = lerp(armLZ, 1.15 + (vy > 0 ? 0.2 : -0.2), w);
      armRZ = lerp(armRZ, -1.15 - (vy > 0 ? 0.2 : -0.2), w);
      armLX = lerp(armLX, -0.35, w);
      armRX = lerp(armRX, -0.35, w);
      lean = lerp(lean, -0.08 + (vy < 0 ? 0.12 : 0), w);
      headX = lerp(headX, vy > 0 ? -0.15 : 0.08, w);
    }

    // --- swimming (doggy paddle) ---
    if (this.swimW > 0.001) {
      const w = this.swimW;
      const sp = this.swimPhase;
      lean = lerp(lean, 0.55, w);
      rootY = lerp(rootY, 0.1 + Math.sin(sp * 2) * 0.03, w);
      roll = lerp(roll, Math.sin(sp) * 0.08, w);
      armLX = lerp(armLX, -1.0 + Math.sin(sp) * 0.9, w);
      armRX = lerp(armRX, -1.0 + Math.sin(sp + Math.PI) * 0.9, w);
      armLZ = lerp(armLZ, 0.35, w);
      armRZ = lerp(armRZ, -0.35, w);
      legLX = lerp(legLX, 0.5 + Math.sin(sp * 2) * 0.45, w);
      legRX = lerp(legRX, 0.5 - Math.sin(sp * 2) * 0.45, w);
      headX = lerp(headX, -0.55, w);
    }

    // --- landing squash (damped spring) ---
    this.landVel += (-this.landSquash * 180 - this.landVel * 14) * dt;
    this.landSquash += this.landVel * dt;
    squash *= 1 + this.landSquash;

    // --- meditation ---
    if (this.medW > 0.001) {
      const w = this.medW;
      const slow = Math.sin(t * 1.25);
      rootY = lerp(rootY, -0.27 + slow * 0.008, w);
      lean = lerp(lean, 0.02, w);
      roll = lerp(roll, 0, w);
      twist = lerp(twist, 0, w);
      legLX = lerp(legLX, -1.45, w);
      legRX = lerp(legRX, -1.45, w);
      legLZ = lerp(legLZ, 0.62, w);
      legRZ = lerp(legRZ, -0.62, w);
      armLX = lerp(armLX, -0.8, w);
      armRX = lerp(armRX, -0.8, w);
      armLZ = lerp(armLZ, -0.05, w);
      armRZ = lerp(armRZ, 0.05, w);
      headX = lerp(headX, 0.14 + slow * 0.01, w);
      squash = lerp(squash, 1 + slow * 0.018, w);
      eyeOpen = lerp(eyeOpen, 0.08, w);
    }

    // --- one-shot actions ---
    let spin = 0;
    if (this.action) {
      this.actionT += dt;
      const dur = ACTION_DURATION[this.action];
      const s = this.actionT / dur;
      if (this.action === 'strike') {
        this.fire('strikeWhoosh', 0.12, s);
        this.fire('strikeImpact', 0.36, s);
        const k = bump(s, 0.08, 0.95);
        spin = smooth01(s, 0.12, 0.74) * TAU;
        rootY += bump(s, 0.1, 0.85) * 0.3;
        legRZ = lerp(legRZ, -1.25, bump(s, 0.15, 0.78));
        legRX = lerp(legRX, -0.25, k);
        legLX = lerp(legLX, 0.15, k);
        armLZ = lerp(armLZ, 1.45, k);
        armRZ = lerp(armRZ, -1.45, k);
        armLX = lerp(armLX, -0.2, k);
        armRX = lerp(armRX, -0.2, k);
        lean = lerp(lean, -0.06, k);
        squash *= 1 - bump(s, 0, 0.12) * 0.1 + bump(s, 0.12, 0.4) * 0.06;
      } else if (this.action === 'bow') {
        const hands = smooth01(s, 0, 0.18) * (1 - smooth01(s, 0.82, 1));
        armLX = lerp(armLX, -1.3, hands);
        armRX = lerp(armRX, -1.3, hands);
        armLZ = lerp(armLZ, -0.62, hands);
        armRZ = lerp(armRZ, 0.62, hands);
        const b = bump(s, 0.22, 0.8);
        lean = lerp(lean, 0.42, b);
        headX = lerp(headX, 0.28, b);
        eyeOpen = lerp(eyeOpen, 0.15, bump(s, 0.3, 0.72));
        this.fire('bowPeak', 0.5, s);
      } else if (this.action === 'wave') {
        const up = smooth01(s, 0, 0.15) * (1 - smooth01(s, 0.85, 1));
        armRZ = lerp(armRZ, -2.55 + Math.sin(this.actionT * 13) * 0.32, up);
        armRX = lerp(armRX, -0.25, up);
        headZ = lerp(headZ, 0.16, up);
        headX = lerp(headX, -0.08, up);
      }
      if (s >= 1) {
        if (this.action === 'strike') this.emit('strikeEnd', undefined);
        this.action = null;
      }
    }

    // --- head look-at (landmarks) with idle glances ---
    let yawTarget = 0;
    let pitchTarget = 0;
    if (this.lookTarget && this.medW < 0.5) {
      const dx = this.lookTarget.x - c.position.x;
      const dz = this.lookTarget.z - c.position.z;
      const dy = this.lookTarget.y - (c.position.y + 1.1);
      const rel = wrapAngle(Math.atan2(dx, dz) - c.yaw);
      yawTarget = clamp(rel, -0.95, 0.95) * (1 - runBlend * 0.6);
      pitchTarget = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.35, 0.3);
    } else if (walk < 0.2 && this.medW < 0.5) {
      this.idleLook += dt;
      yawTarget = Math.sin(this.idleLook * 0.37) * 0.45 * Math.sin(this.idleLook * 0.11);
    }
    this.headYaw = damp(this.headYaw, yawTarget, 4, dt);
    this.headPitch = damp(this.headPitch, pitchTarget, 4, dt);

    // --- blinking and ear twitches ---
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkT = 0;
      this.blinkTimer = 2.2 + Math.random() * 3.5;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const b = bump(this.blinkT, 0, 0.16);
      eyeOpen = Math.min(eyeOpen, 1 - b * 0.92);
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earT = 0;
      this.earSide = Math.random() < 0.5 ? 1 : -1;
      this.earTimer = 3 + Math.random() * 6;
    }
    let earFlick = 0;
    if (this.earT >= 0) {
      this.earT += dt;
      earFlick = bump(this.earT, 0, 0.22) * 0.35;
      if (this.earT > 0.22) this.earT = -1;
    }

    // --- apply ---
    p.body.position.y = rootY;
    p.body.rotation.set(lean, twist + spin, roll);
    const sq = clamp(squash, 0.7, 1.3);
    const side = 1 / Math.sqrt(sq);
    p.body.scale.set(side, sq, side);
    p.head.rotation.set(headX + this.headPitch, this.headYaw, headZ);
    p.armL.rotation.set(armLX, 0, armLZ);
    p.armR.rotation.set(armRX, 0, armRZ);
    p.legL.rotation.set(legLX, 0, legLZ);
    p.legR.rotation.set(legRX, 0, legRZ);
    p.eyeL.scale.y = p.eyeR.scale.y = Math.max(0.06, eyeOpen);
    p.earL.rotation.z = -0.38 - (this.earSide > 0 ? earFlick : 0);
    p.earR.rotation.z = 0.38 + (this.earSide < 0 ? earFlick : 0);
  }
}
