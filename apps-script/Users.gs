/**
 * Users.gs - profil sendiri dan pengurusan pengguna (F-09). BSD seksyen 3 `users`, 4.3.
 */

var ROLES_ = ['Admin', 'Setiausaha', 'Pengerusi', 'Ahli'];
var USER_STATUS_ = ['Aktif', 'Tidak Aktif'];
var IMPORT_MAX_LINES_ = 200;

function apiMeGet_(session) {
  return { user: publicUser_(session), settings: publicSettings_() };
}

/**
 * Admin: senarai penuh (dibaca terus dari Sheet).
 * Setiausaha / Pengerusi: subset pengguna Aktif untuk pilih ahli (nama, emel, jawatan; Setiausaha juga role supaya boleh pilih Pengerusi).
 * Ahli: ditolak.
 */
function apiUsersList_(session) {
  requireRole_(session, ['Admin', 'Setiausaha', 'Pengerusi']);
  if (session.role === 'Admin') {
    var rows = readTable_('users').rows.map(function (r) { var o = stripRow_(r); o.photo = r.photo || ''; return o; });
    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { users: rows };
  }
  var photos = getPhotos_();
  var list = getUsers_().filter(function (u) { return u.status === 'Aktif'; }).map(function (u) {
    var o = { email: u.email, name: u.name, position: u.position, photo: photos[u.email] || '' };
    if (session.role === 'Setiausaha') o.role = u.role;
    return o;
  });
  list.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return { users: list };
}

function countActiveAdmins_(users) {
  return users.filter(function (u) { return u.role === 'Admin' && u.status === 'Aktif'; }).length;
}

/** Selepas role/status berubah: laras akses Drive (dipanggil di luar lock kerana Drive perlahan). */
function afterUserChanged_(email) {
  try { syncUserDriveAccess_(email); } catch (e) { Logger.log('syncUserDriveAccess_ gagal: ' + e); }
}

function apiUsersSave_(session, data) {
  requireRole_(session, ['Admin']);
  data = data || {};
  var email = normEmail_(data.email);
  var name = cleanStr_(data.name, 100, 'Nama', true);
  var position = cleanStr_(data.position, 120, 'Jawatan', false);
  var role = cleanEnum_(data.role || 'Ahli', ROLES_, 'Role');
  var status = cleanEnum_(data.status || 'Aktif', USER_STATUS_, 'Status');
  var photo;
  if (data.photo !== undefined) {
    photo = String(data.photo || '');
    if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(photo) || photo.length > 30000)) {
      throw new ApiError(400, 'Gambar tidak sah atau terlalu besar.');
    }
  }

  var driveChanged = false;
  var result = withLock_(function () {
    var table = readTable_('users');
    var existing = table.rows.filter(function (r) { return r.email === email; })[0];
    var after = table.rows.map(function (r) {
      return r.email === email ? { email: email, role: role, status: status } : r;
    });
    if (!existing) after.push({ email: email, role: role, status: status });
    if (countActiveAdmins_(after) < 1) {
      throw new ApiError(409, 'Mesti sentiasa ada sekurang-kurangnya 1 Admin yang Aktif.');
    }

    if (existing) {
      var patch = { name: name, position: position, role: role, status: status };
      if (photo !== undefined) patch.photo = photo;
      updateObject_('users', existing._row, patch);
      var action = (existing.status === 'Aktif' && status === 'Tidak Aktif') ? 'user.deactivate' : 'user.update';
      var detail = action === 'user.deactivate' ? 'Dinyahaktifkan' :
        (existing.role !== role ? 'Role ' + existing.role + ' -> ' + role : 'Kemas kini');
      invalidateUsers_();
      audit_(session.email, action, 'users', email, detail);
      driveChanged = existing.role !== role || existing.status !== status;
      return { created: false, email: email };
    }
    appendObject_('users', {
      email: email, name: name, position: position, role: role, status: status,
      created_at: nowIso_(), created_by: session.email, last_login: '', photo: photo || ''
    });
    invalidateUsers_();
    audit_(session.email, 'user.create', 'users', email, 'Role ' + role);
    driveChanged = role === 'Admin' || role === 'Setiausaha';
    return { created: true, email: email };
  });
  if (driveChanged) afterUserChanged_(email);
  return result;
}

function apiUsersDeactivate_(session, data) {
  requireRole_(session, ['Admin']);
  var email = normEmail_(data && data.email);
  var changed = false;
  var out = withLock_(function () {
    var table = readTable_('users');
    var row = table.rows.filter(function (r) { return r.email === email; })[0];
    if (!row) throw new ApiError(404, 'Pengguna tidak dijumpai.');
    if (row.status === 'Tidak Aktif') return { email: email, status: 'Tidak Aktif' };
    var after = table.rows.map(function (r) {
      return r.email === email ? { role: r.role, status: 'Tidak Aktif' } : r;
    });
    if (countActiveAdmins_(after) < 1) {
      throw new ApiError(409, 'Mesti sentiasa ada sekurang-kurangnya 1 Admin yang Aktif.');
    }
    updateObject_('users', row._row, { status: 'Tidak Aktif' });
    invalidateUsers_();
    audit_(session.email, 'user.deactivate', 'users', email, 'Dinyahaktifkan');
    changed = true;
    return { email: email, status: 'Tidak Aktif' };
  });
  if (changed) afterUserChanged_(email);
  return out;
}

/**
 * Import senarai tampalan. Setiap baris: emel, nama, jawatan, role (dipisah tab, koma atau bertitik koma).
 * Pengguna yang sudah wujud dilangkau (tidak ditimpa).
 */
function apiUsersImport_(session, data) {
  requireRole_(session, ['Admin']);
  var text = String((data && data.text) || '');
  if (text.length > 100000) throw new ApiError(400, 'Teks terlalu panjang.');
  var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  if (!lines.length) throw new ApiError(400, 'Tiada data untuk diimport.');
  if (lines.length > IMPORT_MAX_LINES_) throw new ApiError(400, 'Maksimum ' + IMPORT_MAX_LINES_ + ' baris sekali import.');

  var roleMap = {};
  ROLES_.forEach(function (r) { roleMap[r.toLowerCase()] = r; });

  var added = [];
  var out = withLock_(function () {
    var existing = {};
    readTable_('users').rows.forEach(function (r) { existing[r.email] = true; });
    var toAdd = [], skipped = [];
    var now = nowIso_();

    lines.forEach(function (line, idx) {
      var sep = line.indexOf('\t') !== -1 ? '\t' : (line.indexOf(';') !== -1 ? ';' : ',');
      var f = line.split(sep).map(function (x) { return x.trim(); });
      if (idx === 0 && f[0].indexOf('@') === -1) return; // baris tajuk
      var n = idx + 1;
      try {
        var email = normEmail_(f[0]);
        var name = cleanStr_(f[1], 100, 'Nama', true);
        var position = cleanStr_(f[2], 120, 'Jawatan', false);
        var role = f[3] ? roleMap[f[3].toLowerCase()] : 'Ahli';
        if (!role) throw new ApiError(400, 'Role tidak sah: ' + f[3].slice(0, 30));
        if (existing[email]) throw new ApiError(409, 'Sudah wujud: ' + email);
        existing[email] = true;
        toAdd.push({
          email: email, name: name, position: position, role: role, status: 'Aktif',
          created_at: now, created_by: session.email, last_login: ''
        });
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        skipped.push({ line: n, reason: e.message });
      }
    });

    appendObjects_('users', toAdd);
    if (toAdd.length) invalidateUsers_();
    audit_(session.email, 'user.import', 'users', '', toAdd.length + ' ditambah, ' + skipped.length + ' dilangkau');
    added = toAdd;
    return { added: toAdd.length, skipped: skipped };
  });
  added.forEach(function (u) { if (u.role === 'Admin' || u.role === 'Setiausaha') afterUserChanged_(u.email); });
  return out;
}
