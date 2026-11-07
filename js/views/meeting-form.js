// S-05 Borang Mesyuarat: cipta / edit, pilih ahli, sambung daripada mesyuarat lepas, terbit.
import { h, clear, button, busy, field, toast, confirmDialog, errorBanner, skeletonRows, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { getSettings } from '../auth.js';
import { memberPicker } from '../meeting-bits.js';
import { navigate } from '../router.js';

export function render(container, { user, params }) {
  const editing = Boolean(params.id);
  const host = h('div');
  container.append(host);

  async function load() {
    clear(host).append(skeletonRows(5));
    try {
      const [u, ml, cur] = await Promise.all([api('users.list'), api('meetings.list'), editing ? api('meetings.get', { id: params.id }) : null]);
      build(u.users.filter((x) => x.status === undefined || x.status === 'Aktif'), ml.meetings, cur);
    } catch (e) {
      clear(host).append(h('h1', { text: editing ? 'Edit Mesyuarat' : 'Mesyuarat Baharu' }), errorBanner(e.message, load));
    }
  }

  function build(users, meetings, cur) {
    const types = getSettings().meeting_types || [];
    const wasPublished = Boolean(cur && cur.status !== 'Draf');
    const f = {
      title: field({ label: 'Tajuk mesyuarat', value: cur ? cur.title : '', required: true, maxlength: 200 }),
      type: field({ label: 'Jenis mesyuarat', value: cur ? cur.meeting_type : (types[0] || ''), options: types, required: true }),
      series: field({ label: 'Siri / jawatankuasa', value: cur ? cur.series : '', maxlength: 100, hint: 'Pilihan. Digunakan untuk mengumpulkan mesyuarat dalam arkib.' }),
      date: field({ label: 'Tarikh', type: 'date', value: cur ? cur.date : '', required: true }),
      start: field({ label: 'Masa mula', type: 'time', value: cur ? cur.start_time : '09:00', required: true }),
      end: field({ label: 'Masa tamat', type: 'time', value: cur ? cur.end_time : '' }),
      venue: field({ label: 'Lokasi', value: cur ? cur.venue : '', maxlength: 200 }),
      link: field({ label: 'Pautan mesyuarat online', type: 'url', value: cur ? cur.online_link : '', maxlength: 500, hint: 'Pilihan. Mesti bermula dengan https://', placeholder: 'https://' }),
      chair: field({ label: 'Pengerusi', value: cur ? cur.pengerusi_email : '', required: true, hint: 'Mesti dipilih sebelum mesyuarat diterbitkan.',
        options: [{ value: '', label: '- Pilih Pengerusi -' }, ...users.filter((x) => x.role === 'Pengerusi').map((x) => ({ value: x.email, label: x.name + (x.position ? ' (' + x.position + ')' : '') }))] }),
      prev: field({ label: 'Sambung daripada mesyuarat lepas', value: cur ? cur.prev_meeting_id : '',
        hint: 'Pilihan. Menambah item agenda "Pengesahan Minit Mesyuarat Lepas" dan "Perkara Berbangkit".',
        options: [{ value: '', label: 'Tiada' }, ...meetings.filter((x) => (!cur || x.id !== cur.id) && x.status !== 'Dibatalkan').sort((a, b) => b.date.localeCompare(a.date)).map((x) => ({ value: x.id, label: `${fmtDate(x.date)} - ${x.title}` }))] })
    };
    const seriesList = h('datalist', { id: 'series-list' }, [...new Set(meetings.map((x) => x.series).filter(Boolean))].map((s) => h('option', { value: s })));
    f.series.input.setAttribute('list', 'series-list');

    const picker = memberPicker(users, cur ? cur.members.map((x) => x.email) : []);
    picker.setLocked(f.chair.input.value);
    f.chair.input.addEventListener('change', () => { picker.setLocked(f.chair.input.value); picker.clearError(); });

    const notify = h('input', { type: 'checkbox', id: 'notify', checked: cur ? cur.notify_on_publish : true });
    const formErr = h('div', { 'aria-live': 'polite' });

    const saveBtn = button(wasPublished ? 'Simpan perubahan' : 'Simpan Draf', { kind: wasPublished ? 'primary' : 'secondary', type: 'submit' });
    const pubBtn = wasPublished ? null : button('Simpan & Terbitkan', { kind: 'primary', iconName: 'check', onClick: () => submit(true) });
    const cancelBtn = button('Batal', { kind: 'ghost', onClick: () => { location.hash = editing ? '#/meetings/' + encodeURIComponent(params.id) : '#/meetings'; } });

    const form = h('form', { class: 'form form-wide', novalidate: true },
      h('div', { class: 'card section' }, h('h2', { text: 'Maklumat mesyuarat' }),
        f.title.wrap, h('div', { class: 'grid-form' }, f.type.wrap, f.series.wrap, seriesList),
        h('div', { class: 'grid-form grid-3' }, f.date.wrap, f.start.wrap, f.end.wrap),
        f.venue.wrap, f.link.wrap, f.chair.wrap, f.prev.wrap),
      h('div', { class: 'card section' }, h('h2', { text: 'Ahli mesyuarat' }),
        h('p', { class: 'muted small', text: wasPublished ? 'Ahli yang ditambah akan dikongsi akses folder; ahli yang dibuang kehilangan akses fail dan mesyuarat.' : 'Ahli belum nampak mesyuarat dan fail belum dikongsi sehingga diterbitkan.' }),
        picker.el),
      h('div', { class: 'card section' }, h('h2', { text: 'Pemberitahuan' }),
        h('div', { class: 'check-row' }, notify, h('label', { for: 'notify', text: 'Hantar emel jemputan kepada ahli semasa diterbitkan' }))),
      formErr,
      h('div', { class: 'form-actions' }, cancelBtn, saveBtn, pubBtn));

    clear(host).append(
      h('p', { class: 'back' }, h('a', { href: editing ? '#/meetings/' + encodeURIComponent(params.id) : '#/meetings' }, icon('prev', 16), editing ? ' Kembali ke butiran' : ' Semua mesyuarat')),
      h('h1', { text: editing ? 'Edit Mesyuarat' : 'Mesyuarat Baharu' }), form);

    form.addEventListener('submit', (e) => { e.preventDefault(); submit(false); });

    function validate(forPublish) {
      Object.values(f).forEach((x) => x.clearError()); picker.clearError();
      let first = null;
      const bad = (fld, msg) => { fld.error(msg); first = first || fld.input; };
      if (!f.title.input.value.trim()) bad(f.title, 'Tajuk wajib diisi.');
      if (!f.type.input.value) bad(f.type, 'Pilih jenis mesyuarat.');
      if (!f.date.input.value) bad(f.date, 'Tarikh wajib diisi.');
      if (!f.start.input.value) bad(f.start, 'Masa mula wajib diisi.');
      if (f.end.input.value && f.start.input.value && f.end.input.value <= f.start.input.value) bad(f.end, 'Masa tamat mesti selepas masa mula.');
      const link = f.link.input.value.trim();
      if (link && !/^https:\/\/\S+$/i.test(link)) bad(f.link, 'Pautan mesti bermula dengan https://');
      if (forPublish) {
        if (!f.chair.input.value) bad(f.chair, 'Pilih Pengerusi sebelum menerbitkan.');
        const others = picker.getSelected().filter((x) => x !== f.chair.input.value);
        if (!others.length) { picker.error('Pilih sekurang-kurangnya 1 ahli (selain Pengerusi) sebelum menerbitkan.'); first = first || picker.el.querySelector('input'); }
      }
      if (first) first.focus();
      return !first;
    }

    async function submit(publish) {
      clear(formErr);
      if (!validate(publish)) return;
      if (publish) {
        const ok = await confirmDialog({ title: 'Terbitkan mesyuarat', confirmLabel: 'Simpan & Terbitkan', message: 'Ahli akan dapat melihat mesyuarat dan dikongsi akses folder fail.' + (notify.checked ? ' Emel jemputan akan dihantar.' : '') });
        if (!ok) return;
      }
      const payload = {
        title: f.title.input.value, meeting_type: f.type.input.value, series: f.series.input.value, date: f.date.input.value,
        start_time: f.start.input.value, end_time: f.end.input.value, venue: f.venue.input.value, online_link: f.link.input.value,
        pengerusi_email: f.chair.input.value, prev_meeting_id: f.prev.input.value, notify_on_publish: notify.checked,
        members: picker.getSelected()
      };
      const btn = publish ? pubBtn : saveBtn;
      let id = params.id;
      try {
        await busy(btn, async () => {
          if (editing) { const r = await api('meetings.update', { ...payload, id }); notifyDrive(r); }
          else id = (await api('meetings.create', payload)).id;
        });
      } catch (e) { formErr.append(errorBanner(e.message)); return; }
      if (publish) {
        try {
          const r = await busy(btn, () => api('meetings.publish', { id }));
          toast('Mesyuarat diterbitkan.'); notifyDrive(r);
        } catch (e) { toast('Draf disimpan tetapi gagal diterbitkan: ' + e.message, 'error'); }
      } else toast(editing ? 'Perubahan disimpan.' : 'Draf disimpan.');
      navigate('/meetings/' + encodeURIComponent(id));
    }
  }

  function notifyDrive(r) {
    if (r && r.driveFailures && r.driveFailures.length) toast('Akses fail tidak dapat dikongsi kepada: ' + r.driveFailures.join(', ') + '. Pastikan emel itu akaun Google.', 'error');
  }
  load();
}
