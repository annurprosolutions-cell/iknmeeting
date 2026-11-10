/**
 * Agenda.gs - editor agenda (F-04). BSD seksyen 3 `agenda_items`, 4.3.
 */

var AGENDA_CATEGORIES_ = ['Makluman', 'Perbincangan', 'Keputusan', 'Pengesahan'];
var AGENDA_STATUS_ = ['Belum', 'Sedang Dibincang', 'Selesai', 'Ditangguh'];

function agendaRows_(meetingId) {
  return readTable_('agenda_items').rows.filter(function (r) { return r.meeting_id === meetingId; })
    .sort(function (a, b) { return Number(a.seq) - Number(b.seq); });
}

function requireAgendaEditable_(session, m) {
  if (m.status === 'Dibatalkan') throw new ApiError(409, 'Mesyuarat yang dibatalkan tidak boleh disunting.');
  if (m.status === 'Selesai' && session.role !== 'Admin') throw new ApiError(403, 'Hanya Admin boleh menyunting agenda mesyuarat yang sudah Selesai.');
}

/** Tambah (tanpa id) atau kemas kini satu item. */
function apiAgendaSave_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  data = data || {};
  var m = getMeetingRow_(data.meeting_id);
  requireAgendaEditable_(session, m);
  var title = cleanStr_(data.title, 200, 'Tajuk item', true);
  var description = cleanStr_(data.description, 2000, 'Keterangan', false);
  var category = cleanEnum_(data.category || 'Perbincangan', AGENDA_CATEGORIES_, 'Kategori');
  var presenter = '';
  if (data.presenter_email) {
    presenter = normEmail_(data.presenter_email, 'Emel pembentang');
    var isMember = getMembers_(m.id).some(function (r) { return r.email === presenter; });
    if (!isMember || !isActiveUser_(presenter)) throw new ApiError(400, 'Pembentang mesti ahli mesyuarat yang Aktif.');
  }
  var duration = '';
  if (data.duration_min !== undefined && data.duration_min !== null && String(data.duration_min) !== '') {
    var d = Number(data.duration_min);
    if (!isFinite(d) || d % 1 !== 0 || d < 1 || d > 480) throw new ApiError(400, 'Tempoh mesti nombor bulat 1 hingga 480 minit.');
    duration = d;
  }
  return withLock_(function () {
    var now = nowIso_();
    if (data.id) {
      var row = agendaRows_(m.id).filter(function (r) { return r.id === data.id; })[0];
      if (!row) throw new ApiError(404, 'Item agenda tidak dijumpai.');
      updateObject_('agenda_items', row._row, { title: title, description: description, category: category, presenter_email: presenter, duration_min: duration, updated_by: session.email, updated_at: now });
      return { id: row.id };
    }
    var rows = agendaRows_(m.id);
    if (rows.length >= 100) throw new ApiError(400, 'Maksimum 100 item agenda.');
    var id = genId_('AGD');
    appendObject_('agenda_items', { id: id, meeting_id: m.id, seq: rows.length + 1, title: title, description: description, category: category,
      presenter_email: presenter, duration_min: duration, status: 'Belum', updated_by: session.email, updated_at: now });
    return { id: id };
  });
}

/** Buang item. Bahan yang dikaitkan kekal tetapi dilepaskan daripada item. Item dinomborkan semula. */
function apiAgendaDelete_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var m = getMeetingRow_(data && data.meeting_id);
  requireAgendaEditable_(session, m);
  withLock_(function () {
    var rows = agendaRows_(m.id);
    var row = rows.filter(function (r) { return r.id === data.id; })[0];
    if (!row) throw new ApiError(404, 'Item agenda tidak dijumpai.');
    deleteRows_('agenda_items', [row._row]);
    agendaRows_(m.id).forEach(function (r, i) { if (Number(r.seq) !== i + 1) updateObject_('agenda_items', r._row, { seq: i + 1 }); });
    readTable_('materials').rows.forEach(function (x) { if (x.meeting_id === m.id && x.agenda_id === row.id) updateObject_('materials', x._row, { agenda_id: '' }); });
    audit_(session.email, 'agenda.delete', 'agenda_items', row.id, row.title.slice(0, 100));
  });
  return { id: data.id };
}

/** ids mesti tepat susunan baharu bagi semua item mesyuarat itu. */
function apiAgendaReorder_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  var m = getMeetingRow_(data && data.meeting_id);
  requireAgendaEditable_(session, m);
  var ids = data.ids;
  if (!Array.isArray(ids)) throw new ApiError(400, 'Senarai susunan tidak sah.');
  withLock_(function () {
    var rows = agendaRows_(m.id);
    var have = {}; rows.forEach(function (r) { have[r.id] = r; });
    var seen = {};
    if (ids.length !== rows.length || ids.some(function (i) { var bad = !have[i] || seen[i]; seen[i] = true; return bad; })) {
      throw new ApiError(400, 'Susunan tidak sepadan dengan item semasa. Muat semula halaman.');
    }
    ids.forEach(function (id, i) { if (Number(have[id].seq) !== i + 1) updateObject_('agenda_items', have[id]._row, { seq: i + 1, updated_by: session.email, updated_at: nowIso_() }); });
  });
  return { count: ids.length };
}

/** Admin / Setiausaha, atau Pengerusi mesyuarat itu. */
function apiAgendaSetStatus_(session, data) {
  var m = requireMeetingAccess_(session, data && data.meeting_id, { chairOnly: true });
  var status = cleanEnum_(data.status, AGENDA_STATUS_, 'Status');
  withLock_(function () {
    var row = agendaRows_(m.id).filter(function (r) { return r.id === data.id; })[0];
    if (!row) throw new ApiError(404, 'Item agenda tidak dijumpai.');
    updateObject_('agenda_items', row._row, { status: status, updated_by: session.email, updated_at: nowIso_() });
  });
  return { id: data.id, status: status };
}
