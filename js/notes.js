// F-15 Nota peribadi: disimpan dalam localStorage peranti ini sahaja (kunci mengikut emel + mesyuarat + item). TIDAK dihantar ke server.
import { h, fmtDateTime } from './ui.js';

const keyFor = (email, meetingId, agendaId) => `emi_note:${String(email).toLowerCase()}:${meetingId}:${agendaId || 'umum'}`;

export function readNote(email, meetingId, agendaId) {
  try { return localStorage.getItem(keyFor(email, meetingId, agendaId)) || ''; } catch (e) { return ''; }
}

export function notesPanel({ user, meetingId }) {
  let agendaId = '', label = 'Umum', timer = null, unavailable = false, loadedOnce = false;
  const title = h('h3', { class: 'notes-title' });
  const ta = h('textarea', { class: 'input', rows: 10, maxlength: 20000, 'aria-label': 'Nota peribadi', placeholder: 'Tulis nota anda di sini. Hanya anda yang boleh melihatnya.' });
  const saved = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const warn = h('p', { class: 'muted small', text: 'Nota disimpan pada peranti dan pelayar ini sahaja. Ia tidak dihantar ke server dan tidak boleh dilihat oleh sesiapa, termasuk Admin. Jika data pelayar dipadam, nota hilang.' });

  function save() {
    try { localStorage.setItem(keyFor(user.email, meetingId, agendaId), ta.value); saved.textContent = 'Disimpan ' + new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }); }
    catch (e) { unavailable = true; saved.textContent = 'Nota tidak dapat disimpan (storan pelayar disekat).'; }
  }
  ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 500); });
  ta.addEventListener('blur', () => { clearTimeout(timer); save(); });

  function setAgenda(id, lbl) {
    clearTimeout(timer); if (loadedOnce) save(); // simpan nota item lama sebelum tukar (bukan pada panggilan pertama: kotak masih kosong)
    loadedOnce = true;
    agendaId = id || ''; label = lbl || 'Umum';
    title.textContent = 'Nota untuk: ' + label;
    ta.value = readNote(user.email, meetingId, agendaId); saved.textContent = '';
  }
  setAgenda('', 'Umum');
  return { el: h('div', { class: 'notes' }, title, ta, saved, warn), setAgenda };
}
