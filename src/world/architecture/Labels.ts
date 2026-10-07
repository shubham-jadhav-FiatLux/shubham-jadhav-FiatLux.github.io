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
 * the bridge). They face the camera, fade in only when the panda is close, and fade out
 * when the camera itself comes so close that it would pass through one.
 */
export class Labels {
  private labels: Label[] = [];

  /** `textScale`: texture resolution (1 = full; less on lower quality levels) */
  constructor(private readonly textScale = 1) {}

  add(
    sj_scene: Scene,
    sj_at: { x: number; y: number; z: number },
    sj_title: string,
    sj_subtitle?: string,
    sj_options: { width?: number; near?: number; far?: number } = {},
  ): Sprite {
    const sj_material = new SpriteMaterial({
      map: createLabelTexture(sj_title, sj_subtitle, this.textScale),
      transparent: true,
      depthWrite: false,
      opacity: 0,
      fog: false,
    });
    const sj_sprite = new Sprite(sj_material);
    const sj_w = sj_options.width ?? 3.0;
    sj_sprite.scale.set(sj_w, sj_w * (192 / 512), 1);
    sj_sprite.position.set(sj_at.x, sj_at.y, sj_at.z);
    sj_sprite.renderOrder = 8;
    sj_sprite.name = `label:${sj_title}`;
    sj_scene.add(sj_sprite);
    this.labels.push({
      sprite: sj_sprite,
      material: sj_material,
      near: sj_options.near ?? 7,
      far: sj_options.far ?? 12,
    });
    return sj_sprite;
  }

  update(sj_player: Vector3, sj_camera?: Vector3): void {
    for (const sj_l of this.labels) {
      const sj_d = Math.hypot(
        sj_l.sprite.position.x - sj_player.x,
        sj_l.sprite.position.z - sj_player.z,
      );
      let sj_target = 1 - smoothstep(sj_l.near, sj_l.far, sj_d);
      if (sj_camera) {
        const sj_reach = sj_l.sprite.scale.x * 0.6;
        sj_target *= smoothstep(
          sj_reach,
          sj_reach + 3.2,
          sj_l.sprite.position.distanceTo(sj_camera),
        );
      }
      sj_l.material.opacity += (sj_target - sj_l.material.opacity) * 0.12;
      sj_l.sprite.visible = sj_l.material.opacity > 0.01;
    }
  }
}
