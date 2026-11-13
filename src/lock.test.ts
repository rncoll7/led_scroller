import { describe, expect, it } from 'vitest';
import { checkPin, hashPin, isValidPin, sanitizeLock } from './lock';

describe('PIN', () => {
  it('accepts exactly four digits', () => {
    expect(isValidPin('0420')).toBe(true);
    for (const pin of ['', '123', '12345', '12a4', ' 1234', '١٢٣٤']) expect(isValidPin(pin)).toBe(false);
  });

  it('stores a hash, not the PIN', () => {
    expect(hashPin('1234')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashPin('1234')).not.toContain('1234');
    expect(hashPin('1234')).toBe(hashPin('1234'));
    expect(hashPin('1234')).not.toBe(hashPin('1243'));
  });

  it('gives every four-digit PIN its own hash', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 10000; n++) seen.add(hashPin(String(n).padStart(4, '0')));
    expect(seen.size).toBe(10000);
  });

  it('checks a PIN against the stored hash', () => {
    const state = { locked: true, pin: hashPin('2468') };
    expect(checkPin(state, '2468')).toBe(true);
    expect(checkPin(state, '2469')).toBe(false);
    expect(checkPin({ locked: false, pin: '' }, '')).toBe(false);
  });
});

describe('sanitizeLock', () => {
  it('starts unlocked and without a PIN', () => {
    expect(sanitizeLock(null)).toEqual({ locked: false, pin: '' });
    expect(sanitizeLock('x')).toEqual({ locked: false, pin: '' });
  });

  it('keeps a valid saved lock', () => {
    const saved = { locked: true, pin: hashPin('1111') };
    expect(sanitizeLock(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('never comes back locked without a PIN to open it', () => {
    expect(sanitizeLock({ locked: true, pin: '' })).toEqual({ locked: false, pin: '' });
    expect(sanitizeLock({ locked: true, pin: 'nothex!!' })).toEqual({ locked: false, pin: '' });
  });
});
