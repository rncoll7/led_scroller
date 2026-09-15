import { sanitize, type Settings } from './settings';

const KEY = 'led-scroller:settings';

export const storage = {
  settings(): Settings {
    try {
      const raw = localStorage.getItem(KEY);
      return sanitize(raw === null ? null : JSON.parse(raw));
    } catch {
      return sanitize(null);
    }
  },
  saveSettings(settings: Settings): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Private mode or full storage: the sign still works, it just won't remember.
    }
  },
};
