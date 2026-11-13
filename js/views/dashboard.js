// S-02 Dashboard: mesyuarat akan datang. (Bahan baharu: Fasa 3. Tindakan tertunggak: Fasa 5. Banner pasang app: Fasa 6.)
import { h, clear, button, badge, emptyState, errorBanner, skeletonRows, todayMyt } from '../ui.js';
import { api } from '../api.js';
import { installMode, promptInstall, dismissInstall, onChange } from '../pwa.js';
import { listMeetings } from '../offline.js';
import { fmtDate } from '../ui.js';
import { meetingCard } from '../meeting-bits.js';

export function render(container, { user }) {
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  const host = h('div');
  const installHost = h('div');
  function drawInstall() {
    clear(installHost);
    const mode = installMode();
    if (!mode) return;
    installHost.append(h('div', { class: 'install-banner', role: 'region', 'aria-label': 'Pasang aplikasi' },
      h('p', {}, h('strong', { text: 'Pasang SyuraDocs pada peranti ini. ' }),
        h('span', { text: mode === 'ios' ? 'Ketik butang Kongsi pada Safari, kemudian pilih "Tambah ke Skrin Utama".' : 'Buka lebih pantas terus daripada skrin utama, tanpa bar alamat.' })),
      h('div', { class: 'install-actions' },
        mode === 'prompt' ? button('Pasang', { kind: 'primary', onClick: () => promptInstall() }) : null,
        button('Tutup', { kind: 'ghost', onClick: dismissInstall }))));
  }
  onChange(drawInstall);
  container.append(
    h('h1', { text: 'Dashboard' }),
    h('p', { class: 'lead' }, 'Selamat datang, ', h('strong', { text: user.name }), '. ', badge(user.role, 'info')),
    installHost, host);
  drawInstall();

  async function load() {
    clear(host).append(skeletonRows(3));
    let meetings;
    try { meetings = (await api('meetings.list')).meetings; }
    catch (e) {
      clear(host).append(errorBanner('Tidak dapat sambung ke server. ' + e.message, load));
      // F-13: agenda yang pernah dibuka masih boleh dibaca luar talian
      const saved = e.code === 0 ? listMeetings(user.email) : [];
      if (saved.length) host.append(h('section', { class: 'card section' }, h('h2', { text: 'Tersedia luar talian' }),
        h('p', { class: 'muted small', text: 'Agenda mesyuarat yang pernah anda buka.' }),
        h('ul', { class: 'offline-list' }, saved.map((s) => h('li', {}, h('a', { href: '#/meetings/' + encodeURIComponent(s.id), text: `${s.title}${s.bil ? ` Bil.${s.bil}/${s.tahun}` : ''} (${fmtDate(s.date)})` }))))));
      return;
    }

    const today = todayMyt();
    const upcoming = meetings
      .filter((m) => m.status === 'Sedang Berlangsung' || (m.status === 'Dijadualkan' && m.date >= today))
      .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
    const drafts = staff ? meetings.filter((m) => m.status === 'Draf').sort((a, b) => a.date.localeCompare(b.date)) : [];

    clear(host).append(
      h('section', { class: 'card section' }, h('h2', { text: 'Mesyuarat akan datang' }),
        upcoming.length
          ? h('div', { class: 'mcard-list' }, upcoming.slice(0, 5).map((m) => meetingCard(m, { showAttendance: true })))
          : emptyState('Tiada mesyuarat akan datang'),
        upcoming.length > 5 || upcoming.length ? h('p', {}, h('a', { href: '#/meetings', text: 'Lihat semua mesyuarat' })) : null),
      drafts.length ? h('section', { class: 'card section' }, h('h2', { text: 'Draf anda' }),
        h('p', { class: 'muted small', text: 'Draf belum kelihatan kepada ahli sehingga diterbitkan.' }),
        h('div', { class: 'mcard-list' }, drafts.slice(0, 5).map((m) => meetingCard(m)))) : null,
      staff ? h('section', { class: 'card section' }, h('h2', { text: 'Tindakan tertunggak' }), emptyState('Tiada tindakan tertunggak')) : null);
  }
  load();
}
