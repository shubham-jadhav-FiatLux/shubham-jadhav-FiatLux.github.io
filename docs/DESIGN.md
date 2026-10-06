# Design document — Valley of Peace 和

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
| Bamboo       | green `#62883a` → `#9fbd5a`, golden `#c4a64c` with green grooves `#6c9340`, black `#2e2a2c`, nodes darker    |
| Architecture | vermilion pillars `#b0322a`, slate tiles `#3d4a57`, glazed teal `#2f7d74`, gold `#d8a93b`, plaster `#efe4cf` |
| Wood / stone | deck planks `#9a7250`, dark timber `#5a3a28`, dressed stone `#b3a893`, masonry `#8e8574`                     |
| Lamp light   | paper lanterns `#e0412b` glowing orange, stone lantern windows `#ffd9a0`, light pools `#ff9a45`              |
| Water        | shallow `#6fc3b8` → deep `#1f5d6b`, foam `#f4f1e6`                                                           |
| UI           | rice paper `#f3ead6`, ink `#1e1a18`, seal red `#b8352b`                                                      |

Typography: **Ma Shan Zheng** (brush, subset to the glyphs we use) for titles and seals,
**Cormorant Garamond** for sub-headings, **Lora** for body copy.

All geometry, textures and audio are generated in code. There are no downloaded models,
images or sound files, which keeps the build tiny and the licensing simple.

### Surfaces and light

- **Finishes.** Every building part is merged into one mesh per material, so the parts
  carry a per-vertex _finish_: lacquer (soft sheen, brush marks), wood (grain along the
  part's longest axis), stone (grain, speckles, moss on top) or gilding. The finish is
  implied by the palette colour (`architecture/palette.ts`) or named explicitly. All parts
  darken where they meet the ground and grow an algae line just above the lake.
- **Reflections.** A golden-hour sky is rendered once into a prefiltered environment map
  (`render/environment.ts`) for lacquer, glazed tiles, gold and the bronze bell only; the
  rest of the valley keeps its hand-tuned hemisphere light.
- **Stone.** Rocks are soft convex hulls cut by random planes (bevelled facets), with
  grooves, strata and moss in their vertex colours and grain, lichen, cracks and wet bases
  in the rock material. Cliffs are shaded in the terrain shader: strata, ledges, joints,
  seep stains and derivative bump mapping.
- **Edges between materials.** Paths and yards are looked up in the splat map with a
  meandering offset (`GROUND_WARP_GLSL`) shared by the ground, the grass and the flowers,
  so their ragged edges agree. Verges are trampled and dry; paths have a darker tread and
  pebbly margins; paving is laid stone by stone and frays at its edge; grass thins out
  onto the beach.
- **Lantern light.** Lanterns glow in their own colour with a flicker, halos are one
  additive point cloud, light pools are painted into the terrain's detail map (and read
  by the grass and the lake), and on High three real point lights follow the lanterns
  nearest the panda. The number of lights is fixed at start so a preset change never
  recompiles shaders.
- **Bamboo.** Culms are light tubes; node rings, the waxy bloom and the striped grooves of
  golden bamboo are drawn in the shader from an internode coordinate, so detail costs no
  triangles.

### Life

Koi and lotus in the lake, petals drifting from the blossom trees, golden motes in the
light, butterflies over the meadows near the panda (they flee when it comes close),
dragonflies over the water and a flock of birds circling high above. All of it is
instanced and animated in shaders, driven by a few dozen transforms per frame.

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

**Water.** A stream rises in a spring pool in the north-east hills and crosses the plateau
in a bed carved into the heightfield (it only ever runs downhill; a unit test checks it),
then pours over a notch in the cliff. The cliff steps back into a rock alcove there and
drops straight into a deep plunge pool joined to the lake, so the falls have a visible
source and land in water. The bridge crosses the lake on timber pile bents and stone
piers, each ringed with foam.

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
5. The camera eases into a framed shot. Once the bow and the golden light are over
   (2.4 s), the rolled scroll rises out of the panda like a genie from a lamp, a golden
   wisp swelling along a Bezier curve to the middle of the screen, and unrolls there.

### The tour

**Watch the tour** plays the valley as a short film (a little over five minutes) for
visitors who would rather sit back. It is the same world and the same gameplay, directed:

| Scene       | What happens                                                                                                                                         | Camera                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Prologue    | Title over the falls and the lake; the panda looks into the camera, hops and waves                                                                   | a flight from the falls over the lake down the path; push-in at eye level    |
| 迎 Gate     | Up the path past the stone lanterns and through the gate; ceremony; Welcome scroll                                                                   | dolly behind the bamboo, through-the-gate tripod, orbit, crane over the roof |
| 我 About    | The panda reads the signpost at the crossroads, then goes round to the tea pavilion's door; ceremony at the table; About scroll                      | beside the signpost boards, follow, tripod with the lake beyond, low orbit   |
| 技 Skills   | A run through the meadow (butterflies take off, the panda leaps after one), past the bamboo; one strike, ceremony, Skills scroll; a round of strikes | low glide in the grass, dolly behind the culms, crane from the grove, orbit  |
| 路 Journey  | Down the village street under the lanterns; a glide over the lake past koi; ceremony at the first milestone; across the bridge                       | rising street shot, crane over the roofs, water skim and rise, dolly, crane  |
| 作 Projects | Up the banner path; ceremony at the first banner; Projects scroll; the climb to the pagoda                                                           | leading track, orbit, low tripod, crane up the tiers                         |
| 信 Contact  | Along the shore to the bell; the bell is rung, sky lanterns rise past the falls; ceremony; Contact scroll                                            | wide with the falls, close on the bell, tilt up, orbit                       |
| Epilogue    | The panda meditates; the camera drifts up and away; closing card                                                                                     | pull-back to an aerial orbit                                                 |

How it works (`src/tour/`):

- **Autopilot** walks the panda by feeding the character controller the same stick input a
  player would give (at a stroll or a run, and jumping when asked), so steps, dust,
  splashes, grass and collisions behave exactly as in play, and every discovery, strike
  and bell ring goes through the real gameplay code.
- **Camera paths** (`spline.ts`) are cubic Bezier curves: through a list of points (smooth
  handles worked out automatically, without overshoot) or from explicit control points.
  The camera walks them by distance, so its speed does not depend on how the points are
  spaced, and a monotone timing curve passes each point at the time the script asks for,
  easing in at the start and out at the end with no sudden change of speed in between.
- **Director** owns the camera while the tour runs: shots (`move`, `rail`, `track`,
  `orbit`, `tripod`, `dolly`) are small objects that write a camera pose every frame. Where
  a shot looks is keyed in time too, and pans turn the view direction rather than sliding
  the point looked at, so swinging from the panda nearby to hills far away stays an even
  pan. The director cuts or blends between shots: a blend pans and tilts from the old view
  to the new one (the horizon stays level, so even opposite views never swing through the
  sky or the ground) and longer blends bow gently upward along a curve. It widens the lens
  on portrait screens and keeps the camera above ground and water. Blends become cuts for
  visitors who prefer reduced motion.
- **Staging** puts the valley's life where the camera is: butterflies gather over the
  meadow the panda runs through, koi swim under the camera's glide and one leaps.
- **Timeline** runs the chapter scripts on tour time, so pausing freezes everything
  (walks, shots, captions, reading time) and skipping cancels a chapter cleanly: every
  verb first checks that its chapter is still playing, so nothing a skipped chapter
  meant to do happens later.
- **Script** (`script.ts`) is the film itself: each chapter is a short async function
  using a handful of verbs (`walk`, `jump`, `cut`, `card`, `caption`, `ceremony`, `read`,
  `strike`, `callout`, `bell`...). Chapters start with a fade and place the panda, so any
  chapter can be jumped to; a skip in the middle of a fade leaves the picture black and
  the next scene opens from black.
- **Overlay** (`ui/TourOverlay.ts`) is the frame: letterbox bars, a chapter strip, title
  cards, captions, pop-up notes (the skills each dummy guards), the reading control and
  the closing card. Controls fade away while the pointer rests, like a video player's (and
  ignore taps until woken); whatever is off screen is `inert`, and buttons pressed with
  the mouse let go of the focus so `Space` and `Enter` keep meaning pause and next.

Scrolls stay open for a reading time based on their length (7–16 s, plus the time to rise
and unroll), gently scrolling longer ones; "Continue" moves on sooner. A scroll shown by the
film has no tabs or quick travel and does not take the focus, so `Space` still pauses and
`Tab` reaches "Continue". Moving the panda (keys, stick) or "Take the controls" hands
control back on the spot; the tour marks the scrolls it shows as found.

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
  tour/                   "Watch the tour": autopilot, director, shots, timeline, script
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

The whole valley renders in roughly 200 draw calls: static architecture is merged per
material, vegetation and wildlife are instanced and the grass is a single instanced draw.

The preset is chosen automatically (phones → Medium, otherwise High) and adapts down if
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
