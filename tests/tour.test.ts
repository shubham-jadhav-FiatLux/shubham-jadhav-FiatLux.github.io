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
