/**
 * Settings.gs - tetapan sistem untuk Admin (S-14). Hanya kunci dalam senarai putih boleh diubah; selebihnya baca sahaja.
 */

var SETTINGS_EDITABLE_ = ['app_name', 'meeting_series', 'app_url', 'reminder_hours_before', 'digest_enabled', 'max_upload_mb', 'backup_keep'];

function normalizeSetting_(key, raw) {
  var v = typeof raw === 'string' ? raw.trim() : raw;
  switch (key) {
    case 'app_name': return cleanStr_(v, 60, 'Nama sistem', true);
    case 'meeting_series': {
      var list = Array.isArray(v) ? v : String(v || '').split(/\r?\n/);
      var seen = {}, out = [];
      list.forEach(function (x) { var s = String(x).trim(); if (s && !seen[s]) { seen[s] = true; out.push(s); } });
      if (out.length > 20) throw new ApiError(400, 'Maksimum 20 nama mesyuarat.');
      out.forEach(function (s) { if (s.length > 200) throw new ApiError(400, 'Nama mesyuarat terlalu panjang (maksimum 200 aksara).'); });
      return JSON.stringify(out);
    }
    case 'app_url': {
      var u = String(v || '').replace(/\/+$/, '');
      if (u && !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(u)) throw new ApiError(400, 'Alamat sistem mesti bermula dengan https:// (tanpa parameter), contoh https://sistem.contoh.my');
      return u;
    }
    case 'reminder_hours_before': return String(intInRange_(v, 1, 168, 'Peringatan (jam)'));
    case 'backup_keep': return String(intInRange_(v, 1, 30, 'Bilangan backup'));
    case 'max_upload_mb': {
      var n = Number(v);
      if (!isFinite(n) || n < 1 || n > 50) throw new ApiError(400, 'Had muat naik mesti antara 1 dan 50 MB.');
      return String(n);
    }
    case 'digest_enabled': {
      var b = String(v).toUpperCase();
      if (b !== 'TRUE' && b !== 'FALSE') throw new ApiError(400, 'Digest mesti Hidup atau Mati.');
      return b;
    }
  }
  throw new ApiError(400, 'Tetapan ini tidak boleh diubah melalui sistem.');
}

function intInRange_(v, min, max, label) {
  var n = Number(v);
  if (!isFinite(n) || n % 1 !== 0 || n < min || n > max) throw new ApiError(400, label + ' mesti nombor bulat antara ' + min + ' dan ' + max + '.');
  return n;
}

function apiSettingsGet_(session) {
  requireRole_(session, ['Admin']);
  invalidateSettings_();
  return { settings: readTable_('settings').rows.map(function (r) { return { key: r.key, value: r.value, description: r.description, editable: SETTINGS_EDITABLE_.indexOf(r.key) !== -1 }; }) };
}

function apiSettingsSet_(session, data) {
  requireRole_(session, ['Admin']);
  var key = String((data && data.key) || '');
  if (SETTINGS_EDITABLE_.indexOf(key) === -1) throw new ApiError(400, 'Tetapan ini tidak boleh diubah melalui sistem.');
  var value = normalizeSetting_(key, data.value);
  withLock_(function () {
    var row = readTable_('settings').rows.filter(function (r) { return r.key === key; })[0];
    if (!row) appendObject_('settings', { key: key, value: value, description: '' });
    else updateObject_('settings', row._row, { value: value });
    invalidateSettings_();
    audit_(session.email, 'settings.set', 'settings', key, key === 'meeting_series' ? 'senarai dikemas kini' : String(value).slice(0, 120));
  });
  return { key: key, value: value };
}
