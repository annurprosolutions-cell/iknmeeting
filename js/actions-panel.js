// S-12 Tindakan Susulan (F-08). Digunakan dalam tab S-04 (satu mesyuarat) dan halaman /actions (semua mesyuarat).
import { h, clear, button, busy, badge, field, openModal, toast, emptyState, errorBanner, fmtDate, skeletonRows, todayMyt } from './ui.js';
import { api } from './api.js';

const ST = ['Baharu', 'Dalam Tindakan', 'Selesai', 'Dibatalkan'];
const ST_KIND = { Baharu: 'info', 'Dalam Tindakan': 'warning', Selesai: 'success', Dibatalkan: 'muted' };
const SCOPES = [{ value: 'saya', label: 'Saya' }, { value: 'tertunggak', label: 'Tertunggak' }, { value: 'semua', label: 'Semua' }];

/** opts.m: mesyuarat (tab S-04) atau null (halaman /actions). opts.canManage: staf atau Pengerusi mesyuarat itu. */
export function actionsPanel({ m = null, user, canManage = false, members = [], onChange }) {
  const wrap = h('div', { class: 'actions-panel' });
  let items = [], counts = { open: 0, overdue: 0 }, scope = m ? 'semua' : 'saya', loaded = false;
  const listHost = h('div', { 'aria-live': 'polite' });
  const bar = h('div', { class: 'page-actions' });
  const agenda = m ? m.agenda || [] : [];
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  const mine = (a) => String(a.owner_email || '').trim().toLowerCase() === String(user.email || '').trim().toLowerCase();

  async function load() {
    clear(listHost).append(skeletonRows(3));
    try {
      const q = { scope }; if (m) q.meeting_id = m.id;
      const r = await api('actions.list', q); items = r.actions; counts = r.counts; loaded = true; drawBar(); drawList();
    } catch (e) { clear(listHost).append(errorBanner(e.message, load)); }
  }

  function drawBar() {
    clear(bar);
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Tapis tindakan' });
    SCOPES.forEach((s) => seg.append(h('button', { type: 'button', class: 'seg-btn' + (scope === s.value ? ' is-on' : ''), 'aria-pressed': scope === s.value ? 'true' : 'false', onClick: () => { scope = s.value; load(); } },
      s.label + (s.value === 'tertunggak' && counts.overdue ? ` (${counts.overdue})` : ''))));
    bar.append(seg);
    if (m && canManage) bar.append(button('Tambah tindakan', { kind: 'primary', iconName: 'plus', onClick: () => editModal(null) }));
    if (items.length) bar.append(button('Cetak', { kind: 'ghost', onClick: () => window.print() }));
  }

  function drawList() {
    clear(listHost);
    if (!items.length) { listHost.append(emptyState(loaded ? (scope === 'tertunggak' ? 'Tiada tindakan tertunggak' : 'Tiada tindakan') : 'Memuatkan…')); return; }
    const showMeeting = !m;
    const th = (t) => h('th', { scope: 'col', text: t });
    const td = (label, ...k) => h('td', { 'data-label': label }, ...k);
    listHost.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table actions-table' },
      h('caption', { class: 'sr-only', text: 'Senarai tindakan susulan' }),
      h('thead', {}, h('tr', {}, th('BIL'), th('PERKARA'), th('TINDAKAN'), th('TARIKH AKHIR'), th('STATUS'), th('MAKLUM BALAS'), h('th', { scope: 'col' }, h('span', { class: 'sr-only', text: 'Tindakan' })))),
      h('tbody', {}, items.map((a, i) => h('tr', { class: a.overdue ? 'is-overdue' : '' },
        td('BIL', String(i + 1)),
        td('PERKARA', h('strong', { text: a.title }), showMeeting ? h('span', { class: 'block small muted' }, h('a', { href: '#/meetings/' + encodeURIComponent(a.meeting_id), text: `${a.meeting_title}${a.bil ? ` Bil.${a.bil}/${a.tahun}` : ''}` })) : null),
        td('TINDAKAN', a.owner_name || a.owner_email),
        td('TARIKH AKHIR', a.due_date ? fmtDate(a.due_date) : '-', a.overdue ? h('span', { class: 'block' }, badge('Tertunggak', 'danger')) : null),
        td('STATUS', badge(a.status, ST_KIND[a.status] || 'muted')),
        td('MAKLUM BALAS', a.remarks || '-'),
        td('', mine(a) || staff ? button('Kemas kini', { kind: 'ghost', onClick: () => (m && canManage ? editModal(a) : ownerModal(a)) }) : null)))))));
  }

  function ownerModal(a) {
    const st = field({ label: 'Status', value: a.status, options: staff ? ST : ST.filter((s) => s !== 'Dibatalkan') });
    const rm = field({ label: 'Maklum balas', value: a.remarks || '', rows: 4, maxlength: 1000 });
    const err = h('div', { 'aria-live': 'polite' });
    const save = button('Simpan', { kind: 'primary', onClick: async () => {
      clear(err);
      try { await busy(save, () => api('actions.updateStatus', { id: a.id, status: st.input.value, remarks: rm.input.value })); mod.close(); toast('Tindakan dikemas kini.'); await load(); if (onChange) onChange(); }
      catch (e) { err.append(errorBanner(e.message)); }
    } });
    const mod = openModal({ title: a.title, body: h('div', {}, st.wrap, rm.wrap, err), actions: [button('Batal', { kind: 'ghost', onClick: () => mod.close() }), save] });
  }

  function editModal(a) {
    const f = {
      title: field({ label: 'Perkara / tindakan', value: a ? a.title : '', required: true, maxlength: 300 }),
      owner: field({ label: 'Pemilik tindakan', value: a ? a.owner_email : '', required: true, options: [{ value: '', label: 'Pilih…' }, ...members.map((x) => ({ value: x.email, label: x.name }))] }),
      due: field({ label: 'Tarikh akhir', type: 'date', value: a ? a.due_date : '' }),
      agenda: field({ label: 'Item agenda (pilihan)', value: a ? a.agenda_id || '' : '', options: [{ value: '', label: '-' }, ...agenda.map((x) => ({ value: x.id, label: `Item ${x.seq}: ${x.title}` }))] }),
      status: field({ label: 'Status', value: a ? a.status : 'Baharu', options: ST }),
      remarks: field({ label: 'Maklum balas', value: a ? a.remarks || '' : '', rows: 3, maxlength: 1000 })
    };
    const err = h('div', { 'aria-live': 'polite' });
    const save = button('Simpan', { kind: 'primary', onClick: async () => {
      clear(err); f.title.clearError(); f.owner.clearError();
      let bad = false;
      if (!f.title.input.value.trim()) { f.title.error('Perkara wajib diisi.'); bad = true; }
      if (!f.owner.input.value) { f.owner.error('Pilih pemilik tindakan.'); bad = true; }
      if (bad) return;
      const body = { meeting_id: m.id, title: f.title.input.value, owner_email: f.owner.input.value, due_date: f.due.input.value, agenda_id: f.agenda.input.value, status: f.status.input.value, remarks: f.remarks.input.value };
      if (a) body.id = a.id;
      try { await busy(save, () => api('actions.save', body)); mod.close(); toast('Tindakan disimpan.'); await load(); if (onChange) onChange(); }
      catch (e) { err.append(errorBanner(e.message)); }
    } });
    const mod = openModal({ title: a ? 'Edit tindakan' : 'Tindakan baharu', body: h('div', {}, f.title.wrap, f.owner.wrap, f.due.wrap, f.agenda.wrap, f.status.wrap, f.remarks.wrap, err), actions: [button('Batal', { kind: 'ghost', onClick: () => mod.close() }), save] });
  }

  wrap.append(bar, listHost);
  load();
  return { el: wrap, reload: load };
}
