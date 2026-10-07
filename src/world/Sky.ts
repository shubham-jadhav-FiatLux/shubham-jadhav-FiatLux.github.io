import { BackSide, Mesh, ShaderMaterial, SphereGeometry, type Scene } from 'three';
import { sj_ATMOSPHERE } from '../render/atmosphere';
import { sj_globalUniforms } from '../render/uniforms';
import { sj_NOISE_GLSL } from '../render/glsl';
import { hazeGLSL } from '../render/fog';

/**
 * Painted golden-hour sky dome: vertical gradient, sun glow and disc, and soft
 * brush-stroke clouds drifting slowly. The horizon colour matches the fog colour so
 * mountains dissolve into the sky.
 */
export class Sky {
  readonly mesh: Mesh;

  constructor() {
    const sj_material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: sj_globalUniforms.uTime,
        uSunDir: sj_globalUniforms.uSunDir,
        uZenith: { value: sj_ATMOSPHERE.skyZenith },
        uMid: { value: sj_ATMOSPHERE.skyMid },
        uHorizon: { value: sj_ATMOSPHERE.skyHorizon },
        uHorizonCool: { value: sj_ATMOSPHERE.skyHorizonCool },
        uFog: { value: sj_ATMOSPHERE.fogColor },
        uSunGlow: { value: sj_ATMOSPHERE.sunGlow },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // always at the far plane
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uHorizonCool;
        uniform vec3 uFog;
        uniform vec3 uSunGlow;
        varying vec3 vDir;
        ${sj_NOISE_GLSL}
        ${hazeGLSL('uFog')}
        void main() {
          vec3 dir = normalize(vDir);
          float y = dir.y;
          float sunAmt = max(dot(dir, uSunDir), 0.0);

          // Gradient: haze band at the horizon (same colour as the fog) → peach/lilac → blue.
          vec2 d2 = normalize(dir.xz + vec2(1e-5));
          float toSun = pow(0.5 + 0.5 * dot(d2, normalize(uSunDir.xz)), 2.0);
          vec3 horizon = mix(uHorizonCool, uHorizon, toSun);
          vec3 col = mix(horizon, uMid, smoothstep(0.03, 0.3, y));
          col = mix(col, uZenith, smoothstep(0.25, 0.9, y));
          col = mix(hazeColor(dir), col, smoothstep(-0.02, 0.09, y));
          // Warm the whole sky on the sun side.
          col = mix(col, uSunGlow, pow(sunAmt, 3.0) * 0.35 * (1.0 - smoothstep(0.0, 0.6, y)));

          // Painted clouds on a curved plane.
          vec2 uv = dir.xz / (y + 0.18);
          vec2 drift = vec2(uTime * 0.004, uTime * 0.0015);
          float n = fbm(uv * 1.1 + drift);
          n += 0.5 * fbm(uv * 3.2 - drift * 2.0) - 0.25;
          float cloud = smoothstep(0.5, 0.78, n) * smoothstep(0.02, 0.22, y) * (1.0 - smoothstep(0.55, 0.9, y));
          float lit = 0.55 + 0.45 * pow(sunAmt, 2.0);
          vec3 cloudCol = mix(vec3(0.82, 0.74, 0.78), vec3(1.25, 1.05, 0.88), lit);
          col = mix(col, cloudCol * mix(1.0, 1.15, pow(sunAmt, 6.0)), cloud * 0.75);

          // Sun glow and disc (HDR so bloom picks it up).
          col += uSunGlow * (pow(sunAmt, 12.0) * 0.55 + pow(sunAmt, 90.0) * 1.2);
          col += vec3(3.2, 2.6, 1.9) * smoothstep(0.99955, 0.99985, sunAmt);

          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new Mesh(new SphereGeometry(1800, 48, 24), sj_material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    // Drawn after everything opaque: the dome sits at the far plane, so the depth test
    // skips every pixel already covered by the valley and the painted sky (clouds and
    // all) is only worked out where it can be seen.
    this.mesh.renderOrder = 10;
    this.mesh.matrixAutoUpdate = false;
  }

  addTo(sj_scene: Scene): void {
    sj_scene.add(this.mesh);
  }

  /** The dome follows the camera so it is always at "infinity". */
  update(sj_cameraPosition: { x: number; y: number; z: number }): void {
    this.mesh.position.set(sj_cameraPosition.x, sj_cameraPosition.y, sj_cameraPosition.z);
    this.mesh.updateMatrix();
  }
}
