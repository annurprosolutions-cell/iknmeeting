/**
 * Meetings.gs - mesyuarat, ahli, kehadiran (F-02, F-03, F-14). BSD seksyen 3, 4.2, 4.3.
 */

var STAFF_ROLES_ = ['Admin', 'Setiausaha'];
var TIME_RE_ = /^([01]\d|2[0-3]):[0-5]\d$/;
var CONT_CONFIRM_TITLE_ = 'Pengesahan Minit Mesyuarat Lepas';
var CONT_MATTERS_TITLE_ = 'Perkara Berbangkit';
var ATTENDANCE_ = ['Belum Jawab', 'Hadir', 'Tidak Hadir', 'Mungkin'];

function isStaff_(session) { return STAFF_ROLES_.indexOf(session.role) !== -1; }

/** Banding emel tanpa mengira huruf besar/kecil dan ruang kosong (baris ahli mungkin disunting manual dalam Sheet). */
function looseEmail_(e) { return String(e || '').trim().toLowerCase(); }
function sameEmail_(a, b) { return looseEmail_(a) === looseEmail_(b) && looseEmail_(a) !== ''; }

// ---------- Akses ----------

function getMeetingRow_(id) {
  var r = readTable_('meetings').rows.filter(function (x) { return x.id === String(id || ''); })[0];
  if (!r) throw new ApiError(404, 'Mesyuarat tidak dijumpai.');
  return r;
}

function getMembers_(meetingId) {
  return readTable_('meeting_members').rows.filter(function (r) { return r.meeting_id === meetingId; });
}

/**
 * BSD 4.2. Admin/Setiausaha lulus. Pengerusi/Ahli mesti ahli DAN status bukan Draf.
 * opts.chairOnly: Pengerusi/Ahli mesti = pengerusi_email mesyuarat itu (Admin/Setiausaha tetap lulus).
 * Pulang baris mesyuarat.
 */
function requireMeetingAccess_(session, meetingId, opts) {
  opts = opts || {};
  var m = getMeetingRow_(meetingId);
  if (!isStaff_(session)) {
    var member = getMembers_(m.id).some(function (r) { return sameEmail_(r.email, session.email); });
    if (!member || m.status === 'Draf') throw new ApiError(403, 'Anda tidak dijemput ke mesyuarat ini.');
    if (opts.chairOnly && m.pengerusi_email !== session.email) {
      throw new ApiError(403, 'Hanya Pengerusi mesyuarat ini boleh melakukan tindakan ini.');
    }
  }
  return m;
}

// ---------- Bentuk output ----------

function usersByEmail_() {
  var map = {};
  getUsers_().forEach(function (u) { map[u.email] = u; });
  return map;
}

function shapeMeeting_(m, byEmail, staff) {
  var chair = byEmail[m.pengerusi_email];
  var o = {
    id: m.id, title: m.title, meeting_type: m.meeting_type, series: m.series, prev_meeting_id: m.prev_meeting_id,
    date: m.date, start_time: m.start_time, end_time: m.end_time, venue: m.venue, online_link: m.online_link,
    status: m.status, pengerusi_email: m.pengerusi_email, pengerusi_name: chair ? chair.name : '',
    current_agenda_id: m.current_agenda_id, notify_on_publish: m.notify_on_publish === 'TRUE',
    created_by: m.created_by, created_at: m.created_at, updated_at: m.updated_at,
    tahun: m.tahun || (m.date || '').slice(0, 4), bil: m.bil || ''
  };
  if (staff) o.drive_folder_id = m.drive_folder_id;
  return o;
}

// ---------- Validasi input ----------

function validDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function parseMeetingInput_(data, selfId) {
  data = data || {};
  var f = {};
  f.title = cleanStr_(data.title, 200, 'Tajuk', true);
  f.series = f.title; // "siri" = nama mesyuarat; digunakan untuk kumpulan arkib dan penapis
  f.bil = cleanStr_(data.bil, 3, 'Bilangan', false);
  if (f.bil && !/^[1-9]\d{0,2}$/.test(f.bil)) throw new ApiError(400, 'Bilangan mesti nombor, contoh 1 untuk Bil.1/2026.');
  f.date = cleanStr_(data.date, 10, 'Tarikh', true);
  if (!validDate_(f.date)) throw new ApiError(400, 'Tarikh tidak sah (format YYYY-MM-DD).');
  f.tahun = cleanStr_(data.tahun, 4, 'Tahun', false) || f.date.slice(0, 4);
  if (!/^\d{4}$/.test(f.tahun)) throw new ApiError(400, 'Tahun tidak sah (4 digit).');
  f.start_time = cleanStr_(data.start_time, 5, 'Masa mula', true);
  if (!TIME_RE_.test(f.start_time)) throw new ApiError(400, 'Masa mula tidak sah (HH:mm).');
  f.end_time = cleanStr_(data.end_time, 5, 'Masa tamat', false);
  if (f.end_time) {
    if (!TIME_RE_.test(f.end_time)) throw new ApiError(400, 'Masa tamat tidak sah (HH:mm).');
    if (f.end_time <= f.start_time) throw new ApiError(400, 'Masa tamat mesti selepas masa mula.');
  }
  f.venue = cleanStr_(data.venue, 200, 'Lokasi', false);
  f.online_link = cleanStr_(data.online_link, 500, 'Pautan online', false);
  if (f.online_link && !/^https:\/\/[^\s]+$/i.test(f.online_link)) throw new ApiError(400, 'Pautan online mesti bermula dengan https://');
  f.notify_on_publish = data.notify_on_publish === false || data.notify_on_publish === 'FALSE' ? 'FALSE' : 'TRUE';

  f.pengerusi_email = '';
  if (data.pengerusi_email) {
    f.pengerusi_email = normEmail_(data.pengerusi_email, 'Emel Pengerusi');
    var u = findUser_(f.pengerusi_email);
    if (!u || u.status !== 'Aktif') throw new ApiError(400, 'Pengerusi mesti pengguna berdaftar yang Aktif.');
  }

  f.prev_meeting_id = cleanStr_(data.prev_meeting_id, 40, 'Mesyuarat lepas', false);
  if (f.prev_meeting_id) {
    if (f.prev_meeting_id === selfId) throw new ApiError(400, 'Mesyuarat tidak boleh bersambung dengan dirinya sendiri.');
    getMeetingRow_(f.prev_meeting_id); // 404 jika tiada
  }
  return f;
}

/** Senarai emel ahli yang disahkan (Aktif), unik, huruf kecil. */
function parseMemberEmails_(list) {
  if (list === undefined || list === null) return null;
  if (!Array.isArray(list) || list.length > 200) throw new ApiError(400, 'Senarai ahli tidak sah.');
  var seen = {}, out = [];
  list.forEach(function (raw) {
    var e = normEmail_(raw, 'Emel ahli');
    if (seen[e]) return;
    var u = findUser_(e);
    if (!u || u.status !== 'Aktif') throw new ApiError(400, 'Pengguna tidak aktif atau tidak berdaftar: ' + e);
    seen[e] = true; out.push(e);
  });
  return out;
}

// ---------- Agenda sambungan (2.3) ----------

/** Idempotent: tambah "Pengesahan Minit" dan "Perkara Berbangkit" di awal agenda jika belum ada. Panggil dalam withLock_. */
function ensureContinuationAgenda_(meetingId, actorEmail) {
  var items = readTable_('agenda_items').rows.filter(function (r) { return r.meeting_id === meetingId; });
  var has = items.some(function (r) { return r.title === CONT_CONFIRM_TITLE_ || r.title === CONT_MATTERS_TITLE_; });
  if (has) return;
  items.forEach(function (r) { updateObject_('agenda_items', r._row, { seq: Number(r.seq) + 2 }); });
  var now = nowIso_();
  appendObjects_('agenda_items', [
    { id: genId_('AGD'), meeting_id: meetingId, seq: 1, title: CONT_CONFIRM_TITLE_, description: '', category: 'Pengesahan', presenter_email: '', duration_min: '', status: 'Belum', updated_by: actorEmail, updated_at: now },
    { id: genId_('AGD'), meeting_id: meetingId, seq: 2, title: CONT_MATTERS_TITLE_, description: '', category: 'Makluman', presenter_email: '', duration_min: '', status: 'Belum', updated_by: actorEmail, updated_at: now }
  ]);
}

// ---------- Ahli ----------

/**
 * Selaraskan ahli dengan senarai baharu (Pengerusi sentiasa disertakan). Panggil dalam withLock_.
 * Pulang {added:[email], removed:[email]} untuk sinkronisasi Drive di luar lock.
 */
function syncMembersRows_(meeting, emails, actorEmail) {
  var want = {};
  emails.forEach(function (e) { want[e] = true; });
  if (meeting.pengerusi_email) want[meeting.pengerusi_email] = true;
  var current = getMembers_(meeting.id);
  var have = {}, removeRows = [], removed = [], added = [];
  current.forEach(function (r) {
    have[r.email] = true;
    if (!want[r.email]) { removeRows.push(r._row); removed.push(r.email); }
  });
  var now = nowIso_(), toAdd = [];
  Object.keys(want).forEach(function (e) {
    if (have[e]) return;
    toAdd.push({ id: genId_('MEM'), meeting_id: meeting.id, email: e, attendance: 'Belum Jawab', attendance_at: '', added_by: actorEmail, added_at: now });
    added.push(e);
  });
  if (removeRows.length) deleteRows_('meeting_members', removeRows);
  appendObjects_('meeting_members', toAdd);
  return { added: added, removed: removed };
}

function applyDriveDiff_(meeting, diff) {
  if (STATUS_WITH_FOLDER_ACCESS_.indexOf(meeting.status) === -1) return [];
  var failed = driveShareMany_(meeting.drive_folder_id, diff.added.filter(isActiveUser_));
  diff.removed.forEach(function (e) { driveUnshare_(meeting.drive_folder_id, e); });
  return failed;
}

// ---------- API ----------

function apiMeetingsList_(session) {
  var staff = isStaff_(session);
  var byEmail = usersByEmail_();
  var members = readTable_('meeting_members').rows;
  var counts = {}, mine = {};
  members.forEach(function (r) {
    counts[r.meeting_id] = (counts[r.meeting_id] || 0) + 1;
    if (sameEmail_(r.email, session.email)) mine[r.meeting_id] = r.attendance;
  });
  var out = [];
  readTable_('meetings').rows.forEach(function (m) {
    if (!staff && (m.status === 'Draf' || mine[m.id] === undefined)) return;
    var o = shapeMeeting_(m, byEmail, staff);
    o.member_count = counts[m.id] || 0;
    o.my_attendance = mine[m.id] || '';
    out.push(o);
  });
  return { meetings: out };
}

function apiMeetingsGet_(session, data) {
  var m = requireMeetingAccess_(session, data && data.id);
  var staff = isStaff_(session);
  var byEmail = usersByEmail_();
  var o = shapeMeeting_(m, byEmail, staff);
  var memberRows = getMembers_(m.id);
  var photos = getPhotos_();
  o.members = memberRows.map(function (r) {
    var key = looseEmail_(r.email);
    var u = byEmail[key] || {};
    var row = { email: r.email, name: u.name || r.email, position: u.position || '', photo: photos[key] || '', attendance: r.attendance, attendance_at: r.attendance_at, is_chair: key === looseEmail_(m.pengerusi_email) };
    if (staff) row.access = !u.email ? 'tidak_berdaftar' : (u.status !== 'Aktif' ? 'tidak_aktif' : 'ok');
    return row;
  }).sort(function (a, b) { return (b.is_chair ? 1 : 0) - (a.is_chair ? 1 : 0) || a.name.localeCompare(b.name); });
  o.my_attendance = (memberRows.filter(function (r) { return sameEmail_(r.email, session.email); })[0] || {}).attendance || '';
  o.agenda = readTable_('agenda_items').rows.filter(function (r) { return r.meeting_id === m.id; })
    .sort(function (a, b) { return Number(a.seq) - Number(b.seq); })
    .map(function (r) {
      var p = byEmail[r.presenter_email];
      return { id: r.id, seq: Number(r.seq), title: r.title, description: r.description, category: r.category,
        presenter_email: r.presenter_email, presenter_name: p ? p.name : '', duration_min: r.duration_min ? Number(r.duration_min) : null, status: r.status };
    });
  o.materials = listMaterialsFor_(session, m, byEmail);
  if (m.prev_meeting_id) {
    var prev = readTable_('meetings').rows.filter(function (x) { return x.id === m.prev_meeting_id; })[0];
    if (prev) o.prev_meeting = { id: prev.id, title: prev.title, date: prev.date };
  }
  return o;
}

function apiMeetingsCreate_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var f = parseMeetingInput_(data, '');
  var memberList = parseMemberEmails_(data.members) || [];
  var id = genId_('MTG');
  var folderId = createMeetingFolder_(id, f.date, f.title);
  withLock_(function () {
    var now = nowIso_();
    appendObject_('meetings', {
      id: id, title: f.title, meeting_type: '', series: f.series, tahun: f.tahun, bil: f.bil, prev_meeting_id: f.prev_meeting_id,
      date: f.date, start_time: f.start_time, end_time: f.end_time, venue: f.venue, online_link: f.online_link,
      status: 'Draf', pengerusi_email: f.pengerusi_email, current_agenda_id: '', drive_folder_id: folderId,
      notify_on_publish: f.notify_on_publish, created_by: session.email, created_at: now, updated_at: now
    });
    // Pengerusi dan Setiausaha yang mengurus dianggap ahli secara automatik
    var emails = memberList.slice();
    if (session.role === 'Setiausaha') emails.push(session.email);
    syncMembersRows_({ id: id, pengerusi_email: f.pengerusi_email }, emails, session.email);
    if (f.prev_meeting_id) ensureContinuationAgenda_(id, session.email);
    audit_(session.email, 'meeting.create', 'meetings', id, f.title.slice(0, 100));
  });
  touchState_(id);
  return { id: id };
}

function apiMeetingsUpdate_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var old = getMeetingRow_(data && data.id);
  if (old.status === 'Dibatalkan') throw new ApiError(409, 'Mesyuarat yang dibatalkan tidak boleh disunting.');
  if (old.status === 'Selesai' && session.role !== 'Admin') throw new ApiError(403, 'Hanya Admin boleh menyunting mesyuarat yang sudah Selesai.');
  var f = parseMeetingInput_(data, old.id);
  var memberList = parseMemberEmails_(data.members);
  var diff = null, meeting = null;
  withLock_(function () {
    var cur = getMeetingRow_(old.id); // baca semula dalam lock
    updateObject_('meetings', cur._row, {
      title: f.title, series: f.series, tahun: f.tahun, bil: f.bil, prev_meeting_id: f.prev_meeting_id,
      date: f.date, start_time: f.start_time, end_time: f.end_time, venue: f.venue, online_link: f.online_link,
      pengerusi_email: f.pengerusi_email, notify_on_publish: f.notify_on_publish, updated_at: nowIso_()
    });
    meeting = getMeetingRow_(old.id);
    if (memberList) diff = syncMembersRows_(meeting, memberList, session.email);
    else if (f.pengerusi_email && f.pengerusi_email !== old.pengerusi_email) diff = syncMembersRows_(meeting, getMembers_(old.id).map(function (r) { return r.email; }), session.email);
    if (f.prev_meeting_id && f.prev_meeting_id !== old.prev_meeting_id) ensureContinuationAgenda_(old.id, session.email);
    audit_(session.email, 'meeting.update', 'meetings', old.id, f.title.slice(0, 100));
  });
  if (f.pengerusi_email !== old.pengerusi_email) moveRestrictedAccess_(meeting, old.pengerusi_email, f.pengerusi_email);
  if (old.date !== f.date || old.title !== f.title) renameMeetingFolder_(old.drive_folder_id, old.id, f.date, f.title);
  touchState_(old.id);
  var failed = diff ? applyDriveDiff_(meeting, diff) : [];
  return { id: old.id, driveFailures: failed };
}

function apiMembersSet_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var m = getMeetingRow_(data && data.meeting_id);
  if (m.status === 'Dibatalkan' || m.status === 'Selesai') throw new ApiError(409, 'Ahli tidak boleh diubah selepas mesyuarat Selesai atau Dibatalkan.');
  var list = parseMemberEmails_(data.emails);
  if (!list) throw new ApiError(400, 'Senarai ahli diperlukan.');
  var diff = withLock_(function () {
    var d = syncMembersRows_(m, list, session.email);
    audit_(session.email, 'members.set', 'meetings', m.id, '+' + d.added.length + ' -' + d.removed.length);
    return d;
  });
  touchState_(m.id);
  var failed = applyDriveDiff_(m, diff);
  return { added: diff.added.length, removed: diff.removed.length, driveFailures: failed };
}

function apiMeetingsPublish_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var m = getMeetingRow_(data && data.id);
  if (m.status !== 'Draf') throw new ApiError(409, 'Hanya mesyuarat Draf boleh diterbitkan.');
  if (!m.pengerusi_email) throw new ApiError(400, 'Pilih Pengerusi sebelum menerbitkan mesyuarat.');
  if (!isActiveUser_(m.pengerusi_email)) throw new ApiError(400, 'Pengerusi tidak lagi aktif. Pilih Pengerusi lain.');
  var members = getMembers_(m.id).filter(function (r) { return isActiveUser_(r.email); });
  if (!members.some(function (r) { return r.email !== m.pengerusi_email; })) {
    throw new ApiError(400, 'Tambah sekurang-kurangnya 1 ahli (selain Pengerusi) sebelum menerbitkan.');
  }
  // Kongsi Drive tidak boleh menggagalkan penerbitan: jika gagal, mesyuarat tetap terbit dan emel yang gagal dilaporkan
  var failed;
  try { failed = driveShareMany_(m.drive_folder_id, members.map(function (r) { return r.email; })); }
  catch (e) { Logger.log('driveShareMany_ gagal semasa terbit: ' + e); failed = members.map(function (r) { return r.email; }); }
  withLock_(function () {
    var cur = getMeetingRow_(m.id);
    if (cur.status !== 'Draf') throw new ApiError(409, 'Mesyuarat sudah diterbitkan.');
    updateObject_('meetings', cur._row, { status: 'Dijadualkan', updated_at: nowIso_() });
    audit_(session.email, 'meeting.publish', 'meetings', m.id, members.length + ' ahli' + (failed.length ? ', ' + failed.length + ' gagal dikongsi' : ''));
  });
  touchState_(m.id);
  moveRestrictedAccess_(m, '', m.pengerusi_email);
  if (m.notify_on_publish === 'TRUE' && typeof globalThis.notifyInvite_ === 'function') {
    try { globalThis.notifyInvite_(m.id); } catch (e) { Logger.log('notifyInvite_ gagal: ' + e); }
  }
  return { id: m.id, status: 'Dijadualkan', driveFailures: failed };
}

function apiMeetingsCancel_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var m = getMeetingRow_(data && data.id);
  if (['Draf', 'Dijadualkan'].indexOf(m.status) === -1) throw new ApiError(409, 'Hanya mesyuarat Draf atau Dijadualkan boleh dibatalkan.');
  var members = getMembers_(m.id);
  withLock_(function () {
    var cur = getMeetingRow_(m.id);
    updateObject_('meetings', cur._row, { status: 'Dibatalkan', updated_at: nowIso_() });
    audit_(session.email, 'meeting.cancel', 'meetings', m.id, '');
  });
  members.forEach(function (r) { driveUnshare_(m.drive_folder_id, r.email); });
  touchState_(m.id);
  moveRestrictedAccess_(m, m.pengerusi_email, '');
  return { id: m.id, status: 'Dibatalkan' };
}

/** Mula / tamat mesyuarat. Admin, Setiausaha atau Pengerusi mesyuarat itu. */
function apiMeetingsSetStatus_(session, data) {
  var m = requireMeetingAccess_(session, data && data.id, { chairOnly: true });
  var next = cleanEnum_(data.status, ['Sedang Berlangsung', 'Selesai'], 'Status');
  var allowed = { 'Dijadualkan': 'Sedang Berlangsung', 'Sedang Berlangsung': 'Selesai' };
  if (allowed[m.status] !== next) throw new ApiError(409, 'Peralihan status tidak dibenarkan: ' + m.status + ' ke ' + next + '.');
  withLock_(function () {
    var cur = getMeetingRow_(m.id);
    if (allowed[cur.status] !== next) throw new ApiError(409, 'Status mesyuarat telah berubah. Muat semula.');
    updateObject_('meetings', cur._row, next === 'Selesai' ? { status: next, current_agenda_id: '', updated_at: nowIso_() } : { status: next, updated_at: nowIso_() });
    audit_(session.email, 'meeting.status', 'meetings', m.id, m.status + ' -> ' + next);
  });
  touchState_(m.id);
  return { id: m.id, status: next };
}

/** Kehadiran sendiri sahaja (F-14). */
function apiAttendanceSet_(session, data) {
  var m = requireMeetingAccess_(session, data && data.meeting_id);
  var value = cleanEnum_(data.attendance, ATTENDANCE_, 'Kehadiran');
  if (m.status === 'Selesai' || m.status === 'Dibatalkan') throw new ApiError(409, 'Kehadiran tidak boleh diubah selepas mesyuarat tamat atau dibatalkan.');
  return withLock_(function () {
    var row = getMembers_(m.id).filter(function (r) { return sameEmail_(r.email, session.email); })[0];
    if (!row) throw new ApiError(403, 'Anda bukan ahli mesyuarat ini.');
    var at = value === 'Belum Jawab' ? '' : nowIso_();
    updateObject_('meeting_members', row._row, { attendance: value, attendance_at: at });
    return { attendance: value, attendance_at: at };
  });
}
