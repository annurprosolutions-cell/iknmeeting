// F-13: pemasangan app (PWA). Chrome/Edge/Android: acara beforeinstallprompt. iOS Safari: arahan manual (tiada acara).
let deferred = null;
const listeners = [];
const DISMISS_KEY = 'emi_pwa_dismissed';

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
};

export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
export function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
export function onChange(fn) { listeners.push(fn); }
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* abaikan */ } });

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* tanpa service worker: app tetap berfungsi */ }); });
  }
}

/** Keadaan banner pasang: 'prompt' (butang Pasang), 'ios' (arahan manual) atau null (jangan papar). */
export function installMode() {
  if (isStandalone() || ls.get(DISMISS_KEY)) return null;
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return null;
}

export async function promptInstall() {
  if (!deferred) return false;
  const d = deferred; deferred = null;
  try { await d.prompt(); const c = await d.userChoice; emit(); return c && c.outcome === 'accepted'; } catch (e) { emit(); return false; }
}

export function dismissInstall() { ls.set(DISMISS_KEY, new Date().toISOString()); emit(); }
