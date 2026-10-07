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
export function buildInteractables(sj_a: Anchors, sj_c: PortfolioContent): Interactable[] {
  const sj_list: Interactable[] = [
    {
      id: 'gate',
      kind: 'gate',
      section: 'welcome',
      ...sj_a.gate,
      radius: 3.4,
      prompt: 'Read the gate inscription',
      key: 'E',
      auto: true,
    },
    {
      id: 'about',
      kind: 'scroll',
      section: 'about',
      ...sj_a.pavilionTable,
      radius: 2.8,
      prompt: 'Read the scroll on the tea table',
      key: 'E',
    },
    {
      id: 'pagoda',
      kind: 'scroll',
      section: 'projects',
      ...sj_a.pagodaDoor,
      radius: 3.2,
      prompt: 'Browse every project',
      key: 'E',
    },
    {
      id: 'bell',
      kind: 'bell',
      section: 'contact',
      ...sj_a.bell,
      radius: 3.4,
      prompt: 'Ring the bell',
      key: 'E',
    },
    {
      id: 'drum',
      kind: 'drum',
      section: null,
      ...sj_a.drum,
      radius: 2.4,
      prompt: 'Beat the drum',
      key: 'F',
    },
  ];
  sj_a.dummies.forEach((sj_d, sj_i) => {
    const sj_g = sj_c.skills.groups[sj_i];
    if (!sj_g) return;
    sj_list.push({
      id: `dummy:${sj_i}`,
      kind: 'dummy',
      section: 'skills',
      focus: sj_i,
      ...sj_d,
      radius: 2.4,
      prompt: `Strike the ${sj_g.name} dummy`,
      key: 'F',
    });
  });
  sj_a.milestones.forEach((sj_m, sj_i) => {
    const sj_e = sj_c.journey.entries[sj_i];
    if (!sj_e) return;
    sj_list.push({
      id: `milestone:${sj_i}`,
      kind: 'milestone',
      section: 'journey',
      focus: sj_i,
      ...sj_m,
      radius: 2.5,
      prompt: `Read milestone: ${sj_e.when}`,
      key: 'E',
    });
  });
  sj_a.banners.forEach((sj_b) => {
    const sj_p = sj_c.projects.items[sj_b.index];
    if (!sj_p) return;
    sj_list.push({
      id: `banner:${sj_b.index}`,
      kind: 'banner',
      section: 'projects',
      focus: sj_b.index,
      x: sj_b.x,
      y: sj_b.y,
      z: sj_b.z,
      radius: 2.5,
      prompt: `Read about ${sj_p.bannerTitle ?? sj_p.title}`,
      key: 'E',
    });
  });
  return sj_list;
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
  shouldAutoFire: (sj_it: Interactable) => boolean = () => true;

  constructor(readonly items: Interactable[]) {
    super();
  }

  find(sj_id: string): Interactable | undefined {
    return this.items.find((sj_i) => sj_i.id === sj_id);
  }

  /** Main spot of each section (for beacons, the map and quick travel). */
  primary(sj_section: SectionId): Interactable | undefined {
    const sj_order: Record<SectionId, string> = {
      welcome: 'gate',
      about: 'about',
      skills: 'dummy:0',
      journey: 'milestone:0',
      projects: 'pagoda',
      contact: 'bell',
    };
    return (
      this.find(sj_order[sj_section]) ?? this.items.find((sj_i) => sj_i.section === sj_section)
    );
  }

  update(sj_player: { x: number; y: number; z: number }, sj_enabled: boolean): void {
    let sj_best: Interactable | null = null;
    let sj_bestD = Infinity;
    if (sj_enabled) {
      for (const sj_it of this.items) {
        const sj_d = Math.hypot(sj_it.x - sj_player.x, sj_it.z - sj_player.z);
        if (sj_d > sj_it.radius || Math.abs(sj_it.y - sj_player.y) > 3) continue;
        if (sj_d < sj_bestD) {
          sj_bestD = sj_d;
          sj_best = sj_it;
        }
      }
    }
    if (sj_best !== this.active) {
      this.active = sj_best;
      this.emit('focus', sj_best);
      if (sj_best?.auto && this.shouldAutoFire(sj_best)) this.emit('trigger', sj_best);
    }
  }

  /** Called on E / F. Returns true if something was triggered. */
  interact(sj_key: 'E' | 'F'): boolean {
    const sj_a = this.active;
    if (!sj_a) return false;
    // E works everywhere; F only on things you can hit.
    if (sj_key === 'F' && sj_a.key !== 'F' && sj_a.kind !== 'bell') return false;
    this.emit('trigger', sj_a);
    return true;
  }
}
