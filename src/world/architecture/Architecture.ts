import type { Mesh, MeshStandardMaterial, Scene, Texture, Vector3 } from 'three';
import { ArchBuilder, type LightSpot } from './Builder';
import {
  buildBellTower,
  buildBridge,
  buildGate,
  buildHouse,
  buildPagoda,
  buildPavilion,
  buildSignpost,
  sj_SIGNPOST,
  buildVillageDetails,
  type BellParts,
} from './structures';
import { TrainingGround } from './Training';
import { Banners, type BannerAnchor } from './Banners';
import { Labels } from './Labels';
import { createSignpostTexture } from './textures';
import {
  sj_BELL_ROT,
  sj_BRIDGE_POINTS,
  sj_HOUSES,
  sj_PATHS,
  sj_PAVILION_ROT,
  sj_PLACES,
} from '../layout';
import type { Terrain } from '../Terrain';
import type { Placement } from '../placement';
import type { CollisionWorld } from '../../physics/CollisionWorld';
import type { PortfolioContent } from '../../content/types';
import { easeOutCubic } from '../../utils/math';
import { PierFoam } from '../water/PierFoam';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Anchors {
  gate: Point3;
  pavilionTable: Point3;
  /** the pavilion's shore-side entrance and the direction out of it */
  pavilionEntrance: { x: number; z: number; nx: number; nz: number };
  /** the signpost at the crossroads and the middle of each board, by section */
  signpost: Point3 & { boards: Record<string, Point3> };
  pagoda: Point3;
  pagodaDoor: Point3;
  bell: Point3;
  drum: Point3;
  dummies: Point3[];
  banners: BannerAnchor[];
  milestones: Point3[];
}

const sj_NUMERALS = '一二三四五六七八九十';

/**
 * Builds every structure in the valley from the layout plan and the portfolio content,
 * registers colliders, paints footprints into the terrain mask and exposes anchor points
 * for the portfolio zones. Also animates the interactive pieces (dummies, bell).
 */
export class Architecture {
  readonly anchors: Anchors;
  readonly training: TrainingGround;
  private signpost: Anchors['signpost'] = { x: 0, y: 0, z: 0, boards: {} };
  readonly banners: Banners;
  readonly bell: BellParts;
  readonly labels: Labels;
  /** every lantern and glowing altar, for halos and lights */
  readonly lights: LightSpot[];
  private meshes: Mesh[] = [];
  private bellT = -1;
  private bellSwing = 0;
  private bellSwingVel = 0;
  private onBellHit: (() => void) | null = null;
  private readonly bellRot = sj_BELL_ROT;

  constructor(
    private readonly scene: Scene,
    sj_terrain: Terrain,
    sj_col: CollisionWorld,
    sj_placement: Placement,
    sj_content: PortfolioContent,
    sj_environment: Texture | null = null,
    /** resolution of lettering textures (1 = full; less saves memory on slower devices) */
    sj_textScale = 1,
  ) {
    this.labels = new Labels(sj_textScale);
    const sj_b = new ArchBuilder();
    if (sj_environment) sj_b.setEnvironment(sj_environment);
    const sj_h = (sj_x: number, sj_z: number) => sj_terrain.heightAt(sj_x, sj_z);
    const sj_mask = sj_terrain.mask;

    // Gate at the entrance.
    const sj_gateY = sj_h(sj_PLACES.gate.x, sj_PLACES.gate.z);
    const sj_signboard = buildGate(
      sj_b,
      sj_col,
      { x: sj_PLACES.gate.x, y: sj_gateY, z: sj_PLACES.gate.z, rot: 0 },
      sj_content.site.gateGlyphs,
    );
    this.meshes.push(sj_signboard);

    // Pagoda on the hill, door facing the path from the south.
    const sj_pagodaY = sj_h(sj_PLACES.pagoda.x, sj_PLACES.pagoda.z);
    const sj_pagoda = buildPagoda(sj_b, sj_col, {
      x: sj_PLACES.pagoda.x,
      y: sj_pagodaY,
      z: sj_PLACES.pagoda.z,
      rot: 0.15,
    });
    sj_mask.circle('stone', sj_PLACES.pagoda.x, sj_PLACES.pagoda.z, 7.2);
    sj_mask.circle('nograss', sj_PLACES.pagoda.x, sj_PLACES.pagoda.z, 7.6);

    // Tea pavilion on the lake shore: one opening faces the path in, the other the lake.
    const sj_pav = buildPavilion(sj_b, sj_col, {
      x: sj_PLACES.pavilion.x,
      y: 0,
      z: sj_PLACES.pavilion.z,
      rot: sj_PAVILION_ROT,
    });

    // Village and the training hall.
    for (const sj_house of sj_HOUSES) {
      buildHouse(sj_b, sj_col, sj_house, sj_h(sj_house.x, sj_house.z));
      sj_mask.rect(
        'stone',
        sj_house.x,
        sj_house.z,
        sj_house.width / 2 + 0.6,
        sj_house.depth / 2 + 0.6,
        sj_house.rot,
        0.9,
      );
      sj_mask.rect(
        'nograss',
        sj_house.x,
        sj_house.z,
        sj_house.width / 2 + 1.2,
        sj_house.depth / 2 + 1.2,
        sj_house.rot,
      );
      sj_mask.blob(
        'shade',
        sj_house.x,
        sj_house.z,
        Math.max(sj_house.width, sj_house.depth) * 0.8,
        0.45,
      );
    }
    buildVillageDetails(sj_b, sj_col, sj_h);

    // Zig-zag bridge across the lake.
    const sj_bridge = buildBridge(sj_b, sj_col, sj_BRIDGE_POINTS, sj_h);
    const sj_foam = new PierFoam(sj_bridge.piers);
    sj_foam.addTo(scene);
    this.meshes.push(sj_foam.mesh);

    // Bell tower by the waterfall.
    const sj_bellY = sj_h(sj_PLACES.bell.x, sj_PLACES.bell.z);
    this.bell = buildBellTower(sj_b, sj_col, {
      x: sj_PLACES.bell.x,
      y: sj_bellY,
      z: sj_PLACES.bell.z,
      rot: this.bellRot,
    });
    scene.add(this.bell.bell, this.bell.striker);
    const sj_bronze = this.bell.bell.material as MeshStandardMaterial;
    sj_bronze.envMap = sj_environment;
    sj_bronze.envMapIntensity = 1.1;

    // Training grounds: one dummy per skill group.
    this.training = new TrainingGround(
      sj_b,
      sj_col,
      sj_PLACES.training,
      sj_h,
      sj_content.skills.groups.length,
    );
    this.training.addTo(scene);

    // Project banners along the path to the pagoda.
    const sj_pagodaPath = sj_PATHS.find((sj_p) => sj_p.id === 'pagoda')!.points;
    this.banners = new Banners(
      sj_b,
      sj_col,
      sj_pagodaPath,
      sj_h,
      sj_content.projects.items.slice(0, 8).map((sj_p, sj_i) => ({
        number: sj_NUMERALS[sj_i] ?? String(sj_i + 1),
        title: sj_p.bannerTitle ?? sj_p.title,
      })),
      sj_textScale,
    );
    this.banners.addTo(scene);
    for (const sj_a of this.banners.anchors) {
      sj_placement.reserve(sj_a.x, sj_a.z, 3.2);
      sj_mask.circle('nograss', sj_a.x, sj_a.z, 1.0, 0.8);
    }

    // Signpost at the crossroads.
    const sj_sp = { x: 3.4, z: 28.6 };
    const sj_dests = [
      { title: 'Skills', place: 'Training Grounds', to: sj_PLACES.training },
      { title: 'About', place: 'Tea Pavilion', to: sj_PLACES.pavilion },
      { title: 'Journey', place: 'Zig-zag Bridge', to: sj_PLACES.bridgeSouth },
      { title: 'Projects', place: 'Pagoda', to: sj_PLACES.pagoda },
      { title: 'Contact', place: 'Bell Tower', to: sj_PLACES.bell },
    ];
    const sj_signpost = buildSignpost(
      sj_b,
      sj_col,
      { x: sj_sp.x, y: sj_h(sj_sp.x, sj_sp.z), z: sj_sp.z, rot: 0 },
      sj_dests.map((sj_d) => ({ yaw: Math.atan2(sj_d.to.x - sj_sp.x, sj_d.to.z - sj_sp.z) })),
      createSignpostTexture(sj_dests, sj_textScale),
    );
    this.meshes.push(sj_signpost);
    sj_placement.reserve(sj_sp.x, sj_sp.z, 2.5);
    const sj_spY = sj_h(sj_sp.x, sj_sp.z);
    const sj_boards: Record<string, Point3> = {};
    sj_dests.forEach((sj_d, sj_i) => {
      const sj_len = Math.hypot(sj_d.to.x - sj_sp.x, sj_d.to.z - sj_sp.z) || 1;
      const sj_reach = sj_SIGNPOST.boardWidth / 2 + 0.12;
      sj_boards[sj_d.title.toLowerCase()] = {
        x: sj_sp.x + ((sj_d.to.x - sj_sp.x) / sj_len) * sj_reach,
        y: sj_spY + sj_SIGNPOST.top - sj_i * sj_SIGNPOST.step,
        z: sj_sp.z + ((sj_d.to.z - sj_sp.z) / sj_len) * sj_reach,
      };
    });
    this.signpost = { x: sj_sp.x, y: sj_spY, z: sj_sp.z, boards: sj_boards };

    // Merge everything static into a handful of meshes.
    this.meshes.push(...sj_b.build());
    for (const sj_m of this.meshes) scene.add(sj_m);

    // Warm pools of lantern light on the ground (wider and softer for lanterns hung high).
    this.lights = sj_b.lights;
    for (const sj_s of sj_b.lights) {
      const sj_above = Math.max(0.3, sj_s.y - sj_h(sj_s.x, sj_s.z));
      const sj_strength = sj_s.kind === 'stone' ? 0.85 : sj_s.kind === 'paper' ? 0.8 : 0.5;
      sj_mask.blob(
        'light',
        sj_s.x,
        sj_s.z,
        1.5 + sj_above * 0.6,
        sj_strength / (1 + sj_above * 0.2),
      );
    }

    // Floating captions: skill groups over the dummies, milestones along the bridge.
    // as large as the spacing of the dummies allows, so they read from across the yard
    const sj_dummies = this.training.dummies;
    let sj_spacing = Infinity;
    for (let sj_i = 1; sj_i < sj_dummies.length; sj_i++)
      sj_spacing = Math.min(
        sj_spacing,
        Math.hypot(
          sj_dummies[sj_i]!.x - sj_dummies[sj_i - 1]!.x,
          sj_dummies[sj_i]!.z - sj_dummies[sj_i - 1]!.z,
        ),
      );
    const sj_skillWidth = Math.min(3.0, sj_spacing * 0.92);
    sj_content.skills.groups.slice(0, sj_dummies.length).forEach((sj_g, sj_i) => {
      const sj_d = sj_dummies[sj_i]!;
      this.labels.add(scene, { x: sj_d.x, y: sj_d.y + 2.75, z: sj_d.z }, sj_g.name, sj_g.blurb, {
        width: sj_skillWidth,
        near: 9,
        far: 14,
      });
    });
    const sj_entries = sj_content.journey.entries.slice(0, sj_bridge.milestones.length);
    const sj_slots = sj_entries.map((_sj, sj_i) =>
      Math.round((sj_i * (sj_bridge.milestones.length - 1)) / Math.max(1, sj_entries.length - 1)),
    );
    sj_entries.forEach((sj_e, sj_i) => {
      const sj_ms = sj_bridge.milestones[sj_slots[sj_i]!]!;
      this.labels.add(scene, { x: sj_ms.x, y: sj_ms.y + 2.2, z: sj_ms.z }, sj_e.when, sj_e.title, {
        width: 3.0,
        near: 7,
        far: 11,
      });
    });

    this.anchors = {
      gate: { x: sj_PLACES.gate.x, y: sj_gateY, z: sj_PLACES.gate.z },
      pavilionTable: sj_pav.table,
      pavilionEntrance: sj_pav.entrance,
      signpost: this.signpost,
      pagoda: { x: sj_PLACES.pagoda.x, y: sj_pagodaY, z: sj_PLACES.pagoda.z },
      pagodaDoor: { x: sj_pagoda.door.x, y: sj_pagodaY + 0.85, z: sj_pagoda.door.z },
      bell: { x: sj_PLACES.bell.x, y: sj_bellY, z: sj_PLACES.bell.z },
      drum: this.training.drum,
      dummies: this.training.dummies.map((sj_d) => ({ x: sj_d.x, y: sj_d.y, z: sj_d.z })),
      banners: this.banners.anchors,
      milestones: sj_slots.map((sj_s) => sj_bridge.milestones[sj_s]!),
    };
  }

  /** Swing the log striker into the bell. `sj_onHit` fires at the moment of impact. */
  ringBell(sj_onHit: () => void): boolean {
    if (this.bellT >= 0) return false;
    this.bellT = 0;
    this.onBellHit = sj_onHit;
    return true;
  }

  update(sj_dt: number, sj_player: Vector3, sj_camera?: Vector3): void {
    this.training.update(sj_dt);
    this.labels.update(sj_player, sj_camera);

    // Striker: pulled back on its ropes, swung into the bell, then rebounding.
    let sj_angle = 0;
    if (this.bellT >= 0) {
      this.bellT += sj_dt;
      const sj_t = this.bellT;
      if (sj_t < 0.45) sj_angle = -0.55 * easeOutCubic(sj_t / 0.45);
      else if (sj_t < 0.62) sj_angle = -0.55 + 0.6 * ((sj_t - 0.45) / 0.17) ** 2;
      else {
        if (this.onBellHit) {
          this.onBellHit();
          this.onBellHit = null;
          this.bellSwingVel += 0.9;
        }
        sj_angle = 0.05 * Math.exp(-(sj_t - 0.62) * 4) * Math.cos((sj_t - 0.62) * 9);
      }
      if (sj_t > 2.5) this.bellT = -1;
    }
    const sj_rope = 1.0;
    const sj_lx = 1.35 - Math.sin(sj_angle) * sj_rope;
    const sj_ropeTop = this.bell.pivot.y - 1.0 + sj_rope;
    const sj_rot = this.bellRot;
    const sj_s = this.bell.striker;
    sj_s.position.set(
      this.bell.pivot.x + sj_lx * Math.cos(sj_rot),
      sj_ropeTop - Math.cos(sj_angle) * sj_rope,
      this.bell.pivot.z - sj_lx * Math.sin(sj_rot),
    );

    // Bell: damped pendulum after each strike.
    this.bellSwingVel += (-this.bellSwing * 16 - this.bellSwingVel * 0.9) * sj_dt;
    this.bellSwing += this.bellSwingVel * sj_dt;
    this.bell.bell.rotation.set(0, sj_rot, this.bellSwing * 0.2, 'YXZ');
  }

  dispose(): void {
    for (const sj_m of this.meshes) this.scene.remove(sj_m);
  }
}
