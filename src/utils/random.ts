/**
 * Deterministic pseudo random numbers. The whole valley is generated from seeds so
 * every visitor sees exactly the same world and screenshots are reproducible.
 */

/** mulberry32: tiny, fast, good-enough 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(sj_seed: number): () => number {
  let sj_a = sj_seed >>> 0;
  return () => {
    sj_a = (sj_a + 0x6d2b79f5) >>> 0;
    let sj_t = sj_a;
    sj_t = Math.imul(sj_t ^ (sj_t >>> 15), sj_t | 1);
    sj_t ^= sj_t + Math.imul(sj_t ^ (sj_t >>> 7), sj_t | 61);
    return ((sj_t ^ (sj_t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Random {
  private next: () => number;

  constructor(sj_seed = 1) {
    this.next = mulberry32(sj_seed);
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Float in [min, max). */
  range(sj_min: number, sj_max: number): number {
    return sj_min + (sj_max - sj_min) * this.next();
  }

  /** Integer in [min, max] (inclusive). */
  int(sj_min: number, sj_max: number): number {
    return Math.floor(this.range(sj_min, sj_max + 1));
  }

  /** True with probability p. */
  chance(sj_p: number): boolean {
    return this.next() < sj_p;
  }

  pick<T>(sj_items: readonly T[]): T {
    return sj_items[Math.floor(this.next() * sj_items.length)]!;
  }

  /** Symmetric random value in [-amount, amount). */
  spread(sj_amount: number): number {
    return (this.next() * 2 - 1) * sj_amount;
  }

  /** Approximately normal distribution (sum of uniforms). */
  gaussian(sj_mean = 0, sj_deviation = 1): number {
    const sj_u = this.next() + this.next() + this.next() + this.next() - 2;
    return sj_mean + sj_u * sj_deviation * 0.8660254;
  }
}

/** Stateless integer hash of two coordinates -> [0, 1). Useful for per-cell jitter. */
export function hash2(sj_x: number, sj_y: number, sj_seed = 0): number {
  let sj_h =
    Math.imul(sj_x | 0, 374761393) +
    Math.imul(sj_y | 0, 668265263) +
    Math.imul(sj_seed | 0, 2147483647);
  sj_h = Math.imul(sj_h ^ (sj_h >>> 13), 1274126177);
  sj_h ^= sj_h >>> 16;
  return (sj_h >>> 0) / 4294967296;
}
