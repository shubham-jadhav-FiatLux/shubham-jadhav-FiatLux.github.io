import {
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  Vector4,
  type Scene,
} from 'three';
import { globalUniforms } from '../../render/uniforms';
import { NOISE_GLSL, TERRAIN_GLSL } from '../../render/glsl';
import { ATMOSPHERE } from '../../render/atmosphere';
import { FALLS, WATER_LEVEL } from '../layout';

const MAX_RIPPLES = 12;

/**
 * Stylised lake surface. The water depth comes from the terrain height texture, so no
 * depth pre-pass is needed: colour shifts from turquoise shallows to deep teal, foam lines
 * lap the shore, the sky and low sun reflect with Fresnel, and ripples spread wherever the
 * panda wades, swims or a koi jumps.
 */
export class Lake {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  private ripples: Vector4[] = [];
  private next = 0;

  constructor(bounds: { x0: number; z0: number; x1: number; z1: number }) {
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new Vector4(0, 0, -100, 0));
    const w = bounds.x1 - bounds.x0;
    const d = bounds.z1 - bounds.z0;
    const geometry = new PlaneGeometry(w, d, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(bounds.x0 + w / 2, WATER_LEVEL, bounds.z0 + d / 2);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uShallow: { value: new Color('#79c7b0') },
          uDeep: { value: new Color('#22655f') },
          uFoam: { value: new Color('#f6f3e8') },
          uZenith: { value: ATMOSPHERE.skyZenith },
          uSunColor: { value: ATMOSPHERE.sunColor },
          uLevel: { value: WATER_LEVEL },
          // where the waterfall lands: x, z, radius of the churn
          uFallsFoot: { value: new Vector3(FALLS.foot.x, FALLS.foot.z, 2.6) },
          uLampLight: { value: ATMOSPHERE.lampLight },
        },
      ]),
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform vec3 uZenith;
        uniform vec3 uSunColor;
        uniform float uLevel;
        uniform vec3 uFallsFoot;
        uniform vec3 uLampLight;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        varying vec3 vWorld;
        ${NOISE_GLSL}
        ${TERRAIN_GLSL}
        // hazeColor() comes from the atmospheric fog chunk.
        #include <fog_pars_fragment>

        vec2 noiseGrad(vec2 p) {
          const float e = 0.08;
          return vec2(vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0)),
                      vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e))) / (2.0 * e);
        }

        void main() {
          vec2 xz = vWorld.xz;
          float ground = terrainHeightAt(xz);
          float depth = uLevel - ground;
          if (depth < -0.01) discard;

          vec2 g = noiseGrad(xz * 0.32 + uTime * vec2(0.05, 0.03)) * 0.5;
          g += noiseGrad(xz * 0.85 - uTime * vec2(0.04, 0.07)) * 0.28;
          g += noiseGrad(xz * 2.1 + uTime * vec2(0.09, -0.06)) * 0.14;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > 3.5) continue;
            vec2 d = xz - r.xy;
            float dist = length(d);
            float front = age * 1.5 + 0.1;
            float envelope = exp(-pow((dist - front) * 2.6, 2.0)) * exp(-age * 1.1) * r.w;
            g += (d / max(dist, 1e-3)) * sin((dist - front) * 16.0) * envelope * 2.2;
          }
          // Waves spreading from the foot of the waterfall.
          vec2 fromFoot = xz - uFallsFoot.xy;
          float fd = length(fromFoot);
          vec2 outDir = fromFoot / max(fd, 1e-3);
          float nearFalls = exp(-fd * 0.2);
          g += outDir * sin(fd * 4.5 - uTime * 6.5) * nearFalls * 0.8;
          g += noiseGrad(xz * 1.5 + uTime * vec2(0.35, -0.45)) * nearFalls * 0.7;
          vec3 n = normalize(vec3(-g.x * 0.3, 1.0, -g.y * 0.3));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 R = reflect(-V, n);
          R.y = abs(R.y);
          vec3 sky = mix(hazeColor(R), uZenith, smoothstep(0.05, 0.6, R.y));

          vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 2.6, depth));
          // subtle light scattering in the shallows
          body += uShallow * 0.15 * (1.0 - smoothstep(0.0, 1.0, depth));
          vec3 col = mix(body, sky, fres * 0.9);

          float spec = pow(max(dot(R, uSunDir), 0.0), 260.0);
          float glitter = pow(max(dot(R, uSunDir), 0.0), 18.0) * step(0.78, vnoise(xz * 9.0 + uTime * 1.3));
          col += uSunColor * (spec * 7.0 + glitter * 1.4);

          // Shoreline foam: a lapping line plus soft bands moving towards the shore.
          float lap = 0.15 + 0.08 * sin(uTime * 1.3 + vnoise(xz * 0.7) * 6.0);
          float edge = 1.0 - smoothstep(lap * 0.4, lap, depth);
          float bands = smoothstep(0.62, 0.7, fract(depth * 2.4 - uTime * 0.28 + vnoise(xz * 1.3) * 0.7));
          bands *= 1.0 - smoothstep(0.1, 0.55, depth);
          float foam = clamp(edge * (0.65 + 0.35 * vnoise(xz * 4.0 + uTime * 0.4)) + bands * 0.55, 0.0, 1.0);
          // Lantern light glinting on the water around the bridge lanterns.
          float lamp = terrainDetailAt(xz).r;
          col += uLampLight * lamp * (0.9 + 0.8 * glitter + 0.3 * sin(uTime * 2.0 + dot(xz, vec2(3.1, 1.7))));
          // White water where the falls land, and foam trails drifting across the pool.
          float churn = 1.0 - smoothstep(uFallsFoot.z * 0.5, uFallsFoot.z * 2.4, fd);
          float boil = vnoise((xz - uFallsFoot.xy) * 1.3 - outDir * uTime * 1.1);
          float fallsFoam = churn * smoothstep(0.3, 0.65, boil * 0.7 + churn * 0.45);
          float trails = smoothstep(0.62, 0.8,
            vnoise(vec2(fd * 0.55 - uTime * 0.32, atan(fromFoot.y, fromFoot.x) * 2.2)));
          trails *= exp(-fd * 0.1) * (1.0 - churn) * smoothstep(0.3, 1.2, depth);
          foam = max(foam, max(fallsFoam, trails * 0.55));
          col = mix(col, uFoam, foam);

          float alpha = mix(0.5, 0.94, smoothstep(0.0, 2.2, depth));
          alpha = max(alpha, fres * 0.95);
          alpha = max(alpha, foam);
          alpha *= smoothstep(-0.01, 0.04, depth);
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }
      `,
    });
    Object.assign(material.uniforms, {
      uTime: globalUniforms.uTime,
      uSunDir: globalUniforms.uSunDir,
      uHeightMap: globalUniforms.uHeightMap,
      uMaskMap: globalUniforms.uMaskMap,
      uDetailMap: globalUniforms.uDetailMap,
      uTerrain: globalUniforms.uTerrain,
      uRipples: { value: this.ripples },
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'lake';
    this.mesh.renderOrder = 1;
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }

  /** Starts an expanding ring on the water surface. */
  ripple(x: number, z: number, strength = 1): void {
    const r = this.ripples[this.next]!;
    r.set(x, z, globalUniforms.uTime.value, strength);
    this.next = (this.next + 1) % MAX_RIPPLES;
  }
}
