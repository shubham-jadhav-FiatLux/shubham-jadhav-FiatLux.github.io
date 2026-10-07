import { Vector3 } from 'three';
import { sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent, TourScene } from '../content/types';
import type { ChapterCard } from '../ui/TourOverlay';
import { sectionTitle } from '../ui/render';
import { BRIDGE_POINTS } from '../world/layout';
import { approach, type XZ } from './route';
import { dolly, move, orbit, tripod, track, type Shot } from './shots';
import type { TourContext } from './Tour';

/**
 * The film. A flight over the valley that lands in front of the panda, one chapter per
 * scroll in the order a visitor would find them, and an epilogue. Chapters open with a
 * scene change (a cut, a fade, or a straight continuation), walk the panda through its
 * landmark while the camera moves on smooth Bezier paths, show the valley on the way
 * (bamboo, lanterns, the signpost, butterflies, the village, koi, the falls), play the
 * discovery and hold the scroll long enough to read.
 *
 * Coordinates are world metres (x east, z south, y up); see src/world/layout.ts. Points
 * written `up(ctx, x, h, z)` sit `h` metres above the ground (or the water) at (x, z).
 */

export interface Chapter {
  id: TourScene;
  section?: SectionId;
  /** entry in the chapter strip (section chapters only) */
  strip?: { glyph: string; label: string };
  run(ctx: TourContext): Promise<void>;
}

const DEFAULT_CAPTIONS: Record<TourScene, string> = {
  prologue: 'Somewhere past the mist, a valley keeps a story.',
  welcome: 'Every journey starts at the gate.',
  about: 'Tea by the lake, and a little about me.',
  skills: 'Each training dummy guards a set of skills.',
  journey: 'Every turn of the bridge is a step along the way.',
  projects: 'Banners line the path to the pagoda, one for each project.',
  contact: 'Ring the bell to say hello.',
  epilogue: 'Thank you for walking the valley with me.',
};

export function captionFor(scene: TourScene, content: PortfolioContent): string {
  return content.tour?.captions?.[scene] ?? DEFAULT_CAPTIONS[scene];
}

export function chapterCard(section: SectionId, content: PortfolioContent): ChapterCard {
  const meta = sectionMeta(section);
  const n = SECTION_ORDER.indexOf(section) + 1;
  return {
    glyph: meta.glyph,
    kicker: `Chapter ${n} · ${meta.landmark}`,
    title: sectionTitle(section, content),
  };
}

const SECTION_ORDER: SectionId[] = ['welcome', 'about', 'skills', 'journey', 'projects', 'contact'];

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Ground height at (x, z) (it can be below the water). */
function g(ctx: TourContext, x: number, z: number): number {
  return ctx.app.terrain.heightAt(x, z);
}

/** A point `h` metres above the ground, or above the water where the ground is lower. */
function up(ctx: TourContext, x: number, h: number, z: number): Vector3 {
  return v(x, Math.max(0, g(ctx, x, z)) + h, z);
}

/** Yaw that faces from a towards b. */
function yawTo(a: XZ, b: XZ): number {
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

/** A moving target on the panda: `height` above its feet, `ahead` metres in front. */
function pandaAt(ctx: TourContext, height = 1, ahead = 0): () => Vector3 {
  const out = new Vector3();
  return () => {
    const s = ctx.subject();
    return out.set(
      s.position.x + Math.sin(s.yaw) * ahead,
      s.position.y + height,
      s.position.z + Math.cos(s.yaw) * ahead,
    );
  };
}

/**
 * Starts a scene: straight on if the panda is already there (the previous chapter led
 * here), otherwise through a fade to black, placing the panda while the screen is dark.
 * A skip can leave the picture black; the new scene then opens from black. `blend`: how
 * the camera reaches the first shot when continuing (0 = a straight cut); `setup` stages
 * the scene (while the screen is dark, when there is a fade).
 */
async function scene(
  ctx: TourContext,
  at: XZ,
  yaw: number,
  shot: () => Shot,
  blend = 1.2,
  setup?: () => void,
): Promise<void> {
  const p = ctx.app.controller.position;
  if (Math.hypot(p.x - at[0], p.z - at[1]) < 2.5 && !ctx.dark) {
    setup?.();
    ctx.cut(shot(), blend);
    return;
  }
  if (!ctx.dark) await ctx.fadeOut(0.6);
  ctx.place(at[0], at[1], yaw);
  setup?.();
  ctx.cut(shot());
  await ctx.wait(0.2);
  await ctx.fadeIn(1);
}

/* ------------------------------------------------------------------ Prologue */

const prologue: Chapter = {
  id: 'prologue',
  async run(ctx) {
    // The film opens from black. The panda waits at the start of the path, turned towards
    // where the camera lands (brought there in the dark when the film is watched again).
    const p = ctx.app.controller.position;
    if (!ctx.dark) await ctx.fadeOut(Math.hypot(p.x, p.z - 61) > 2.5 ? 0.6 : 0.35);
    ctx.place(0, 61, 0);
    const face = pandaAt(ctx, 1.0);
    const land = up(ctx, 1.1, 1.55, 65);
    // A flight: from the waterfall, back over the lake and the bridge, over the village
    // roofs and the gate, down to the panda.
    ctx.cut(
      move({
        path: [
          v(47, 9.5, -12.5),
          v(40, 15, -2),
          v(34, 17, 16),
          v(18, 14, 37),
          v(13.5, 11.5, 57),
          v(5.5, 4.4, 66.2),
          land,
        ],
        times: [0, 4.6, 8.8, 12.4, 15.2, 17, 18.6],
        look: [
          { t: 0, at: v(50, 8, -31) },
          { t: 3.4, at: v(50, 8, -31) },
          { t: 6.8, at: v(16, 1, -8) },
          { t: 9.6, at: v(2, 3, 24) },
          { t: 13, at: up(ctx, 0, 2.5, 51) },
          { t: 17.6, at: face },
        ],
        fov: [
          { t: 0, fov: 48 },
          { t: 13, fov: 46 },
          { t: 18.6, fov: 33 },
        ],
      }),
    );
    await ctx.fadeIn(1.6);
    await ctx.wait(1.6);
    ctx.title(true);
    await ctx.wait(5.6);
    ctx.title(false);
    await ctx.wait(1.4);
    ctx.caption(captionFor('prologue', ctx.content), 4.6);
    await ctx.wait(5.2);
    // The camera lands; the panda notices it, hops and waves to the viewer.
    ctx.look('camera');
    await ctx.wait(4.6);
    ctx.cut(
      move({
        path: [land, up(ctx, 0.7, 1.15, 64.4), up(ctx, 0.4, 1.0, 64.1)],
        duration: 7,
        ease: [0.3, 0, 0.35, 1],
        look: face,
        fov: [
          { t: 0, fov: 33 },
          { t: 7, fov: 31 },
        ],
      }),
    );
    await ctx.wait(0.4);
    ctx.jump();
    await ctx.wait(1.1);
    ctx.emote('wave');
    await ctx.wait(1.9);
    ctx.emote('wave');
    await ctx.wait(2.3);
  },
};

/* ------------------------------------------------------------------ Welcome */

const welcome: Chapter = {
  id: 'welcome',
  section: 'welcome',
  strip: { glyph: '迎', label: 'Welcome' },
  async run(ctx) {
    // Up the path to the gate, past the stone lanterns, seen through the bamboo.
    await scene(
      ctx,
      [0, 61],
      Math.PI,
      () =>
        move({
          path: [up(ctx, 11.8, 1.45, 61.5), up(ctx, 11.6, 1.5, 57), up(ctx, 11.0, 1.65, 52.5)],
          times: [0, 2.7, 5.4],
          look: pandaAt(ctx, 1.1, 1.8),
          fov: 34,
        }),
      0,
    );
    ctx.look(null);
    ctx.card('welcome');
    ctx.caption(captionFor('welcome', ctx.content));
    ctx.go(
      [
        [0, 57],
        [0, 51.6],
      ],
      { pace: 0.55 },
    );
    await ctx.until(() => ctx.app.controller.position.z < 53.4, 9);
    // Through the gate: the camera waits on the far side and lets the panda come to it.
    const y = g(ctx, 0, 45);
    ctx.cut(tripod(v(2.6, y + 2.2, 44.2), ctx.panda, { fov: 40, lookHeight: 1.4 }));
    await ctx.until(() => ctx.app.controller.position.z < 52.2, 8);
    await ctx.until(() => ctx.app.controller.speed < 0.2, 3);
    ctx.face(0, 44);
    // Seen through the gate while the panda bows.
    ctx.cut(
      orbit(ctx.panda, { radius: 6.4, height: 2.4, angle: 2.95, speed: -0.03, lookHeight: 1.5 }),
      1.2,
    );
    await ctx.ceremony('welcome');
    await ctx.read('welcome');
    // The valley opens up beyond the gate as the panda walks on.
    ctx.go(
      [
        [0, 47],
        [-0.8, 42],
        [-0.4, 36.4],
      ],
      { pace: 0.7 },
    );
    const y2 = g(ctx, 0, 54);
    ctx.cut(
      move({
        path: [v(0.4, y2 + 1.8, 54.5), v(0.3, y2 + 5.5, 55.6), v(0, y2 + 12, 57.5)],
        duration: 6.5,
        look: [
          { t: 0, at: pandaAt(ctx, 1.4) },
          { t: 2.2, at: pandaAt(ctx, 1.4) },
          { t: 6.5, at: v(3, 4, 12) },
        ],
        fov: [
          { t: 0, fov: 46 },
          { t: 6.5, fov: 52 },
        ],
      }),
      1,
    );
    await ctx.wait(6);
  },
};

/* ------------------------------------------------------------------ About */

const about: Chapter = {
  id: 'about',
  section: 'about',
  strip: { glyph: '我', label: 'About' },
  async run(ctx) {
    // The signpost at the crossroads: which way to the pavilion? Seen from beside the
    // boards as the panda comes up the path from the gate and looks up at them.
    const sign = ctx.anchors.signpost;
    const board = sign.boards.about ?? { x: sign.x, y: sign.y + 2.8, z: sign.z };
    const read: XZ = [sign.x - 1.8, sign.z + 0.6];
    const start: XZ = [-0.4, 36.4];
    await scene(
      ctx,
      start,
      Math.PI,
      () =>
        move({
          path: [
            up(ctx, sign.x - 4.8, 1.7, sign.z - 5.8),
            up(ctx, sign.x - 3.4, 1.75, sign.z - 4.1),
          ],
          duration: 7.5,
          look: [
            { t: 0, at: pandaAt(ctx, 1.2) },
            { t: 3.2, at: pandaAt(ctx, 1.4) },
            { t: 7.5, at: v(sign.x - 1, sign.y + 1.85, sign.z - 0.2) },
          ],
          fov: [
            { t: 0, fov: 46 },
            { t: 7.5, fov: 46 },
          ],
        }),
      0,
    );
    await ctx.walk([read], { pace: 0.6 });
    ctx.face(board.x, board.z);
    ctx.look({ x: board.x, y: board.y, z: board.z });
    await ctx.wait(1.4);
    ctx.card('about');
    ctx.caption(captionFor('about', ctx.content));
    await ctx.wait(2.4);
    ctx.look(null);
    // Off towards the pavilion, past the old blossom tree; benches close four sides of the
    // pavilion, so round them to the shore-side entrance.
    const table = ctx.anchors.pavilionTable;
    const door = ctx.anchors.pavilionEntrance;
    const stand = approach(door.x, door.z, table.x, table.z, 1.6);
    ctx.go([
      [1.2, 26.4],
      [2.3, 20.6],
      [4.5, 15.5],
      [9.5, 9.6],
      [door.x + door.nx * 2.4, door.z + door.nz * 2.4],
      [door.x, door.z],
      stand,
    ]);
    ctx.cut(
      track(ctx.subject, {
        distance: 6,
        height: 3.2,
        angle: 0.25,
        lookHeight: 1.2,
        lookAhead: 4,
        fov: 46,
      }),
      1.4,
      { arc: 0.1 },
    );
    await ctx.until(() => ctx.app.controller.position.z < 16.5, 9);
    // The pavilion ahead, the lake and the falls beyond it.
    const yP = g(ctx, 4.2, 19.4);
    ctx.cut(
      tripod(v(4.2, yP + 5.4, 19.4), ctx.panda, {
        fov: 44,
        lookHeight: 1.2,
        drift: v(0.25, -0.05, -0.3),
      }),
      1.4,
      { arc: 0.1 },
    );
    await ctx.until(ctx.arrived, 16);
    ctx.face(table.x, table.z);
    ctx.look({ x: table.x, y: table.y + 0.4, z: table.z });
    // Under the eaves, through the lake-side opening: the panda faces the camera across
    // the tea table (a slow drift that stays within that opening, clear of the benches).
    const outward = Math.atan2(-door.nx, -door.nz);
    ctx.cut(
      orbit(v((table.x + stand[0]) / 2, table.y - 0.8, (table.z + stand[1]) / 2), {
        radius: 6.2,
        height: 1.9,
        angle: outward - 0.16,
        speed: 0.018,
        lookHeight: 1.05,
        fov: 42,
      }),
    );
    await ctx.wait(0.6);
    await ctx.ceremony('about');
    await ctx.read('about');
    await ctx.wait(0.8);
  },
};

/* ------------------------------------------------------------------ Skills */

const skills: Chapter = {
  id: 'skills',
  section: 'skills',
  strip: { glyph: '技', label: 'Skills' },
  async run(ctx) {
    const start: XZ = [-5.5, 21.9];
    // A run through the meadow: butterflies take off, the panda leaps after one.
    await scene(
      ctx,
      start,
      -Math.PI / 2,
      () =>
        move({
          path: [up(ctx, -8.8, 0.85, 27.6), up(ctx, -12.2, 0.9, 27.9), up(ctx, -16.2, 1.0, 27.4)],
          times: [0, 2.4, 4.8],
          look: pandaAt(ctx, 0.9, 1.6),
          fov: 42,
          clearance: 0.3,
        }),
      0,
      () => {
        ctx.stage.butterflies(-12.8, 22.4, 6, 1.6);
        ctx.stage.butterflies(-11.6, 25.4, 4, 1.4);
      },
    );
    ctx.card('skills');
    ctx.caption(captionFor('skills', ctx.content));
    ctx.go(
      [
        [-8, 21.5],
        [-18, 19],
        [-27, 16.5],
        [-30.5, 15.6],
      ],
      { run: true, pace: 0.6 },
    );
    await ctx.until(() => ctx.app.controller.position.x < -12.4, 6);
    ctx.jump();
    // Past the bamboo lining the way, seen through the culms.
    await ctx.until(() => ctx.app.controller.position.x < -16.5, 4);
    ctx.cut(
      move({
        path: [up(ctx, -16.8, 1.5, 28.6), up(ctx, -21.6, 1.7, 27.6), up(ctx, -27, 2.0, 25.9)],
        times: [0, 2.1, 4.2],
        look: pandaAt(ctx, 1.0, 2.5),
        fov: 36,
      }),
    );
    await ctx.until(ctx.arrived, 8);
    const dummies = ctx.anchors.dummies;
    const yard: XZ = [-38, 15];
    const last = dummies.length - 1;
    const d0 = dummies[last];
    if (!d0) {
      await ctx.ceremony('skills');
      await ctx.read('skills');
      return;
    }
    const spot = approach(yard[0], yard[1], d0.x, d0.z, 1.25);
    // The whole yard from among the bamboo, then in close for the first strike.
    const yY = g(ctx, -36, 28);
    ctx.cut(
      move({
        path: [v(-34.2, yY + 2.2, 34.4), v(-35.2, yY + 4.5, 30.2), v(-36, yY + 6.5, 28.5)],
        duration: 5,
        look: [
          { t: 0, at: pandaAt(ctx, 1) },
          { t: 5, at: v(-37.5, 2.2, 12) },
        ],
        fov: 46,
      }),
    );
    await ctx.walk([spot]);
    ctx.face(d0.x, d0.z);
    await ctx.wait(0.4);
    // Low, three-quarters in front of the panda, the dummy at the edge of the frame.
    const dl = Math.hypot(d0.x - spot[0], d0.z - spot[1]) || 1;
    const fx = (d0.x - spot[0]) / dl;
    const fz = (d0.z - spot[1]) / dl;
    ctx.cut(
      tripod(
        v(spot[0] + fx * 2.6 - fz * 3.4, d0.y + 1, spot[1] + fz * 2.6 + fx * 3.4),
        v(spot[0] + fx * 0.6, d0.y, spot[1] + fz * 0.6),
        { fov: 40, lookHeight: 0.8 },
      ),
    );
    await ctx.wait(0.4);
    await ctx.strike(last);
    await ctx.ceremony('skills');
    await ctx.read('skills');
    // A round of the other dummies, each showing the skills it guards, filmed from the
    // south side of the yard and drifting west with the panda. (An orbit around the panda
    // swept the camera through the dummies, whose arms reach out on every side, through
    // their captions and over the drum.) The panda is held a little left of centre, so the
    // skill cards on the right never cover it.
    const round: XZ = [yard[0] + 4.2, yard[1] + 6.2];
    const feet = pandaAt(ctx, 0);
    const framed = new Vector3();
    ctx.cut(
      tripod(
        v(round[0], g(ctx, round[0], round[1]) + 3, round[1]),
        () => {
          const p = feet();
          return framed.set(p.x + 1, p.y, p.z);
        },
        { fov: 44, lookHeight: 0.9, drift: v(-0.16, 0, 0.12) },
      ),
      1.5,
    );
    const groups = ctx.content.skills.groups;
    for (let i = last - 1; i >= 0; i--) {
      const d = dummies[i]!;
      const at = approach(yard[0], yard[1], d.x, d.z, 1.25);
      await ctx.walk([at]);
      ctx.face(d.x, d.z);
      await ctx.wait(0.45);
      await ctx.strike(i);
      const group = groups[i];
      if (group)
        ctx.callout(
          {
            glyph: '技',
            kicker: 'Skills',
            title: group.name,
            items: group.items.map((item) => item.name),
          },
          2.8,
        );
      await ctx.wait(1.6);
    }
    // And one beat on the big drum.
    const drum = ctx.anchors.drum;
    const at = approach(yard[0], yard[1], drum.x, drum.z, 1.7);
    await ctx.walk([at], { run: true });
    ctx.face(drum.x, drum.z);
    const yD = g(ctx, drum.x - 5, drum.z + 5.5);
    // (eased in: the round above has drifted to almost the same place)
    ctx.cut(
      tripod(v(drum.x - 5.5, yD + 2.4, drum.z + 5.8), ctx.panda, { fov: 44, lookHeight: 0.8 }),
      1.2,
    );
    await ctx.wait(0.6);
    await ctx.drum();
    await ctx.wait(1.4);
  },
};

/* ------------------------------------------------------------------ Journey */

const journey: Chapter = {
  id: 'journey',
  section: 'journey',
  strip: { glyph: '路', label: 'Journey' },
  async run(ctx) {
    const start: XZ = [17.5, 38.4];
    const ms = ctx.anchors.milestones;
    const bridge = BRIDGE_POINTS as XZ[];
    // the first milestone (or, with no journey entries, the first bend of the bridge)
    const first = ms[0] ?? {
      x: bridge[1]![0],
      y: g(ctx, bridge[1]![0], bridge[1]![1]),
      z: bridge[1]![1],
    };
    // Down the village street, under the strings of paper lanterns.
    await scene(ctx, start, Math.PI / 2, () =>
      move({
        path: [up(ctx, 12.2, 0.9, 38.9), up(ctx, 13.6, 1.05, 39.0), up(ctx, 14.8, 1.25, 39.1)],
        times: [0, 3.2, 6.4],
        look: [
          { t: 0, at: pandaAt(ctx, 1.2, 3) },
          { t: 6.4, at: up(ctx, 30, 3.2, 37.6) },
        ],
        fov: 44,
      }),
    );
    ctx.go(
      [
        [22, 38.5],
        [28, 38.2],
        [31.6, 35.5],
        [32.6, 30],
        [33.6, 22.5],
      ],
      { pace: 0.75 },
    );
    await ctx.wait(5.6);
    // Out of the village towards the lake, the falls beyond the roofs.
    ctx.cut(
      move({
        path: [up(ctx, 32, 4, 45.5), up(ctx, 32.1, 6.5, 46.5), up(ctx, 32.2, 9.5, 47.5)],
        duration: 7,
        look: [
          { t: 0, at: pandaAt(ctx, 1.2) },
          { t: 7, at: up(ctx, 33, 1, 22) },
        ],
        fov: 48,
      }),
    );
    ctx.card('journey');
    ctx.caption(captionFor('journey', ctx.content));
    await ctx.wait(6.4);
    // Down to the water: lily pads and koi below, one leaps; then up over the willow on the
    // shore and round to the panda waiting at the bridge, the lake and the falls beyond.
    const head: XZ = [31.4, 12.8];
    ctx.stage.koi(20.5, -4, 7, 0.6);
    ctx.cut(
      move({
        path: [
          v(17.2, 0.55, -11.5),
          v(20, 0.6, -5),
          v(21, 2.2, -0.5),
          v(21.3, 6.8, 3.6),
          v(21.5, 7.8, 9),
          up(ctx, 21.7, 3.6, 19.2),
        ],
        times: [0, 2.8, 5.2, 6.6, 8, 10.8],
        look: [
          { t: 0, at: v(21, -0.3, -4) },
          { t: 2.8, at: v(22, -0.2, 1) },
          { t: 5.2, at: v(24, 0.3, 6) },
          { t: 7.2, at: v(30.5, 1, 10) },
          { t: 10.8, at: v(32, 1.4, 6) },
        ],
        fov: [
          { t: 0, fov: 42 },
          { t: 10.8, fov: 46 },
        ],
        clearance: 0.35,
      }),
    );
    ctx.place(head[0], head[1], yawTo(head, bridge[1]!));
    await ctx.wait(2.1);
    ctx.stage.leap(21.3, -2.5);
    await ctx.wait(8.9);
    // The first milestone, the discovery, the scroll.
    ctx.face(first.x, first.z);
    ctx.look({ x: first.x, y: first.y + 1.2, z: first.z });
    ctx.cut(
      orbit(ctx.panda, { radius: 6, height: 2, angle: 0.15, speed: 0.04, lookHeight: 1.2 }),
      1.6,
      { arc: 0.15 },
    );
    await ctx.wait(0.8);
    await ctx.ceremony('journey');
    await ctx.read('journey');
    ctx.look(null);
    // Across the lake, stopping at every milestone on the way: filmed from the water.
    ctx.cut(
      dolly(
        ctx.subject,
        (s, out) => out.set(Math.max(s.position.x + 7, 36), 3.7, s.position.z + 5),
        { fov: 42, lookHeight: 1.1 },
      ),
      1.2,
      { arc: 0.12 },
    );
    // Rise above the lake: the zig-zag, the plunge pool, the bell tower and the falls.
    const crane = () =>
      ctx.cut(
        move({
          path: [v(19, 2.4, -15.5), v(13.5, 8, -9), v(8.5, 15.5, -2.5)],
          times: [0, 4.6, 9.6],
          look: [
            { t: 0, at: pandaAt(ctx, 1) },
            { t: 3.6, at: pandaAt(ctx, 1) },
            { t: 9.6, at: v(36, 1, -25) },
          ],
          fov: [
            { t: 0, fov: 46 },
            { t: 9.6, fov: 50 },
          ],
        }),
        1.4,
        { arc: 0.15 },
      );
    if (ms.length < 2) {
      // no milestones to stop at: across the whole bridge, then the view
      await ctx.walk(bridge.slice(1, -1));
      crane();
    }
    // the view rises as the panda sets off for the second to last milestone
    const craneAt = Math.max(1, ms.length - 2);
    for (let k = 1; k < ms.length; k++) {
      const m = ms[k]!;
      // the bend of the bridge nearest this milestone
      let bend = bridge[1]!;
      for (const p of bridge) {
        if (Math.hypot(p[0] - m.x, p[1] - m.z) < Math.hypot(bend[0] - m.x, bend[1] - m.z)) bend = p;
      }
      const path = bridge.slice(1, bridge.indexOf(bend) + 1);
      const here = ctx.app.controller.position;
      const todo = path.filter((p, i) => i === path.length - 1 || p[1] < here.z - 0.5);
      await ctx.walk(todo.length ? todo : [bend]);
      ctx.look({ x: m.x, y: m.y + 1.4, z: m.z });
      ctx.face(m.x, m.z);
      await ctx.wait(1.3);
      ctx.look(null);
      if (k === craneAt) crane();
    }
    await ctx.wait(4);
  },
};

/* ------------------------------------------------------------------ Projects */

const projects: Chapter = {
  id: 'projects',
  section: 'projects',
  strip: { glyph: '作', label: 'Projects' },
  async run(ctx) {
    const start: XZ = [-2.7, 9.6];
    const banners = ctx.anchors.banners;
    const b0 = banners[0];
    await scene(ctx, start, yawTo(start, [-6, -2]), () =>
      track(ctx.subject, { distance: 5.5, height: 1.4, angle: 2.55, lookHeight: 1.3, fov: 42 }),
    );
    ctx.card('projects');
    ctx.caption(captionFor('projects', ctx.content));
    if (b0) {
      const stand = approach(-4.4, b0.z, b0.x, b0.z, 1.9);
      await ctx.walk([stand], { pace: 0.8 });
      ctx.face(b0.x, b0.z);
      ctx.look({ x: b0.x, y: b0.y + 1.4, z: b0.z });
      ctx.cut(
        orbit(v(stand[0], g(ctx, stand[0], stand[1]), stand[1]), {
          radius: 5.6,
          height: 1.9,
          angle: -0.85,
          speed: -0.03,
          lookHeight: 1.4,
          fov: 44,
        }),
        1.2,
      );
    }
    await ctx.wait(0.5);
    await ctx.ceremony('projects');
    await ctx.read('projects');
    ctx.look(null);
    // Cut to the last climb: banners flutter by as the pagoda rises ahead.
    const climb: XZ = [-15.4, -33.4];
    ctx.place(climb[0], climb[1], yawTo(climb, [-18.5, -43]));
    const door = ctx.anchors.pagodaDoor;
    // Low on the hilltop, beside the path, the panda climbing towards the camera.
    const yLow = g(ctx, -14.6, -44.6);
    ctx.cut(tripod(v(-14.6, yLow + 1.3, -44.6), ctx.panda, { fov: 42, lookHeight: 1.2 }));
    ctx.go([
      [-16, -35],
      [-18.5, -43],
      [door.x + 0.2, door.z + 2.4],
    ]);
    await ctx.until(() => ctx.app.controller.position.z < -40.5, 12);
    // Crane up the pagoda as the panda reaches its door.
    const top = ctx.anchors.pagoda;
    ctx.cut(
      move({
        path: [
          v(-15.5, door.y + 2, -36.5),
          v(-14.5, door.y + 9, -34.5),
          v(-13.2, door.y + 19, -31),
        ],
        duration: 8.5,
        look: [
          { t: 0, at: v(door.x, door.y + 1.5, door.z) },
          { t: 4, at: v(top.x, door.y + 8, top.z) },
          { t: 8.5, at: v(top.x, door.y + 15, top.z) },
        ],
        fov: 50,
      }),
      1.2,
      { arc: 0.12 },
    );
    await ctx.until(ctx.arrived, 10);
    ctx.face(door.x, door.z);
    await ctx.wait(6);
  },
};

/* ------------------------------------------------------------------ Contact */

const contact: Chapter = {
  id: 'contact',
  section: 'contact',
  strip: { glyph: '信', label: 'Contact' },
  async run(ctx) {
    const start: XZ = [27.4, -26.1];
    const bell = ctx.anchors.bell;
    // The bell tower, the waterfall behind it, the panda walking along the shore.
    await scene(ctx, start, yawTo(start, [31, -30]), () =>
      tripod(v(25.5, 6.4, -18.8), ctx.panda, { fov: 46, lookHeight: 2, drift: v(0.15, 0, -0.1) }),
    );
    const stand = approach(31, -30, bell.x, bell.z, 2.9);
    ctx.go([[31, -30], stand], { pace: 0.8 });
    // the title once the panda has left the last milestone (and its caption) behind
    const lastMs = ctx.anchors.milestones[ctx.anchors.milestones.length - 1];
    const c = ctx.app.controller.position;
    if (lastMs) await ctx.until(() => Math.hypot(c.x - lastMs.x, c.z - lastMs.z) > 10, 5);
    ctx.card('contact');
    ctx.caption(captionFor('contact', ctx.content));
    await ctx.until(ctx.arrived, 12);
    ctx.face(bell.x, bell.z);
    await ctx.wait(0.5);
    // In close on the bell as the striker swings.
    const near = approach(stand[0] - 1.5, stand[1] + 2.5, bell.x, bell.z, 5.2);
    ctx.cut(
      tripod(v(near[0], bell.y + 1.9, near[1]), v(bell.x, bell.y + 2.6, bell.z), {
        fov: 40,
        lookHeight: 0,
      }),
    );
    await ctx.wait(0.3);
    await ctx.bell();
    // Sky lanterns rise from the bell: the tower and the falls, the camera tilting up after
    // the lanterns and back down to the panda.
    ctx.cut(
      move({
        path: [
          v(29.5, bell.y + 2.2, -27.5),
          v(28.9, bell.y + 3.4, -26.6),
          v(28.6, bell.y + 3.9, -26.2),
        ],
        times: [0, 5, 9.5],
        look: [
          { t: 0, at: v(bell.x, bell.y + 2.2, bell.z) },
          { t: 3.2, at: v(bell.x + 1.5, bell.y + 9, bell.z - 0.5) },
          { t: 6.2, at: v(bell.x + 4, bell.y + 15, bell.z - 1) },
          { t: 9.5, at: v(bell.x - 1.5, bell.y + 1.6, bell.z + 1.2) },
        ],
        fov: [
          { t: 0, fov: 48 },
          { t: 6.2, fov: 54 },
          { t: 9.5, fov: 46 },
        ],
      }),
    );
    await ctx.wait(8.2);
    // The panda turns from the bell to the viewer for the discovery: the bow, the golden
    // light, the scroll.
    ctx.face(29.5, -27.5);
    await ctx.wait(0.6);
    const yS = g(ctx, 31.6, -29.2);
    ctx.cut(
      tripod(v(31.6, yS + 1.75, -29.2), ctx.panda, {
        fov: 42,
        lookHeight: 1.05,
        drift: v(0.06, 0.02, 0.05),
      }),
      1.4,
      { arc: 0.1 },
    );
    await ctx.wait(1.2);
    await ctx.ceremony('contact');
    await ctx.read('contact');
  },
};

/* ------------------------------------------------------------------ Epilogue */

const epilogue: Chapter = {
  id: 'epilogue',
  async run(ctx) {
    const bell = ctx.anchors.bell;
    // The panda sits down to meditate; the camera drifts up and away over the valley.
    ctx.meditate(true);
    const p = ctx.app.controller.position.clone();
    ctx.cut(
      move({
        path: [v(p.x - 3.5, p.y + 1.6, p.z + 4), v(p.x - 12, p.y + 12, p.z + 16), v(10, 46, 28)],
        duration: 15,
        look: [
          { t: 0, at: v(p.x, p.y + 0.9, p.z) },
          { t: 6, at: v(bell.x, bell.y + 4, bell.z) },
          { t: 15, at: v(18, 2, -12) },
        ],
        fov: 50,
      }),
      ctx.dark ? 0 : 1.2,
    );
    if (ctx.dark) await ctx.fadeIn(1.2);
    await ctx.wait(3);
    ctx.caption(captionFor('epilogue', ctx.content), 6);
    await ctx.wait(12);
    ctx.cut(
      orbit(v(4, 4, -6), { radius: 104, height: 46, angle: 0.4, speed: 0.03, lookHeight: 0 }),
      3,
    );
  },
};

export const CHAPTERS: Chapter[] = [
  prologue,
  welcome,
  about,
  skills,
  journey,
  projects,
  contact,
  epilogue,
];

/** Indices (into CHAPTERS) of the chapters that belong to a scroll, in order. */
export const SECTION_CHAPTERS: number[] = CHAPTERS.flatMap((c, i) => (c.section ? [i] : []));
