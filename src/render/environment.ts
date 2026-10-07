import {
  BackSide,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { sj_ATMOSPHERE, sj_SUN_DIRECTION } from './atmosphere';

/**
 * A soft golden-hour sky (blue zenith, warm horizon, sun glow, green-brown ground),
 * prefiltered once for image-based reflections: it gives lacquer, glazed roof tiles,
 * gilding and bronze something to reflect.
 */
export function createSkyEnvironment(sj_renderer: WebGLRenderer): Texture {
  const sj_scene = new Scene();
  const sj_geometry = new SphereGeometry(10, 48, 24);
  const sj_material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: sj_ATMOSPHERE.skyZenith },
      uMid: { value: sj_ATMOSPHERE.skyMid },
      uHorizon: { value: sj_ATMOSPHERE.skyHorizon },
      uGround: { value: sj_ATMOSPHERE.hemiGround },
      uSunGlow: { value: sj_ATMOSPHERE.sunGlow },
      uSunColor: { value: sj_ATMOSPHERE.sunColor },
      uSunDir: { value: sj_SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunGlow;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.22, y));
        sky = mix(sky, uZenith, smoothstep(0.18, 0.85, y));
        vec3 ground = mix(uHorizon * 0.7, uGround * 0.55, smoothstep(0.0, -0.35, y));
        vec3 col = y > 0.0 ? sky : ground;
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunGlow * pow(s, 8.0) * 0.6 + uSunColor * pow(s, 300.0) * 12.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  sj_scene.add(new Mesh(sj_geometry, sj_material));
  const sj_pmrem = new PMREMGenerator(sj_renderer);
  const sj_target = sj_pmrem.fromScene(sj_scene, 0, 0.1, 100);
  sj_pmrem.dispose();
  sj_geometry.dispose();
  sj_material.dispose();
  return sj_target.texture;
}
