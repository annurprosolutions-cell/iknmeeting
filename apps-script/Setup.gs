/**
 * Setup.gs - setupSystem(): cipta tab, header, format, dropdown, seed, folder Drive, trigger.
 * Dijalankan SEKALI oleh pemilik (Run > setupSystem). Idempotent: selamat dijalankan semula.
 *
 * SEBELUM RUN: tukar ADMIN_EMAIL di bawah kepada emel Google anda.
 */

var ADMIN_EMAIL = 'GANTI_DENGAN_EMEL_ANDA@gmail.com';

var BOOL_ = ['TRUE', 'FALSE'];

var SCHEMA = {
  users: {
    headers: ['email', 'name', 'position', 'role', 'status', 'created_at', 'created_by', 'last_login', 'photo'],
    enums: { role: ['Admin', 'Setiausaha', 'Pengerusi', 'Ahli'], status: ['Aktif', 'Tidak Aktif'] }
  },
  meetings: {
    headers: ['id', 'title', 'meeting_type', 'series', 'prev_meeting_id', 'date', 'start_time', 'end_time', 'venue', 'online_link', 'status', 'pengerusi_email', 'current_agenda_id', 'drive_folder_id', 'notify_on_publish', 'created_by', 'created_at', 'updated_at', 'tahun', 'bil'],
    enums: { status: ['Draf', 'Dijadualkan', 'Sedang Berlangsung', 'Selesai', 'Dibatalkan'], notify_on_publish: BOOL_ }
  },
  meeting_members: {
    headers: ['id', 'meeting_id', 'email', 'attendance', 'attendance_at', 'added_by', 'added_at'],
    enums: { attendance: ['Belum Jawab', 'Hadir', 'Tidak Hadir', 'Mungkin'] }
  },
  agenda_items: {
    headers: ['id', 'meeting_id', 'seq', 'title', 'description', 'category', 'presenter_email', 'duration_min', 'status', 'updated_by', 'updated_at'],
    enums: { category: ['Makluman', 'Perbincangan', 'Keputusan', 'Pengesahan'], status: ['Belum', 'Sedang Dibincang', 'Selesai', 'Ditangguh'] }
  },
  materials: {
    headers: ['id', 'meeting_id', 'agenda_id', 'type', 'title', 'drive_file_id', 'file_name', 'mime_type', 'size_bytes', 'version', 'status', 'replaces_id', 'uploaded_by', 'uploaded_at'],
    enums: { type: ['Surat Jemputan', 'Memo', 'Agenda', 'Kertas Cadangan', 'Kertas Makluman', 'Kertas Laporan', 'Bahan Bicara', 'Minit', 'Maklum Balas', 'Slaid', 'Lampiran', 'Lain-lain'], status: ['Aktif', 'Digantikan', 'Diarkib'] }
  },
  minutes: {
    headers: ['id', 'meeting_id', 'version', 'status', 'content_md', 'final_file_id', 'is_current', 'prepared_by', 'prepared_at', 'submitted_at', 'approved_by', 'approved_at'],
    enums: { status: ['Draf', 'Untuk Semakan', 'Disahkan'], is_current: BOOL_ }
  },
  feedback: {
    headers: ['id', 'meeting_id', 'target_type', 'target_id', 'kind', 'content', 'visibility', 'author_email', 'created_at', 'updated_at', 'deleted'],
    enums: { target_type: ['Mesyuarat', 'Agenda', 'Bahan', 'Minit'], kind: ['Komen', 'Cadangan', 'Soalan', 'Bantahan'], visibility: ['Semua', 'Pengerusi & Setiausaha'], deleted: BOOL_ }
  },
  action_items: {
    headers: ['id', 'meeting_id', 'agenda_id', 'title', 'owner_email', 'due_date', 'status', 'remarks', 'created_by', 'created_at', 'updated_at', 'completed_at'],
    enums: { status: ['Baharu', 'Dalam Tindakan', 'Selesai', 'Dibatalkan'] }
  },
  audit_log: {
    headers: ['id', 'timestamp', 'email', 'action', 'entity', 'entity_id', 'detail'],
    enums: {}
  },
  notification_log: {
    headers: ['id', 'timestamp', 'to_email', 'type', 'meeting_id', 'subject', 'status', 'error'],
    enums: { status: ['Dihantar', 'Gagal', 'Dilangkau'] }
  },
  settings: {
    headers: ['key', 'value', 'description'],
    enums: {}
  }
};

var SETTINGS_SEED = [
  ['app_name', 'SyuraDocs', 'Nama paparan'],
  ['root_folder_id', '', 'Folder akar Drive (diisi setupSystem)'],
  ['backup_folder_id', '', 'Folder backup (diisi setupSystem)'],
  ['meeting_types', '["Mesyuarat Pengurusan","Mesyuarat Jawatankuasa","Lain-lain"]', 'Tidak digunakan lagi (diganti meeting_series)'],
  ['meeting_series', '["Mesyuarat Jawatankuasa Hospital Mesra Ibadah Institut Kanser Negara","Mesyuarat Jawatankuasa Credentialing & Privileging Pengurusan Ibadah Pesakit Institut Kanser Negara","Mesyuarat Pengurusan Kualiti Jawatankuasa Hospital Mesra Ibadah Institut Kanser Negara"]', 'Senarai siri / nama mesyuarat (JSON)'],
  ['reminder_hours_before', '24', 'Peringatan sebelum mesyuarat (jam)'],
  ['digest_enabled', 'TRUE', 'Digest emel bahan baharu'],
  ['max_upload_mb', '20', 'Had muat naik melalui app (laras selepas ujian Fasa 3)'],
  ['backup_keep', '8', 'Bilangan salinan backup disimpan'],
  ['timezone', 'Asia/Kuala_Lumpur', 'Zon masa'],
  ['allowed_mime', 'pdf,pptx,ppt,docx,doc,xlsx,xls,png,jpg', 'Jenis fail dibenarkan']
];

var TRIGGERS_ = [
  { fn: 'sendDigest_',        build: function (b) { return b.timeBased().everyHours(1); } },
  { fn: 'sendReminders_',     build: function (b) { return b.timeBased().everyDays(1).atHour(8); } },
  { fn: 'sendOverdueActions_', build: function (b) { return b.timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).nearMinute(30); } },
  { fn: 'backupWeekly_',      build: function (b) { return b.timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2); } }
];

function setupSystem() {
  var log = { tabs: [], folders: [], triggers: [], skippedTriggers: [], notes: [] };

  if (!EMAIL_RE_.test(String(ADMIN_EMAIL)) || /GANTI/i.test(ADMIN_EMAIL)) {
    throw new Error('Isi ADMIN_EMAIL di atas Setup.gs dengan emel Google anda dahulu, kemudian Run semula.');
  }
  var admin = ADMIN_EMAIL.trim().toLowerCase();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Skrip ini mesti dibuka melalui Extensions > Apps Script dari dalam Google Sheet.');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  db_ = null;
  ss.setSpreadsheetTimeZone(TZ_);

  // 1-3. Tab, header, format, dropdown
  Object.keys(SCHEMA).forEach(function (name) {
    var def = SCHEMA[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      log.tabs.push(name);
    }
    ensureColumns_(sh, def.headers.length);
    var cur = sh.getRange(1, 1, 1, def.headers.length).getValues()[0].map(toStr_);
    var k = 0;
    while (k < cur.length && cur[k] !== '') k++;
    var tailBlank = cur.slice(k).every(function (c) { return c === ''; });
    var prefixOk = cur.slice(0, k).join('|') === def.headers.slice(0, k).join('|');
    if (k === 0) {
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    } else if (k < def.headers.length && tailBlank && prefixOk) {
      // Migrasi: tambah lajur baharu di hujung (data sedia ada tidak disentuh)
      sh.getRange(1, k + 1, 1, def.headers.length - k).setValues([def.headers.slice(k)]);
      log.notes.push('Tab "' + name + '": lajur ditambah: ' + def.headers.slice(k).join(', '));
    } else if (cur.join('|') !== def.headers.join('|')) {
      log.notes.push('AMARAN: header tab "' + name + '" berbeza daripada BSD. Tidak diubah.');
    }
    // Semua lajur Plain text supaya Sheets tidak menukar jenis (tarikh, ID, TRUE/FALSE)
    sh.getRange(1, 1, sh.getMaxRows(), def.headers.length).setNumberFormat('@');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
    Object.keys(def.enums).forEach(function (col) {
      var idx = def.headers.indexOf(col) + 1;
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(def.enums[col], true).setAllowInvalid(false).build();
      sh.getRange(2, idx, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
    });
  });
  var blankSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Helaian1');
  if (blankSheet && ss.getSheets().length > 1 && blankSheet.getLastRow() === 0) ss.deleteSheet(blankSheet);

  // 4. Seed settings (kunci yang belum wujud sahaja) dan Admin
  var settingsSh = ss.getSheetByName('settings');
  var haveKeys = {};
  readTable_('settings').rows.forEach(function (r) { haveKeys[r.key] = true; });
  var newSettings = SETTINGS_SEED.filter(function (s) { return !haveKeys[s[0]]; });
  if (newSettings.length) {
    settingsSh.getRange(settingsSh.getLastRow() + 1, 1, newSettings.length, 3).setValues(newSettings);
  }
  var usersSh = ss.getSheetByName('users');
  var hasAdmin = readTable_('users').rows.some(function (r) { return r.email === admin; });
  if (!hasAdmin) {
    appendObject_('users', {
      email: admin, name: 'Admin', position: '', role: 'Admin', status: 'Aktif',
      created_at: nowIso_(), created_by: 'sistem', last_login: ''
    });
    log.notes.push('Admin dicipta: ' + admin + ' (tukar nama di S-13 selepas login).');
  }

  // 4b. Nama sistem baharu (12/11/2026): tukar nilai lama sahaja, jangan timpa nama yang Admin tetapkan sendiri
  var appRow = readTable_('settings').rows.filter(function (r) { return r.key === 'app_name'; })[0];
  if (appRow && appRow.value === 'e-Mesyuarat IKN') {
    updateObject_('settings', appRow._row, { value: 'SyuraDocs' });
    log.notes.push('Nama sistem ditukar kepada SyuraDocs.');
  }

  // 5. Folder Drive
  var settings = {};
  readTable_('settings').rows.forEach(function (r) { settings[r.key] = r; });
  var root = getOrCreateFolder_(settings.root_folder_id.value, 'e-Mesyuarat IKN', null, log);
  setSettingValue_('root_folder_id', root.getId());
  getOrCreateFolder_('', 'Mesyuarat', root, log);
  var backup = getOrCreateFolder_(settings.backup_folder_id.value, 'Backup', root, log);
  setSettingValue_('backup_folder_id', backup.getId());
  invalidateSettings_();
  invalidateUsers_();

  // 7. Trigger (idempotent). Hanya pasang jika function wujud; ulang setupSystem() selepas Fasa 6.
  var existing = ScriptApp.getProjectTriggers();
  TRIGGERS_.forEach(function (t) {
    existing.forEach(function (tr) { if (tr.getHandlerFunction() === t.fn) ScriptApp.deleteTrigger(tr); });
    if (typeof globalThis[t.fn] !== 'function') { log.skippedTriggers.push(t.fn); return; }
    t.build(ScriptApp.newTrigger(t.fn)).create();
    log.triggers.push(t.fn);
  });

  // 8. Ringkasan
  if (!PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID')) {
    log.notes.push('NOTA: Script Property GOOGLE_CLIENT_ID belum diisi. Login tidak akan berfungsi sehingga diisi.');
  }
  var msg = 'setupSystem selesai.\n' +
    'Tab dicipta: ' + (log.tabs.join(', ') || '(tiada, semua sudah wujud)') + '\n' +
    'Folder dicipta: ' + (log.folders.join(', ') || '(tiada, semua sudah wujud)') + '\n' +
    'Trigger dipasang: ' + (log.triggers.join(', ') || '(tiada)') + '\n' +
    (log.skippedTriggers.length ? 'Trigger dilangkau (function belum ada, Fasa 6): ' + log.skippedTriggers.join(', ') + '\n' : '') +
    log.notes.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* tiada UI semasa run dari editor */ }
  return msg;
}

function ensureColumns_(sh, n) {
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
}

function getOrCreateFolder_(id, name, parent, log) {
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* folder hilang, cipta semula */ }
  }
  if (parent) {
    var it = parent.getFoldersByName(name);
    if (it.hasNext()) return it.next();
    log.folders.push(name);
    return parent.createFolder(name);
  }
  var it2 = DriveApp.getFoldersByName(name);
  while (it2.hasNext()) {
    var cand = it2.next();
    if (!cand.isTrashed() && cand.getOwner() && String(cand.getOwner().getEmail()).toLowerCase() === ownerEmail_()) return cand;
  }
  log.folders.push(name);
  return DriveApp.createFolder(name);
}

/** Tulis nilai tetapan (kunci mesti sudah wujud). Hanya untuk setup dan Admin (Fasa 6). */
function setSettingValue_(key, value) {
  withLock_(function () {
    var row = readTable_('settings').rows.filter(function (r) { return r.key === key; })[0];
    if (row) updateObject_('settings', row._row, { value: value });
  });
}
