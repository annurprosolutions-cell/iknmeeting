/**
 * Minutes.gs - minit mesyuarat (F-06). BSD seksyen 3 `minutes`, AFD kitaran status minit.
 * Aliran: Setiausaha tulis (Draf) -> hantar (Untuk Semakan) -> Pengerusi mesyuarat itu sahkan (Disahkan, dikunci).
 * Penyimpangan daripada BSD atas permintaan client (07/11/2026: minit disemak oleh 2 orang, bukan semua ahli):
 *   Draf: Admin/Setiausaha sahaja. Untuk Semakan: + Pengerusi mesyuarat itu. Disahkan: semua ahli mesyuarat.
 */

var MINUTE_MAX_ = 45000;

function minuteRows_(meetingId) {
  return readTable_('minutes').rows.filter(function (r) { return r.meeting_id === meetingId; })
    .sort(function (a, b) { return Number(a.version) - Number(b.version) || (a.prepared_at < b.prepared_at ? -1 : 1); });
}

function currentMinute_(meetingId) {
  var rows = minuteRows_(meetingId);
  var cur = rows.filter(function (r) { return r.is_current === 'TRUE'; })[0];
  return cur || rows[rows.length - 1] || null;
}

/** Siapa boleh baca minit ini (BSD diubah suai: lihat kepala fail). */
function minuteVisible_(session, m, min) {
  if (!min) return false;
  if (isStaff_(session)) return true;
  if (isChair_(session, m)) return min.status !== 'Draf';
  return min.status === 'Disahkan';
}

function shapeMinute_(min, byEmail) {
  var prep = byEmail[looseEmail_(min.prepared_by)] || {}, app = byEmail[looseEmail_(min.approved_by)] || {};
  return { id: min.id, version: Number(min.version) || 1, status: min.status, content_md: min.content_md, final_file_id: min.final_file_id,
    prepared_by: min.prepared_by, prepared_by_name: prep.name || min.prepared_by, prepared_by_position: prep.position || '', prepared_at: min.prepared_at,
    submitted_at: min.submitted_at, approved_by: min.approved_by, approved_by_name: app.name || min.approved_by, approved_by_position: app.position || '', approved_at: min.approved_at };
}

function minuteCaps_(session, m, min) {
  var staff = isStaff_(session), open = ['Dijadualkan', 'Sedang Berlangsung', 'Selesai'].indexOf(m.status) !== -1;
  return {
    can_edit: staff && open && (!min || min.status === 'Draf'),
    can_submit: staff && open && Boolean(min) && min.status === 'Draf',
    can_withdraw: staff && Boolean(min) && min.status === 'Untuk Semakan',
    can_approve: Boolean(min) && min.status === 'Untuk Semakan' && (session.role === 'Admin' || isChair_(session, m)),
    can_reopen: session.role === 'Admin' && Boolean(min) && min.status === 'Disahkan',
    can_attach: staff && Boolean(min),
    can_comment: Boolean(min) && min.status === 'Untuk Semakan' && (staff || isChair_(session, m))
  };
}

function apiMinutesGet_(session, data) {
  var m = requireMeetingAccess_(session, data && data.meeting_id);
  var byEmail = usersByEmail_();
  var min = currentMinute_(m.id);
  var visible = minuteVisible_(session, m, min);
  var out = { minute: visible ? shapeMinute_(min, byEmail) : null, caps: minuteCaps_(session, m, visible || isStaff_(session) ? min : null), prev: null };
  if (isStaff_(session)) out.history = minuteRows_(m.id).map(function (r) { return { version: Number(r.version) || 1, status: r.status, submitted_at: r.submitted_at, approved_at: r.approved_at }; });
  if (m.prev_meeting_id) {
    var pm = readTable_('meetings').rows.filter(function (x) { return x.id === m.prev_meeting_id; })[0];
    if (pm) {
      var pmin = currentMinute_(pm.id);
      var pAccess = isStaff_(session) || (pm.status !== 'Draf' && getMembers_(pm.id).some(function (r) { return sameEmail_(r.email, session.email); }));
      out.prev = { meeting_id: pm.id, title: pm.title, bil: pm.bil, tahun: pm.tahun, date: pm.date, minute_status: pmin ? pmin.status : null, accessible: Boolean(pAccess) };
    }
  }
  return out;
}

function requireStaffMinute_(session, meetingId) {
  requireRole_(session, STAFF_ROLES_);
  var m = getMeetingRow_(meetingId);
  if (['Dijadualkan', 'Sedang Berlangsung', 'Selesai'].indexOf(m.status) === -1) throw new ApiError(409, 'Minit hanya boleh disediakan selepas mesyuarat diterbitkan.');
  return m;
}

/** Cipta (versi 1) atau kemas kini draf. Hanya dalam status Draf. */
function apiMinutesSave_(session, data) {
  data = data || {};
  var m = requireStaffMinute_(session, data.meeting_id);
  var content = String(data.content_md === undefined || data.content_md === null ? '' : data.content_md).replace(/\r\n/g, '\n');
  if (content.length > MINUTE_MAX_) throw new ApiError(400, 'Minit terlalu panjang (maksimum ' + MINUTE_MAX_ + ' aksara).');
  var res = withLock_(function () {
    var min = currentMinute_(m.id), now = nowIso_();
    if (!min) {
      var row = { id: genId_('MIN'), meeting_id: m.id, version: 1, status: 'Draf', content_md: content, final_file_id: '', is_current: 'TRUE', prepared_by: session.email, prepared_at: now, submitted_at: '', approved_by: '', approved_at: '' };
      appendObject_('minutes', row); return row;
    }
    if (min.status !== 'Draf') throw new ApiError(409, 'Minit hanya boleh disunting dalam status Draf.' + (min.status === 'Disahkan' ? ' Minit yang Disahkan dikunci; Admin boleh membukanya semula.' : ' Tarik balik ke Draf dahulu.'));
    updateObject_('minutes', min._row, { content_md: content, prepared_by: session.email, prepared_at: now });
    return currentMinute_(m.id);
  });
  return { minute: shapeMinute_(res, usersByEmail_()), saved_at: nowIso_() };
}

function apiMinutesSubmit_(session, data) {
  var m = requireStaffMinute_(session, data && data.meeting_id);
  var min = withLock_(function () {
    var cur = currentMinute_(m.id);
    if (!cur) throw new ApiError(404, 'Belum ada minit. Tulis minit dahulu.');
    if (cur.status !== 'Draf') throw new ApiError(409, 'Hanya minit Draf boleh dihantar untuk semakan.');
    if (String(cur.content_md).trim().length < 20) throw new ApiError(400, 'Minit terlalu pendek untuk dihantar.');
    var patch = { status: 'Untuk Semakan', submitted_at: nowIso_() };
    if (cur.submitted_at) patch.version = (Number(cur.version) || 1) + 1; // dihantar semula selepas ditarik balik: versi naik
    updateObject_('minutes', cur._row, patch);
    audit_(session.email, 'minute.submit', 'minutes', cur.id, 'versi ' + (patch.version || cur.version));
    return currentMinute_(m.id);
  });
  try { notifyMinuteReview_(m, min); } catch (e) { Logger.log('notifyMinuteReview_ gagal: ' + e); }
  return { minute: shapeMinute_(min, usersByEmail_()) };
}

/** Setiausaha menarik balik minit "Untuk Semakan" ke Draf (cth. selepas Pengerusi minta pindaan). */
function apiMinutesWithdraw_(session, data) {
  var m = requireStaffMinute_(session, data && data.meeting_id);
  var min = withLock_(function () {
    var cur = currentMinute_(m.id);
    if (!cur || cur.status !== 'Untuk Semakan') throw new ApiError(409, 'Hanya minit Untuk Semakan boleh ditarik balik.');
    updateObject_('minutes', cur._row, { status: 'Draf' });
    audit_(session.email, 'minute.withdraw', 'minutes', cur.id, 'versi ' + cur.version);
    return currentMinute_(m.id);
  });
  return { minute: shapeMinute_(min, usersByEmail_()) };
}

/** Pengerusi mesyuarat itu atau Admin. Setiausaha tidak boleh mengesahkan. */
function apiMinutesApprove_(session, data) {
  var m = requireMeetingAccess_(session, data && data.meeting_id);
  if (!(session.role === 'Admin' || isChair_(session, m))) throw new ApiError(403, 'Hanya Pengerusi mesyuarat ini boleh mengesahkan minit.');
  var min = withLock_(function () {
    var cur = currentMinute_(m.id);
    if (!cur || cur.status !== 'Untuk Semakan') throw new ApiError(409, 'Hanya minit Untuk Semakan boleh disahkan.');
    updateObject_('minutes', cur._row, { status: 'Disahkan', approved_by: session.email, approved_at: nowIso_() });
    audit_(session.email, 'minute.approve', 'minutes', cur.id, 'versi ' + cur.version);
    return currentMinute_(m.id);
  });
  try { notifyMinuteApproved_(m, min); } catch (e) { Logger.log('notifyMinuteApproved_ gagal: ' + e); }
  return { minute: shapeMinute_(min, usersByEmail_()) };
}

/** Admin sahaja: buka semula minit Disahkan ke Draf (direkod audit). */
function apiMinutesReopen_(session, data) {
  requireRole_(session, ['Admin']);
  var m = getMeetingRow_(data && data.meeting_id);
  var min = withLock_(function () {
    var cur = currentMinute_(m.id);
    if (!cur || cur.status !== 'Disahkan') throw new ApiError(409, 'Hanya minit Disahkan boleh dibuka semula.');
    updateObject_('minutes', cur._row, { status: 'Draf', approved_by: '', approved_at: '' });
    audit_(session.email, 'minute.reopen', 'minutes', cur.id, 'dibuka semula (versi ' + cur.version + ')');
    return currentMinute_(m.id);
  });
  return { minute: shapeMinute_(min, usersByEmail_()) };
}

/** Lampirkan PDF minit bertandatangan (bahan jenis Minit yang sudah dimuat naik) sebagai final_file_id. */
function apiMinutesAttach_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var m = getMeetingRow_(data && data.meeting_id);
  var mat = readTable_('materials').rows.filter(function (r) { return r.id === String(data.material_id || '') && r.meeting_id === m.id; })[0];
  if (!mat || mat.status !== 'Aktif' || mat.type !== 'Minit') throw new ApiError(400, 'Pilih bahan jenis Minit yang Aktif dalam mesyuarat ini.');
  var min = withLock_(function () {
    var cur = currentMinute_(m.id);
    if (!cur) throw new ApiError(409, 'Mulakan minit dahulu sebelum melampirkan PDF bertandatangan.');
    updateObject_('minutes', cur._row, { final_file_id: mat.drive_file_id });
    audit_(session.email, 'minute.attach', 'minutes', cur.id, mat.title.slice(0, 100));
    return currentMinute_(m.id);
  });
  return { minute: shapeMinute_(min, usersByEmail_()) };
}
