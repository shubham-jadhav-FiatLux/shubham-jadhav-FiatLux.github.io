/**
 * Safe wrapper around localStorage. Storage can be unavailable (private mode, sandboxed
 * iframes, blocked cookies), so every access is guarded and the game never depends on it.
 */
const sj_PREFIX = 'valley-of-peace:';

export const sj_storage = {
  get<T>(sj_key: string, sj_fallback: T): T {
    try {
      const sj_raw = window.localStorage.getItem(sj_PREFIX + sj_key);
      return sj_raw === null ? sj_fallback : (JSON.parse(sj_raw) as T);
    } catch {
      return sj_fallback;
    }
  },
  set<T>(sj_key: string, sj_value: T): void {
    try {
      window.localStorage.setItem(sj_PREFIX + sj_key, JSON.stringify(sj_value));
    } catch {
      /* storage unavailable: ignore */
    }
  },
  remove(sj_key: string): void {
    try {
      window.localStorage.removeItem(sj_PREFIX + sj_key);
    } catch {
      /* ignore */
    }
  },
};
