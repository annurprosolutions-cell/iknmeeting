// Shell app: header, menu sisi (tablet/desktop), bar bawah (telefon). Menu ikut role (AFD seksyen 5).
import { h, button, openModal, getThemeMode, setThemeMode } from './ui.js';
import { icon } from './icons.js';
import { getSettings } from './auth.js';

const ALL = ['Admin', 'Setiausaha', 'Pengerusi', 'Ahli'];
export const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ALL, bottom: true },
  { path: '/meetings', label: 'Mesyuarat', icon: 'calendar', roles: ALL, bottom: true },
  { path: '/actions', label: 'Tindakan Saya', short: 'Tindakan', icon: 'tasks', roles: ALL, bottom: true },
  { path: '/meetings/new', label: 'Mesyuarat Baharu', icon: 'plus', roles: ['Admin', 'Setiausaha'] },
  { path: '/users', label: 'Pengguna', icon: 'users', roles: ['Admin'] },
  { path: '/audit', label: 'Audit & Tetapan', icon: 'shield', roles: ['Admin'] }
];

const THEMES = [['auto', 'Auto', 'monitor'], ['light', 'Cerah', 'sun'], ['dark', 'Gelap', 'moon']];

function themePicker() {
  const wrap = h('div', { class: 'theme-picker', role: 'group', 'aria-label': 'Mod paparan' });
  const render = () => {
    wrap.replaceChildren(...THEMES.map(([mode, label, ic]) => {
      const on = getThemeMode() === mode;
      return h('button', {
        class: 'theme-opt' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
        onClick: () => { setThemeMode(mode); render(); }
      }, icon(ic, 18), h('span', { text: label }));
    }));
  };
  render();
  return wrap;
}

export function buildShell(user, { onLogout }) {
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const appName = getSettings().app_name || 'e-Mesyuarat IKN';

  const link = (n, cls) => h('a', { class: cls, href: '#' + n.path, 'data-path': n.path, 'aria-label': n.label }, icon(n.icon, 20), h('span', { text: cls.includes('bottom') && n.short ? n.short : n.label }));

  // Menu pengguna (header)
  const menuBtn = h('button', { class: 'user-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
    icon('user', 20), h('span', { class: 'user-name', text: user.name }));
  const menu = h('div', { class: 'popover', hidden: true, role: 'menu' },
    h('div', { class: 'popover-who' }, h('strong', { text: user.name }), h('span', { class: 'muted', text: user.email }), h('span', { class: 'muted', text: user.role })),
    h('p', { class: 'popover-label', text: 'Mod paparan' }), themePicker(),
    button('Log keluar', { kind: 'ghost', iconName: 'logout', onClick: onLogout }));
  const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); } });

  const header = h('header', { class: 'app-header' },
    h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('calendar', 20)), h('span', { text: appName })),
    h('div', { class: 'header-right' }, menuBtn, menu));

  const side = h('nav', { class: 'sidenav', 'aria-label': 'Menu utama' }, items.map((n) => link(n, 'nav-link')));

  // Bar bawah (telefon): 3 item utama + Lagi
  const more = h('button', { class: 'nav-link', type: 'button' }, icon('more', 20), h('span', { text: 'Lagi' }));
  more.addEventListener('click', () => {
    const rest = items.filter((n) => !n.bottom);
    const body = h('div', { class: 'more-list' },
      rest.map((n) => h('a', { class: 'nav-link', href: '#' + n.path, onClick: () => m.close() }, icon(n.icon, 20), h('span', { text: n.label }))),
      h('p', { class: 'popover-label', text: 'Mod paparan' }), themePicker(),
      button('Log keluar', { kind: 'secondary', iconName: 'logout', onClick: () => { m.close(); onLogout(); } }));
    const m = openModal({ title: 'Lagi', body });
  });
  const bottom = h('nav', { class: 'bottombar', 'aria-label': 'Menu utama (telefon)' }, items.filter((n) => n.bottom).map((n) => link(n, 'nav-link bottom-link')), more);

  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const root = h('div', { class: 'shell' },
    h('a', { class: 'skip-link', href: '#main', onClick: (e) => { e.preventDefault(); main.focus(); } }, 'Langkau ke kandungan'),
    header, side, main, bottom);

  function setActive(path) {
    // Padanan terpanjang supaya /meetings/new tidak menyalakan /meetings
    let best = null;
    items.forEach((n) => { if ((path === n.path || path.startsWith(n.path + '/')) && (!best || n.path.length > best.path.length)) best = n; });
    root.querySelectorAll('.nav-link[data-path]').forEach((a) => {
      const on = best && a.dataset.path === best.path;
      a.classList.toggle('is-active', Boolean(on));
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  return { root, main, setActive };
}
