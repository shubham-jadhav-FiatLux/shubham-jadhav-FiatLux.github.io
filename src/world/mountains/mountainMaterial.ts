import { Color, ShaderMaterial, Vector2 } from 'three';
import { sj_ATMOSPHERE } from '../../render/atmosphere';
import { sj_globalUniforms } from '../../render/uniforms';
import { sj_BUMP_GLSL, sj_NOISE3_GLSL, sj_NOISE_GLSL } from '../../render/glsl';
import { hazeGLSL } from '../../render/fog';

export interface MountainLook {
  /** aerial perspective: 1 / metres (higher = paler sooner) */
  hazeDensity: number;
  /** haze that is always there, however close (0..1) */
  hazeMin: number;
  /** mist rises from y = mist.x (thick) to mist.y (clear) */
  mist: Vector2;
  /** surface detail: bumps, streaks and clumps of trees (off on low quality) */
  detail: boolean;
}

/** Colours of the peaks before light and haze. */
export const sj_MOUNTAIN_COLORS = {
  rockLight: new Color('#7d796f'),
  rockDark: new Color('#43423f'),
  vegLight: new Color('#4f8634'),
  vegDark: new Color('#163b26'),
  /** light from the sky on shaded faces */
  skyLight: new Color('#8ea6c8'),
  /** warm light bounced up from the valley */
  bounce: new Color('#7d7c5a'),
  /** the mist the peaks rise out of */
  mist: new Color('#f4ece2'),
};

/**
 * Painterly mountains: golden sunlit rock and dark tree cover, cool shadows, a glowing rim
 * on edges against the sun, aerial perspective that turns each range paler and closer to
 * the colour of the sky, and mist at the foot so the peaks rise out of the clouds.
 * Uses the same haze colour as the sky and the fog, so distant ranges melt into the horizon.
 */
export function createMountainMaterial(sj_look: MountainLook): ShaderMaterial {
  const sj_c = sj_MOUNTAIN_COLORS;
  return new ShaderMaterial({
    name: 'mountains',
    fog: false,
    defines: sj_look.detail ? { DETAIL: 1 } : {},
    uniforms: {
      uTime: sj_globalUniforms.uTime,
      uSunDir: sj_globalUniforms.uSunDir,
      uSunColor: { value: sj_ATMOSPHERE.sunColor.clone().multiplyScalar(1.6) },
      uSkyLight: { value: sj_c.skyLight },
      uBounce: { value: sj_c.bounce },
      uRockLight: { value: sj_c.rockLight },
      uRockDark: { value: sj_c.rockDark },
      uVegLight: { value: sj_c.vegLight },
      uVegDark: { value: sj_c.vegDark },
      uMistColor: { value: sj_c.mist },
      uFog: { value: sj_ATMOSPHERE.fogColor },
      uHaze: { value: new Vector2(sj_look.hazeDensity, sj_look.hazeMin) },
      uMist: { value: sj_look.mist },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aInfo;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vInfo;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vInfo = aInfo;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyLight;
      uniform vec3 uBounce;
      uniform vec3 uRockLight;
      uniform vec3 uRockDark;
      uniform vec3 uVegLight;
      uniform vec3 uVegDark;
      uniform vec3 uMistColor;
      uniform vec3 uFog;
      uniform vec2 uHaze; // density, minimum
      uniform vec2 uMist;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vInfo;
      ${sj_NOISE_GLSL}
      ${sj_NOISE3_GLSL}
      ${sj_BUMP_GLSL}
      ${hazeGLSL('uFog')}

      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        vec3 Ng = normalize(vNormalW);
        vec3 N = Ng;
        vec3 p = vWorld;

        // Rain-cut flutes run down the faces, strata cross them, and the rock breaks into
        // big lumpy masses.
        float flute = vnoise3(vec3(p.x * 0.11, p.y * 0.016, p.z * 0.11));
        float strata = vnoise3(vec3(p.x * 0.02, p.y * 0.12, p.z * 0.02));
        float crag = fbm3(p * 0.03);
        #ifdef DETAIL
          float relief = crag * 2.6 + flute * 1.2 + strata * 0.6;
          vec3 nView = normalize((viewMatrix * vec4(Ng, 0.0)).xyz);
          vec3 posView = (viewMatrix * vec4(vWorld, 1.0)).xyz;
          nView = bumpFromHeight(posView, nView, relief);
          N = normalize((vec4(nView, 0.0) * viewMatrix).xyz);
        #endif

        // Woods and scrub cling wherever they can (the more so on lush kinds of peak) and
        // crown the tops; rain-cut streaks of bare rock run down the cliffs.
        float veg = min(vInfo.z, 1.0);
        float lush = Ng.y + (crag - 0.5) * 0.9;
        float cover = smoothstep(0.55 - veg * 0.85, 0.9 - veg * 0.6, lush);
        cover = max(cover, smoothstep(0.7, 0.88, vInfo.y + (crag - 0.5) * 0.3) * veg);
        cover *= smoothstep(0.1, 0.38, flute + Ng.y * 0.5);
        #ifdef DETAIL
          float clumps = vnoise(p.xz * 0.16 + p.y * 0.07);
          cover *= smoothstep(0.0, 0.4, clumps + cover * 0.6);
        #endif
        cover = vInfo.z > 1.5 ? 1.0 : cover;

        // Rock and woods stay close in value, so each range reads as one mass of colour.
        // Streaks: the flutes, sharpened into the dark lines that run down the cliffs.
        float streak = 1.0 - abs(2.0 * flute - 1.0);
        vec3 rock = mix(uRockDark, uRockLight, smoothstep(0.25, 0.85, streak));
        rock *= 0.85 + 0.3 * strata;
        rock = mix(rock, rock * vec3(1.06, 0.96, 0.86), vInfo.x);
        vec3 green = mix(uVegDark, uVegLight, smoothstep(0.3, 0.8, crag));
        green *= 0.82 + 0.36 * vnoise(p.xz * 0.012 + p.y * 0.01);
        vec3 albedo = mix(rock, green, cover);

        // Crevices and the foot of the peak see less sky.
        float ao = mix(0.6, 1.0, smoothstep(0.1, 0.55, flute));
        ao *= mix(0.75, 1.0, smoothstep(0.0, 0.4, vInfo.y));

        // Low golden sun with a soft, painterly terminator; cool sky light in the shade.
        float ndl = dot(N, uSunDir);
        float sun = smoothstep(-0.35, 0.85, ndl);
        vec3 ambient = mix(uBounce, uSkyLight, N.y * 0.5 + 0.5);
        vec3 col = albedo * (uSunColor * sun + ambient * 0.55 * ao);

        // Edges against the sun glow.
        float edge = pow(1.0 - max(dot(Ng, V), 0.0), 5.0);
        float towardSun = pow(max(dot(-V, uSunDir), 0.0), 2.0);
        col += uSunColor * edge * towardSun * 0.35;

        // Aerial perspective: each range paler and closer to the sky than the one before.
        vec3 dir = -V;
        vec3 haze = hazeColor(dir);
        float h = uHaze.y + (1.0 - uHaze.y) * (1.0 - exp(-dist * uHaze.x));
        col = mix(col, haze, h);

        // Mist at the foot, drifting.
        vec2 drift = vec2(uTime * 0.006, -uTime * 0.004);
        float m = fbm(vWorld.xz * 0.006 + drift) - 0.5;
        float span = uMist.y - uMist.x;
        float mist = 1.0 - smoothstep(uMist.x, uMist.y, vWorld.y + m * span * 0.9);
        vec3 mistCol = mix(haze, uMistColor, 0.5);
        col = mix(col, mistCol, mist * mist * (3.0 - 2.0 * mist));

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
