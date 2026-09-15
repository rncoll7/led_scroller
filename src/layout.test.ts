import { describe, expect, it } from 'vitest';
import { ledGrid, quarterTurns, signLayout } from './layout';

describe('quarterTurns', () => {
  it('auto keeps landscape screens upright and turns portrait screens sideways', () => {
    expect(quarterTurns('auto', 844, 390)).toBe(0);
    expect(quarterTurns('auto', 390, 844)).toBe(1);
    expect(quarterTurns('auto', 500, 500)).toBe(0);
  });

  it('uses a fixed rotation as given, whatever the screen shape', () => {
    expect(quarterTurns('0', 390, 844)).toBe(0);
    expect(quarterTurns('180', 844, 390)).toBe(2);
    expect(quarterTurns('270', 844, 390)).toBe(3);
  });
});

describe('signLayout', () => {
  it('swaps width and height when the sign is sideways', () => {
    expect(signLayout(390, 844, 'auto')).toMatchObject({ turns: 1, width: 844, height: 390 });
    expect(signLayout(844, 390, '180')).toMatchObject({ turns: 2, width: 844, height: 390 });
  });

  it('translates the rotated sign back over the screen', () => {
    expect(signLayout(844, 390, '0').transform).toBe('none');
    expect(signLayout(390, 844, '90').transform).toBe('translate(390px, 0) rotate(90deg)');
    expect(signLayout(390, 844, '180').transform).toBe('translate(390px, 844px) rotate(180deg)');
    expect(signLayout(390, 844, '270').transform).toBe('translate(0, 844px) rotate(270deg)');
  });
});

describe('ledGrid', () => {
  it('fills the height with the rows and fits whole columns across', () => {
    expect(ledGrid(1000, 200, 20)).toEqual({ cols: 100, rows: 20, pitch: 10, offsetX: 0 });
  });

  it('centers the columns when the width is not a multiple of the pitch', () => {
    const grid = ledGrid(1005, 200, 20);
    expect(grid.cols).toBe(100);
    expect(grid.offsetX).toBeCloseTo(2.5);
  });

  it('does not lose a column to floating point error', () => {
    expect(ledGrid(100, 100, 30).cols).toBe(30);
  });
});
