export type Team = 'a' | 'b';

export interface Rules {
  /** Sets a team needs to win the match (beach: 2, best of 3). */
  setsToWin: number;
  /** Points to win a regular set. */
  points: number;
  /** Points to win the deciding set. */
  decidingPoints: number;
  /** Teams change sides every this many points added up (regular sets / deciding set). */
  switchEvery: number;
  decidingSwitchEvery: number;
  /** Timeouts each team may call per set. */
  timeouts: number;
}

/** FIVB beach volleyball. Every set is won by a two-point lead, with no cap. */
export const BEACH: Readonly<Rules> = {
  setsToWin: 2,
  points: 21,
  decidingPoints: 15,
  switchEvery: 7,
  decidingSwitchEvery: 5,
  timeouts: 1,
};

/**
 * Everything that happened in the match, in order. The score is always worked out from this list,
 * so undo is just dropping the last event and a saved match cannot hold an impossible score.
 * `serve` sets who serves next: the coin toss, or a fix when the operator got it wrong.
 */
export type MatchEvent = { type: 'point'; team: Team } | { type: 'serve'; team: Team } | { type: 'timeout'; team: Team };

export interface Match {
  rules: Rules;
  events: MatchEvent[];
}

export interface SetScore {
  a: number;
  b: number;
  winner: Team | null;
}

export interface MatchState {
  /** Finished sets plus the one in play (or the last one, once the match is over). */
  sets: SetScore[];
  /** The set in play, 1-based. */
  setNumber: number;
  setsWon: Record<Team, number>;
  /** Null when nobody has been picked to serve yet (start of the match, start of the deciding set). */
  server: Team | null;
  timeoutsLeft: Record<Team, number>;
  /** The team one point away from winning the set, if any. */
  setPoint: Team | null;
  /** The team one point away from winning the match, if any. */
  matchPoint: Team | null;
  /** The last point made the teams change sides. */
  switchSides: boolean;
  /** The last point ended a set (and the match is not over). */
  setJustEnded: boolean;
  winner: Team | null;
}

export const other = (team: Team): Team => (team === 'a' ? 'b' : 'a');

export function newMatch(rules: Rules = BEACH, firstServer: Team | null = null): Match {
  return { rules: { ...rules }, events: firstServer ? [{ type: 'serve', team: firstServer }] : [] };
}

const isDeciding = (rules: Rules, setNumber: number) => setNumber === rules.setsToWin * 2 - 1;

export function matchState(match: Match): MatchState {
  const { rules } = match;
  const sets: SetScore[] = [{ a: 0, b: 0, winner: null }];
  const setsWon = { a: 0, b: 0 };
  let server: Team | null = null;
  let setFirstServer: Team | null = null;
  let timeoutsLeft = { a: rules.timeouts, b: rules.timeouts };
  let switchSides = false;
  let setJustEnded = false;
  let winner: Team | null = null;

  for (const event of match.events) {
    if (winner) break;
    if (event.type === 'serve') {
      server = event.team;
      // Before the first rally this is the toss (or a fix of it); later it only corrects the current serve.
      const set = sets[sets.length - 1];
      if (set.a + set.b === 0) setFirstServer = event.team;
      continue;
    }
    if (event.type === 'timeout') {
      if (timeoutsLeft[event.team] > 0) timeoutsLeft = { ...timeoutsLeft, [event.team]: timeoutsLeft[event.team] - 1 };
      continue;
    }

    const setNumber = sets.length;
    const deciding = isDeciding(rules, setNumber);
    const set = sets[setNumber - 1];
    set[event.team]++;
    if (setFirstServer === null) setFirstServer = event.team; // nobody was picked: the rally winner had served
    server = event.team;
    setJustEnded = switchSides = false;

    const target = deciding ? rules.decidingPoints : rules.points;
    const lead = set[event.team] - set[other(event.team)];
    if (set[event.team] >= target && lead >= 2) {
      set.winner = event.team;
      setsWon[event.team]++;
      if (setsWon[event.team] === rules.setsToWin) {
        winner = event.team;
        break;
      }
      setJustEnded = true;
      // The team that did not serve first in the last set serves first in the next one,
      // except in the deciding set, which starts with a new coin toss.
      const next = sets.length + 1;
      server = isDeciding(rules, next) ? null : other(setFirstServer);
      setFirstServer = server;
      timeoutsLeft = { a: rules.timeouts, b: rules.timeouts };
      sets.push({ a: 0, b: 0, winner: null });
      continue;
    }
    const every = deciding ? rules.decidingSwitchEvery : rules.switchEvery;
    switchSides = (set.a + set.b) % every === 0;
  }

  const setNumber = sets.length;
  const current = sets[setNumber - 1];
  let setPoint: Team | null = null;
  if (!winner) {
    const target = isDeciding(rules, setNumber) ? rules.decidingPoints : rules.points;
    for (const team of ['a', 'b'] as const) {
      if (current[team] + 1 >= target && current[team] + 1 - current[other(team)] >= 2) setPoint = team;
    }
  }
  const matchPoint = setPoint && setsWon[setPoint] + 1 === rules.setsToWin ? setPoint : null;

  return { sets, setNumber, setsWon, server, timeoutsLeft, setPoint, matchPoint, switchSides, setJustEnded, winner };
}

/** Adds an event, or returns the match unchanged when it does not count (match over, no timeouts left). */
function push(match: Match, event: MatchEvent): Match {
  const state = matchState(match);
  if (state.winner) return match;
  if (event.type === 'timeout' && state.timeoutsLeft[event.team] === 0) return match;
  if (event.type === 'serve' && state.server === event.team) return match;
  return { ...match, events: [...match.events, event] };
}

export const addPoint = (match: Match, team: Team): Match => push(match, { type: 'point', team });
export const setServer = (match: Match, team: Team): Match => push(match, { type: 'serve', team });
export const callTimeout = (match: Match, team: Team): Match => push(match, { type: 'timeout', team });

export function undo(match: Match): Match {
  return match.events.length ? { ...match, events: match.events.slice(0, -1) } : match;
}

const TEAMS = new Set(['a', 'b']);
const TYPES = new Set(['point', 'serve', 'timeout']);

/** Rebuilds a match from storage: unknown rules fall back to beach, broken events are dropped. */
export function sanitizeMatch(raw: unknown): Match {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as { rules?: unknown; events?: unknown };
  const rulesIn = (typeof input.rules === 'object' && input.rules !== null ? input.rules : {}) as Record<string, unknown>;
  const rules = { ...BEACH };
  for (const key of Object.keys(BEACH) as (keyof Rules)[]) {
    const value = rulesIn[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99) rules[key] = value;
  }
  const events = Array.isArray(input.events)
    ? input.events.filter(
        (e): e is MatchEvent =>
          typeof e === 'object' && e !== null && TYPES.has((e as MatchEvent).type) && TEAMS.has((e as MatchEvent).team),
      )
    : [];
  return { rules, events: events.map((e) => ({ type: e.type, team: e.team }) as MatchEvent) };
}
