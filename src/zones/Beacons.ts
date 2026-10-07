import {
  CanvasTexture,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Scene,
  type Vector3,
} from 'three';
import { sj_SECTIONS, type SectionId } from '../content/sections';
import type { Progress } from './Progress';
import type { Zones } from './Zones';
import { sj_BRUSH_FONT } from '../world/architecture/textures';
import { smoothstep } from '../utils/math';
import { roundRectPath } from '../utils/canvas';

function beaconTexture(sj_glyph: string): CanvasTexture {
  const sj_s = 256;
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_c.height = sj_s;
  const sj_ctx = sj_c.getContext('2d')!;
  const sj_glow = sj_ctx.createRadialGradient(
    sj_s / 2,
    sj_s / 2,
    sj_s * 0.2,
    sj_s / 2,
    sj_s / 2,
    sj_s / 2,
  );
  sj_glow.addColorStop(0, 'rgba(255, 214, 140, 0.9)');
  sj_glow.addColorStop(0.55, 'rgba(255, 190, 110, 0.35)');
  sj_glow.addColorStop(1, 'rgba(255, 190, 110, 0)');
  sj_ctx.fillStyle = sj_glow;
  sj_ctx.fillRect(0, 0, sj_s, sj_s);
  sj_ctx.fillStyle = '#b8352b';
  sj_ctx.beginPath();
  roundRectPath(sj_ctx, sj_s * 0.28, sj_s * 0.28, sj_s * 0.44, sj_s * 0.44, 18);
  sj_ctx.fill();
  sj_ctx.strokeStyle = 'rgba(251, 238, 224, 0.85)';
  sj_ctx.lineWidth = 6;
  sj_ctx.stroke();
  sj_ctx.fillStyle = '#fbeee0';
  sj_ctx.font = `${Math.round(sj_s * 0.3)}px ${sj_BRUSH_FONT}`;
  sj_ctx.textAlign = 'center';
  sj_ctx.textBaseline = 'middle';
  sj_ctx.fillText(sj_glyph, sj_s / 2, sj_s / 2 + 4);
  const sj_t = new CanvasTexture(sj_c);
  sj_t.colorSpace = SRGBColorSpace;
  sj_t.needsUpdate = true;
  return sj_t;
}

interface Beacon {
  id: SectionId;
  sprite: Sprite;
  material: SpriteMaterial;
  baseY: number;
}

/**
 * Floating red seals over the landmark of every scroll not found yet. They are visible
 * from far away so visitors always know where to head next, and vanish once found.
 */
export class Beacons {
  private beacons: Beacon[] = [];

  constructor(
    sj_scene: Scene,
    sj_zones: Zones,
    private readonly progress: Progress,
  ) {
    for (const sj_s of sj_SECTIONS) {
      const sj_spot = sj_zones.primary(sj_s.id);
      if (!sj_spot) continue;
      const sj_material = new SpriteMaterial({
        map: beaconTexture(sj_s.glyph),
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      const sj_sprite = new Sprite(sj_material);
      const sj_lift: Record<SectionId, number> = {
        welcome: 7.2,
        about: 3.4,
        skills: 3.6,
        journey: 3.2,
        projects: 7.5,
        contact: 5.8,
      };
      sj_sprite.position.set(sj_spot.x, sj_spot.y + sj_lift[sj_s.id], sj_spot.z);
      sj_sprite.scale.setScalar(1.6);
      sj_sprite.renderOrder = 9;
      sj_sprite.name = `beacon:${sj_s.id}`;
      sj_scene.add(sj_sprite);
      this.beacons.push({
        id: sj_s.id,
        sprite: sj_sprite,
        material: sj_material,
        baseY: sj_spot.y + sj_lift[sj_s.id],
      });
    }
  }

  update(sj_time: number, sj_player: Vector3, sj_hidden = false): void {
    for (const sj_b of this.beacons) {
      const sj_found = this.progress.has(sj_b.id);
      const sj_d = Math.hypot(
        sj_b.sprite.position.x - sj_player.x,
        sj_b.sprite.position.z - sj_player.z,
      );
      // Fade out when found, when very close (the prompt takes over), very far away and
      // during the tour.
      const sj_target =
        sj_found || sj_hidden ? 0 : smoothstep(3, 7, sj_d) * (1 - smoothstep(110, 150, sj_d));
      sj_b.material.opacity += (sj_target - sj_b.material.opacity) * 0.08;
      sj_b.sprite.visible = sj_b.material.opacity > 0.01;
      sj_b.sprite.position.y = sj_b.baseY + Math.sin(sj_time * 1.6 + sj_b.baseY) * 0.25;
      // Keep a readable size on screen: grow a little with distance.
      sj_b.sprite.scale.setScalar(1.3 + Math.min(sj_d, 90) * 0.035);
    }
  }
}
