/**
 * Safe wrapper around localStorage. Storage can be unavailable (private mode, sandboxed
 * iframes, blocked cookies), so every access is guarded and the game never depends on it.
 */
const PREFIX = 'vowb:';

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: ignore */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};
