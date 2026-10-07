import { Emitter } from '../core/Emitter';
import { clamp, clamp01, damp, lerp, wrapAngle, sj_TAU } from '../utils/math';
import type { Panda } from './Panda';
import type { PlayerController } from './PlayerController';
import { sj_PLAYER } from './PlayerController';

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

const sj_ACTION_DURATION: Record<Action, number> = { strike: 0.62, bow: 1.5, wave: 1.9 };

/** 0 → 1 → 0 bump between a and b. */
function bump(sj_s: number, sj_a: number, sj_b: number): number {
  const sj_t = clamp01((sj_s - sj_a) / (sj_b - sj_a));
  return Math.sin(Math.PI * sj_t);
}

function smooth01(sj_s: number, sj_a: number, sj_b: number): number {
  const sj_t = clamp01((sj_s - sj_a) / (sj_b - sj_a));
  return sj_t * sj_t * (3 - 2 * sj_t);
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

  play(sj_action: Action): boolean {
    if (this.action === 'strike' && sj_action === 'strike') return false;
    this.action = sj_action;
    this.actionT = 0;
    this.actionEvents.clear();
    return true;
  }

  /** Called by the controller events. */
  land(sj_impact: number): void {
    this.landVel -= clamp(sj_impact / 40, 0.05, 0.5) * 6;
  }

  private fire(sj_name: keyof AnimatorEvents & string, sj_at: number, sj_s: number): void {
    if (sj_s >= sj_at && !this.actionEvents.has(sj_name)) {
      this.actionEvents.add(sj_name);
      this.emit(sj_name, undefined as never);
    }
  }

  update(sj_dt: number, sj_idleSeconds: number): void {
    const sj_c = this.controller;
    const sj_p = this.panda;
    this.time += sj_dt;
    const sj_t = this.time;

    // --- state weights ---
    const sj_speed = sj_c.speed;
    const sj_walkBlend = clamp01(sj_speed / sj_PLAYER.walkSpeed);
    const sj_runBlend = clamp01(
      (sj_speed - sj_PLAYER.walkSpeed) / (sj_PLAYER.runSpeed - sj_PLAYER.walkSpeed),
    );
    this.airW = damp(this.airW, !sj_c.grounded && !sj_c.swimming ? 1 : 0, 14, sj_dt);
    this.swimW = damp(this.swimW, sj_c.swimming ? 1 : 0, 6, sj_dt);
    const sj_wantsMeditate =
      sj_idleSeconds > 12 &&
      sj_c.grounded &&
      !sj_c.swimming &&
      sj_speed < 0.1 &&
      this.action === null;
    if (sj_wantsMeditate && !this.meditating) this.emit('meditateStart', undefined);
    this.meditating = sj_wantsMeditate;
    this.medW = damp(this.medW, this.meditating ? 1 : 0, this.meditating ? 1.6 : 7, sj_dt);

    // --- locomotion phase (distance driven, so feet do not slide) ---
    const sj_cycleLength = lerp(1.05, 1.9, sj_runBlend);
    const sj_prevSin = Math.sin(this.phase);
    if (sj_c.grounded && !sj_c.swimming)
      this.phase += ((sj_speed * sj_dt) / sj_cycleLength) * sj_TAU;
    const sj_curSin = Math.sin(this.phase);
    if (sj_walkBlend > 0.25 && sj_c.grounded && !sj_c.swimming) {
      const sj_sign = Math.sign(sj_curSin);
      if (sj_sign !== 0 && sj_sign !== Math.sign(sj_prevSin) && sj_sign !== this.lastStepSign) {
        this.lastStepSign = sj_sign;
        this.emit('step', { side: sj_sign > 0 ? 'left' : 'right', run: sj_runBlend > 0.4 });
      }
    }
    this.swimPhase += sj_dt * (2.2 + sj_speed * 1.4);
    if (this.swimW > 0.5 && Math.floor(this.swimPhase / Math.PI) !== this.lastPaddle) {
      this.lastPaddle = Math.floor(this.swimPhase / Math.PI);
      if (sj_speed > 0.3) this.emit('paddle', undefined);
    }

    const sj_ph = this.phase;
    const sj_s1 = Math.sin(sj_ph);
    const sj_walk = sj_walkBlend * (1 - this.swimW);

    // --- base pose: idle + walk/run ---
    const sj_breathe = Math.sin(sj_t * 2.1);
    let sj_rootY = (Math.abs(Math.cos(sj_ph)) - 0.64) * lerp(0.05, 0.09, sj_runBlend) * sj_walk;
    let sj_lean = (0.05 + 0.16 * sj_runBlend) * sj_walk;
    let sj_roll = sj_s1 * lerp(0.09, 0.045, sj_runBlend) * sj_walk;
    let sj_twist = sj_s1 * 0.1 * sj_walk;
    let sj_squash = 1 + sj_breathe * 0.012 * (1 - sj_walk);
    const sj_legAmp = lerp(0.6, 1.0, sj_runBlend) * sj_walk;
    const sj_armAmp = lerp(0.45, 1.05, sj_runBlend) * sj_walk;
    let sj_legLX = -sj_s1 * sj_legAmp;
    let sj_legRX = sj_s1 * sj_legAmp;
    let sj_legLZ = 0;
    let sj_legRZ = 0;
    let sj_armLX = sj_s1 * sj_armAmp - 0.05;
    let sj_armRX = -sj_s1 * sj_armAmp - 0.05;
    let sj_armLZ = 0.22 + sj_runBlend * 0.25 + sj_breathe * 0.02 * (1 - sj_walk);
    let sj_armRZ = -sj_armLZ;
    let sj_headX = -sj_lean * 0.45 + Math.sin(sj_t * 0.9) * 0.025 * (1 - sj_walk);
    let sj_headZ = -sj_roll * 0.65;
    let sj_eyeOpen = 1;

    // turning: lean into the curve
    sj_roll += clamp(-sj_c.turnRate * sj_speed * 0.012, -0.28, 0.28);

    // --- airborne ---
    if (this.airW > 0.001) {
      const sj_vy = sj_c.velocity.y;
      const sj_w = this.airW;
      const sj_stretch = clamp(1 + sj_vy * 0.014, 0.9, 1.12);
      sj_squash = lerp(sj_squash, sj_stretch, sj_w);
      sj_legLX = lerp(sj_legLX, -0.55 + Math.sin(sj_t * 14) * 0.05, sj_w);
      sj_legRX = lerp(sj_legRX, -0.35 - Math.sin(sj_t * 14) * 0.05, sj_w);
      sj_armLZ = lerp(sj_armLZ, 1.15 + (sj_vy > 0 ? 0.2 : -0.2), sj_w);
      sj_armRZ = lerp(sj_armRZ, -1.15 - (sj_vy > 0 ? 0.2 : -0.2), sj_w);
      sj_armLX = lerp(sj_armLX, -0.35, sj_w);
      sj_armRX = lerp(sj_armRX, -0.35, sj_w);
      sj_lean = lerp(sj_lean, -0.08 + (sj_vy < 0 ? 0.12 : 0), sj_w);
      sj_headX = lerp(sj_headX, sj_vy > 0 ? -0.15 : 0.08, sj_w);
    }

    // --- swimming (doggy paddle) ---
    if (this.swimW > 0.001) {
      const sj_w = this.swimW;
      const sj_sp = this.swimPhase;
      sj_lean = lerp(sj_lean, 0.55, sj_w);
      sj_rootY = lerp(sj_rootY, 0.1 + Math.sin(sj_sp * 2) * 0.03, sj_w);
      sj_roll = lerp(sj_roll, Math.sin(sj_sp) * 0.08, sj_w);
      sj_armLX = lerp(sj_armLX, -1.0 + Math.sin(sj_sp) * 0.9, sj_w);
      sj_armRX = lerp(sj_armRX, -1.0 + Math.sin(sj_sp + Math.PI) * 0.9, sj_w);
      sj_armLZ = lerp(sj_armLZ, 0.35, sj_w);
      sj_armRZ = lerp(sj_armRZ, -0.35, sj_w);
      sj_legLX = lerp(sj_legLX, 0.5 + Math.sin(sj_sp * 2) * 0.45, sj_w);
      sj_legRX = lerp(sj_legRX, 0.5 - Math.sin(sj_sp * 2) * 0.45, sj_w);
      sj_headX = lerp(sj_headX, -0.55, sj_w);
    }

    // --- landing squash (damped spring) ---
    this.landVel += (-this.landSquash * 180 - this.landVel * 14) * sj_dt;
    this.landSquash += this.landVel * sj_dt;
    sj_squash *= 1 + this.landSquash;

    // --- meditation ---
    if (this.medW > 0.001) {
      const sj_w = this.medW;
      const sj_slow = Math.sin(sj_t * 1.25);
      sj_rootY = lerp(sj_rootY, -0.27 + sj_slow * 0.008, sj_w);
      sj_lean = lerp(sj_lean, 0.02, sj_w);
      sj_roll = lerp(sj_roll, 0, sj_w);
      sj_twist = lerp(sj_twist, 0, sj_w);
      sj_legLX = lerp(sj_legLX, -1.45, sj_w);
      sj_legRX = lerp(sj_legRX, -1.45, sj_w);
      sj_legLZ = lerp(sj_legLZ, 0.62, sj_w);
      sj_legRZ = lerp(sj_legRZ, -0.62, sj_w);
      sj_armLX = lerp(sj_armLX, -0.8, sj_w);
      sj_armRX = lerp(sj_armRX, -0.8, sj_w);
      sj_armLZ = lerp(sj_armLZ, -0.05, sj_w);
      sj_armRZ = lerp(sj_armRZ, 0.05, sj_w);
      sj_headX = lerp(sj_headX, 0.14 + sj_slow * 0.01, sj_w);
      sj_squash = lerp(sj_squash, 1 + sj_slow * 0.018, sj_w);
      sj_eyeOpen = lerp(sj_eyeOpen, 0.08, sj_w);
    }

    // --- one-shot actions ---
    let sj_spin = 0;
    if (this.action) {
      this.actionT += sj_dt;
      const sj_dur = sj_ACTION_DURATION[this.action];
      const sj_s = this.actionT / sj_dur;
      if (this.action === 'strike') {
        this.fire('strikeWhoosh', 0.12, sj_s);
        this.fire('strikeImpact', 0.36, sj_s);
        const sj_k = bump(sj_s, 0.08, 0.95);
        sj_spin = smooth01(sj_s, 0.12, 0.74) * sj_TAU;
        sj_rootY += bump(sj_s, 0.1, 0.85) * 0.3;
        sj_legRZ = lerp(sj_legRZ, -1.25, bump(sj_s, 0.15, 0.78));
        sj_legRX = lerp(sj_legRX, -0.25, sj_k);
        sj_legLX = lerp(sj_legLX, 0.15, sj_k);
        sj_armLZ = lerp(sj_armLZ, 1.45, sj_k);
        sj_armRZ = lerp(sj_armRZ, -1.45, sj_k);
        sj_armLX = lerp(sj_armLX, -0.2, sj_k);
        sj_armRX = lerp(sj_armRX, -0.2, sj_k);
        sj_lean = lerp(sj_lean, -0.06, sj_k);
        sj_squash *= 1 - bump(sj_s, 0, 0.12) * 0.1 + bump(sj_s, 0.12, 0.4) * 0.06;
      } else if (this.action === 'bow') {
        const sj_hands = smooth01(sj_s, 0, 0.18) * (1 - smooth01(sj_s, 0.82, 1));
        sj_armLX = lerp(sj_armLX, -1.3, sj_hands);
        sj_armRX = lerp(sj_armRX, -1.3, sj_hands);
        sj_armLZ = lerp(sj_armLZ, -0.62, sj_hands);
        sj_armRZ = lerp(sj_armRZ, 0.62, sj_hands);
        const sj_b = bump(sj_s, 0.22, 0.8);
        sj_lean = lerp(sj_lean, 0.42, sj_b);
        sj_headX = lerp(sj_headX, 0.28, sj_b);
        sj_eyeOpen = lerp(sj_eyeOpen, 0.15, bump(sj_s, 0.3, 0.72));
        this.fire('bowPeak', 0.5, sj_s);
      } else if (this.action === 'wave') {
        const sj_up = smooth01(sj_s, 0, 0.15) * (1 - smooth01(sj_s, 0.85, 1));
        sj_armRZ = lerp(sj_armRZ, -2.55 + Math.sin(this.actionT * 13) * 0.32, sj_up);
        sj_armRX = lerp(sj_armRX, -0.25, sj_up);
        sj_headZ = lerp(sj_headZ, 0.16, sj_up);
        sj_headX = lerp(sj_headX, -0.08, sj_up);
      }
      if (sj_s >= 1) {
        if (this.action === 'strike') this.emit('strikeEnd', undefined);
        this.action = null;
      }
    }

    // --- head look-at (landmarks) with idle glances ---
    let sj_yawTarget = 0;
    let sj_pitchTarget = 0;
    if (this.lookTarget && this.medW < 0.5) {
      const sj_dx = this.lookTarget.x - sj_c.position.x;
      const sj_dz = this.lookTarget.z - sj_c.position.z;
      const sj_dy = this.lookTarget.y - (sj_c.position.y + 1.1);
      const sj_rel = wrapAngle(Math.atan2(sj_dx, sj_dz) - sj_c.yaw);
      sj_yawTarget = clamp(sj_rel, -0.95, 0.95) * (1 - sj_runBlend * 0.6);
      sj_pitchTarget = clamp(-Math.atan2(sj_dy, Math.hypot(sj_dx, sj_dz)), -0.35, 0.3);
    } else if (sj_walk < 0.2 && this.medW < 0.5) {
      this.idleLook += sj_dt;
      sj_yawTarget = Math.sin(this.idleLook * 0.37) * 0.45 * Math.sin(this.idleLook * 0.11);
    }
    this.headYaw = damp(this.headYaw, sj_yawTarget, 4, sj_dt);
    this.headPitch = damp(this.headPitch, sj_pitchTarget, 4, sj_dt);

    // --- blinking and ear twitches ---
    this.blinkTimer -= sj_dt;
    if (this.blinkTimer <= 0) {
      this.blinkT = 0;
      this.blinkTimer = 2.2 + Math.random() * 3.5;
    }
    if (this.blinkT >= 0) {
      this.blinkT += sj_dt;
      const sj_b = bump(this.blinkT, 0, 0.16);
      sj_eyeOpen = Math.min(sj_eyeOpen, 1 - sj_b * 0.92);
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    this.earTimer -= sj_dt;
    if (this.earTimer <= 0) {
      this.earT = 0;
      this.earSide = Math.random() < 0.5 ? 1 : -1;
      this.earTimer = 3 + Math.random() * 6;
    }
    let sj_earFlick = 0;
    if (this.earT >= 0) {
      this.earT += sj_dt;
      sj_earFlick = bump(this.earT, 0, 0.22) * 0.35;
      if (this.earT > 0.22) this.earT = -1;
    }

    // --- apply ---
    sj_p.body.position.y = sj_rootY;
    sj_p.body.rotation.set(sj_lean, sj_twist + sj_spin, sj_roll);
    const sj_sq = clamp(sj_squash, 0.7, 1.3);
    const sj_side = 1 / Math.sqrt(sj_sq);
    sj_p.body.scale.set(sj_side, sj_sq, sj_side);
    sj_p.head.rotation.set(sj_headX + this.headPitch, this.headYaw, sj_headZ);
    sj_p.armL.rotation.set(sj_armLX, 0, sj_armLZ);
    sj_p.armR.rotation.set(sj_armRX, 0, sj_armRZ);
    sj_p.legL.rotation.set(sj_legLX, 0, sj_legLZ);
    sj_p.legR.rotation.set(sj_legRX, 0, sj_legRZ);
    sj_p.eyeL.scale.y = sj_p.eyeR.scale.y = Math.max(0.06, sj_eyeOpen);
    sj_p.earL.rotation.z = -0.38 - (this.earSide > 0 ? sj_earFlick : 0);
    sj_p.earR.rotation.z = 0.38 + (this.earSide < 0 ? sj_earFlick : 0);
  }
}
