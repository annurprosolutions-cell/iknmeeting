// S-06 Editor Agenda: tambah, edit, buang, susun semula (butang naik/turun dan seret).
import { h, clear, button, busy, badge, field, openModal, confirmDialog, toast, emptyState, errorBanner, skeletonRows, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const CATS = ['Makluman', 'Perbincangan', 'Keputusan', 'Pengesahan'];
const CAT_KIND = { Makluman: 'info', Perbincangan: 'teal', Keputusan: 'warning', Pengesahan: 'success' };

export function render(container, { user, params }) {
  const host = h('div');
  container.append(host);
  let m = null, items = [], dragId = null;

  async function load() {
    clear(host).append(skeletonRows(4));
    try { m = await api('meetings.get', { id: params.id }); items = m.agenda.slice(); draw(); }
    catch (e) { clear(host).append(h('h1', { text: 'Editor Agenda' }), errorBanner(e.message, load)); }
  }

  const back = () => h('p', { class: 'back' }, h('a', { href: '#/meetings/' + encodeURIComponent(params.id) }, icon('prev', 16), ' Kembali ke butiran mesyuarat'));

  async function persistOrder(prev) {
    try { await api('agenda.reorder', { meeting_id: m.id, ids: items.map((i) => i.id) }); items.forEach((it, i) => { it.seq = i + 1; }); draw(); }
    catch (e) { items = prev; toast(e.message, 'error'); draw(); }
  }
  function move(i, d) {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const prev = items.slice();
    [items[i], items[j]] = [items[j], items[i]];
    draw(); persistOrder(prev);
  }

  function itemModal(it) {
    const f = {
      title: field({ label: 'Tajuk item', value: it ? it.title : '', required: true, maxlength: 200 }),
      category: field({ label: 'Kategori', value: it ? it.category : 'Perbincangan', options: CATS }),
      desc: field({ label: 'Keterangan', value: it ? it.description : '', rows: 3, maxlength: 2000 }),
      presenter: field({ label: 'Pembentang', value: it ? it.presenter_email : '', hint: 'Pembentang boleh memuat naik bahan untuk item ini. Pilih daripada ahli mesyuarat.',
        options: [{ value: '', label: '- Tiada -' }, ...m.members.map((x) => ({ value: x.email, label: x.name }))] }),
      duration: field({ label: 'Tempoh (minit)', type: 'number', value: it && it.duration_min ? String(it.duration_min) : '', hint: '1 hingga 480. Pilihan.' })
    };
    f.duration.input.setAttribute('min', '1'); f.duration.input.setAttribute('max', '480'); f.duration.input.setAttribute('inputmode', 'numeric');
    const err = h('div', { 'aria-live': 'polite' });
    const body = h('form', { class: 'form', novalidate: true }, Object.values(f).map((x) => x.wrap), err);
    const save = button('Simpan', { kind: 'primary', type: 'submit' });
    const mod = openModal({ title: it ? 'Edit item agenda' : 'Tambah item agenda', wide: true, body, actions: [button('Batal', { kind: 'ghost', onClick: () => mod.close() }), save] });
    save.addEventListener('click', (e) => { e.preventDefault(); body.requestSubmit(); });
    body.addEventListener('submit', async (e) => {
      e.preventDefault(); clear(err); Object.values(f).forEach((x) => x.clearError());
      if (!f.title.input.value.trim()) { f.title.error('Tajuk wajib diisi.'); return; }
      const d = f.duration.input.value.trim();
      if (d && (!/^\d+$/.test(d) || +d < 1 || +d > 480)) { f.duration.error('Masukkan nombor bulat 1 hingga 480.'); return; }
      try {
        await busy(save, () => api('agenda.save', { meeting_id: m.id, id: it ? it.id : undefined, title: f.title.input.value, category: f.category.input.value,
          description: f.desc.input.value, presenter_email: f.presenter.input.value, duration_min: d }));
        mod.close(); toast(it ? 'Item dikemas kini.' : 'Item ditambah.'); load();
      } catch (e2) { err.append(errorBanner(e2.message)); }
    });
  }

  async function del(it) {
    const ok = await confirmDialog({ title: 'Buang item agenda', danger: true, confirmLabel: 'Buang', message: `"${it.title}" akan dibuang. Bahan yang dikaitkan kekal tetapi dilepaskan daripada item ini.` });
    if (!ok) return;
    try { await api('agenda.delete', { meeting_id: m.id, id: it.id }); toast('Item dibuang.'); load(); } catch (e) { toast(e.message, 'error'); }
  }

  function row(it, i) {
    const li = h('li', { class: 'ag-item', draggable: 'true', 'data-id': it.id });
    li.addEventListener('dragstart', (e) => { dragId = it.id; li.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch (x) { /* abaikan */ } });
    li.addEventListener('dragend', () => { dragId = null; li.classList.remove('is-dragging'); host.querySelectorAll('.is-over').forEach((x) => x.classList.remove('is-over')); });
    li.addEventListener('dragover', (e) => { if (dragId && dragId !== it.id) { e.preventDefault(); li.classList.add('is-over'); } });
    li.addEventListener('dragleave', () => li.classList.remove('is-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault(); li.classList.remove('is-over');
      const from = items.findIndex((x) => x.id === dragId), to = i;
      if (from < 0 || from === to) return;
      const prev = items.slice(); const [moved] = items.splice(from, 1); items.splice(to, 0, moved);
      draw(); persistOrder(prev);
    });
    li.append(
      h('span', { class: 'ag-handle', 'aria-hidden': 'true', title: 'Seret untuk susun', text: '⠿' }),
      h('span', { class: 'agenda-seq', text: String(i + 1) }),
      h('div', { class: 'ag-body' },
        h('p', { class: 'agenda-title', text: it.title }),
        it.description ? h('p', { class: 'muted small', text: it.description }) : null,
        h('div', { class: 'agenda-meta' }, badge(it.category, CAT_KIND[it.category] || 'muted'),
          it.presenter_name ? h('span', { class: 'small muted', text: 'Pembentang: ' + it.presenter_name }) : null,
          it.duration_min ? h('span', { class: 'small muted', text: it.duration_min + ' min' }) : null)),
      h('div', { class: 'ag-ctrl' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Naikkan ${it.title}`, title: 'Naik', disabled: i === 0, onClick: () => move(i, -1) }, icon('up', 20)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Turunkan ${it.title}`, title: 'Turun', disabled: i === items.length - 1, onClick: () => move(i, 1) }, icon('down', 20)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${it.title}`, title: 'Edit', onClick: () => itemModal(it) }, icon('edit', 20)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Buang ${it.title}`, title: 'Buang', onClick: () => del(it) }, icon('x', 20))));
    return li;
  }

  function draw() {
    clear(host).append(back(),
      h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'small muted', text: `${m.title} · ${fmtDate(m.date)}` }), h('h1', { text: 'Editor Agenda' })),
        button('Tambah item', { kind: 'primary', iconName: 'plus', onClick: () => itemModal(null) })),
      items.length ? h('ol', { class: 'ag-list' }, items.map(row)) : h('section', { class: 'card' }, emptyState('Tambah item agenda pertama', 'Gunakan butang Tambah item di atas.')),
      items.length > 1 ? h('p', { class: 'muted small', text: 'Seret item atau guna butang anak panah untuk menyusun semula. Susunan disimpan serta-merta.' }) : null);
  }
  load();
}
