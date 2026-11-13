// S-03 Senarai Mesyuarat: tab Akan Datang / Lepas / Arkib, carian tajuk, penapis siri.
import { h, clear, button, emptyState, errorBanner, skeletonRows, field } from '../ui.js';
import { api } from '../api.js';
import { meetingCard } from '../meeting-bits.js';

const TABS = [
  { id: 'upcoming', label: 'Akan Datang', test: (m) => ['Draf', 'Dijadualkan', 'Sedang Berlangsung'].includes(m.status), asc: true },
  { id: 'past', label: 'Lepas', test: (m) => m.status === 'Selesai' },
  { id: 'archive', label: 'Arkib', test: (m) => m.status === 'Dibatalkan' }
];
const PAGE = 20;

export function render(container, { user }) {
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  let all = [], tab = 'upcoming', q = '', series = '', tahun = '', page = 1;
  const listHost = h('div');

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Cari tajuk mesyuarat', 'aria-label': 'Cari tajuk mesyuarat', autocomplete: 'off' });
  const seriesSel = h('select', { class: 'input', 'aria-label': 'Tapis nama mesyuarat' }, h('option', { value: '', text: 'Semua mesyuarat' }));
  const tahunSel = h('select', { class: 'input', 'aria-label': 'Tapis tahun' }, h('option', { value: '', text: 'Semua tahun' }));
  tahunSel.addEventListener('change', () => { tahun = tahunSel.value; page = 1; draw(); });
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); page = 1; draw(); });
  seriesSel.addEventListener('change', () => { series = seriesSel.value; page = 1; draw(); });

  const tabBar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Jenis senarai' });
  function drawTabs() {
    tabBar.replaceChildren(...TABS.map((t) => h('button', {
      type: 'button', class: 'seg-btn' + (t.id === tab ? ' is-on' : ''), 'aria-pressed': t.id === tab ? 'true' : 'false',
      onClick: () => { tab = t.id; page = 1; drawTabs(); draw(); }
    }, t.label)));
  }

  container.append(
    h('div', { class: 'page-head' }, h('h1', { text: 'Mesyuarat' }),
      staff ? h('div', { class: 'page-actions' }, button('Mesyuarat Baharu', { kind: 'primary', iconName: 'plus', onClick: () => { location.hash = '#/meetings/new'; } })) : null),
    tabBar, h('div', { class: 'toolbar' }, search, seriesSel, tahunSel), listHost);
  drawTabs();

  async function load() {
    clear(listHost).append(skeletonRows(5));
    try {
      all = (await api('meetings.list')).meetings;
      [...new Set(all.map((m) => m.series).filter(Boolean))].sort().forEach((s) => seriesSel.append(h('option', { value: s, text: s })));
      [...new Set(all.map((m) => m.tahun).filter(Boolean))].sort().reverse().forEach((y) => tahunSel.append(h('option', { value: y, text: y })));
      draw();
    } catch (e) { clear(listHost).append(errorBanner('Tidak dapat sambung ke server. ' + e.message, load)); }
  }

  function draw() {
    const def = TABS.find((t) => t.id === tab);
    const rows = all.filter((m) => def.test(m) && (!q || m.title.toLowerCase().includes(q)) && (!series || m.series === series) && (!tahun || m.tahun === tahun))
      .sort((a, b) => { const c = (a.date + a.start_time).localeCompare(b.date + b.start_time); return def.asc ? c : -c; });
    clear(listHost);
    if (!rows.length) { listHost.append(emptyState('Tiada mesyuarat dijumpai', 'Cuba ubah tab, carian atau penapis.')); return; }
    const pages = Math.ceil(rows.length / PAGE);
    page = Math.min(page, pages);
    listHost.append(h('div', { class: 'mcard-list' }, rows.slice((page - 1) * PAGE, page * PAGE).map((m) => meetingCard(m, { showAttendance: true }))));
    if (pages > 1) {
      listHost.append(h('nav', { class: 'pager', 'aria-label': 'Halaman' },
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: page === 1, onClick: () => { page--; draw(); } }, 'Sebelum'),
        h('span', { text: `Halaman ${page} / ${pages}` }),
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: page === pages, onClick: () => { page++; draw(); } }, 'Seterusnya')));
    }
  }
  load();
}
