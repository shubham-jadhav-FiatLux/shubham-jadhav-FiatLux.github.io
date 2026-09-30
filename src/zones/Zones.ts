import { Emitter } from '../core/Emitter';
import type { SectionId } from '../content/sections';
import type { PortfolioContent } from '../content/types';
import type { Anchors } from '../world/architecture/Architecture';

export type InteractKind = 'gate' | 'scroll' | 'dummy' | 'banner' | 'milestone' | 'bell' | 'drum';

export interface Interactable {
  id: string;
  kind: InteractKind;
  section: SectionId | null;
  /** index of the skill group / milestone / project this spot is about */
  focus?: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** label next to the key hint */
  prompt: string;
  /** which key the hint shows */
  key: 'E' | 'F';
  /** fire automatically the first time the panda walks in */
  auto?: boolean;
}

export type ZoneEvents = {
  focus: Interactable | null;
  trigger: Interactable;
};

/** Builds the list of interactive spots from the architecture anchors and the content. */
export function buildInteractables(a: Anchors, c: PortfolioContent): Interactable[] {
  const list: Interactable[] = [
    {
      id: 'gate',
      kind: 'gate',
      section: 'welcome',
      ...a.gate,
      radius: 3.4,
      prompt: 'Read the gate inscription',
      key: 'E',
      auto: true,
    },
    {
      id: 'about',
      kind: 'scroll',
      section: 'about',
      ...a.pavilionTable,
      radius: 2.8,
      prompt: 'Read the scroll on the tea table',
      key: 'E',
    },
    {
      id: 'pagoda',
      kind: 'scroll',
      section: 'projects',
      ...a.pagodaDoor,
      radius: 3.2,
      prompt: 'Browse every project',
      key: 'E',
    },
    {
      id: 'bell',
      kind: 'bell',
      section: 'contact',
      ...a.bell,
      radius: 3.4,
      prompt: 'Ring the bell',
      key: 'E',
    },
    {
      id: 'drum',
      kind: 'drum',
      section: null,
      ...a.drum,
      radius: 2.4,
      prompt: 'Beat the drum',
      key: 'F',
    },
  ];
  a.dummies.forEach((d, i) => {
    const g = c.skills.groups[i];
    if (!g) return;
    list.push({
      id: `dummy:${i}`,
      kind: 'dummy',
      section: 'skills',
      focus: i,
      ...d,
      radius: 2.4,
      prompt: `Strike the ${g.name} dummy`,
      key: 'F',
    });
  });
  a.milestones.forEach((m, i) => {
    const e = c.journey.entries[i];
    if (!e) return;
    list.push({
      id: `milestone:${i}`,
      kind: 'milestone',
      section: 'journey',
      focus: i,
      ...m,
      radius: 2.5,
      prompt: `Read milestone: ${e.when}`,
      key: 'E',
    });
  });
  a.banners.forEach((b) => {
    const p = c.projects.items[b.index];
    if (!p) return;
    list.push({
      id: `banner:${b.index}`,
      kind: 'banner',
      section: 'projects',
      focus: b.index,
      x: b.x,
      y: b.y,
      z: b.z,
      radius: 2.5,
      prompt: `Read about ${p.bannerTitle ?? p.title}`,
      key: 'E',
    });
  });
  return list;
}

/**
 * Tracks which interactive spot the panda is standing at, shows the prompt and raises
 * `trigger` when the visitor acts on it (or automatically for `auto` spots).
 */
export class Zones extends Emitter<ZoneEvents> {
  active: Interactable | null = null;
  /**
   * Decides whether an `auto` spot fires on entry. The game only lets it fire while its
   * scroll is still undiscovered, so returning visitors are not greeted by it every time.
   */
  shouldAutoFire: (it: Interactable) => boolean = () => true;

  constructor(readonly items: Interactable[]) {
    super();
  }

  find(id: string): Interactable | undefined {
    return this.items.find((i) => i.id === id);
  }

  /** Main spot of each section (for beacons, the map and quick travel). */
  primary(section: SectionId): Interactable | undefined {
    const order: Record<SectionId, string> = {
      welcome: 'gate',
      about: 'about',
      skills: 'dummy:0',
      journey: 'milestone:0',
      projects: 'pagoda',
      contact: 'bell',
    };
    return this.find(order[section]) ?? this.items.find((i) => i.section === section);
  }

  update(player: { x: number; y: number; z: number }, enabled: boolean): void {
    let best: Interactable | null = null;
    let bestD = Infinity;
    if (enabled) {
      for (const it of this.items) {
        const d = Math.hypot(it.x - player.x, it.z - player.z);
        if (d > it.radius || Math.abs(it.y - player.y) > 3) continue;
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
    }
    if (best !== this.active) {
      this.active = best;
      this.emit('focus', best);
      if (best?.auto && this.shouldAutoFire(best)) this.emit('trigger', best);
    }
  }

  /** Called on E / F. Returns true if something was triggered. */
  interact(key: 'E' | 'F'): boolean {
    const a = this.active;
    if (!a) return false;
    // E works everywhere; F only on things you can hit.
    if (key === 'F' && a.key !== 'F' && a.kind !== 'bell') return false;
    this.emit('trigger', a);
    return true;
  }
}
