// S-02 Dashboard: mesyuarat akan datang. (Bahan baharu: Fasa 3. Tindakan tertunggak: Fasa 5. Banner pasang app: Fasa 6.)
import { h, clear, badge, emptyState, errorBanner, skeletonRows, todayMyt } from '../ui.js';
import { api } from '../api.js';
import { meetingCard } from '../meeting-bits.js';

export function render(container, { user }) {
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  const host = h('div');
  container.append(
    h('h1', { text: 'Dashboard' }),
    h('p', { class: 'lead' }, 'Selamat datang, ', h('strong', { text: user.name }), '. ', badge(user.role, 'info')),
    host);

  async function load() {
    clear(host).append(skeletonRows(3));
    let meetings;
    try { meetings = (await api('meetings.list')).meetings; }
    catch (e) { clear(host).append(errorBanner('Tidak dapat sambung ke server. ' + e.message, load)); return; }

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
      h('section', { class: 'card section' }, h('h2', { text: 'Tindakan tertunggak' }), emptyState('Tiada tindakan tertunggak')));
  }
  load();
}
