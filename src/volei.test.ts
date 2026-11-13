import { describe, expect, it } from 'vitest';
import { addPoint, BEACH, callTimeout, matchState, newMatch, sanitizeMatch, setServer, undo, type Match, type Team } from './volei';

/** Plays points in order: 'aab' is two points for A, then one for B. */
function play(match: Match, rallies: string): Match {
  for (const team of rallies) match = addPoint(match, team as Team);
  return match;
}

const times = (team: Team, n: number) => team.repeat(n);

describe('set scoring', () => {
  it('counts points and gives the serve to the rally winner', () => {
    const state = matchState(play(newMatch(BEACH, 'a'), 'aab'));
    expect(state.sets[0]).toEqual({ a: 2, b: 1, winner: null });
    expect(state.server).toBe('b');
  });

  it('ends a set at 21 with a two-point lead', () => {
    const state = matchState(play(newMatch(BEACH, 'a'), times('a', 21)));
    expect(state.sets[0].winner).toBe('a');
    expect(state.setsWon).toEqual({ a: 1, b: 0 });
    expect(state.setNumber).toBe(2);
    expect(state.setJustEnded).toBe(true);
  });

  it('keeps going past 21 until someone leads by two', () => {
    let match = play(newMatch(BEACH, 'a'), times('a', 20) + times('b', 20) + 'a');
    expect(matchState(match).sets[0]).toEqual({ a: 21, b: 20, winner: null });
    match = play(match, 'bb');
    expect(matchState(match).sets[0]).toEqual({ a: 21, b: 22, winner: null });
    match = play(match, 'b');
    expect(matchState(match).sets[0]).toEqual({ a: 21, b: 23, winner: 'b' });
  });

  it('plays the deciding set to 15 and ends the match', () => {
    let match = play(newMatch(BEACH, 'a'), times('a', 21) + times('b', 21));
    expect(matchState(match).setNumber).toBe(3);
    match = play(match, times('b', 14));
    expect(matchState(match).winner).toBeNull();
    match = play(match, 'b');
    const state = matchState(match);
    expect(state.winner).toBe('b');
    expect(state.setsWon).toEqual({ a: 1, b: 2 });
    expect(state.sets.map((s) => [s.a, s.b])).toEqual([
      [21, 0],
      [0, 21],
      [0, 15],
    ]);
  });

  it('ignores points after the match is over', () => {
    const over = play(newMatch(BEACH, 'a'), times('a', 42));
    expect(matchState(over).winner).toBe('a');
    expect(addPoint(over, 'b')).toBe(over);
  });
});

describe('serve', () => {
  it('starts with nobody serving until the toss, and the first rally winner keeps it', () => {
    expect(matchState(newMatch()).server).toBeNull();
    expect(matchState(play(newMatch(), 'b')).server).toBe('b');
  });

  it('gives the first serve of set 2 to the team that did not serve first in set 1', () => {
    // A served first in set 1 and won it: B serves first in set 2, whoever won the set.
    expect(matchState(play(newMatch(BEACH, 'a'), times('a', 21))).server).toBe('b');
    expect(matchState(play(newMatch(BEACH, 'a'), times('b', 21))).server).toBe('b');
  });

  it('asks for a new toss before the deciding set', () => {
    let match = play(newMatch(BEACH, 'a'), times('a', 21) + times('b', 21));
    expect(matchState(match).server).toBeNull();
    match = setServer(match, 'b');
    expect(matchState(match).server).toBe('b');
  });

  it('uses a corrected toss for the next set', () => {
    // The operator picked A by mistake and fixed it to B before the first rally.
    const match = setServer(newMatch(BEACH, 'a'), 'b');
    expect(matchState(play(match, times('a', 21))).server).toBe('a');
  });
});

describe('side switches', () => {
  it('flags every 7 points added up in a regular set', () => {
    let match = play(newMatch(BEACH, 'a'), 'aaaabb');
    expect(matchState(match).switchSides).toBe(false);
    match = play(match, 'b');
    expect(matchState(match).switchSides).toBe(true);
    match = play(match, 'a');
    expect(matchState(match).switchSides).toBe(false);
    expect(matchState(play(match, 'aaaaaa')).switchSides).toBe(true); // 14
  });

  it('flags every 5 points in the deciding set', () => {
    const match = play(newMatch(BEACH, 'a'), times('a', 21) + times('b', 21) + 'abab');
    expect(matchState(match).switchSides).toBe(false);
    expect(matchState(play(match, 'a')).switchSides).toBe(true);
  });

  it('does not flag a switch on the point that ends a set', () => {
    // 21–0 is 21 points, a multiple of 7, but the set is over.
    expect(matchState(play(newMatch(BEACH, 'a'), times('a', 21))).switchSides).toBe(false);
  });
});

describe('set point and match point', () => {
  it('shows set point at 20 and clears it when the lead is gone', () => {
    const match = play(newMatch(BEACH, 'a'), times('a', 20) + times('b', 19));
    expect(matchState(match).setPoint).toBe('a');
    expect(matchState(match).matchPoint).toBeNull();
    expect(matchState(play(match, 'b')).setPoint).toBeNull(); // 20–20
  });

  it('turns set point into match point when the set would win the match', () => {
    const match = play(newMatch(BEACH, 'a'), times('a', 21) + times('a', 20));
    expect(matchState(match).matchPoint).toBe('a');
  });

  it('marks match point at 14 in the deciding set', () => {
    const match = play(newMatch(BEACH, 'a'), times('a', 21) + times('b', 21) + times('b', 14));
    expect(matchState(match).matchPoint).toBe('b');
  });
});

describe('timeouts', () => {
  it('allows one per team per set and resets on the next set', () => {
    let match = callTimeout(newMatch(BEACH, 'a'), 'a');
    expect(matchState(match).timeoutsLeft).toEqual({ a: 0, b: 1 });
    expect(callTimeout(match, 'a')).toBe(match);
    match = play(match, times('a', 21));
    expect(matchState(match).timeoutsLeft).toEqual({ a: 1, b: 1 });
  });
});

describe('undo', () => {
  it('removes the last event, including the one that ended a set', () => {
    const match = play(newMatch(BEACH, 'a'), times('a', 21));
    const back = matchState(undo(match));
    expect(back.setNumber).toBe(1);
    expect(back.sets).toEqual([{ a: 20, b: 0, winner: null }]);
    expect(back.setsWon).toEqual({ a: 0, b: 0 });
  });

  it('can undo the match-winning point', () => {
    const over = play(newMatch(BEACH, 'a'), times('a', 42));
    expect(matchState(undo(over)).winner).toBeNull();
  });

  it('does nothing on an empty match', () => {
    const match = newMatch();
    expect(undo(match)).toBe(match);
  });
});

describe('sanitizeMatch', () => {
  it('falls back to a fresh beach match for broken input', () => {
    expect(sanitizeMatch(null)).toEqual(newMatch());
    expect(sanitizeMatch({ rules: 'x', events: 'y' })).toEqual(newMatch());
  });

  it('keeps valid events and rules and drops the rest', () => {
    const raw = {
      rules: { ...BEACH, points: 15, decidingPoints: -3 },
      events: [{ type: 'serve', team: 'b' }, { type: 'point', team: 'c' }, 7, { type: 'point', team: 'a', extra: 1 }],
    };
    expect(sanitizeMatch(raw)).toEqual({
      rules: { ...BEACH, points: 15 },
      events: [
        { type: 'serve', team: 'b' },
        { type: 'point', team: 'a' },
      ],
    });
  });

  it('round-trips through JSON', () => {
    const match = play(newMatch(BEACH, 'a'), 'abba');
    expect(sanitizeMatch(JSON.parse(JSON.stringify(match)))).toEqual(match);
  });
});
