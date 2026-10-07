import type { Scene } from 'three';
import { Random } from '../../utils/random';
import { SimplexNoise } from '../../utils/noise';
import { lakeSdf, riverAt } from '../heightfield';
import {
  sj_CLIFF,
  sj_FALLS,
  sj_PAGODA_HILL,
  sj_PLACES,
  sj_TERRAIN_ORIGIN,
  sj_TERRAIN_SIZE,
  sj_WATER_LEVEL,
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

const sj_noise = new SimplexNoise(4242);

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
    sj_settings: QualitySettings,
    sj_placement: Placement,
  ) {
    this.placement = sj_placement;
    const sj_detail = sj_settings.detail;
    const sj_trees = this.planTrees();
    this.trees = new Trees(sj_trees, sj_detail >= 0.8 ? 1 : 0.7);
    sj_trees.forEach((sj_t, sj_i) => {
      const sj_crown = this.trees.crownOf(sj_t, sj_i);
      this.treeSpots.push({ x: sj_t.x, z: sj_t.z, r: sj_crown, kind: sj_t.kind });
      const sj_trunkR = 0.28 * sj_t.scale + 0.05;
      collision.circle(sj_t.x, sj_t.z, sj_trunkR, sj_t.y - 1, sj_t.y + 4, `tree:${sj_t.kind}`);
      terrain.mask.blob(
        'shade',
        sj_t.x,
        sj_t.z,
        sj_crown * 0.95,
        sj_t.kind === 'pine' ? 0.4 : 0.55,
      );
      terrain.mask.circle('nograss', sj_t.x, sj_t.z, sj_trunkR + 0.35, 0.8);
      if (sj_t.kind === 'broadleaf' || sj_t.kind === 'pine')
        terrain.mask.blob(
          'litter',
          sj_t.x,
          sj_t.z,
          sj_crown * 0.85,
          sj_t.kind === 'pine' ? 0.7 : 0.55,
        );
    });

    const sj_grove = this.planBamboo(sj_detail);
    this.bamboo = new Bamboo(sj_grove.stalks, sj_grove.shoots);
    const sj_rocks = this.planRocks();
    this.rocks = new Rocks(sj_rocks);
    this.flowers = new Flowers(Math.round(7000 * sj_detail));
    this.ambient = new Ambient(
      this.trees.blossomBlobs,
      Math.round(650 * sj_settings.particles),
      Math.round(160 * sj_settings.particles),
    );
    this.farForest = new FarForest(this.planFarForest());
  }

  addTo(sj_scene: Scene): void {
    this.trees.addTo(sj_scene);
    this.bamboo.addTo(sj_scene);
    this.rocks.addTo(sj_scene);
    this.flowers.addTo(sj_scene);
    this.ambient.addTo(sj_scene);
    this.farForest.addTo(sj_scene);
  }

  private h(sj_x: number, sj_z: number): number {
    return this.terrain.heightAt(sj_x, sj_z);
  }

  private planTrees(): TreeInstance[] {
    const sj_rand = new Random(2026);
    const sj_p = this.placement;
    const sj_out: TreeInstance[] = [];
    const sj_avoid: { x: number; z: number; r: number }[] = [];
    const sj_add = (
      sj_kind: TreeInstance['kind'],
      sj_x: number,
      sj_z: number,
      sj_scale: number,
      sj_variant?: number,
    ) => {
      sj_out.push({
        kind: sj_kind,
        x: sj_x,
        y: this.h(sj_x, sj_z),
        z: sj_z,
        rot: sj_rand.range(0, Math.PI * 2),
        scale: sj_scale,
        variant: sj_variant,
      });
      sj_avoid.push({ x: sj_x, z: sj_z, r: sj_kind === 'pine' ? 5 : 6.5 });
    };

    // The old blossom tree in the middle of the crossroads.
    sj_add('blossom', sj_PLACES.crossroads.x, sj_PLACES.crossroads.z, 1.7, 3);

    // Blossoms along paths and around the lake.
    for (const sj_pt of sj_p.scatter({
      bounds: [-45, -40, 55, 58],
      count: 24,
      minDist: 7.5,
      rand: sj_rand,
      pathMargin: 2.4,
      reservedMargin: 1.5,
      avoid: sj_avoid,
      density: (sj_x, sj_z) => {
        const sj_dp = sj_p.distanceToPaths(sj_x, sj_z);
        const sj_sdf = lakeSdf(sj_x, sj_z);
        return (sj_dp < 9 ? 1 : 0.3) * (sj_sdf < 14 ? 1 : 0.6);
      },
    })) {
      sj_add('blossom', sj_pt.x, sj_pt.z, sj_rand.range(0.85, 1.15));
    }

    // Weeping willows on the lake shore.
    for (const sj_pt of sj_p.scatter({
      bounds: [0, -42, 62, 22],
      count: 9,
      minDist: 9,
      rand: sj_rand,
      lake: 'shore',
      pathMargin: 2.2,
      reservedMargin: 2.5,
      avoid: sj_avoid,
    })) {
      sj_add('willow', sj_pt.x, sj_pt.z, sj_rand.range(0.9, 1.15));
    }

    // Pines: on the pagoda hill, the north-east escarpment and the upper slopes.
    for (const sj_pt of sj_p.scatter({
      bounds: [-62, -80, 72, -18],
      count: 26,
      minDist: 6,
      rand: sj_rand,
      pathMargin: 2.5,
      reservedMargin: 1,
      maxSlope: 0.65,
      avoid: sj_avoid,
      density: (sj_x, sj_z) => {
        const sj_hill = Math.hypot(sj_x - sj_PAGODA_HILL.x, sj_z - sj_PAGODA_HILL.z);
        const sj_onHill = sj_hill > 11 && sj_hill < sj_PAGODA_HILL.radius ? 1 : 0;
        const sj_cliff =
          Math.hypot(sj_x - sj_CLIFF.x, sj_z - sj_CLIFF.z) < sj_CLIFF.radius - 2 ? 1 : 0;
        const sj_high = this.h(sj_x, sj_z) > 7 ? 0.8 : 0.1;
        return Math.max(sj_onHill, sj_cliff, sj_high);
      },
    })) {
      sj_add('pine', sj_pt.x, sj_pt.z, sj_rand.range(0.85, 1.25));
    }

    // Broadleaf trees in clumps across the meadows (and a few beyond the edge).
    for (const sj_pt of sj_p.scatter({
      bounds: [-78, -72, 78, 70],
      count: 34,
      minDist: 8.5,
      rand: sj_rand,
      pathMargin: 3.5,
      reservedMargin: 3,
      avoid: sj_avoid,
      density: (sj_x, sj_z) => {
        const sj_clump = sj_noise.fbm2(sj_x * 0.03, sj_z * 0.03, 2);
        return sj_clump > 0.05 ? 1 : 0.15;
      },
    })) {
      sj_add('broadleaf', sj_pt.x, sj_pt.z, sj_rand.range(0.85, 1.2));
    }
    return sj_out;
  }

  private planBamboo(sj_detail: number): { stalks: BambooStalk[]; shoots: BambooShoot[] } {
    const sj_rand = new Random(88);
    const sj_p = this.placement;
    const sj_stalks: BambooStalk[] = [];
    const sj_shoots: BambooShoot[] = [];
    const sj_centres: { x: number; z: number; n: number; species: BambooSpecies }[] = [];
    const sj_avoid = this.treeSpots.map((sj_t) => ({ x: sj_t.x, z: sj_t.z, r: 2.5 }));
    // West grove around the training grounds: mostly green, with stands of golden bamboo.
    for (const sj_c of sj_p.scatter({
      bounds: [-74, -28, -22, 46],
      count: 34,
      minDist: 4.2,
      rand: sj_rand,
      pathMargin: 2.4,
      reservedMargin: 2,
      avoid: sj_avoid,
      density: (sj_x, sj_z) => (sj_noise.fbm2(sj_x * 0.05 + 3, sj_z * 0.05, 2) > -0.1 ? 1 : 0.2),
    })) {
      const sj_golden = sj_noise.fbm2(sj_c.x * 0.06 - 7, sj_c.z * 0.06 + 2, 2) > 0.22;
      sj_centres.push({
        x: sj_c.x,
        z: sj_c.z,
        n: sj_rand.int(7, 13),
        species: sj_golden ? 'golden' : 'green',
      });
    }
    // North-west grove behind the pagoda hill.
    for (const sj_c of sj_p.scatter({
      bounds: [-72, -78, -34, -28],
      count: 14,
      minDist: 4.5,
      rand: sj_rand,
      pathMargin: 2.4,
      reservedMargin: 2,
      avoid: sj_avoid,
      maxSlope: 0.6,
    })) {
      sj_centres.push({ x: sj_c.x, z: sj_c.z, n: sj_rand.int(6, 11), species: 'green' });
    }
    // Golden bamboo framing the entrance gate; ornamental black bamboo by the village;
    // a few stands lining the way to the training grounds.
    for (const [sj_x, sj_z, sj_species] of [
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
      sj_centres.push({ x: sj_x, z: sj_z, n: sj_rand.int(6, 10), species: sj_species });
    }

    for (const sj_c of sj_centres) {
      const sj_n = Math.max(3, Math.round(sj_c.n * (0.6 + 0.4 * sj_detail)));
      const sj_placed: { x: number; z: number }[] = [];
      for (let sj_a = 0; sj_a < sj_n * 8 && sj_placed.length < sj_n; sj_a++) {
        const sj_ang = sj_rand.range(0, Math.PI * 2);
        const sj_r = Math.sqrt(sj_rand.float()) * 1.7;
        const sj_x = sj_c.x + Math.cos(sj_ang) * sj_r;
        const sj_z = sj_c.z + Math.sin(sj_ang) * sj_r;
        if (sj_placed.some((sj_q) => (sj_q.x - sj_x) ** 2 + (sj_q.z - sj_z) ** 2 < 0.36 * 0.36))
          continue;
        if (sj_p.distanceToPaths(sj_x, sj_z) < 1.1 || lakeSdf(sj_x, sj_z) < 1) continue;
        sj_placed.push({ x: sj_x, z: sj_z });
        const sj_y = this.h(sj_x, sj_z);
        // culms fan out from the middle of the clump
        sj_stalks.push({
          x: sj_x,
          y: sj_y,
          z: sj_z,
          scale: sj_rand.range(0.8, 1.2) * (1 - 0.12 * (sj_r / 1.7)),
          rot: Math.atan2(sj_x - sj_c.x, sj_z - sj_c.z) + sj_rand.spread(0.35),
          lean: 0.015 + 0.075 * (sj_r / 1.7) + sj_rand.range(0, 0.03),
          species: sj_c.species,
        });
        this.collision.circle(sj_x, sj_z, 0.09, sj_y - 1, sj_y + 6, 'bamboo');
      }
      // a few young shoots around the edge
      for (let sj_k = sj_rand.int(1, 3); sj_k > 0; sj_k--) {
        const sj_ang = sj_rand.range(0, Math.PI * 2);
        const sj_r = sj_rand.range(1.5, 2.3);
        const sj_x = sj_c.x + Math.cos(sj_ang) * sj_r;
        const sj_z = sj_c.z + Math.sin(sj_ang) * sj_r;
        if (sj_p.distanceToPaths(sj_x, sj_z) < 1.3 || lakeSdf(sj_x, sj_z) < 1.5) continue;
        sj_shoots.push({
          x: sj_x,
          y: this.h(sj_x, sj_z),
          z: sj_z,
          scale: sj_rand.range(0.25, 0.65),
          rot: sj_rand.range(0, 6.3),
        });
      }
      this.terrain.mask.blob('shade', sj_c.x, sj_c.z, 2.8, 0.4);
      this.terrain.mask.circle('nograss', sj_c.x, sj_c.z, 1.6, 0.75);
      this.terrain.mask.blob('dirt', sj_c.x, sj_c.z, 2.2, 0.35);
      // a carpet of fallen leaves, spilling a little beyond the clump
      this.terrain.mask.blob('litter', sj_c.x, sj_c.z, 3.4, 1);
    }
    return { stalks: sj_stalks, shoots: sj_shoots };
  }

  private planRocks(): RockInstance[] {
    const sj_rand = new Random(515);
    const sj_p = this.placement;
    const sj_out: RockInstance[] = [];
    const sj_avoid = this.treeSpots.map((sj_t) => ({ x: sj_t.x, z: sj_t.z, r: 1.5 }));
    const sj_add = (sj_r: RockInstance, sj_collide = true) => {
      sj_out.push(sj_r);
      sj_avoid.push({ x: sj_r.x, z: sj_r.z, r: sj_r.size + 0.8 });
      if (sj_collide && sj_r.size > 0.45) {
        this.collision.circle(
          sj_r.x,
          sj_r.z,
          sj_r.size * 0.85,
          sj_r.y - 1,
          sj_r.y + sj_r.size * 1.2,
          'rock',
        );
      }
      this.terrain.mask.circle('nograss', sj_r.x, sj_r.z, sj_r.size * 0.75, 0.7);
      this.terrain.mask.blob('shade', sj_r.x, sj_r.z, sj_r.size * 1.5, 0.35);
    };

    // Meadow boulders.
    for (const sj_pt of sj_p.scatter({
      bounds: [-70, -65, 70, 62],
      count: 18,
      minDist: 10,
      rand: sj_rand,
      pathMargin: 2,
      reservedMargin: 1.5,
      avoid: sj_avoid,
    })) {
      sj_add({
        ...sj_pt,
        size: sj_rand.range(0.5, 1.3),
        rot: sj_rand.range(0, 6.28),
        style: sj_rand.chance(0.5) ? 'boulder' : 'flat',
      });
    }
    // Hillside outcrops.
    for (const sj_pt of sj_p.scatter({
      bounds: [-80, -80, 80, 75],
      count: 26,
      minDist: 8,
      rand: sj_rand,
      pathMargin: 2.5,
      reservedMargin: 1,
      maxSlope: 0.55,
      avoid: sj_avoid,
      density: (sj_x, sj_z) =>
        this.terrain.slopeAt(sj_x, sj_z) > 0.12 || this.h(sj_x, sj_z) > 6 ? 1 : 0.05,
    })) {
      sj_add({
        ...sj_pt,
        size: sj_rand.range(1, 2.4),
        rot: sj_rand.range(0, 6.28),
        style: sj_rand.chance(0.45) ? 'cliff' : 'boulder',
        sink: 0.35,
        tilt: sj_rand.spread(0.15),
      });
    }
    // Pebbles and stones along the shore.
    for (const sj_pt of sj_p.scatter({
      bounds: [0, -45, 62, 22],
      count: 30,
      minDist: 2.8,
      rand: sj_rand,
      lake: 'shore',
      pathMargin: 1.2,
      reservedMargin: 0.5,
      avoid: sj_avoid,
    })) {
      sj_add(
        {
          ...sj_pt,
          size: sj_rand.range(0.22, 0.6),
          rot: sj_rand.range(0, 6.28),
          style: sj_rand.chance(0.6) ? 'flat' : 'boulder',
          sink: 0.3,
        },
        false,
      );
    }
    // Big rocks along the escarpment edge (they hide the steep terrain), leaving the
    // waterfall alcove to its own, hand-placed rocks.
    const sj_nearFalls = (sj_x: number, sj_z: number, sj_r: number) =>
      Math.hypot(sj_x - sj_FALLS.lip.x, sj_z - sj_FALLS.lip.z) < sj_r ||
      Math.hypot(sj_x - sj_FALLS.foot.x, sj_z - sj_FALLS.foot.z) < sj_r;
    for (let sj_a = 2.05; sj_a <= 2.95; sj_a += 0.035) {
      const sj_r = sj_CLIFF.radius - 1 + sj_rand.spread(1.2);
      const sj_x = sj_CLIFF.x + Math.cos(sj_a) * sj_r;
      const sj_z = sj_CLIFF.z + Math.sin(sj_a) * sj_r;
      if (sj_nearFalls(sj_x, sj_z, 8.5)) continue;
      if (sj_x < sj_TERRAIN_ORIGIN + 5 || sj_z < sj_TERRAIN_ORIGIN + 5) continue;
      const sj_y = this.h(sj_x, sj_z);
      const sj_n = this.terrain.normalAt(sj_x, sj_z);
      sj_add({
        x: sj_x,
        y: sj_y,
        z: sj_z,
        size: sj_rand.range(2.2, 3.8),
        rot: sj_rand.range(0, 6.28),
        style: sj_rand.chance(0.2) ? 'boulder' : 'cliff',
        sink: 0.3,
        tilt: Math.acos(Math.min(1, sj_n.y)) * 0.6 + sj_rand.spread(0.15),
        tiltDir: Math.atan2(sj_n.x, sj_n.z),
      });
    }
    this.planFallsRocks(sj_add);
    // Scholar rocks in the gardens.
    for (const [sj_x, sj_z, sj_s] of [
      [6.5, 7.5, 1.1],
      [15.5, 8.5, 0.9],
      [-6.5, 18.5, 1.0],
      [-11.5, -45.5, 1.3],
      [-28, -44.5, 1.1],
      [4.8, 47.2, 0.8],
      [33, -39.5, 1.0],
    ] as const) {
      sj_add({
        x: sj_x,
        y: this.h(sj_x, sj_z),
        z: sj_z,
        size: sj_s,
        rot: sj_rand.range(0, 6.28),
        style: 'tall',
        sink: 0.1,
      });
    }
    return sj_out;
  }

  /**
   * Rocks framing the waterfall: blocks either side of the lip, stacked slabs hiding the
   * sides of the alcove, boulders around the plunge pool and one in the spray.
   * Positions are given as (distance from the plateau centre along the fall line,
   * offset across it).
   */
  private planFallsRocks(sj_add: (sj_r: RockInstance, sj_collide?: boolean) => void): void {
    const sj_rand = new Random(777);
    const sj_at = (sj_r: number, sj_across: number) => ({
      x: sj_CLIFF.x + sj_FALLS.dir.x * sj_r + sj_FALLS.across.x * sj_across,
      z: sj_CLIFF.z + sj_FALLS.dir.z * sj_r + sj_FALLS.across.z * sj_across,
    });
    const sj_put = (
      sj_r: number,
      sj_across: number,
      sj_size: number,
      sj_style: RockInstance['style'],
      sj_sink: number,
      sj_minY = -Infinity,
    ) => {
      const sj_p = sj_at(sj_r, sj_across);
      // lean with the ground so rocks on the steep alcove sides sit against the face
      const sj_n = this.terrain.normalAt(sj_p.x, sj_p.z);
      sj_add({
        x: sj_p.x,
        y: Math.max(this.h(sj_p.x, sj_p.z), sj_minY),
        z: sj_p.z,
        size: sj_size,
        rot: sj_rand.range(0, Math.PI * 2),
        style: sj_style,
        sink: sj_sink,
        tilt: Math.acos(Math.min(1, sj_n.y)) * 0.85 + sj_rand.spread(0.12),
        tiltDir: Math.atan2(sj_n.x, sj_n.z),
      });
    };
    const sj_lipR = sj_CLIFF.radius - sj_FALLS.recess - sj_FALLS.edge;
    for (const sj_s of [-1, 1]) {
      // blocks framing the notch on the plateau
      // (kept back from the edge so their undersides never show from below)
      sj_put(sj_lipR - 2.3, sj_s * 3.4, sj_s > 0 ? 1.8 : 2.0, 'cliff', 0.5);
      sj_put(sj_lipR - 4.4, sj_s * 4.4, 1.4, 'cliff', 0.35);
      // slabs stacked down the sides of the alcove, set back into the face
      sj_put(sj_lipR - 0.5, sj_s * 5.1, 2.6, 'cliff', 0.6);
      sj_put(sj_lipR + 1.6, sj_s * 5.3, 2.3, 'cliff', 0.4, sj_WATER_LEVEL - 0.6);
      // boulders at the water's edge
      sj_put(sj_lipR + 3.4, sj_s * 5.6, sj_s > 0 ? 1.5 : 1.8, 'boulder', 0.3, sj_WATER_LEVEL - 0.5);
      sj_put(sj_lipR + 6.2, sj_s * 6.2, 1.2, 'boulder', 0.3, sj_WATER_LEVEL - 0.4);
    }
    // a wet boulder in the spray and a couple of stepping stones in the stream
    sj_put(sj_lipR + 4.4, 2.3, 0.85, 'boulder', 0.2, sj_WATER_LEVEL - 0.35);
    for (const [sj_r, sj_across] of [
      [sj_lipR - 2.2, 1.6],
      [sj_lipR - 4.6, -1.4],
    ] as const) {
      const sj_p = sj_at(sj_r, sj_across);
      const sj_bed = riverAt(sj_p.x, sj_p.z)?.bed ?? this.h(sj_p.x, sj_p.z);
      sj_add(
        {
          x: sj_p.x,
          y: sj_bed + 0.18,
          z: sj_p.z,
          size: 0.5,
          rot: sj_rand.range(0, 6.28),
          style: 'boulder',
          sink: 0.2,
        },
        false,
      );
    }
  }

  private planFarForest(): FarTree[] {
    const sj_rand = new Random(909);
    const sj_out: FarTree[] = [];
    const sj_half = sj_TERRAIN_SIZE / 2 - 4;
    for (let sj_a = 0; sj_a < 4000 && sj_out.length < 700; sj_a++) {
      const sj_x = sj_rand.range(-sj_half, sj_half);
      const sj_z = sj_rand.range(-sj_half, sj_half);
      if (this.placement.insidePlayArea(sj_x, sj_z, -6)) continue;
      if (this.terrain.slopeAt(sj_x, sj_z) > 0.55) continue;
      // not in the stream or its spring pool
      if (this.placement.distanceToStream(sj_x, sj_z) < 1.5) continue;
      const sj_y = this.h(sj_x, sj_z);
      if (sj_y < 3) continue;
      if (sj_noise.fbm2(sj_x * 0.02, sj_z * 0.02, 2) < -0.25) continue;
      sj_out.push({
        x: sj_x,
        y: sj_y,
        z: sj_z,
        s: sj_rand.range(0.8, 1.5),
        kind: sj_y > 22 || sj_rand.chance(0.45) ? 0 : 1,
      });
    }
    return sj_out;
  }
}
