import type { LedGrid } from '../layout';
import type { LedStyle, Rgb, SignRenderer } from './types';

/**
 * Fallback for browsers without WebGL2, built from DOM/CSS rather than drawing each LED: the frame goes into
 * a canvas of one pixel per LED, CSS scales it up with `image-rendering: pixelated`, and a repeating
 * radial-gradient mask cuts it into round LEDs. Per frame that is a single putImageData of a few thousand
 * pixels; scaling and masking happen in the compositor. No glow.
 */
export class CssRenderer implements SignRenderer {
  readonly name = 'css';
  readonly supportsGlow = false;
  private readonly board = document.createElement('div');
  private readonly pixels = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private grid: LedGrid | null = null;
  private led: Rgb = [0, 255, 0];

  constructor(container: HTMLElement) {
    const context = this.pixels.getContext('2d');
    if (!context) throw new Error('Canvas 2D not available');
    this.context = context;
    this.board.className = 'css-board';
    this.pixels.className = 'css-pixels';
    this.board.append(this.pixels);
    container.append(this.board);
  }

  resize(_width: number, height: number, grid: LedGrid): void {
    this.grid = grid;
    this.pixels.width = grid.cols;
    this.pixels.height = grid.rows;
    this.image = this.context.createImageData(grid.cols, grid.rows);
    const style = this.board.style;
    style.left = `${grid.offsetX}px`;
    style.width = `${grid.cols * grid.pitch}px`;
    style.height = `${height}px`;
    style.setProperty('--pitch', `${grid.pitch}px`);
  }

  setStyle(style: LedStyle): void {
    this.led = style.led.map((channel) => Math.round(channel * 255)) as Rgb;
    const unlit = this.led.map((channel) => Math.round(channel * style.dim));
    this.board.style.setProperty('--unlit', `rgb(${unlit.join(', ')})`);
    this.board.style.setProperty('--dot', `${style.radius * 200}%`);
  }

  draw(frame: Uint8Array): void {
    const { image, grid } = this;
    if (!image || !grid) return;
    const data = image.data;
    const [r, g, b] = this.led;
    const { cols, rows } = grid;
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const i = (row * cols + col) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = frame[col * rows + row];
      }
    }
    this.context.putImageData(image, 0, 0);
  }
}
