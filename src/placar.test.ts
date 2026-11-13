import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOUBLE_TAP_MS, RESET_CONFIRM_MS, Scoreboard } from './placar';
import { matchState, newMatch, QUICK, type Match } from './volei';

let clock = 0;
let saved: Match[] = [];
let changes = 0;

function board(match: Match | null = null): Scoreboard {
  return new Scoreboard('praia', {
    changed: () => changes++,
    now: () => clock,
    saved: match,
    save: (m) => saved.push(m),
  });
}

/** Taps a side, far enough after the last tap not to count as a double tap. */
function tap(b: Scoreboard, side: 'left' | 'right', times = 1): void {
  for (let i = 0; i < times; i++) {
    clock += 1000;
    b.point(side);
  }
}

const score = (b: Scoreboard) => {
  const set = matchState(b.match).sets.at(-1)!;
  return [set.a, set.b];
};

beforeEach(() => {
  clock = 0;
  saved = [];
  changes = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('Scoreboard', () => {
  it('starts a beach match waiting for the toss, or picks up the saved one', () => {
    expect(board().match).toEqual(newMatch());
    const quick = newMatch(QUICK, 'b');
    expect(board(quick).match).toBe(quick);
  });

  it('scores for the team on each side and saves every point', () => {
    const b = board();
    tap(b, 'left', 2);
    tap(b, 'right');
    expect(score(b)).toEqual([2, 1]);
    expect(saved).toHaveLength(3);
    expect(saved.at(-1)).toBe(b.match);
  });

  it('follows swapped sides', () => {
    const b = board();
    b.leftTeam = 'b';
    tap(b, 'left');
    expect(score(b)).toEqual([0, 1]);
    expect(b.servingSide).toBe('left');
  });

  it('ignores a second tap that comes too fast', () => {
    const b = board();
    tap(b, 'left');
    clock += DOUBLE_TAP_MS - 1;
    b.point('left');
    expect(score(b)).toEqual([1, 0]);
    clock += 2;
    b.point('left');
    expect(score(b)).toEqual([2, 0]);
  });

  it('undoes the last point', () => {
    const b = board();
    tap(b, 'left', 3);
    b.undo();
    expect(score(b)).toEqual([2, 0]);
  });

  it('only resets on a second tap within the confirmation time', () => {
    const b = board();
    tap(b, 'left', 3);
    b.reset();
    expect(b.resetArmed).toBe(true);
    expect(b.view().banner).toContain('ZERAR?');
    expect(score(b)).toEqual([3, 0]);
    vi.advanceTimersByTime(RESET_CONFIRM_MS);
    expect(b.resetArmed).toBe(false);
    b.reset();
    b.reset();
    expect(score(b)).toEqual([0, 0]);
  });

  it('brings the match back with undo right after a reset', () => {
    const b = board(newMatch(undefined, 'a'));
    tap(b, 'left', 3);
    tap(b, 'right');
    b.reset();
    b.reset();
    expect(matchState(b.match).server).toBe('a'); // the toss is kept
    b.undo();
    expect(score(b)).toEqual([3, 1]);
  });

  it('forgets the match before the reset once a new point is played', () => {
    const b = board();
    tap(b, 'left', 3);
    b.reset();
    b.reset();
    tap(b, 'right');
    b.undo();
    b.undo();
    expect(score(b)).toEqual([0, 0]);
  });

  it('disarms the reset when a point is scored', () => {
    const b = board();
    b.reset();
    tap(b, 'left');
    expect(b.resetArmed).toBe(false);
    b.reset();
    expect(score(b)).toEqual([1, 0]); // that was a new first tap, not the confirmation
  });

  it('starts a new game with other rules and records the toss', () => {
    const b = board();
    tap(b, 'left', 5);
    expect(b.inProgress).toBe(true);
    b.newGame('rapida');
    expect(b.match.rules).toEqual(QUICK);
    expect(b.inProgress).toBe(false);
    expect(b.servingSide).toBeNull();
    b.serve('right');
    expect(b.servingSide).toBe('right');
  });

  it('tells the page to redraw after every change', () => {
    const b = board();
    tap(b, 'left');
    b.undo();
    b.reset();
    expect(changes).toBe(3);
  });
});
