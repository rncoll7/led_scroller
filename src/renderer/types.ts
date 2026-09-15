import type { LedGrid } from '../layout';

export type Rgb = [number, number, number];

export interface LedStyle {
  /** Channels 0–1. */
  led: Rgb;
  background: Rgb;
  /** LED radius as a fraction of the pitch: 0.5 means neighbouring LEDs touch. */
  radius: number;
  /** 0–1. */
  glow: number;
  /** Brightness of an unlit LED, 0–1. */
  dim: number;
}

export interface SignRenderer {
  readonly name: 'webgl' | 'css';
  readonly supportsGlow: boolean;
  /** `width` and `height` are the sign's CSS size before rotation. */
  resize(width: number, height: number, grid: LedGrid): void;
  setStyle(style: LedStyle): void;
  /** `frame` is column-major, grid.cols × grid.rows, brightness 0–255. */
  draw(frame: Uint8Array): void;
}
