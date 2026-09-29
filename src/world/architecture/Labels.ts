import { Sprite, SpriteMaterial, type Scene, type Vector3 } from 'three';
import { createLabelTexture } from './textures';
import { smoothstep } from '../../utils/math';

interface Label {
  sprite: Sprite;
  material: SpriteMaterial;
  near: number;
  far: number;
}

/**
 * Floating paper captions in the world (skill names over the dummies, milestones along
 * the bridge). They face the camera and fade in only when the panda is close.
 */
export class Labels {
  private labels: Label[] = [];

  add(
    scene: Scene,
    at: { x: number; y: number; z: number },
    title: string,
    subtitle?: string,
    options: { width?: number; near?: number; far?: number } = {},
  ): Sprite {
    const material = new SpriteMaterial({
      map: createLabelTexture(title, subtitle),
      transparent: true,
      depthWrite: false,
      opacity: 0,
      fog: false,
    });
    const sprite = new Sprite(material);
    const w = options.width ?? 2.2;
    sprite.scale.set(w, w * (192 / 512), 1);
    sprite.position.set(at.x, at.y, at.z);
    sprite.renderOrder = 8;
    sprite.name = `label:${title}`;
    scene.add(sprite);
    this.labels.push({ sprite, material, near: options.near ?? 7, far: options.far ?? 12 });
    return sprite;
  }

  update(player: Vector3): void {
    for (const l of this.labels) {
      const d = Math.hypot(l.sprite.position.x - player.x, l.sprite.position.z - player.z);
      const target = 1 - smoothstep(l.near, l.far, d);
      l.material.opacity += (target - l.material.opacity) * 0.12;
      l.sprite.visible = l.material.opacity > 0.01;
    }
  }
}
