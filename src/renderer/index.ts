import { CssRenderer } from './css';
import type { SignRenderer } from './types';
import { WebGLRenderer } from './webgl';

export type { LedStyle, Rgb, SignRenderer } from './types';

/** WebGL2 when the browser has it; `?renderer=css` in the URL forces the fallback. */
export function createRenderer(container: HTMLElement, onRestore: () => void): SignRenderer {
  if (new URLSearchParams(location.search).get('renderer') !== 'css') {
    try {
      return new WebGLRenderer(container, onRestore);
    } catch (error) {
      console.warn('WebGL2 unavailable, falling back to the CSS renderer', error);
    }
  }
  return new CssRenderer(container);
}
