# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Six portfolio scrolls tied to landmarks: Welcome (gate), About (tea pavilion), Skills
  (training dummies), Journey (bridge milestones), Projects (banners and pagoda) and
  Contact (bell tower). Walk up and press `E`, or strike a dummy with `F`.
- The discovery moment: the panda bows, a golden ink ring spreads over the ground and
  through the grass, petals burst, bloom swells, the camera frames the landmark, a seal
  is stamped on screen and the scroll unrolls. Progress is remembered between visits.
- Ringing the bell releases sky lanterns and shakes the camera.
- Scroll panel with tabs, hints and quick travel for scrolls not found yet, a project
  pager and copy-to-clipboard for the email address.
- Ink-wash map (`M`) painted from the terrain, with landmarks, found seals, the panda's
  position and quick travel.
- HUD: title, map, sound, music and menu buttons, interaction prompt, progress seals,
  controls hint and toasts. Menu with graphics quality, progress reset and credits.
- "Read as a page": the whole portfolio as a plain, accessible page, also used when
  WebGL 2 is unavailable.
- Touch controls: virtual joystick, jump, strike and interact buttons.
- Floating beacons over landmarks that still hide a scroll.
- Procedural audio (Web Audio API, no audio files): generative pentatonic music with
  zither, flute and bells; footsteps per surface, jumps, splashes, strikes, drum, bell and
  the discovery cue; wind, birds, lake and a positional waterfall.

### Changed

- The kung-fu strike is handled by the gameplay layer, so it can hit dummies, the drum
  and the bell.

## [0.3.0] - 2026-09-30

### Added

- Parametric Chinese roofs (hip and polygonal) with concave slopes, upturned corners,
  ridges and tile shading.
- Valley gate with a gilded signboard, a five-tier octagonal pagoda with wind bells, a
  hexagonal tea pavilion over the lake, village houses and a training hall.
- Zig-zag stone bridge with balustrades, piers and milestone lanterns.
- Bell tower with an animated bronze bell and a swinging log striker.
- Training grounds: wooden dummies that wobble when struck, plum-blossom posts to hop
  across, a weapon rack and a drum.
- Fluttering project banners (one texture atlas, one draw call) with scroll altars.
- Crossroads signpost, lantern strings, props and floating captions.

### Changed

- Static structures are merged into one mesh per material, so the whole village costs a
  handful of draw calls.

## [0.2.0] - 2026-09-29

### Added

- GPU grass: up to 70k wind-blown blades in one instanced draw call, placed on a world
  lattice that follows the panda, bending away from it and flattened by the spin kick.
- Wildflower drifts, falling blossom petals that land on the ground, golden dust motes.
- Procedural trees (blossom, broadleaf, layered pine, weeping willow) with canvas-painted
  canopy textures, spherical canopy normals, wind sway and backlit translucency.
- Bamboo groves with leaf sprays that sway and lean away from the panda.
- Weathered rocks with baked moss, escarpment boulders and scholar rocks.
- Distant forest on the valley rim, cliff strata shading.
- Stylised lake: depth-based colour, Fresnel sky reflection, sun glitter, animated shore
  foam and ripples from wading, swimming and jumping koi; lily pads and lotus flowers.
- Koi that wander, flee the panda and occasionally leap; a waterfall with foam and mist.
- Foliage between the camera and the panda dissolves (screen-door dither).
- Deterministic placement with Poisson-disk scattering; shade and bare patches baked into
  the terrain splat map.

### Changed

- The panda is baked into ~10 vertex-coloured meshes (was ~40) to cut draw calls.

## [0.1.0] - 2026-09-29

### Added

- Project scaffold: Vite, TypeScript, three.js, ESLint, Prettier, Vitest.
- CI workflow (typecheck, lint, format, test, build) and GitHub Pages deployment.
- Design document and roadmap.
- Render loop, unified input (keyboard, mouse, touch, gamepad), quality presets with
  adaptive resolution and a lazily loaded debug panel.
- WebGL 2 renderer with bloom, ACES tone mapping, colour grade and vignette.
- Atmospheric height fog patched into three.js shader chunks, shared with the sky.
- Heightfield terrain with lake basin, pagoda hill, waterfall cliff and valley rim, a
  painted splat map (paths, flagstones, sand, rock) and caustics under water.
- Golden-hour sky dome, karst mountain rings and mist bands.
- Procedural panda with procedural animation and Verlet scarf tails.
- Kinematic controller with platforms, obstacles, slopes, swimming and coyote time.
- Follow camera with orbit, zoom, look-ahead and cinematic shots.
- Title screen, screenshot script and unit tests.

[Unreleased]: https://github.com/OWNER/valley-of-whispering-bamboo/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/OWNER/valley-of-whispering-bamboo/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/OWNER/valley-of-whispering-bamboo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/OWNER/valley-of-whispering-bamboo/releases/tag/v0.1.0
