import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Scene,
} from 'three';
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_NOISE_GLSL, sj_TERRAIN_GLSL } from '../../render/glsl';
import { sj_ATMOSPHERE } from '../../render/atmosphere';
import { sj_RIVER_DEPTH, sj_riverCourse, type RiverPoint } from '../heightfield';

/**
 * The stream on the plateau: one ribbon along the carved bed, from the spring pool to
 * the waterfall lip. The ribbon is wider than the channel; wherever the ground rises
 * above the water surface the fragment is dropped, so the waterline follows the banks
 * exactly. Flow speed and white water follow the steepness of the bed.
 */
export class River {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;

  constructor() {
    // Start a little upstream of the spring's centre so the water fills the whole pool.
    const [sj_p0, sj_p1] = sj_riverCourse.points as [RiverPoint, RiverPoint];
    const sj_back = Math.hypot(sj_p0.x - sj_p1.x, sj_p0.z - sj_p1.z) || 1;
    const sj_pre: RiverPoint = {
      ...sj_p0,
      x: sj_p0.x + ((sj_p0.x - sj_p1.x) / sj_back) * 3.4,
      z: sj_p0.z + ((sj_p0.z - sj_p1.z) / sj_back) * 3.4,
      s: -3.4,
    };
    const sj_pts = [sj_pre, ...sj_riverCourse.points];
    const sj_n = sj_pts.length;
    const sj_pos = new Float32Array(sj_n * 2 * 3);
    const sj_uv = new Float32Array(sj_n * 2 * 2);
    const sj_slope = new Float32Array(sj_n * 2);
    const sj_index: number[] = [];
    for (let sj_i = 0; sj_i < sj_n; sj_i++) {
      const sj_p = sj_pts[sj_i]!;
      const sj_a = sj_pts[Math.max(0, sj_i - 1)]!;
      const sj_b = sj_pts[Math.min(sj_n - 1, sj_i + 1)]!;
      let sj_tx = sj_b.x - sj_a.x;
      let sj_tz = sj_b.z - sj_a.z;
      const sj_tl = Math.hypot(sj_tx, sj_tz) || 1;
      sj_tx /= sj_tl;
      sj_tz /= sj_tl;
      const sj_drop = Math.max(0, (sj_a.bed - sj_b.bed) / Math.max(0.01, sj_b.s - sj_a.s));
      // wide at the spring so the whole pool is covered, then a little wider than the bed
      const sj_spring = Math.min(1, Math.max(0, 1 - sj_p.s / 3.5));
      const sj_half = sj_p.halfWidth + 1.3 + sj_spring * 3.2;
      const sj_y = sj_p.bed + sj_RIVER_DEPTH;
      for (const sj_side of [-1, 1]) {
        const sj_k = sj_i * 2 + (sj_side > 0 ? 1 : 0);
        sj_pos[sj_k * 3] = sj_p.x - sj_tz * sj_half * sj_side;
        sj_pos[sj_k * 3 + 1] = sj_y;
        sj_pos[sj_k * 3 + 2] = sj_p.z + sj_tx * sj_half * sj_side;
        sj_uv[sj_k * 2] = sj_side > 0 ? 1 : 0;
        sj_uv[sj_k * 2 + 1] = sj_p.s;
        sj_slope[sj_k] = sj_drop;
      }
      if (sj_i < sj_n - 1) {
        const sj_k = sj_i * 2;
        sj_index.push(sj_k, sj_k + 2, sj_k + 1, sj_k + 1, sj_k + 2, sj_k + 3);
      }
    }
    const sj_geo = new BufferGeometry();
    sj_geo.setAttribute('position', new BufferAttribute(sj_pos, 3));
    sj_geo.setAttribute('uv', new BufferAttribute(sj_uv, 2));
    sj_geo.setAttribute('aSlope', new BufferAttribute(sj_slope, 1));
    sj_geo.setIndex(sj_index);
    sj_geo.computeBoundingSphere();

    const sj_material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uShallow: { value: new Color('#86ccb6') },
          uDeep: { value: new Color('#2d7468') },
          uFoam: { value: new Color('#f6f4ec') },
          uZenith: { value: sj_ATMOSPHERE.skyZenith },
          uSunColor: { value: sj_ATMOSPHERE.sunColor },
          uLength: { value: sj_riverCourse.length },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute float aSlope;
        varying vec3 vWorld;
        varying vec2 vUv;
        varying float vSlope;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vSlope = aSlope;
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
        uniform float uLength;
        varying vec3 vWorld;
        varying vec2 vUv;
        varying float vSlope;
        ${sj_NOISE_GLSL}
        ${sj_TERRAIN_GLSL}
        #include <fog_pars_fragment>

        void main() {
          float depth = vWorld.y - terrainHeightAt(vWorld.xz);
          if (depth < -0.01) discard;
          float along = vUv.y;
          float steep = clamp(vSlope * 1.6, 0.0, 1.0);
          float speed = mix(0.9, 3.2, steep);
          // Flow: noise stretched along the stream and carried downstream.
          vec2 fp = vec2(vUv.x * 5.0, along * 0.9 - uTime * speed);
          float streak = fbm(fp * vec2(1.0, 0.55));
          float ripple = vnoise(vec2(vUv.x * 11.0, along * 3.0 - uTime * speed * 2.2));
          vec2 g = vec2(streak - 0.5, ripple - 0.5) * mix(0.22, 0.7, steep);
          vec3 n = normalize(vec3(g.x * 0.6, 1.0, g.y * 0.6));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 R = reflect(-V, n);
          R.y = abs(R.y);
          vec3 sky = mix(hazeColor(R), uZenith, smoothstep(0.05, 0.6, R.y));
          vec3 body = mix(uShallow, uDeep, smoothstep(0.02, 0.6, depth));
          // a stream mostly shows its bed and colour; only a little sky
          vec3 col = mix(body, sky * 0.9, fres * 0.35);
          float spec = pow(max(dot(R, uSunDir), 0.0), 180.0);
          col += uSunColor * spec * 5.0;

          // White water: along the banks, over steep runs and just before the lip.
          float bank = (1.0 - smoothstep(0.02, 0.09, depth)) * smoothstep(0.35, 0.75, ripple);
          float rapids = steep * smoothstep(0.55, 0.85, streak + ripple * 0.3);
          float lip = smoothstep(uLength - 1.4, uLength, along) * smoothstep(0.45, 0.75, streak + 0.15);
          float foam = clamp(bank * 0.8 + rapids + lip * 0.7, 0.0, 1.0);
          col = mix(col, uFoam, foam);

          float alpha = mix(0.55, 0.9, smoothstep(0.02, 0.5, depth));
          alpha = max(alpha, max(fres * 0.9, foam));
          alpha *= smoothstep(-0.01, 0.03, depth);
          // never draw water over thin air (where the ground drops away past the lip)
          alpha *= 1.0 - smoothstep(0.95, 1.6, depth);
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }
      `,
    });
    Object.assign(sj_material.uniforms, {
      uTime: sj_globalUniforms.uTime,
      uSunDir: sj_globalUniforms.uSunDir,
      uHeightMap: sj_globalUniforms.uHeightMap,
      uMaskMap: sj_globalUniforms.uMaskMap,
      uTerrain: sj_globalUniforms.uTerrain,
    });
    this.mesh = new Mesh(sj_geo, sj_material);
    this.mesh.name = 'river';
    this.mesh.renderOrder = 1;
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }
}
