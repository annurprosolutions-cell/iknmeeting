/**
 * Auth.gs - login Google, sesi, semakan role (TRD seksyen 5, BSD 4.2).
 */

var SESSION_TTL_ = 21600;      // 6 jam (had maksimum CacheService)
var FAIL_WINDOW_ = 600;        // 10 minit
var FAIL_LIMIT_EMAIL_ = 10;    // ikut TRD: 10 kegagalan / 10 minit setiap emel
var FAIL_LIMIT_GLOBAL_ = 50;   // lebih longgar daripada emel supaya satu penyerang tidak boleh kunci semua orang

// ---------- Pengguna (cache 5 minit) ----------

function getUsers_() {
  var c = cacheGet_('users_v1');
  if (c) return c;
  var list = readTable_('users').rows.map(stripRow_);
  cachePut_('users_v1', list, 300);
  return list;
}

function invalidateUsers_() { cacheRemove_('users_v1'); invalidatePhotos_(); }

function stripRow_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row' && k !== 'photo') c[k] = o[k]; });
  return c;
}

/** Gambar profil (data URL kecil) disimpan berasingan supaya cache pengguna kekal < 100KB. */
function getPhotos_() {
  var c = cacheGet_('photos_v1');
  if (c) return c;
  var map = {};
  readTable_('users').rows.forEach(function (r) { if (r.photo) map[r.email] = r.photo; });
  cachePut_('photos_v1', map, 300);
  return map;
}

function invalidatePhotos_() { cacheRemove_('photos_v1'); }

function findUser_(email) {
  var e = String(email || '').trim().toLowerCase();
  var list = getUsers_();
  for (var i = 0; i < list.length; i++) if (list[i].email === e) return list[i];
  return null;
}

function publicUser_(u) {
  return { email: u.email, name: u.name, position: u.position, role: u.role, photo: getPhotos_()[u.email] || '' };
}

// ---------- Had cubaan ----------

function failKey_(email) { return 'lf_' + (email ? sha256Hex_(email).slice(0, 24) : 'global'); }

function loginBlocked_(email) {
  var cache = CacheService.getScriptCache();
  var g = Number(cache.get(failKey_(null)) || 0);
  if (g >= FAIL_LIMIT_GLOBAL_) return true;
  if (email) return Number(cache.get(failKey_(email)) || 0) >= FAIL_LIMIT_EMAIL_;
  return false;
}

function recordLoginFailure_(email) {
  var cache = CacheService.getScriptCache();
  var keys = [failKey_(null)];
  if (email) keys.push(failKey_(email));
  keys.forEach(function (k) {
    cache.put(k, String(Number(cache.get(k) || 0) + 1), FAIL_WINDOW_);
  });
}

// ---------- Pengesahan ID token Google ----------

/** Pulang payload tokeninfo jika sah, atau null. */
function verifyGoogleToken_(idToken) {
  var clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw new ApiError(500, 'Sistem belum dikonfigurasi (GOOGLE_CLIENT_ID).');
  var res;
  try {
    res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('tokeninfo gagal: ' + e);
    throw new ApiError(503, 'Tidak dapat mengesahkan dengan Google. Cuba lagi.');
  }
  if (res.getResponseCode() !== 200) return null;
  var p;
  try { p = JSON.parse(res.getContentText()); } catch (e) { return null; }
  if (p.aud !== clientId) return null;
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(p.iss) === -1) return null;
  if (!p.exp || Number(p.exp) * 1000 <= Date.now()) return null;
  if (String(p.email_verified) !== 'true') return null;
  if (!p.email) return null;
  return p;
}

// ---------- Action: auth.login / auth.logout ----------

function apiAuthLogin_(session, data) {
  var idToken = data && data.idToken;
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) {
    throw new ApiError(400, 'Permintaan log masuk tidak sah.');
  }
  if (loginBlocked_(null)) {
    throw new ApiError(429, 'Terlalu banyak cubaan gagal. Sila cuba lagi dalam 10 minit.');
  }

  var payload = verifyGoogleToken_(idToken);
  if (!payload) {
    recordLoginFailure_(null);
    audit_('tidak_diketahui', 'login_gagal', 'users', '', 'Token Google tidak sah');
    throw new ApiError(401, 'Log masuk gagal. Sila cuba lagi.');
  }

  var email = String(payload.email).trim().toLowerCase();
  if (loginBlocked_(email)) {
    throw new ApiError(429, 'Terlalu banyak cubaan gagal. Sila cuba lagi dalam 10 minit.');
  }

  var user = findUser_(email);
  if (!user || user.status !== 'Aktif') {
    recordLoginFailure_(email);
    audit_(email, 'login_gagal', 'users', '', user ? 'Akaun Tidak Aktif' : 'Emel tidak berdaftar');
    throw new ApiError(403, 'Akaun anda tidak didaftarkan. Hubungi Setiausaha atau Admin.');
  }

  // Token sesi rawak (dua UUID tanpa sengkang, ~64 aksara). Hanya hash disimpan dalam cache.
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  cachePut_('sess_' + sha256Hex_(token), { email: email, at: nowIso_() }, SESSION_TTL_);
  CacheService.getScriptCache().remove(failKey_(email));

  withLock_(function () {
    var row = readTable_('users').rows.filter(function (r) { return r.email === email; })[0];
    if (row) updateObject_('users', row._row, { last_login: nowIso_() });
  });
  audit_(email, 'login', 'users', email, '');

  return { token: token, user: publicUser_(user), settings: publicSettings_() };
}

function apiAuthLogout_(session, data, token) {
  cacheRemove_('sess_' + sha256Hex_(token));
  return { loggedOut: true };
}

// ---------- Helper semakan (BSD 4.2) ----------

/** Pulang {email,name,position,role} atau tolak 401. Role dibaca semasa daripada `users`, bukan daripada token. */
function requireSession_(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
    throw new ApiError(401, 'Sesi tidak sah. Sila log masuk.');
  }
  var key = 'sess_' + sha256Hex_(token);
  var s = cacheGet_(key);
  if (!s) throw new ApiError(401, 'Sesi tamat. Sila log masuk semula.');
  var u = findUser_(s.email);
  if (!u || u.status !== 'Aktif') {
    cacheRemove_(key);
    throw new ApiError(401, 'Akaun tidak aktif. Sila hubungi Admin.');
  }
  cachePut_(key, s, SESSION_TTL_); // lanjutkan sesi
  return { email: u.email, name: u.name, position: u.position, role: u.role };
}

function requireRole_(session, roles) {
  if (!session || roles.indexOf(session.role) === -1) {
    throw new ApiError(403, 'Anda tidak dibenarkan melakukan tindakan ini.');
  }
}
