import { describe, expect, it } from 'vitest';
import { ledGrid, quarterTurns, signLayout, toSign } from './layout';

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

describe('toSign', () => {
  // A 400×800 portrait phone: with turns = 1 the sign is 800×400 and its left edge is at the top of the screen.
  it('leaves an unrotated sign alone', () => {
    expect(toSign(0, 800, 400, 10, 20)).toEqual({ x: 10, y: 20 });
  });

  it('maps the top of a portrait screen to the left of a sign turned clockwise', () => {
    expect(toSign(1, 400, 800, 200, 50)).toEqual({ x: 50, y: 200 });
    expect(toSign(1, 400, 800, 390, 0)).toEqual({ x: 0, y: 10 }); // top-right corner of the screen is the sign's top-left
  });

  it('flips both axes upside down', () => {
    expect(toSign(2, 800, 400, 10, 20)).toEqual({ x: 790, y: 380 });
  });

  it('maps the bottom of a portrait screen to the left of a sign turned counter-clockwise', () => {
    expect(toSign(3, 400, 800, 0, 790)).toEqual({ x: 10, y: 0 });
  });

  it('inverts the CSS transform of signLayout for every rotation', () => {
    for (const rotation of ['0', '90', '180', '270'] as const) {
      const layout = signLayout(400, 800, rotation);
      // Forward: where the transform sends the sign point (30, 70).
      const [sx, sy] = [
        [30, 70],
        [400 - 70, 30],
        [400 - 30, 800 - 70],
        [70, 800 - 30],
      ][layout.turns];
      expect(toSign(layout.turns, 400, 800, sx, sy)).toEqual({ x: 30, y: 70 });
    }
  });
});
