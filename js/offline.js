// F-13: agenda terakhir yang dibuka disimpan dalam peranti untuk bacaan luar talian. HANYA tajuk, tarikh dan agenda
// (bukan bahan, komen, nota atau senarai ahli). Dikunci mengikut emel dan dipadam bila log keluar.
const PREFIX = 'emi_offline:';
const MAX = 5;
const key = (email) => PREFIX + String(email || '').toLowerCase();

function read(email) { try { return JSON.parse(localStorage.getItem(key(email)) || '{}'); } catch (e) { return {}; } }
function write(email, map) { try { localStorage.setItem(key(email), JSON.stringify(map)); } catch (e) { /* storan penuh atau disekat: abaikan */ } }

export function saveMeeting(email, m) {
  const map = read(email);
  map[m.id] = {
    id: m.id, title: m.title, bil: m.bil, tahun: m.tahun, date: m.date, start_time: m.start_time, end_time: m.end_time, venue: m.venue,
    status: m.status, pengerusi_name: m.pengerusi_name, saved_at: new Date().toISOString(),
    agenda: (m.agenda || []).map((a) => ({ seq: a.seq, title: a.title, description: a.description, category: a.category, presenter_name: a.presenter_name, duration_min: a.duration_min }))
  };
  const ids = Object.keys(map).sort((a, b) => map[b].saved_at.localeCompare(map[a].saved_at));
  ids.slice(MAX).forEach((id) => { delete map[id]; });
  write(email, map);
}

export function loadMeeting(email, id) { return read(email)[id] || null; }
export function listMeetings(email) { return Object.values(read(email)).sort((a, b) => b.saved_at.localeCompare(a.saved_at)); }

export function clearOffline() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* abaikan */ }
}
