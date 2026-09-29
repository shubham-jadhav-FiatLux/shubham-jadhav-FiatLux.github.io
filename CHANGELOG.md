# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Added

- Project scaffold: Vite, TypeScript, three.js, ESLint, Prettier, Vitest.
- CI workflow (typecheck, lint, format, test, build) and GitHub Pages deployment.
- Design document and roadmap.
