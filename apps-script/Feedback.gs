/**
 * Feedback.gs - komen & cadangan (F-07). BSD seksyen 3 `feedback`, 4.3.
 * Visibiliti ditapis di SERVER: "Pengerusi & Setiausaha" hanya dipulangkan kepada Admin/Setiausaha,
 * Pengerusi mesyuarat itu dan penulisnya sendiri.
 */

var FEEDBACK_KINDS_ = ['Komen', 'Cadangan', 'Soalan', 'Bantahan'];
var FEEDBACK_VIS_ = ['Semua', 'Pengerusi & Setiausaha'];
var FEEDBACK_TARGETS_ = ['Mesyuarat', 'Agenda', 'Bahan', 'Minit'];
var FEEDBACK_MAX_ = 3000;

function feedbackRows_(meetingId) {
  return readTable_('feedback').rows.filter(function (r) { return r.meeting_id === meetingId && r.deleted !== 'TRUE'; });
}

/** Komen boleh ditambah semasa Dijadualkan dan Sedang Berlangsung sahaja. */
function commentsOpen_(m) { return m.status === 'Dijadualkan' || m.status === 'Sedang Berlangsung'; }

/** Penulis boleh edit/padam komen sendiri sehingga mesyuarat Selesai (BSD). */
function authorWindowOpen_(m) { return m.status === 'Draf' || commentsOpen_(m); }

function canSeeFeedback_(session, m, fb) {
  if (isStaff_(session)) return true;
  if (fb.visibility === 'Semua') return true;
  return sameEmail_(fb.author_email, session.email) || isChair_(session, m);
}

function restrictedMaterialIds_(meetingId) {
  var set = {};
  readTable_('materials').rows.forEach(function (r) { if (r.meeting_id === meetingId && RESTRICTED_TYPES_.indexOf(r.type) !== -1) set[r.id] = true; });
  return set;
}

function shapeFeedback_(session, m, fb, byEmail, photos) {
  var key = looseEmail_(fb.author_email);
  var u = byEmail[key] || {};
  var mine = sameEmail_(fb.author_email, session.email);
  return {
    id: fb.id, target_type: fb.target_type, target_id: fb.target_id, kind: fb.kind, content: fb.content, visibility: fb.visibility,
    author_email: fb.author_email, author_name: u.name || fb.author_email, author_position: u.position || '', photo: photos[key] || '',
    created_at: fb.created_at, updated_at: fb.updated_at, edited: fb.updated_at !== fb.created_at, mine: mine,
    can_edit: mine && authorWindowOpen_(m), can_delete: (mine && authorWindowOpen_(m)) || isStaff_(session)
  };
}

function apiFeedbackList_(session, data) {
  data = data || {};
  var m = requireMeetingAccess_(session, data.meeting_id);
  var byEmail = usersByEmail_(), photos = getPhotos_();
  var hideRestricted = !isStaff_(session) && !isChair_(session, m);
  var restricted = hideRestricted ? restrictedMaterialIds_(m.id) : {};
  var rows = feedbackRows_(m.id).filter(function (r) {
    if (!canSeeFeedback_(session, m, r)) return false;
    if (hideRestricted && r.target_type === 'Bahan' && restricted[r.target_id]) return false; // elak bocor kewujudan Bahan Bicara
    if (data.target_type && r.target_type !== data.target_type) return false;
    if (data.target_id && r.target_id !== data.target_id) return false;
    return true;
  }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : (a.created_at > b.created_at ? 1 : 0); });
  return { feedback: rows.map(function (r) { return shapeFeedback_(session, m, r, byEmail, photos); }), can_comment: commentsOpen_(m), fbrev: getState_(m.id).fbrev };
}

/** Sasaran mesti wujud dalam mesyuarat itu dan boleh dilihat oleh penulis. */
function validateFeedbackTarget_(session, m, type, id) {
  if (type === 'Mesyuarat') return m.id;
  if (type === 'Minit') throw new ApiError(400, 'Komen pada minit belum tersedia.');
  if (type === 'Agenda') { getAgendaRow_(id, m.id); return id; }
  if (type === 'Bahan') {
    var mat = readTable_('materials').rows.filter(function (r) { return r.id === id && r.meeting_id === m.id; })[0];
    if (!mat || !canSeeMaterial_(session, m, mat)) throw new ApiError(404, 'Bahan tidak dijumpai dalam mesyuarat ini.');
    return id;
  }
  throw new ApiError(400, 'Jenis sasaran tidak sah.');
}

function cleanFeedbackContent_(v) {
  var s = String(v === undefined || v === null ? '' : v).replace(/\r\n/g, '\n').trim();
  if (!s) throw new ApiError(400, 'Kandungan komen wajib diisi.');
  if (s.length > FEEDBACK_MAX_) throw new ApiError(400, 'Komen terlalu panjang (maksimum ' + FEEDBACK_MAX_ + ' aksara).');
  return s;
}

function apiFeedbackAdd_(session, data) {
  data = data || {};
  var m = requireMeetingAccess_(session, data.meeting_id);
  if (!commentsOpen_(m)) throw new ApiError(409, 'Komen hanya boleh ditambah semasa mesyuarat Dijadualkan atau Sedang Berlangsung.');
  var type = cleanEnum_(data.target_type || 'Mesyuarat', FEEDBACK_TARGETS_, 'Sasaran');
  var targetId = validateFeedbackTarget_(session, m, type, String(data.target_id || ''));
  var kind = cleanEnum_(data.kind || 'Komen', FEEDBACK_KINDS_, 'Jenis');
  var vis = cleanEnum_(data.visibility || 'Semua', FEEDBACK_VIS_, 'Visibiliti');
  var content = cleanFeedbackContent_(data.content);
  var row = withLock_(function () {
    var now = nowIso_();
    var r = { id: genId_('FBK'), meeting_id: m.id, target_type: type, target_id: targetId, kind: kind, content: content, visibility: vis,
      author_email: session.email, created_at: now, updated_at: now, deleted: 'FALSE' };
    appendObject_('feedback', r);
    return r;
  });
  touchState_(m.id, true);
  return { feedback: shapeFeedback_(session, m, row, usersByEmail_(), getPhotos_()) };
}

function getFeedbackRow_(id) {
  var r = readTable_('feedback').rows.filter(function (x) { return x.id === String(id || '') && x.deleted !== 'TRUE'; })[0];
  if (!r) throw new ApiError(404, 'Komen tidak dijumpai.');
  return r;
}

/** Penulis sahaja (BSD: U sendiri), dalam tempoh dibenarkan. */
function apiFeedbackUpdate_(session, data) {
  data = data || {};
  var fb = getFeedbackRow_(data.id);
  var m = requireMeetingAccess_(session, fb.meeting_id);
  if (!sameEmail_(fb.author_email, session.email)) throw new ApiError(403, 'Anda hanya boleh menyunting komen anda sendiri.');
  if (!authorWindowOpen_(m)) throw new ApiError(409, 'Komen tidak boleh disunting selepas mesyuarat Selesai.');
  var patch = { updated_at: nowIso_() };
  if (data.content !== undefined) patch.content = cleanFeedbackContent_(data.content);
  if (data.kind !== undefined) patch.kind = cleanEnum_(data.kind, FEEDBACK_KINDS_, 'Jenis');
  if (data.visibility !== undefined) patch.visibility = cleanEnum_(data.visibility, FEEDBACK_VIS_, 'Visibiliti');
  withLock_(function () { updateObject_('feedback', getFeedbackRow_(fb.id)._row, patch); });
  touchState_(m.id, true);
  return { feedback: shapeFeedback_(session, m, getFeedbackRow_(fb.id), usersByEmail_(), getPhotos_()) };
}

/** Penulis (dalam tempoh) atau Admin / Setiausaha (mana-mana, direkod audit). Padam = tandakan. */
function apiFeedbackDelete_(session, data) {
  var fb = getFeedbackRow_(data && data.id);
  var m = requireMeetingAccess_(session, fb.meeting_id);
  var own = sameEmail_(fb.author_email, session.email);
  if (own && !isStaff_(session) && !authorWindowOpen_(m)) throw new ApiError(409, 'Komen tidak boleh dipadam selepas mesyuarat Selesai.');
  if (!own && !isStaff_(session)) throw new ApiError(403, 'Anda hanya boleh memadam komen anda sendiri.');
  withLock_(function () {
    updateObject_('feedback', getFeedbackRow_(fb.id)._row, { deleted: 'TRUE', updated_at: nowIso_() });
    if (!own) audit_(session.email, 'feedback.delete', 'feedback', fb.id, 'Komen oleh ' + fb.author_email);
  });
  touchState_(m.id, true);
  return { id: fb.id };
}
