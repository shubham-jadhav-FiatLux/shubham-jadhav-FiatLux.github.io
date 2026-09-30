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
import { globalUniforms } from '../../render/uniforms';
import { NOISE_GLSL, TERRAIN_GLSL } from '../../render/glsl';
import { ATMOSPHERE } from '../../render/atmosphere';
import { RIVER_DEPTH, riverCourse } from '../heightfield';

/**
 * The stream on the plateau: one ribbon along the carved bed, from the spring pool to
 * the waterfall lip. The ribbon is wider than the channel; wherever the ground rises
 * above the water surface the fragment is dropped, so the waterline follows the banks
 * exactly. Flow speed and white water follow the steepness of the bed.
 */
export class River {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;

  constructor() {
    const pts = riverCourse.points;
    const n = pts.length;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const slope = new Float32Array(n * 2);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(n - 1, i + 1)]!;
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const drop = Math.max(0, (a.bed - b.bed) / Math.max(0.01, b.s - a.s));
      // wide at the spring so the whole pool is covered, then a little wider than the bed
      const spring = Math.max(0, 1 - p.s / 3.5);
      const half = p.halfWidth + 1.3 + spring * 3.2;
      const y = p.bed + RIVER_DEPTH;
      for (const side of [-1, 1]) {
        const k = i * 2 + (side > 0 ? 1 : 0);
        pos[k * 3] = p.x - tz * half * side;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = p.z + tx * half * side;
        uv[k * 2] = side > 0 ? 1 : 0;
        uv[k * 2 + 1] = p.s;
        slope[k] = drop;
      }
      if (i < n - 1) {
        const k = i * 2;
        index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setAttribute('aSlope', new BufferAttribute(slope, 1));
    geo.setIndex(index);
    geo.computeBoundingSphere();

    const material = new ShaderMaterial({
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
          uZenith: { value: ATMOSPHERE.skyZenith },
          uSunColor: { value: ATMOSPHERE.sunColor },
          uLength: { value: riverCourse.length },
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
        ${NOISE_GLSL}
        ${TERRAIN_GLSL}
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
      uTerrain: globalUniforms.uTerrain,
    });
    this.mesh = new Mesh(geo, material);
    this.mesh.name = 'river';
    this.mesh.renderOrder = 1;
  }

  addTo(scene: Scene): void {
    scene.add(this.mesh);
  }
}
