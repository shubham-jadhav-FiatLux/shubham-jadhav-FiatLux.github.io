import { Color, MeshStandardMaterial, type ColorRepresentation } from 'three';

/**
 * Soft, slightly fuzzy material for the panda: standard PBR plus a warm rim light that
 * reads as fur catching the golden-hour sun.
 */
export function createFurMaterial(
  sj_color: ColorRepresentation,
  sj_options: { rim?: number; rimColor?: ColorRepresentation; roughness?: number } = {},
): MeshStandardMaterial {
  const sj_mat = new MeshStandardMaterial({
    color: sj_color,
    roughness: sj_options.roughness ?? 0.88,
    metalness: 0,
  });
  const sj_rimColor = new Color(sj_options.rimColor ?? '#ffd9a8');
  const sj_rim = sj_options.rim ?? 0.35;
  sj_mat.onBeforeCompile = (sj_shader) => {
    sj_shader.uniforms.uRimColor = { value: sj_rimColor };
    sj_shader.uniforms.uRimStrength = { value: sj_rim };
    sj_shader.fragmentShader = sj_shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          float fres = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          outgoingLight += uRimColor * pow(fres, 3.0) * uRimStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  sj_mat.customProgramCacheKey = () => `fur-${sj_rim.toFixed(2)}`;
  return sj_mat;
}
