import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Scene,
} from 'three';
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_NOISE_GLSL, sj_TERRAIN_GLSL } from '../../render/glsl';
import { Random } from '../../utils/random';

function petalSprite(): CanvasTexture {
  const sj_s = 64;
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_c.height = sj_s;
  const sj_ctx = sj_c.getContext('2d')!;
  sj_ctx.translate(sj_s / 2, sj_s / 2);
  sj_ctx.fillStyle = '#fff';
  sj_ctx.beginPath();
  sj_ctx.moveTo(0, -sj_s * 0.42);
  sj_ctx.bezierCurveTo(sj_s * 0.32, -sj_s * 0.28, sj_s * 0.26, sj_s * 0.3, 0, sj_s * 0.4);
  sj_ctx.bezierCurveTo(-sj_s * 0.26, sj_s * 0.3, -sj_s * 0.32, -sj_s * 0.28, 0, -sj_s * 0.42);
  sj_ctx.fill();
  const sj_t = new CanvasTexture(sj_c);
  sj_t.needsUpdate = true;
  return sj_t;
}

function glowSprite(): CanvasTexture {
  const sj_s = 64;
  const sj_c = document.createElement('canvas');
  sj_c.width = sj_c.height = sj_s;
  const sj_ctx = sj_c.getContext('2d')!;
  const sj_g = sj_ctx.createRadialGradient(sj_s / 2, sj_s / 2, 0, sj_s / 2, sj_s / 2, sj_s / 2);
  sj_g.addColorStop(0, 'rgba(255,255,255,1)');
  sj_g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  sj_g.addColorStop(1, 'rgba(255,255,255,0)');
  sj_ctx.fillStyle = sj_g;
  sj_ctx.fillRect(0, 0, sj_s, sj_s);
  const sj_t = new CanvasTexture(sj_c);
  sj_t.needsUpdate = true;
  return sj_t;
}

/**
 * Petals drifting down from the blossom trees (landing and fading on the ground) and
 * golden dust motes floating in the evening light around the panda. Fully GPU-animated.
 */
export class Ambient {
  readonly petals: Points;
  readonly motes: Points;
  private scaleUniform = { value: 800 };

  constructor(
    sj_blossomBlobs: { x: number; y: number; z: number; r: number }[],
    sj_petalCount: number,
    sj_moteCount: number,
  ) {
    const sj_rand = new Random(77);
    // ---- petals ----
    const sj_spawn = new Float32Array(sj_petalCount * 3);
    const sj_params = new Float32Array(sj_petalCount * 4);
    const sj_colors = new Float32Array(sj_petalCount * 3);
    const sj_palette = ['#fbd3e0', '#f6b3c9', '#f29ab7', '#fde9ef'].map((sj_c) => new Color(sj_c));
    for (let sj_i = 0; sj_i < sj_petalCount; sj_i++) {
      const sj_b = sj_blossomBlobs.length
        ? sj_rand.pick(sj_blossomBlobs)
        : { x: 0, y: 5, z: 20, r: 2 };
      const sj_a = sj_rand.range(0, Math.PI * 2);
      const sj_r = Math.sqrt(sj_rand.float()) * sj_b.r;
      sj_spawn[sj_i * 3] = sj_b.x + Math.cos(sj_a) * sj_r;
      sj_spawn[sj_i * 3 + 1] = sj_b.y - sj_rand.range(0, sj_b.r * 0.4);
      sj_spawn[sj_i * 3 + 2] = sj_b.z + Math.sin(sj_a) * sj_r;
      sj_params[sj_i * 4] = sj_rand.float();
      sj_params[sj_i * 4 + 1] = sj_rand.range(0.35, 0.65);
      sj_params[sj_i * 4 + 2] = sj_rand.range(0.2, 0.6);
      sj_params[sj_i * 4 + 3] = sj_rand.range(-3, 3);
      const sj_c = sj_rand.pick(sj_palette);
      sj_colors.set([sj_c.r, sj_c.g, sj_c.b], sj_i * 3);
    }
    const sj_pg = new BufferGeometry();
    sj_pg.setAttribute('position', new BufferAttribute(sj_spawn, 3));
    sj_pg.setAttribute('aParams', new BufferAttribute(sj_params, 4));
    sj_pg.setAttribute('aColor', new BufferAttribute(sj_colors, 3));
    const sj_petalMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog]),
      vertexShader: /* glsl */ `
        attribute vec4 aParams;
        attribute vec3 aColor;
        uniform float uScale;
        uniform vec2 uWindDir;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRot;
        ${sj_NOISE_GLSL}
        ${sj_TERRAIN_GLSL}
        uniform float uTime;
        #include <fog_pars_vertex>
        void main() {
          float life = 11.0;
          float t = mod(uTime + aParams.x * life, life);
          vec3 p = position;
          float fallTime = t;
          p.y -= fallTime * aParams.y;
          p.xz += uWindDir * fallTime * 0.45;
          p.x += sin(fallTime * 1.7 + aParams.x * 40.0) * aParams.z;
          p.z += cos(fallTime * 1.3 + aParams.x * 23.0) * aParams.z;
          float ground = terrainHeightAt(p.xz) + 0.03;
          float landed = step(p.y, ground);
          p.y = max(p.y, max(ground, 0.02));
          vAlpha = smoothstep(0.0, 0.8, t) * (1.0 - smoothstep(life - 2.5, life, t));
          vRot = aParams.w * t * (1.0 - landed) + aParams.x * 6.28;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = 0.075 * uScale / max(-mvPosition.z, 0.1) * (1.0 - 0.35 * landed);
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSprite;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRot;
        #include <fog_pars_fragment>
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot);
          float s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          float a = texture2D(uSprite, uv).a * vAlpha;
          if (a < 0.05) discard;
          gl_FragColor = vec4(vColor, a);
          #include <fog_fragment>
        }
      `,
    });
    Object.assign(sj_petalMat.uniforms, {
      uTime: sj_globalUniforms.uTime,
      uWindDir: sj_globalUniforms.uWindDir,
      uHeightMap: sj_globalUniforms.uHeightMap,
      uMaskMap: sj_globalUniforms.uMaskMap,
      uTerrain: sj_globalUniforms.uTerrain,
      uScale: this.scaleUniform,
      uSprite: { value: petalSprite() },
    });
    this.petals = new Points(sj_pg, sj_petalMat);
    this.petals.frustumCulled = false;
    this.petals.name = 'petals';
    this.petals.renderOrder = 4;

    // ---- golden motes around the panda ----
    const sj_mpos = new Float32Array(sj_moteCount * 3);
    const sj_mpar = new Float32Array(sj_moteCount * 2);
    for (let sj_i = 0; sj_i < sj_moteCount; sj_i++) {
      sj_mpos[sj_i * 3] = sj_rand.range(-14, 14);
      sj_mpos[sj_i * 3 + 1] = sj_rand.range(0.4, 4.5);
      sj_mpos[sj_i * 3 + 2] = sj_rand.range(-14, 14);
      sj_mpar[sj_i * 2] = sj_rand.float();
      sj_mpar[sj_i * 2 + 1] = sj_rand.range(0.5, 1.3);
    }
    const sj_mg = new BufferGeometry();
    sj_mg.setAttribute('position', new BufferAttribute(sj_mpos, 3));
    sj_mg.setAttribute('aParams', new BufferAttribute(sj_mpar, 2));
    const sj_moteMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: sj_globalUniforms.uTime,
        uPlayerPos: sj_globalUniforms.uPlayerPos,
        uScale: this.scaleUniform,
        uSprite: { value: glowSprite() },
        uHeightMap: sj_globalUniforms.uHeightMap,
        uMaskMap: sj_globalUniforms.uMaskMap,
        uTerrain: sj_globalUniforms.uTerrain,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aParams;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform float uScale;
        varying float vAlpha;
        ${sj_TERRAIN_GLSL}
        void main() {
          float box = 28.0;
          vec3 p = position;
          p.x += sin(uTime * 0.2 * aParams.y + aParams.x * 30.0) * 1.2;
          p.z += cos(uTime * 0.17 * aParams.y + aParams.x * 17.0) * 1.2;
          p.y += sin(uTime * 0.35 * aParams.y + aParams.x * 9.0) * 0.4;
          vec2 world = p.xz + box * floor((uPlayerPos.xz - p.xz) / box + 0.5);
          float ground = terrainHeightAt(world);
          vec3 wp = vec3(world.x, ground + p.y, world.y);
          float edge = length(world - uPlayerPos.xz) / (box * 0.5);
          float twinkle = 0.5 + 0.5 * sin(uTime * 2.3 * aParams.y + aParams.x * 50.0);
          vAlpha = twinkle * (1.0 - smoothstep(0.6, 1.0, edge));
          vec4 mv = modelViewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 0.09 * uScale / max(-mv.z, 0.1);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSprite;
        varying float vAlpha;
        void main() {
          float a = texture2D(uSprite, gl_PointCoord).a * vAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.5) * 1.6 * a, a);
        }
      `,
    });
    this.motes = new Points(sj_mg, sj_moteMat);
    this.motes.frustumCulled = false;
    this.motes.name = 'motes';
    this.motes.renderOrder = 6;
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.petals, this.motes);
  }

  setViewport(sj_heightPx: number, sj_fovDeg: number): void {
    this.scaleUniform.value = sj_heightPx / (2 * Math.tan((sj_fovDeg * Math.PI) / 360));
  }
}
