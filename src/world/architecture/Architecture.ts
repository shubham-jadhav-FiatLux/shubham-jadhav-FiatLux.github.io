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
  buildVillageDetails,
  type BellParts,
} from './structures';
import { TrainingGround } from './Training';
import { Banners, type BannerAnchor } from './Banners';
import { Labels } from './Labels';
import { createSignpostTexture } from './textures';
import { BRIDGE_POINTS, HOUSES, PATHS, PLACES } from '../layout';
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
  pagoda: Point3;
  pagodaDoor: Point3;
  bell: Point3;
  drum: Point3;
  dummies: Point3[];
  banners: BannerAnchor[];
  milestones: Point3[];
}

const NUMERALS = '一二三四五六七八九十';

/**
 * Builds every structure in the valley from the layout plan and the portfolio content,
 * registers colliders, paints footprints into the terrain mask and exposes anchor points
 * for the portfolio zones. Also animates the interactive pieces (dummies, bell).
 */
export class Architecture {
  readonly anchors: Anchors;
  readonly training: TrainingGround;
  readonly banners: Banners;
  readonly bell: BellParts;
  readonly labels = new Labels();
  /** every lantern and glowing altar, for halos and lights */
  readonly lights: LightSpot[];
  private meshes: Mesh[] = [];
  private bellT = -1;
  private bellSwing = 0;
  private bellSwingVel = 0;
  private onBellHit: (() => void) | null = null;
  private readonly bellRot = 0.6;

  constructor(
    private readonly scene: Scene,
    terrain: Terrain,
    col: CollisionWorld,
    placement: Placement,
    content: PortfolioContent,
    environment: Texture | null = null,
  ) {
    const b = new ArchBuilder();
    if (environment) b.setEnvironment(environment);
    const h = (x: number, z: number) => terrain.heightAt(x, z);
    const mask = terrain.mask;

    // Gate at the entrance.
    const gateY = h(PLACES.gate.x, PLACES.gate.z);
    const signboard = buildGate(
      b,
      col,
      { x: PLACES.gate.x, y: gateY, z: PLACES.gate.z, rot: 0 },
      content.site.gateGlyphs,
    );
    this.meshes.push(signboard);

    // Pagoda on the hill, door facing the path from the south.
    const pagodaY = h(PLACES.pagoda.x, PLACES.pagoda.z);
    const pagoda = buildPagoda(b, col, {
      x: PLACES.pagoda.x,
      y: pagodaY,
      z: PLACES.pagoda.z,
      rot: 0.15,
    });
    mask.circle('stone', PLACES.pagoda.x, PLACES.pagoda.z, 7.2);
    mask.circle('nograss', PLACES.pagoda.x, PLACES.pagoda.z, 7.6);

    // Tea pavilion on the lake shore, opening towards the lake (north-east).
    const pav = buildPavilion(b, col, {
      x: PLACES.pavilion.x,
      y: 0,
      z: PLACES.pavilion.z,
      rot: -0.5,
    });

    // Village and the training hall.
    for (const house of HOUSES) {
      buildHouse(b, col, house, h(house.x, house.z));
      mask.rect(
        'stone',
        house.x,
        house.z,
        house.width / 2 + 0.6,
        house.depth / 2 + 0.6,
        house.rot,
        0.9,
      );
      mask.rect(
        'nograss',
        house.x,
        house.z,
        house.width / 2 + 1.2,
        house.depth / 2 + 1.2,
        house.rot,
      );
      mask.blob('shade', house.x, house.z, Math.max(house.width, house.depth) * 0.8, 0.45);
    }
    buildVillageDetails(b, col, h);

    // Zig-zag bridge across the lake.
    const bridge = buildBridge(b, col, BRIDGE_POINTS, h);
    const foam = new PierFoam(bridge.piers);
    foam.addTo(scene);
    this.meshes.push(foam.mesh);

    // Bell tower by the waterfall.
    const bellY = h(PLACES.bell.x, PLACES.bell.z);
    this.bell = buildBellTower(b, col, {
      x: PLACES.bell.x,
      y: bellY,
      z: PLACES.bell.z,
      rot: this.bellRot,
    });
    scene.add(this.bell.bell, this.bell.striker);
    const bronze = this.bell.bell.material as MeshStandardMaterial;
    bronze.envMap = environment;
    bronze.envMapIntensity = 1.1;

    // Training grounds: one dummy per skill group.
    this.training = new TrainingGround(b, col, PLACES.training, h, content.skills.groups.length);
    this.training.addTo(scene);

    // Project banners along the path to the pagoda.
    const pagodaPath = PATHS.find((p) => p.id === 'pagoda')!.points;
    this.banners = new Banners(
      b,
      col,
      pagodaPath,
      h,
      content.projects.items.slice(0, 8).map((p, i) => ({
        number: NUMERALS[i] ?? String(i + 1),
        title: p.bannerTitle ?? p.title,
      })),
    );
    this.banners.addTo(scene);
    for (const a of this.banners.anchors) {
      placement.reserve(a.x, a.z, 3.2);
      mask.circle('nograss', a.x, a.z, 1.0, 0.8);
    }

    // Signpost at the crossroads.
    const sp = { x: 3.4, z: 28.6 };
    const dests = [
      { label: 'Training Grounds · Skills', to: PLACES.training },
      { label: 'Tea Pavilion · About', to: PLACES.pavilion },
      { label: 'Zig-zag Bridge · Journey', to: PLACES.bridgeSouth },
      { label: 'Pagoda · Projects', to: PLACES.pagoda },
      { label: 'Bell Tower · Contact', to: PLACES.bell },
    ];
    const signpost = buildSignpost(
      b,
      col,
      { x: sp.x, y: h(sp.x, sp.z), z: sp.z, rot: 0 },
      dests.map((d) => ({ yaw: Math.atan2(d.to.x - sp.x, d.to.z - sp.z) })),
      createSignpostTexture(dests.map((d) => d.label)),
    );
    this.meshes.push(signpost);
    placement.reserve(sp.x, sp.z, 2.5);

    // Merge everything static into a handful of meshes.
    this.meshes.push(...b.build());
    for (const m of this.meshes) scene.add(m);

    // Warm pools of lantern light on the ground (wider and softer for lanterns hung high).
    this.lights = b.lights;
    for (const s of b.lights) {
      const above = Math.max(0.3, s.y - h(s.x, s.z));
      const strength = s.kind === 'stone' ? 0.85 : s.kind === 'paper' ? 0.8 : 0.5;
      mask.blob('light', s.x, s.z, 1.5 + above * 0.6, strength / (1 + above * 0.2));
    }

    // Floating captions: skill groups over the dummies, milestones along the bridge.
    content.skills.groups.slice(0, this.training.dummies.length).forEach((g, i) => {
      const d = this.training.dummies[i]!;
      this.labels.add(scene, { x: d.x, y: d.y + 2.55, z: d.z }, g.name, g.blurb, { width: 2.0 });
    });
    const entries = content.journey.entries.slice(0, bridge.milestones.length);
    const slots = entries.map((_, i) =>
      Math.round((i * (bridge.milestones.length - 1)) / Math.max(1, entries.length - 1)),
    );
    entries.forEach((e, i) => {
      const ms = bridge.milestones[slots[i]!]!;
      this.labels.add(scene, { x: ms.x, y: ms.y + 2.0, z: ms.z }, e.when, e.title, {
        width: 2.3,
        near: 6,
        far: 10,
      });
    });

    this.anchors = {
      gate: { x: PLACES.gate.x, y: gateY, z: PLACES.gate.z },
      pavilionTable: pav.table,
      pagoda: { x: PLACES.pagoda.x, y: pagodaY, z: PLACES.pagoda.z },
      pagodaDoor: { x: pagoda.door.x, y: pagodaY + 0.85, z: pagoda.door.z },
      bell: { x: PLACES.bell.x, y: bellY, z: PLACES.bell.z },
      drum: this.training.drum,
      dummies: this.training.dummies.map((d) => ({ x: d.x, y: d.y, z: d.z })),
      banners: this.banners.anchors,
      milestones: slots.map((s) => bridge.milestones[s]!),
    };
  }

  /** Swing the log striker into the bell. `onHit` fires at the moment of impact. */
  ringBell(onHit: () => void): boolean {
    if (this.bellT >= 0) return false;
    this.bellT = 0;
    this.onBellHit = onHit;
    return true;
  }

  update(dt: number, player: Vector3): void {
    this.training.update(dt);
    this.labels.update(player);

    // Striker: pulled back on its ropes, swung into the bell, then rebounding.
    let angle = 0;
    if (this.bellT >= 0) {
      this.bellT += dt;
      const t = this.bellT;
      if (t < 0.45) angle = -0.55 * easeOutCubic(t / 0.45);
      else if (t < 0.62) angle = -0.55 + 0.6 * ((t - 0.45) / 0.17) ** 2;
      else {
        if (this.onBellHit) {
          this.onBellHit();
          this.onBellHit = null;
          this.bellSwingVel += 0.9;
        }
        angle = 0.05 * Math.exp(-(t - 0.62) * 4) * Math.cos((t - 0.62) * 9);
      }
      if (t > 2.5) this.bellT = -1;
    }
    const rope = 1.0;
    const lx = 1.35 - Math.sin(angle) * rope;
    const ropeTop = this.bell.pivot.y - 1.0 + rope;
    const rot = this.bellRot;
    const s = this.bell.striker;
    s.position.set(
      this.bell.pivot.x + lx * Math.cos(rot),
      ropeTop - Math.cos(angle) * rope,
      this.bell.pivot.z - lx * Math.sin(rot),
    );

    // Bell: damped pendulum after each strike.
    this.bellSwingVel += (-this.bellSwing * 16 - this.bellSwingVel * 0.9) * dt;
    this.bellSwing += this.bellSwingVel * dt;
    this.bell.bell.rotation.set(0, rot, this.bellSwing * 0.2, 'YXZ');
  }

  dispose(): void {
    for (const m of this.meshes) this.scene.remove(m);
  }
}
