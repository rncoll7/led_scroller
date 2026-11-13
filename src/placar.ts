import { scoreView, type ScoreView } from './scoreboard';
import type { Game } from './settings';
import { storage } from './storage';
import { addPoint, GAMES, matchState, newMatch, other, setServer, undo, type Match, type Team } from './volei';

export type Side = 'left' | 'right';

/** A second tap this soon after a point is a double tap, not another point. */
export const DOUBLE_TAP_MS = 300;
/** The reset button waits this long for the second tap that confirms it. */
export const RESET_CONFIRM_MS = 3000;

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every browser lets a page vibrate; the score on screen is the feedback that counts.
  }
}

interface Options {
  /** Called after anything that changes what the scoreboard shows. */
  changed: () => void;
  now?: () => number;
  /** The saved match, if any; a new one for `game` otherwise. */
  saved?: Match | null;
  save?: (match: Match) => void;
}

/**
 * The match on the scoreboard and what the operator can do to it. Every change is saved at once,
 * so a phone that locks, reloads or runs out of battery mid-game comes back on the same score.
 */
export class Scoreboard {
  match: Match;
  /** The team on the left half, as the viewer sees it. */
  leftTeam: Team = 'a';
  resetArmed = false;
  private lastPointAt = -Infinity;
  /** The match as it was before the last reset, so undo can bring it back. */
  private beforeReset: Match | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly changed: () => void;
  private readonly now: () => number;
  private readonly save: (match: Match) => void;

  constructor(game: Game, options: Options) {
    this.changed = options.changed;
    this.now = options.now ?? (() => performance.now());
    this.save = options.save ?? storage.saveMatch;
    this.match = (options.saved !== undefined ? options.saved : storage.match()) ?? newMatch(GAMES[game]);
  }

  teamAt(side: Side): Team {
    return side === 'left' ? this.leftTeam : other(this.leftTeam);
  }

  /** The side of the team that serves next, or null before the toss. */
  get servingSide(): Side | null {
    const server = matchState(this.match).server;
    return server === null ? null : server === this.leftTeam ? 'left' : 'right';
  }

  /** Points have been played: starting over would lose something. */
  get inProgress(): boolean {
    return this.match.events.some((event) => event.type === 'point');
  }

  view(): ScoreView {
    const view = scoreView(matchState(this.match), this.leftTeam);
    if (this.resetArmed) view.banner = ['ZERAR PLACAR?', 'ZERAR?'];
    return view;
  }

  private commit(next: Match, buzz?: number | number[]): void {
    this.match = next;
    this.save(next);
    if (buzz) vibrate(buzz);
    this.changed();
  }

  point(side: Side): void {
    const now = this.now();
    if (now - this.lastPointAt < DOUBLE_TAP_MS) return;
    const next = addPoint(this.match, this.teamAt(side));
    if (next === this.match) return; // the match is over
    this.lastPointAt = now;
    this.beforeReset = null;
    this.disarm();
    const state = matchState(next);
    // A longer buzz for what the operator has to call out: end of a set or match, change of sides.
    this.commit(next, state.winner || state.setJustEnded ? [80, 60, 80] : state.switchSides ? [40, 40, 40] : 25);
  }

  undo(): void {
    this.disarm();
    // Right after a reset, undo brings the whole match back.
    const previous = this.beforeReset ?? undo(this.match);
    this.beforeReset = null;
    if (previous === this.match) return;
    this.lastPointAt = -Infinity;
    this.commit(previous, 15);
  }

  /** First call arms the reset and asks on the sign; a second one within RESET_CONFIRM_MS zeroes the score. */
  reset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetTimer = setTimeout(() => this.disarm(), RESET_CONFIRM_MS);
      vibrate(15);
      this.changed();
      return;
    }
    this.disarm();
    // Same rules and the same first server: a new game between the same teams.
    const toss = this.match.events.find((event) => event.type === 'serve')?.team ?? null;
    const fresh = newMatch(this.match.rules, toss);
    if (this.match.events.length > fresh.events.length) this.beforeReset = this.match;
    this.lastPointAt = -Infinity;
    this.commit(fresh, [60, 40, 60]);
  }

  disarm(): void {
    if (!this.resetArmed) return;
    this.resetArmed = false;
    clearTimeout(this.resetTimer);
    this.changed();
  }

  /** A new match with the rules of `game`, waiting for the toss. Not undoable: it is the owner's call, from the settings. */
  newGame(game: Game): void {
    this.disarm();
    this.beforeReset = null;
    this.lastPointAt = -Infinity;
    this.commit(newMatch(GAMES[game]));
  }

  /** The toss, or a fix of who serves now. */
  serve(side: Side): void {
    const next = setServer(this.match, this.teamAt(side));
    if (next !== this.match) this.commit(next, 15);
  }
}
