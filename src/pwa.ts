import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'native' | 'ios' | null;

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  // iPadOS reports itself as a Mac, so tell them apart by touch support.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Android/desktop Chromium fire `beforeinstallprompt` and let us show the native dialog.
 * iOS has no such API: installing is always manual through Share → Add to Home Screen.
 */
export function setupInstall(onChange: (mode: InstallMode) => void): { install(): Promise<void> } {
  let deferred: BeforeInstallPromptEvent | null = null;

  if (!isStandalone() && isIOS()) onChange('ios');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    onChange('native');
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    onChange(null);
  });

  return {
    async install() {
      if (!deferred) return;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') {
        deferred = null;
        onChange(null);
      }
    },
  };
}

/**
 * What a look for a new version came back with. `waiting` means one is already downloaded and only needs
 * the reload; `current` means the server has nothing newer; `offline` that the question never got there;
 * `unsupported` that this browser is not keeping the app at all, which is also the case while developing.
 */
export type UpdateCheck = 'waiting' | 'current' | 'offline' | 'unsupported';

/** How often the app asks on its own, while it is open. */
const UPDATE_EVERY = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;
let apply: ((reload: boolean) => Promise<void>) | null = null;
/** Set once a new version has been downloaded and is only waiting for the reload. */
let waiting = false;

export function setupServiceWorker(handlers: { onNeedRefresh(apply: () => void): void; onOfflineReady(): void }): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh: () => {
      waiting = true;
      handlers.onNeedRefresh(() => void updateSW(true));
    },
    onOfflineReady: handlers.onOfflineReady,
    onRegisteredSW(_url, current) {
      registration = current;
      apply = updateSW;
      if (current) setInterval(() => void current.update(), UPDATE_EVERY);
    },
  });
}

/** Takes the new version that is already downloaded: it installs and the page comes back on it. */
export function applyUpdate(): void {
  void apply?.(true);
}

/**
 * Asks the server for a new version right now, instead of waiting for the hourly look. Resolves only
 * once whatever it found has finished installing, so what it answers is what the player can act on.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!('serviceWorker' in navigator) || !registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  await settled(registration.installing);
  return waiting || registration.waiting ? 'waiting' : 'current';
}

/** Waits for a worker that is downloading to finish, one way or the other. */
function settled(worker: ServiceWorker | null): Promise<void> {
  if (!worker || worker.state === 'installed' || worker.state === 'redundant') return Promise.resolve();
  return new Promise((done) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') done();
    });
  });
}
