export type Direction = 'left' | 'right';
export type FontFamily = 'mono' | 'sans' | 'serif';
export type Rotation = 'auto' | '0' | '90' | '180' | '270';

export interface Settings {
  text: string;
  led: string;
  background: string;
  speed: number;
  rows: number;
  textSize: number;
  dotSize: number;
  glow: number;
  dim: number;
  direction: Direction;
  font: FontFamily;
  rotation: Rotation;
  bold: boolean;
  mirror: boolean;
  smooth: boolean;
  keepAwake: boolean;
}

export type RangeKey = 'speed' | 'rows' | 'textSize' | 'dotSize' | 'glow' | 'dim';
export type ToggleKey = 'bold' | 'mirror' | 'smooth' | 'keepAwake';
export type ColorKey = 'led' | 'background';
export type ChoiceKey = 'direction' | 'font' | 'rotation';

export const MAX_TEXT_LENGTH = 500;

/** Slider bounds, shared by the settings panel and by sanitize(). */
export const RANGES: Record<RangeKey, { min: number; max: number; step: number }> = {
  speed: { min: 0, max: 120, step: 1 }, // LEDs per second
  rows: { min: 8, max: 64, step: 1 }, // LED rows on the sign
  textSize: { min: 50, max: 150, step: 5 }, // font size, % of the sign height
  dotSize: { min: 30, max: 100, step: 5 }, // LED diameter, % of the LED pitch
  glow: { min: 0, max: 100, step: 5 },
  dim: { min: 0, max: 40, step: 1 }, // brightness of an unlit LED, %
};

export const CHOICES: { [K in ChoiceKey]: readonly Settings[K][] } = {
  direction: ['left', 'right'],
  font: ['mono', 'sans', 'serif'],
  rotation: ['auto', '0', '90', '180', '270'],
};

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  text: 'Renan',
  led: '#00ff00',
  background: '#191919',
  speed: 25,
  rows: 20,
  textSize: 100,
  dotSize: 90,
  glow: 40,
  dim: 8,
  direction: 'left',
  font: 'mono',
  rotation: 'auto',
  bold: true,
  mirror: false,
  smooth: true,
  keepAwake: true,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The sign shows a single line: line breaks become spaces and the length is capped. */
export function cleanText(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').slice(0, MAX_TEXT_LENGTH);
}

/** Builds valid settings from anything (old saves, hand-edited storage), falling back to the default field by field. */
export function sanitize(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;

  const range = (key: RangeKey): number => {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return d[key];
    return Math.min(RANGES[key].max, Math.max(RANGES[key].min, Math.round(value)));
  };
  const color = (key: ColorKey): string => {
    const value = input[key];
    return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : d[key];
  };
  const toggle = (key: ToggleKey): boolean => {
    const value = input[key];
    return typeof value === 'boolean' ? value : d[key];
  };
  const choice = <K extends ChoiceKey>(key: K): Settings[K] => {
    const value = input[key] as Settings[K];
    return CHOICES[key].includes(value) ? value : d[key];
  };

  return {
    text: typeof input.text === 'string' ? cleanText(input.text) : d.text,
    led: color('led'),
    background: color('background'),
    speed: range('speed'),
    rows: range('rows'),
    textSize: range('textSize'),
    dotSize: range('dotSize'),
    glow: range('glow'),
    dim: range('dim'),
    direction: choice('direction'),
    font: choice('font'),
    rotation: choice('rotation'),
    bold: toggle('bold'),
    mirror: toggle('mirror'),
    smooth: toggle('smooth'),
    keepAwake: toggle('keepAwake'),
  };
}
