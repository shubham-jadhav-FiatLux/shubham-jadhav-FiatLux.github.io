import { Vector3 } from 'three';
import { sectionMeta, type SectionId } from '../content/sections';
import type { PortfolioContent, TourScene } from '../content/types';
import type { ChapterCard } from '../ui/TourOverlay';
import { sectionTitle } from '../ui/render';
import { sj_BRIDGE_POINTS } from '../world/layout';
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
 * written `up(ctx, x, h, z)` sit `sj_h` metres above the ground (or the water) at (x, z).
 */

export interface Chapter {
  id: TourScene;
  section?: SectionId;
  /** entry in the chapter strip (section chapters only) */
  strip?: { glyph: string; label: string };
  run(sj_ctx: TourContext): Promise<void>;
}

const sj_DEFAULT_CAPTIONS: Record<TourScene, string> = {
  prologue: 'Somewhere past the mist, a valley keeps a story.',
  welcome: 'Every journey starts at the gate.',
  about: 'Tea by the lake, and a little about me.',
  skills: 'Each training dummy guards a set of skills.',
  journey: 'Every turn of the bridge is a step along the way.',
  projects: 'Banners line the path to the pagoda, one for each project.',
  contact: 'Ring the bell to say hello.',
  epilogue: 'Thank you for walking the valley with me.',
};

export function captionFor(sj_scene: TourScene, sj_content: PortfolioContent): string {
  return sj_content.tour?.captions?.[sj_scene] ?? sj_DEFAULT_CAPTIONS[sj_scene];
}

export function chapterCard(sj_section: SectionId, sj_content: PortfolioContent): ChapterCard {
  const sj_meta = sectionMeta(sj_section);
  const sj_n = sj_SECTION_ORDER.indexOf(sj_section) + 1;
  return {
    glyph: sj_meta.glyph,
    kicker: `Chapter ${sj_n} · ${sj_meta.landmark}`,
    title: sectionTitle(sj_section, sj_content),
  };
}

const sj_SECTION_ORDER: SectionId[] = [
  'welcome',
  'about',
  'skills',
  'journey',
  'projects',
  'contact',
];

const sj_v = (sj_x: number, sj_y: number, sj_z: number) => new Vector3(sj_x, sj_y, sj_z);

/** Ground height at (x, z) (it can be below the water). */
function g(sj_ctx: TourContext, sj_x: number, sj_z: number): number {
  return sj_ctx.app.terrain.heightAt(sj_x, sj_z);
}

/** A point `sj_h` metres above the ground, or above the water where the ground is lower. */
function up(sj_ctx: TourContext, sj_x: number, sj_h: number, sj_z: number): Vector3 {
  return sj_v(sj_x, Math.max(0, g(sj_ctx, sj_x, sj_z)) + sj_h, sj_z);
}

/** Yaw that faces from a towards b. */
function yawTo(sj_a: XZ, sj_b: XZ): number {
  return Math.atan2(sj_b[0] - sj_a[0], sj_b[1] - sj_a[1]);
}

/** A moving target on the panda: `height` above its feet, `sj_ahead` metres in front. */
function pandaAt(sj_ctx: TourContext, sj_height = 1, sj_ahead = 0): () => Vector3 {
  const sj_out = new Vector3();
  return () => {
    const sj_s = sj_ctx.subject();
    return sj_out.set(
      sj_s.position.x + Math.sin(sj_s.yaw) * sj_ahead,
      sj_s.position.y + sj_height,
      sj_s.position.z + Math.cos(sj_s.yaw) * sj_ahead,
    );
  };
}

/**
 * Starts a scene: straight on if the panda is already there (the previous chapter led
 * here), otherwise through a fade to black, placing the panda while the screen is dark.
 * A skip can leave the picture black; the new scene then opens from black. `sj_blend`: how
 * the camera reaches the first shot when continuing (0 = a straight cut); `sj_setup` stages
 * the scene (while the screen is dark, when there is a fade).
 */
async function scene(
  sj_ctx: TourContext,
  sj_at: XZ,
  sj_yaw: number,
  sj_shot: () => Shot,
  sj_blend = 1.2,
  sj_setup?: () => void,
): Promise<void> {
  const sj_p = sj_ctx.app.controller.position;
  if (Math.hypot(sj_p.x - sj_at[0], sj_p.z - sj_at[1]) < 2.5 && !sj_ctx.dark) {
    sj_setup?.();
    sj_ctx.cut(sj_shot(), sj_blend);
    return;
  }
  if (!sj_ctx.dark) await sj_ctx.fadeOut(0.6);
  sj_ctx.place(sj_at[0], sj_at[1], sj_yaw);
  sj_setup?.();
  sj_ctx.cut(sj_shot());
  await sj_ctx.wait(0.2);
  await sj_ctx.fadeIn(1);
}

/* ------------------------------------------------------------------ Prologue */

const sj_prologue: Chapter = {
  id: 'prologue',
  async run(sj_ctx) {
    // The film opens from black. The panda waits at the start of the path, turned towards
    // where the camera lands (brought there in the dark when the film is watched again).
    const sj_p = sj_ctx.app.controller.position;
    if (!sj_ctx.dark) await sj_ctx.fadeOut(Math.hypot(sj_p.x, sj_p.z - 61) > 2.5 ? 0.6 : 0.35);
    sj_ctx.place(0, 61, 0);
    const sj_face = pandaAt(sj_ctx, 1.0);
    const sj_land = up(sj_ctx, 1.1, 1.55, 65);
    // A flight: from the waterfall, back over the lake and the bridge, over the village
    // roofs and the gate, down to the panda.
    sj_ctx.cut(
      move({
        path: [
          sj_v(47, 9.5, -12.5),
          sj_v(40, 15, -2),
          sj_v(34, 17, 16),
          sj_v(18, 14, 37),
          sj_v(13.5, 11.5, 57),
          sj_v(5.5, 4.4, 66.2),
          sj_land,
        ],
        times: [0, 4.6, 8.8, 12.4, 15.2, 17, 18.6],
        look: [
          { t: 0, at: sj_v(50, 8, -31) },
          { t: 3.4, at: sj_v(50, 8, -31) },
          { t: 6.8, at: sj_v(16, 1, -8) },
          { t: 9.6, at: sj_v(2, 3, 24) },
          { t: 13, at: up(sj_ctx, 0, 2.5, 51) },
          { t: 17.6, at: sj_face },
        ],
        fov: [
          { t: 0, fov: 48 },
          { t: 13, fov: 46 },
          { t: 18.6, fov: 33 },
        ],
      }),
    );
    await sj_ctx.fadeIn(1.6);
    await sj_ctx.wait(1.6);
    sj_ctx.title(true);
    await sj_ctx.wait(5.6);
    sj_ctx.title(false);
    await sj_ctx.wait(1.4);
    sj_ctx.caption(captionFor('prologue', sj_ctx.content), 4.6);
    await sj_ctx.wait(5.2);
    // The camera lands; the panda notices it, hops and waves to the viewer.
    sj_ctx.look('camera');
    await sj_ctx.wait(4.6);
    sj_ctx.cut(
      move({
        path: [sj_land, up(sj_ctx, 0.7, 1.15, 64.4), up(sj_ctx, 0.4, 1.0, 64.1)],
        duration: 7,
        ease: [0.3, 0, 0.35, 1],
        look: sj_face,
        fov: [
          { t: 0, fov: 33 },
          { t: 7, fov: 31 },
        ],
      }),
    );
    await sj_ctx.wait(0.4);
    sj_ctx.jump();
    await sj_ctx.wait(1.1);
    sj_ctx.emote('wave');
    await sj_ctx.wait(1.9);
    sj_ctx.emote('wave');
    await sj_ctx.wait(2.3);
  },
};

/* ------------------------------------------------------------------ Welcome */

const sj_welcome: Chapter = {
  id: 'welcome',
  section: 'welcome',
  strip: { glyph: '迎', label: 'Welcome' },
  async run(sj_ctx) {
    // Up the path to the gate, past the stone lanterns, seen through the bamboo.
    await scene(
      sj_ctx,
      [0, 61],
      Math.PI,
      () =>
        move({
          path: [
            up(sj_ctx, 11.8, 1.45, 61.5),
            up(sj_ctx, 11.6, 1.5, 57),
            up(sj_ctx, 11.0, 1.65, 52.5),
          ],
          times: [0, 2.7, 5.4],
          look: pandaAt(sj_ctx, 1.1, 1.8),
          fov: 34,
        }),
      0,
    );
    sj_ctx.look(null);
    sj_ctx.card('welcome');
    sj_ctx.caption(captionFor('welcome', sj_ctx.content));
    sj_ctx.go(
      [
        [0, 57],
        [0, 51.6],
      ],
      { pace: 0.55 },
    );
    await sj_ctx.until(() => sj_ctx.app.controller.position.z < 53.4, 9);
    // Through the gate: the camera waits on the far side and lets the panda come to it.
    const sj_y = g(sj_ctx, 0, 45);
    sj_ctx.cut(tripod(sj_v(2.6, sj_y + 2.2, 44.2), sj_ctx.panda, { fov: 40, lookHeight: 1.4 }));
    await sj_ctx.until(() => sj_ctx.app.controller.position.z < 52.2, 8);
    await sj_ctx.until(() => sj_ctx.app.controller.speed < 0.2, 3);
    sj_ctx.face(0, 44);
    // Seen through the gate while the panda bows.
    sj_ctx.cut(
      orbit(sj_ctx.panda, { radius: 6.4, height: 2.4, angle: 2.95, speed: -0.03, lookHeight: 1.5 }),
      1.2,
    );
    await sj_ctx.ceremony('welcome');
    await sj_ctx.read('welcome');
    // The valley opens up beyond the gate as the panda walks on.
    sj_ctx.go(
      [
        [0, 47],
        [-0.8, 42],
        [-0.4, 36.4],
      ],
      { pace: 0.7 },
    );
    const sj_y2 = g(sj_ctx, 0, 54);
    sj_ctx.cut(
      move({
        path: [
          sj_v(0.4, sj_y2 + 1.8, 54.5),
          sj_v(0.3, sj_y2 + 5.5, 55.6),
          sj_v(0, sj_y2 + 12, 57.5),
        ],
        duration: 6.5,
        look: [
          { t: 0, at: pandaAt(sj_ctx, 1.4) },
          { t: 2.2, at: pandaAt(sj_ctx, 1.4) },
          { t: 6.5, at: sj_v(3, 4, 12) },
        ],
        fov: [
          { t: 0, fov: 46 },
          { t: 6.5, fov: 52 },
        ],
      }),
      1,
    );
    await sj_ctx.wait(6);
  },
};

/* ------------------------------------------------------------------ About */

const sj_about: Chapter = {
  id: 'about',
  section: 'about',
  strip: { glyph: '我', label: 'About' },
  async run(sj_ctx) {
    // The signpost at the crossroads: which way to the pavilion? Seen from beside the
    // boards as the panda comes up the path from the gate and looks up at them.
    const sj_sign = sj_ctx.anchors.signpost;
    const sj_board = sj_sign.boards.about ?? { x: sj_sign.x, y: sj_sign.y + 2.8, z: sj_sign.z };
    const sj_read: XZ = [sj_sign.x - 1.8, sj_sign.z + 0.6];
    const sj_start: XZ = [-0.4, 36.4];
    await scene(
      sj_ctx,
      sj_start,
      Math.PI,
      () =>
        move({
          path: [
            up(sj_ctx, sj_sign.x - 4.8, 1.7, sj_sign.z - 5.8),
            up(sj_ctx, sj_sign.x - 3.4, 1.75, sj_sign.z - 4.1),
          ],
          duration: 7.5,
          look: [
            { t: 0, at: pandaAt(sj_ctx, 1.2) },
            { t: 3.2, at: pandaAt(sj_ctx, 1.4) },
            { t: 7.5, at: sj_v(sj_sign.x - 1, sj_sign.y + 1.85, sj_sign.z - 0.2) },
          ],
          fov: [
            { t: 0, fov: 46 },
            { t: 7.5, fov: 46 },
          ],
        }),
      0,
    );
    await sj_ctx.walk([sj_read], { pace: 0.6 });
    sj_ctx.face(sj_board.x, sj_board.z);
    sj_ctx.look({ x: sj_board.x, y: sj_board.y, z: sj_board.z });
    await sj_ctx.wait(1.4);
    sj_ctx.card('about');
    sj_ctx.caption(captionFor('about', sj_ctx.content));
    await sj_ctx.wait(2.4);
    sj_ctx.look(null);
    // Off towards the pavilion, past the old blossom tree; benches close four sides of the
    // pavilion, so round them to the shore-side entrance.
    const sj_table = sj_ctx.anchors.pavilionTable;
    const sj_door = sj_ctx.anchors.pavilionEntrance;
    const sj_stand = approach(sj_door.x, sj_door.z, sj_table.x, sj_table.z, 1.6);
    sj_ctx.go([
      [1.2, 26.4],
      [2.3, 20.6],
      [4.5, 15.5],
      [9.5, 9.6],
      [sj_door.x + sj_door.nx * 2.4, sj_door.z + sj_door.nz * 2.4],
      [sj_door.x, sj_door.z],
      sj_stand,
    ]);
    sj_ctx.cut(
      track(sj_ctx.subject, {
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
    await sj_ctx.until(() => sj_ctx.app.controller.position.z < 16.5, 9);
    // The pavilion ahead, the lake and the falls beyond it.
    const sj_yP = g(sj_ctx, 4.2, 19.4);
    sj_ctx.cut(
      tripod(sj_v(4.2, sj_yP + 5.4, 19.4), sj_ctx.panda, {
        fov: 44,
        lookHeight: 1.2,
        drift: sj_v(0.25, -0.05, -0.3),
      }),
      1.4,
      { arc: 0.1 },
    );
    await sj_ctx.until(sj_ctx.arrived, 16);
    sj_ctx.face(sj_table.x, sj_table.z);
    sj_ctx.look({ x: sj_table.x, y: sj_table.y + 0.4, z: sj_table.z });
    // Under the eaves, through the lake-side opening: the panda faces the camera across
    // the tea table (a slow drift that stays within that opening, clear of the benches).
    const sj_outward = Math.atan2(-sj_door.nx, -sj_door.nz);
    sj_ctx.cut(
      orbit(
        sj_v((sj_table.x + sj_stand[0]) / 2, sj_table.y - 0.8, (sj_table.z + sj_stand[1]) / 2),
        {
          radius: 6.2,
          height: 1.9,
          angle: sj_outward - 0.16,
          speed: 0.018,
          lookHeight: 1.05,
          fov: 42,
        },
      ),
    );
    await sj_ctx.wait(0.6);
    await sj_ctx.ceremony('about');
    await sj_ctx.read('about');
    await sj_ctx.wait(0.8);
  },
};

/* ------------------------------------------------------------------ Skills */

const sj_skills: Chapter = {
  id: 'skills',
  section: 'skills',
  strip: { glyph: '技', label: 'Skills' },
  async run(sj_ctx) {
    const sj_start: XZ = [-5.5, 21.9];
    // A run through the meadow: butterflies take off, the panda leaps after one.
    await scene(
      sj_ctx,
      sj_start,
      -Math.PI / 2,
      () =>
        move({
          path: [
            up(sj_ctx, -8.8, 0.85, 27.6),
            up(sj_ctx, -12.2, 0.9, 27.9),
            up(sj_ctx, -16.2, 1.0, 27.4),
          ],
          times: [0, 2.4, 4.8],
          look: pandaAt(sj_ctx, 0.9, 1.6),
          fov: 42,
          clearance: 0.3,
        }),
      0,
      () => {
        sj_ctx.stage.butterflies(-12.8, 22.4, 6, 1.6);
        sj_ctx.stage.butterflies(-11.6, 25.4, 4, 1.4);
      },
    );
    sj_ctx.card('skills');
    sj_ctx.caption(captionFor('skills', sj_ctx.content));
    sj_ctx.go(
      [
        [-8, 21.5],
        [-18, 19],
        [-27, 16.5],
        [-30.5, 15.6],
      ],
      { run: true, pace: 0.6 },
    );
    await sj_ctx.until(() => sj_ctx.app.controller.position.x < -12.4, 6);
    sj_ctx.jump();
    // Past the bamboo lining the way, seen through the culms.
    await sj_ctx.until(() => sj_ctx.app.controller.position.x < -16.5, 4);
    sj_ctx.cut(
      move({
        path: [
          up(sj_ctx, -16.8, 1.5, 28.6),
          up(sj_ctx, -21.6, 1.7, 27.6),
          up(sj_ctx, -27, 2.0, 25.9),
        ],
        times: [0, 2.1, 4.2],
        look: pandaAt(sj_ctx, 1.0, 2.5),
        fov: 36,
      }),
    );
    await sj_ctx.until(sj_ctx.arrived, 8);
    const sj_dummies = sj_ctx.anchors.dummies;
    const sj_yard: XZ = [-38, 15];
    const sj_last = sj_dummies.length - 1;
    const sj_d0 = sj_dummies[sj_last];
    if (!sj_d0) {
      await sj_ctx.ceremony('skills');
      await sj_ctx.read('skills');
      return;
    }
    const sj_spot = approach(sj_yard[0], sj_yard[1], sj_d0.x, sj_d0.z, 1.25);
    // The whole yard from among the bamboo, then in close for the first strike.
    const sj_yY = g(sj_ctx, -36, 28);
    sj_ctx.cut(
      move({
        path: [
          sj_v(-34.2, sj_yY + 2.2, 34.4),
          sj_v(-35.2, sj_yY + 4.5, 30.2),
          sj_v(-36, sj_yY + 6.5, 28.5),
        ],
        duration: 5,
        look: [
          { t: 0, at: pandaAt(sj_ctx, 1) },
          { t: 5, at: sj_v(-37.5, 2.2, 12) },
        ],
        fov: 46,
      }),
    );
    await sj_ctx.walk([sj_spot]);
    sj_ctx.face(sj_d0.x, sj_d0.z);
    await sj_ctx.wait(0.4);
    // Low, three-quarters in front of the panda, the dummy at the edge of the frame.
    const sj_dl = Math.hypot(sj_d0.x - sj_spot[0], sj_d0.z - sj_spot[1]) || 1;
    const sj_fx = (sj_d0.x - sj_spot[0]) / sj_dl;
    const sj_fz = (sj_d0.z - sj_spot[1]) / sj_dl;
    sj_ctx.cut(
      tripod(
        sj_v(
          sj_spot[0] + sj_fx * 2.6 - sj_fz * 3.4,
          sj_d0.y + 1,
          sj_spot[1] + sj_fz * 2.6 + sj_fx * 3.4,
        ),
        sj_v(sj_spot[0] + sj_fx * 0.6, sj_d0.y, sj_spot[1] + sj_fz * 0.6),
        { fov: 40, lookHeight: 0.8 },
      ),
    );
    await sj_ctx.wait(0.4);
    await sj_ctx.strike(sj_last);
    await sj_ctx.ceremony('skills');
    await sj_ctx.read('skills');
    // A round of the other dummies, each showing the skills it guards, filmed from the
    // south side of the yard and drifting west with the panda. (An orbit around the panda
    // swept the camera through the dummies, whose arms reach out on every side, through
    // their captions and over the drum.) The panda is held a little left of centre, so the
    // skill cards on the right never cover it.
    const sj_round: XZ = [sj_yard[0] + 4.2, sj_yard[1] + 6.2];
    const sj_feet = pandaAt(sj_ctx, 0);
    const sj_framed = new Vector3();
    sj_ctx.cut(
      tripod(
        sj_v(sj_round[0], g(sj_ctx, sj_round[0], sj_round[1]) + 3, sj_round[1]),
        () => {
          const sj_p = sj_feet();
          return sj_framed.set(sj_p.x + 1, sj_p.y, sj_p.z);
        },
        { fov: 44, lookHeight: 0.9, drift: sj_v(-0.16, 0, 0.12) },
      ),
      1.5,
    );
    const sj_groups = sj_ctx.content.skills.groups;
    for (let sj_i = sj_last - 1; sj_i >= 0; sj_i--) {
      const sj_d = sj_dummies[sj_i]!;
      const sj_at = approach(sj_yard[0], sj_yard[1], sj_d.x, sj_d.z, 1.25);
      await sj_ctx.walk([sj_at]);
      sj_ctx.face(sj_d.x, sj_d.z);
      await sj_ctx.wait(0.45);
      await sj_ctx.strike(sj_i);
      const sj_group = sj_groups[sj_i];
      if (sj_group)
        sj_ctx.callout(
          {
            glyph: '技',
            kicker: 'Skills',
            title: sj_group.name,
            items: sj_group.items.map((sj_item) => sj_item.name),
          },
          2.8,
        );
      await sj_ctx.wait(1.6);
    }
    // And one beat on the big drum.
    const sj_drum = sj_ctx.anchors.drum;
    const sj_at = approach(sj_yard[0], sj_yard[1], sj_drum.x, sj_drum.z, 1.7);
    await sj_ctx.walk([sj_at], { run: true });
    sj_ctx.face(sj_drum.x, sj_drum.z);
    const sj_yD = g(sj_ctx, sj_drum.x - 5, sj_drum.z + 5.5);
    // (eased in: the round above has drifted to almost the same place)
    sj_ctx.cut(
      tripod(sj_v(sj_drum.x - 5.5, sj_yD + 2.4, sj_drum.z + 5.8), sj_ctx.panda, {
        fov: 44,
        lookHeight: 0.8,
      }),
      1.2,
    );
    await sj_ctx.wait(0.6);
    await sj_ctx.drum();
    await sj_ctx.wait(1.4);
  },
};

/* ------------------------------------------------------------------ Journey */

const sj_journey: Chapter = {
  id: 'journey',
  section: 'journey',
  strip: { glyph: '路', label: 'Journey' },
  async run(sj_ctx) {
    const sj_start: XZ = [17.5, 38.4];
    const sj_ms = sj_ctx.anchors.milestones;
    const sj_bridge = sj_BRIDGE_POINTS as XZ[];
    // the first milestone (or, with no journey entries, the first bend of the bridge)
    const sj_first = sj_ms[0] ?? {
      x: sj_bridge[1]![0],
      y: g(sj_ctx, sj_bridge[1]![0], sj_bridge[1]![1]),
      z: sj_bridge[1]![1],
    };
    // Down the village street, under the strings of paper lanterns.
    await scene(sj_ctx, sj_start, Math.PI / 2, () =>
      move({
        path: [
          up(sj_ctx, 12.2, 0.9, 38.9),
          up(sj_ctx, 13.6, 1.05, 39.0),
          up(sj_ctx, 14.8, 1.25, 39.1),
        ],
        times: [0, 3.2, 6.4],
        look: [
          { t: 0, at: pandaAt(sj_ctx, 1.2, 3) },
          { t: 6.4, at: up(sj_ctx, 30, 3.2, 37.6) },
        ],
        fov: 44,
      }),
    );
    sj_ctx.go(
      [
        [22, 38.5],
        [28, 38.2],
        [31.6, 35.5],
        [32.6, 30],
        [33.6, 22.5],
      ],
      { pace: 0.75 },
    );
    await sj_ctx.wait(5.6);
    // Out of the village towards the lake, the falls beyond the roofs.
    sj_ctx.cut(
      move({
        path: [up(sj_ctx, 32, 4, 45.5), up(sj_ctx, 32.1, 6.5, 46.5), up(sj_ctx, 32.2, 9.5, 47.5)],
        duration: 7,
        look: [
          { t: 0, at: pandaAt(sj_ctx, 1.2) },
          { t: 7, at: up(sj_ctx, 33, 1, 22) },
        ],
        fov: 48,
      }),
    );
    sj_ctx.card('journey');
    sj_ctx.caption(captionFor('journey', sj_ctx.content));
    await sj_ctx.wait(6.4);
    // Down to the water: lily pads and koi below, one leaps; then up over the willow on the
    // shore and round to the panda waiting at the bridge, the lake and the falls beyond.
    const sj_head: XZ = [31.4, 12.8];
    sj_ctx.stage.koi(20.5, -4, 7, 0.6);
    sj_ctx.cut(
      move({
        path: [
          sj_v(17.2, 0.55, -11.5),
          sj_v(20, 0.6, -5),
          sj_v(21, 2.2, -0.5),
          sj_v(21.3, 6.8, 3.6),
          sj_v(21.5, 7.8, 9),
          up(sj_ctx, 21.7, 3.6, 19.2),
        ],
        times: [0, 2.8, 5.2, 6.6, 8, 10.8],
        look: [
          { t: 0, at: sj_v(21, -0.3, -4) },
          { t: 2.8, at: sj_v(22, -0.2, 1) },
          { t: 5.2, at: sj_v(24, 0.3, 6) },
          { t: 7.2, at: sj_v(30.5, 1, 10) },
          { t: 10.8, at: sj_v(32, 1.4, 6) },
        ],
        fov: [
          { t: 0, fov: 42 },
          { t: 10.8, fov: 46 },
        ],
        clearance: 0.35,
      }),
    );
    sj_ctx.place(sj_head[0], sj_head[1], yawTo(sj_head, sj_bridge[1]!));
    await sj_ctx.wait(2.1);
    sj_ctx.stage.leap(21.3, -2.5);
    await sj_ctx.wait(8.9);
    // The first milestone, the discovery, the scroll.
    sj_ctx.face(sj_first.x, sj_first.z);
    sj_ctx.look({ x: sj_first.x, y: sj_first.y + 1.2, z: sj_first.z });
    sj_ctx.cut(
      orbit(sj_ctx.panda, { radius: 6, height: 2, angle: 0.15, speed: 0.04, lookHeight: 1.2 }),
      1.6,
      { arc: 0.15 },
    );
    await sj_ctx.wait(0.8);
    await sj_ctx.ceremony('journey');
    await sj_ctx.read('journey');
    sj_ctx.look(null);
    // Across the lake, stopping at every milestone on the way: filmed from the water.
    sj_ctx.cut(
      dolly(
        sj_ctx.subject,
        (sj_s, sj_out) => sj_out.set(Math.max(sj_s.position.x + 7, 36), 3.7, sj_s.position.z + 5),
        { fov: 42, lookHeight: 1.1 },
      ),
      1.2,
      { arc: 0.12 },
    );
    // Rise above the lake: the zig-zag, the plunge pool, the bell tower and the falls.
    const sj_crane = () =>
      sj_ctx.cut(
        move({
          path: [sj_v(19, 2.4, -15.5), sj_v(13.5, 8, -9), sj_v(8.5, 15.5, -2.5)],
          times: [0, 4.6, 9.6],
          look: [
            { t: 0, at: pandaAt(sj_ctx, 1) },
            { t: 3.6, at: pandaAt(sj_ctx, 1) },
            { t: 9.6, at: sj_v(36, 1, -25) },
          ],
          fov: [
            { t: 0, fov: 46 },
            { t: 9.6, fov: 50 },
          ],
        }),
        1.4,
        { arc: 0.15 },
      );
    if (sj_ms.length < 2) {
      // no milestones to stop at: across the whole bridge, then the view
      await sj_ctx.walk(sj_bridge.slice(1, -1));
      sj_crane();
    }
    // the view rises as the panda sets off for the second to last milestone
    const sj_craneAt = Math.max(1, sj_ms.length - 2);
    for (let sj_k = 1; sj_k < sj_ms.length; sj_k++) {
      const sj_m = sj_ms[sj_k]!;
      // the bend of the bridge nearest this milestone
      let sj_bend = sj_bridge[1]!;
      for (const sj_p of sj_bridge) {
        if (
          Math.hypot(sj_p[0] - sj_m.x, sj_p[1] - sj_m.z) <
          Math.hypot(sj_bend[0] - sj_m.x, sj_bend[1] - sj_m.z)
        )
          sj_bend = sj_p;
      }
      const sj_path = sj_bridge.slice(1, sj_bridge.indexOf(sj_bend) + 1);
      const sj_here = sj_ctx.app.controller.position;
      const sj_todo = sj_path.filter(
        (sj_p, sj_i) => sj_i === sj_path.length - 1 || sj_p[1] < sj_here.z - 0.5,
      );
      await sj_ctx.walk(sj_todo.length ? sj_todo : [sj_bend]);
      sj_ctx.look({ x: sj_m.x, y: sj_m.y + 1.4, z: sj_m.z });
      sj_ctx.face(sj_m.x, sj_m.z);
      await sj_ctx.wait(1.3);
      sj_ctx.look(null);
      if (sj_k === sj_craneAt) sj_crane();
    }
    await sj_ctx.wait(4);
  },
};

/* ------------------------------------------------------------------ Projects */

const sj_projects: Chapter = {
  id: 'projects',
  section: 'projects',
  strip: { glyph: '作', label: 'Projects' },
  async run(sj_ctx) {
    const sj_start: XZ = [-2.7, 9.6];
    const sj_banners = sj_ctx.anchors.banners;
    const sj_b0 = sj_banners[0];
    await scene(sj_ctx, sj_start, yawTo(sj_start, [-6, -2]), () =>
      track(sj_ctx.subject, { distance: 5.5, height: 1.4, angle: 2.55, lookHeight: 1.3, fov: 42 }),
    );
    sj_ctx.card('projects');
    sj_ctx.caption(captionFor('projects', sj_ctx.content));
    if (sj_b0) {
      const sj_stand = approach(-4.4, sj_b0.z, sj_b0.x, sj_b0.z, 1.9);
      await sj_ctx.walk([sj_stand], { pace: 0.8 });
      sj_ctx.face(sj_b0.x, sj_b0.z);
      sj_ctx.look({ x: sj_b0.x, y: sj_b0.y + 1.4, z: sj_b0.z });
      sj_ctx.cut(
        orbit(sj_v(sj_stand[0], g(sj_ctx, sj_stand[0], sj_stand[1]), sj_stand[1]), {
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
    await sj_ctx.wait(0.5);
    await sj_ctx.ceremony('projects');
    await sj_ctx.read('projects');
    sj_ctx.look(null);
    // Cut to the last climb: banners flutter by as the pagoda rises ahead.
    const sj_climb: XZ = [-15.4, -33.4];
    sj_ctx.place(sj_climb[0], sj_climb[1], yawTo(sj_climb, [-18.5, -43]));
    const sj_door = sj_ctx.anchors.pagodaDoor;
    // Low on the hilltop, beside the path, the panda climbing towards the camera.
    const sj_yLow = g(sj_ctx, -14.6, -44.6);
    sj_ctx.cut(
      tripod(sj_v(-14.6, sj_yLow + 1.3, -44.6), sj_ctx.panda, { fov: 42, lookHeight: 1.2 }),
    );
    sj_ctx.go([
      [-16, -35],
      [-18.5, -43],
      [sj_door.x + 0.2, sj_door.z + 2.4],
    ]);
    await sj_ctx.until(() => sj_ctx.app.controller.position.z < -40.5, 12);
    // Crane up the pagoda as the panda reaches its door.
    const sj_top = sj_ctx.anchors.pagoda;
    sj_ctx.cut(
      move({
        path: [
          sj_v(-15.5, sj_door.y + 2, -36.5),
          sj_v(-14.5, sj_door.y + 9, -34.5),
          sj_v(-13.2, sj_door.y + 19, -31),
        ],
        duration: 8.5,
        look: [
          { t: 0, at: sj_v(sj_door.x, sj_door.y + 1.5, sj_door.z) },
          { t: 4, at: sj_v(sj_top.x, sj_door.y + 8, sj_top.z) },
          { t: 8.5, at: sj_v(sj_top.x, sj_door.y + 15, sj_top.z) },
        ],
        fov: 50,
      }),
      1.2,
      { arc: 0.12 },
    );
    await sj_ctx.until(sj_ctx.arrived, 10);
    sj_ctx.face(sj_door.x, sj_door.z);
    await sj_ctx.wait(6);
  },
};

/* ------------------------------------------------------------------ Contact */

const sj_contact: Chapter = {
  id: 'contact',
  section: 'contact',
  strip: { glyph: '信', label: 'Contact' },
  async run(sj_ctx) {
    const sj_start: XZ = [27.4, -26.1];
    const sj_bell = sj_ctx.anchors.bell;
    // The bell tower, the waterfall behind it, the panda walking along the shore.
    await scene(sj_ctx, sj_start, yawTo(sj_start, [31, -30]), () =>
      tripod(sj_v(25.5, 6.4, -18.8), sj_ctx.panda, {
        fov: 46,
        lookHeight: 2,
        drift: sj_v(0.15, 0, -0.1),
      }),
    );
    const sj_stand = approach(31, -30, sj_bell.x, sj_bell.z, 2.9);
    sj_ctx.go([[31, -30], sj_stand], { pace: 0.8 });
    // the title once the panda has left the last milestone (and its caption) behind
    const sj_lastMs = sj_ctx.anchors.milestones[sj_ctx.anchors.milestones.length - 1];
    const sj_c = sj_ctx.app.controller.position;
    if (sj_lastMs)
      await sj_ctx.until(() => Math.hypot(sj_c.x - sj_lastMs.x, sj_c.z - sj_lastMs.z) > 10, 5);
    sj_ctx.card('contact');
    sj_ctx.caption(captionFor('contact', sj_ctx.content));
    await sj_ctx.until(sj_ctx.arrived, 12);
    sj_ctx.face(sj_bell.x, sj_bell.z);
    await sj_ctx.wait(0.5);
    // In close on the bell as the striker swings.
    const sj_near = approach(sj_stand[0] - 1.5, sj_stand[1] + 2.5, sj_bell.x, sj_bell.z, 5.2);
    sj_ctx.cut(
      tripod(
        sj_v(sj_near[0], sj_bell.y + 1.9, sj_near[1]),
        sj_v(sj_bell.x, sj_bell.y + 2.6, sj_bell.z),
        {
          fov: 40,
          lookHeight: 0,
        },
      ),
    );
    await sj_ctx.wait(0.3);
    await sj_ctx.bell();
    // Sky lanterns rise from the bell: the tower and the falls, the camera tilting up after
    // the lanterns and back down to the panda.
    sj_ctx.cut(
      move({
        path: [
          sj_v(29.5, sj_bell.y + 2.2, -27.5),
          sj_v(28.9, sj_bell.y + 3.4, -26.6),
          sj_v(28.6, sj_bell.y + 3.9, -26.2),
        ],
        times: [0, 5, 9.5],
        look: [
          { t: 0, at: sj_v(sj_bell.x, sj_bell.y + 2.2, sj_bell.z) },
          { t: 3.2, at: sj_v(sj_bell.x + 1.5, sj_bell.y + 9, sj_bell.z - 0.5) },
          { t: 6.2, at: sj_v(sj_bell.x + 4, sj_bell.y + 15, sj_bell.z - 1) },
          { t: 9.5, at: sj_v(sj_bell.x - 1.5, sj_bell.y + 1.6, sj_bell.z + 1.2) },
        ],
        fov: [
          { t: 0, fov: 48 },
          { t: 6.2, fov: 54 },
          { t: 9.5, fov: 46 },
        ],
      }),
    );
    await sj_ctx.wait(8.2);
    // The panda turns from the bell to the viewer for the discovery: the bow, the golden
    // light, the scroll.
    sj_ctx.face(29.5, -27.5);
    await sj_ctx.wait(0.6);
    const sj_yS = g(sj_ctx, 31.6, -29.2);
    sj_ctx.cut(
      tripod(sj_v(31.6, sj_yS + 1.75, -29.2), sj_ctx.panda, {
        fov: 42,
        lookHeight: 1.05,
        drift: sj_v(0.06, 0.02, 0.05),
      }),
      1.4,
      { arc: 0.1 },
    );
    await sj_ctx.wait(1.2);
    await sj_ctx.ceremony('contact');
    await sj_ctx.read('contact');
  },
};

/* ------------------------------------------------------------------ Epilogue */

const sj_epilogue: Chapter = {
  id: 'epilogue',
  async run(sj_ctx) {
    const sj_bell = sj_ctx.anchors.bell;
    // The panda sits down to meditate; the camera drifts up and away over the valley.
    sj_ctx.meditate(true);
    const sj_p = sj_ctx.app.controller.position.clone();
    sj_ctx.cut(
      move({
        path: [
          sj_v(sj_p.x - 3.5, sj_p.y + 1.6, sj_p.z + 4),
          sj_v(sj_p.x - 12, sj_p.y + 12, sj_p.z + 16),
          sj_v(10, 46, 28),
        ],
        duration: 15,
        look: [
          { t: 0, at: sj_v(sj_p.x, sj_p.y + 0.9, sj_p.z) },
          { t: 6, at: sj_v(sj_bell.x, sj_bell.y + 4, sj_bell.z) },
          { t: 15, at: sj_v(18, 2, -12) },
        ],
        fov: 50,
      }),
      sj_ctx.dark ? 0 : 1.2,
    );
    if (sj_ctx.dark) await sj_ctx.fadeIn(1.2);
    await sj_ctx.wait(3);
    sj_ctx.caption(captionFor('epilogue', sj_ctx.content), 6);
    await sj_ctx.wait(12);
    sj_ctx.cut(
      orbit(sj_v(4, 4, -6), { radius: 104, height: 46, angle: 0.4, speed: 0.03, lookHeight: 0 }),
      3,
    );
  },
};

export const sj_CHAPTERS: Chapter[] = [
  sj_prologue,
  sj_welcome,
  sj_about,
  sj_skills,
  sj_journey,
  sj_projects,
  sj_contact,
  sj_epilogue,
];

/** Indices (into CHAPTERS) of the chapters that belong to a scroll, in order. */
export const sj_SECTION_CHAPTERS: number[] = sj_CHAPTERS.flatMap((sj_c, sj_i) =>
  sj_c.section ? [sj_i] : [],
);
