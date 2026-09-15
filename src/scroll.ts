import type { Direction } from './settings';

/** A message rendered at one texel per LED. Column-major: `data[col * rows + row]` is the brightness, 0–255. */
export interface TextBitmap {
  cols: number;
  rows: number;
  data: Uint8Array;
}

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * Columns in one loop of the message: the text plus a gap as wide as the sign is tall before it repeats,
 * and never fewer than the visible columns, so a short message leaving on one side comes back on the other.
 */
export function loopLength(textCols: number, visibleCols: number, rows: number): number {
  return Math.max(textCols + rows, visibleCols);
}

/** Offset for the first frame: a message that fits starts centered, a longer one starts at the left edge. */
export function startOffset(textCols: number, visibleCols: number, period: number): number {
  return textCols >= visibleCols ? 0 : mod(-Math.floor((visibleCols - textCols) / 2), period);
}

/** Moves the offset by `seconds` at `speed` LEDs per second; `left` means the text travels to the left. */
export function advance(offset: number, seconds: number, speed: number, direction: Direction, period: number): number {
  return mod(offset + seconds * speed * (direction === 'left' ? 1 : -1), period);
}

/**
 * Fills `out` (column-major, `cols` × text.rows) with what each LED shows at `offset` columns into the loop.
 * With `smooth`, a fractional offset blends the two text columns under an LED instead of snapping to one.
 */
export function composeFrame(
  out: Uint8Array,
  text: TextBitmap,
  cols: number,
  period: number,
  offset: number,
  mirror: boolean,
  smooth: boolean,
): void {
  const { rows, data } = text;
  const whole = Math.floor(offset);
  const fraction = smooth ? offset - whole : 0;

  for (let col = 0; col < cols; col++) {
    const a = ((mirror ? cols - 1 - col : col) + whole) % period;
    const dst = col * rows;
    if (fraction === 0) {
      if (a < text.cols) out.set(data.subarray(a * rows, a * rows + rows), dst);
      else out.fill(0, dst, dst + rows);
      continue;
    }
    const b = (a + 1) % period;
    const srcA = a < text.cols ? a * rows : -1;
    const srcB = b < text.cols ? b * rows : -1;
    for (let row = 0; row < rows; row++) {
      const va = srcA < 0 ? 0 : data[srcA + row];
      const vb = srcB < 0 ? 0 : data[srcB + row];
      // Uint8Array truncates on write, so + 0.5 rounds.
      out[dst + row] = va + (vb - va) * fraction + 0.5;
    }
  }
}
