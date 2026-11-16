/**
 * Actions.gs - tindakan susulan (F-08). BSD seksyen 3 `action_items`.
 * Lajur `remarks` ialah "Maklum Balas" dalam jadual Maklum Balas Minit client. Tertunggak dikira, bukan disimpan.
 * Penyimpangan daripada BSD (client mahu Ahli dihadkan): Ahli hanya melihat tindakan yang dia milik; Admin/Setiausaha/Pengerusi
 * mesyuarat itu melihat semua tindakan mesyuarat.
 */

var ACTION_STATUS_ = ['Baharu', 'Dalam Tindakan', 'Selesai', 'Dibatalkan'];
var OWNER_STATUS_ = ['Baharu', 'Dalam Tindakan', 'Selesai'];

function isOverdue_(a) { return Boolean(a.due_date) && a.status !== 'Selesai' && a.status !== 'Dibatalkan' && a.due_date < todayMy_(); }
function isOpenAction_(a) { return a.status !== 'Selesai' && a.status !== 'Dibatalkan'; }

function shapeAction_(a, byEmail, meetings) {
  var o = byEmail[looseEmail_(a.owner_email)] || {}, m = meetings[a.meeting_id] || {};
  return { id: a.id, meeting_id: a.meeting_id, meeting_title: m.title || '', bil: m.bil || '', tahun: m.tahun || '', agenda_id: a.agenda_id, title: a.title,
    owner_email: a.owner_email, owner_name: o.name || a.owner_email, owner_position: o.position || '', due_date: a.due_date, status: a.status, remarks: a.remarks,
    created_by: a.created_by, created_at: a.created_at, updated_at: a.updated_at, completed_at: a.completed_at, overdue: isOverdue_(a) };
}

function meetingsById_() { var map = {}; readTable_('meetings').rows.forEach(function (m) { map[m.id] = m; }); return map; }

/** Admin/Setiausaha atau Pengerusi mesyuarat itu. */
function canManageActions_(session, m) { return isStaff_(session) || isChair_(session, m); }

/**
 * data.meeting_id (pilihan) dan data.scope: 'saya' | 'tertunggak' | 'semua'.
 * Tanpa meeting_id: staf melihat semua mesyuarat; selain itu hanya milik sendiri.
 */
function apiActionsList_(session, data) {
  data = data || {};
  var scope = ['saya', 'tertunggak', 'semua'].indexOf(data.scope) === -1 ? 'semua' : data.scope;
  var byEmail = usersByEmail_(), meetings = meetingsById_();
  var all = readTable_('action_items').rows;
  var rows;
  if (data.meeting_id) {
    var m = requireMeetingAccess_(session, data.meeting_id);
    var manage = canManageActions_(session, m);
    rows = all.filter(function (a) { return a.meeting_id === m.id && (manage || sameEmail_(a.owner_email, session.email)); });
  } else {
    rows = all.filter(function (a) {
      var mm = meetings[a.meeting_id];
      if (!mm || mm.status === 'Dibatalkan') return false;
      return isStaff_(session) || sameEmail_(a.owner_email, session.email);
    });
  }
  if (scope === 'saya') rows = rows.filter(function (a) { return sameEmail_(a.owner_email, session.email); });
  else if (scope === 'tertunggak') rows = rows.filter(isOverdue_);
  rows.sort(function (a, b) { return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1; });
  var counts = { open: 0, overdue: 0 };
  rows.forEach(function (a) { if (isOpenAction_(a)) counts.open++; if (isOverdue_(a)) counts.overdue++; });
  return { actions: rows.map(function (a) { return shapeAction_(a, byEmail, meetings); }), counts: counts };
}

function cleanAction_(data) {
  var f = {};
  f.title = cleanStr_(data.title, 300, 'Tindakan', true);
  f.owner_email = normEmail_(data.owner_email, 'Emel pemilik');
  var u = findUser_(f.owner_email);
  if (!u || u.status !== 'Aktif') throw new ApiError(400, 'Pemilik tindakan mesti pengguna berdaftar yang Aktif.');
  f.due_date = cleanStr_(data.due_date, 10, 'Tarikh akhir', false);
  if (f.due_date && !validDate_(f.due_date)) throw new ApiError(400, 'Tarikh akhir tidak sah (YYYY-MM-DD).');
  f.remarks = cleanStr_(data.remarks, 1000, 'Maklum balas', false);
  return f;
}

function apiActionsSave_(session, data) {
  data = data || {};
  var m = requireMeetingAccess_(session, data.meeting_id);
  if (!canManageActions_(session, m)) throw new ApiError(403, 'Hanya Admin, Setiausaha atau Pengerusi mesyuarat ini boleh menyimpan tindakan.');
  if (['Dijadualkan', 'Sedang Berlangsung', 'Selesai'].indexOf(m.status) === -1) throw new ApiError(409, 'Tindakan hanya boleh dicipta selepas mesyuarat diterbitkan.');
  var f = cleanAction_(data);
  var agendaId = data.agenda_id ? getAgendaRow_(String(data.agenda_id), m.id).id : '';
  var status = data.status === undefined ? undefined : cleanEnum_(data.status, ACTION_STATUS_, 'Status');
  var res = withLock_(function () {
    var now = nowIso_();
    if (data.id) {
      var row = readTable_('action_items').rows.filter(function (r) { return r.id === data.id && r.meeting_id === m.id; })[0];
      if (!row) throw new ApiError(404, 'Tindakan tidak dijumpai.');
      var patch = { title: f.title, owner_email: f.owner_email, due_date: f.due_date, remarks: f.remarks, agenda_id: agendaId, updated_at: now };
      if (status !== undefined) { patch.status = status; patch.completed_at = status === 'Selesai' ? (row.completed_at || now) : ''; }
      updateObject_('action_items', row._row, patch);
      return { id: row.id, created: false };
    }
    var id = genId_('ACT'), st = status || 'Baharu';
    appendObject_('action_items', { id: id, meeting_id: m.id, agenda_id: agendaId, title: f.title, owner_email: f.owner_email, due_date: f.due_date, status: st, remarks: f.remarks,
      created_by: session.email, created_at: now, updated_at: now, completed_at: st === 'Selesai' ? now : '' });
    audit_(session.email, 'action.create', 'action_items', id, f.title.slice(0, 100));
    return { id: id, created: true };
  });
  return res;
}

/** Pemilik (status Baharu/Dalam Tindakan/Selesai dan maklum balas) atau Admin/Setiausaha/Pengerusi mesyuarat itu (semua status). */
function apiActionsUpdateStatus_(session, data) {
  data = data || {};
  var a = readTable_('action_items').rows.filter(function (r) { return r.id === String(data.id || ''); })[0];
  if (!a) throw new ApiError(404, 'Tindakan tidak dijumpai.');
  var m = getMeetingRow_(a.meeting_id);
  var owner = sameEmail_(a.owner_email, session.email);
  var manage = canManageActions_(session, m) && (isStaff_(session) || getMembers_(m.id).some(function (r) { return sameEmail_(r.email, session.email); }));
  if (!owner && !manage) throw new ApiError(403, 'Anda tidak dibenarkan mengemas kini tindakan ini.');
  if (data.status === undefined && data.remarks === undefined) throw new ApiError(400, 'Tiada perubahan.');
  var patch = { updated_at: nowIso_() };
  if (data.status !== undefined) {
    patch.status = cleanEnum_(data.status, manage ? ACTION_STATUS_ : OWNER_STATUS_, 'Status');
    patch.completed_at = patch.status === 'Selesai' ? (a.completed_at || nowIso_()) : '';
  }
  if (data.remarks !== undefined) patch.remarks = cleanStr_(data.remarks, 1000, 'Maklum balas', false);
  withLock_(function () {
    var cur = readTable_('action_items').rows.filter(function (r) { return r.id === a.id; })[0];
    updateObject_('action_items', cur._row, patch);
  });
  var fresh = readTable_('action_items').rows.filter(function (r) { return r.id === a.id; })[0];
  return { action: shapeAction_(fresh, usersByEmail_(), meetingsById_()) };
}

// ---------- Untuk meetings.get ----------

/** Tindakan belum selesai mesyuarat lepas ("Perkara Berbangkit"). Hanya tajuk, pemilik, tarikh, status (bukan maklum balas). */
function carryOverFor_(session, m) {
  if (!m.prev_meeting_id) return [];
  var pm = readTable_('meetings').rows.filter(function (x) { return x.id === m.prev_meeting_id; })[0];
  if (!pm || pm.status === 'Dibatalkan') return [];
  var byEmail = usersByEmail_(), meetings = meetingsById_();
  return readTable_('action_items').rows.filter(function (a) { return a.meeting_id === pm.id && isOpenAction_(a); })
    .map(function (a) { var s = shapeAction_(a, byEmail, meetings); return { id: s.id, title: s.title, owner_name: s.owner_name, due_date: s.due_date, status: s.status, overdue: s.overdue }; });
}

function myActionCount_(session, meetingId) {
  return readTable_('action_items').rows.filter(function (a) { return a.meeting_id === meetingId && sameEmail_(a.owner_email, session.email); }).length;
}
