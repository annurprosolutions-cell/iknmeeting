// Sign in with Google (GIS) + sesi. Token sesi dalam sessionStorage (hilang bila tab ditutup).
import { GOOGLE_CLIENT_ID } from '../config.js';
import { api, configureApi } from './api.js';

const K_TOKEN = 'emi_token', K_USER = 'emi_user', K_SET = 'emi_settings';
let user = null, settings = { app_name: 'e-Mesyuarat IKN', meeting_types: [] };
let credentialHandler = null, gisPromise = null, gisInited = false, renewing = null, lostHandler = null;

const ss = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* abaikan */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* abaikan */ } }
};

export const getToken = () => ss.get(K_TOKEN);
export const getUser = () => user;
export const getSettings = () => settings;
export const isConfigured = () => Boolean(GOOGLE_CLIENT_ID);
export function onSessionLost(fn) { lostHandler = fn; }

configureApi({ getToken, onUnauthorized: () => renewSession() });

function setSession(token, u, s) {
  if (token) ss.set(K_TOKEN, token);
  user = u;
  if (s) settings = s;
  ss.set(K_USER, JSON.stringify(u));
  ss.set(K_SET, JSON.stringify(settings));
}

function clearSession() {
  user = null;
  [K_TOKEN, K_USER, K_SET].forEach(ss.del);
}

export function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error('Tidak dapat memuatkan Google Sign-In.')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function initGis() {
  await loadGis();
  if (gisInited) return;
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp) => { if (credentialHandler) credentialHandler(resp); },
    auto_select: true,
    cancel_on_tap_outside: false
  });
  gisInited = true;
}

async function exchange(credential) {
  const d = await api('auth.login', { idToken: credential }, { noAuth: true });
  setSession(d.token, d.user, d.settings);
  return d.user;
}

/** Papar butang Google. onResult({user}) atau onResult({error}) */
export async function renderLoginButton(container, onResult) {
  await initGis();
  credentialHandler = async (resp) => {
    try { onResult({ user: await exchange(resp.credential) }); }
    catch (e) { onResult({ error: e }); }
  };
  window.google.accounts.id.renderButton(container, {
    theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'ms', width: 280
  });
}

/** Login senyap semasa sesi tamat. Pulang true jika berjaya. Kongsi satu proses untuk banyak 401 serentak. */
export function renewSession() {
  if (renewing) return renewing;
  renewing = (async () => {
    try {
      if (!GOOGLE_CLIENT_ID) throw new Error('tiada konfigurasi');
      await initGis();
      const credential = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('tamat masa')), 10000);
        credentialHandler = (resp) => { clearTimeout(timer); resolve(resp.credential); };
        window.google.accounts.id.prompt((n) => {
          try {
            if ((n.isNotDisplayed && n.isNotDisplayed()) || (n.isSkippedMoment && n.isSkippedMoment())) {
              clearTimeout(timer); reject(new Error('tidak dipaparkan'));
            }
          } catch (e) { /* FedCM: biar timeout yang tentukan */ }
        });
      });
      await exchange(credential);
      return true;
    } catch (e) {
      clearSession();
      if (lostHandler) lostHandler();
      return false;
    } finally {
      renewing = null;
      credentialHandler = null;
    }
  })();
  return renewing;
}

/** Pulihkan sesi selepas muat semula halaman. Pulang pengguna atau null. */
export async function restore() {
  if (!getToken()) return null;
  try {
    const d = await api('me.get');
    setSession(null, d.user, d.settings);
    return user;
  } catch (e) {
    if (e.code === 401) { clearSession(); return null; }
    // Rangkaian terputus: guna salinan terakhir supaya app masih boleh dibuka
    try { user = JSON.parse(ss.get(K_USER)); settings = JSON.parse(ss.get(K_SET)) || settings; } catch (x) { user = null; }
    return user;
  }
}

export async function logout() {
  try { await api('auth.logout', {}, { retried: true }); } catch (e) { /* teruskan */ }
  try { if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect(); } catch (e) { /* abaikan */ }
  clearSession();
}
