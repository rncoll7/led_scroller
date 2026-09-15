import type { Rotation } from './settings';

export type QuarterTurns = 0 | 1 | 2 | 3;

export interface SignLayout {
  turns: QuarterTurns;
  /** Size of the sign before rotation, in CSS px. */
  width: number;
  height: number;
  /** CSS transform (origin at the top-left corner) that puts the rotated sign back over the screen. */
  transform: string;
}

export interface LedGrid {
  cols: number;
  rows: number;
  /** Distance between LED centers, in CSS px. */
  pitch: number;
  /** Left margin that centers the whole columns on the sign, in CSS px. */
  offsetX: number;
}

/**
 * `auto` runs the text along the long side of the screen: a phone held sideways with rotation lock on
 * still shows a readable sign. 90 is a clockwise turn, the one that reads upright with the phone's top to the left.
 */
export function quarterTurns(rotation: Rotation, screenWidth: number, screenHeight: number): QuarterTurns {
  if (rotation === 'auto') return screenHeight > screenWidth ? 1 : 0;
  return (Number(rotation) / 90) as QuarterTurns;
}

export function signLayout(screenWidth: number, screenHeight: number, rotation: Rotation): SignLayout {
  const turns = quarterTurns(rotation, screenWidth, screenHeight);
  const sideways = turns % 2 === 1;
  const transform = [
    'none',
    `translate(${screenWidth}px, 0) rotate(90deg)`,
    `translate(${screenWidth}px, ${screenHeight}px) rotate(180deg)`,
    `translate(0, ${screenHeight}px) rotate(270deg)`,
  ][turns];
  return {
    turns,
    width: sideways ? screenHeight : screenWidth,
    height: sideways ? screenWidth : screenHeight,
    transform,
  };
}

/** The rows fill the sign's height; as many whole columns as fit go across, centered. */
export function ledGrid(width: number, height: number, rows: number): LedGrid {
  const pitch = height / rows;
  // The epsilon keeps 100 / (100 / 30) from flooring to 29.
  const cols = Math.max(1, Math.floor(width / pitch + 1e-6));
  return { cols, rows, pitch, offsetX: (width - cols * pitch) / 2 };
}
