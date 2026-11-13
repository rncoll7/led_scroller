/**
 * The scoreboard lock: once locked, whoever holds the phone can only score, undo and zero the score.
 * Leaving the scoreboard or opening the settings takes the owner's PIN.
 *
 * This keeps a helper from wandering off the scoreboard; it is not a safe. Anyone who clears the
 * site's data clears the PIN too, and the system buttons (Home, app switcher) are beyond any web page:
 * Android's "app pinning" and iOS "Guided Access" cover those.
 */
export interface LockState {
  locked: boolean;
  /** hashPin() of the owner's PIN, or '' before one is set. */
  pin: string;
}

export const PIN_LENGTH = 4;

export const isValidPin = (pin: string): boolean => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

/**
 * FNV-1a of the salted PIN. Not a password hash, and it does not need to be: with 10 000 possible PINs
 * any hash falls to brute force. It only keeps the PIN from sitting in storage as plain text.
 * crypto.subtle would also be unavailable when the app is opened over plain http on the local network.
 */
export function hashPin(pin: string): string {
  let hash = 0x811c9dc5;
  for (const ch of `led-scroller:${pin}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export const checkPin = (state: LockState, pin: string): boolean => state.pin !== '' && hashPin(pin) === state.pin;

/** Locked without a PIN could never be opened again, so that combination comes back unlocked. */
export function sanitizeLock(raw: unknown): LockState {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof LockState, unknown>>;
  const pin = typeof input.pin === 'string' && /^[0-9a-f]{8}$/.test(input.pin) ? input.pin : '';
  return { locked: input.locked === true && pin !== '', pin };
}
