// S-09 Mod Mesyuarat: tiga lajur (agenda | penonton bahan | komen & nota). Item semasa disegerakkan melalui polling (cache sahaja).
import { h, clear, append, button, busy, badge, confirmDialog, toast, emptyState, errorBanner, meetingStatusBadge, skeletonRows } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { commentsPanel } from '../comments-panel.js';
import { notesPanel } from '../notes.js';

const POLL_MS = Number(window.__EMI_POLL_MS) || 20000; // 20 saat (TRD seksyen 7); boleh dilaras untuk ujian
const STATUS_KIND = { Belum: 'muted', 'Sedang Dibincang': 'teal', Selesai: 'success', Ditangguh: 'warning' };

export function render(container, { user, params }) {
  const host = h('div', { class: 'live-root' });
  container.append(host);
  let destroyed = false, m = null, cur = '', selected = '', following = true, selMat = '', fbrev = null, online = true;
  let lastSig = '', timer = null, wake = null, comments = null, notes = null, sideTab = 'comments', allComments = false, panel = '';
  const opened = new Set();
  const els = {};

  const lc = (e) => String(e || '').trim().toLowerCase();
  const staff = user.role === 'Admin' || user.role === 'Setiausaha';
  const controller = () => staff || lc(m.pengerusi_email) === lc(user.email);
  const agendaById = () => Object.fromEntries(m.agenda.map((a) => [a.id, a]));
  const item = () => m.agenda.find((a) => a.id === selected) || null;
  const live = () => m.status === 'Sedang Berlangsung';

  async function load() {
    clear(host).append(skeletonRows(4));
    try { m = await api('meetings.get', { id: params.id }); }
    catch (e) { clear(host).append(h('div', { class: 'live-msg' }, e.code === 403 ? emptyState('Anda tidak dijemput ke mesyuarat ini') : errorBanner(e.message, load), h('p', {}, h('a', { href: '#/meetings', text: 'Kembali ke senarai mesyuarat' })))); return; }
    if (!['Dijadualkan', 'Sedang Berlangsung', 'Selesai'].includes(m.status)) {
      clear(host).append(h('div', { class: 'live-msg' }, emptyState(m.status === 'Draf' ? 'Mesyuarat ini masih Draf' : 'Mesyuarat ini telah dibatalkan', 'Mod Mesyuarat hanya tersedia selepas mesyuarat diterbitkan.'), h('p', {}, h('a', { href: '#/meetings/' + encodeURIComponent(m.id), text: 'Kembali ke butiran' })))); return;
    }
    cur = m.current_agenda_id || '';
    selected = cur || (m.agenda[0] ? m.agenda[0].id : '');
    build();
    startPolling(); acquireWake();
  }

  // ---------- Bina rangka ----------
  function build() {
    els.banner = h('div', { class: 'live-banner', role: 'status', hidden: true }, icon('wifiOff', 18), h('span', { text: 'Talian terputus. Paparan terakhir dikekalkan; sedang mencuba semula…' }));
    els.status = h('span', {});
    els.ctrl = h('div', { class: 'live-ctrl' });
    els.left = h('aside', { class: 'live-left', 'aria-label': 'Agenda' });
    els.center = h('main', { class: 'live-center', 'aria-label': 'Bahan' });
    els.right = h('aside', { class: 'live-right', 'aria-label': 'Komen dan nota' });
    els.fs = button('', { kind: 'ghost', iconName: 'maximize', ariaLabel: 'Skrin penuh', onClick: toggleFs });
    const bar = h('header', { class: 'live-bar' },
      h('a', { class: 'btn btn-ghost', href: '#/meetings/' + encodeURIComponent(m.id), 'aria-label': 'Keluar daripada Mod Mesyuarat' }, icon('prev', 18), h('span', { text: 'Keluar' })),
      h('div', { class: 'live-title' }, h('strong', { text: m.title }), h('span', { class: 'muted small', text: m.bil ? `Bil.${m.bil}/${m.tahun}` : '' })),
      els.status, els.ctrl,
      h('button', { class: 'btn btn-secondary live-toggle live-toggle-left', type: 'button', onClick: () => togglePanel('left') }, icon('list', 18), h('span', { text: 'Agenda' })),
      h('button', { class: 'btn btn-secondary live-toggle live-toggle-right', type: 'button', onClick: () => togglePanel('right') }, icon('message', 18), h('span', { text: 'Komen' })),
      els.fs);
    els.shell = h('div', { class: 'live' }, bar, els.banner, h('div', { class: 'live-grid' }, els.left, els.center, els.right));
    clear(host).append(els.shell);
    notes = notesPanel({ user, meetingId: m.id });
    drawAll(); drawRight();
  }

  function togglePanel(which) { panel = panel === which ? '' : which; els.shell.dataset.panel = panel; }

  // ---------- Lukis ----------
  function drawAll() { drawStatus(); drawLeft(); drawCenter(); }

  function drawStatus() {
    els.status.replaceChildren(meetingStatusBadge(m.status));
    clear(els.ctrl);
    if (!controller()) return;
    if (m.status === 'Dijadualkan') els.ctrl.append(button('Mula mesyuarat', { kind: 'primary', iconName: 'play', onClick: (e) => startMeeting(e.currentTarget) }));
    if (m.status === 'Sedang Berlangsung') els.ctrl.append(button('Tamat mesyuarat', { kind: 'danger', iconName: 'stop', onClick: (e) => endMeeting(e.currentTarget) }));
  }

  function drawLeft() {
    clear(els.left).append(h('h2', { class: 'live-h', text: 'Agenda' }));
    if (!m.agenda.length) { els.left.append(emptyState('Agenda belum disediakan')); return; }
    els.left.append(h('ol', { class: 'live-agenda' }, m.agenda.map((a) => h('li', {},
      h('button', { type: 'button', class: 'live-item' + (a.id === selected ? ' is-selected' : '') + (a.id === cur ? ' is-current' : ''), 'aria-current': a.id === selected ? 'true' : null, onClick: () => select(a.id, true) },
        h('span', { class: 'agenda-seq', text: String(a.seq) }),
        h('span', { class: 'live-item-body' }, h('span', { class: 'live-item-title', text: a.title }),
          h('span', { class: 'live-item-badges' }, a.id === cur && live() ? badge('Item semasa', 'teal') : null, a.status !== 'Belum' && a.id !== cur ? badge(a.status, STATUS_KIND[a.status] || 'muted') : null)))))));
  }

  function matsFor(id) { return m.materials.filter((x) => x.status === 'Aktif' && x.agenda_id === id); }

  function drawCenter() {
    clear(els.center);
    const it = item();
    const follow = cur && selected !== cur && live()
      ? button('Ikut item semasa', { kind: 'primary', iconName: 'next', onClick: () => { select(cur, true); } }) : null;
    if (!it) { els.center.append(emptyState('Agenda belum disediakan', 'Setiausaha perlu menambah item agenda dahulu.')); return; }
    append(els.center, [
      follow ? h('div', { class: 'live-follow', role: 'status' }, h('span', { text: 'Pengerusi telah beralih ke item lain.' }), follow) : null,
      h('div', { class: 'live-itemhead' },
        h('h1', { class: 'live-itemtitle', text: `${it.seq}. ${it.title}` }),
        h('div', { class: 'agenda-meta' }, badge(it.category, 'info'), badge(it.status, STATUS_KIND[it.status] || 'muted'),
          it.id === cur && live() ? badge('Item semasa', 'teal') : null,
          it.presenter_name ? h('span', { class: 'small muted', text: 'Pembentang: ' + it.presenter_name }) : null, it.duration_min ? h('span', { class: 'small muted', text: it.duration_min + ' min' }) : null),
        it.description ? h('p', { class: 'live-desc', text: it.description }) : null,
        controller() && live() ? h('div', { class: 'live-itemctrl' },
          it.id !== cur ? button('Jadikan item semasa', { kind: 'primary', iconName: 'play', onClick: (e) => setCurrent(it.id, e.currentTarget) }) : null,
          it.status !== 'Selesai' ? button('Tandakan Selesai', { kind: 'secondary', iconName: 'check', onClick: (e) => setItemStatus(it.id, 'Selesai', e.currentTarget) }) : null,
          it.status !== 'Ditangguh' ? button('Tangguhkan', { kind: 'secondary', onClick: (e) => setItemStatus(it.id, 'Ditangguh', e.currentTarget) }) : null) : null),
      materialsBlock(it)]);
  }

  function materialsBlock(it) {
    const own = matsFor(it.id), general = matsFor('');
    const all = [...own, ...general];
    if (!all.length) return h('section', { class: 'card' }, emptyState('Tiada bahan untuk item ini', 'Bahan dimuat naik oleh Setiausaha atau pembentang.'));
    if (!selMat || !all.some((x) => x.id === selMat)) selMat = all[0].id;
    const chip = (x) => h('button', { type: 'button', class: 'live-chip' + (x.id === selMat ? ' is-on' : ''), 'aria-pressed': x.id === selMat ? 'true' : 'false', onClick: () => { selMat = x.id; drawCenter(); } },
      icon('file', 16), h('span', { text: x.title }), x.version > 1 ? h('span', { class: 'muted small', text: 'v' + x.version }) : null);
    const mat = all.find((x) => x.id === selMat);
    if (!opened.has(mat.id)) { opened.add(mat.id); api('materials.logOpen', { id: mat.id }).catch(() => {}); }
    const id = encodeURIComponent(mat.drive_file_id);
    return h('section', { class: 'live-viewer' },
      h('div', { class: 'live-chips' }, own.map(chip), general.length ? h('span', { class: 'muted small live-chips-sep', text: own.length ? 'Bahan umum:' : 'Bahan umum' }) : null, general.map(chip)),
      h('div', { class: 'viewer-bar' }, h('p', { class: 'muted small', text: `${mat.type} · ${mat.file_name}` }),
        h('div', { class: 'viewer-actions' },
          h('a', { class: 'btn btn-secondary', href: `https://drive.google.com/uc?export=download&id=${id}`, target: '_blank', rel: 'noopener noreferrer', text: 'Muat turun' }),
          h('a', { class: 'btn btn-secondary', href: `https://drive.google.com/file/d/${id}/view`, target: '_blank', rel: 'noopener noreferrer', text: 'Buka dalam tab baharu' }))),
      h('iframe', { class: 'viewer-frame live-frame', title: 'Pratonton ' + mat.title, src: `https://drive.google.com/file/d/${id}/preview`, allow: 'fullscreen' }),
      h('p', { class: 'viewer-hint', text: `Jika pratonton tidak muncul, pastikan pelayar sudah log masuk ke akaun Google ${user.email}, atau guna "Buka dalam tab baharu".` }));
  }

  function drawRight() {
    clear(els.right);
    const tab = (id, label, ic) => h('button', { type: 'button', role: 'tab', class: 'tab' + (sideTab === id ? ' is-on' : ''), 'aria-selected': sideTab === id ? 'true' : 'false', onClick: () => { sideTab = id; drawRight(); } }, icon(ic, 16), ' ', label);
    els.right.append(h('div', { class: 'tabs live-tabs', role: 'tablist' }, tab('comments', 'Komen & Cadangan', 'message'), tab('notes', 'Nota Saya', 'edit')));
    if (sideTab === 'comments') {
      const it = item();
      const toggle = h('label', { class: 'check-row live-all' }, h('input', { type: 'checkbox', checked: allComments, onChange: (e) => { allComments = e.target.checked; applyTarget(); } }), h('span', { text: 'Tunjuk semua item' }));
      if (comments) comments.destroy();
      comments = commentsPanel({ m, user, compact: true, target: allComments || !it ? null : { type: 'Agenda', id: it.id } });
      append(els.right, [it ? toggle : null, comments.el]);
    } else {
      const it = item(); notes.setAgenda(it ? it.id : '', it ? `Item ${it.seq}` : 'Umum'); els.right.append(notes.el);
    }
  }

  function applyTarget() { const it = item(); if (comments) comments.setTarget(allComments || !it ? null : { type: 'Agenda', id: it.id }); }

  // ---------- Tindakan ----------
  function select(id, manual) {
    selected = id; selMat = '';
    if (manual) following = id === cur;
    drawLeft(); drawCenter();
    if (sideTab === 'notes') { const it = item(); notes.setAgenda(it ? it.id : '', it ? `Item ${it.seq}` : 'Umum'); } else applyTarget();
    if (panel === 'left') togglePanel('left');
  }

  function applyState(s) {
    const statusChanged = s.status !== m.status;
    m.status = s.status; m.current_agenda_id = s.current_agenda_id;
    const byId = Object.fromEntries(s.agenda.map((a) => [a.id, a.status]));
    m.agenda.forEach((a) => { if (byId[a.id]) a.status = byId[a.id]; });
    const changed = s.current_agenda_id !== cur;
    cur = s.current_agenda_id || '';
    const sig = `${m.status}|${cur}|${selected}|${(item() || {}).status}`; const sigChanged = sig !== lastSig; lastSig = sig;
    if (changed && following && cur) { selected = cur; selMat = ''; drawStatus(); drawLeft(); drawCenter(); if (sideTab === 'notes') select(cur, false); else applyTarget(); }
    else { drawStatus(); drawLeft(); if (changed || sigChanged || !els.center.querySelector('iframe')) drawCenter(); }
    if (((fbrev !== null && s.fbrev !== fbrev) || statusChanged) && comments) comments.reload(); // status berubah: tutup/buka ruang komen
    fbrev = s.fbrev;
  }

  async function poll() {
    if (destroyed || document.hidden) return;
    try { const s = await api('meetings.pollState', { id: m.id }); setOnline(true); if (!destroyed) applyState(s); }
    catch (e) { if (e.code === 0) setOnline(false); else if (e.code === 403) { toast(e.message, 'error'); location.hash = '#/meetings'; } }
  }
  function setOnline(v) { online = v; els.banner.hidden = v; }
  function startPolling() {
    timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', onVis); window.addEventListener('online', poll); window.addEventListener('offline', onOffline);
    poll();
  }
  const onVis = () => { if (!document.hidden) { poll(); acquireWake(); } };
  const onOffline = () => setOnline(false);

  async function startMeeting(btn) {
    const ok = await confirmDialog({ title: 'Mula mesyuarat', confirmLabel: 'Mula', message: 'Status mesyuarat menjadi Sedang Berlangsung. Selepas itu pilih item dan tekan "Jadikan item semasa".' });
    if (!ok) return;
    try { await busy(btn, () => api('meetings.setStatus', { id: m.id, status: 'Sedang Berlangsung' })); m.status = 'Sedang Berlangsung'; toast('Mesyuarat dimulakan.'); drawAll(); drawRight(); } catch (e) { toast(e.message, 'error'); }
  }
  async function endMeeting(btn) {
    const ok = await confirmDialog({ title: 'Tamat mesyuarat', danger: true, confirmLabel: 'Tamat', message: 'Status menjadi Selesai. Selepas ini ahli tidak boleh lagi menambah, menyunting atau memadam komen mereka.' });
    if (!ok) return;
    try { await busy(btn, () => api('meetings.setStatus', { id: m.id, status: 'Selesai' })); m.status = 'Selesai'; m.current_agenda_id = ''; cur = ''; toast('Mesyuarat ditamatkan.'); drawAll(); drawRight(); } catch (e) { toast(e.message, 'error'); }
  }
  async function setCurrent(id, btn) {
    try { const s = await busy(btn, () => api('meetings.setCurrentAgenda', { id: m.id, agenda_id: id })); following = true; applyState({ ...s, status: m.status }); } catch (e) { toast(e.message, 'error'); }
  }
  async function setItemStatus(id, status, btn) {
    try { const r = await busy(btn, () => api('agenda.setStatus', { meeting_id: m.id, id, status })); const a = m.agenda.find((x) => x.id === id); if (a) a.status = status; if (r.agenda) applyState({ status: m.status, current_agenda_id: cur, agenda: r.agenda, fbrev: fbrev === null ? 0 : fbrev }); else { drawLeft(); drawCenter(); } } catch (e) { toast(e.message, 'error'); }
  }

  // ---------- Skrin penuh & Wake Lock ----------
  function toggleFs() {
    try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); else toast('Pelayar ini tidak menyokong skrin penuh.', 'error'); } catch (e) { toast('Skrin penuh tidak dapat dibuka.', 'error'); }
  }
  async function acquireWake() {
    try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; /* tidak disokong atau ditolak: abaikan */ }
  }

  load();
  return () => {
    destroyed = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('online', poll); window.removeEventListener('offline', onOffline);
    if (wake) { try { wake.release(); } catch (e) { /* abaikan */ } }
    if (comments) comments.destroy();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* abaikan */ }
  };
}
