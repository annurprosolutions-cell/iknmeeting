// Komponen kecil. Tiada innerHTML dengan data pengguna: semua teks melalui textContent / text node.
import { icon } from './icons.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'selected', 'readOnly'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// ---------- Format tarikh (BSD: simpan ISO, paparan DD/MM/YYYY) ----------
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
export function fmtDateTime(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '';
}

// ---------- Tema ----------
export function getThemeMode() {
  try { const m = localStorage.getItem('emi_theme'); return m === 'light' || m === 'dark' ? m : 'auto'; } catch (e) { return 'auto'; }
}
export function setThemeMode(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
  try { if (mode === 'auto') localStorage.removeItem('emi_theme'); else localStorage.setItem('emi_theme', mode); } catch (e) { /* abaikan */ }
}

// ---------- Butang ----------
export function button(label, { kind = 'primary', iconName, onClick, type = 'button', ariaLabel, disabled } = {}) {
  const b = h('button', { class: 'btn btn-' + kind, type, 'aria-label': ariaLabel, disabled, onClick });
  if (iconName) b.append(icon(iconName, 18));
  if (label) b.append(h('span', { text: label }));
  return b;
}

/** Kunci butang + spinner semasa janji berjalan. */
export async function busy(btn, promiseFn) {
  btn.disabled = true;
  btn.classList.add('is-loading');
  try { return await promiseFn(); }
  finally { btn.disabled = false; btn.classList.remove('is-loading'); }
}

// ---------- Badge ----------
const BADGE_ICON = { success: 'check', warning: 'clock', danger: 'alert', info: 'info', muted: 'info', teal: 'info' };
export function badge(text, kind = 'muted') {
  return h('span', { class: 'badge badge-' + kind }, icon(BADGE_ICON[kind] || 'info', 14), h('span', { text }));
}

// ---------- Toast ----------
export function toast(message, kind = 'success') {
  const root = document.getElementById('toast-root');
  const isErr = kind === 'error';
  const t = h('div', { class: 'toast toast-' + kind, role: isErr ? 'alert' : 'status' },
    icon(isErr ? 'alert' : 'check', 20),
    h('span', { class: 'toast-msg', text: message }),
    isErr ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onClick: () => t.remove() }, icon('x', 18)) : null);
  root.append(t);
  if (!isErr) setTimeout(() => t.remove(), 5000);
  return t;
}

// ---------- Modal (Esc tutup, fokus terperangkap) ----------
export function openModal({ title, body, actions = [], onClose, wide = false }) {
  const previouslyFocused = document.activeElement;
  const titleId = 'modal-title-' + Math.random().toString(36).slice(2, 8);
  const dialog = h('div', { class: 'modal' + (wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' });
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup' }, icon('x', 20));
  const footer = h('div', { class: 'modal-actions' });
  dialog.append(h('div', { class: 'modal-head' }, h('h2', { id: titleId, text: title }), closeBtn), h('div', { class: 'modal-body' }, body), footer);
  actions.forEach((a) => footer.append(a));

  function close() {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    document.body.classList.remove('modal-open');
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    if (onClose) onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  document.body.classList.add('modal-open');
  const firstField = dialog.querySelector('input:not([readonly]), select, textarea');
  (firstField || dialog).focus();
  return { close, dialog };
}

export function confirmDialog({ title, message, confirmLabel = 'Teruskan', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const cancel = button('Batal', { kind: 'ghost', onClick: () => { m.close(); } });
    const ok = button(confirmLabel, { kind: danger ? 'danger' : 'primary', onClick: () => { done(true); m.close(); } });
    const m = openModal({ title, body: h('p', { text: message }), actions: [cancel, ok], onClose: () => done(false) });
  });
}

// ---------- Borang ----------
let fieldSeq = 0;
/** Medan berlabel. Pulang {wrap, input, error(msg), clearError()}. */
export function field({ label, type = 'text', value = '', required = false, hint, options, maxlength, readOnly = false, rows, placeholder, autocomplete }) {
  const id = 'f' + (++fieldSeq);
  const errId = id + '-err', hintId = id + '-hint';
  let input;
  if (options) {
    input = h('select', { id, class: 'input' }, options.map((o) => {
      const opt = typeof o === 'string' ? { value: o, label: o } : o;
      return h('option', { value: opt.value, text: opt.label, selected: opt.value === value });
    }));
    input.value = value;
  } else if (rows) {
    input = h('textarea', { id, class: 'input', rows, maxlength, placeholder, spellcheck: 'false' });
    input.value = value;
  } else {
    input = h('input', { id, class: 'input', type, maxlength, readOnly, placeholder, autocomplete: autocomplete || 'off', value });
  }
  if (required) input.setAttribute('aria-required', 'true');
  const errEl = h('p', { class: 'field-error', id: errId, hidden: true });
  const wrap = h('div', { class: 'field' },
    h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null),
    input,
    hint ? h('p', { class: 'field-hint', id: hintId, text: hint }) : null,
    errEl);
  if (hint) input.setAttribute('aria-describedby', hintId);
  return {
    wrap, input,
    error(msg) {
      errEl.replaceChildren(icon('alert', 16), h('span', { text: msg }));
      errEl.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errId + (hint ? ' ' + hintId : ''));
    },
    clearError() {
      errEl.hidden = true;
      input.removeAttribute('aria-invalid');
      if (hint) input.setAttribute('aria-describedby', hintId); else input.removeAttribute('aria-describedby');
    }
  };
}

// ---------- Keadaan ----------
export function emptyState(text, sub) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title', text }), sub ? h('p', { class: 'muted', text: sub }) : null);
}

export function errorBanner(message, onRetry) {
  return h('div', { class: 'banner banner-danger', role: 'alert' }, icon('alert', 20), h('span', { text: message }),
    onRetry ? button('Cuba semula', { kind: 'secondary', onClick: onRetry }) : null);
}

export function skeletonRows(n = 5) {
  return h('div', { class: 'skeleton-list', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('div', { class: 'skeleton' })));
}

// ---------- Tarikh mesyuarat ----------
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

/** Tarikh hari ini di Malaysia (YYYY-MM-DD), tanpa bergantung pada zon masa peranti. */
export function todayMyt() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function dayMonth(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? { day: String(Number(m[3])), month: MONTHS[Number(m[2]) - 1] } : { day: '', month: '' };
}
export function weekday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? DAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : '';
}
export function fmtTimeRange(start, end) { return end ? `${start} - ${end}` : start || ''; }

const MEETING_BADGE = { 'Draf': 'muted', 'Dijadualkan': 'info', 'Sedang Berlangsung': 'teal', 'Selesai': 'success', 'Dibatalkan': 'danger' };
export function meetingStatusBadge(status) {
  const b = badge(status, MEETING_BADGE[status] || 'muted');
  if (status === 'Sedang Berlangsung') b.classList.add('badge-live');
  return b;
}
const ATT_BADGE = { 'Hadir': 'success', 'Tidak Hadir': 'danger', 'Mungkin': 'warning', 'Belum Jawab': 'muted' };
export function attendanceBadge(a) { return badge(a || 'Belum Jawab', ATT_BADGE[a] || 'muted'); }

// ---------- Fail dan gambar ----------
export function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/** Baca fail sebagai base64 (tanpa awalan data:). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Fail tidak dapat dibaca.'));
    r.readAsDataURL(file);
  });
}

/** Kecilkan gambar kepada JPEG segi empat 96px (potong tengah). Pulang data URL (~3-8KB). */
export function resizePhoto(file, size = 96) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return reject(new Error('Pilih fail gambar (JPG atau PNG).'));
    // data: URL (bukan blob:) kerana CSP img-src hanya membenarkan 'self', data: dan googleusercontent
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const side = Math.min(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Avatar: gambar profil atau huruf pertama nama. */
export function avatar(person, size = 36) {
  const el = h('span', { class: 'avatar', 'aria-hidden': 'true' });
  el.style.width = el.style.height = size + 'px';
  el.style.fontSize = Math.round(size * 0.42) + 'px';
  if (person && person.photo) {
    const img = h('img', { src: person.photo, alt: '' });
    el.append(img);
  } else {
    el.textContent = String((person && person.name) || '?').replace(/^(Dr\.?|Encik|Puan|Cik|Matron|Tuan|YBrs\.?|YM)\s+/i, '').trim().charAt(0).toUpperCase();
  }
  return el;
}
