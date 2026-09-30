# Design document — Valley of Whispering Bamboo 竹

> A portfolio you can walk through. Guide a panda through a misty valley of bamboo,
> blossoms and pagodas; every landmark holds a scroll with a piece of the author's story.

This document is the source of truth for the creative direction and the technical shape
of the project. Update it when a decision changes.

---

## 1. Pillars

1. **Explore, don't scroll.** Information is discovered by walking to places, not by
   reading a page. Every section of the portfolio has a physical landmark.
2. **Warm, painterly, alive.** Golden-hour light, drifting mist, grass and bamboo that
   move with the wind, petals in the air, water that sparkles. Nothing is static.
3. **Delight in every input.** Every key press produces motion _and_ sound. Discovering a
   scroll is a small celebration.
4. **Respect the visitor's time.** A recruiter can open the map and jump straight to
   _Projects_, or switch to the plain "read as page" view at any time.
5. **Built like a product.** Typed, tested, versioned, documented and deployable by CI.

## 2. Art direction

The look is inspired by classical Chinese _shan shui_ (mountain–water) landscape painting
and warm animated films: layered karst peaks fading into haze, soft volumetric light,
saturated but gentle colours, and rounded, friendly shapes.

| Element      | Palette                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Sky          | zenith `#8cb6d8` → horizon peach `#f6d7a7`, sun glow `#ffcf8a`                                               |
| Haze / fog   | warm `#e9cfa8`, distant mountains cool lavender `#9aa8c4`                                                    |
| Grass        | base `#3f6b2a` → mid `#6f9a3a` → sunlit tip `#b7c95a`                                                        |
| Paths        | dirt `#b89468`, shore sand `#cdb58c`                                                                         |
| Blossoms     | `#f6b7c8`, `#f19bb4`, `#fbd3dd`, bark `#5b3d2e`                                                              |
| Bamboo       | `#7ea449`, `#5d8a3a`, nodes `#4a6b2c`                                                                        |
| Architecture | vermilion pillars `#b0322a`, slate tiles `#3d4a57`, glazed teal `#2f7d74`, gold `#d8a93b`, plaster `#efe4cf` |
| Water        | shallow `#6fc3b8` → deep `#1f5d6b`, foam `#f4f1e6`                                                           |
| UI           | rice paper `#f3ead6`, ink `#1e1a18`, seal red `#b8352b`                                                      |

Typography: **Ma Shan Zheng** (brush, subset to the glyphs we use) for titles and seals,
**Cormorant Garamond** for sub-headings, **Lora** for body copy.

All geometry, textures and audio are generated in code. There are no downloaded models,
images or sound files, which keeps the build tiny and the licensing simple.

## 3. The valley (world layout)

Units are metres. `x` points east, `z` points south, the camera starts south of the
panda looking north. Water level is `y = 0`.

```
                 N (-z)
      ┌──────────────────────────────────────┐
      │        Pagoda hill 作            waterfall   │
      │        (projects banner walk)   + bell 信     │
      │                 ╲                  ╱         │
      │  bamboo           ╲    LAKE   zig-zag        │
      │  grove             ╲  (koi,   bridge 路      │
      │  Training 技      crossroads lotus)          │
      │  grounds          (old tree) pavilion 我     │
      │                        │         village     │
      │                   Gate 迎                    │
      │                     spawn                    │
      └──────────────────────────────────────┘
                 S (+z)
```

| Landmark                          | Section  | Interaction                                                    |
| --------------------------------- | -------- | -------------------------------------------------------------- |
| Stone gate (迎)                   | Welcome  | Title board, controls, first scroll                            |
| Tea pavilion over the lake (我)   | About me | Bio scroll                                                     |
| Training grounds (技)             | Skills   | Strike wooden dummies to reveal skills; hop the training posts |
| Zig-zag bridge (路)               | Journey  | Each turn of the bridge is a milestone                         |
| Banner walk to the pagoda (作)    | Projects | One fluttering banner per project, with links                  |
| Bronze bell by the waterfall (信) | Contact  | Strike the bell: sky lanterns rise, contact scroll opens       |

The world is **content driven**: the number of project banners, skill dummies and bridge
milestones follows `src/content/portfolio.ts`.

## 4. The panda

An original character: a round, soft panda with a red scarf and a small scroll case on its
back. Built procedurally from primitives in a transform hierarchy and animated
procedurally (no skeleton needed):

| State      | Input                               | Motion                                                                        | Sound                                                  |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Idle       | —                                   | breathing, blinking, ear twitches, looks at nearby landmarks                  | —                                                      |
| Walk / run | WASD / arrows / stick, Shift to run | waddling gait driven by distance travelled (no foot sliding), lean into turns | footsteps per surface: grass, dirt, stone, wood, water |
| Jump       | Space                               | anticipation squash → stretch → landing squash + dust                         | hop whoosh, soft thud                                  |
| Strike     | F / tap button                      | spinning palm strike, grass shock-wave, petals                                | whoosh (+ wood thwack on dummies, gong on the bell)    |
| Swim       | walk into deep water                | floats, paddles, ripples                                                      | splashes                                               |
| Meditate   | idle for 12 s                       | sits cross-legged, floating petals                                            | soft chime                                             |
| Bow        | discovering a scroll                | fist-and-palm salute                                                          | discovery sting                                        |

The scarf ends are simulated with a small Verlet chain, so they trail and flutter.
Grass bends away from the panda (its position is a shader uniform).

## 5. The discovery moment

The signature moment when a scroll is found:

1. The panda stops and bows.
2. A golden ink ripple expands across the ground; petals burst upward.
3. Audio: an airy whoosh, an ascending pentatonic zither glissando and a soft gong.
4. The landmark's seal (e.g. 技) is stamped in red onto the progress bar.
5. The camera eases into a framed shot and the scroll unrolls with the content.

## 6. Sound

Everything is synthesised with the Web Audio API at runtime:

- **Music**: generative, pentatonic. Plucked zither voices (Karplus–Strong with pitch
  bends), a breathy bamboo flute, a low drone and temple percussion, through a
  procedurally generated convolution reverb. It never loops the same way twice.
- **Ambience**: wind (filtered noise with gusts), birdsong (FM chirps, panned), water
  lapping near the lake, the waterfall roar, wind bells near the pagoda.
- **Effects**: footsteps per surface, jump/land, strike whoosh, wood thwack, splash,
  gong, scroll open/close, UI ticks.

Audio starts only after the visitor presses _Begin_ (browser autoplay rules) and can be
muted at any time (`N`); the music has its own toggle.

## 7. Technology

| Concern              | Choice                        | Why                                                                                                              |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Language             | TypeScript (strict)           | Safety and editor help as the project grows                                                                      |
| Bundler / dev server | Vite                          | Instant HMR, tiny config, static output                                                                          |
| 3D                   | three.js (WebGL 2)            | Mature, huge community; custom GLSL via `ShaderMaterial` / `onBeforeCompile` maps directly onto OpenGL knowledge |
| Post-processing      | `postprocessing` (pmndrs)     | Merges effects into few passes: bloom, tone mapping, grading, vignette; MSAA on the scene target                 |
| Physics              | Custom kinematic controller   | Heightfield ground + circle/box colliders + walkable platforms: deterministic, tiny, easy to tune                |
| Audio                | Web Audio API                 | Procedural, no files, full control                                                                               |
| Tests                | Vitest                        | Pure logic (heightfield, collisions, content validation) is unit-tested                                          |
| CI/CD                | GitHub Actions → GitHub Pages | Every push to `main` is checked and deployed                                                                     |

WebGPU + TSL is on the roadmap once the WebGL version is feature complete; three.js'
`WebGPURenderer` falls back to WebGL 2, so the port can happen incrementally.

## 8. Architecture

```
src/
  main.ts                 boot: WebGL check, loader, App, audio, Game
  app/App.ts              owns renderer, scene, loop and all world systems
  app/Game.ts             gameplay layer: zones, discovery, panels, map, sound cues
  core/                   loop timing, events, input, quality tiers, storage, debug GUI
  render/                 renderer, post-processing, shared uniforms, shader chunks
  world/                  terrain, sky, mountains, grass, trees, water, architecture...
  player/                 panda model, procedural animator, character controller
  camera/                 follow camera and cinematic shots
  effects/                particles, discovery ceremony, sky lanterns
  zones/                  interactive spots, discovery progress, beacons
  audio/                  audio engine, instruments, music, SFX, ambience
  ui/                     loader, HUD, scroll panel, map, menu, touch controls, page view
  content/portfolio.ts    ← all personal content lives here
tools/portfolio-html.ts   build step: meta tags, link previews, <noscript> page copy
```

`App` knows nothing about the portfolio sections: `Game` registers itself as a per-frame
updater and talks to the world through a few hooks (anchors, `ringBell`, `pulseBloom`,
`shake`, the `uRipple` uniform).

Update order per frame: input → controller (fixed 60 Hz sub-steps) → animation →
camera → world uniforms → gameplay (zones, effects, map, audio) → render.

## 9. Performance budget

Target 60 fps on a mid-range laptop (integrated GPU) at the _Medium_ preset.

| Preset | Pixel ratio | Shadows | Grass blades | MSAA | Post FX                         |
| ------ | ----------- | ------- | ------------ | ---- | ------------------------------- |
| Low    | 1.0         | off     | 14k          | off  | tone mapping, grading, vignette |
| Medium | ≤ 1.5       | 1024²   | 36k          | 2×   | + bloom                         |
| High   | ≤ 2.0       | 2048²   | 70k          | 4×   | + bloom                         |

The whole valley renders in roughly 170 draw calls: static architecture is merged per
material, vegetation is instanced and the grass is a single instanced draw.

The preset is chosen automatically (mobile → Low, otherwise Medium) and adapts down if
the frame rate stays low. Visitors can override it from the settings menu.

## 10. Accessibility and reach

- "Read as page" view with the complete content as semantic HTML (also the fallback when
  WebGL 2 is unavailable). The same markup is written into a `<noscript>` block at build
  time, so visitors without JavaScript, search engines and link unfurlers get it too.
- Open Graph and Twitter card tags with a rendered preview image for shared links.
- Full keyboard play, touch joystick on phones, gamepad support; the help shows the
  controls of the device in hand.
- Dialogs trap focus and release it on close; the page view makes everything behind it
  inert.
- Respects `prefers-reduced-motion` (no camera shake, instant camera moves, no UI
  animation).
- Mute toggle and separate music toggle.
