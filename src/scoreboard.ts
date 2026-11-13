import { other, type MatchState, type Team } from './volei';

/** What one side of the scoreboard shows. */
export interface ScoreSide {
  score: number;
  sets: number;
  serving: boolean;
}

export interface ScoreView {
  left: ScoreSide;
  right: ScoreSide;
  /** Message for the top band, longest first: the first one that fits is shown, in place of sets and serve. */
  banner: string[];
}

/** Brightness, 0–255: the score at full power, the divider in the background. */
const BRIGHT = 255;
const DIVIDER = 70;

// ---- 3×5 pixel font for sets and messages ----

const SMALL_ROWS = 5;
const SMALL: Record<string, string> = {
  '0': '### #.# #.# #.# ###',
  '1': '.#. ##. .#. .#. ###',
  '2': '### ..# ### #.. ###',
  '3': '### ..# .## ..# ###',
  '4': '#.# #.# ### ..# ..#',
  '5': '### #.. ### ..# ###',
  '6': '### #.. ### #.# ###',
  '7': '### ..# ..# .#. .#.',
  '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ###',
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ### .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  W: '#.# #.# ### ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  ' ': '... ... ... ... ...',
  '-': '... ... ### ... ...',
  '?': '##. ..# .#. ... .#.',
  '!': '.#. .#. .#. ... .#.',
};
const BALL = ['.###.', '#####', '#####', '#####', '.###.'];

/** Upper case, accents dropped ("Ação" → "ACAO"), unknown characters shown as a space. */
function glyphs(text: string): string[][] {
  return [...text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()].map((ch) =>
    (SMALL[ch] ?? SMALL[' ']).split(' '),
  );
}

/** Width in LEDs of `text` in the small font at `scale`, one column of space between letters. */
export function smallWidth(text: string, scale: number): number {
  return text.length ? (text.length * 4 - 1) * scale : 0;
}

// ---- Drawing on a column-major frame ----

class Canvas {
  constructor(
    readonly out: Uint8Array,
    readonly cols: number,
    readonly rows: number,
  ) {}

  rect(x: number, y: number, w: number, h: number, value = BRIGHT): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.cols, x + w);
    const y1 = Math.min(this.rows, y + h);
    for (let col = x0; col < x1; col++) this.out.fill(value, col * this.rows + y0, col * this.rows + y1);
  }

  /** Draws a pattern of '#' rows, each cell `scale` LEDs wide and tall. */
  pattern(lines: string[], x: number, y: number, scale: number, value = BRIGHT): void {
    lines.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        if (line[col] === '#') this.rect(x + col * scale, y + row * scale, scale, scale, value);
      }
    });
  }

  text(text: string, x: number, y: number, scale: number, value = BRIGHT): void {
    glyphs(text).forEach((lines, i) => this.pattern(lines, x + i * 4 * scale, y, scale, value));
  }
}

// ---- Seven-segment digits: they stretch to any box, so the score fills the space it has ----

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

function digit(canvas: Canvas, d: string, x: number, y: number, w: number, h: number, t: number): void {
  const mid = y + Math.floor((h - t) / 2);
  const upper = mid - y + t; // the vertical strokes overlap the middle bar, so the joints are solid
  const lower = h - (mid - y);
  for (const segment of SEGMENTS[d] ?? '') {
    switch (segment) {
      case 'a': canvas.rect(x, y, w, t); break;
      case 'b': canvas.rect(x + w - t, y, t, upper); break;
      case 'c': canvas.rect(x + w - t, mid, t, lower); break;
      case 'd': canvas.rect(x, y + h - t, w, t); break;
      case 'e': canvas.rect(x, mid, t, lower); break;
      case 'f': canvas.rect(x, y, t, upper); break;
      case 'g': canvas.rect(x, mid, w, t); break;
    }
  }
}

export interface DigitBox {
  w: number;
  h: number;
  /** Stroke thickness. */
  t: number;
  /** Space between digits. */
  gap: number;
}

/** The largest digit that lets `count` digits fit in `width` × `height`, no wider than a real scoreboard digit. */
export function digitBox(width: number, height: number, count: number): DigitBox {
  const h = Math.max(1, height);
  let w = Math.max(1, Math.round(h * 0.62));
  for (;;) {
    const t = Math.max(1, Math.round(w / 4));
    const gap = t;
    if (w <= 3 || count * w + (count - 1) * gap <= width) return { w, h, t, gap };
    w--;
  }
}

/** Draws `score` centered in the box at (x, y), sized for two digits so the digits do not change size at 10. */
function score(canvas: Canvas, value: number, x: number, y: number, width: number, height: number): void {
  const text = String(Math.max(0, Math.floor(value)));
  const box = digitBox(width, height, Math.max(2, text.length));
  const used = text.length * box.w + (text.length - 1) * box.gap;
  const left = x + Math.floor((width - used) / 2);
  [...text].forEach((d, i) => digit(canvas, d, left + i * (box.w + box.gap), y, box.w, box.h, box.t));
}

// ---- Layout ----

/**
 * Fills `out` (column-major, `cols` × `rows`) with the scoreboard:
 *
 *   ●            1 │ 0
 *       12       ┆      8
 *
 * the score of each team on its half, a dotted divider between them, and a top band with the
 * sets won (next to the divider) and a ball on the serving side (at the outer edge).
 * A banner replaces the top band when there is something to announce.
 */
export function drawScoreboard(out: Uint8Array, cols: number, rows: number, view: ScoreView): void {
  out.fill(0);
  const canvas = new Canvas(out, cols, rows);
  const margin = rows >= 16 ? 1 : 0;
  const scale = Math.max(1, Math.floor(rows / 20));
  const bandHeight = SMALL_ROWS * scale;
  // Too short for a band and a readable score: the score gets every row.
  const hasBand = rows - 2 * margin - bandHeight - scale >= 7;
  const top = margin + (hasBand ? bandHeight + scale : 0);
  const height = rows - margin - top;

  const leftWidth = Math.floor((cols - 1) / 2);
  const divider = leftWidth;
  const rightX = divider + 1;
  const rightWidth = cols - rightX;
  const inner = Math.max(1, scale); // space kept free on each side of the divider

  for (let row = top; row < rows - margin; row += 2) canvas.rect(divider, row, 1, 1, DIVIDER);

  score(canvas, view.left.score, margin, top, leftWidth - margin - inner, height);
  score(canvas, view.right.score, rightX + inner, top, rightWidth - margin - inner, height);

  if (!hasBand) return;
  const banner = view.banner.find((text) => smallWidth(text, scale) <= cols - 2 * margin);
  if (banner) {
    canvas.text(banner, Math.floor((cols - smallWidth(banner, scale)) / 2), margin, scale);
    return;
  }
  const leftSets = String(view.left.sets);
  const rightSets = String(view.right.sets);
  canvas.text(leftSets, divider - inner - smallWidth(leftSets, scale), margin, scale);
  canvas.text(rightSets, rightX + inner, margin, scale);
  if (view.left.serving) canvas.pattern(BALL, margin, margin, scale);
  if (view.right.serving) canvas.pattern(BALL, cols - margin - BALL[0].length * scale, margin, scale);
}

// ---- From the match to what is on screen ----

function announce(state: MatchState): string[] {
  if (state.winner) return ['FIM DE JOGO', 'FIM'];
  if (state.setJustEnded) {
    const n = state.setNumber - 1;
    return [`FIM DO SET ${n}`, `FIM SET ${n}`, 'FIM SET'];
  }
  if (state.switchSides) return ['TROCA DE LADO', 'TROCA'];
  if (state.server === null) return ['QUEM SACA?', 'SAQUE?'];
  if (state.matchPoint) return ['MATCH POINT', 'MATCH PT'];
  if (state.setPoint) return ['SET POINT', 'SET PT'];
  return [];
}

/**
 * What the scoreboard shows for a match. `leftTeam` is the team on the left of the screen.
 * Right after a set ends (and when the match is over) it keeps the final score of that set on screen;
 * the next point starts the new set.
 */
export function scoreView(state: MatchState, leftTeam: Team = 'a'): ScoreView {
  const shown = state.setJustEnded ? state.sets[state.sets.length - 2] : state.sets[state.sets.length - 1];
  const side = (team: Team): ScoreSide => ({
    score: shown[team],
    sets: state.setsWon[team],
    serving: !state.winner && state.server === team,
  });
  return { left: side(leftTeam), right: side(other(leftTeam)), banner: announce(state) };
}
