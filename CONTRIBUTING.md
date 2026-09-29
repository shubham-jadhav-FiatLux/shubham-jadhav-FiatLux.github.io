# Contributing

Thanks for wandering into the valley! Contributions, ideas and bug reports are welcome.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev -- --host   # also reachable from your phone on the same Wi-Fi
```

Add `?debug` to the URL for the tweak panel (lil-gui) and an FPS meter.

## Before opening a pull request

```bash
npm run check        # typecheck + lint + tests + production build
npm run format       # prettier
```

## Workflow

- Branch from `main` using a descriptive name: `feat/day-night-cycle`, `fix/grass-popping`.
- Keep pull requests focused on one feature or fix.
- Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org) style:

  | Prefix                      | Use for                                                 |
  | --------------------------- | ------------------------------------------------------- |
  | `feat:`                     | a new feature                                           |
  | `fix:`                      | a bug fix                                               |
  | `perf:`                     | a performance improvement                               |
  | `refactor:`                 | code change that neither fixes a bug nor adds a feature |
  | `docs:`                     | documentation only                                      |
  | `test:`                     | adding or fixing tests                                  |
  | `build:` / `ci:` / `chore:` | tooling, workflows, housekeeping                        |

- Update `CHANGELOG.md` under **Unreleased**.

## Releasing

1. Move the **Unreleased** notes in `CHANGELOG.md` under a new version heading.
2. `npm version <major|minor|patch>` – bumps `package.json` and creates a `vX.Y.Z` tag.
3. `git push --follow-tags` – CI deploys `main` to GitHub Pages.

## Code layout

See [docs/DESIGN.md](docs/DESIGN.md#8-architecture). Personal content lives only in
`src/content/portfolio.ts`; the rest of the code must not hard-code any personal data.
