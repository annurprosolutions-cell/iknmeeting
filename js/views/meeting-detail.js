// S-04 Butiran Mesyuarat: tab Agenda, Bahan, Ahli & Kehadiran, Minit, Tindakan.
import { h, clear, button, busy, badge, toast, confirmDialog, emptyState, errorBanner, skeletonRows, meetingStatusBadge, attendanceBadge, fmtDate, fmtDateTime, weekday, fmtTimeRange } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const TABS = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'materials', label: 'Bahan' },
  { id: 'members', label: 'Ahli & Kehadiran' },
  { id: 'minutes', label: 'Minit' },
  { id: 'actions', label: 'Tindakan' }
];
const SOON = {
  materials: ['Tiada bahan lagi', 'Bahan mesyuarat dibina pada Fasa 3.'],
  minutes: ['Minit belum tersedia', 'Skrin minit dibina pada Fasa 5.'],
  actions: ['Tiada tindakan', 'Tindakan susulan dibina pada Fasa 5.']
};
const CAT_KIND = { Makluman: 'info', Perbincangan: 'teal', Keputusan: 'warning', Pengesahan: 'success' };

export function render(container, { user, params }) {
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  let m = null, tab = 'agenda';
  const host = h('div');
  container.append(host);

  async function load() {
    clear(host).append(skeletonRows(4));
    try { m = await api('meetings.get', { id: params.id }); }
    catch (e) {
      const forbidden = e.code === 403 || e.code === 404;
      clear(host).append(h('h1', { text: 'Butiran Mesyuarat' }),
        forbidden ? h('section', { class: 'card' }, emptyState(e.code === 403 ? 'Anda tidak dijemput ke mesyuarat ini' : 'Mesyuarat tidak dijumpai'), h('p', { class: 'center' }, h('a', { href: '#/meetings', text: 'Kembali ke senarai mesyuarat' })))
          : errorBanner(e.message, load));
      return;
    }
    draw();
  }

  const canEdit = () => staff && m.status !== 'Dibatalkan' && (m.status !== 'Selesai' || user.role === 'Admin');

  function header() {
    const actions = [];
    if (canEdit()) actions.push(button('Edit', { kind: 'secondary', iconName: 'edit', onClick: () => { location.hash = `#/meetings/${encodeURIComponent(m.id)}/edit`; } }));
    if (staff && m.status === 'Draf') actions.push(button('Terbitkan', { kind: 'primary', iconName: 'check', onClick: (e) => publish(e.currentTarget) }));
    if (staff && ['Draf', 'Dijadualkan'].includes(m.status)) actions.push(button('Batalkan', { kind: 'ghost', onClick: cancel }));
    const meta = (label, ...v) => h('div', { class: 'meta-row' }, h('dt', { text: label }), h('dd', {}, ...v));
    return h('section', { class: 'card detail-head' },
      h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'small muted', text: [m.meeting_type, m.series].filter(Boolean).join(' · ') }), h('h1', { text: m.title })), meetingStatusBadge(m.status)),
      h('dl', { class: 'meta' },
        meta('Tarikh', `${weekday(m.date)}, ${fmtDate(m.date)}`),
        meta('Masa', fmtTimeRange(m.start_time, m.end_time)),
        m.venue ? meta('Lokasi', m.venue) : null,
        m.online_link ? meta('Pautan online', h('a', { href: m.online_link, target: '_blank', rel: 'noopener noreferrer', text: m.online_link })) : null,
        meta('Pengerusi', m.pengerusi_name || (m.pengerusi_email ? m.pengerusi_email : 'Belum ditetapkan')),
        m.prev_meeting ? meta('Bersambung daripada', h('a', { href: '#/meetings/' + encodeURIComponent(m.prev_meeting.id), text: `${m.prev_meeting.title} (${fmtDate(m.prev_meeting.date)})` })) : null),
      m.status === 'Draf' && staff ? h('p', { class: 'banner banner-info small' }, icon('info', 18), h('span', { text: 'Draf: belum kelihatan kepada ahli dan fail belum dikongsi sehingga diterbitkan.' })) : null,
      actions.length ? h('div', { class: 'page-actions' }, actions) : null);
  }

  async function publish(btn) {
    const ok = await confirmDialog({ title: 'Terbitkan mesyuarat', confirmLabel: 'Terbitkan', message: 'Ahli akan dapat melihat mesyuarat ini dan dikongsi akses folder fail.' + (m.notify_on_publish ? ' Emel jemputan akan dihantar.' : '') });
    if (!ok) return;
    try {
      const r = await busy(btn, () => api('meetings.publish', { id: m.id }));
      toast('Mesyuarat diterbitkan.');
      if (r.driveFailures && r.driveFailures.length) toast('Akses fail tidak dapat dikongsi kepada: ' + r.driveFailures.join(', ') + '. Pastikan emel itu akaun Google.', 'error');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function cancel() {
    const ok = await confirmDialog({ title: 'Batalkan mesyuarat', danger: true, confirmLabel: 'Batalkan mesyuarat', message: 'Mesyuarat ditandakan Dibatalkan dan akses fail ahli ditarik balik. Tindakan ini tidak boleh diundur.' });
    if (!ok) return;
    try { await api('meetings.cancel', { id: m.id }); toast('Mesyuarat dibatalkan.'); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  // ----- Tab -----
  function agendaPanel() {
    if (!m.agenda.length) return emptyState('Agenda belum disediakan', staff ? 'Editor agenda dibina pada Fasa 3.' : undefined);
    return h('ol', { class: 'agenda-list' }, m.agenda.map((a) => h('li', { class: 'agenda-item' },
      h('span', { class: 'agenda-seq', text: String(a.seq) }),
      h('div', { class: 'agenda-body' },
        h('p', { class: 'agenda-title', text: a.title }),
        a.description ? h('p', { class: 'muted small', text: a.description }) : null,
        h('div', { class: 'agenda-meta' }, badge(a.category, CAT_KIND[a.category] || 'muted'),
          a.presenter_name ? h('span', { class: 'small muted', text: 'Pembentang: ' + a.presenter_name }) : null,
          a.duration_min ? h('span', { class: 'small muted', text: a.duration_min + ' min' }) : null)))));
  }

  function membersPanel() {
    const wrap = h('div');
    const open = ['Dijadualkan', 'Sedang Berlangsung'].includes(m.status);
    const isMember = Boolean(m.my_attendance);
    if (isMember) {
      const grp = h('div', { class: 'seg', role: 'group', 'aria-label': 'Kehadiran anda' });
      ['Hadir', 'Tidak Hadir', 'Mungkin'].forEach((v) => grp.append(h('button', {
        type: 'button', class: 'seg-btn' + (m.my_attendance === v ? ' is-on' : ''), 'aria-pressed': m.my_attendance === v ? 'true' : 'false', disabled: !open,
        onClick: async (e) => {
          try { await busy(e.currentTarget, () => api('attendance.set', { meeting_id: m.id, attendance: v })); toast('Kehadiran dikemas kini.'); load(); }
          catch (err) { toast(err.message, 'error'); }
        }
      }, v)));
      wrap.append(h('div', { class: 'att-mine' }, h('h3', { text: 'Kehadiran anda' }), grp,
        !open ? h('p', { class: 'muted small', text: m.status === 'Draf' ? 'Kehadiran dibuka selepas mesyuarat diterbitkan.' : 'Kehadiran tidak boleh diubah lagi.' }) : null));
    }
    const count = (v) => m.members.filter((x) => x.attendance === v).length;
    wrap.append(h('p', { class: 'muted', text: `${m.members.length} ahli: ${count('Hadir')} hadir, ${count('Tidak Hadir')} tidak hadir, ${count('Mungkin')} mungkin, ${count('Belum Jawab')} belum jawab.` }));
    if (staff && canEdit()) wrap.append(h('p', {}, button('Urus ahli', { kind: 'secondary', iconName: 'users', onClick: () => { location.hash = `#/meetings/${encodeURIComponent(m.id)}/edit`; } })));
    const td = (label, ...k) => h('td', { 'data-label': label }, ...k);
    wrap.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('caption', { class: 'sr-only', text: 'Senarai ahli dan kehadiran' }),
      h('thead', {}, h('tr', {}, ['Nama', 'Jawatan', 'Kehadiran', 'Dikemas kini'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, m.members.map((x) => h('tr', {},
        td('Nama', h('strong', { text: x.name }), x.is_chair ? h('span', { class: 'muted', text: ' (Pengerusi)' }) : null),
        td('Jawatan', x.position || '-'), td('Kehadiran', attendanceBadge(x.attendance)), td('Dikemas kini', fmtDateTime(x.attendance_at) || '-')))))));
    return wrap;
  }

  function panel() {
    if (tab === 'agenda') return agendaPanel();
    if (tab === 'members') return membersPanel();
    return emptyState(SOON[tab][0], SOON[tab][1]);
  }

  function draw() {
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Bahagian mesyuarat' });
    TABS.forEach((t) => {
      const b = h('button', { type: 'button', role: 'tab', id: 'tab-' + t.id, class: 'tab' + (t.id === tab ? ' is-on' : ''), 'aria-selected': t.id === tab ? 'true' : 'false', 'aria-controls': 'tabpanel', tabindex: t.id === tab ? '0' : '-1',
        onClick: () => { tab = t.id; draw(); document.getElementById('tab-' + t.id).focus(); } }, t.label);
      b.addEventListener('keydown', (e) => {
        const i = TABS.findIndex((x) => x.id === tab);
        const j = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
        if (j >= 0) { e.preventDefault(); tab = TABS[j].id; draw(); document.getElementById('tab-' + tab).focus(); }
      });
      tabs.append(b);
    });
    clear(host).append(
      h('p', { class: 'back' }, h('a', { href: '#/meetings' }, icon('prev', 16), ' Semua mesyuarat')),
      header(), tabs,
      h('section', { class: 'card tabpanel', id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-' + tab }, panel()));
  }
  load();
}
