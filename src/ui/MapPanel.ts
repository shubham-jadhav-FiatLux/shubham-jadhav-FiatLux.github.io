import { Emitter } from '../core/Emitter';
import { SECTIONS, type SectionId } from '../content/sections';
import type { Progress } from '../zones/Progress';
import type { Terrain } from '../world/Terrain';
import { ICONS } from './icons';
import { esc } from './render';
import { BRUSH_FONT } from '../world/architecture/textures';

const EXTENT = 92; // map covers [-EXTENT, EXTENT] in x and z

export interface MapMarker {
  section: SectionId;
  x: number;
  z: number;
}

function toMap(v: number): number {
  return ((v + EXTENT) / (EXTENT * 2)) * 100;
}

/** Paints the valley as an ink-wash map on rice paper. */
function paintMap(
  terrain: Terrain,
  trees: { x: number; z: number; r: number }[],
  buildings: MapBuilding[],
): HTMLCanvasElement {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const n = { x: 0, y: 1, z: 0 };
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -EXTENT + ((i + 0.5) / size) * EXTENT * 2;
      const z = -EXTENT + ((j + 0.5) / size) * EXTENT * 2;
      const h = terrain.heightAt(x, z);
      terrain.normalAt(x, z, n);
      let r: number;
      let g: number;
      let b: number;
      if (h < 0) {
        const d = Math.min(1, -h / 3);
        r = mix(150, 64, d);
        g = mix(205, 138, d);
        b = mix(186, 138, d);
        // painted ripple strokes
        const ripple = Math.sin(x * 1.1 + z * 0.35) * Math.sin(z * 0.9 - x * 0.2);
        if (ripple > 0.93) {
          r += 30;
          g += 25;
          b += 20;
        }
      } else {
        // meadow green, washing to ink on the hills
        r = 176;
        g = 196;
        b = 128;
        const ink = Math.min(1, Math.max(0, (h - 3.5) / 30));
        r = mix(r, 72, ink * 0.8);
        g = mix(g, 92, ink * 0.8);
        b = mix(b, 80, ink * 0.8);
        const m = terrain.mask.sample(x, z);
        if (m.stone > 0.45) {
          r = 218;
          g = 208;
          b = 188;
        } else if (m.dirt > 0.5) {
          r = 186;
          g = 140;
          b = 96;
        }
        if (h < 0.4) {
          r = mix(r, 214, 0.45);
          g = mix(g, 196, 0.45);
          b = mix(b, 150, 0.45);
        }
        const shade = 1 + (-n.x * 0.6 - n.z * 0.4) * 1.1;
        r *= shade;
        g *= shade;
        b *= shade;
      }
      const o = (j * size + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const px = (v: number) => ((v + EXTENT) / (EXTENT * 2)) * size;
  const pm = (m: number) => (m / (EXTENT * 2)) * size;
  // trees as ink puffs
  for (const t of trees) {
    const rr = Math.max(2.2, pm(t.r) * 0.62);
    ctx.fillStyle = 'rgba(46, 74, 48, 0.62)';
    ctx.beginPath();
    ctx.arc(px(t.x), px(t.z), rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 150, 90, 0.35)';
    ctx.beginPath();
    ctx.arc(px(t.x) - rr * 0.25, px(t.z) - rr * 0.25, rr * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // buildings as vermilion and slate footprints
  for (const bld of buildings) {
    ctx.save();
    ctx.translate(px(bld.x), px(bld.z));
    ctx.rotate(-bld.rot);
    ctx.fillStyle = bld.color;
    ctx.strokeStyle = 'rgba(30, 26, 24, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (bld.sides) {
      for (let k = 0; k < bld.sides; k++) {
        const a = (k / bld.sides) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * pm(bld.w / 2), Math.sin(a) * pm(bld.w / 2));
      }
      ctx.closePath();
    } else {
      ctx.rect(-pm(bld.w / 2), -pm(bld.d / 2), pm(bld.w), pm(bld.d));
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // paper vignette
  const v = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.32,
    size / 2,
    size / 2,
    size * 0.74,
  );
  v.addColorStop(0, 'rgba(243,234,214,0)');
  v.addColorStop(1, 'rgba(214,194,154,0.8)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);
  // compass
  ctx.fillStyle = '#3a2f28';
  ctx.font = `28px ${BRUSH_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', size - 34, 44);
  ctx.strokeStyle = '#3a2f28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size - 34, 52);
  ctx.lineTo(size - 34, 84);
  ctx.stroke();
  return c;
}

export interface MapBuilding {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  color: string;
  /** polygon footprint (pagoda, pavilion) */
  sides?: number;
}

/**
 * Painted map of the valley with a seal on every landmark. Found landmarks can be
 * clicked for quick travel; the panda's position updates live.
 */
export class MapPanel extends Emitter<{ travel: SectionId; close: void }> {
  readonly el: HTMLElement;
  isOpen = false;
  private panda: HTMLElement;
  private markers = new Map<SectionId, HTMLButtonElement>();

  constructor(
    root: HTMLElement,
    terrain: Terrain,
    trees: { x: number; z: number; r: number }[],
    buildings: MapBuilding[],
    markers: MapMarker[],
    private readonly progress: Progress,
    title: string,
  ) {
    super();
    this.el = document.createElement('div');
    this.el.className = 'overlay map-overlay';
    this.el.innerHTML = `
      <div class="map" role="dialog" aria-modal="true" aria-labelledby="map-title">
        <header class="map__head">
          <h2 id="map-title" class="map__title">${esc(title)}</h2>
          <button type="button" class="icon-btn" aria-label="Close map (Esc)">${ICONS.close}</button>
        </header>
        <div class="map__canvas">
          <div class="map__panda" aria-hidden="true"></div>
        </div>
        <p class="map__hint">Tap a seal to travel there. Faded seals are scrolls you have not found yet.</p>
      </div>`;
    root.appendChild(this.el);
    const canvasWrap = this.el.querySelector('.map__canvas')! as HTMLElement;
    const canvas = paintMap(terrain, trees, buildings);
    canvas.className = 'map__image';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Painted map of the valley');
    canvasWrap.prepend(canvas);
    this.panda = this.el.querySelector('.map__panda')!;
    for (const m of markers) {
      const meta = SECTIONS.find((s) => s.id === m.section)!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'map__marker';
      b.style.left = `${toMap(m.x)}%`;
      b.style.top = `${toMap(m.z)}%`;
      b.innerHTML = `<span class="seal">${meta.glyph}</span><span class="map__label">${esc(meta.landmark)}</span>`;
      b.addEventListener('click', () => this.emit('travel', m.section));
      canvasWrap.appendChild(b);
      this.markers.set(m.section, b);
    }
    this.el.querySelector('.map__head .icon-btn')!.addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  open(): void {
    for (const [id, b] of this.markers) {
      const found = this.progress.has(id);
      b.classList.toggle('map__marker--found', found);
      const meta = SECTIONS.find((s) => s.id === id)!;
      b.setAttribute(
        'aria-label',
        `${meta.landmark} (${meta.label})${found ? '' : ', not found yet'}. Travel there`,
      );
    }
    this.isOpen = true;
    this.el.classList.add('overlay--open');
    window.setTimeout(
      () => (this.el.querySelector('.map__head .icon-btn') as HTMLElement)?.focus(),
      50,
    );
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('overlay--open');
    this.emit('close', undefined);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  update(x: number, z: number, yaw: number): void {
    if (!this.isOpen) return;
    this.panda.style.left = `${toMap(x)}%`;
    this.panda.style.top = `${toMap(z)}%`;
    this.panda.style.transform = `translate(-50%, -50%) rotate(${-yaw + Math.PI}rad)`;
  }
}
