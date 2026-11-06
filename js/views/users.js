// S-13 Pengurusan Pengguna (Admin sahaja). Server tetap menyemak role.
import { h, clear, button, busy, badge, field, openModal, confirmDialog, toast, emptyState, errorBanner, skeletonRows, fmtDateTime } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const ROLES = ['Admin', 'Setiausaha', 'Pengerusi', 'Ahli'];
const PAGE = 20;

export function render(container, { user }) {
  let users = [], q = '', statusFilter = 'Semua', page = 1;
  const listHost = h('div');

  const search = h('input', { class: 'input', type: 'search', id: 'user-q', placeholder: 'Cari nama atau emel', 'aria-label': 'Cari pengguna', autocomplete: 'off' });
  const filter = h('select', { class: 'input', 'aria-label': 'Tapis status' }, ['Semua', 'Aktif', 'Tidak Aktif'].map((s) => h('option', { value: s, text: s })));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); page = 1; draw(); });
  filter.addEventListener('change', () => { statusFilter = filter.value; page = 1; draw(); });

  container.append(
    h('div', { class: 'page-head' }, h('h1', { text: 'Pengurusan Pengguna' }),
      h('div', { class: 'page-actions' },
        button('Import Senarai', { kind: 'secondary', iconName: 'upload', onClick: openImport }),
        button('Tambah Pengguna', { kind: 'primary', iconName: 'plus', onClick: () => openForm(null) }))),
    h('div', { class: 'toolbar' }, search, filter),
    listHost);

  async function load() {
    clear(listHost).append(skeletonRows(6));
    try {
      users = (await api('users.list')).users;
      draw();
    } catch (e) {
      clear(listHost).append(errorBanner(e.message, load));
    }
  }

  function visible() {
    return users.filter((u) =>
      (statusFilter === 'Semua' || u.status === statusFilter) &&
      (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  }

  function draw() {
    const all = visible();
    clear(listHost);
    if (!all.length) { listHost.append(emptyState('Tiada pengguna dijumpai', 'Cuba ubah carian atau penapis.')); return; }
    const pages = Math.ceil(all.length / PAGE);
    page = Math.min(page, pages);
    const rows = all.slice((page - 1) * PAGE, page * PAGE);

    const td = (label, ...kids) => h('td', { 'data-label': label }, ...kids);
    const table = h('table', { class: 'table' },
      h('caption', { class: 'sr-only', text: 'Senarai pengguna' }),
      h('thead', {}, h('tr', {}, ['Nama', 'Emel', 'Jawatan', 'Role', 'Status', 'Log masuk terakhir', 'Tindakan'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, rows.map((u) => {
        const self = u.email === user.email;
        return h('tr', {},
          td('Nama', h('strong', { text: u.name }), self ? h('span', { class: 'muted', text: ' (anda)' }) : null),
          td('Emel', u.email),
          td('Jawatan', u.position || '-'),
          td('Role', u.role),
          td('Status', u.status === 'Aktif' ? badge('Aktif', 'success') : badge('Tidak Aktif', 'muted')),
          td('Log masuk terakhir', fmtDateTime(u.last_login) || '-'),
          td('Tindakan', h('div', { class: 'row-actions' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Edit ' + u.name, title: 'Edit', onClick: () => openForm(u) }, icon('edit', 20)),
            u.status === 'Aktif'
              ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nyahaktif ' + u.name, title: 'Nyahaktif', onClick: () => deactivate(u) }, icon('userX', 20))
              : h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Aktifkan ' + u.name, title: 'Aktifkan', onClick: () => reactivate(u) }, icon('userCheck', 20)))));
      })));
    listHost.append(h('div', { class: 'table-wrap' }, table));

    if (pages > 1) {
      listHost.append(h('nav', { class: 'pager', 'aria-label': 'Halaman' },
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: page === 1, onClick: () => { page--; draw(); } }, icon('prev', 18), h('span', { text: 'Sebelum' })),
        h('span', { text: `Halaman ${page} / ${pages} (${all.length} pengguna)` }),
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: page === pages, onClick: () => { page++; draw(); } }, h('span', { text: 'Seterusnya' }), icon('next', 18))));
    }
  }

  function openForm(u) {
    const editing = Boolean(u);
    const f = {
      email: field({ label: 'Emel Google', type: 'email', value: u ? u.email : '', required: true, readOnly: editing, hint: editing ? 'Emel tidak boleh diubah.' : 'Mesti emel yang digunakan untuk log masuk Google.', autocomplete: 'off' }),
      name: field({ label: 'Nama', value: u ? u.name : '', required: true, maxlength: 100 }),
      position: field({ label: 'Jawatan / jabatan', value: u ? u.position : '', maxlength: 120 }),
      role: field({ label: 'Role', value: u ? u.role : 'Ahli', options: ROLES, required: true }),
      status: field({ label: 'Status', value: u ? u.status : 'Aktif', options: ['Aktif', 'Tidak Aktif'] })
    };
    const formErr = h('div', { 'aria-live': 'polite' });
    const body = h('form', { class: 'form', novalidate: true }, Object.values(f).map((x) => x.wrap), formErr);
    const save = button('Simpan', { kind: 'primary', type: 'submit' });
    const m = openModal({ title: editing ? 'Edit Pengguna' : 'Tambah Pengguna', body, actions: [button('Batal', { kind: 'ghost', onClick: () => m.close() }), save] });
    save.addEventListener('click', (e) => { e.preventDefault(); body.requestSubmit(); });
    body.addEventListener('submit', async (e) => {
      e.preventDefault();
      clear(formErr);
      Object.values(f).forEach((x) => x.clearError());
      let bad = false;
      if (!f.email.input.value.trim()) { f.email.error('Emel wajib diisi.'); bad = true; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.input.value.trim())) { f.email.error('Format emel tidak sah.'); bad = true; }
      if (!f.name.input.value.trim()) { f.name.error('Nama wajib diisi.'); bad = true; }
      if (bad) return;
      try {
        const r = await busy(save, () => api('users.save', {
          email: f.email.input.value, name: f.name.input.value, position: f.position.input.value,
          role: f.role.input.value, status: f.status.input.value
        }));
        m.close();
        toast(r.created ? 'Pengguna ditambah.' : 'Pengguna dikemas kini.');
        load();
      } catch (err) { formErr.append(errorBanner(err.message)); }
    });
  }

  async function deactivate(u) {
    const ok = await confirmDialog({
      title: 'Nyahaktif pengguna', danger: true, confirmLabel: 'Nyahaktif',
      message: `${u.name} (${u.email}) tidak lagi boleh log masuk dan akses fail mesyuarat akan ditarik balik.`
    });
    if (!ok) return;
    try { await api('users.deactivate', { email: u.email }); toast('Pengguna dinyahaktifkan.'); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function reactivate(u) {
    try {
      await api('users.save', { email: u.email, name: u.name, position: u.position, role: u.role, status: 'Aktif' });
      toast('Pengguna diaktifkan semula.'); load();
    } catch (e) { toast(e.message, 'error'); }
  }

  function openImport() {
    const ta = field({
      label: 'Senarai pengguna', rows: 8, required: true,
      hint: 'Satu baris satu pengguna: emel, nama, jawatan, role. Boleh tampal terus dari Excel. Role kosong = Ahli. Pengguna yang sudah wujud dilangkau.',
      placeholder: 'ahmad@contoh.com, Ahmad bin Ali, Pegawai Perubatan, Ahli'
    });
    const result = h('div', { 'aria-live': 'polite' });
    const go = button('Import', { kind: 'primary', onClick: async () => {
      clear(result);
      if (!ta.input.value.trim()) { ta.error('Tampal sekurang-kurangnya satu baris.'); return; }
      ta.clearError();
      try {
        const r = await busy(go, () => api('users.import', { text: ta.input.value }));
        result.append(h('div', { class: 'banner banner-ok' }, icon('check', 20), h('span', { text: `${r.added} pengguna ditambah, ${r.skipped.length} dilangkau.` })));
        if (r.skipped.length) result.append(h('ul', { class: 'skip-list' }, r.skipped.map((s) => h('li', { text: `Baris ${s.line}: ${s.reason}` }))));
        if (r.added) load();
      } catch (e) { result.append(errorBanner(e.message)); }
    } });
    const m = openModal({ title: 'Import Senarai Pengguna', wide: true, body: h('div', {}, ta.wrap, result), actions: [button('Tutup', { kind: 'ghost', onClick: () => m.close() }), go] });
  }

  load();
}
