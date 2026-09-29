# Valley of Whispering Bamboo 竹

An explorable 3D portfolio. Guide a panda through a misty valley of bamboo groves,
blossom trees, a koi lake and a hilltop pagoda. Every landmark holds a scroll with a piece
of the author's story: who they are, what they can do, what they have built and how to
reach them.

Built with **three.js**, **TypeScript** and hand-written **GLSL**. Every model, texture,
sound and note of music is generated in code.

## Play

| Action             | Keyboard                        | Gamepad     | Touch                   |
| ------------------ | ------------------------------- | ----------- | ----------------------- |
| Move               | `WASD` / arrow keys             | left stick  | left joystick           |
| Run                | `Shift`                         | `RB` / `R2` | push the joystick fully |
| Jump               | `Space`                         | `A`         | jump button             |
| Kung-fu strike     | `F`                             | `X`         | strike button           |
| Read a scroll      | `E` / `Enter`                   | `Y`         | tap the prompt          |
| Map & quick travel | `Tab` / `M`... see in-game help | `Back`      | map button              |
| Mute               | `M`                             | —           | speaker button          |
| Look around        | drag the mouse, scroll to zoom  | right stick | two fingers             |

## Make it yours

All personal information lives in **one typed file**:
[`src/content/portfolio.ts`](src/content/portfolio.ts). Fill in your name, bio, skills,
projects, journey and contact links. The valley adapts automatically: every project
gets its own banner, every skill group its own training dummy, every milestone its own
turn on the bridge.

## Develop

```bash
npm install
npm run dev        # start the dev server (add ?debug to the URL for the tweak panel)
npm run check      # typecheck + lint + tests + production build
npm run build      # static site in dist/
```

Requires Node 22.12+.

## Deploy

Push to GitHub and enable **Settings → Pages → Source: GitHub Actions**. The
[`deploy`](.github/workflows/deploy.yml) workflow publishes every push to `main`. The build
uses relative paths, so it also works on any static host (Netlify, Vercel, Cloudflare
Pages, itch.io…).

## Documentation

- [Design document](docs/DESIGN.md): art direction, world layout, systems, performance budget
- [Roadmap](docs/ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## Credits

- Inspired by playful explorable portfolios such as Bruno Simon's, and by classical
  Chinese landscape painting.
- Brush lettering: [Ma Shan Zheng](https://fonts.google.com/specimen/Ma+Shan+Zheng) (OFL).
  Text: [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) and
  [Lora](https://fonts.google.com/specimen/Lora) (OFL).

## License

Code: [MIT](LICENSE). Fonts: SIL Open Font License 1.1.
