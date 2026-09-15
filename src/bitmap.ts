import type { TextBitmap } from './scroll';
import type { FontFamily } from './settings';

const FAMILIES: Record<FontFamily, string> = {
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
};

/** Browsers cap canvas width (some near 16k px), so long messages are rasterized in slices this wide. */
const SLICE = 4096;

export interface TextStyle {
  font: FontFamily;
  bold: boolean;
  /** Font size as a % of the row count. */
  size: number;
}

/** Rasterizes the message once, at one pixel per LED; scrolling then only reads from this bitmap. */
export function renderText(text: string, rows: number, style: TextStyle): TextBitmap {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D not available');

  const font = `${style.bold ? 'bold ' : ''}${Math.max(1, Math.round((rows * style.size) / 100))}px ${FAMILIES[style.font]}`;
  context.font = font;
  const metrics = context.measureText(text);
  const cols = Math.max(1, Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight)));
  // Center the message's own ink, so "Renan" is not pushed up to leave room for descenders it does not have.
  const { actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } = metrics;
  const baseline = Math.round((rows - ascent - descent) / 2 + ascent);

  const data = new Uint8Array(cols * rows);
  canvas.height = rows;
  for (let start = 0; start < cols; start += SLICE) {
    const width = Math.min(SLICE, cols - start);
    canvas.width = width; // resets the context, font included
    context.font = font;
    context.fillStyle = '#fff';
    context.fillText(text, -start, baseline);
    const alpha = context.getImageData(0, 0, width, rows).data;
    for (let x = 0; x < width; x++) {
      const dst = (start + x) * rows;
      for (let y = 0; y < rows; y++) data[dst + y] = alpha[(y * width + x) * 4 + 3];
    }
  }
  return { cols, rows, data };
}
