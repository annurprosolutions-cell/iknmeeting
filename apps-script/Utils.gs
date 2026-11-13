/**
 * Utils.gs - pembantu am: ralat API, lock, cache, akses Sheet, validasi.
 */

var TZ_ = 'Asia/Kuala_Lumpur';
var APP_VERSION_ = '0.4.2';

/** Ralat yang selamat dipaparkan kepada pengguna. Ralat lain jadi 500 generik. */
class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// ---------- Masa & ID ----------

/** Cap masa ISO: YYYY-MM-DDTHH:mm:ss+08:00 */
function nowIso_() {
  return Utilities.formatDate(new Date(), TZ_, "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
}

function genId_(prefix) {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var out = '';
  for (var i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return prefix + '-' + out;
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// ---------- Lock (BSD seksyen 1: semua penulisan dalam script lock, tunggu 20s) ----------

var lockDepth_ = 0;

function withLock_(fn) {
  if (lockDepth_ > 0) return fn(); // reentrant dalam satu pelaksanaan
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw new ApiError(503, 'Sistem sibuk. Sila cuba lagi sebentar.');
  }
  lockDepth_++;
  try {
    return fn();
  } finally {
    lockDepth_--;
    lock.releaseLock();
  }
}

// ---------- Cache ----------

function cacheGet_(key) {
  var v = CacheService.getScriptCache().get(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

function cachePut_(key, obj, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(obj), ttlSeconds || 300);
  } catch (e) {
    Logger.log('cachePut_ gagal (' + key + '): ' + e);
  }
}

function cacheRemove_(key) {
  CacheService.getScriptCache().remove(key);
}

// ---------- Sheet ----------

var db_ = null;

function getDb_() {
  if (db_) return db_;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  db_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return db_;
}

function getSheet_(name) {
  var sh = getDb_().getSheetByName(name);
  if (!sh) throw new Error('Tab tiada: ' + name + '. Jalankan setupSystem().');
  return sh;
}

function toStr_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ_, "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
  return String(v);
}

/** Baca satu tab sebagai senarai objek. Setiap objek ada _row (nombor baris sebenar). */
function readTable_(name) {
  var sh = getSheet_(name);
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(toStr_);
  var lastRow = sh.getLastRow();
  var rows = [];
  if (lastRow >= 2) {
    var vals = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { _row: i + 2 };
      var empty = true;
      for (var j = 0; j < headers.length; j++) {
        o[headers[j]] = toStr_(vals[i][j]);
        if (o[headers[j]] !== '') empty = false;
      }
      if (!empty) rows.push(o);
    }
  }
  return { headers: headers, rows: rows };
}

function objToRow_(headers, obj) {
  return headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : String(obj[h]); });
}

/** Tambah satu baris. Panggil dalam withLock_. */
function appendObject_(name, obj) {
  appendObjects_(name, [obj]);
}

/** Tambah banyak baris sekali gus. Panggil dalam withLock_. */
function appendObjects_(name, objs) {
  if (!objs.length) return;
  var sh = getSheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(toStr_);
  var rows = objs.map(function (o) { return objToRow_(headers, o); });
  var start = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(start, 1, rows.length, headers.length).setValues(rows);
}

/** Kemas kini baris sedia ada (gabung medan). Panggil dalam withLock_. */
function updateObject_(name, rowNumber, patch) {
  var sh = getSheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(toStr_);
  var range = sh.getRange(rowNumber, 1, 1, headers.length);
  var cur = range.getValues()[0].map(toStr_);
  var out = headers.map(function (h, i) {
    return Object.prototype.hasOwnProperty.call(patch, h) ? String(patch[h] === null ? '' : patch[h]) : cur[i];
  });
  range.setValues([out]);
}

/** Buang baris (nombor baris sebenar). Panggil dalam withLock_. Dibuang dari bawah supaya nombor tidak beralih. */
function deleteRows_(name, rowNumbers) {
  var sh = getSheet_(name);
  rowNumbers.slice().sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
}

// ---------- Validasi ----------

var EMAIL_RE_ = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normEmail_(v, label) {
  var e = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  if (!e) throw new ApiError(400, (label || 'Emel') + ' wajib diisi.');
  if (e.length > 254 || !EMAIL_RE_.test(e)) throw new ApiError(400, (label || 'Emel') + ' tidak sah: ' + e.slice(0, 60));
  return e;
}

function cleanStr_(v, max, label, required) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (required && !s) throw new ApiError(400, label + ' wajib diisi.');
  if (s.length > max) throw new ApiError(400, label + ' terlalu panjang (maksimum ' + max + ' aksara).');
  return s;
}

function cleanEnum_(v, list, label) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (list.indexOf(s) === -1) throw new ApiError(400, label + ' tidak sah.');
  return s;
}

// ---------- Tetapan ----------

function getSettings_() {
  var c = cacheGet_('settings_v1');
  if (c) return c;
  var map = {};
  readTable_('settings').rows.forEach(function (r) { map[r.key] = r.value; });
  cachePut_('settings_v1', map, 300);
  return map;
}

function invalidateSettings_() { cacheRemove_('settings_v1'); }

/** Subset tetapan yang selamat untuk semua pengguna (BSD 4.1). */
function publicSettings_() {
  var s = getSettings_();
  var types = [], series = [];
  try { types = JSON.parse(s.meeting_types || '[]'); } catch (e) { types = []; }
  try { series = JSON.parse(s.meeting_series || '[]'); } catch (e) { series = []; }
  return { app_name: s.app_name || 'SyuraDocs', meeting_types: types, meeting_series: series, max_upload_mb: Number(s.max_upload_mb || 20) };
}
