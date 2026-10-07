import { describe, expect, it } from 'vitest';
import { Cancelled, readingTime, Ticket, Timeline } from '../src/tour/timeline';
import { approach, Route } from '../src/tour/route';

/** Lets pending promise continuations run. */
const sj_flush = () => new Promise<void>((sj_r) => setTimeout(sj_r, 0));

describe('tour timeline', () => {
  it('resolves waits on script time, not wall time', async () => {
    const sj_tl = new Timeline();
    const sj_ticket = new Ticket();
    let sj_done = false;
    void sj_tl.wait(1, sj_ticket).then(() => (sj_done = true));
    sj_tl.update(0.5);
    await sj_flush();
    expect(sj_done).toBe(false);
    sj_tl.update(0.6);
    await sj_flush();
    expect(sj_done).toBe(true);
  });

  it('holds still while paused and runs faster when scaled', async () => {
    const sj_tl = new Timeline();
    const sj_ticket = new Ticket();
    let sj_done = false;
    void sj_tl.wait(2, sj_ticket).then(() => (sj_done = true));
    sj_tl.paused = true;
    for (let sj_i = 0; sj_i < 100; sj_i++) sj_tl.update(0.05);
    await sj_flush();
    expect(sj_done).toBe(false);
    sj_tl.paused = false;
    sj_tl.scale = 4;
    sj_tl.update(0.5);
    await sj_flush();
    expect(sj_done).toBe(true);
  });

  it('cancels every wait on a ticket', async () => {
    const sj_tl = new Timeline();
    const sj_ticket = new Ticket();
    const sj_a = sj_tl.wait(5, sj_ticket);
    const sj_b = sj_tl.until(() => false, sj_ticket);
    sj_ticket.cancel();
    await expect(sj_a).rejects.toBeInstanceOf(Cancelled);
    await expect(sj_b).rejects.toBeInstanceOf(Cancelled);
    expect(sj_tl.pending).toBe(0);
    // new waits on a cancelled ticket fail straight away
    expect(() => sj_tl.wait(1, sj_ticket)).toThrow(Cancelled);
  });

  it('gives up on a condition after its timeout', async () => {
    const sj_tl = new Timeline();
    let sj_done = false;
    void sj_tl.until(() => false, new Ticket(), 1).then(() => (sj_done = true));
    sj_tl.update(1.01);
    await sj_flush();
    expect(sj_done).toBe(true);
  });

  it('allows a sensible time to read a scroll', () => {
    expect(readingTime(0)).toBe(7);
    expect(readingTime(40)).toBeGreaterThan(7);
    expect(readingTime(40)).toBeLessThan(16);
    expect(readingTime(5000)).toBe(16);
  });
});

describe('tour routes', () => {
  const sj_route = new Route([
    [0, 0],
    [10, 0],
    [10, 5],
  ]);

  it('measures and samples by arc length', () => {
    expect(sj_route.length).toBeCloseTo(15);
    expect(sj_route.at(5)).toEqual({ x: 5, z: 0 });
    expect(sj_route.at(12)).toEqual({ x: 10, z: 2 });
    expect(sj_route.at(-3)).toEqual({ x: 0, z: 0 });
    expect(sj_route.at(99)).toEqual({ x: 10, z: 5 });
  });

  it('knows the heading and projects points onto itself', () => {
    const sj_h = sj_route.heading(3);
    expect(sj_h.x).toBeCloseTo(1);
    expect(sj_h.z).toBeCloseTo(0);
    expect(sj_route.project(4, 1)).toBeCloseTo(4);
    expect(sj_route.project(11, 3)).toBeCloseTo(13);
  });

  it('follows a route that doubles back in order', () => {
    const sj_back = new Route([
      [0, 0],
      [10, 0],
      [0, 0.5],
    ]);
    // near the start, but already past the turn
    expect(sj_back.project(1, 0.4, 12)).toBeGreaterThan(18);
  });

  it('finds where to stand in front of something', () => {
    const [sj_x, sj_z] = approach(0, 0, 10, 0, 2);
    expect(sj_x).toBeCloseTo(8);
    expect(sj_z).toBeCloseTo(0);
  });
});

describe('tour film', async () => {
  const { Vector3: sj_Vector3 } = await import('three');
  const {
    sj_CHAPTERS,
    sj_SECTION_CHAPTERS,
    captionFor: sj_captionFor,
    chapterCard: sj_chapterCard,
  } = await import('../src/tour/script');
  const { sj_SECTIONS } = await import('../src/content/sections');
  const { sj_portfolio } = await import('../src/content/portfolio');
  const { lensFor: sj_lensFor } = await import('../src/tour/Director');
  const {
    createPose: sj_createPose,
    orbit: sj_orbit,
    rail: sj_rail,
    track: sj_track,
  } = await import('../src/tour/shots');

  it('has a prologue, one chapter per scroll in order, and an epilogue', () => {
    expect(sj_CHAPTERS[0]!.id).toBe('prologue');
    expect(sj_CHAPTERS[sj_CHAPTERS.length - 1]!.id).toBe('epilogue');
    expect(sj_SECTION_CHAPTERS.map((sj_i) => sj_CHAPTERS[sj_i]!.section)).toEqual(
      sj_SECTIONS.map((sj_s) => sj_s.id),
    );
    for (const sj_i of sj_SECTION_CHAPTERS) expect(sj_CHAPTERS[sj_i]!.strip?.glyph).toBeTruthy();
  });

  it('titles chapters from the content and lets the owner rewrite captions', () => {
    const sj_card = sj_chapterCard('about', sj_portfolio);
    expect(sj_card.kicker).toMatch(/^Chapter 2 · /);
    expect(sj_card.title).toBe(sj_portfolio.about.heading);
    expect(sj_captionFor('journey', sj_portfolio)).toBeTruthy();
    const sj_custom = { ...sj_portfolio, tour: { captions: { journey: 'My own line' } } };
    expect(sj_captionFor('journey', sj_custom)).toBe('My own line');
    expect(sj_captionFor('about', sj_custom)).toBe(sj_captionFor('about', sj_portfolio));
  });

  it('widens the lens only for tall screens', () => {
    expect(sj_lensFor(45, 16 / 9)).toBe(45);
    expect(sj_lensFor(45, 390 / 844)).toBeGreaterThan(55);
    expect(sj_lensFor(70, 0.3)).toBeLessThanOrEqual(80);
  });

  it('frames shots where they are asked to', () => {
    const sj_pose = sj_createPose();
    const sj_r = sj_rail({
      path: [new sj_Vector3(0, 10, 0), new sj_Vector3(10, 10, 0)],
      look: [new sj_Vector3(0, 0, 5), new sj_Vector3(10, 0, 5)],
      duration: 4,
    });
    sj_r.pose(0, 0, sj_pose);
    expect(sj_pose.position.x).toBeCloseTo(0);
    sj_r.pose(4, 0, sj_pose);
    expect(sj_pose.position.x).toBeCloseTo(10);
    expect(sj_pose.target.z).toBeCloseTo(5);

    const sj_subject = { position: new sj_Vector3(5, 0, 5), yaw: 0 }; // facing +z
    const sj_behind = sj_track(() => sj_subject, { distance: 4, height: 2, angle: 0 });
    sj_behind.pose(0, 0, sj_pose);
    expect(sj_pose.position.z).toBeCloseTo(1); // behind = -z
    expect(sj_pose.position.y).toBeCloseTo(2);
    const sj_front = sj_track(() => sj_subject, { distance: 4, height: 2, angle: Math.PI });
    sj_front.pose(0, 0, sj_pose);
    expect(sj_pose.position.z).toBeCloseTo(9);

    const sj_o = sj_orbit(new sj_Vector3(0, 0, 0), { radius: 5, height: 1, angle: 0, speed: 1 });
    sj_o.pose(0, 0, sj_pose);
    expect(sj_pose.position.z).toBeCloseTo(5);
    sj_o.pose(Math.PI / 2, 0, sj_pose);
    expect(sj_pose.position.x).toBeCloseTo(5);
  });
});

describe('camera paths', async () => {
  const { Vector3: sj_Vector3 } = await import('three');
  const {
    BezierPath: sj_BezierPath,
    PathTiming: sj_PathTiming,
    cubicBezierEase: sj_cubicBezierEase,
  } = await import('../src/tour/spline');
  const {
    aim: sj_aim,
    createPose: sj_createPose,
    move: sj_move,
    panTilt: sj_panTilt,
  } = await import('../src/tour/shots');

  it('passes through its points and walks them by distance', () => {
    const sj_pts = [new sj_Vector3(0, 0, 0), new sj_Vector3(10, 0, 0), new sj_Vector3(10, 0, 4)];
    const sj_path = sj_BezierPath.through(sj_pts);
    expect(sj_path.length).toBeGreaterThan(13.9);
    expect(sj_path.length).toBeLessThan(15);
    // each point sits at its knot
    sj_pts.forEach((sj_p, sj_i) =>
      expect(sj_path.at(sj_path.knots[sj_i]!).distanceTo(sj_p)).toBeLessThan(1e-6),
    );
    // equal steps along the path are equal steps in space
    const sj_a = sj_path.at(2);
    const sj_b = sj_path.at(3);
    const sj_c = sj_path.at(4);
    expect(sj_a.distanceTo(sj_b)).toBeCloseTo(sj_b.distanceTo(sj_c), 1);
    // explicit control points: a straight Bezier
    const sj_line = sj_BezierPath.bezier([
      new sj_Vector3(0, 0, 0),
      new sj_Vector3(1, 0, 0),
      new sj_Vector3(2, 0, 0),
      new sj_Vector3(3, 0, 0),
    ]);
    expect(sj_line.length).toBeCloseTo(3);
    expect(sj_line.atFraction(0.5).x).toBeCloseTo(1.5, 2);
  });

  it('times a move: at rest at both ends, through every mark, never backwards', () => {
    const sj_timing = new sj_PathTiming([
      { t: 0, f: 0 },
      { t: 2, f: 0.2 },
      { t: 6, f: 1 },
    ]);
    expect(sj_timing.fraction(0)).toBe(0);
    expect(sj_timing.fraction(2)).toBeCloseTo(0.2);
    expect(sj_timing.fraction(6)).toBe(1);
    let sj_prev = 0;
    for (let sj_t = 0; sj_t <= 6; sj_t += 0.05) {
      const sj_f = sj_timing.fraction(sj_t);
      expect(sj_f).toBeGreaterThanOrEqual(sj_prev - 1e-9);
      sj_prev = sj_f;
    }
    // eases in: the first step is shorter than a step in the middle
    expect(sj_timing.fraction(0.1)).toBeLessThan(sj_timing.fraction(3.1) - sj_timing.fraction(3));
  });

  it('eases like CSS cubic-bezier curves', () => {
    const sj_linear = sj_cubicBezierEase(0, 0, 1, 1);
    expect(sj_linear(0.3)).toBeCloseTo(0.3, 4);
    const sj_inOut = sj_cubicBezierEase(0.42, 0, 0.58, 1);
    expect(sj_inOut(0)).toBe(0);
    expect(sj_inOut(1)).toBe(1);
    expect(sj_inOut(0.5)).toBeCloseTo(0.5, 4);
    expect(sj_inOut(0.2)).toBeLessThan(0.2);
  });

  it('pans by turning the view, not by sliding the target', () => {
    const sj_d = sj_panTilt(new sj_Vector3(1, 0, 0), new sj_Vector3(0, 0, 1), 0.5);
    expect(sj_d.x).toBeCloseTo(Math.SQRT1_2);
    expect(sj_d.z).toBeCloseTo(Math.SQRT1_2);
    // between two opposite views looking a little down, the camera pans level: it never
    // swings through the ground
    const sj_down = 0.3;
    const sj_a = new sj_Vector3(0, -Math.sin(sj_down), Math.cos(sj_down));
    const sj_b = new sj_Vector3(0.001, -Math.sin(sj_down), -Math.cos(sj_down)).normalize();
    for (let sj_k = 0; sj_k <= 1; sj_k += 0.1) {
      const sj_m = sj_panTilt(sj_a.clone(), sj_b, sj_k);
      expect(Math.asin(sj_m.y)).toBeCloseTo(-sj_down, 2);
      expect(sj_m.length()).toBeCloseTo(1);
    }
    const sj_out = new sj_Vector3();
    const sj_keys = [
      { t: 0, at: new sj_Vector3(10, 0, 0) },
      { t: 2, at: new sj_Vector3(0, 0, 40) },
    ];
    sj_aim(sj_keys, -1, new sj_Vector3(), sj_out);
    expect(sj_out.x).toBeCloseTo(10);
    sj_aim(sj_keys, 1, new sj_Vector3(), sj_out);
    // halfway through the pan: 45° round, halfway between the two distances
    expect(Math.atan2(sj_out.z, sj_out.x)).toBeCloseTo(Math.PI / 4);
    expect(sj_out.length()).toBeCloseTo(25);
    sj_aim(sj_keys, 9, new sj_Vector3(), sj_out);
    expect(sj_out.z).toBeCloseTo(40);
  });

  it('moves the camera through its points at the times given', () => {
    const sj_shot = sj_move({
      path: [new sj_Vector3(0, 5, 0), new sj_Vector3(10, 5, 0), new sj_Vector3(10, 5, 10)],
      times: [0, 3, 8],
      look: new sj_Vector3(0, 0, 0),
      fov: [
        { t: 0, fov: 40 },
        { t: 8, fov: 50 },
      ],
      clearance: 0.3,
    });
    const sj_pose = sj_createPose();
    sj_shot.pose(3, 0, sj_pose);
    expect(sj_pose.position.distanceTo(new sj_Vector3(10, 5, 0))).toBeLessThan(1e-3);
    expect(sj_pose.clearance).toBe(0.3);
    sj_shot.pose(8, 0, sj_pose);
    expect(sj_pose.position.distanceTo(new sj_Vector3(10, 5, 10))).toBeLessThan(1e-6);
    expect(sj_pose.fov).toBeCloseTo(50);
    sj_shot.pose(4, 0, sj_pose);
    expect(sj_pose.fov).toBeGreaterThan(40);
    expect(sj_pose.fov).toBeLessThan(50);
  });
});

describe('autopilot and director', async () => {
  const { PerspectiveCamera: sj_PerspectiveCamera, Vector3: sj_Vector3 } = await import('three');
  const { Autopilot: sj_Autopilot } = await import('../src/tour/Autopilot');
  const { Route: sj_Route } = await import('../src/tour/route');
  const { Director: sj_Director } = await import('../src/tour/Director');
  const { tripod: sj_tripod } = await import('../src/tour/shots');
  type Controller = ConstructorParameters<typeof sj_Autopilot>[0];

  const sj_controller = () =>
    ({
      position: new sj_Vector3(0, 0, 0),
      yaw: 0,
      speed: 0,
      teleport() {},
    }) as unknown as Controller;

  it('jumps once when asked, and strolls at a fraction of full speed', () => {
    const sj_c = sj_controller();
    const sj_pilot = new sj_Autopilot(sj_c);
    sj_pilot.hop();
    expect(sj_pilot.steer(1 / 60).jump).toBe(true);
    expect(sj_pilot.steer(1 / 60).jump).toBe(false);
    const sj_route = new sj_Route([
      [0, 0],
      [0, 20],
    ]);
    sj_pilot.walk(sj_route, false, 1);
    const sj_full = sj_pilot.steer(1 / 60).move.length();
    sj_pilot.walk(sj_route, false, 0.5);
    const sj_stroll = sj_pilot.steer(1 / 60).move.length();
    expect(sj_full).toBeCloseTo(1);
    expect(sj_stroll).toBeCloseTo(0.5);
  });

  it('blends between shots along a curve, turning the view', () => {
    const sj_camera = new sj_PerspectiveCamera(45, 16 / 9, 0.1, 100);
    sj_camera.position.set(0, 2, 0);
    const sj_out = { position: new sj_Vector3(), target: new sj_Vector3() };
    const sj_rig = {
      camera: sj_camera,
      lookTarget: new sj_Vector3(0, 2, 10), // looking north... along +z
      direct(sj_p: InstanceType<typeof sj_Vector3>, sj_t: InstanceType<typeof sj_Vector3>) {
        sj_out.position.copy(sj_p);
        sj_out.target.copy(sj_t);
      },
    };
    const sj_director = new sj_Director(sj_rig as never, () => 0);
    // to a camera 20 m east, looking east
    sj_director.cut(
      sj_tripod(new sj_Vector3(20, 2, 0), new sj_Vector3(30, 2, 0), { lookHeight: 0 }),
      2,
      {
        arc: 0.25,
      },
    );
    sj_director.update(1); // halfway through the blend
    // bowed up above the straight line (y = 2), halfway across
    expect(sj_out.position.y).toBeGreaterThan(3.5);
    expect(sj_out.position.x).toBeGreaterThan(8);
    expect(sj_out.position.x).toBeLessThan(12);
    // looking half-way round: north-east
    const sj_dir = sj_out.target.clone().sub(sj_out.position).setY(0).normalize();
    expect(sj_dir.x).toBeCloseTo(Math.SQRT1_2, 1);
    expect(sj_dir.z).toBeCloseTo(Math.SQRT1_2, 1);
    sj_director.update(1.5);
    expect(sj_out.position.distanceTo(new sj_Vector3(20, 2, 0))).toBeLessThan(1e-6);
  });
});
