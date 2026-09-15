import { describe, expect, it } from 'vitest';
import { advance, composeFrame, loopLength, startOffset, type TextBitmap } from './scroll';

/** Builds a bitmap from columns, each listing its LEDs top to bottom. */
const bitmap = (columns: number[][]): TextBitmap => ({
  cols: columns.length,
  rows: columns[0].length,
  data: Uint8Array.from(columns.flat()),
});

describe('loopLength', () => {
  it('adds a gap after a message longer than the sign', () => {
    expect(loopLength(100, 40, 10)).toBe(110);
  });

  it('is never shorter than the visible columns', () => {
    expect(loopLength(5, 40, 10)).toBe(40);
  });
});

describe('startOffset', () => {
  it('centers a message that fits', () => {
    const frame = new Uint8Array(10);
    composeFrame(frame, bitmap([[1], [2], [3], [4]]), 10, 10, startOffset(4, 10, 10), false, false);
    expect([...frame]).toEqual([0, 0, 0, 1, 2, 3, 4, 0, 0, 0]);
  });

  it('starts a long message at the left edge', () => {
    expect(startOffset(50, 10, 70)).toBe(0);
  });
});

describe('advance', () => {
  it('moves the text left by counting up, right by counting down, and wraps', () => {
    expect(advance(0, 0.5, 10, 'left', 20)).toBe(5);
    expect(advance(0, 0.5, 10, 'right', 20)).toBe(15);
    expect(advance(18, 0.5, 10, 'left', 20)).toBe(3);
  });
});

describe('composeFrame', () => {
  // 3 text columns × 2 rows, in a loop of 5 columns (2 blank).
  const text = bitmap([
    [10, 11],
    [20, 21],
    [30, 31],
  ]);

  it('copies whole columns and blanks the gap', () => {
    const out = new Uint8Array(8);
    composeFrame(out, text, 4, 5, 1, false, false);
    expect([...out]).toEqual([20, 21, 30, 31, 0, 0, 0, 0]);
  });

  it('wraps around the loop', () => {
    const out = new Uint8Array(8);
    composeFrame(out, text, 4, 5, 3, false, false);
    expect([...out]).toEqual([0, 0, 0, 0, 10, 11, 20, 21]);
  });

  it('mirrors the columns', () => {
    const out = new Uint8Array(8);
    composeFrame(out, text, 4, 5, 0, true, false);
    expect([...out]).toEqual([0, 0, 30, 31, 20, 21, 10, 11]);
  });

  it('blends neighbouring columns at a fractional offset when smooth', () => {
    const out = new Uint8Array(4);
    composeFrame(out, text, 2, 5, 0.5, false, true);
    expect([...out]).toEqual([15, 16, 25, 26]);
  });

  it('snaps a fractional offset down when not smooth', () => {
    const out = new Uint8Array(4);
    composeFrame(out, text, 2, 5, 1.9, false, false);
    expect([...out]).toEqual([20, 21, 30, 31]);
  });
});
