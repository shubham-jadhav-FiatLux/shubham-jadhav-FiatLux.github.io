# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- My own story in every scroll: who I am and what I research, six disciplines on the
  training dummies (graphics, parallel computing, languages, workflow, engine craft, and
  systems and AI), seven projects on the banners, six turns of the bridge from school to
  IIT Madras, and how to reach me. The link preview carries my name and role.
- The site is live at [shubham-jadhav-fiatlux.github.io](https://shubham-jadhav-fiatlux.github.io/),
  and the repository is set up as an open-source project: a code of conduct (Contributor
  Covenant 2.1), a security policy with private reporting, issue forms, a pull request
  checklist, monthly Dependabot updates and consistent line endings.
- A "schedushh!" as a scroll opens: a whoosh as it flies out, the knock of its rollers
  parting and the rustle of the paper unfurling, timed to the scroll's flight.

### Changed

- The valley opens faster and the title screen no longer freezes as it appears. Every
  shader is compiled while loading, for the way it is actually drawn and in the
  background where the browser can: 57 programs instead of 97, and none compiled after
  the title shows (before, about fifty were compiled on its first frames). The page
  also creates one graphics context instead of two, paints the map in idle time and
  blurs the ground masks faster.
- Smoother frames for the same picture: the sky is only painted where it shows; the
  ground works out each material (rock strata, sand, trampled verges, leaf litter) only
  where it appears; grass blades and flowers out of view or in the gaps are skipped
  before their costly shading; the mountains are cut into sectors and the buildings into
  cells, so the camera and the sun's shadow skip what they cannot see; merged buildings
  keep their shared vertices (46% fewer for the painted parts); and high-density screens
  use two multisamples instead of four.
- Variables, constants and parameters are named with an `sj_` prefix throughout the
  code (see CONTRIBUTING.md).
- Settings and found scrolls are saved under the name `valley-of-peace:` in the browser,
  so progress from earlier previews starts afresh.
- The link preview image puts the name and the role on lines of their own, and a
  project's years ("2024 – now") stay on one line in the scroll.
- The weeping willows by the lake are grown anew: a stout trunk splits into limbs that
  rise like a vase, branches arch over from them, and a dense curtain of long, leafy
  strands falls from the arches almost to the ground, ragged at the ends and swaying
  most at the tips.
- The panda's gear in detail: a red silk scarf wound snugly round its neck like a collar,
  folded and pleated, hemmed and embroidered in gold and tied in a knot, its tails ending
  in gold bands and fringes; a bamboo scroll case with nodes, cord bindings, brass caps, a tassel and the
  scroll inside tied with red cord, slung on a leather strap with a brass buckle.
- The scroll is mounted like a real hanging scroll: a cord and a lacquered rod with a
  silk tassel and jade bead, a pine-green brocade woven with gold coins, the two hanging
  strips of the "heaven" panel, fret-patterned bands either side of aged, fibrous paper
  with fret corners, a vermilion rule under the title, the section's character as a faint
  watermark, the mounter's seal in the corner, and a heavy roller with jade knobs. It
  still rises rolled up and unrolls the same way, and the tassel sways as it opens.
- New mountains: ranges of karst towers and stone pillars crowned with woods and
  clinging pines, rising out of bands of mist, with ever paler and higher ranges behind
  them fading into the sky, and a sea of cloud below the rim of the valley. Sunlit faces
  glow gold, shaded ones turn cool, and edges against the low sun shine.
- Bolder lettering that reads from afar: the signpost's boards are dark oiled wood with
  big cream brush titles and gold place names, both outlined; the captions over the
  dummies and along the bridge set their second line in bold black instead of thin brown;
  the banners' titles and the gate's signboard are thicker, with a dark edge.
- The training dummies are wooden warriors with arms all the way round: three tiers of
  arms set at staggered angles and bent legs, each fixed in a brass collar, so they look
  like training dummies from every side (and their arms whirl when struck). The tour now
  films its round of the dummies from the side of the yard, clear of their arms.
- The bell tower is turned a quarter round, so the log striker hangs across the view of
  a visitor arriving along the shore and its swing into the bell is plain to see.
- The tea pavilion is turned to face the path: one opening greets the visitor arriving
  from the crossroads, the other looks out over the lake.
- The big drum booms: a deeper, longer note with a second, higher tone that small
  speakers can play, the beater's slap and the thud of the shell, and it carries across
  the yard (about two and a half times as loud).
- Renamed to **Valley of Peace**: the title screen, the corner badge, the tour and the
  link preview, with 和平谷 ("Valley of Peace") on the gate's signboard and 和 ("peace")
  on the red seal. The seal's character is now part of the content file (`site.seal`).

## [0.8.0] - 2026-10-01

The director's cut of the tour.

### Added

- The camera moves on smooth Bezier paths: every move eases in and out and passes its
  marks at set times without sudden changes of speed. Pans and blends turn the view the
  way a camera operator would (panning and tilting, the horizon level), and longer blends
  bow gently upward along a curve.
- The film opens from black on a flight from the waterfall back over the lake and the
  bridge, down the path to the panda, who looks into the camera, hops and waves.
- More of the valley in the film: the gate seen through the bamboo past the stone
  lanterns, the signpost at the crossroads, butterflies taking off in the meadow as the
  panda leaps after one, the bamboo lining the way to the training grounds, the village
  street under its strings of paper lanterns, a glide low over the lake past koi and a
  leaping fish that rises to the panda waiting at the bridge, and a closing view of the
  whole lake with the bridge, the bell tower and the waterfall.
- Each strike on a training dummy shows the skills it guards, as in play.
- A few stands of bamboo along the path to the training grounds.

### Changed

- A discovered scroll now waits for the panda's bow and the golden light, then rises out
  of the panda like a genie from a lamp before it unrolls (in play and in the tour).
- Larger, sharper lettering: the paper captions over the dummies and along the bridge,
  the signpost (the section in large letters, the place below) and the project banners.
  Lettering textures are drawn at full resolution on High and smaller on Medium and Low,
  to spare memory on slower devices.
- Floating captions fade out when the camera comes close, instead of filling the view.

## [0.7.0] - 2026-10-01

A new way to see the portfolio: the whole valley as a short, directed film.

### Added

- **Watch the tour**: the valley as a short film (about four minutes). The panda walks
  from the gate to the bell on its own while a director films it: an aerial prologue with
  the title, one chapter per scroll with a title card and a caption, aerial, tracking,
  orbit, tripod and crane shots, cuts and fades. Every discovery ceremony plays, each
  scroll stays open long enough to read (gently scrolling longer ones), the dummies and
  the drum are struck, the bridge's milestones are visited, the bell is rung and sky
  lanterns rise; an epilogue pulls back over the valley to a closing card.
- Tour controls: pause (Space), next chapter or continue reading (Enter), a chapter strip
  to jump to any chapter, and "Take the controls" (Esc, or simply walk) to explore from
  wherever the panda stands. Controls fade away while the pointer rests.
- Start it from the title screen or the menu; a link ending in `?tour` makes it the
  main choice on the title screen. Captions can be customised in `tour.captions`.
- `?sim=N` runs N simulation steps per frame to fast-forward tests on slow machines;
  `npm run tour` plays the whole tour headless and checks every chapter and scroll.

## [0.6.0] - 2026-09-30

A visual update: a waterfall with a real source, richer stone, wood and bamboo, warm
lantern light, softer edges between materials and a little more life in the valley.

### Added

- A stream crosses the plateau from a spring pool in the hills and pours over a notch in
  the cliff into a deep plunge pool: glassy at the lip, aerated lower down, with a veil of
  spray, churning white water, foam trails, mist, wet dark rock and hand-placed boulders.
- Warm lantern light: paper and stone lanterns glow in their own colour with a candle
  flicker and a soft halo, light pools warm the ground, grass and water around them, and
  on High a few real lights follow the lanterns nearest the panda.
- Material finishes for all architecture: lacquer with a soft sheen, wood grain, stone
  grain with moss, worn gilding, grime where parts meet the ground and an algae line at
  the water; glazed roof tiles vary tile by tile. A prefiltered golden-hour sky gives
  glossy surfaces something to reflect.
- The zig-zag bridge rebuilt in timber: plank decks on pile bents, stone landings on
  masonry piers, vermilion railings with gilded finials, and foam rings around every post
  and pier in the water.
- Bamboo with node rings, a waxy bloom under each node, branches with drooping leaf
  sprays, papery sheaths, young shoots and fallen leaves; golden bamboo with green
  grooves frames the gate and black bamboo grows in the village.
- Butterflies over the meadows (they flutter off when the panda comes close),
  dragonflies darting over the lake and a flock of birds wheeling above the valley.
- The map shows the stream, the falls and the bridge.
- Screenshot angles for close-ups of bamboo, lanterns, rocks, path edges, the bridge,
  the falls and the butterflies.

### Changed

- High quality is the default on desktop (phones start at Medium); adaptive quality still
  steps down on slower devices.
- The follow camera starts higher and farther back with a wider lens, so the panda walks
  in the lower third with the valley opening up behind it; after the visitor orbits or
  zooms, it eases back to that framing once the panda walks on.
- Rocks are chiselled, faceted stones with bevelled edges, strata, moss, lichen, cracks
  and wet glossy bases instead of smooth noisy blobs; cliffs show layered strata, ledges,
  joints and seep stains.
- Paths and yards have meandering, ragged edges with grass growing right up to them, a
  trampled verge, a compacted tread and scattered pebbles; paving frays stone by stone
  with moss in the joints; grass thins and dries out down onto the beach.

### Fixed

- Bridge landings could be walked through at their corners.

## [0.5.1] - 2026-09-30

### Fixed

- Keyboard players saw a touch hint instead of the E / F key in prompts.
- Adaptive quality dropped a preset on every tab switch, could lower a preset the visitor
  had picked and kept a reduced resolution after a manual change. The menu now shows
  automatic changes too.
- Content containing `$&`, `$'` or `` $` `` broke the generated page.
- Discovery, bell and dummy timers ignored quick travel, progress reset and open panels:
  a scroll could unroll under the map and the camera could stay in the discovery shot.
- "Hide all scrolls again" did not re-arm the gate, which also greeted returning
  visitors on every visit.
- Opening a milestone or following a page-view link scrolled the page embedding the game.
- Safari 15 could not parse the three.js bundle; `roundRect` now has a fallback.
- Clicking the HUD prompt kept Space from jumping.
- The map key did not work on AZERTY keyboards.
- Gamepad polling could stop the game where a permissions policy blocks the Gamepad API.
- After a short stall the music played every overdue note at once.

### Added

- Unit tests for the generated `index.html`; smoke checks for key prompts and interrupted
  discovery ceremonies.

## [0.5.0] - 2026-09-30

### Added

- Link previews: Open Graph and Twitter card tags with a rendered 1200×630 image
  (`npm run og-image`), absolute URLs filled in by the Pages workflow.
- The whole portfolio is written into `index.html` at build time as a styled
  `<noscript>` page, for visitors without JavaScript, search engines and link unfurlers.
- Menu: How to play, Fullscreen and an optional source-code link (`site.sourceUrl`).
- Gentle onboarding tips (beacons after the first scroll, the map if progress stalls).
- A reload banner when the graphics context is lost.
- Smoke test checks for camera dragging, jumping after a panel closes and leaving the
  page view with Escape.

### Changed

- The help shows touch or keyboard controls to match the device.
- three.js and postprocessing ship as a separate, long-cached chunk.
- README: corrected controls, customisation guide and screenshots.

### Fixed

- Mouse and touch drags never reached the camera once the game had started: the HUD
  layer swallowed them.
- Focus could stay on a closed panel's button, so Space did not jump.
- Escape in the page view also opened the menu; Enter or Space there started the game.
- Phones: the menu's book icon filled the whole dialog, the title overlapped the HUD
  buttons, keyboard hints covered the jump button and the title screen overflowed in
  landscape.

## [0.4.0] - 2026-09-30

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
- `lil-gui` (the `?debug` tweak panel) is a runtime dependency.

### Fixed

- three.js console warnings from vegetation materials and the far forest.

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

[Unreleased]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/releases/tag/v0.1.0
