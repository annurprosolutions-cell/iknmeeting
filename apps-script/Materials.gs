/**
 * Materials.gs - dokumen mesyuarat (F-05). BSD seksyen 3 `materials`, 4.3, 5.
 * Muat naik melalui app (base64), daftar pautan Drive, imbas folder, versi, arkib.
 * Jenis "Bahan Bicara" terhad kepada Pengerusi mesyuarat itu dan Admin/Setiausaha (folder Drive berasingan).
 */

var MATERIAL_TYPES_ = ['Surat Jemputan', 'Memo', 'Agenda', 'Kertas Cadangan', 'Kertas Makluman', 'Kertas Laporan', 'Bahan Bicara', 'Minit', 'Maklum Balas', 'Slaid', 'Lampiran', 'Lain-lain'];
var RESTRICTED_TYPES_ = ['Bahan Bicara'];
var MIME_BY_EXT_ = {
  pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint', doc: 'application/msword', xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', png: 'image/png', jpg: 'image/jpeg'
};

// ---------- Pembantu ----------

function extOf_(name) {
  var m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || ''));
  var e = m ? m[1].toLowerCase() : '';
  return e === 'jpeg' ? 'jpg' : e;
}

function allowedExts_() {
  return String(getSettings_().allowed_mime || 'pdf,pptx,ppt,docx,doc,xlsx,xls,png,jpg').split(',').map(function (x) { return x.trim().toLowerCase(); });
}

function maxUploadBytes_() { return Number(getSettings_().max_upload_mb || 20) * 1024 * 1024; }

/** Semak beberapa bait pertama sepadan dengan sambungan fail (halang .exe yang dinamakan semula). */
function magicOk_(ext, bytes) {
  var b = function (i) { return bytes[i] === undefined ? -1 : (bytes[i] & 0xff); };
  if (ext === 'pdf') return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
  if (ext === 'png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if (ext === 'jpg') return b(0) === 0xff && b(1) === 0xd8;
  if (['pptx', 'docx', 'xlsx'].indexOf(ext) !== -1) return b(0) === 0x50 && b(1) === 0x4b;
  if (['ppt', 'doc', 'xls'].indexOf(ext) !== -1) return b(0) === 0xd0 && b(1) === 0xcf && b(2) === 0x11 && b(3) === 0xe0;
  return false;
}

function decodeUpload_(data) {
  var name = cleanStr_(data.file_name, 255, 'Nama fail', true).replace(/[\/\\]/g, '_');
  var ext = extOf_(name);
  if (!ext || allowedExts_().indexOf(ext) === -1) {
    throw new ApiError(400, 'Jenis fail tidak dibenarkan. Dibenarkan: ' + allowedExts_().join(', ') + '.');
  }
  if (typeof data.data_base64 !== 'string' || !data.data_base64) throw new ApiError(400, 'Fail tiada kandungan.');
  var bytes;
  try { bytes = Utilities.base64Decode(data.data_base64); } catch (e) { throw new ApiError(400, 'Fail rosak (base64 tidak sah).'); }
  if (!bytes.length) throw new ApiError(400, 'Fail kosong.');
  if (bytes.length > maxUploadBytes_()) {
    throw new ApiError(400, 'Fail terlalu besar (maksimum ' + (maxUploadBytes_() / 1048576) + ' MB). Letak fail terus dalam folder Drive mesyuarat, kemudian tekan "Imbas folder Drive".');
  }
  if (!magicOk_(ext, bytes)) throw new ApiError(400, 'Kandungan fail tidak sepadan dengan jenis .' + ext + '.');
  return { name: name, ext: ext, mime: MIME_BY_EXT_[ext], bytes: bytes };
}

function driveFileName_(agendaSeq, type, title, version, ext) {
  var slug = function (t, n) { return String(t).replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); };
  var seq = agendaSeq ? ('0' + agendaSeq).slice(-2) : '00';
  return seq + '_' + slug(type, 20) + '_' + slug(title, 40) + '_v' + version + '.' + ext;
}

function targetFolder_(m, type) {
  if (RESTRICTED_TYPES_.indexOf(type) !== -1) {
    var f = getRestrictedFolder_(m.id, true);
    // Jika mesyuarat sudah terbit, pastikan pengerusi boleh buka (idempoten)
    if (STATUS_WITH_FOLDER_ACCESS_.indexOf(m.status) !== -1 && m.pengerusi_email && isActiveUser_(m.pengerusi_email)) driveShare_(f.getId(), m.pengerusi_email);
    return f;
  }
  return DriveApp.getFolderById(m.drive_folder_id);
}

function getAgendaRow_(agendaId, meetingId) {
  var r = readTable_('agenda_items').rows.filter(function (x) { return x.id === agendaId && x.meeting_id === meetingId; })[0];
  if (!r) throw new ApiError(404, 'Item agenda tidak dijumpai dalam mesyuarat ini.');
  return r;
}

function getMaterialRow_(id) {
  var r = readTable_('materials').rows.filter(function (x) { return x.id === String(id || ''); })[0];
  if (!r) throw new ApiError(404, 'Bahan tidak dijumpai.');
  return r;
}

function isChair_(session, m) { return Boolean(m.pengerusi_email) && m.pengerusi_email === session.email; }

function canSeeMaterial_(session, m, mat) {
  if (isStaff_(session)) return true;
  if (mat.status !== 'Aktif') return false;
  if (RESTRICTED_TYPES_.indexOf(mat.type) !== -1) return isChair_(session, m);
  return true;
}

/**
 * Kebenaran tambah/urus: Admin/Setiausaha sentiasa. Pembentang (Ahli): hanya bahan pada item yang dia bentang,
 * dan hanya bahan yang dia muat naik sendiri; tidak boleh jenis terhad.
 */
function requireMaterialWrite_(session, type, agenda, existing) {
  if (isStaff_(session)) return;
  var ok = agenda && agenda.presenter_email === session.email && RESTRICTED_TYPES_.indexOf(type) === -1 && (!existing || existing.uploaded_by === session.email);
  if (!ok) throw new ApiError(403, 'Anda hanya boleh menguruskan bahan pada item agenda yang anda bentang.');
}

function shapeMaterial_(r, byEmail) {
  var u = byEmail[r.uploaded_by];
  return { id: r.id, agenda_id: r.agenda_id, type: r.type, title: r.title, drive_file_id: r.drive_file_id, file_name: r.file_name,
    mime_type: r.mime_type, size_bytes: r.size_bytes ? Number(r.size_bytes) : null, version: Number(r.version) || 1, status: r.status,
    replaces_id: r.replaces_id, uploaded_by: r.uploaded_by, uploaded_by_name: u ? u.name : r.uploaded_by, uploaded_at: r.uploaded_at,
    restricted: RESTRICTED_TYPES_.indexOf(r.type) !== -1 };
}

/** Untuk meetings.get: tapis di server. Versi lama dan arkib hanya kepada Admin/Setiausaha. */
function listMaterialsFor_(session, m, byEmail) {
  return readTable_('materials').rows
    .filter(function (r) { return r.meeting_id === m.id && canSeeMaterial_(session, m, r); })
    .sort(function (a, b) { return a.uploaded_at < b.uploaded_at ? -1 : 1; })
    .map(function (r) { return shapeMaterial_(r, byEmail); });
}

function insertMaterial_(session, m, f) {
  return withLock_(function () {
    var row = { id: genId_('MAT'), meeting_id: m.id, agenda_id: f.agenda_id || '', type: f.type, title: f.title, drive_file_id: f.drive_file_id,
      file_name: f.file_name, mime_type: f.mime_type, size_bytes: f.size_bytes || '', version: f.version || 1, status: 'Aktif',
      replaces_id: f.replaces_id || '', uploaded_by: session.email, uploaded_at: nowIso_() };
    appendObject_('materials', row);
    return row;
  });
}

function requireOpenMeeting_(m) {
  if (m.status === 'Dibatalkan') throw new ApiError(409, 'Mesyuarat ini telah dibatalkan.');
}

// ---------- API ----------

function apiMaterialsUpload_(session, data) {
  data = data || {};
  var m = requireMeetingAccess_(session, data.meeting_id);
  requireOpenMeeting_(m);
  var type = cleanEnum_(data.type, MATERIAL_TYPES_, 'Jenis dokumen');
  var agenda = data.agenda_id ? getAgendaRow_(String(data.agenda_id), m.id) : null;
  requireMaterialWrite_(session, type, agenda, null);
  var file = decodeUpload_(data);
  var title = cleanStr_(data.title || file.name.replace(/\.[^.]+$/, ''), 200, 'Tajuk', true);
  var folder = targetFolder_(m, type);
  var driveFile = folder.createFile(Utilities.newBlob(file.bytes, file.mime, driveFileName_(agenda ? Number(agenda.seq) : 0, type, title, 1, file.ext)));
  var row = insertMaterial_(session, m, { agenda_id: agenda ? agenda.id : '', type: type, title: title, drive_file_id: driveFile.getId(),
    file_name: file.name, mime_type: file.mime, size_bytes: file.bytes.length, version: 1 });
  audit_(session.email, 'material.upload', 'materials', row.id, type + ': ' + title.slice(0, 100));
  return { id: row.id };
}

function parseDriveId_(s) {
  s = String(s || '').trim();
  var m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
}

function fileInFolder_(file, folderId) {
  var it = file.getParents();
  while (it.hasNext()) if (it.next().getId() === folderId) return true;
  return false;
}

function registerDriveFile_(session, m, file, type, title, agendaId) {
  var ext = extOf_(file.getName());
  if (!ext || allowedExts_().indexOf(ext) === -1) throw new ApiError(400, 'Jenis fail tidak dibenarkan: ' + file.getName());
  var row = insertMaterial_(session, m, { agenda_id: agendaId, type: type, title: title || file.getName().replace(/\.[^.]+$/, '').slice(0, 200),
    drive_file_id: file.getId(), file_name: file.getName(), mime_type: MIME_BY_EXT_[ext], size_bytes: file.getSize(), version: 1 });
  audit_(session.email, 'material.register', 'materials', row.id, type + ': ' + file.getName().slice(0, 100));
  return row;
}

/**
 * Admin / Setiausaha. Dua mod:
 *  - {file: <pautan atau ID Drive>}: daftar satu fail yang MESTI berada dalam folder mesyuarat.
 *  - {scan: true}: daftar semua fail dalam folder mesyuarat yang belum didaftar (jenis Lain-lain; tukar kemudian).
 */
function apiMaterialsRegister_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  data = data || {};
  var m = getMeetingRow_(data.meeting_id);
  requireOpenMeeting_(m);
  var known = {};
  readTable_('materials').rows.forEach(function (r) { known[r.drive_file_id] = true; });

  if (data.scan) {
    var added = 0, skipped = [], already = 0;
    var it = DriveApp.getFolderById(m.drive_folder_id).getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (known[f.getId()]) { already++; continue; }
      try { registerDriveFile_(session, m, f, 'Lain-lain', '', ''); added++; }
      catch (e) { if (!(e instanceof ApiError)) throw e; skipped.push({ name: f.getName(), reason: e.message }); }
    }
    return { added: added, already: already, skipped: skipped };
  }

  var type = cleanEnum_(data.type || 'Lain-lain', MATERIAL_TYPES_, 'Jenis dokumen');
  if (RESTRICTED_TYPES_.indexOf(type) !== -1) throw new ApiError(400, 'Bahan Bicara mesti dimuat naik melalui butang muat naik.');
  var id = parseDriveId_(data.file);
  if (!id) throw new ApiError(400, 'Pautan atau ID fail Drive tidak sah.');
  if (known[id]) throw new ApiError(409, 'Fail ini sudah didaftarkan.');
  var file;
  try { file = DriveApp.getFileById(id); } catch (e) { throw new ApiError(400, 'Fail tidak dapat dicapai. Pastikan ia berada dalam folder mesyuarat ini.'); }
  if (!fileInFolder_(file, m.drive_folder_id)) throw new ApiError(400, 'Fail mesti diletakkan dalam folder Drive mesyuarat ini dahulu.');
  var agendaId = data.agenda_id ? getAgendaRow_(String(data.agenda_id), m.id).id : '';
  var row = registerDriveFile_(session, m, file, type, cleanStr_(data.title, 200, 'Tajuk', false), agendaId);
  return { id: row.id };
}

/** Versi baharu: baris baharu version+1, versi lama jadi Digantikan. */
function apiMaterialsReplace_(session, data) {
  data = data || {};
  var old = getMaterialRow_(data.id);
  var m = requireMeetingAccess_(session, old.meeting_id);
  requireOpenMeeting_(m);
  if (old.status !== 'Aktif') throw new ApiError(409, 'Hanya versi Aktif boleh diganti.');
  var agenda = old.agenda_id ? getAgendaRow_(old.agenda_id, m.id) : null;
  requireMaterialWrite_(session, old.type, agenda, old);
  var file = decodeUpload_(data);
  var version = Number(old.version) + 1;
  var driveFile = targetFolder_(m, old.type).createFile(Utilities.newBlob(file.bytes, file.mime, driveFileName_(agenda ? Number(agenda.seq) : 0, old.type, old.title, version, file.ext)));
  var row = withLock_(function () {
    var cur = getMaterialRow_(old.id);
    if (cur.status !== 'Aktif') throw new ApiError(409, 'Bahan ini telah diganti oleh pengguna lain. Muat semula.');
    updateObject_('materials', cur._row, { status: 'Digantikan' });
    return insertMaterial_(session, m, { agenda_id: old.agenda_id, type: old.type, title: old.title, drive_file_id: driveFile.getId(),
      file_name: file.name, mime_type: file.mime, size_bytes: file.bytes.length, version: version, replaces_id: old.id });
  });
  audit_(session.email, 'material.replace', 'materials', row.id, old.title.slice(0, 80) + ' v' + version);
  return { id: row.id, version: version };
}

function apiMaterialsArchive_(session, data) {
  var mat = getMaterialRow_(data && data.id);
  var m = requireMeetingAccess_(session, mat.meeting_id);
  var agenda = mat.agenda_id ? getAgendaRow_(mat.agenda_id, m.id) : null;
  requireMaterialWrite_(session, mat.type, agenda, mat);
  withLock_(function () {
    var cur = getMaterialRow_(mat.id);
    updateObject_('materials', cur._row, { status: 'Diarkib' });
    audit_(session.email, 'material.archive', 'materials', mat.id, mat.title.slice(0, 100));
  });
  return { id: mat.id, status: 'Diarkib' };
}

/** Tukar tajuk / jenis / item agenda. Admin / Setiausaha. Jenis terhad tidak boleh ditukar kerana fail berada di folder lain. */
function apiMaterialsUpdate_(session, data) {
  requireRole_(session, STAFF_ROLES_);
  data = data || {};
  var mat = getMaterialRow_(data.id);
  var m = getMeetingRow_(mat.meeting_id);
  var type = cleanEnum_(data.type || mat.type, MATERIAL_TYPES_, 'Jenis dokumen');
  if (type !== mat.type && (RESTRICTED_TYPES_.indexOf(type) !== -1 || RESTRICTED_TYPES_.indexOf(mat.type) !== -1)) {
    throw new ApiError(400, 'Jenis Bahan Bicara tidak boleh ditukar. Muat naik semula dengan jenis yang betul.');
  }
  var title = cleanStr_(data.title !== undefined ? data.title : mat.title, 200, 'Tajuk', true);
  var agendaId = data.agenda_id === undefined ? mat.agenda_id : (data.agenda_id ? getAgendaRow_(String(data.agenda_id), m.id).id : '');
  withLock_(function () {
    updateObject_('materials', getMaterialRow_(mat.id)._row, { type: type, title: title, agenda_id: agendaId });
    audit_(session.email, 'material.update', 'materials', mat.id, type + ': ' + title.slice(0, 100));
  });
  return { id: mat.id };
}

/** Rekod pembukaan bahan (audit material.open). Bahan terhad ditolak untuk selain pengerusi dan staf. */
function apiMaterialsLogOpen_(session, data) {
  var mat = getMaterialRow_(data && data.id);
  var m = requireMeetingAccess_(session, mat.meeting_id);
  if (!canSeeMaterial_(session, m, mat)) throw new ApiError(403, 'Anda tidak dibenarkan membuka bahan ini.');
  audit_(session.email, 'material.open', 'materials', mat.id, mat.title.slice(0, 100));
  return { id: mat.id };
}
