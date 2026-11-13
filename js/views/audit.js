// S-14 Audit Log & Tetapan (Admin sahaja). Tab: Audit Log, Log Emel, Tetapan, Backup. Server tetap menyemak role.
import { h, clear, button, busy, badge, field, toast, emptyState, errorBanner, skeletonRows, fmtDateTime, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { refreshSettings } from '../auth.js';

const TABS = [['audit', 'Audit Log'], ['email', 'Log Emel'], ['settings', 'Tetapan'], ['backup', 'Backup']];
const PAGE = 50;
const STATUS_KIND = { Dihantar: 'success', Gagal: 'danger', Dilangkau: 'warning' };
const todayIso = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

export function render(container, { user }) {
  let tab = 'audit';
  const host = h('div');
  const tabBar = h('div', { class: 'tabs sys-tabs', role: 'tablist', 'aria-label': 'Bahagian' });
  container.append(h('h1', { text: 'Audit Log & Tetapan' }), tabBar, host);

  function drawTabs() {
    tabBar.replaceChildren(...TABS.map(([id, label]) => h('button', { type: 'button', role: 'tab', id: 'sys-' + id, class: 'tab' + (id === tab ? ' is-on' : ''), 'aria-selected': id === tab ? 'true' : 'false', onClick: () => { tab = id; drawTabs(); show(); } }, label)));
  }
  function show() { clear(host); ({ audit: auditTab, email: emailTab, settings: settingsTab, backup: backupTab })[tab](); }

  function pager(total, offset, go) {
    const pages = Math.max(1, Math.ceil(total / PAGE)), page = Math.floor(offset / PAGE) + 1;
    return h('nav', { class: 'pager', 'aria-label': 'Halaman' },
      h('button', { class: 'btn btn-ghost', type: 'button', disabled: offset === 0, onClick: () => go(Math.max(0, offset - PAGE)) }, icon('prev', 18), h('span', { text: 'Sebelum' })),
      h('span', { text: `Halaman ${page} / ${pages} (${total} rekod)` }),
      h('button', { class: 'btn btn-ghost', type: 'button', disabled: offset + PAGE >= total, onClick: () => go(offset + PAGE) }, h('span', { text: 'Seterusnya' }), icon('next', 18)));
  }
  const td = (label, cls, ...k) => h('td', { 'data-label': label, class: cls || null }, ...k);
  const sel = (label, options, value, onChange) => { const s = h('select', { class: 'input', 'aria-label': label }, ...options.map(([v, t]) => h('option', { value: v, text: t }))); s.value = value; s.addEventListener('change', () => onChange(s.value)); return s; };

  // ---------- Audit Log ----------
  function auditTab() {
    const f = { email: '', action: '', from: '', to: '' }; let offset = 0, actions = [];
    const bar = h('div', { class: 'toolbar' }), list = h('div');
    host.append(bar, list);
    function drawBar() {
      const email = h('input', { class: 'input', type: 'search', placeholder: 'Cari emel pengguna', 'aria-label': 'Cari emel pengguna', value: f.email });
      const from = h('input', { class: 'input', type: 'date', 'aria-label': 'Dari tarikh', value: f.from }), to = h('input', { class: 'input', type: 'date', 'aria-label': 'Hingga tarikh', value: f.to });
      const act = sel('Tapis tindakan', [['', 'Semua tindakan'], ...actions.map((a) => [a, a])], f.action, (v) => { f.action = v; offset = 0; load(); });
      const apply = () => { f.email = email.value.trim(); f.from = from.value; f.to = to.value; offset = 0; load(); };
      email.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
      from.addEventListener('change', apply); to.addEventListener('change', apply);
      bar.replaceChildren(email, act, from, to, button('Tapis', { kind: 'secondary', onClick: apply }), button('Set semula', { kind: 'ghost', onClick: () => { Object.assign(f, { email: '', action: '', from: '', to: '' }); offset = 0; drawBar(); load(); } }));
    }
    async function load() {
      clear(list).append(skeletonRows(6));
      try {
        const r = await api('audit.list', { ...f, offset, limit: PAGE });
        if (!actions.length) { actions = r.actions; drawBar(); }
        clear(list);
        if (!r.rows.length) { list.append(emptyState('Tiada log dijumpai', 'Cuba ubah penapis.')); return; }
        list.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('caption', { class: 'sr-only', text: 'Audit log' }),
          h('thead', {}, h('tr', {}, ['Masa', 'Pengguna', 'Tindakan', 'Entiti', 'ID', 'Butiran'].map((t) => h('th', { scope: 'col', text: t })))),
          h('tbody', {}, r.rows.map((x) => h('tr', {}, td('Masa', null, fmtDateTime(x.timestamp)), td('Pengguna', 'wrap', x.email), td('Tindakan', null, badge(x.action, /gagal/.test(x.action) ? 'danger' : 'muted')), td('Entiti', null, x.entity || '-'), td('ID', 'mono', x.entity_id || '-'), td('Butiran', 'wrap', x.detail || '-')))))),
          pager(r.total, offset, (o) => { offset = o; load(); }));
      } catch (e) { clear(list).append(errorBanner(e.message, load)); }
    }
    drawBar(); load();
  }

  // ---------- Log Emel ----------
  function emailTab() {
    const f = { type: '', status: '', to: '' }; let offset = 0;
    const stats = h('div', { class: 'stat-row' }), bar = h('div', { class: 'toolbar' }), list = h('div');
    host.append(stats, bar, list);
    const to = h('input', { class: 'input', type: 'search', placeholder: 'Cari emel penerima', 'aria-label': 'Cari emel penerima', value: '' });
    to.addEventListener('keydown', (e) => { if (e.key === 'Enter') { f.to = to.value.trim(); offset = 0; load(); } });
    bar.append(sel('Tapis jenis', [['', 'Semua jenis'], ['invite', 'Jemputan'], ['digest', 'Digest bahan'], ['reminder', 'Peringatan']], '', (v) => { f.type = v; offset = 0; load(); }),
      sel('Tapis status', [['', 'Semua status'], ['Dihantar', 'Dihantar'], ['Gagal', 'Gagal'], ['Dilangkau', 'Dilangkau']], '', (v) => { f.status = v; offset = 0; load(); }), to,
      button('Cari', { kind: 'secondary', onClick: () => { f.to = to.value.trim(); offset = 0; load(); } }));
    async function load() {
      clear(list).append(skeletonRows(6));
      try {
        const r = await api('notifications.list', { ...f, offset, limit: PAGE });
        clear(stats).append(...['Dihantar', 'Gagal', 'Dilangkau'].map((k) => h('div', { class: 'stat' }, h('strong', { text: String(r.counts[k]) }), h('span', { class: 'muted', text: k }))),
          h('div', { class: 'stat' }, h('strong', { text: r.quota_remaining === null ? '-' : String(r.quota_remaining) }), h('span', { class: 'muted', text: 'Baki kuota emel hari ini' })));
        clear(list);
        if (!r.rows.length) { list.append(emptyState('Tiada emel dijumpai')); return; }
        list.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('caption', { class: 'sr-only', text: 'Log emel' }),
          h('thead', {}, h('tr', {}, ['Masa', 'Kepada', 'Jenis', 'Subjek', 'Status', 'Ralat'].map((t) => h('th', { scope: 'col', text: t })))),
          h('tbody', {}, r.rows.map((x) => h('tr', {}, td('Masa', null, fmtDateTime(x.timestamp)), td('Kepada', 'wrap', x.to_email), td('Jenis', null, x.type), td('Subjek', 'wrap', x.subject),
            td('Status', null, badge(x.status, STATUS_KIND[x.status] || 'muted')), td('Ralat', 'wrap', x.error || '-')))))),
          pager(r.total, offset, (o) => { offset = o; load(); }));
      } catch (e) { clear(list).append(errorBanner(e.message, load)); }
    }
    load();
  }

  // ---------- Tetapan ----------
  async function settingsTab() {
    host.append(skeletonRows(5));
    let rows;
    try { rows = (await api('settings.get')).settings; } catch (e) { clear(host).append(errorBanner(e.message, settingsTab)); return; }
    const val = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    let series = []; try { series = JSON.parse(val.meeting_series || '[]'); } catch (e) { series = []; }
    const f = {
      app_name: field({ label: 'Nama sistem', value: val.app_name, maxlength: 60, required: true, hint: 'Muat semula halaman selepas menukar nama.' }),
      app_url: field({ label: 'Alamat sistem (untuk pautan dalam emel)', value: val.app_url, type: 'url', placeholder: 'https://', hint: 'Mesti bermula dengan https://. Tanpa alamat, emel dihantar tanpa pautan.' }),
      meeting_series: field({ label: 'Nama mesyuarat (satu baris satu nama)', value: series.join('\n'), rows: 6, hint: 'Senarai pilihan "Tajuk mesyuarat" pada borang mesyuarat. Maksimum 20.' }),
      reminder_hours_before: field({ label: 'Peringatan sebelum mesyuarat (jam)', type: 'number', value: val.reminder_hours_before, hint: '24 = sehari sebelum, 48 = dua hari sebelum.' }),
      digest_enabled: field({ label: 'Digest emel bahan baharu', value: String(val.digest_enabled).toUpperCase(), options: [{ value: 'TRUE', label: 'Hidup (maksimum sekali sejam)' }, { value: 'FALSE', label: 'Mati' }] }),
      max_upload_mb: field({ label: 'Had muat naik melalui app (MB)', type: 'number', value: val.max_upload_mb, hint: 'Fail lebih besar: letak dalam folder Drive mesyuarat dan guna "Imbas folder Drive".' }),
      backup_keep: field({ label: 'Bilangan salinan backup disimpan', type: 'number', value: val.backup_keep })
    };
    const urlWarn = h('div', { class: 'banner banner-danger small', role: 'alert', hidden: Boolean(val.app_url) }, icon('alert', 18), h('span', { text: 'Alamat sistem belum ditetapkan. Emel jemputan dan peringatan tidak akan mempunyai pautan.' }));
    const useHere = button('Guna alamat semasa', { kind: 'secondary', onClick: () => { f.app_url.input.value = location.origin; } });
    const err = h('div', { 'aria-live': 'polite' });
    const save = button('Simpan tetapan', { kind: 'primary', onClick: async () => {
      clear(err); Object.values(f).forEach((x) => x.clearError());
      const next = { app_name: f.app_name.input.value, app_url: f.app_url.input.value.trim(), meeting_series: f.meeting_series.input.value, reminder_hours_before: f.reminder_hours_before.input.value,
        digest_enabled: f.digest_enabled.input.value, max_upload_mb: f.max_upload_mb.input.value, backup_keep: f.backup_keep.input.value };
      const before = { ...val, meeting_series: series.join('\n') };
      const changed = Object.keys(next).filter((k) => String(next[k]) !== String(before[k] === undefined ? '' : before[k]));
      if (!changed.length) { toast('Tiada perubahan.'); return; }
      let ok = 0, bad = 0;
      await busy(save, async () => {
        for (const k of changed) {
          try { await api('settings.set', { key: k, value: next[k] }); ok++; val[k] = k === 'meeting_series' ? JSON.stringify(next[k].split('\n').map((x) => x.trim()).filter(Boolean)) : next[k]; if (k === 'meeting_series') series = next[k].split('\n').map((x) => x.trim()).filter(Boolean); }
          catch (e) { bad++; f[k].error(e.message); }
        }
      });
      urlWarn.hidden = Boolean(val.app_url);
      if (ok) { try { await refreshSettings(); } catch (e) { /* abaikan */ } toast(`${ok} tetapan disimpan.` + (changed.includes('app_name') ? ' Muat semula halaman untuk melihat nama baharu.' : '')); }
      if (bad) err.append(errorBanner(`${bad} tetapan gagal disimpan. Semak ralat pada medan berkenaan.`));
    } });
    clear(host).append(h('form', { class: 'settings-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      urlWarn, f.app_name.wrap, f.app_url.wrap, h('div', { class: 'inline-actions' }, useHere), h('div', { class: 'section' }),
      f.meeting_series.wrap, f.reminder_hours_before.wrap, f.digest_enabled.wrap, f.max_upload_mb.wrap, f.backup_keep.wrap, err, h('div', { class: 'form-actions' }, save),
      h('h2', { text: 'Maklumat sistem (baca sahaja)' }),
      h('dl', { class: 'meta' }, h('div', { class: 'meta-row' }, h('dt', { text: 'Zon masa' }), h('dd', { text: val.timezone || '-' })), h('div', { class: 'meta-row' }, h('dt', { text: 'Jenis fail dibenarkan' }), h('dd', { text: val.allowed_mime || '-' })))));
  }

  // ---------- Backup ----------
  async function backupTab() {
    const list = h('div'); const info = h('p', { class: 'muted small' });
    const run = button('Backup sekarang', { kind: 'primary', iconName: 'upload', onClick: async () => {
      try { const r = await busy(run, () => api('backup.run')); toast(`Salinan ${r.name} dicipta.` + (r.removed ? ` ${r.removed} salinan lama dibuang.` : '')); load(); } catch (e) { toast(e.message, 'error'); }
    } });
    host.append(h('div', { class: 'page-head' }, h('h2', { text: 'Salinan pangkalan data' }), run),
      h('p', { class: 'muted', text: 'Salinan Sheet dibuat setiap Ahad pukul 02:00 dan boleh dibuat manual di sini. Salinan disimpan dalam folder "SyuraDocs Backup" di Drive pemilik, di luar folder yang dikongsi kepada Setiausaha atau ahli.' }), info, list,
      h('div', { class: 'banner banner-info small' }, icon('info', 18), h('span', { text: 'Fail dalam Drive (bahan mesyuarat) tidak disalin oleh sistem. Disyorkan Admin menyalin folder "Mesyuarat" secara manual ke lokasi lain setiap suku tahun.' })));
    async function load() {
      clear(list).append(skeletonRows(3));
      try {
        const r = await api('backup.list'); info.textContent = `${r.backups.length} salinan (disimpan sehingga ${r.keep} terkini).`; clear(list);
        if (!r.backups.length) { list.append(emptyState('Belum ada salinan', 'Tekan "Backup sekarang" untuk membuat salinan pertama.')); return; }
        list.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('caption', { class: 'sr-only', text: 'Senarai salinan' }),
          h('thead', {}, h('tr', {}, ['Nama', 'Dicipta', 'Saiz'].map((t) => h('th', { scope: 'col', text: t })))),
          h('tbody', {}, r.backups.map((b) => h('tr', {}, td('Nama', 'mono', b.name), td('Dicipta', null, fmtDateTime(b.created_at)), td('Saiz', null, b.size_bytes ? Math.max(1, Math.round(b.size_bytes / 1024)) + ' KB' : '-')))))));
      } catch (e) { clear(list).append(errorBanner(e.message, load)); }
    }
    load();
  }

  drawTabs(); show();
}
