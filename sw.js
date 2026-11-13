// Service worker SyuraDocs (F-13). Strategi: rangkaian dahulu, simpanan sebagai sandaran luar talian.
// Rangkaian dahulu supaya kod baharu selepas deploy sentiasa diambil bila ada talian (tiada risiko frontend lama + backend baharu).
// Hanya fail sama-asal (GET) disimpan. Panggilan API ke Apps Script (silang-asal, POST) TIDAK disentuh.
// Data agenda luar talian disimpan oleh aplikasi sendiri (js/offline.js), bukan oleh service worker.
const CACHE = 'syuradocs-shell-v1';
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'favicon.svg', 'css/styles.css',
  'icons/icon-192.png', 'icons/icon-512.png',
  'js/theme-init.js', 'js/app.js', 'js/api.js', 'js/auth.js', 'js/router.js', 'js/shell.js', 'js/ui.js', 'js/icons.js', 'js/upload.js',
  'js/meeting-bits.js', 'js/materials-panel.js', 'js/comments-panel.js', 'js/notes.js', 'js/pwa.js', 'js/offline.js',
  'js/views/login.js', 'js/views/dashboard.js', 'js/views/meetings.js', 'js/views/meeting-detail.js', 'js/views/meeting-form.js',
  'js/views/meeting-agenda.js', 'js/views/meeting-mode.js', 'js/views/material-viewer.js', 'js/views/users.js', 'js/views/audit.js',
  'js/views/placeholder.js', 'js/views/noaccess.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script, Google (GIS, Drive) dan lain-lain: biar pelayar
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const shell = await caches.match('index.html'); if (shell) return shell; }
      return new Response('Luar talian', { status: 503, statusText: 'Luar talian', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
