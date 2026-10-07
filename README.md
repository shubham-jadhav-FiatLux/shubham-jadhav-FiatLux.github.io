<div align="center">

# Valley of Peace 和

**A portfolio you can walk through.**

Guide a panda through a misty valley of bamboo, blossoms and pagodas<br>
to discover who I am, what I build and how to reach me.

### [Explore the valley →](https://shubham-jadhav-fiatlux.github.io/)

[![CI](https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/actions/workflows/ci.yml/badge.svg)](https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/actions/workflows/ci.yml)
[![Deploy](https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2f7d74.svg)](LICENSE)
[![three.js](https://img.shields.io/badge/three.js-r186-1e1a18.svg?logo=threedotjs)](https://threejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

![A painted valley with a pagoda on a hill, a lake with a zig-zag bridge, a waterfall and a village, below karst peaks rising out of the mist](public/og-image.jpg)

The valley is ringed by karst peaks rising out of the clouds: bamboo groves, blossom
trees, weeping willows, a koi lake fed by a mountain waterfall and a hilltop pagoda, with
butterflies drifting over the meadows and lanterns glowing in the evening light. Every
landmark holds a scroll with a piece of my story: who I am, what I can do, what I have
built and how to reach me. Finding a scroll for the first time is a small ceremony: the
panda bows, a ring of golden ink spreads through the grass, a seal is stamped, and the
scroll rises out of the panda and unrolls.

Rather sit back? [**Watch the tour**](https://shubham-jadhav-fiatlux.github.io/?tour), a
five-minute film of the whole valley. Rather read? The menu's **Read as a page** shows
everything as a plain, accessible page.

## Highlights

- **Procedural from top to bottom.** The terrain, mountains, plants, buildings, the panda,
  every texture, the music and the sound effects are generated in code. Apart from the
  fonts, there are no images, models or sound files.
- **Hand-written shaders.** Wind-swept grass (70,000 blades on High), painterly mountains
  with aerial perspective, water with caustics and foam, a golden-hour sky and warm
  lantern light, all in custom GLSL.
- **A game, not a page.** Walk, run, jump, swim and strike the training dummies, find six
  scrolls, each with its own small ceremony, and travel with the ink-wash map.
- **A directed short film.** _Watch the tour_ plays the portfolio in the live world, with
  the real gameplay and smooth Bezier camera moves.
- **Sound by synthesis.** Generative pentatonic music, ambience and effects, made with the
  Web Audio API as you play.
- **Open to everyone.** Keyboard, gamepad and touch; reduced motion respected; a page view
  and a `<noscript>` copy of the whole portfolio for screen readers, search engines and
  link previews.
- **Opens like a website.** Every shader is compiled while the loading bar fills, hidden
  geometry is skipped before it costs anything, and the quality adapts to the device.

## Screenshots

| ![The panda crossing the zig-zag bridge over the koi lake, past a weeping willow](docs/images/bridge.jpg) | ![The panda below the pagoda, next to a project banner](docs/images/pagoda-top.jpg) |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ![The waterfall pouring into its plunge pool by the bell tower](docs/images/falls.jpg)                    | ![Golden and green bamboo by the training grounds](docs/images/grove.jpg)           |
| ![The About scroll unrolled over the lake](docs/images/scroll.jpg)                                        | ![The ink-wash map with quick travel](docs/images/map.jpg)                          |

## Controls

| Action             | Keyboard                      | Gamepad           | Touch                    |
| ------------------ | ----------------------------- | ----------------- | ------------------------ |
| Walk               | `WASD` / arrow keys           | left stick        | joystick (left thumb)    |
| Run                | hold `Shift`                  | `RB` / `RT`       | push the joystick fully  |
| Jump               | `Space`                       | `A`               | ⤒ button                 |
| Kung-fu strike     | `F`                           | `X`               | 拳 button                |
| Read / interact    | `E` / `Enter`                 | `Y`               | `E` button or the prompt |
| Map & quick travel | `M`                           | `Back` / `Select` | map button               |
| Mute               | `N`                           | —                 | speaker button           |
| Help               | `H`                           | `Start`           | menu → How to play       |
| Close / menu       | `Esc`                         | `B`               | ✕ / menu button          |
| Look around        | drag the mouse, wheel to zoom | right stick       | drag on the right side   |

The valley runs in any browser with WebGL 2. Browsers without WebGL 2 or JavaScript get
the page view automatically.

### Watch the tour

![The tour's opening title over the waterfall and the bell tower, framed by letterbox bars and the chapter seals](docs/images/tour.jpg)

**Watch the tour** (on the title screen, or in the menu) plays the valley as a short film
of a little over five minutes. It opens with a flight from the waterfall down to the
panda, who waves at the viewer, then follows it from the gate to the bell while the camera
glides on smooth Bezier paths: through the bamboo, past the lanterns and the signpost, over
the meadow as butterflies take off, down the village street, low over the lake past the
koi and up to the bridge and the falls. Every discovery plays out, every scroll stays open
long enough to read, each dummy shows the skills it guards, and the bell is rung. A link
ending in `?tour` makes the tour the first choice on the title screen.

| While watching          | Keyboard           | Gamepad       | Touch / mouse           |
| ----------------------- | ------------------ | ------------- | ----------------------- |
| Pause / resume          | `Space`            | `A`           | ❚❚ button               |
| Next chapter / continue | `Enter` / `E`      | `Y` / D-pad → | ⏭ button, chapter seals |
| Take the controls       | `Esc` or just walk | `B` / stick   | "Take the controls"     |

## Built with

| Area               | Tools                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| Rendering          | [three.js](https://threejs.org) on WebGL 2, hand-written GLSL           |
| Post-processing    | [postprocessing](https://github.com/pmndrs/postprocessing): bloom, ACES |
| Language and build | TypeScript (strict), [Vite](https://vite.dev)                           |
| Sound              | Web Audio API                                                           |
| Tests              | [Vitest](https://vitest.dev), headless Chromium via `playwright-core`   |
| CI and hosting     | GitHub Actions, GitHub Pages                                            |

## Getting started

Requires Node 22.12 or newer.

```bash
git clone https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io.git valley-of-peace
cd valley-of-peace
npm install
npm run dev        # http://localhost:5173 (add ?debug for the tweak panel and FPS)
```

| Command            | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `npm run check`    | typecheck, lint, unit tests and the production build                  |
| `npm run format`   | format everything with Prettier                                       |
| `npm run e2e`      | headless playthrough of every discovery (needs the dev server)        |
| `npm run tour`     | headless run of the whole tour, fast-forwarded (needs the dev server) |
| `npm run shots`    | reference screenshots into `screenshots/` (needs the dev server)      |
| `npm run og-image` | re-render the link preview image (needs the dev server)               |

The e2e and screenshot scripts drive Chromium through `playwright-core`; point
`CHROMIUM_PATH` at a local Chrome or Chromium if needed.

Useful URL parameters: `?quality=low|medium|high`, `?adaptive=0` (fixed resolution),
`?debug`, `?tour` (the tour is the main choice on the title screen), `?sim=N` (N simulation
steps per frame: fast-forwards time for tests on slow machines).

## Project structure

```
src/
  main.ts                 boot: WebGL check, loader, the valley, audio, gameplay
  app/                    the engine loop (App) and the gameplay layer (Game)
  core/                   loop timing, events, input, quality presets, storage, debug panel
  render/                 renderer, post-processing, shared uniforms and GLSL, materials
  world/                  terrain, sky, mountains, nature, water and architecture
  physics/                collisions against the ground, obstacles and platforms
  player/                 kinematic controller, the procedural panda, its animation and gear
  camera/                 follow camera and cinematic shots
  tour/                   "Watch the tour": autopilot, director, shots, timeline, script
  zones/                  interactive spots, discovery progress and beacons
  effects/                particles, the discovery ceremony, sky lanterns
  audio/                  Web Audio synthesis: instruments, music, effects, ambience
  ui/                     loader, HUD, scrolls, map, menu, touch controls, page view
  content/portfolio.ts    all the personal content
  utils/                  maths, noise, seeded randomness, canvas helpers
  assets/fonts/           the brush font subset
tools/portfolio-html.ts   build step: meta tags, link previews and the <noscript> copy
scripts/                  smoke test, tour test, screenshots, link preview, font subset
tests/                    unit tests (Vitest)
```

The [design document](docs/DESIGN.md) explains the art direction, the world layout, the
panda, the tour, the sound and the architecture.

## Performance

The valley is built to open like a website and run like a game:

- every shader is compiled while the loading bar fills, so nothing stalls once the title
  appears;
- grass blades and flowers out of view are skipped in the vertex shader, and the mountains
  and buildings are split into sectors and cells that the camera and the sun's shadow skip
  when they cannot see them;
- the sky is drawn last, so the pixels the valley covers cost nothing, and the ground
  shades each material only where it appears;
- the quality preset adapts to the device: phones start on Medium, and the resolution
  drops if the frame rate stays low.

The budget per preset is in the [design document](docs/DESIGN.md#9-performance-budget).

## Deployment

Every push to `main` runs the [CI](.github/workflows/ci.yml) checks, and the
[deploy](.github/workflows/deploy.yml) workflow publishes the site to GitHub Pages
(**Settings → Pages → Source: GitHub Actions**), filling in the absolute URLs that link
previews need. The build uses relative paths, so `dist/` also works on any static host
(Netlify, Vercel, Cloudflare Pages, itch.io…); set `site.url` in the content file there.

## Make your own

The code is MIT-licensed, so you are welcome to build your own valley from it:

1. Put your own content in [`src/content/portfolio.ts`](src/content/portfolio.ts). The
   valley adapts to it: every project gets its own banner, every skill group its own
   training dummy, every milestone its own turn of the bridge.
2. Set `site.sourceUrl` to your repository; `site.url` is only needed outside GitHub Pages.
3. The gate's lettering (`site.gateGlyphs`) and the red seal (`site.seal`) must use
   characters from the brush font subset; add new ones with
   [`scripts/subset-font.py`](scripts/subset-font.py).
4. Write your own tour narration in `tour.captions`, or keep the defaults.
5. Run `npm run dev`, then `npm run og-image` to render a link preview image with your name.

A link back to this repository is appreciated, but not required.

## Contributing

Bug reports, ideas and pull requests are welcome. Please read the
[contributing guide](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md);
security problems go through a [private report](SECURITY.md). Changes are listed in the
[changelog](CHANGELOG.md), and plans in the [roadmap](docs/ROADMAP.md).

## Credits

- Inspired by playful explorable portfolios such as Bruno Simon's, and by classical
  Chinese landscape painting.
- The name is a fan's nod to the Valley of Peace of DreamWorks' _Kung Fu Panda_ films.
  This is a personal, non-commercial project, not affiliated with DreamWorks; the panda,
  the valley, the music and the code are original.
- Brush lettering: [Ma Shan Zheng](https://fonts.google.com/specimen/Ma+Shan+Zheng).
  Text: [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) and
  [Lora](https://fonts.google.com/specimen/Lora).

## License

The code is released under the [MIT License](LICENSE). The bundled fonts are under the
SIL Open Font License 1.1.

## Author

**Shubham Jadhav** · [GitHub](https://github.com/shubham-jadhav-FiatLux) ·
[Portfolio](https://shubham-jadhav-fiatlux.github.io/)
