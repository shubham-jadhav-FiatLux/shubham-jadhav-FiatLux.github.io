import { Uniform, Vector3 } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

const fragmentShader = /* glsl */ `
uniform float uSaturation;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uContrast;
uniform float uGrain;
uniform float uTime;

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  // Lift shadows towards a soft violet and warm the highlights (painterly split tone).
  c = c * uGain + uLift * (1.0 - c);
  // Gentle S-curve around mid grey.
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  // Saturation in luma space.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  // Very light paper grain so gradients do not band.
  float g = grainHash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
  c += g * uGrain;
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

/** Final colour grade: split toning, contrast, saturation and a whisper of grain. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uSaturation', new Uniform(1.12)],
        ['uLift', new Uniform(new Vector3(0.018, 0.012, 0.03))],
        ['uGain', new Uniform(new Vector3(1.02, 1.0, 0.97))],
        ['uContrast', new Uniform(0.12)],
        ['uGrain', new Uniform(0.012)],
        ['uTime', new Uniform(0)],
      ]),
    });
  }

  override update(): void {
    const t = this.uniforms.get('uTime')!;
    t.value = (t.value as number) + 0.016;
  }
}
