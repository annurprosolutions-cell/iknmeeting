// Bahagian kongsi untuk skrin mesyuarat: kad mesyuarat dan pemilih ahli.
import { h, clear, field, dayMonth, fmtTimeRange, meetingStatusBadge, attendanceBadge } from './ui.js';
import { icon } from './icons.js';

/** Kad mesyuarat (DBD seksyen 6): tarikh besar di kiri, tajuk, lokasi, badge status. */
export function meetingCard(m, { showAttendance = false } = {}) {
  const dm = dayMonth(m.date);
  return h('a', { class: 'mcard', href: '#/meetings/' + encodeURIComponent(m.id) },
    h('div', { class: 'mcard-date', 'aria-hidden': 'true' }, h('span', { class: 'mcard-day', text: dm.day }), h('span', { class: 'mcard-month', text: dm.month })),
    h('div', { class: 'mcard-body' },
      h('p', { class: 'mcard-title', text: m.title }),
      h('p', { class: 'muted small mcard-meta', text: [fmtTimeRange(m.start_time, m.end_time), m.venue].filter(Boolean).join(' · ') }),
      h('div', { class: 'mcard-badges' }, meetingStatusBadge(m.status),
        showAttendance && m.my_attendance === 'Belum Jawab' && m.status !== 'Draf' ? attendanceBadge('Belum Jawab') : null,
        showAttendance && m.my_attendance && m.my_attendance !== 'Belum Jawab' ? attendanceBadge(m.my_attendance) : null)),
    icon('next', 20));
}

/**
 * Pemilih ahli berbilang: carian + checkbox, papar nama dan jawatan (DBD).
 * users: [{email,name,position}]. selected: array emel. Pulang {el, getSelected, setLocked, error, clearError}.
 */
export function memberPicker(users, selected) {
  const sel = new Set(selected);
  let locked = null;
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Cari nama atau emel', 'aria-label': 'Cari ahli', autocomplete: 'off' });
  const count = h('span', { class: 'muted small', 'aria-live': 'polite' });
  const list = h('div', { class: 'picker-list', role: 'group', 'aria-label': 'Senarai pengguna' });
  const errEl = h('p', { class: 'field-error', hidden: true });
  const boxes = new Map();

  users.forEach((u, i) => {
    const id = 'mp' + i + Math.random().toString(36).slice(2, 5);
    const cb = h('input', { type: 'checkbox', id, checked: sel.has(u.email) });
    cb.addEventListener('change', () => { if (cb.checked) sel.add(u.email); else sel.delete(u.email); errEl.hidden = true; updateCount(); });
    const row = h('label', { class: 'picker-row', for: id, 'data-search': (u.name + ' ' + u.email).toLowerCase() }, cb,
      h('span', { class: 'picker-text' }, h('strong', { text: u.name }), h('span', { class: 'muted small', text: [u.position, u.email].filter(Boolean).join(' · ') })),
      h('span', { class: 'picker-tag muted small', hidden: true, text: 'Pengerusi' }));
    boxes.set(u.email, { cb, row });
    list.append(row);
  });
  const emptyMsg = h('p', { class: 'muted picker-empty', hidden: true, text: 'Tiada pengguna sepadan.' });
  list.append(emptyMsg);

  function updateCount() { count.textContent = sel.size + ' dipilih'; }
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    let shown = 0;
    boxes.forEach(({ row }) => { const on = !t || row.dataset.search.includes(t); row.hidden = !on; if (on) shown++; });
    emptyMsg.hidden = shown > 0;
  });
  updateCount();

  return {
    el: h('div', { class: 'picker' }, q, h('div', { class: 'picker-count' }, count), list, errEl),
    getSelected: () => [...sel],
    /** Kunci seorang pengguna sebagai terpilih (Pengerusi). */
    setLocked(email) {
      if (locked && boxes.has(locked)) { const o = boxes.get(locked); o.cb.disabled = false; o.row.querySelector('.picker-tag').hidden = true; }
      locked = email || null;
      if (locked && boxes.has(locked)) {
        const o = boxes.get(locked); sel.add(locked); o.cb.checked = true; o.cb.disabled = true; o.row.querySelector('.picker-tag').hidden = false;
      }
      updateCount();
    },
    error(msg) { errEl.replaceChildren(icon('alert', 16), h('span', { text: msg })); errEl.hidden = false; },
    clearError() { errEl.hidden = true; }
  };
}
