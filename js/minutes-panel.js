// S-11 Minit Mesyuarat (F-06). Staf menyediakan; Pengerusi mesyuarat menyemak/mengesahkan; ahli membaca yang Disahkan sahaja.
import { h, clear, button, busy, badge, toast, confirmDialog, emptyState, errorBanner, fmtDate, fmtDateTime, skeletonRows } from './ui.js';
import { renderMarkdown } from './markdown.js';
import { commentsPanel } from './comments-panel.js';
import { api } from './api.js';

const MAX = 45000, MIN_SUBMIT = 20, AUTOSAVE_MS = 30000;
const ST_KIND = { Draf: 'muted', 'Untuk Semakan': 'warning', Disahkan: 'success' };
const MS = ['JANUARI', 'FEBRUARI', 'MAC', 'APRIL', 'MEI', 'JUN', 'JULAI', 'OGOS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DISEMBER'];

function longDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MS[+m[2] - 1]} ${m[1]}` : ''; }

/** Templat awal mengikut format minit sebenar IKN (HADIR / TIDAK HADIR / 1-6). */
export function minuteTemplate(m) {
  const names = (list) => list.length ? list.map((x, i) => `${i + 1}. ${x.name}${x.position ? ', ' + x.position : ''}`).join('\n') : '-';
  const members = m.members || [];
  const hadir = members.filter((x) => x.attendance === 'Hadir'), tidak = members.filter((x) => x.attendance === 'Tidak Hadir');
  const lines = [`# MINIT MESYUARAT ${m.title}${m.bil ? ' BIL. ' + m.bil + '/' + m.tahun : ''}`, '',
    `Tarikh: ${longDate(m.date)}`, `Masa: ${m.start_time || ''}${m.end_time ? ' - ' + m.end_time : ''}`, `Lokasi: ${m.venue || ''}`, '',
    '## HADIR', names(hadir), '', '## TIDAK HADIR (DENGAN MAAF)', names(tidak), '',
    '## 1. PERUTUSAN PENGERUSI', '', '', '## 2. PENGESAHAN MINIT MESYUARAT LEPAS', '', ''];
  lines.push('## 3. PERKARA BERBANGKIT');
  (m.carry_over || []).forEach((c, i) => lines.push(`3.${i + 1} ${c.title} (${c.owner_name})`));
  lines.push('', '## 4. PERKARA YANG DIBINCANGKAN');
  (m.agenda || []).forEach((a) => lines.push('', `4.${a.seq} **${a.title}**`, ''));
  lines.push('', '## 5. HAL-HAL LAIN', '', '', '## 6. PENUTUP', '', 'Mesyuarat ditangguhkan pada ' + (m.end_time || '') + '.');
  return lines.join('\n');
}

export function minutesPanel({ m, user }) {
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  let data = null, barHost = null, ta = null, status = null, timer = null, dirty = false, saving = false, destroyed = false, cmt = null;
  const wrap = h('div', { class: 'minute' });

  async function load() {
    clear(wrap).append(skeletonRows(3));
    try { data = await api('minutes.get', { meeting_id: m.id }); draw(); } catch (e) { clear(wrap).append(errorBanner(e.message, load)); }
  }

  const stamp = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });

  async function save(silent) {
    if (!ta || saving || !dirty) return true;
    saving = true;
    try {
      const r = await api('minutes.save', { meeting_id: m.id, content_md: ta.value });
      const first = !data.minute; data.minute = r.minute; dirty = false;
      if (first) { data.caps = { ...data.caps, can_submit: true, can_attach: true }; if (barHost) { barHost.replaceChildren(actionsBar(data.minute, data.caps)); } }
      if (status) status.textContent = 'Disimpan ' + stamp();
      return true;
    } catch (e) { if (status) status.textContent = 'Gagal simpan'; if (!silent) toast(e.message, 'error'); return false; }
    finally { saving = false; }
  }

  async function act(btn, action, doneMsg, confirmOpts) {
    if (confirmOpts && !(await confirmDialog(confirmOpts))) return;
    if (!(await save(false))) return;
    try { await busy(btn, () => api(action, { meeting_id: m.id })); toast(doneMsg); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  function header(min) {
    return h('div', { class: 'minute-head' },
      min ? badge(min.status, ST_KIND[min.status] || 'muted') : badge('Belum disediakan', 'muted'),
      min ? h('span', { class: 'muted small', text: `Versi ${min.version}` + (min.prepared_by_name ? ` • disediakan oleh ${min.prepared_by_name}` : '') }) : null,
      min && min.status === 'Disahkan' ? h('span', { class: 'muted small', text: `Disahkan oleh ${min.approved_by_name} pada ${fmtDateTime(min.approved_at)}` }) : null);
  }

  function actionsBar(min, caps) {
    const bar = h('div', { class: 'page-actions' });
    if (caps.can_edit) bar.append(button('Simpan draf', { kind: 'secondary', iconName: 'check', onClick: async (e) => { dirty = true; if (await busy(e.currentTarget, () => save(false))) toast('Draf disimpan.'); } }));
    if (caps.can_submit) bar.append(button('Hantar untuk semakan Pengerusi', { kind: 'primary', onClick: (e) => act(e.currentTarget, 'minutes.submit', 'Dihantar kepada Pengerusi.', { title: 'Hantar untuk semakan', confirmLabel: 'Hantar', message: 'Pengerusi akan menerima emel dan dapat membaca serta memberi komen. Minit tidak boleh disunting sehingga ditarik balik.' }) }));
    if (caps.can_withdraw) bar.append(button('Tarik balik ke draf', { kind: 'secondary', onClick: (e) => act(e.currentTarget, 'minutes.withdraw', 'Minit kembali menjadi draf.') }));
    if (caps.can_approve) bar.append(button('Sahkan minit', { kind: 'primary', iconName: 'check', onClick: (e) => act(e.currentTarget, 'minutes.approve', 'Minit disahkan.', { title: 'Sahkan minit', confirmLabel: 'Sahkan', message: 'Minit dikunci dan semua ahli mesyuarat akan dapat membacanya. Emel pemberitahuan dihantar.' }) }));
    if (caps.can_reopen) bar.append(button('Buka semula', { kind: 'ghost', onClick: (e) => act(e.currentTarget, 'minutes.reopen', 'Minit dibuka semula sebagai draf.', { title: 'Buka semula minit', danger: true, confirmLabel: 'Buka semula', message: 'Minit yang telah disahkan kembali menjadi draf dan ahli tidak lagi nampak. Direkod dalam audit.' }) }));
    if (min && min.content_md) bar.append(button('Cetak', { kind: 'ghost', onClick: () => window.print() }));
    return bar;
  }

  function attachSection(min, caps) {
    const mats = (m.materials || []).filter((x) => x.type === 'Minit' && x.status === 'Aktif');
    const box = h('div', { class: 'minute-attach' });
    if (min && min.final_file_id) {
      const cur = mats.find((x) => x.file_id === min.final_file_id) || mats[0];
      box.append(h('p', {}, 'Salinan bertandatangan: ', cur ? h('a', { href: `#/meetings/${encodeURIComponent(m.id)}/materials/${encodeURIComponent(cur.id)}`, text: cur.title }) : 'dilampirkan'));
    }
    if (caps.can_attach && mats.length) {
      const sel = h('select', { class: 'input', 'aria-label': 'Pilih PDF minit bertandatangan' }, mats.map((x) => h('option', { value: x.id, text: x.title })));
      box.append(h('div', { class: 'cmt-row' }, sel, button('Lampirkan PDF bertandatangan', { kind: 'secondary', onClick: async (e) => {
        try { await busy(e.currentTarget, () => api('minutes.attach', { meeting_id: m.id, material_id: sel.value })); toast('PDF dilampirkan.'); load(); } catch (er) { toast(er.message, 'error'); } } })));
    } else if (caps.can_attach) box.append(h('p', { class: 'muted small', text: 'Untuk melampirkan salinan bertandatangan, muat naik PDF di tab Bahan dengan jenis Minit.' }));
    return box;
  }

  function draw() {
    if (ta) ta = null;
    if (cmt) { cmt.destroy(); cmt = null; }
    clearInterval(timer);
    const { minute: min, caps, prev } = data;
    clear(wrap);
    if (!min && !caps.can_edit) { wrap.append(emptyState('Minit belum tersedia', 'Minit akan kelihatan di sini selepas disahkan oleh Pengerusi.')); return; }
    wrap.append(header(min));
    if (prev && prev.accessible) wrap.append(h('p', { class: 'small' }, 'Minit mesyuarat lepas: ', h('a', { href: '#/meetings/' + encodeURIComponent(prev.meeting_id), text: prev.title || 'Mesyuarat lepas' }), prev.minute_status ? ` (${prev.minute_status})` : ''));
    barHost = h('div', {}, actionsBar(min, caps)); wrap.append(barHost);
    if (caps.can_edit) {
      ta = h('textarea', { class: 'input minute-editor', rows: 24, maxlength: MAX, spellcheck: 'false', 'aria-label': 'Kandungan minit' });
      ta.value = min ? min.content_md : minuteTemplate(m);
      if (!min) dirty = true; // templat belum disimpan
      const count = h('span', { class: 'muted small', text: `${ta.value.length} / ${MAX}` });
      status = h('span', { class: 'muted small', 'aria-live': 'polite', text: min ? '' : 'Templat belum disimpan' });
      const preview = h('div', { class: 'minute-preview', hidden: true });
      const toggle = button('Pratonton', { kind: 'ghost', onClick: () => { const on = preview.hidden; preview.hidden = !on; ta.hidden = on; if (on) { clear(preview).append(renderMarkdown(ta.value)); } toggle.querySelector('span').textContent = on ? 'Sunting' : 'Pratonton'; } });
      ta.addEventListener('input', () => { dirty = true; count.textContent = `${ta.value.length} / ${MAX}`; status.textContent = 'Belum disimpan'; });
      timer = setInterval(() => { if (!destroyed && dirty && ta && ta.isConnected) save(true); }, AUTOSAVE_MS);
      wrap.append(h('p', { class: 'muted small', text: 'Gunakan # untuk tajuk, 1. untuk senarai bernombor, - untuk titik, **tebal**. Hanya Pengerusi mesyuarat ini boleh mengesahkan.' }),
        h('div', { class: 'minute-tools' }, toggle, count, status), ta, preview);
    } else if (min) {
      wrap.append(h('article', { class: 'minute-doc' }, renderMarkdown(min.content_md),
        min.status === 'Disahkan' ? h('div', { class: 'sign-block' },
          h('div', {}, h('p', { class: 'small', text: 'Disediakan oleh:' }), h('p', { class: 'sign-line' }), h('p', { text: min.prepared_by_name || '' })),
          h('div', {}, h('p', { class: 'small', text: 'Disemak dan diluluskan oleh:' }), h('p', { class: 'sign-line' }), h('p', { text: min.approved_by_name || '' }), h('p', { class: 'small muted', text: fmtDate((min.approved_at || '').slice(0, 10)) }))) : null));
    }
    wrap.append(attachSection(min, caps));
    if (caps.can_comment && min) {
      wrap.append(h('h3', { class: 'minute-cmt-h', text: 'Komen semakan' }),
        h('p', { class: 'muted small', text: 'Hanya Pengerusi dan staf yang nampak komen ini. Ahli tidak.' }));
      cmt = commentsPanel({ m, user, target: { type: 'Minit', id: min.id }, compact: true });
      wrap.append(cmt.el);
    }
    if (staff && data.history && data.history.length > 1) {
      wrap.append(h('details', { class: 'minute-history' }, h('summary', { text: `Sejarah versi (${data.history.length})` }),
        h('ul', {}, data.history.map((x) => h('li', { class: 'small', text: `Versi ${x.version} - ${x.status} - ${fmtDateTime(x.approved_at || x.submitted_at) || '-'}` })))));
    }
  }

  load();
  return { el: wrap, destroy() { destroyed = true; clearInterval(timer); if (cmt) cmt.destroy(); if (dirty && ta) save(true); } };
}
