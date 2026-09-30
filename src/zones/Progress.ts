import { Emitter } from '../core/Emitter';
import { storage } from '../core/Storage';
import { SECTIONS, type SectionId } from '../content/sections';

/** Which scrolls the visitor has found. Persisted (when storage is available). */
export class Progress extends Emitter<{ discover: SectionId; reset: void }> {
  private found: Set<SectionId>;

  constructor() {
    super();
    const saved = storage.get<SectionId[]>('found', []);
    this.found = new Set(saved.filter((s) => SECTIONS.some((m) => m.id === s)));
  }

  has(id: SectionId): boolean {
    return this.found.has(id);
  }

  get count(): number {
    return this.found.size;
  }

  get total(): number {
    return SECTIONS.length;
  }

  get all(): SectionId[] {
    return SECTIONS.filter((s) => this.found.has(s.id)).map((s) => s.id);
  }

  /** Marks a section as found. Returns true if it was new. */
  discover(id: SectionId): boolean {
    if (this.found.has(id)) return false;
    this.found.add(id);
    storage.set('found', [...this.found]);
    this.emit('discover', id);
    return true;
  }

  reset(): void {
    this.found.clear();
    storage.set('found', []);
    this.emit('reset', undefined);
  }
}
