import { describe, expect, it } from 'vitest';
import { cleanText, DEFAULT_SETTINGS, MAX_TEXT_LENGTH, RANGES, sanitize, type Settings } from './settings';

describe('sanitize', () => {
  it('returns the defaults for missing or broken input', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitize('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitize({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const custom: Settings = {
      ...DEFAULT_SETTINGS,
      text: 'Oi',
      led: '#ff0000',
      speed: 60,
      rows: 32,
      direction: 'right',
      rotation: '90',
      mirror: true,
      smooth: false,
    };
    expect(sanitize(custom)).toEqual(custom);
  });

  it('clamps and rounds numbers into their ranges', () => {
    const settings = sanitize({ speed: 9999, rows: 2, glow: 12.6, dim: Number.NaN });
    expect(settings.speed).toBe(RANGES.speed.max);
    expect(settings.rows).toBe(RANGES.rows.min);
    expect(settings.glow).toBe(13);
    expect(settings.dim).toBe(DEFAULT_SETTINGS.dim);
  });

  it('falls back field by field on values of the wrong kind', () => {
    const settings = sanitize({
      led: 'green',
      background: '#12345',
      direction: 'up',
      font: 'comic',
      rotation: 45,
      bold: 'yes',
      text: 42,
      speed: '50',
    });
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('lowercases colors', () => {
    expect(sanitize({ led: '#FFAA00' }).led).toBe('#ffaa00');
  });
});

describe('cleanText', () => {
  it('turns line breaks into single spaces', () => {
    expect(cleanText('Olá\n  mundo\r\n!')).toBe('Olá mundo !');
  });

  it('caps the length', () => {
    expect(cleanText('x'.repeat(MAX_TEXT_LENGTH + 10))).toHaveLength(MAX_TEXT_LENGTH);
  });
});
