import { Emitter } from '../core/Emitter';
import { sj_storage } from '../core/Storage';
import { sj_SECTIONS, type SectionId } from '../content/sections';

/** Which scrolls the visitor has found. Persisted (when storage is available). */
export class Progress extends Emitter<{ discover: SectionId; reset: void }> {
  private found: Set<SectionId>;

  constructor() {
    super();
    const sj_saved = sj_storage.get<SectionId[]>('found', []);
    this.found = new Set(sj_saved.filter((sj_s) => sj_SECTIONS.some((sj_m) => sj_m.id === sj_s)));
  }

  has(sj_id: SectionId): boolean {
    return this.found.has(sj_id);
  }

  get count(): number {
    return this.found.size;
  }

  get total(): number {
    return sj_SECTIONS.length;
  }

  get all(): SectionId[] {
    return sj_SECTIONS.filter((sj_s) => this.found.has(sj_s.id)).map((sj_s) => sj_s.id);
  }

  /** Marks a section as found. Returns true if it was new. */
  discover(sj_id: SectionId): boolean {
    if (this.found.has(sj_id)) return false;
    this.found.add(sj_id);
    sj_storage.set('found', [...this.found]);
    this.emit('discover', sj_id);
    return true;
  }

  reset(): void {
    this.found.clear();
    sj_storage.set('found', []);
    this.emit('reset', undefined);
  }
}
