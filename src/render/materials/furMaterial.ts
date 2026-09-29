import { Color, MeshStandardMaterial, type ColorRepresentation } from 'three';

/**
 * Soft, slightly fuzzy material for the panda: standard PBR plus a warm rim light that
 * reads as fur catching the golden-hour sun.
 */
export function createFurMaterial(
  color: ColorRepresentation,
  options: { rim?: number; rimColor?: ColorRepresentation; roughness?: number } = {},
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.88,
    metalness: 0,
  });
  const rimColor = new Color(options.rimColor ?? '#ffd9a8');
  const rim = options.rim ?? 0.35;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: rim };
    shader.fragmentShader = shader.fragmentShader
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
  mat.customProgramCacheKey = () => `fur-${rim.toFixed(2)}`;
  return mat;
}
