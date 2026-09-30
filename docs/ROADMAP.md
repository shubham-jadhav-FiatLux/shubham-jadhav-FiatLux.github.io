# Roadmap

Versions follow [Semantic Versioning](https://semver.org). While the project is below
`1.0.0`, minor versions add features and may change content formats.

## Milestones

| Version | Theme                                                                                    | Status       |
| ------- | ---------------------------------------------------------------------------------------- | ------------ |
| 0.1.0   | Engine core, terrain, sky, the panda walking around                                      | ✅ released  |
| 0.2.0   | Living nature: grass, bamboo, blossom trees, rocks, lake, waterfall                      | ✅ released  |
| 0.3.0   | Architecture and landmarks: gate, pagoda, pavilion, village, bridge, bell, training yard | ✅ released  |
| 0.4.0   | Portfolio zones and scrolls, discovery moments, map with quick travel, procedural audio  | ✅ released  |
| 0.5.0   | Polish: accessibility, reduced motion, SEO and sharing, performance, mobile              | ✅ released  |
| 0.6.0   | Visual update: waterfall and stream, stone, wood and bamboo detail, lantern light, life  | ✅ released  |
| 1.0.0   | Real content filled in, tested on phones, custom domain                                  | ⏳ your turn |

## Ideas for later

- **Day / night cycle** – the lanterns already cast warm light; add fireflies and crickets
  at night, stars and moon.
- **Level of detail** – simpler bamboo and tree variants far from the camera, instanced
  halos as quads (point sprites are capped in size on some GPUs).
- **Weather** – light rain with ripples on the lake and a rainbow afterwards.
- **Painting mode** – a Kuwahara post-process that turns the valley into an oil painting (key `P`).
- **Photo mode** – free camera, hide HUD, depth of field, save a screenshot.
- **Achievements** – "Ring the bell 3 times", "Swim with the koi", "Meditate under the old tree".
- **Guest book** – visitors leave a paper lantern with a short message (needs a tiny backend).
- **Multiplayer ghosts** – see other visitors as translucent pandas (WebSocket).
- **WebGPU renderer** – port shaders to TSL and use compute for grass and particles.
- **Localisation** – content file per language (English / 中文 / हिन्दी …).
- **Blender pipeline** – optional hand-modelled hero assets with baked lighting (glTF + Draco/Meshopt).
