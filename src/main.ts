import './style.css';
import { renderText } from './bitmap';
import { ledGrid, signLayout, type LedGrid } from './layout';
import { buildPanel } from './panel';
import { setupInstall, setupServiceWorker, type InstallMode } from './pwa';
import { createRenderer, type Rgb } from './renderer';
import { advance, composeFrame, loopLength, startOffset, type TextBitmap } from './scroll';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { storage } from './storage';

/** The buttons fade out after this long without interaction, leaving only the sign. */
const IDLE_MS = 3500;
/** Longest time step taken in one frame, so a stall does not make the text jump ahead. */
const MAX_STEP_S = 0.1;

const LAYOUT_KEYS = new Set<keyof Settings>(['rows', 'rotation']);
const TEXT_KEYS = new Set<keyof Settings>(['rows', 'text', 'font', 'bold', 'textSize']);
const STYLE_KEYS = new Set<keyof Settings>(['led', 'background', 'dotSize', 'glow', 'dim']);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $('stage');
const sign = $('sign');
const panelElement = $('panel');
const settingsButton = $<HTMLButtonElement>('btn-settings');
const pauseButton = $<HTMLButtonElement>('btn-pause');
const fullscreenButton = $<HTMLButtonElement>('btn-fullscreen');
const installButton = $<HTMLButtonElement>('btn-install');
const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const stats = new URLSearchParams(location.search).has('stats') ? $('stats') : null;

const settings = storage.settings();

let text: TextBitmap = { cols: 1, rows: 1, data: new Uint8Array(1) };
let grid: LedGrid = ledGrid(1, 1, 1);
let frame = new Uint8Array(1);
let period = 1;
let offset = 0;
let paused = false;
let layoutDirty = true;
let textDirty = true;
let styleDirty = true;
let needsDraw = true;
let drawnColumn = -1;
let lastTime = 0;
let rafId = 0;

const renderer = createRenderer(sign, () => {
  needsDraw = true;
  schedule();
});

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function applyLayout(): boolean {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return false;
  const layout = signLayout(width, height, settings.rotation);
  sign.style.width = `${layout.width}px`;
  sign.style.height = `${layout.height}px`;
  sign.style.transform = layout.transform;
  grid = ledGrid(layout.width, layout.height, settings.rows);
  frame = new Uint8Array(grid.cols * grid.rows);
  renderer.resize(layout.width, layout.height, grid);
  return true;
}

function applyStyle(): void {
  renderer.setStyle({
    led: hexToRgb(settings.led),
    background: hexToRgb(settings.background),
    radius: settings.dotSize / 200,
    glow: settings.glow / 100,
    dim: settings.dim / 100,
  });
  stage.style.background = settings.background;
  themeColor?.setAttribute('content', settings.background);
}

let statFrames = 0;
let statCost = 0;
let statSince = 0;

function tick(now: number): void {
  rafId = 0;
  if (layoutDirty || textDirty) {
    if (layoutDirty && !applyLayout()) return; // no size yet: the ResizeObserver will schedule again
    if (textDirty) {
      text = renderText(settings.text, settings.rows, { font: settings.font, bold: settings.bold, size: settings.textSize });
    }
    period = loopLength(text.cols, grid.cols, grid.rows);
    offset = startOffset(text.cols, grid.cols, period);
    layoutDirty = textDirty = false;
    needsDraw = true;
  }
  if (styleDirty) {
    applyStyle();
    styleDirty = false;
    needsDraw = true;
  }

  const moving = !paused && settings.speed > 0 && !document.hidden;
  if (moving && lastTime) {
    offset = advance(offset, Math.min((now - lastTime) / 1000, MAX_STEP_S), settings.speed, settings.direction, period);
  }
  lastTime = moving ? now : 0;

  // Snapped scrolling only changes the picture when the offset reaches a new column.
  const column = Math.floor(offset);
  if (needsDraw || (moving && (settings.smooth || column !== drawnColumn))) {
    const start = stats ? performance.now() : 0;
    composeFrame(frame, text, grid.cols, period, offset, settings.mirror, settings.smooth);
    renderer.draw(frame);
    drawnColumn = column;
    needsDraw = false;
    if (stats) reportStats(now, performance.now() - start);
  }

  // Nothing moves while paused or stopped, so the loop sleeps until the next change.
  if (moving) schedule();
}

function schedule(): void {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function reportStats(now: number, cost: number): void {
  statFrames++;
  statCost += cost;
  if (now - statSince < 1000) return;
  stats!.textContent =
    `${renderer.name} · ${grid.cols}×${grid.rows} = ${grid.cols * grid.rows} LEDs · ` +
    `${Math.round((statFrames * 1000) / (now - statSince))} quadros/s · CPU ${(statCost / statFrames).toFixed(2)} ms`;
  statFrames = 0;
  statCost = 0;
  statSince = now;
}

let saveTimer = 0;
function change<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (settings[key] === value) return;
  settings[key] = value;
  if (LAYOUT_KEYS.has(key)) layoutDirty = true;
  if (TEXT_KEYS.has(key)) textDirty = true;
  if (STYLE_KEYS.has(key)) styleDirty = true;
  if (key === 'keepAwake') void updateWakeLock();
  needsDraw = true;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => storage.saveSettings(settings), 300);
  schedule();
}

// ---- Controls ----

let idleTimer = 0;
function showControls(): void {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  if (!isPanelOpen()) idleTimer = window.setTimeout(hideControls, IDLE_MS);
}

function hideControls(): void {
  clearTimeout(idleTimer);
  document.body.classList.add('idle');
}

function isPanelOpen(): boolean {
  return panelElement.classList.contains('open');
}

function setPanel(open: boolean): void {
  if (open === isPanelOpen()) return;
  const hadFocus = panelElement.contains(document.activeElement);
  panelElement.classList.toggle('open', open);
  panelElement.inert = !open;
  settingsButton.setAttribute('aria-expanded', String(open));
  if (open) $('btn-close').focus({ preventScroll: true });
  else if (hadFocus) settingsButton.focus({ preventScroll: true });
  showControls();
}

function togglePause(): void {
  paused = !paused;
  pauseButton.classList.toggle('active', paused);
  pauseButton.setAttribute('aria-label', paused ? 'Continuar' : 'Pausar');
  schedule();
}

function toggleFullscreen(): void {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}

// ---- Screen wake lock: a sign that dims after 30 s is not much of a sign ----

let wakeLock: WakeLockSentinel | null = null;
let wakeLockBusy = false;

async function updateWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator) || wakeLockBusy) return;
  const wanted = () => settings.keepAwake && document.visibilityState === 'visible';
  const target = wanted();
  wakeLockBusy = true;
  try {
    if (target && !wakeLock) {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
      wakeLock = lock;
    } else if (!target && wakeLock) {
      await wakeLock.release();
    }
  } catch {
    // Refused (battery saver, no user gesture yet): the screen follows the system timeout.
  } finally {
    wakeLockBusy = false;
  }
  if (wanted() !== target) void updateWakeLock();
}

// ---- Toast ----

let toastTimer = 0;
function toast(message: string, action?: { label: string; run: () => void }): void {
  const box = $('toast');
  const button = $<HTMLButtonElement>('toast-action');
  $('toast-text').textContent = message;
  button.hidden = !action;
  button.textContent = action?.label ?? '';
  button.onclick = action
    ? () => {
        box.hidden = true;
        action.run();
      }
    : null;
  box.hidden = false;
  clearTimeout(toastTimer);
  if (!action) toastTimer = window.setTimeout(() => (box.hidden = true), 3000);
}

// ---- Wiring ----

const panel = buildPanel($('panel-controls'), settings, change, {
  glow: renderer.supportsGlow,
  wakeLock: 'wakeLock' in navigator,
});

stage.addEventListener('click', () => {
  if (isPanelOpen()) setPanel(false);
  else if (document.body.classList.contains('idle')) showControls();
  else hideControls();
});
stage.addEventListener('dblclick', toggleFullscreen);
stage.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') showControls();
});

settingsButton.addEventListener('click', () => setPanel(!isPanelOpen()));
$('btn-close').addEventListener('click', () => setPanel(false));
pauseButton.addEventListener('click', () => {
  togglePause();
  showControls();
});
fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.classList.toggle('active', document.fullscreenElement !== null);
});

$('btn-reset').addEventListener('click', () => {
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key !== 'text') change(key, DEFAULT_SETTINGS[key]);
  }
  panel.sync();
});

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea')) {
    if (event.key === 'Escape') target.blur();
    return;
  }
  switch (event.key) {
    case ' ':
      togglePause();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
    case 's':
    case 'S':
      setPanel(!isPanelOpen());
      break;
    case 'Escape':
      setPanel(false);
      break;
    default:
      return;
  }
  event.preventDefault();
  showControls();
});

document.addEventListener('visibilitychange', () => {
  void updateWakeLock();
  if (!document.hidden) schedule();
});
// Some browsers only grant the wake lock after a user gesture.
window.addEventListener('pointerdown', () => void updateWakeLock(), { passive: true });
window.addEventListener('pagehide', () => storage.saveSettings(settings));
// Blocks pinch zoom on iOS, which ignores user-scalable=no.
document.addEventListener('gesturestart', (event) => event.preventDefault());

let installMode: InstallMode = null;
const installer = setupInstall((mode) => {
  installMode = mode;
  installButton.hidden = mode === null;
});
installButton.addEventListener('click', () => {
  if (installMode === 'ios') $('screen-ios').hidden = false;
  else void installer.install();
});
$('btn-ios-ok').addEventListener('click', () => ($('screen-ios').hidden = true));

setupServiceWorker({
  onNeedRefresh(apply) {
    toast('Nova versão disponível', {
      label: 'Atualizar',
      run: () => {
        storage.saveSettings(settings);
        apply();
      },
    });
  },
  onOfflineReady() {
    toast('Pronto para usar offline');
  },
});

if (stats) stats.hidden = false;
new ResizeObserver(() => {
  layoutDirty = true;
  schedule();
}).observe(stage);
showControls();
void updateWakeLock();
schedule();
