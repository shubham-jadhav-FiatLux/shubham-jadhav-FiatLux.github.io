import { Vector3 } from 'three';
import { sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent, TourScene } from '../content/types';
import type { ChapterCard } from '../ui/TourOverlay';
import { sectionTitle } from '../ui/render';
import { BRIDGE_POINTS } from '../world/layout';
import { approach, type XZ } from './route';
import { dolly, orbit, rail, tripod, track, type Shot } from './shots';
import type { TourContext } from './Tour';

/**
 * The film. A prologue over the valley, one chapter per scroll in the order a visitor
 * would find them, and an epilogue. Chapters start with a scene change (a fade, or a
 * straight continuation), then walk the panda through its landmark while the camera
 * follows a small shot list, play the discovery and hold the scroll long enough to read.
 *
 * Coordinates are world metres (x east, z south, y up); see src/world/layout.ts.
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

/** Ground height at (x, z). */
function g(ctx: TourContext, x: number, z: number): number {
  return ctx.app.terrain.heightAt(x, z);
}

/** Yaw that faces from a towards b. */
function yawTo(a: XZ, b: XZ): number {
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

/**
 * Starts a scene: straight on if the panda is already there (the previous chapter led
 * here), otherwise through a fade to black, placing the panda while the screen is dark.
 * A skip can leave the picture black; the new scene then opens from black.
 */
async function scene(ctx: TourContext, at: XZ, yaw: number, shot: () => Shot): Promise<void> {
  const p = ctx.app.controller.position;
  if (Math.hypot(p.x - at[0], p.z - at[1]) < 2.5 && !ctx.dark) {
    ctx.cut(shot(), 1.2);
    return;
  }
  if (!ctx.dark) await ctx.fadeOut(0.6);
  ctx.place(at[0], at[1], yaw);
  ctx.cut(shot());
  await ctx.wait(0.2);
  await ctx.fadeIn(1);
}

/* ------------------------------------------------------------------ Prologue */

const prologue: Chapter = {
  id: 'prologue',
  async run(ctx) {
    // The panda waits at the start of the path, turned towards the camera (brought there
    // in the dark when the film is watched again).
    const p = ctx.app.controller.position;
    if (Math.hypot(p.x, p.z - 61) > 2.5 && !ctx.dark) await ctx.fadeOut(0.6);
    ctx.place(0, 61, 0);
    ctx.cut(
      rail({
        path: [v(40, 36, 74), v(22, 27, 76), v(8, 18, 75), v(2, 8, 70), v(0.6, 3.6, 66)],
        look: [v(18, 3, -18), v(8, 4, 4), v(2, 4.5, 30), v(0, 3.2, 54), v(0, 2.6, 60.5)],
        duration: 12,
        fov: 46,
      }),
      ctx.dark ? 0 : 2.2,
    );
    await ctx.fadeIn(0.8);
    await ctx.wait(1.4);
    ctx.title(true);
    await ctx.wait(5.2);
    ctx.title(false);
    ctx.caption(captionFor('prologue', ctx.content), 4.5);
    await ctx.wait(5.2);
    // Close on the panda, who waves hello.
    const y = g(ctx, 0, 61);
    ctx.cut(tripod(v(0.9, y + 1.45, 64.6), ctx.panda, { fov: 36, lookHeight: 0.95 }), 1.3);
    await ctx.wait(1);
    ctx.emote('wave');
    await ctx.wait(2.4);
  },
};

/* ------------------------------------------------------------------ Welcome */

const welcome: Chapter = {
  id: 'welcome',
  section: 'welcome',
  strip: { glyph: '迎', label: 'Welcome' },
  async run(ctx) {
    // Following the panda as it turns and sets off for the gate.
    await scene(ctx, [0, 61], 0, () =>
      track(ctx.subject, {
        distance: 5.4,
        height: 2,
        angle: 0.35,
        lookHeight: 1.7,
        lookAhead: 3,
        fov: 44,
      }),
    );
    ctx.card('welcome');
    ctx.caption(captionFor('welcome', ctx.content));
    ctx.go([
      [0, 57],
      [0, 51.6],
    ]);
    await ctx.until(() => ctx.app.controller.position.z < 55.5, 12);
    // Through the gate: the camera waits on the far side and lets the panda come to it.
    const y = g(ctx, 0, 45);
    ctx.cut(tripod(v(2.6, y + 2.2, 44.2), ctx.panda, { fov: 40, lookHeight: 1.4 }));
    await ctx.until(() => ctx.app.controller.position.z < 52.2, 10);
    await ctx.until(() => ctx.app.controller.speed < 0.2, 3);
    ctx.face(0, 44);
    // Seen through the gate while the panda bows.
    ctx.cut(
      orbit(ctx.panda, { radius: 6.4, height: 2.4, angle: 2.55, speed: -0.07, lookHeight: 1.5 }),
      1.2,
    );
    await ctx.ceremony('welcome');
    await ctx.read('welcome');
    // The valley opens up beyond the gate.
    ctx.go([
      [0, 47],
      [-0.8, 42],
    ]);
    const y2 = g(ctx, 0, 54);
    ctx.cut(
      rail({
        path: [v(0.4, y2 + 1.8, 54.5), v(0.2, y2 + 6, 55.5), v(0, y2 + 12, 57)],
        look: [v(0, y2 + 1.5, 48), v(0.5, 5, 30), v(3, 4, 12)],
        duration: 6,
        fov: 50,
      }),
      1,
    );
    await ctx.wait(5.2);
  },
};

/* ------------------------------------------------------------------ About */

const about: Chapter = {
  id: 'about',
  section: 'about',
  strip: { glyph: '我', label: 'About' },
  async run(ctx) {
    const start: XZ = [1.4, 19.8];
    const yC = g(ctx, 0, 22);
    // A crane down beside the old blossom tree at the crossroads, onto the panda.
    await scene(ctx, start, yawTo(start, [4.5, 15.5]), () =>
      rail({
        path: [v(11, yC + 10, 26), v(8.5, yC + 5.5, 22.5), v(6.5, yC + 2.6, 19)],
        look: () => ctx.panda().setY(ctx.panda().y + 1),
        duration: 5.5,
        fov: 46,
      }),
    );
    ctx.card('about');
    ctx.caption(captionFor('about', ctx.content));
    // Benches close four sides of the pavilion: round them to the shore-side entrance.
    const table = ctx.anchors.pavilionTable;
    const door = ctx.anchors.pavilionEntrance;
    const stand = approach(door.x, door.z, table.x, table.z, 1.6);
    ctx.go([
      [4.5, 15.5],
      [9.5, 9.6],
      [door.x + door.nx * 2.4, door.z + door.nz * 2.4],
      [door.x, door.z],
      stand,
    ]);
    await ctx.wait(4.6);
    // The pavilion ahead, the lake and the falls beyond it.
    const yP = g(ctx, 4.2, 19.4);
    ctx.cut(
      tripod(v(4.2, yP + 5.4, 19.4), ctx.panda, {
        fov: 44,
        lookHeight: 1.2,
        drift: v(0.25, -0.05, -0.3),
      }),
      1.4,
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
      1.4,
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
    const start: XZ = [-12.5, 20.6];
    // Running to the training grounds, filmed from the side through the grass.
    await scene(ctx, start, yawTo(start, [-18, 19]), () =>
      track(ctx.subject, { distance: 5.2, height: 1.2, angle: -1.45, lookHeight: 0.9, fov: 40 }),
    );
    ctx.card('skills');
    ctx.caption(captionFor('skills', ctx.content));
    await ctx.walk(
      [
        [-18, 19],
        [-27, 16.5],
        [-30.5, 15.6],
      ],
      { run: true },
    );
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
    // The whole yard, then in close for the first strike.
    const yY = g(ctx, -36, 28);
    ctx.cut(
      tripod(v(-36, yY + 6.5, 28.5), v(-37.5, 2.2, 12), { fov: 46, lookHeight: 0, stiffness: 1.2 }),
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
    // A quick round of the other dummies.
    ctx.cut(
      orbit(ctx.panda, { radius: 7.5, height: 2.6, angle: 2.6, speed: -0.16, lookHeight: 1 }),
      1,
    );
    for (let i = last - 1; i >= 0; i--) {
      const d = dummies[i]!;
      const at = approach(yard[0], yard[1], d.x, d.z, 1.25);
      await ctx.walk([at]);
      ctx.face(d.x, d.z);
      await ctx.wait(0.45);
      await ctx.strike(i);
    }
    // And one beat on the big drum.
    const drum = ctx.anchors.drum;
    const at = approach(yard[0], yard[1], drum.x, drum.z, 1.7);
    await ctx.walk([at], { run: true });
    ctx.face(drum.x, drum.z);
    const yD = g(ctx, drum.x - 5, drum.z + 5.5);
    ctx.cut(
      tripod(v(drum.x - 5.5, yD + 2.4, drum.z + 5.8), ctx.panda, { fov: 44, lookHeight: 0.8 }),
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
    const start: XZ = [27.6, 13.7];
    const ms = ctx.anchors.milestones;
    const bridge = BRIDGE_POINTS as XZ[];
    // the first milestone (or, with no journey entries, the first bend of the bridge)
    const first = ms[0] ?? {
      x: bridge[1]![0],
      y: g(ctx, bridge[1]![0], bridge[1]![1]),
      z: bridge[1]![1],
    };
    await scene(ctx, start, yawTo(start, [32, 12.5]), () =>
      tripod(v(37.2, 2.8, 7.2), ctx.panda, { fov: 40, lookHeight: 1.1 }),
    );
    ctx.card('journey');
    ctx.caption(captionFor('journey', ctx.content));
    await ctx.walk([[31.4, 12.8]]);
    ctx.face(first.x, first.z);
    ctx.look({ x: first.x, y: first.y + 1.2, z: first.z });
    ctx.cut(
      orbit(ctx.panda, { radius: 5.8, height: 2.2, angle: 0.9, speed: 0.1, lookHeight: 1.3 }),
      1.2,
    );
    await ctx.wait(0.4);
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
    );
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
      if (k === ms.length - 2) {
        // Rise above the lake to show the zig-zag as a whole.
        ctx.cut(
          rail({
            path: [v(38, 5, -12), v(41, 13, -20), v(40, 24, -32)],
            look: [v(30, 1, -16), v(29, 0.6, -10), v(28, 0.6, -6)],
            duration: 9,
            fov: 48,
          }),
          1.2,
        );
      }
    }
    await ctx.wait(1.5);
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
      await ctx.walk([stand]);
      ctx.face(b0.x, b0.z);
      ctx.look({ x: b0.x, y: b0.y + 1.4, z: b0.z });
      ctx.cut(
        orbit(v(stand[0], g(ctx, stand[0], stand[1]), stand[1]), {
          radius: 6,
          height: 2.2,
          angle: 1.2,
          speed: 0.09,
          lookHeight: 1.5,
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
      rail({
        path: [
          v(-15.5, door.y + 2, -36.5),
          v(-14.5, door.y + 9, -34.5),
          v(-13.2, door.y + 19, -31),
        ],
        look: [
          v(door.x, door.y + 1.5, door.z),
          v(top.x, door.y + 8, top.z),
          v(top.x, door.y + 15, top.z),
        ],
        duration: 8,
        fov: 50,
      }),
      1.2,
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
    ctx.card('contact');
    ctx.caption(captionFor('contact', ctx.content));
    const stand = approach(31, -30, bell.x, bell.z, 2.9);
    await ctx.walk([[31, -30], stand]);
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
    // Sky lanterns rise from the bell: follow them up over the falls.
    ctx.cut(
      rail({
        path: [
          v(near[0], bell.y + 1.9, near[1]),
          v(near[0] - 3, bell.y + 3.5, near[1] + 4),
          v(near[0] - 7, bell.y + 5, near[1] + 9),
        ],
        look: [
          v(bell.x, bell.y + 3, bell.z),
          v(bell.x + 1, bell.y + 10, bell.z - 2),
          v(bell.x + 3, bell.y + 20, bell.z - 5),
        ],
        duration: 6,
        fov: 50,
      }),
    );
    await ctx.wait(1.3);
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
      rail({
        path: [v(p.x - 3.5, p.y + 1.6, p.z + 4), v(p.x - 12, p.y + 12, p.z + 16), v(10, 46, 28)],
        look: [v(p.x, p.y + 0.9, p.z), v(bell.x, bell.y + 4, bell.z), v(18, 2, -12)],
        duration: 15,
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
