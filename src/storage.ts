import { sanitizeLock, type LockState } from './lock';
import { sanitize, type Settings } from './settings';
import { sanitizeMatch, type Match } from './volei';

const KEY = 'led-scroller:settings';
const MATCH_KEY = 'led-scroller:match';
const LOCK_KEY = 'led-scroller:lock';

function read<T>(key: string, clean: (raw: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key);
    return clean(raw === null ? null : JSON.parse(raw));
  } catch {
    return clean(null);
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the sign still works, it just won't remember.
  }
}

export const storage = {
  settings: (): Settings => read(KEY, sanitize),
  saveSettings: (settings: Settings): void => write(KEY, settings),
  /** Null when no match was saved yet. */
  match: (): Match | null => read(MATCH_KEY, (raw) => (raw === null ? null : sanitizeMatch(raw))),
  saveMatch: (match: Match): void => write(MATCH_KEY, match),
  lock: (): LockState => read(LOCK_KEY, sanitizeLock),
  saveLock: (lock: LockState): void => write(LOCK_KEY, lock),
};
