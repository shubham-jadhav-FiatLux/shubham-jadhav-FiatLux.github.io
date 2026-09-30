import {
  CanvasTexture,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Scene,
  type Vector3,
} from 'three';
import { SECTIONS, type SectionId } from '../content/sections';
import type { Progress } from './Progress';
import type { Zones } from './Zones';
import { BRUSH_FONT } from '../world/architecture/textures';
import { smoothstep } from '../utils/math';
import { roundRectPath } from '../utils/canvas';

function beaconTexture(glyph: string): CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const glow = ctx.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s / 2);
  glow.addColorStop(0, 'rgba(255, 214, 140, 0.9)');
  glow.addColorStop(0.55, 'rgba(255, 190, 110, 0.35)');
  glow.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#b8352b';
  ctx.beginPath();
  roundRectPath(ctx, s * 0.28, s * 0.28, s * 0.44, s * 0.44, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 238, 224, 0.85)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#fbeee0';
  ctx.font = `${Math.round(s * 0.3)}px ${BRUSH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, s / 2, s / 2 + 4);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
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
    scene: Scene,
    zones: Zones,
    private readonly progress: Progress,
  ) {
    for (const s of SECTIONS) {
      const spot = zones.primary(s.id);
      if (!spot) continue;
      const material = new SpriteMaterial({
        map: beaconTexture(s.glyph),
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      const sprite = new Sprite(material);
      const lift: Record<SectionId, number> = {
        welcome: 7.2,
        about: 3.4,
        skills: 3.6,
        journey: 3.2,
        projects: 7.5,
        contact: 5.8,
      };
      sprite.position.set(spot.x, spot.y + lift[s.id], spot.z);
      sprite.scale.setScalar(1.6);
      sprite.renderOrder = 9;
      sprite.name = `beacon:${s.id}`;
      scene.add(sprite);
      this.beacons.push({ id: s.id, sprite, material, baseY: spot.y + lift[s.id] });
    }
  }

  update(time: number, player: Vector3): void {
    for (const b of this.beacons) {
      const found = this.progress.has(b.id);
      const d = Math.hypot(b.sprite.position.x - player.x, b.sprite.position.z - player.z);
      // Fade out when found, when very close (the prompt takes over) and very far away.
      const target = found ? 0 : smoothstep(3, 7, d) * (1 - smoothstep(110, 150, d));
      b.material.opacity += (target - b.material.opacity) * 0.08;
      b.sprite.visible = b.material.opacity > 0.01;
      b.sprite.position.y = b.baseY + Math.sin(time * 1.6 + b.baseY) * 0.25;
      // Keep a readable size on screen: grow a little with distance.
      b.sprite.scale.setScalar(1.3 + Math.min(d, 90) * 0.035);
    }
  }
}
