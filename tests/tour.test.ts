import { describe, expect, it } from 'vitest';
import { Cancelled, readingTime, Ticket, Timeline } from '../src/tour/timeline';
import { approach, Route } from '../src/tour/route';

/** Lets pending promise continuations run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('tour timeline', () => {
  it('resolves waits on script time, not wall time', async () => {
    const tl = new Timeline();
    const ticket = new Ticket();
    let done = false;
    void tl.wait(1, ticket).then(() => (done = true));
    tl.update(0.5);
    await flush();
    expect(done).toBe(false);
    tl.update(0.6);
    await flush();
    expect(done).toBe(true);
  });

  it('holds still while paused and runs faster when scaled', async () => {
    const tl = new Timeline();
    const ticket = new Ticket();
    let done = false;
    void tl.wait(2, ticket).then(() => (done = true));
    tl.paused = true;
    for (let i = 0; i < 100; i++) tl.update(0.05);
    await flush();
    expect(done).toBe(false);
    tl.paused = false;
    tl.scale = 4;
    tl.update(0.5);
    await flush();
    expect(done).toBe(true);
  });

  it('cancels every wait on a ticket', async () => {
    const tl = new Timeline();
    const ticket = new Ticket();
    const a = tl.wait(5, ticket);
    const b = tl.until(() => false, ticket);
    ticket.cancel();
    await expect(a).rejects.toBeInstanceOf(Cancelled);
    await expect(b).rejects.toBeInstanceOf(Cancelled);
    expect(tl.pending).toBe(0);
    // new waits on a cancelled ticket fail straight away
    expect(() => tl.wait(1, ticket)).toThrow(Cancelled);
  });

  it('gives up on a condition after its timeout', async () => {
    const tl = new Timeline();
    let done = false;
    void tl.until(() => false, new Ticket(), 1).then(() => (done = true));
    tl.update(1.01);
    await flush();
    expect(done).toBe(true);
  });

  it('allows a sensible time to read a scroll', () => {
    expect(readingTime(0)).toBe(7);
    expect(readingTime(40)).toBeGreaterThan(7);
    expect(readingTime(40)).toBeLessThan(16);
    expect(readingTime(5000)).toBe(16);
  });
});

describe('tour routes', () => {
  const route = new Route([
    [0, 0],
    [10, 0],
    [10, 5],
  ]);

  it('measures and samples by arc length', () => {
    expect(route.length).toBeCloseTo(15);
    expect(route.at(5)).toEqual({ x: 5, z: 0 });
    expect(route.at(12)).toEqual({ x: 10, z: 2 });
    expect(route.at(-3)).toEqual({ x: 0, z: 0 });
    expect(route.at(99)).toEqual({ x: 10, z: 5 });
  });

  it('knows the heading and projects points onto itself', () => {
    const h = route.heading(3);
    expect(h.x).toBeCloseTo(1);
    expect(h.z).toBeCloseTo(0);
    expect(route.project(4, 1)).toBeCloseTo(4);
    expect(route.project(11, 3)).toBeCloseTo(13);
  });

  it('follows a route that doubles back in order', () => {
    const back = new Route([
      [0, 0],
      [10, 0],
      [0, 0.5],
    ]);
    // near the start, but already past the turn
    expect(back.project(1, 0.4, 12)).toBeGreaterThan(18);
  });

  it('finds where to stand in front of something', () => {
    const [x, z] = approach(0, 0, 10, 0, 2);
    expect(x).toBeCloseTo(8);
    expect(z).toBeCloseTo(0);
  });
});

describe('tour film', async () => {
  const { Vector3 } = await import('three');
  const { CHAPTERS, SECTION_CHAPTERS, captionFor, chapterCard } =
    await import('../src/tour/script');
  const { SECTIONS } = await import('../src/content/sections');
  const { portfolio } = await import('../src/content/portfolio');
  const { lensFor } = await import('../src/tour/Director');
  const { createPose, orbit, rail, track } = await import('../src/tour/shots');

  it('has a prologue, one chapter per scroll in order, and an epilogue', () => {
    expect(CHAPTERS[0]!.id).toBe('prologue');
    expect(CHAPTERS[CHAPTERS.length - 1]!.id).toBe('epilogue');
    expect(SECTION_CHAPTERS.map((i) => CHAPTERS[i]!.section)).toEqual(SECTIONS.map((s) => s.id));
    for (const i of SECTION_CHAPTERS) expect(CHAPTERS[i]!.strip?.glyph).toBeTruthy();
  });

  it('titles chapters from the content and lets the owner rewrite captions', () => {
    const card = chapterCard('about', portfolio);
    expect(card.kicker).toMatch(/^Chapter 2 · /);
    expect(card.title).toBe(portfolio.about.heading);
    expect(captionFor('journey', portfolio)).toBeTruthy();
    const custom = { ...portfolio, tour: { captions: { journey: 'My own line' } } };
    expect(captionFor('journey', custom)).toBe('My own line');
    expect(captionFor('about', custom)).toBe(captionFor('about', portfolio));
  });

  it('widens the lens only for tall screens', () => {
    expect(lensFor(45, 16 / 9)).toBe(45);
    expect(lensFor(45, 390 / 844)).toBeGreaterThan(55);
    expect(lensFor(70, 0.3)).toBeLessThanOrEqual(80);
  });

  it('frames shots where they are asked to', () => {
    const pose = createPose();
    const r = rail({
      path: [new Vector3(0, 10, 0), new Vector3(10, 10, 0)],
      look: [new Vector3(0, 0, 5), new Vector3(10, 0, 5)],
      duration: 4,
    });
    r.pose(0, 0, pose);
    expect(pose.position.x).toBeCloseTo(0);
    r.pose(4, 0, pose);
    expect(pose.position.x).toBeCloseTo(10);
    expect(pose.target.z).toBeCloseTo(5);

    const subject = { position: new Vector3(5, 0, 5), yaw: 0 }; // facing +z
    const behind = track(() => subject, { distance: 4, height: 2, angle: 0 });
    behind.pose(0, 0, pose);
    expect(pose.position.z).toBeCloseTo(1); // behind = -z
    expect(pose.position.y).toBeCloseTo(2);
    const front = track(() => subject, { distance: 4, height: 2, angle: Math.PI });
    front.pose(0, 0, pose);
    expect(pose.position.z).toBeCloseTo(9);

    const o = orbit(new Vector3(0, 0, 0), { radius: 5, height: 1, angle: 0, speed: 1 });
    o.pose(0, 0, pose);
    expect(pose.position.z).toBeCloseTo(5);
    o.pose(Math.PI / 2, 0, pose);
    expect(pose.position.x).toBeCloseTo(5);
  });
});

describe('camera paths', async () => {
  const { Vector3 } = await import('three');
  const { BezierPath, PathTiming, cubicBezierEase } = await import('../src/tour/spline');
  const { aim, createPose, move, panTilt } = await import('../src/tour/shots');

  it('passes through its points and walks them by distance', () => {
    const pts = [new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(10, 0, 4)];
    const path = BezierPath.through(pts);
    expect(path.length).toBeGreaterThan(13.9);
    expect(path.length).toBeLessThan(15);
    // each point sits at its knot
    pts.forEach((p, i) => expect(path.at(path.knots[i]!).distanceTo(p)).toBeLessThan(1e-6));
    // equal steps along the path are equal steps in space
    const a = path.at(2);
    const b = path.at(3);
    const c = path.at(4);
    expect(a.distanceTo(b)).toBeCloseTo(b.distanceTo(c), 1);
    // explicit control points: a straight Bezier
    const line = BezierPath.bezier([
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(2, 0, 0),
      new Vector3(3, 0, 0),
    ]);
    expect(line.length).toBeCloseTo(3);
    expect(line.atFraction(0.5).x).toBeCloseTo(1.5, 2);
  });

  it('times a move: at rest at both ends, through every mark, never backwards', () => {
    const timing = new PathTiming([
      { t: 0, f: 0 },
      { t: 2, f: 0.2 },
      { t: 6, f: 1 },
    ]);
    expect(timing.fraction(0)).toBe(0);
    expect(timing.fraction(2)).toBeCloseTo(0.2);
    expect(timing.fraction(6)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 6; t += 0.05) {
      const f = timing.fraction(t);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f;
    }
    // eases in: the first step is shorter than a step in the middle
    expect(timing.fraction(0.1)).toBeLessThan(timing.fraction(3.1) - timing.fraction(3));
  });

  it('eases like CSS cubic-bezier curves', () => {
    const linear = cubicBezierEase(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
    const inOut = cubicBezierEase(0.42, 0, 0.58, 1);
    expect(inOut(0)).toBe(0);
    expect(inOut(1)).toBe(1);
    expect(inOut(0.5)).toBeCloseTo(0.5, 4);
    expect(inOut(0.2)).toBeLessThan(0.2);
  });

  it('pans by turning the view, not by sliding the target', () => {
    const d = panTilt(new Vector3(1, 0, 0), new Vector3(0, 0, 1), 0.5);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.z).toBeCloseTo(Math.SQRT1_2);
    // between two opposite views looking a little down, the camera pans level: it never
    // swings through the ground
    const down = 0.3;
    const a = new Vector3(0, -Math.sin(down), Math.cos(down));
    const b = new Vector3(0.001, -Math.sin(down), -Math.cos(down)).normalize();
    for (let k = 0; k <= 1; k += 0.1) {
      const m = panTilt(a.clone(), b, k);
      expect(Math.asin(m.y)).toBeCloseTo(-down, 2);
      expect(m.length()).toBeCloseTo(1);
    }
    const out = new Vector3();
    const keys = [
      { t: 0, at: new Vector3(10, 0, 0) },
      { t: 2, at: new Vector3(0, 0, 40) },
    ];
    aim(keys, -1, new Vector3(), out);
    expect(out.x).toBeCloseTo(10);
    aim(keys, 1, new Vector3(), out);
    // halfway through the pan: 45° round, halfway between the two distances
    expect(Math.atan2(out.z, out.x)).toBeCloseTo(Math.PI / 4);
    expect(out.length()).toBeCloseTo(25);
    aim(keys, 9, new Vector3(), out);
    expect(out.z).toBeCloseTo(40);
  });

  it('moves the camera through its points at the times given', () => {
    const shot = move({
      path: [new Vector3(0, 5, 0), new Vector3(10, 5, 0), new Vector3(10, 5, 10)],
      times: [0, 3, 8],
      look: new Vector3(0, 0, 0),
      fov: [
        { t: 0, fov: 40 },
        { t: 8, fov: 50 },
      ],
      clearance: 0.3,
    });
    const pose = createPose();
    shot.pose(3, 0, pose);
    expect(pose.position.distanceTo(new Vector3(10, 5, 0))).toBeLessThan(1e-3);
    expect(pose.clearance).toBe(0.3);
    shot.pose(8, 0, pose);
    expect(pose.position.distanceTo(new Vector3(10, 5, 10))).toBeLessThan(1e-6);
    expect(pose.fov).toBeCloseTo(50);
    shot.pose(4, 0, pose);
    expect(pose.fov).toBeGreaterThan(40);
    expect(pose.fov).toBeLessThan(50);
  });
});

describe('autopilot and director', async () => {
  const { PerspectiveCamera, Vector3 } = await import('three');
  const { Autopilot } = await import('../src/tour/Autopilot');
  const { Route } = await import('../src/tour/route');
  const { Director } = await import('../src/tour/Director');
  const { tripod } = await import('../src/tour/shots');
  type Controller = ConstructorParameters<typeof Autopilot>[0];

  const controller = () =>
    ({
      position: new Vector3(0, 0, 0),
      yaw: 0,
      speed: 0,
      teleport() {},
    }) as unknown as Controller;

  it('jumps once when asked, and strolls at a fraction of full speed', () => {
    const c = controller();
    const pilot = new Autopilot(c);
    pilot.hop();
    expect(pilot.steer(1 / 60).jump).toBe(true);
    expect(pilot.steer(1 / 60).jump).toBe(false);
    const route = new Route([
      [0, 0],
      [0, 20],
    ]);
    pilot.walk(route, false, 1);
    const full = pilot.steer(1 / 60).move.length();
    pilot.walk(route, false, 0.5);
    const stroll = pilot.steer(1 / 60).move.length();
    expect(full).toBeCloseTo(1);
    expect(stroll).toBeCloseTo(0.5);
  });

  it('blends between shots along a curve, turning the view', () => {
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 100);
    camera.position.set(0, 2, 0);
    const out = { position: new Vector3(), target: new Vector3() };
    const rig = {
      camera,
      lookTarget: new Vector3(0, 2, 10), // looking north... along +z
      direct(p: InstanceType<typeof Vector3>, t: InstanceType<typeof Vector3>) {
        out.position.copy(p);
        out.target.copy(t);
      },
    };
    const director = new Director(rig as never, () => 0);
    // to a camera 20 m east, looking east
    director.cut(tripod(new Vector3(20, 2, 0), new Vector3(30, 2, 0), { lookHeight: 0 }), 2, {
      arc: 0.25,
    });
    director.update(1); // halfway through the blend
    // bowed up above the straight line (y = 2), halfway across
    expect(out.position.y).toBeGreaterThan(3.5);
    expect(out.position.x).toBeGreaterThan(8);
    expect(out.position.x).toBeLessThan(12);
    // looking half-way round: north-east
    const dir = out.target.clone().sub(out.position).setY(0).normalize();
    expect(dir.x).toBeCloseTo(Math.SQRT1_2, 1);
    expect(dir.z).toBeCloseTo(Math.SQRT1_2, 1);
    director.update(1.5);
    expect(out.position.distanceTo(new Vector3(20, 2, 0))).toBeLessThan(1e-6);
  });
});
