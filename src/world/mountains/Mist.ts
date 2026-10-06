import {
  Color,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { ATMOSPHERE } from '../../render/atmosphere';
import { globalUniforms } from '../../render/uniforms';
import { BUMP_GLSL, NOISE3_GLSL, NOISE_GLSL } from '../../render/glsl';
import { hazeGLSL } from '../../render/fog';

/** Sunlit tops and shaded undersides of the clouds (before haze). */
const CLOUD_LIT = new Color('#fff4e4').multiplyScalar(1.12);
const CLOUD_SHADE = new Color('#a9b0c6');

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * A sea of cloud around the valley, below the rim: seen from the hills or from the air,
 * the mountains rise out of it. Billows are lit by the low sun (bump-mapped from the
 * density field) and fade into the haze with distance.
 */
export function createCloudSea(height: number, inner: number, outer: number, bumps: boolean) {
  const geo = new RingGeometry(inner, outer, 160, 12);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, height, 0);
  const material = new ShaderMaterial({
    name: 'cloud-sea',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    defines: bumps ? { BUMPS: 1 } : {},
    uniforms: {
      uTime: globalUniforms.uTime,
      uSunDir: globalUniforms.uSunDir,
      uFog: { value: ATMOSPHERE.fogColor },
      uLit: { value: CLOUD_LIT },
      uShade: { value: CLOUD_SHADE },
      uRadii: { value: new Vector2(inner, outer) },
    },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uFog;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec2 uRadii;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      ${BUMP_GLSL}
      ${hazeGLSL('uFog')}
      void main() {
        vec2 xz = vWorld.xz;
        vec2 drift = vec2(uTime * 0.9, uTime * 0.4);
        float big = fbm((xz + drift) * 0.0042);
        float small = fbm((xz + drift * 1.7) * 0.017 + 7.0);
        float d = big * 0.68 + small * 0.32;
        float density = smoothstep(0.2, 0.5, d);

        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 dir = -toCam / dist;
        vec3 N = vec3(0.0, 1.0, 0.0);
        #ifdef BUMPS
          // Billows: bump-map the density, fading out where the plane is seen edge-on.
          float k = 1.0 - smoothstep(350.0, 1100.0, dist);
          vec3 nView = normalize((viewMatrix * vec4(N, 0.0)).xyz);
          vec3 posView = (viewMatrix * vec4(vWorld, 1.0)).xyz;
          nView = bumpFromHeight(posView, nView, d * 30.0 * k);
          N = normalize((vec4(nView, 0.0) * viewMatrix).xyz);
        #endif
        float lit = smoothstep(-0.25, 0.75, dot(N, uSunDir));
        vec3 haze = hazeColor(dir);
        vec3 col = mix(mix(haze, uShade, 0.55), uLit, lit);
        col *= mix(0.86, 1.04, density);
        col = mix(col, haze, 1.0 - exp(-dist * 0.0013));

        float r = length(xz);
        float fade = smoothstep(uRadii.x, uRadii.x + 40.0, r)
          * (1.0 - smoothstep(uRadii.y * 0.75, uRadii.y, r));
        float a = density * fade;
        // From below the clouds are a thin, cool veil.
        if (cameraPosition.y < vWorld.y) {
          a *= 0.5;
          col = mix(col, uShade, 0.35);
        }
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'cloud-sea';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export interface MistBand {
  radius: number;
  /** bottom and top of the band (m) */
  y0: number;
  y1: number;
  /** opacity where it is thickest */
  alpha: number;
}

/**
 * A ring of mist hanging at the waist of a range: billowy top, ragged body, slowly drifting.
 * Bands sit between the ranges, so each range rises out of its own layer of cloud.
 */
export function createMistBand(band: MistBand, index: number): Mesh {
  const height = band.y1 - band.y0;
  const geo = new CylinderGeometry(band.radius, band.radius, height, 160, 1, true);
  geo.translate(0, band.y0 + height / 2, 0);
  const material = new ShaderMaterial({
    name: 'mist-band',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    uniforms: {
      uTime: globalUniforms.uTime,
      uSunDir: globalUniforms.uSunDir,
      uFog: { value: ATMOSPHERE.fogColor },
      uLit: { value: CLOUD_LIT },
      uShade: { value: CLOUD_SHADE },
      uBand: { value: new Vector3(band.y0, band.y1, band.alpha) },
      uSeed: { value: index * 31.7 },
    },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uFog;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uBand;
      uniform float uSeed;
      varying vec3 vWorld;
      ${NOISE3_GLSL}
      ${hazeGLSL('uFog')}
      void main() {
        float y = vWorld.y;
        float span = uBand.y - uBand.x;
        vec3 drift = vec3(uTime * 0.7, 0.0, uTime * 0.3) + uSeed;
        // billowy top: the band is taller in some places than others
        float topN = fbm3(vec3(vWorld.x, 0.0, vWorld.z) * 0.0075 + drift * 0.012);
        float top = uBand.y - span * 0.7 * topN;
        float body = fbm3(vec3(vWorld.x, y * 1.8, vWorld.z) * 0.018 + drift * 0.02);
        float dens = smoothstep(top, top - span * 0.32, y)
          * smoothstep(uBand.x, uBand.x + span * 0.3, y)
          * smoothstep(0.22, 0.78, body + 0.12);

        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 dir = -toCam / dist;
        vec3 haze = hazeColor(dir);
        // brighter towards the billowy top; warmer where the low sun shines through it
        float lit = smoothstep(top - span * 0.45, top, y);
        vec2 look = normalize(dir.xz + vec2(1e-5));
        float towardSun = max(dot(look, normalize(uSunDir.xz)), 0.0);
        vec3 col = mix(mix(haze, uShade, 0.45), uLit, lit * 0.85 + 0.15);
        col = mix(col, col * vec3(1.08, 0.98, 0.86), towardSun * towardSun);
        col = mix(col, haze, 1.0 - exp(-dist * 0.0011));
        gl_FragColor = vec4(col, dens * uBand.z);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = `mist-band-${index}`;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
