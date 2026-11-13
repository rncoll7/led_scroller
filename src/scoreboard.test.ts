import { describe, expect, it } from 'vitest';
import { digitBox, drawScoreboard, scoreView, smallWidth, type ScoreView } from './scoreboard';
import { addPoint, BEACH, matchState, newMatch, QUICK, type Match, type Team } from './volei';

/** The frame as text, one string per LED row: '#' lit, ':' dim, '.' off. */
function ascii(cols: number, rows: number, view: ScoreView): string[] {
  const out = new Uint8Array(cols * rows);
  drawScoreboard(out, cols, rows, view);
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const v = out[col * rows + row];
      return v === 255 ? '#' : v ? ':' : '.';
    }).join(''),
  );
}

const lit = (lines: string[], x0: number, x1: number, y0 = 0, y1 = lines.length) =>
  lines.slice(y0, y1).some((line) => line.slice(x0, x1).includes('#'));

const view = (over: Partial<ScoreView> = {}): ScoreView => ({
  left: { score: 12, sets: 1, serving: true },
  right: { score: 8, sets: 0, serving: false },
  banner: [],
  ...over,
});

function play(match: Match, rallies: string): Match {
  for (const team of rallies) match = addPoint(match, team as Team);
  return match;
}

describe('drawScoreboard', () => {
  it('draws the 43×20 phone layout: sets, serve ball, score and divider', () => {
    expect(ascii(43, 20, view())).toEqual([
      '...........................................',
      '..###.............#....###.................',
      '.#####...........##....#.#.................',
      '.#####............#....#.#.................',
      '.#####............#....#.#.................',
      '..###............###...###.................',
      '...........................................',
      '.......##..#######...:.......#######.......',
      '.......##..#######...........#######.......',
      '.......##.......##...:.......##...##.......',
      '.......##.......##...........##...##.......',
      '.......##.......##...:.......##...##.......',
      '.......##..#######...........#######.......',
      '.......##..#######...:.......#######.......',
      '.......##..##................##...##.......',
      '.......##..##........:.......##...##.......',
      '.......##..##................##...##.......',
      '.......##..#######...:.......#######.......',
      '.......##..#######...........#######.......',
      '...........................................',
    ]);
  });

  it('puts the serve ball on the serving side', () => {
    const rows = ascii(43, 20, view({ left: { score: 0, sets: 0, serving: false }, right: { score: 0, sets: 0, serving: true } }));
    expect(lit(rows, 0, 6, 0, 6)).toBe(false);
    expect(lit(rows, 37, 43, 0, 6)).toBe(true);
  });

  it('shows the first banner that fits instead of sets and serve', () => {
    const rows = ascii(43, 20, view({ banner: ['MATCH POINT', 'MATCH PT'] }));
    // "MATCH POINT" is 43 LEDs wide and does not fit inside the margins, "MATCH PT" (31) does.
    expect(rows[1]).toBe('......#.#..#..###..##.#.#.....##..###......');
    expect(lit(rows, 0, 6, 0, 6)).toBe(false);
  });

  it('gives every row to the score when the sign is too short for the band', () => {
    const rows = ascii(28, 12, view());
    expect(rows[0]).toContain('#');
    expect(rows.every((line) => line.length === 28)).toBe(true);
  });

  it('never writes outside the frame on tiny or odd grids', () => {
    for (const [cols, rows] of [[1, 8], [5, 8], [12, 9], [200, 64], [44, 20]]) {
      const out = new Uint8Array(cols * rows);
      expect(() => drawScoreboard(out, cols, rows, view({ left: { score: 104, sets: 1, serving: true } }))).not.toThrow();
      expect(out.length).toBe(cols * rows);
    }
  });
});

describe('digitBox', () => {
  it('keeps the scoreboard proportions when there is room', () => {
    expect(digitBox(100, 12, 2)).toEqual({ w: 7, h: 12, t: 2, gap: 2 });
  });

  it('narrows the digits to fit the width', () => {
    const box = digitBox(16, 24, 2);
    expect(2 * box.w + box.gap).toBeLessThanOrEqual(16);
  });
});

describe('smallWidth', () => {
  it('counts 3 LEDs per letter plus one between letters', () => {
    expect(smallWidth('', 1)).toBe(0);
    expect(smallWidth('A', 1)).toBe(3);
    expect(smallWidth('SET', 2)).toBe(22);
  });
});

describe('scoreView', () => {
  it('shows team A on the left unless the sides are swapped', () => {
    const state = matchState(play(newMatch(BEACH, 'a'), 'aab'));
    expect(scoreView(state).left).toEqual({ score: 2, sets: 0, serving: false });
    expect(scoreView(state).right).toEqual({ score: 1, sets: 0, serving: true });
    expect(scoreView(state, 'b').left.score).toBe(1);
  });

  it('keeps the final score of a set on screen until the next point', () => {
    const match = play(newMatch(BEACH, 'a'), 'b'.repeat(19) + 'a'.repeat(21));
    const shown = scoreView(matchState(match));
    expect([shown.left.score, shown.right.score]).toEqual([21, 19]);
    expect(shown.left.sets).toBe(1);
    expect(shown.banner[0]).toBe('FIM DO SET 1');
    expect(scoreView(matchState(addPoint(match, 'a'))).left.score).toBe(1);
  });

  it('announces the side switch, the toss, set point and the end', () => {
    expect(scoreView(matchState(play(newMatch(BEACH, 'a'), 'aaaaaaa'))).banner).toContain('TROCA');
    expect(scoreView(matchState(newMatch())).banner).toContain('SAQUE?');
    expect(scoreView(matchState(play(newMatch(BEACH, 'a'), 'a'.repeat(20)))).banner).toContain('SET PT');
    expect(scoreView(matchState(play(newMatch(QUICK, 'a'), 'a'.repeat(11)))).banner).toContain('MATCH PT');
    const over = scoreView(matchState(play(newMatch(QUICK, 'a'), 'a'.repeat(12))));
    expect(over.banner).toContain('FIM');
    expect(over.left.score).toBe(12);
    expect(over.left.serving || over.right.serving).toBe(false);
  });
});
