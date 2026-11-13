// S-10 Komen & Cadangan: senarai + borang. Digunakan dalam tab S-04, panel S-09 (Mod Mesyuarat) dan S-08 (penonton bahan).
import { h, clear, button, busy, badge, field, openModal, confirmDialog, toast, emptyState, errorBanner, fmtDateTime, avatar } from './ui.js';
import { icon } from './icons.js';
import { api } from './api.js';

const KINDS = ['Komen', 'Cadangan', 'Soalan', 'Bantahan'];
const KIND_BADGE = { Komen: 'muted', Cadangan: 'teal', Soalan: 'info', Bantahan: 'danger' };
const VIS = [{ value: 'Semua', label: 'Semua ahli' }, { value: 'Pengerusi & Setiausaha', label: 'Pengerusi & Setiausaha sahaja' }];
const MAX = 3000;

/**
 * opts.m: butiran mesyuarat (agenda, materials). opts.target: {type,id} tetap (panel hanya untuk sasaran itu) atau null.
 * opts.filters: papar penapis (S-10). Pulang {el, reload, setTarget, destroy}.
 */
export function commentsPanel({ m, user, target = null, filters = false, compact = false, onChange }) {
  let items = [], canComment = false, loaded = false, fixed = target, flt = { target: '', kind: '', author: '' }, destroyed = false;
  const wrap = h('div', { class: 'cmt' + (compact ? ' cmt-compact' : '') });
  const listHost = h('div', { class: 'cmt-list', 'aria-live': 'polite' });
  const composerHost = h('div', { class: 'cmt-composer' });
  const filterHost = h('div', { class: 'cmt-filters' });

  const agendaById = Object.fromEntries((m.agenda || []).map((a) => [a.id, a]));
  const matById = Object.fromEntries((m.materials || []).map((x) => [x.id, x]));
  const targetLabel = (t, id) => t === 'Agenda' ? (agendaById[id] ? `Item ${agendaById[id].seq}: ${agendaById[id].title}` : 'Item agenda')
    : t === 'Bahan' ? (matById[id] ? `Bahan: ${matById[id].title}` : 'Bahan') : t === 'Minit' ? 'Minit' : 'Mesyuarat';
  const targetOptions = () => [{ value: 'Mesyuarat|' + m.id, label: 'Mesyuarat (umum)' },
    ...(m.agenda || []).map((a) => ({ value: 'Agenda|' + a.id, label: `Item ${a.seq}: ${a.title}` })),
    ...(m.materials || []).filter((x) => x.status === 'Aktif').map((x) => ({ value: 'Bahan|' + x.id, label: `Bahan: ${x.title}` }))];

  async function reload() {
    try {
      const q = { meeting_id: m.id };
      if (fixed) { q.target_type = fixed.type; q.target_id = fixed.id; }
      const r = await api('feedback.list', q);
      if (destroyed) return;
      items = r.feedback; canComment = r.can_comment; loaded = true;
      drawFilters(); drawList(); drawComposer();
    } catch (e) { if (!destroyed) { clear(listHost).append(errorBanner(e.message, reload)); } }
  }

  function drawFilters() {
    clear(filterHost);
    if (!filters) return;
    const tsel = h('select', { class: 'input', 'aria-label': 'Tapis ikut item' }, h('option', { value: '', text: 'Semua item' }), ...targetOptions().map((o) => h('option', { value: o.value, text: o.label })));
    const ksel = h('select', { class: 'input', 'aria-label': 'Tapis ikut jenis' }, h('option', { value: '', text: 'Semua jenis' }), ...KINDS.map((k) => h('option', { value: k, text: k })));
    const authors = [...new Map(items.map((x) => [x.author_email, x.author_name])).entries()];
    const asel = h('select', { class: 'input', 'aria-label': 'Tapis ikut penulis' }, h('option', { value: '', text: 'Semua penulis' }), ...authors.map(([e, n]) => h('option', { value: e, text: n })));
    tsel.value = flt.target; ksel.value = flt.kind; asel.value = flt.author;
    [[tsel, 'target'], [ksel, 'kind'], [asel, 'author']].forEach(([el, k]) => el.addEventListener('change', () => { flt[k] = el.value; drawList(); }));
    filterHost.append(tsel, ksel, asel);
  }

  function visible() {
    return items.filter((x) => (!flt.target || `${x.target_type}|${x.target_id}` === flt.target) && (!flt.kind || x.kind === flt.kind) && (!flt.author || x.author_email === flt.author));
  }

  function drawList() {
    clear(listHost);
    const rows = visible();
    if (!rows.length) { listHost.append(emptyState(loaded ? 'Belum ada komen atau cadangan' : 'Memuatkan…', loaded && canComment ? 'Jadilah yang pertama menulis.' : undefined)); return; }
    rows.forEach((x) => {
      listHost.append(h('article', { class: 'cmt-item' + (x.mine ? ' is-mine' : '') },
        h('div', { class: 'cmt-head' }, avatar({ name: x.author_name, photo: x.photo }, 32),
          h('div', { class: 'cmt-who' }, h('strong', { text: x.author_name }), x.author_position ? h('span', { class: 'muted small', text: x.author_position }) : null)),
        h('div', { class: 'cmt-meta' }, badge(x.kind, KIND_BADGE[x.kind] || 'muted'),
          x.visibility !== 'Semua' ? badge('Pengerusi & Setiausaha sahaja', 'warning') : null,
          h('span', { class: 'muted small', text: fmtDateTime(x.created_at) + (x.edited ? ' (disunting)' : '') })),
        !fixed || fixed.type === 'Mesyuarat' ? h('p', { class: 'cmt-target small muted', text: targetLabel(x.target_type, x.target_id) }) : null,
        h('p', { class: 'cmt-text', text: x.content }),
        x.can_edit || x.can_delete ? h('div', { class: 'cmt-actions' },
          x.can_edit ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Edit komen', title: 'Edit', onClick: () => editModal(x) }, icon('edit', 18)) : null,
          x.can_delete ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Padam komen', title: 'Padam', onClick: () => remove(x) }, icon('trash', 18)) : null) : null));
    });
  }

  function drawComposer() {
    clear(composerHost);
    if (!canComment) { composerHost.append(h('p', { class: 'muted small cmt-closed' }, icon('info', 16), ' Komen hanya boleh ditulis semasa mesyuarat Dijadualkan atau Sedang Berlangsung.')); return; }
    const kind = h('select', { class: 'input', 'aria-label': 'Jenis' }, ...KINDS.map((k) => h('option', { value: k, text: k })));
    const vis = h('select', { class: 'input', 'aria-label': 'Siapa boleh baca' }, ...VIS.map((v) => h('option', { value: v.value, text: v.label })));
    const tgt = !fixed ? h('select', { class: 'input', 'aria-label': 'Komen untuk' }, ...targetOptions().map((o) => h('option', { value: o.value, text: o.label }))) : null;
    const ta = h('textarea', { class: 'input', rows: compact ? 3 : 4, maxlength: MAX, placeholder: 'Tulis komen atau cadangan anda…', 'aria-label': 'Komen anda' });
    const count = h('span', { class: 'muted small', text: `0 / ${MAX}` });
    const err = h('div', { 'aria-live': 'polite' });
    ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / ${MAX}`; });
    const send = button('Hantar', { kind: 'primary', iconName: 'message', onClick: async () => {
      clear(err);
      if (!ta.value.trim()) { err.append(errorBanner('Tulis sesuatu dahulu.')); return; }
      const [type, id] = tgt ? tgt.value.split('|') : [fixed.type, fixed.id];
      try {
        await busy(send, () => api('feedback.add', { meeting_id: m.id, target_type: type, target_id: id, kind: kind.value, visibility: vis.value, content: ta.value }));
        toast('Komen dihantar.'); ta.value = ''; count.textContent = `0 / ${MAX}`;
        await reload(); if (onChange) onChange();
      } catch (e) { err.append(errorBanner(e.message)); }
    } });
    composerHost.append(h('div', { class: 'cmt-form' }, tgt, h('div', { class: 'cmt-row' }, kind, vis), ta, h('div', { class: 'cmt-row cmt-send' }, count, send), err));
  }

  function editModal(x) {
    const f = { content: field({ label: 'Komen', value: x.content, rows: 5, maxlength: MAX, required: true }),
      kind: field({ label: 'Jenis', value: x.kind, options: KINDS }), vis: field({ label: 'Siapa boleh baca', value: x.visibility, options: VIS }) };
    const err = h('div', { 'aria-live': 'polite' });
    const save = button('Simpan', { kind: 'primary', onClick: async () => {
      clear(err); f.content.clearError();
      if (!f.content.input.value.trim()) { f.content.error('Komen wajib diisi.'); return; }
      try { await busy(save, () => api('feedback.update', { id: x.id, content: f.content.input.value, kind: f.kind.input.value, visibility: f.vis.input.value })); mod.close(); toast('Komen dikemas kini.'); await reload(); if (onChange) onChange(); }
      catch (e) { err.append(errorBanner(e.message)); }
    } });
    const mod = openModal({ title: 'Edit komen', body: h('div', {}, f.content.wrap, f.kind.wrap, f.vis.wrap, err), actions: [button('Batal', { kind: 'ghost', onClick: () => mod.close() }), save] });
  }

  async function remove(x) {
    const own = x.mine;
    const ok = await confirmDialog({ title: 'Padam komen', danger: true, confirmLabel: 'Padam', message: own ? 'Komen anda akan dipadam.' : `Komen oleh ${x.author_name} akan dipadam. Tindakan ini direkod dalam audit.` });
    if (!ok) return;
    try { await api('feedback.delete', { id: x.id }); toast('Komen dipadam.'); await reload(); if (onChange) onChange(); } catch (e) { toast(e.message, 'error'); }
  }

  wrap.append(filterHost, listHost, composerHost);
  drawList();
  reload();
  return { el: wrap, reload, setTarget(t) { fixed = t; reload(); }, destroy() { destroyed = true; } };
}
