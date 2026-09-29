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
import { globalUniforms } from '../../render/uniforms';
import { NOISE_GLSL, TERRAIN_GLSL } from '../../render/glsl';
import { Random } from '../../utils/random';

function petalSprite(): CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.translate(s / 2, s / 2);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.42);
  ctx.bezierCurveTo(s * 0.32, -s * 0.28, s * 0.26, s * 0.3, 0, s * 0.4);
  ctx.bezierCurveTo(-s * 0.26, s * 0.3, -s * 0.32, -s * 0.28, 0, -s * 0.42);
  ctx.fill();
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function glowSprite(): CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
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
    blossomBlobs: { x: number; y: number; z: number; r: number }[],
    petalCount: number,
    moteCount: number,
  ) {
    const rand = new Random(77);
    // ---- petals ----
    const spawn = new Float32Array(petalCount * 3);
    const params = new Float32Array(petalCount * 4);
    const colors = new Float32Array(petalCount * 3);
    const palette = ['#fbd3e0', '#f6b3c9', '#f29ab7', '#fde9ef'].map((c) => new Color(c));
    for (let i = 0; i < petalCount; i++) {
      const b = blossomBlobs.length ? rand.pick(blossomBlobs) : { x: 0, y: 5, z: 20, r: 2 };
      const a = rand.range(0, Math.PI * 2);
      const r = Math.sqrt(rand.float()) * b.r;
      spawn[i * 3] = b.x + Math.cos(a) * r;
      spawn[i * 3 + 1] = b.y - rand.range(0, b.r * 0.4);
      spawn[i * 3 + 2] = b.z + Math.sin(a) * r;
      params[i * 4] = rand.float();
      params[i * 4 + 1] = rand.range(0.35, 0.65);
      params[i * 4 + 2] = rand.range(0.2, 0.6);
      params[i * 4 + 3] = rand.range(-3, 3);
      const c = rand.pick(palette);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(spawn, 3));
    pg.setAttribute('aParams', new BufferAttribute(params, 4));
    pg.setAttribute('aColor', new BufferAttribute(colors, 3));
    const petalMat = new ShaderMaterial({
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
        ${NOISE_GLSL}
        ${TERRAIN_GLSL}
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
    Object.assign(petalMat.uniforms, {
      uTime: globalUniforms.uTime,
      uWindDir: globalUniforms.uWindDir,
      uHeightMap: globalUniforms.uHeightMap,
      uMaskMap: globalUniforms.uMaskMap,
      uTerrain: globalUniforms.uTerrain,
      uScale: this.scaleUniform,
      uSprite: { value: petalSprite() },
    });
    this.petals = new Points(pg, petalMat);
    this.petals.frustumCulled = false;
    this.petals.name = 'petals';
    this.petals.renderOrder = 4;

    // ---- golden motes around the panda ----
    const mpos = new Float32Array(moteCount * 3);
    const mpar = new Float32Array(moteCount * 2);
    for (let i = 0; i < moteCount; i++) {
      mpos[i * 3] = rand.range(-14, 14);
      mpos[i * 3 + 1] = rand.range(0.4, 4.5);
      mpos[i * 3 + 2] = rand.range(-14, 14);
      mpar[i * 2] = rand.float();
      mpar[i * 2 + 1] = rand.range(0.5, 1.3);
    }
    const mg = new BufferGeometry();
    mg.setAttribute('position', new BufferAttribute(mpos, 3));
    mg.setAttribute('aParams', new BufferAttribute(mpar, 2));
    const moteMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: globalUniforms.uTime,
        uPlayerPos: globalUniforms.uPlayerPos,
        uScale: this.scaleUniform,
        uSprite: { value: glowSprite() },
        uHeightMap: globalUniforms.uHeightMap,
        uMaskMap: globalUniforms.uMaskMap,
        uTerrain: globalUniforms.uTerrain,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aParams;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform float uScale;
        varying float vAlpha;
        ${TERRAIN_GLSL}
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
    this.motes = new Points(mg, moteMat);
    this.motes.frustumCulled = false;
    this.motes.name = 'motes';
    this.motes.renderOrder = 6;
  }

  addTo(scene: Scene): void {
    scene.add(this.petals, this.motes);
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.scaleUniform.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}
