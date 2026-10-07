/** Minimal strongly-typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(sj_payload: never) => void>>();

  on<K extends keyof Events>(sj_type: K, sj_fn: (sj_payload: Events[K]) => void): () => void {
    let sj_set = this.listeners.get(sj_type);
    if (!sj_set) {
      sj_set = new Set();
      this.listeners.set(sj_type, sj_set);
    }
    sj_set.add(sj_fn as (sj_payload: never) => void);
    return () => this.off(sj_type, sj_fn);
  }

  off<K extends keyof Events>(sj_type: K, sj_fn: (sj_payload: Events[K]) => void): void {
    this.listeners.get(sj_type)?.delete(sj_fn as (sj_payload: never) => void);
  }

  emit<K extends keyof Events>(sj_type: K, sj_payload: Events[K]): void {
    const sj_set = this.listeners.get(sj_type);
    if (!sj_set) return;
    for (const sj_fn of [...sj_set]) (sj_fn as (sj_p: Events[K]) => void)(sj_payload);
  }
}
