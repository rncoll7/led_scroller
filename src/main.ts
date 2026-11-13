import './style.css';
import { renderText } from './bitmap';
import { ledGrid, signLayout, toSign, type LedGrid, type SignLayout } from './layout';
import { buildPanel } from './panel';
import { applyUpdate, checkForUpdate, setupInstall, setupServiceWorker, type InstallMode } from './pwa';
import { createRenderer, type Rgb } from './renderer';
import { advance, composeFrame, loopLength, startOffset, type TextBitmap } from './scroll';
import { checkPin, hashPin, isValidPin, type LockState } from './lock';
import { Scoreboard, vibrate, type Side } from './placar';
import { drawScoreboard } from './scoreboard';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { storage } from './storage';

/** The buttons fade out after this long without interaction, leaving only the sign. */
const IDLE_MS = 3500;
/** Longest time step taken in one frame, so a stall does not make the text jump ahead. */
const MAX_STEP_S = 0.1;
/** How long the lock button has to be held before it asks for the PIN. */
const HOLD_TO_UNLOCK_MS = 2000;
/** Wrong PINs in a row before unlocking pauses for PIN_COOLDOWN_MS. */
const PIN_TRIES = 5;
const PIN_COOLDOWN_MS = 30_000;

const LAYOUT_KEYS = new Set<keyof Settings>(['rows', 'rotation']);
const TEXT_KEYS = new Set<keyof Settings>(['rows', 'text', 'font', 'bold', 'textSize']);
const STYLE_KEYS = new Set<keyof Settings>(['led', 'background', 'dotSize', 'glow', 'dim']);
/** What "Restaurar aparência" leaves alone. */
const NOT_APPEARANCE = new Set<keyof Settings>(['text', 'mode', 'game', 'swapSides']);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $('stage');
const sign = $('sign');
const panelElement = $('panel');
const settingsButton = $<HTMLButtonElement>('btn-settings');
const pauseButton = $<HTMLButtonElement>('btn-pause');
const fullscreenButton = $<HTMLButtonElement>('btn-fullscreen');
const installButton = $<HTMLButtonElement>('btn-install');
const undoButton = $<HTMLButtonElement>('btn-undo');
const resetScoreButton = $<HTMLButtonElement>('btn-reset-score');
const unlockButton = $<HTMLButtonElement>('btn-unlock');
const changePinButton = $<HTMLButtonElement>('btn-change-pin');
const serveButtons: Record<Side, HTMLButtonElement> = { left: $('btn-serve-left'), right: $('btn-serve-right') };
const pinScreen = $('screen-pin');
const pinInput = $<HTMLInputElement>('pin-input');
const toolbar = $('toolbar');
/** Where the toolbar goes back to when the scoreboard (which moves it into the sign) is turned off. */
const toolbarHome = { parent: toolbar.parentElement!, next: toolbar.nextSibling };
const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const stats = new URLSearchParams(location.search).has('stats') ? $('stats') : null;

const settings = storage.settings();

const scoreboard = new Scoreboard(settings.game, {
  changed() {
    redraw();
    syncScorePanel();
  },
});
scoreboard.leftTeam = settings.swapSides ? 'b' : 'a';
let lock: LockState = storage.lock();

let text: TextBitmap = { cols: 1, rows: 1, data: new Uint8Array(1) };
let grid: LedGrid = ledGrid(1, 1, 1);
let layout: SignLayout | null = null;
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
  layout = signLayout(width, height, settings.rotation);
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

  if (settings.mode === 'placar') {
    if (needsDraw) {
      drawScoreboard(frame, grid.cols, grid.rows, scoreboard.view());
      renderer.draw(frame);
      needsDraw = false;
    }
    return;
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
  if (key === 'game' && scoreboard.inProgress && !confirm('Mudar o jogo começa uma partida nova. O placar atual será perdido.')) return;
  settings[key] = value;
  if (key === 'mode') applyMode();
  if (key === 'game') scoreboard.newGame(settings.game);
  if (key === 'swapSides') {
    scoreboard.leftTeam = settings.swapSides ? 'b' : 'a';
    syncScorePanel();
  }
  if (LAYOUT_KEYS.has(key)) layoutDirty = true;
  if (TEXT_KEYS.has(key)) textDirty = true;
  if (STYLE_KEYS.has(key)) styleDirty = true;
  if (key === 'keepAwake') void updateWakeLock();
  needsDraw = true;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => storage.saveSettings(settings), 300);
  schedule();
}

// ---- Scoreboard ----

function redraw(): void {
  needsDraw = true;
  schedule();
}

function applyMode(): void {
  const placar = settings.mode === 'placar';
  document.body.classList.toggle('placar', placar);
  undoButton.hidden = resetScoreButton.hidden = !placar;
  // On the scoreboard the buttons live inside the sign, so they turn with it, stay visible
  // (a tap on the sign scores instead of showing them) and sit over the divider between the scores.
  if (placar) sign.append(toolbar);
  else toolbarHome.parent.insertBefore(toolbar, toolbarHome.next);
  scoreboard.disarm();
  applyLock();
  lastTime = 0;
  showControls();
  redraw();
}

function syncScorePanel(): void {
  const serving = scoreboard.servingSide;
  for (const side of ['left', 'right'] as const) serveButtons[side].setAttribute('aria-pressed', String(serving === side));
}

function startNewMatch(): boolean {
  if (scoreboard.inProgress && !confirm('Começar uma partida nova? O placar atual será perdido.')) return false;
  scoreboard.newGame(settings.game);
  return true;
}

// ---- Lock ----

function isLocked(): boolean {
  return lock.locked && settings.mode === 'placar';
}

function applyLock(): void {
  const locked = isLocked();
  document.body.classList.toggle('locked', locked);
  unlockButton.hidden = !locked;
  changePinButton.hidden = lock.pin === '';
  if (locked) setPanel(false);
}

function setLock(next: LockState): void {
  lock = next;
  storage.saveLock(lock);
  applyLock();
  if (isLocked()) trapBack();
}

/** An extra history entry, so the Android back button (or gesture) lands here instead of leaving the app. */
function trapBack(): void {
  history.pushState({ locked: true }, '');
}

let pinHandler: ((pin: string) => string | null) | null = null;

/** Asks for a PIN. `handler` returns an error to show (and ask again), or null to close. */
function askPin(title: string, hint: string, handler: (pin: string) => string | null): void {
  $('pin-title').textContent = title;
  $('pin-hint').textContent = hint;
  $('pin-error').textContent = '';
  pinInput.value = '';
  pinHandler = handler;
  pinScreen.hidden = false;
  pinInput.focus();
}

function closePin(): void {
  pinScreen.hidden = true;
  pinHandler = null;
  pinInput.blur();
}

function createPin(then: () => void): void {
  askPin('Criar PIN', 'Escolha 4 números. Só com eles dá para destravar o placar.', (first) => {
    askPin('Repita o PIN', 'Digite os mesmos 4 números.', (second) => {
      if (second !== first) return 'Os PINs não batem. Digite de novo.';
      setLock({ ...lock, pin: hashPin(first) });
      then();
      return null;
    });
    return null;
  });
}

function lockNow(): void {
  setLock({ ...lock, locked: true });
  toast('Placar travado');
}

let wrongPins = 0;
let pinBlockedUntil = 0;

function askUnlock(): void {
  askPin('Destravar', 'Digite o PIN do dono do placar.', (pin) => {
    if (Date.now() < pinBlockedUntil) return 'Muitas tentativas. Espere um pouco.';
    if (!checkPin(lock, pin)) {
      wrongPins++;
      if (wrongPins >= PIN_TRIES) {
        wrongPins = 0;
        pinBlockedUntil = Date.now() + PIN_COOLDOWN_MS;
        return 'Muitas tentativas. Espere 30 segundos.';
      }
      return 'PIN errado.';
    }
    wrongPins = 0;
    setLock({ ...lock, locked: false });
    setPanel(true);
    return null;
  });
}

let holdTimer = 0;
function stopHold(): void {
  clearTimeout(holdTimer);
  unlockButton.classList.remove('holding');
}

/** Which half of the scoreboard, as the viewer sees it, is under a point on the screen. */
function sideAt(clientX: number, clientY: number): Side | null {
  if (!layout) return null;
  const rect = stage.getBoundingClientRect();
  const point = toSign(layout.turns, rect.width, rect.height, clientX - rect.left, clientY - rect.top);
  return point.x < layout.width / 2 ? 'left' : 'right';
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
  if (open && isLocked()) return;
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

stage.addEventListener('click', (event) => {
  if (isPanelOpen()) setPanel(false);
  else if (settings.mode === 'placar') {
    const side = sideAt(event.clientX, event.clientY);
    if (side) scoreboard.point(side);
  } else if (document.body.classList.contains('idle')) showControls();
  else hideControls();
});
stage.addEventListener('dblclick', () => {
  if (settings.mode !== 'placar') toggleFullscreen(); // on the scoreboard a quick second tap is a point, not full screen
});
stage.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') showControls();
});

settingsButton.addEventListener('click', () => setPanel(!isPanelOpen()));
$('btn-close').addEventListener('click', () => setPanel(false));
pauseButton.addEventListener('click', () => {
  togglePause();
  showControls();
});
undoButton.addEventListener('click', () => scoreboard.undo());
resetScoreButton.addEventListener('click', () => scoreboard.reset());
// In scoreboard mode the toolbar is inside the stage: a press on a button must not also score on the half under it.
for (const type of ['click', 'dblclick'] as const) toolbar.addEventListener(type, (event) => event.stopPropagation());

serveButtons.left.addEventListener('click', () => scoreboard.serve('left'));
serveButtons.right.addEventListener('click', () => scoreboard.serve('right'));
$('btn-new-match').addEventListener('click', startNewMatch);
$('btn-lock').addEventListener('click', () => (lock.pin ? lockNow() : createPin(lockNow)));
changePinButton.addEventListener('click', () => createPin(() => toast('PIN trocado')));

unlockButton.addEventListener('pointerdown', () => {
  unlockButton.classList.add('holding');
  holdTimer = window.setTimeout(() => {
    stopHold();
    vibrate(40);
    askUnlock();
  }, HOLD_TO_UNLOCK_MS);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) unlockButton.addEventListener(type, stopHold);
unlockButton.addEventListener('contextmenu', (event) => event.preventDefault());
unlockButton.addEventListener('click', () => {
  if (pinScreen.hidden) toast('Segure o cadeado por 2 segundos para destravar');
});

$('pin-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const handler = pinHandler;
  if (!handler) return;
  const pin = pinInput.value;
  const error = isValidPin(pin) ? handler(pin) : 'O PIN tem 4 números.';
  if (error) {
    $('pin-error').textContent = error;
    pinInput.value = '';
    pinInput.focus();
    vibrate([30, 30, 30]);
  } else if (pinHandler === handler) closePin(); // a handler that asked for another PIN keeps the dialog open
});
$('btn-pin-cancel').addEventListener('click', closePin);
window.addEventListener('popstate', () => {
  if (isLocked()) trapBack();
});

fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.classList.toggle('active', document.fullscreenElement !== null);
});

$('btn-reset').addEventListener('click', () => {
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!NOT_APPEARANCE.has(key)) change(key, DEFAULT_SETTINGS[key]);
  }
  panel.sync();
});

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea')) {
    if (event.key === 'Escape') target.blur();
    return;
  }
  const key = event.key.toLowerCase();
  if (settings.mode === 'placar' && (key === 'a' || key === 'l' || key === 'z')) {
    if (key === 'z') scoreboard.undo();
    else scoreboard.point(key === 'a' ? 'left' : 'right');
    event.preventDefault();
    return;
  }
  switch (event.key) {
    case ' ':
      if (settings.mode === 'placar') return; // nothing to pause on the scoreboard
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

/** Offers the version that is already downloaded; taking it reloads the page on it. */
function offerUpdate(apply: () => void): void {
  toast('Nova versão disponível', {
    label: 'Atualizar',
    run: () => {
      storage.saveSettings(settings);
      apply();
    },
  });
}

setupServiceWorker({
  onNeedRefresh: offerUpdate,
  onOfflineReady() {
    toast('Pronto para usar offline');
  },
});

// The version on screen is also the button that asks the server for a newer one, right now.
const stamp = $('build-stamp') as HTMLButtonElement;
// The build is stamped in UTC and read here in whatever time zone the phone is on.
stamp.textContent = `${__BUILD__.version} · ${new Date(__BUILD__.at).toLocaleString('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})}`;
stamp.addEventListener('click', async () => {
  stamp.disabled = true;
  const found = await checkForUpdate();
  stamp.disabled = false;
  if (found === 'waiting') offerUpdate(applyUpdate);
  else
    toast(
      {
        current: 'Você já está na última versão',
        offline: 'Sem conexão para procurar agora',
        unsupported: 'Este navegador não atualiza o app sozinho',
      }[found],
    );
});

applyMode();
syncScorePanel();
if (isLocked()) trapBack();
if (stats) stats.hidden = false;
new ResizeObserver(() => {
  layoutDirty = true;
  schedule();
}).observe(stage);
showControls();
void updateWakeLock();
schedule();
