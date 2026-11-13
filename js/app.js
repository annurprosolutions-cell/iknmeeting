// Titik masuk: tema, route, sesi.
import * as auth from './auth.js';
import * as router from './router.js';
import { buildShell } from './shell.js';
import { h, clear, toast, getThemeMode, setThemeMode, errorBanner } from './ui.js';
import { initPwa } from './pwa.js';

const ALL = ['Admin', 'Setiausaha', 'Pengerusi', 'Ahli'];
const ADMIN = ['Admin'];
const STAFF = ['Admin', 'Setiausaha'];
const ph = (title, phase) => ({ title, phase });

const app = document.getElementById('app');
let shell = null, cleanup = null, renderSeq = 0;

setThemeMode(getThemeMode());
initPwa();

router.define('/login', { public: true, view: () => import('./views/login.js') });
router.define('/dashboard', { roles: ALL, view: () => import('./views/dashboard.js'), meta: ph('Dashboard') });
router.define('/meetings', { roles: ALL, view: () => import('./views/meetings.js'), meta: ph('Mesyuarat') });
router.define('/meetings/new', { roles: STAFF, view: () => import('./views/meeting-form.js'), meta: ph('Mesyuarat Baharu') });
router.define('/meetings/:id/edit', { roles: STAFF, view: () => import('./views/meeting-form.js'), meta: ph('Edit Mesyuarat') });
router.define('/meetings/:id/live', { roles: ALL, view: () => import('./views/meeting-mode.js'), meta: { title: 'Mod Mesyuarat', live: true } });
router.define('/meetings/:id/agenda', { roles: STAFF, view: () => import('./views/meeting-agenda.js'), meta: ph('Editor Agenda') });
router.define('/meetings/:id/materials/:mid', { roles: ALL, view: () => import('./views/material-viewer.js'), meta: ph('Penonton Bahan') });
router.define('/meetings/:id', { roles: ALL, view: () => import('./views/meeting-detail.js'), meta: ph('Butiran Mesyuarat') });
router.define('/actions', { roles: STAFF, view: () => import('./views/placeholder.js'), meta: ph('Tindakan Saya', 'Fasa 5') });
router.define('/users', { roles: ADMIN, view: () => import('./views/users.js'), meta: ph('Pengurusan Pengguna') });
router.define('/audit', { roles: ADMIN, view: () => import('./views/audit.js'), meta: ph('Audit & Tetapan') });

function setTitle(t) { document.title = (t ? t + ' - ' : '') + auth.getSettings().app_name; }

function toLogin() {
  const here = router.currentPath();
  if (here !== '/login' && here !== '/') {
    try { sessionStorage.setItem('emi_return', here); } catch (e) { /* abaikan */ }
  }
  shell = null;
  router.navigate('/login', { replace: true });
}

async function doLogout() {
  await auth.logout();
  try { sessionStorage.removeItem('emi_return'); } catch (e) { /* abaikan */ }
  shell = null;
  router.navigate('/login', { replace: true });
}

function afterLogin() {
  document.getElementById('toast-root').replaceChildren();
  let target = '/dashboard';
  try { target = sessionStorage.getItem('emi_return') || target; sessionStorage.removeItem('emi_return'); } catch (e) { /* abaikan */ }
  shell = null;
  router.navigate(target, { replace: true });
}

async function onRoute({ route, params, path }) {
  const seq = ++renderSeq;
  if (cleanup) { try { cleanup(); } catch (e) { /* abaikan */ } cleanup = null; }
  const user = auth.getUser();

  if (path === '/' || path === '') { router.navigate(user ? '/dashboard' : '/login', { replace: true }); return; }

  if (route && route.public) {
    if (user && path === '/login') { router.navigate('/dashboard', { replace: true }); return; }
    shell = null;
    clear(app);
    setTitle('Log masuk');
    const mod = await route.view();
    if (seq !== renderSeq) return;
    cleanup = mod.render(app, { onLoggedIn: afterLogin }) || null;
    return;
  }

  if (!user) { toLogin(); return; }

  if (!shell) {
    shell = buildShell(user, { onLogout: doLogout });
    clear(app).append(shell.root);
  }
  shell.setActive(path);
  shell.root.classList.toggle('is-live', Boolean(route && route.meta && route.meta.live)); // Mod Mesyuarat: tanpa menu
  clear(shell.main);

  let mod, ctx = { user, params, route: route || {}, reason: undefined };
  try {
    if (!route) { mod = await import('./views/noaccess.js'); ctx.reason = 'notfound'; }
    else if (!route.roles.includes(user.role)) { mod = await import('./views/noaccess.js'); ctx.reason = 'forbidden'; }
    else mod = await route.view();
  } catch (e) {
    shell.main.append(errorBanner('Tidak dapat memuatkan halaman. Semak sambungan internet.', () => location.reload()));
    return;
  }
  if (seq !== renderSeq) return;
  setTitle((route && route.meta && route.meta.title) || 'e-Mesyuarat');
  cleanup = mod.render(shell.main, ctx) || null;
  shell.main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

auth.onSessionLost(() => {
  toast('Sesi tamat. Sila log masuk semula.', 'error');
  toLogin();
});

(async function boot() {
  await auth.restore();
  router.start(onRoute);
})();
