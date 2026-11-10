// S-07 Bahan Mesyuarat (dalam tab Bahan pada S-04): senarai ikut jenis, muat naik, daftar pautan Drive, imbas folder, ganti versi, arkib.
import { h, clear, button, busy, badge, field, openModal, confirmDialog, toast, emptyState, fmtDateTime, fmtSize } from './ui.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { sendFile, checkFile, FILE_ACCEPT, MATERIAL_TYPES, RESTRICTED_TYPES } from './upload.js';

const EXT_LABEL = (name) => ((/\.([A-Za-z0-9]{1,5})$/.exec(name || '') || [])[1] || 'fail').toLowerCase();

export function materialsPanel({ m, user, reload }) {
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  const myItems = m.agenda.filter((a) => a.presenter_email === user.email);
  const open = m.status !== 'Dibatalkan';
  const canUpload = open && (staff || myItems.length > 0);
  const agendaById = Object.fromEntries(m.agenda.map((a) => [a.id, a]));
  let showOld = false;
  const wrap = h('div');
  const list = h('div');

  const canManage = (mat) => open && (staff || (mat.uploaded_by === user.email && agendaById[mat.agenda_id] && agendaById[mat.agenda_id].presenter_email === user.email));

  // ----- Pembantu borang -----
  const agendaOptions = (required) => [...(required ? [] : [{ value: '', label: '- Tiada item (umum) -' }]),
    ...(staff ? m.agenda : myItems).map((a) => ({ value: a.id, label: `${a.seq}. ${a.title}` }))];
  const typeOptions = () => MATERIAL_TYPES.filter((t) => staff || !RESTRICTED_TYPES.includes(t));
  const warn = () => h('p', { class: 'warn-note' }, icon('alert', 18), h('span', { text: 'Jangan muat naik dokumen berklasifikasi Rahsia atau Rahsia Besar.' }));

  function uploadModal() {
    const f = {
      type: field({ label: 'Jenis dokumen', options: typeOptions(), value: staff ? 'Kertas Makluman' : 'Slaid', required: true,
        hint: staff ? 'Bahan Bicara hanya kelihatan kepada Pengerusi mesyuarat ini dan Setiausaha/Admin.' : undefined }),
      title: field({ label: 'Tajuk', maxlength: 200, hint: 'Kosongkan untuk guna nama fail.' }),
      agenda: field({ label: 'Item agenda', options: agendaOptions(!staff), required: !staff, value: !staff && myItems[0] ? myItems[0].id : '' }),
      file: field({ label: 'Fail', required: true })
    };
    const inp = h('input', { type: 'file', class: 'file-input', accept: FILE_ACCEPT, id: 'upl-file' });
    f.file.input.replaceWith(inp); f.file.wrap.querySelector('label').setAttribute('for', 'upl-file');
    const bar = h('div', { class: 'progress', hidden: true, role: 'progressbar', 'aria-label': 'Kemajuan muat naik' }, h('div'));
    const err = h('div', { 'aria-live': 'polite' });
    const go = button('Muat naik', { kind: 'primary', iconName: 'upload', onClick: async () => {
      clear(err); f.file.clearError();
      const file = inp.files[0];
      if (!file) { f.file.error('Pilih fail.'); return; }
      const bad = checkFile(file); if (bad) { f.file.error(bad); return; }
      bar.hidden = false;
      try {
        await busy(go, () => sendFile('materials.upload', { meeting_id: m.id, type: f.type.input.value, title: f.title.input.value, agenda_id: f.agenda.input.value },
          file, (p) => { bar.firstChild.style.width = Math.round(p * 100) + '%'; }));
        modal.close(); toast('Bahan dimuat naik.'); reload();
      } catch (e) { bar.hidden = true; err.append(h('div', { class: 'banner banner-danger', role: 'alert' }, icon('alert', 20), h('span', { text: e.message }))); }
    } });
    const modal = openModal({ title: 'Muat naik bahan', wide: true, body: h('div', {}, f.type.wrap, f.title.wrap, f.agenda.wrap, f.file.wrap, warn(), bar, err), actions: [button('Batal', { kind: 'ghost', onClick: () => modal.close() }), go] });
  }

  function registerModal() {
    const f = {
      file: field({ label: 'Pautan atau ID fail Google Drive', required: true, placeholder: 'https://drive.google.com/file/d/…',
        hint: 'Fail mesti sudah diletakkan dalam folder Drive mesyuarat ini. Guna "Buka folder Drive" untuk letak fail besar.' }),
      type: field({ label: 'Jenis dokumen', options: MATERIAL_TYPES.filter((t) => !RESTRICTED_TYPES.includes(t)), value: 'Lain-lain', required: true }),
      title: field({ label: 'Tajuk', maxlength: 200, hint: 'Kosongkan untuk guna nama fail.' }),
      agenda: field({ label: 'Item agenda', options: agendaOptions(false) })
    };
    const err = h('div', { 'aria-live': 'polite' });
    const go = button('Daftar', { kind: 'primary', onClick: async () => {
      clear(err); f.file.clearError();
      if (!f.file.input.value.trim()) { f.file.error('Masukkan pautan atau ID fail.'); return; }
      try {
        await busy(go, () => api('materials.register', { meeting_id: m.id, file: f.file.input.value, type: f.type.input.value, title: f.title.input.value, agenda_id: f.agenda.input.value }));
        modal.close(); toast('Fail didaftarkan.'); reload();
      } catch (e) { err.append(h('div', { class: 'banner banner-danger', role: 'alert' }, icon('alert', 20), h('span', { text: e.message }))); }
    } });
    const modal = openModal({ title: 'Daftar pautan Drive', wide: true, body: h('div', {}, f.file.wrap, f.type.wrap, f.title.wrap, f.agenda.wrap, err), actions: [button('Batal', { kind: 'ghost', onClick: () => modal.close() }), go] });
  }

  async function scan(btn) {
    try {
      const r = await busy(btn, () => api('materials.register', { meeting_id: m.id, scan: true }));
      toast(`${r.added} fail baharu didaftarkan, ${r.already} sudah sedia ada.` + (r.added ? ' Tukar jenis dan tajuk melalui butang edit.' : ''));
      if (r.skipped.length) {
        const mm = openModal({ title: 'Fail dilangkau', body: h('div', {}, h('p', { text: 'Fail berikut tidak didaftarkan:' }), h('ul', { class: 'skip-list' }, r.skipped.map((s) => h('li', { text: `${s.name}: ${s.reason}` })))), actions: [button('Tutup', { kind: 'primary', onClick: () => mm.close() })] });
      }
      if (r.added) reload();
    } catch (e) { toast(e.message, 'error'); }
  }

  function replaceModal(mat) {
    const ff = field({ label: 'Fail versi baharu', required: true });
    const inp = h('input', { type: 'file', class: 'file-input', accept: FILE_ACCEPT, id: 'rep-file' });
    ff.input.replaceWith(inp); ff.wrap.querySelector('label').setAttribute('for', 'rep-file');
    const bar = h('div', { class: 'progress', hidden: true }, h('div'));
    const err = h('div', { 'aria-live': 'polite' });
    const go = button('Ganti', { kind: 'primary', onClick: async () => {
      clear(err); ff.clearError();
      const file = inp.files[0]; if (!file) { ff.error('Pilih fail.'); return; }
      const bad = checkFile(file); if (bad) { ff.error(bad); return; }
      bar.hidden = false;
      try {
        await busy(go, () => sendFile('materials.replace', { id: mat.id }, file, (p) => { bar.firstChild.style.width = Math.round(p * 100) + '%'; }));
        modal.close(); toast(`Versi ${mat.version + 1} dimuat naik.`); reload();
      } catch (e) { bar.hidden = true; err.append(h('div', { class: 'banner banner-danger', role: 'alert' }, icon('alert', 20), h('span', { text: e.message }))); }
    } });
    const modal = openModal({ title: `Ganti versi: ${mat.title}`, body: h('div', {}, h('p', { class: 'muted', text: `Versi semasa v${mat.version}. Versi lama disimpan tetapi disembunyikan daripada ahli.` }), ff.wrap, bar, err), actions: [button('Batal', { kind: 'ghost', onClick: () => modal.close() }), go] });
  }

  function editModal(mat) {
    const locked = RESTRICTED_TYPES.includes(mat.type);
    const f = {
      title: field({ label: 'Tajuk', value: mat.title, maxlength: 200, required: true }),
      type: field({ label: 'Jenis dokumen', value: mat.type, options: locked ? [mat.type] : MATERIAL_TYPES.filter((t) => !RESTRICTED_TYPES.includes(t)), hint: locked ? 'Jenis Bahan Bicara tidak boleh ditukar.' : undefined }),
      agenda: field({ label: 'Item agenda', value: mat.agenda_id, options: agendaOptions(false) })
    };
    if (locked) f.type.input.disabled = true;
    const err = h('div', { 'aria-live': 'polite' });
    const go = button('Simpan', { kind: 'primary', onClick: async () => {
      clear(err); f.title.clearError();
      if (!f.title.input.value.trim()) { f.title.error('Tajuk wajib diisi.'); return; }
      try { await busy(go, () => api('materials.update', { id: mat.id, title: f.title.input.value, type: f.type.input.value, agenda_id: f.agenda.input.value })); modal.close(); toast('Maklumat dikemas kini.'); reload(); }
      catch (e) { err.append(h('div', { class: 'banner banner-danger', role: 'alert' }, icon('alert', 20), h('span', { text: e.message }))); }
    } });
    const modal = openModal({ title: 'Edit maklumat bahan', body: h('div', {}, f.title.wrap, f.type.wrap, f.agenda.wrap, err), actions: [button('Batal', { kind: 'ghost', onClick: () => modal.close() }), go] });
  }

  async function archive(mat) {
    const ok = await confirmDialog({ title: 'Arkibkan bahan', danger: true, confirmLabel: 'Arkibkan', message: `"${mat.title}" tidak lagi dipaparkan kepada ahli. Fail kekal dalam Drive.` });
    if (!ok) return;
    try { await api('materials.archive', { id: mat.id }); toast('Bahan diarkibkan.'); reload(); } catch (e) { toast(e.message, 'error'); }
  }

  // ----- Senarai -----
  function row(mat) {
    const a = agendaById[mat.agenda_id];
    const old = mat.status !== 'Aktif';
    return h('li', { class: 'mat-item' + (old ? ' is-old' : '') },
      h('span', { class: 'mat-ico', 'aria-hidden': 'true', text: EXT_LABEL(mat.file_name).slice(0, 4) }),
      h('div', { class: 'mat-body' },
        h('p', { class: 'mat-title' }, h('a', { href: `#/meetings/${encodeURIComponent(m.id)}/materials/${encodeURIComponent(mat.id)}`, text: mat.title }), ' ',
          mat.version > 1 ? badge('v' + mat.version, 'info') : null, ' ',
          mat.restricted ? badge('Terhad', 'warning') : null, ' ',
          old ? badge(mat.status, 'muted') : null),
        h('p', { class: 'mat-meta' }, h('span', { text: mat.file_name }), mat.size_bytes ? h('span', { text: fmtSize(mat.size_bytes) }) : null,
          a ? h('span', { text: `Item ${a.seq}: ${a.title}` }) : null, h('span', { text: `${mat.uploaded_by_name}, ${fmtDateTime(mat.uploaded_at)}` }))),
      !old && canManage(mat) ? h('div', { class: 'mat-actions' },
        staff ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Edit maklumat ' + mat.title, title: 'Edit maklumat', onClick: () => editModal(mat) }, icon('edit', 20)) : null,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ganti versi ' + mat.title, title: 'Ganti versi', onClick: () => replaceModal(mat) }, icon('upload', 20)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Arkibkan ' + mat.title, title: 'Arkibkan', onClick: () => archive(mat) }, icon('x', 20))) : null);
  }

  function draw() {
    clear(list);
    const items = m.materials.filter((x) => showOld || x.status === 'Aktif');
    if (!items.length) { list.append(emptyState('Tiada bahan lagi', canUpload ? 'Gunakan butang Muat naik di atas.' : undefined)); return; }
    MATERIAL_TYPES.forEach((type) => {
      const group = items.filter((x) => x.type === type);
      if (!group.length) return;
      list.append(h('section', { class: 'mat-group' }, h('h3', {}, type, group.some((x) => x.restricted) ? badge('Pengerusi & Setiausaha sahaja', 'warning') : null), h('ul', { class: 'mat-list' }, group.map(row))));
    });
  }

  // ----- Bar alat -----
  const bar = h('div', { class: 'mat-toolbar' });
  if (canUpload) bar.append(button('Muat naik', { kind: 'primary', iconName: 'upload', onClick: uploadModal }));
  if (staff && open) {
    bar.append(button('Daftar pautan Drive', { kind: 'secondary', onClick: registerModal }));
    const sc = button('Imbas folder Drive', { kind: 'secondary', onClick: () => scan(sc) });
    bar.append(sc);
    if (m.drive_folder_id) bar.append(h('a', { class: 'btn btn-ghost', href: 'https://drive.google.com/drive/folders/' + encodeURIComponent(m.drive_folder_id), target: '_blank', rel: 'noopener noreferrer' }, 'Buka folder Drive'));
  }
  if (staff && m.materials.some((x) => x.status !== 'Aktif')) {
    const cb = h('input', { type: 'checkbox', id: 'show-old' });
    cb.addEventListener('change', () => { showOld = cb.checked; draw(); });
    bar.append(h('span', { class: 'check-row' }, cb, h('label', { for: 'show-old', text: 'Tunjuk versi lama dan arkib' })));
  }
  wrap.append(bar, list);
  if (canUpload) wrap.append(warn());
  if (!staff && myItems.length) wrap.append(h('p', { class: 'muted small', text: 'Anda boleh memuat naik bahan untuk item yang anda bentang sahaja.' }));
  draw();
  return wrap;
}
