import type { Scene } from 'three';
import { Random } from '../../utils/random';
import { SimplexNoise } from '../../utils/noise';
import { lakeSdf, riverAt } from '../heightfield';
import {
  CLIFF,
  FALLS,
  PAGODA_HILL,
  PLACES,
  TERRAIN_ORIGIN,
  TERRAIN_SIZE,
  WATER_LEVEL,
} from '../layout';
import type { Terrain } from '../Terrain';
import type { CollisionWorld } from '../../physics/CollisionWorld';
import type { QualitySettings } from '../../core/Quality';
import { Placement } from '../placement';
import { Trees, FarForest, type TreeInstance, type FarTree } from './Trees';
import { Bamboo, type BambooShoot, type BambooSpecies, type BambooStalk } from './Bamboo';
import { Rocks, type RockInstance } from './Rocks';
import { Flowers } from './Flowers';
import { Ambient } from './Ambient';

const noise = new SimplexNoise(4242);

/**
 * Decides where every tree, bamboo stalk and rock goes (deterministically), paints their
 * shade and bare patches into the terrain mask, registers colliders and builds the meshes.
 */
export class Nature {
  readonly trees: Trees;
  readonly bamboo: Bamboo;
  readonly rocks: Rocks;
  readonly flowers: Flowers;
  readonly ambient: Ambient;
  readonly farForest: FarForest;
  readonly placement: Placement;
  /** tree positions with crown radius, e.g. for the map */
  readonly treeSpots: { x: number; z: number; r: number; kind: string }[] = [];

  constructor(
    private readonly terrain: Terrain,
    private readonly collision: CollisionWorld,
    settings: QualitySettings,
    placement: Placement,
  ) {
    this.placement = placement;
    const detail = settings.detail;
    const trees = this.planTrees();
    this.trees = new Trees(trees, detail >= 0.8 ? 1 : 0.7);
    trees.forEach((t, i) => {
      const crown = this.trees.crownOf(t, i);
      this.treeSpots.push({ x: t.x, z: t.z, r: crown, kind: t.kind });
      const trunkR = 0.28 * t.scale + 0.05;
      collision.circle(t.x, t.z, trunkR, t.y - 1, t.y + 4, `tree:${t.kind}`);
      terrain.mask.blob('shade', t.x, t.z, crown * 0.95, t.kind === 'pine' ? 0.4 : 0.55);
      terrain.mask.circle('nograss', t.x, t.z, trunkR + 0.35, 0.8);
      if (t.kind === 'broadleaf' || t.kind === 'pine')
        terrain.mask.blob('litter', t.x, t.z, crown * 0.85, t.kind === 'pine' ? 0.7 : 0.55);
    });

    const grove = this.planBamboo(detail);
    this.bamboo = new Bamboo(grove.stalks, grove.shoots);
    const rocks = this.planRocks();
    this.rocks = new Rocks(rocks);
    this.flowers = new Flowers(Math.round(7000 * detail));
    this.ambient = new Ambient(
      this.trees.blossomBlobs,
      Math.round(650 * settings.particles),
      Math.round(160 * settings.particles),
    );
    this.farForest = new FarForest(this.planFarForest());
  }

  addTo(scene: Scene): void {
    this.trees.addTo(scene);
    this.bamboo.addTo(scene);
    this.rocks.addTo(scene);
    this.flowers.addTo(scene);
    this.ambient.addTo(scene);
    this.farForest.addTo(scene);
  }

  private h(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  private planTrees(): TreeInstance[] {
    const rand = new Random(2026);
    const p = this.placement;
    const out: TreeInstance[] = [];
    const avoid: { x: number; z: number; r: number }[] = [];
    const add = (
      kind: TreeInstance['kind'],
      x: number,
      z: number,
      scale: number,
      variant?: number,
    ) => {
      out.push({ kind, x, y: this.h(x, z), z, rot: rand.range(0, Math.PI * 2), scale, variant });
      avoid.push({ x, z, r: kind === 'pine' ? 5 : 6.5 });
    };

    // The old blossom tree in the middle of the crossroads.
    add('blossom', PLACES.crossroads.x, PLACES.crossroads.z, 1.7, 3);

    // Blossoms along paths and around the lake.
    for (const pt of p.scatter({
      bounds: [-45, -40, 55, 58],
      count: 24,
      minDist: 7.5,
      rand,
      pathMargin: 2.4,
      reservedMargin: 1.5,
      avoid,
      density: (x, z) => {
        const dp = p.distanceToPaths(x, z);
        const sdf = lakeSdf(x, z);
        return (dp < 9 ? 1 : 0.3) * (sdf < 14 ? 1 : 0.6);
      },
    })) {
      add('blossom', pt.x, pt.z, rand.range(0.85, 1.15));
    }

    // Weeping willows on the lake shore.
    for (const pt of p.scatter({
      bounds: [0, -42, 62, 22],
      count: 9,
      minDist: 9,
      rand,
      lake: 'shore',
      pathMargin: 2.2,
      reservedMargin: 2.5,
      avoid,
    })) {
      add('willow', pt.x, pt.z, rand.range(0.9, 1.15));
    }

    // Pines: on the pagoda hill, the north-east escarpment and the upper slopes.
    for (const pt of p.scatter({
      bounds: [-62, -80, 72, -18],
      count: 26,
      minDist: 6,
      rand,
      pathMargin: 2.5,
      reservedMargin: 1,
      maxSlope: 0.65,
      avoid,
      density: (x, z) => {
        const hill = Math.hypot(x - PAGODA_HILL.x, z - PAGODA_HILL.z);
        const onHill = hill > 11 && hill < PAGODA_HILL.radius ? 1 : 0;
        const cliff = Math.hypot(x - CLIFF.x, z - CLIFF.z) < CLIFF.radius - 2 ? 1 : 0;
        const high = this.h(x, z) > 7 ? 0.8 : 0.1;
        return Math.max(onHill, cliff, high);
      },
    })) {
      add('pine', pt.x, pt.z, rand.range(0.85, 1.25));
    }

    // Broadleaf trees in clumps across the meadows (and a few beyond the edge).
    for (const pt of p.scatter({
      bounds: [-78, -72, 78, 70],
      count: 34,
      minDist: 8.5,
      rand,
      pathMargin: 3.5,
      reservedMargin: 3,
      avoid,
      density: (x, z) => {
        const clump = noise.fbm2(x * 0.03, z * 0.03, 2);
        return clump > 0.05 ? 1 : 0.15;
      },
    })) {
      add('broadleaf', pt.x, pt.z, rand.range(0.85, 1.2));
    }
    return out;
  }

  private planBamboo(detail: number): { stalks: BambooStalk[]; shoots: BambooShoot[] } {
    const rand = new Random(88);
    const p = this.placement;
    const stalks: BambooStalk[] = [];
    const shoots: BambooShoot[] = [];
    const centres: { x: number; z: number; n: number; species: BambooSpecies }[] = [];
    const avoid = this.treeSpots.map((t) => ({ x: t.x, z: t.z, r: 2.5 }));
    // West grove around the training grounds: mostly green, with stands of golden bamboo.
    for (const c of p.scatter({
      bounds: [-74, -28, -22, 46],
      count: 34,
      minDist: 4.2,
      rand,
      pathMargin: 2.4,
      reservedMargin: 2,
      avoid,
      density: (x, z) => (noise.fbm2(x * 0.05 + 3, z * 0.05, 2) > -0.1 ? 1 : 0.2),
    })) {
      const golden = noise.fbm2(c.x * 0.06 - 7, c.z * 0.06 + 2, 2) > 0.22;
      centres.push({ x: c.x, z: c.z, n: rand.int(7, 13), species: golden ? 'golden' : 'green' });
    }
    // North-west grove behind the pagoda hill.
    for (const c of p.scatter({
      bounds: [-72, -78, -34, -28],
      count: 14,
      minDist: 4.5,
      rand,
      pathMargin: 2.4,
      reservedMargin: 2,
      avoid,
      maxSlope: 0.6,
    })) {
      centres.push({ x: c.x, z: c.z, n: rand.int(6, 11), species: 'green' });
    }
    // Golden bamboo framing the entrance gate; ornamental black bamboo by the village;
    // a few stands lining the way to the training grounds.
    for (const [x, z, species] of [
      [-8.5, 49, 'golden'],
      [8.5, 49.5, 'golden'],
      [-7, 55.5, 'green'],
      [7.5, 56, 'green'],
      [16, 33, 'black'],
      [48, 34, 'black'],
      [18, 50, 'green'],
      [-16, 24.6, 'green'],
      [-20.5, 23.2, 'golden'],
      [-25.2, 21.6, 'green'],
    ] as const) {
      centres.push({ x, z, n: rand.int(6, 10), species });
    }

    for (const c of centres) {
      const n = Math.max(3, Math.round(c.n * (0.6 + 0.4 * detail)));
      const placed: { x: number; z: number }[] = [];
      for (let a = 0; a < n * 8 && placed.length < n; a++) {
        const ang = rand.range(0, Math.PI * 2);
        const r = Math.sqrt(rand.float()) * 1.7;
        const x = c.x + Math.cos(ang) * r;
        const z = c.z + Math.sin(ang) * r;
        if (placed.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 0.36 * 0.36)) continue;
        if (p.distanceToPaths(x, z) < 1.1 || lakeSdf(x, z) < 1) continue;
        placed.push({ x, z });
        const y = this.h(x, z);
        // culms fan out from the middle of the clump
        stalks.push({
          x,
          y,
          z,
          scale: rand.range(0.8, 1.2) * (1 - 0.12 * (r / 1.7)),
          rot: Math.atan2(x - c.x, z - c.z) + rand.spread(0.35),
          lean: 0.015 + 0.075 * (r / 1.7) + rand.range(0, 0.03),
          species: c.species,
        });
        this.collision.circle(x, z, 0.09, y - 1, y + 6, 'bamboo');
      }
      // a few young shoots around the edge
      for (let k = rand.int(1, 3); k > 0; k--) {
        const ang = rand.range(0, Math.PI * 2);
        const r = rand.range(1.5, 2.3);
        const x = c.x + Math.cos(ang) * r;
        const z = c.z + Math.sin(ang) * r;
        if (p.distanceToPaths(x, z) < 1.3 || lakeSdf(x, z) < 1.5) continue;
        shoots.push({
          x,
          y: this.h(x, z),
          z,
          scale: rand.range(0.25, 0.65),
          rot: rand.range(0, 6.3),
        });
      }
      this.terrain.mask.blob('shade', c.x, c.z, 2.8, 0.4);
      this.terrain.mask.circle('nograss', c.x, c.z, 1.6, 0.75);
      this.terrain.mask.blob('dirt', c.x, c.z, 2.2, 0.35);
      // a carpet of fallen leaves, spilling a little beyond the clump
      this.terrain.mask.blob('litter', c.x, c.z, 3.4, 1);
    }
    return { stalks, shoots };
  }

  private planRocks(): RockInstance[] {
    const rand = new Random(515);
    const p = this.placement;
    const out: RockInstance[] = [];
    const avoid = this.treeSpots.map((t) => ({ x: t.x, z: t.z, r: 1.5 }));
    const add = (r: RockInstance, collide = true) => {
      out.push(r);
      avoid.push({ x: r.x, z: r.z, r: r.size + 0.8 });
      if (collide && r.size > 0.45) {
        this.collision.circle(r.x, r.z, r.size * 0.85, r.y - 1, r.y + r.size * 1.2, 'rock');
      }
      this.terrain.mask.circle('nograss', r.x, r.z, r.size * 0.75, 0.7);
      this.terrain.mask.blob('shade', r.x, r.z, r.size * 1.5, 0.35);
    };

    // Meadow boulders.
    for (const pt of p.scatter({
      bounds: [-70, -65, 70, 62],
      count: 18,
      minDist: 10,
      rand,
      pathMargin: 2,
      reservedMargin: 1.5,
      avoid,
    })) {
      add({
        ...pt,
        size: rand.range(0.5, 1.3),
        rot: rand.range(0, 6.28),
        style: rand.chance(0.5) ? 'boulder' : 'flat',
      });
    }
    // Hillside outcrops.
    for (const pt of p.scatter({
      bounds: [-80, -80, 80, 75],
      count: 26,
      minDist: 8,
      rand,
      pathMargin: 2.5,
      reservedMargin: 1,
      maxSlope: 0.55,
      avoid,
      density: (x, z) => (this.terrain.slopeAt(x, z) > 0.12 || this.h(x, z) > 6 ? 1 : 0.05),
    })) {
      add({
        ...pt,
        size: rand.range(1, 2.4),
        rot: rand.range(0, 6.28),
        style: rand.chance(0.45) ? 'cliff' : 'boulder',
        sink: 0.35,
        tilt: rand.spread(0.15),
      });
    }
    // Pebbles and stones along the shore.
    for (const pt of p.scatter({
      bounds: [0, -45, 62, 22],
      count: 30,
      minDist: 2.8,
      rand,
      lake: 'shore',
      pathMargin: 1.2,
      reservedMargin: 0.5,
      avoid,
    })) {
      add(
        {
          ...pt,
          size: rand.range(0.22, 0.6),
          rot: rand.range(0, 6.28),
          style: rand.chance(0.6) ? 'flat' : 'boulder',
          sink: 0.3,
        },
        false,
      );
    }
    // Big rocks along the escarpment edge (they hide the steep terrain), leaving the
    // waterfall alcove to its own, hand-placed rocks.
    const nearFalls = (x: number, z: number, r: number) =>
      Math.hypot(x - FALLS.lip.x, z - FALLS.lip.z) < r ||
      Math.hypot(x - FALLS.foot.x, z - FALLS.foot.z) < r;
    for (let a = 2.05; a <= 2.95; a += 0.035) {
      const r = CLIFF.radius - 1 + rand.spread(1.2);
      const x = CLIFF.x + Math.cos(a) * r;
      const z = CLIFF.z + Math.sin(a) * r;
      if (nearFalls(x, z, 8.5)) continue;
      if (x < TERRAIN_ORIGIN + 5 || z < TERRAIN_ORIGIN + 5) continue;
      const y = this.h(x, z);
      const n = this.terrain.normalAt(x, z);
      add({
        x,
        y,
        z,
        size: rand.range(2.2, 3.8),
        rot: rand.range(0, 6.28),
        style: rand.chance(0.2) ? 'boulder' : 'cliff',
        sink: 0.3,
        tilt: Math.acos(Math.min(1, n.y)) * 0.6 + rand.spread(0.15),
        tiltDir: Math.atan2(n.x, n.z),
      });
    }
    this.planFallsRocks(add);
    // Scholar rocks in the gardens.
    for (const [x, z, s] of [
      [6.5, 7.5, 1.1],
      [15.5, 8.5, 0.9],
      [-6.5, 18.5, 1.0],
      [-11.5, -45.5, 1.3],
      [-28, -44.5, 1.1],
      [4.8, 47.2, 0.8],
      [33, -39.5, 1.0],
    ] as const) {
      add({ x, y: this.h(x, z), z, size: s, rot: rand.range(0, 6.28), style: 'tall', sink: 0.1 });
    }
    return out;
  }

  /**
   * Rocks framing the waterfall: blocks either side of the lip, stacked slabs hiding the
   * sides of the alcove, boulders around the plunge pool and one in the spray.
   * Positions are given as (distance from the plateau centre along the fall line,
   * offset across it).
   */
  private planFallsRocks(add: (r: RockInstance, collide?: boolean) => void): void {
    const rand = new Random(777);
    const at = (r: number, across: number) => ({
      x: CLIFF.x + FALLS.dir.x * r + FALLS.across.x * across,
      z: CLIFF.z + FALLS.dir.z * r + FALLS.across.z * across,
    });
    const put = (
      r: number,
      across: number,
      size: number,
      style: RockInstance['style'],
      sink: number,
      minY = -Infinity,
    ) => {
      const p = at(r, across);
      // lean with the ground so rocks on the steep alcove sides sit against the face
      const n = this.terrain.normalAt(p.x, p.z);
      add({
        x: p.x,
        y: Math.max(this.h(p.x, p.z), minY),
        z: p.z,
        size,
        rot: rand.range(0, Math.PI * 2),
        style,
        sink,
        tilt: Math.acos(Math.min(1, n.y)) * 0.85 + rand.spread(0.12),
        tiltDir: Math.atan2(n.x, n.z),
      });
    };
    const lipR = CLIFF.radius - FALLS.recess - FALLS.edge;
    for (const s of [-1, 1]) {
      // blocks framing the notch on the plateau
      // (kept back from the edge so their undersides never show from below)
      put(lipR - 2.3, s * 3.4, s > 0 ? 1.8 : 2.0, 'cliff', 0.5);
      put(lipR - 4.4, s * 4.4, 1.4, 'cliff', 0.35);
      // slabs stacked down the sides of the alcove, set back into the face
      put(lipR - 0.5, s * 5.1, 2.6, 'cliff', 0.6);
      put(lipR + 1.6, s * 5.3, 2.3, 'cliff', 0.4, WATER_LEVEL - 0.6);
      // boulders at the water's edge
      put(lipR + 3.4, s * 5.6, s > 0 ? 1.5 : 1.8, 'boulder', 0.3, WATER_LEVEL - 0.5);
      put(lipR + 6.2, s * 6.2, 1.2, 'boulder', 0.3, WATER_LEVEL - 0.4);
    }
    // a wet boulder in the spray and a couple of stepping stones in the stream
    put(lipR + 4.4, 2.3, 0.85, 'boulder', 0.2, WATER_LEVEL - 0.35);
    for (const [r, across] of [
      [lipR - 2.2, 1.6],
      [lipR - 4.6, -1.4],
    ] as const) {
      const p = at(r, across);
      const bed = riverAt(p.x, p.z)?.bed ?? this.h(p.x, p.z);
      add(
        {
          x: p.x,
          y: bed + 0.18,
          z: p.z,
          size: 0.5,
          rot: rand.range(0, 6.28),
          style: 'boulder',
          sink: 0.2,
        },
        false,
      );
    }
  }

  private planFarForest(): FarTree[] {
    const rand = new Random(909);
    const out: FarTree[] = [];
    const half = TERRAIN_SIZE / 2 - 4;
    for (let a = 0; a < 4000 && out.length < 700; a++) {
      const x = rand.range(-half, half);
      const z = rand.range(-half, half);
      if (this.placement.insidePlayArea(x, z, -6)) continue;
      if (this.terrain.slopeAt(x, z) > 0.55) continue;
      // not in the stream or its spring pool
      if (this.placement.distanceToStream(x, z) < 1.5) continue;
      const y = this.h(x, z);
      if (y < 3) continue;
      if (noise.fbm2(x * 0.02, z * 0.02, 2) < -0.25) continue;
      out.push({ x, y, z, s: rand.range(0.8, 1.5), kind: y > 22 || rand.chance(0.45) ? 0 : 1 });
    }
    return out;
  }
}
