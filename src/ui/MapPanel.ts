import { Emitter } from '../core/Emitter';
import { sj_SECTIONS, type SectionId } from '../content/sections';
import type { Progress } from '../zones/Progress';
import type { Terrain } from '../world/Terrain';
import { releaseFocus, trapFocus } from './focus';
import { sj_ICONS } from './icons';
import { esc } from './render';
import { whenIdle } from '../utils/idle';
import { sj_BRUSH_FONT } from '../world/architecture/textures';
import { sj_riverCourse } from '../world/heightfield';
import { sj_BRIDGE_POINTS, sj_FALLS } from '../world/layout';

const sj_EXTENT = 92; // map covers [-EXTENT, EXTENT] in x and z

export interface MapMarker {
  section: SectionId;
  x: number;
  z: number;
}

function toMap(sj_v: number): number {
  return ((sj_v + sj_EXTENT) / (sj_EXTENT * 2)) * 100;
}

/** Paints the valley as an ink-wash map on rice paper. */
function paintMap(
  sj_terrain: Terrain,
  sj_trees: { x: number; z: number; r: number }[],
  sj_buildings: MapBuilding[],
): HTMLCanvasElement {
  const sj_size = 512;
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_c.height = sj_size;
  const sj_ctx = sj_c.getContext('2d')!;
  const sj_img = sj_ctx.createImageData(sj_size, sj_size);
  const sj_n = { x: 0, y: 1, z: 0 };
  const sj_mix = (sj_a: number, sj_b: number, sj_t: number) => sj_a + (sj_b - sj_a) * sj_t;
  for (let sj_j = 0; sj_j < sj_size; sj_j++) {
    for (let sj_i = 0; sj_i < sj_size; sj_i++) {
      const sj_x = -sj_EXTENT + ((sj_i + 0.5) / sj_size) * sj_EXTENT * 2;
      const sj_z = -sj_EXTENT + ((sj_j + 0.5) / sj_size) * sj_EXTENT * 2;
      const sj_h = sj_terrain.heightAt(sj_x, sj_z);
      sj_terrain.normalAt(sj_x, sj_z, sj_n);
      let sj_r: number;
      let sj_g: number;
      let sj_b: number;
      if (sj_h < 0) {
        const sj_d = Math.min(1, -sj_h / 3);
        sj_r = sj_mix(150, 64, sj_d);
        sj_g = sj_mix(205, 138, sj_d);
        sj_b = sj_mix(186, 138, sj_d);
        // painted ripple strokes
        const sj_ripple = Math.sin(sj_x * 1.1 + sj_z * 0.35) * Math.sin(sj_z * 0.9 - sj_x * 0.2);
        if (sj_ripple > 0.93) {
          sj_r += 30;
          sj_g += 25;
          sj_b += 20;
        }
      } else {
        // meadow green, washing to ink on the hills
        sj_r = 176;
        sj_g = 196;
        sj_b = 128;
        const sj_ink = Math.min(1, Math.max(0, (sj_h - 3.5) / 30));
        sj_r = sj_mix(sj_r, 72, sj_ink * 0.8);
        sj_g = sj_mix(sj_g, 92, sj_ink * 0.8);
        sj_b = sj_mix(sj_b, 80, sj_ink * 0.8);
        const sj_m = sj_terrain.mask.sample(sj_x, sj_z);
        if (sj_m.stone > 0.45) {
          sj_r = 218;
          sj_g = 208;
          sj_b = 188;
        } else if (sj_m.dirt > 0.5) {
          sj_r = 186;
          sj_g = 140;
          sj_b = 96;
        }
        if (sj_h < 0.4) {
          sj_r = sj_mix(sj_r, 214, 0.45);
          sj_g = sj_mix(sj_g, 196, 0.45);
          sj_b = sj_mix(sj_b, 150, 0.45);
        }
        const sj_shade = 1 + (-sj_n.x * 0.6 - sj_n.z * 0.4) * 1.1;
        sj_r *= sj_shade;
        sj_g *= sj_shade;
        sj_b *= sj_shade;
      }
      const sj_o = (sj_j * sj_size + sj_i) * 4;
      sj_img.data[sj_o] = sj_r;
      sj_img.data[sj_o + 1] = sj_g;
      sj_img.data[sj_o + 2] = sj_b;
      sj_img.data[sj_o + 3] = 255;
    }
  }
  sj_ctx.putImageData(sj_img, 0, 0);
  const sj_px = (sj_v: number) => ((sj_v + sj_EXTENT) / (sj_EXTENT * 2)) * sj_size;
  const sj_pm = (sj_m: number) => (sj_m / (sj_EXTENT * 2)) * sj_size;
  // the stream across the plateau, its spring and the white water of the falls
  const sj_course = sj_riverCourse.points;
  const sj_spring = sj_course[0]!;
  sj_ctx.lineCap = 'round';
  sj_ctx.lineJoin = 'round';
  for (const [sj_width, sj_color] of [
    [3.4, 'rgba(58, 104, 98, 0.55)'],
    [2.4, 'rgb(128, 190, 176)'],
  ] as const) {
    sj_ctx.strokeStyle = sj_ctx.fillStyle = sj_color;
    sj_ctx.lineWidth = sj_pm(sj_width);
    sj_ctx.beginPath();
    sj_course.forEach((sj_p, sj_i) =>
      sj_i
        ? sj_ctx.lineTo(sj_px(sj_p.x), sj_px(sj_p.z))
        : sj_ctx.moveTo(sj_px(sj_p.x), sj_px(sj_p.z)),
    );
    sj_ctx.stroke();
    sj_ctx.beginPath();
    sj_ctx.arc(sj_px(sj_spring.x), sj_px(sj_spring.z), sj_pm(2.6 + sj_width * 0.3), 0, Math.PI * 2);
    sj_ctx.fill();
  }
  sj_ctx.strokeStyle = 'rgba(248, 246, 236, 0.9)';
  sj_ctx.lineWidth = sj_pm(2.2);
  sj_ctx.beginPath();
  sj_ctx.moveTo(sj_px(sj_FALLS.lip.x), sj_px(sj_FALLS.lip.z));
  sj_ctx.lineTo(sj_px(sj_FALLS.foot.x), sj_px(sj_FALLS.foot.z));
  sj_ctx.stroke();
  // the zig-zag bridge, in lacquer red
  for (const [sj_width, sj_color] of [
    [3.0, 'rgba(40, 24, 20, 0.6)'],
    [2.0, '#b0463a'],
  ] as const) {
    sj_ctx.strokeStyle = sj_color;
    sj_ctx.lineWidth = sj_pm(sj_width);
    sj_ctx.lineJoin = 'miter';
    sj_ctx.lineCap = 'butt';
    sj_ctx.beginPath();
    sj_BRIDGE_POINTS.forEach(([sj_x, sj_z], sj_i) =>
      sj_i ? sj_ctx.lineTo(sj_px(sj_x), sj_px(sj_z)) : sj_ctx.moveTo(sj_px(sj_x), sj_px(sj_z)),
    );
    sj_ctx.stroke();
  }
  // trees as ink puffs
  for (const sj_t of sj_trees) {
    const sj_rr = Math.max(2.2, sj_pm(sj_t.r) * 0.62);
    sj_ctx.fillStyle = 'rgba(46, 74, 48, 0.62)';
    sj_ctx.beginPath();
    sj_ctx.arc(sj_px(sj_t.x), sj_px(sj_t.z), sj_rr, 0, Math.PI * 2);
    sj_ctx.fill();
    sj_ctx.fillStyle = 'rgba(120, 150, 90, 0.35)';
    sj_ctx.beginPath();
    sj_ctx.arc(
      sj_px(sj_t.x) - sj_rr * 0.25,
      sj_px(sj_t.z) - sj_rr * 0.25,
      sj_rr * 0.5,
      0,
      Math.PI * 2,
    );
    sj_ctx.fill();
  }
  // buildings as vermilion and slate footprints
  for (const sj_bld of sj_buildings) {
    sj_ctx.save();
    sj_ctx.translate(sj_px(sj_bld.x), sj_px(sj_bld.z));
    sj_ctx.rotate(-sj_bld.rot);
    sj_ctx.fillStyle = sj_bld.color;
    sj_ctx.strokeStyle = 'rgba(30, 26, 24, 0.7)';
    sj_ctx.lineWidth = 1.2;
    sj_ctx.beginPath();
    if (sj_bld.sides) {
      for (let sj_k = 0; sj_k < sj_bld.sides; sj_k++) {
        const sj_a = (sj_k / sj_bld.sides) * Math.PI * 2;
        sj_ctx.lineTo(Math.cos(sj_a) * sj_pm(sj_bld.w / 2), Math.sin(sj_a) * sj_pm(sj_bld.w / 2));
      }
      sj_ctx.closePath();
    } else {
      sj_ctx.rect(-sj_pm(sj_bld.w / 2), -sj_pm(sj_bld.d / 2), sj_pm(sj_bld.w), sj_pm(sj_bld.d));
    }
    sj_ctx.fill();
    sj_ctx.stroke();
    sj_ctx.restore();
  }
  // paper vignette
  const sj_v = sj_ctx.createRadialGradient(
    sj_size / 2,
    sj_size / 2,
    sj_size * 0.32,
    sj_size / 2,
    sj_size / 2,
    sj_size * 0.74,
  );
  sj_v.addColorStop(0, 'rgba(243,234,214,0)');
  sj_v.addColorStop(1, 'rgba(214,194,154,0.8)');
  sj_ctx.fillStyle = sj_v;
  sj_ctx.fillRect(0, 0, sj_size, sj_size);
  // compass
  sj_ctx.fillStyle = '#3a2f28';
  sj_ctx.font = `28px ${sj_BRUSH_FONT}`;
  sj_ctx.textAlign = 'center';
  sj_ctx.fillText('N', sj_size - 34, 44);
  sj_ctx.strokeStyle = '#3a2f28';
  sj_ctx.lineWidth = 2;
  sj_ctx.beginPath();
  sj_ctx.moveTo(sj_size - 34, 52);
  sj_ctx.lineTo(sj_size - 34, 84);
  sj_ctx.stroke();
  return sj_c;
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
  /** paints the map picture: deferred, nobody needs it until the map is first opened */
  private paint: (() => void) | null;

  constructor(
    sj_root: HTMLElement,
    sj_terrain: Terrain,
    sj_trees: { x: number; z: number; r: number }[],
    sj_buildings: MapBuilding[],
    sj_markers: MapMarker[],
    private readonly progress: Progress,
    sj_title: string,
  ) {
    super();
    this.el = document.createElement('div');
    this.el.className = 'overlay map-overlay';
    this.el.innerHTML = `
      <div class="map" role="dialog" aria-modal="true" aria-labelledby="map-title">
        <header class="map__head">
          <h2 id="map-title" class="map__title">${esc(sj_title)}</h2>
          <button type="button" class="icon-btn" aria-label="Close map (Esc)">${sj_ICONS.close}</button>
        </header>
        <div class="map__canvas">
          <div class="map__panda" aria-hidden="true"></div>
        </div>
        <p class="map__hint">Choose a seal to travel there. Faded seals are scrolls you have not found yet.</p>
      </div>`;
    sj_root.appendChild(this.el);
    const sj_canvasWrap = this.el.querySelector('.map__canvas')! as HTMLElement;
    this.paint = () => {
      this.paint = null;
      const sj_canvas = paintMap(sj_terrain, sj_trees, sj_buildings);
      sj_canvas.className = 'map__image';
      sj_canvas.setAttribute('role', 'img');
      sj_canvas.setAttribute('aria-label', 'Painted map of the valley');
      sj_canvasWrap.prepend(sj_canvas);
    };
    // Painting takes a while: do it in a quiet moment after the valley has opened.
    whenIdle(() => this.paint?.(), 6000);
    this.panda = this.el.querySelector('.map__panda')!;
    for (const sj_m of sj_markers) {
      const sj_meta = sj_SECTIONS.find((sj_s) => sj_s.id === sj_m.section)!;
      const sj_b = document.createElement('button');
      sj_b.type = 'button';
      sj_b.className = 'map__marker';
      sj_b.style.left = `${toMap(sj_m.x)}%`;
      sj_b.style.top = `${toMap(sj_m.z)}%`;
      sj_b.innerHTML = `<span class="seal">${sj_meta.glyph}</span><span class="map__label">${esc(sj_meta.landmark)}</span>`;
      sj_b.addEventListener('click', () => this.emit('travel', sj_m.section));
      sj_canvasWrap.appendChild(sj_b);
      this.markers.set(sj_m.section, sj_b);
    }
    this.el.querySelector('.map__head .icon-btn')!.addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (sj_e) => {
      if (sj_e.target === this.el) this.close();
    });
    trapFocus(this.el, () => this.isOpen);
  }

  open(): void {
    this.paint?.();
    for (const [sj_id, sj_b] of this.markers) {
      const sj_found = this.progress.has(sj_id);
      sj_b.classList.toggle('map__marker--found', sj_found);
      const sj_meta = sj_SECTIONS.find((sj_s) => sj_s.id === sj_id)!;
      sj_b.setAttribute(
        'aria-label',
        `${sj_meta.landmark} (${sj_meta.label})${sj_found ? '' : ', not found yet'}. Travel there`,
      );
    }
    this.isOpen = true;
    this.el.classList.add('overlay--open');
    window.setTimeout(() => {
      if (this.isOpen) (this.el.querySelector('.map__head .icon-btn') as HTMLElement)?.focus();
    }, 50);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('overlay--open');
    releaseFocus(this.el);
    this.emit('close', undefined);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  update(sj_x: number, sj_z: number, sj_yaw: number): void {
    if (!this.isOpen) return;
    this.panda.style.left = `${toMap(sj_x)}%`;
    this.panda.style.top = `${toMap(sj_z)}%`;
    this.panda.style.transform = `translate(-50%, -50%) rotate(${-sj_yaw + Math.PI}rad)`;
  }
}
