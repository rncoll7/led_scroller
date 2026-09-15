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

export function setupServiceWorker(handlers: { onNeedRefresh(apply: () => void): void; onOfflineReady(): void }): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh: () => handlers.onNeedRefresh(() => void updateSW(true)),
    onOfflineReady: handlers.onOfflineReady,
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}
