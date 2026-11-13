/**
 * Code.gs - titik masuk Web App (doGet / doPost) dan router action.
 * Respons sentiasa JSON: {ok:true,data} atau {ok:false,error:{code,message}}.
 * Apps Script tidak boleh set kod HTTP, jadi kod 401/403 dibawa dalam badan JSON.
 */

/**
 * Penghala. Setiap action dibungkus dalam closure dan `ok` memeriksa sama ada function wujud (typeof tidak melempar ralat
 * walaupun function tiada). Jika satu fail .gs tertinggal ditampal, HANYA action dalam fail itu gagal (dengan mesej jelas);
 * action lain dan ping tetap berfungsi, dan ping melaporkan fail yang hilang.
 */
function getRoutes_() {
  return {
    'ping': { file: 'Code.gs', ok: typeof apiPing_ === 'function', fn: function (s, d, t) { return apiPing_(s, d, t); }, public: true },
    'auth.login': { file: 'Auth.gs', ok: typeof apiAuthLogin_ === 'function', fn: function (s, d, t) { return apiAuthLogin_(s, d, t); }, public: true },
    'auth.logout': { file: 'Auth.gs', ok: typeof apiAuthLogout_ === 'function', fn: function (s, d, t) { return apiAuthLogout_(s, d, t); } },
    'me.get': { file: 'Users.gs', ok: typeof apiMeGet_ === 'function', fn: function (s, d, t) { return apiMeGet_(s, d, t); } },
    'users.list': { file: 'Users.gs', ok: typeof apiUsersList_ === 'function', fn: function (s, d, t) { return apiUsersList_(s, d, t); } },
    'users.save': { file: 'Users.gs', ok: typeof apiUsersSave_ === 'function', fn: function (s, d, t) { return apiUsersSave_(s, d, t); } },
    'users.deactivate': { file: 'Users.gs', ok: typeof apiUsersDeactivate_ === 'function', fn: function (s, d, t) { return apiUsersDeactivate_(s, d, t); } },
    'users.import': { file: 'Users.gs', ok: typeof apiUsersImport_ === 'function', fn: function (s, d, t) { return apiUsersImport_(s, d, t); } },
    'meetings.list': { file: 'Meetings.gs', ok: typeof apiMeetingsList_ === 'function', fn: function (s, d, t) { return apiMeetingsList_(s, d, t); } },
    'meetings.get': { file: 'Meetings.gs', ok: typeof apiMeetingsGet_ === 'function', fn: function (s, d, t) { return apiMeetingsGet_(s, d, t); } },
    'meetings.create': { file: 'Meetings.gs', ok: typeof apiMeetingsCreate_ === 'function', fn: function (s, d, t) { return apiMeetingsCreate_(s, d, t); } },
    'meetings.update': { file: 'Meetings.gs', ok: typeof apiMeetingsUpdate_ === 'function', fn: function (s, d, t) { return apiMeetingsUpdate_(s, d, t); } },
    'meetings.publish': { file: 'Meetings.gs', ok: typeof apiMeetingsPublish_ === 'function', fn: function (s, d, t) { return apiMeetingsPublish_(s, d, t); } },
    'meetings.cancel': { file: 'Meetings.gs', ok: typeof apiMeetingsCancel_ === 'function', fn: function (s, d, t) { return apiMeetingsCancel_(s, d, t); } },
    'meetings.setStatus': { file: 'Meetings.gs', ok: typeof apiMeetingsSetStatus_ === 'function', fn: function (s, d, t) { return apiMeetingsSetStatus_(s, d, t); } },
    'members.set': { file: 'Meetings.gs', ok: typeof apiMembersSet_ === 'function', fn: function (s, d, t) { return apiMembersSet_(s, d, t); } },
    'attendance.set': { file: 'Meetings.gs', ok: typeof apiAttendanceSet_ === 'function', fn: function (s, d, t) { return apiAttendanceSet_(s, d, t); } },
    'agenda.save': { file: 'Agenda.gs', ok: typeof apiAgendaSave_ === 'function', fn: function (s, d, t) { return apiAgendaSave_(s, d, t); } },
    'agenda.delete': { file: 'Agenda.gs', ok: typeof apiAgendaDelete_ === 'function', fn: function (s, d, t) { return apiAgendaDelete_(s, d, t); } },
    'agenda.reorder': { file: 'Agenda.gs', ok: typeof apiAgendaReorder_ === 'function', fn: function (s, d, t) { return apiAgendaReorder_(s, d, t); } },
    'agenda.setStatus': { file: 'Agenda.gs', ok: typeof apiAgendaSetStatus_ === 'function', fn: function (s, d, t) { return apiAgendaSetStatus_(s, d, t); } },
    'materials.upload': { file: 'Materials.gs', ok: typeof apiMaterialsUpload_ === 'function', fn: function (s, d, t) { return apiMaterialsUpload_(s, d, t); } },
    'materials.register': { file: 'Materials.gs', ok: typeof apiMaterialsRegister_ === 'function', fn: function (s, d, t) { return apiMaterialsRegister_(s, d, t); } },
    'materials.replace': { file: 'Materials.gs', ok: typeof apiMaterialsReplace_ === 'function', fn: function (s, d, t) { return apiMaterialsReplace_(s, d, t); } },
    'materials.archive': { file: 'Materials.gs', ok: typeof apiMaterialsArchive_ === 'function', fn: function (s, d, t) { return apiMaterialsArchive_(s, d, t); } },
    'materials.update': { file: 'Materials.gs', ok: typeof apiMaterialsUpdate_ === 'function', fn: function (s, d, t) { return apiMaterialsUpdate_(s, d, t); } },
    'materials.logOpen': { file: 'Materials.gs', ok: typeof apiMaterialsLogOpen_ === 'function', fn: function (s, d, t) { return apiMaterialsLogOpen_(s, d, t); } },
    'meetings.pollState': { file: 'State.gs', ok: typeof apiMeetingsPollState_ === 'function', fn: function (s, d, t) { return apiMeetingsPollState_(s, d, t); } },
    'meetings.setCurrentAgenda': { file: 'State.gs', ok: typeof apiMeetingsSetCurrentAgenda_ === 'function', fn: function (s, d, t) { return apiMeetingsSetCurrentAgenda_(s, d, t); } },
    'feedback.list': { file: 'Feedback.gs', ok: typeof apiFeedbackList_ === 'function', fn: function (s, d, t) { return apiFeedbackList_(s, d, t); } },
    'feedback.add': { file: 'Feedback.gs', ok: typeof apiFeedbackAdd_ === 'function', fn: function (s, d, t) { return apiFeedbackAdd_(s, d, t); } },
    'feedback.update': { file: 'Feedback.gs', ok: typeof apiFeedbackUpdate_ === 'function', fn: function (s, d, t) { return apiFeedbackUpdate_(s, d, t); } },
    'feedback.delete': { file: 'Feedback.gs', ok: typeof apiFeedbackDelete_ === 'function', fn: function (s, d, t) { return apiFeedbackDelete_(s, d, t); } },
    'audit.list': { file: 'Audit.gs', ok: typeof apiAuditList_ === 'function', fn: function (s, d, t) { return apiAuditList_(s, d, t); } },
    'notifications.list': { file: 'Audit.gs', ok: typeof apiNotificationsList_ === 'function', fn: function (s, d, t) { return apiNotificationsList_(s, d, t); } },
    'settings.get': { file: 'Settings.gs', ok: typeof apiSettingsGet_ === 'function', fn: function (s, d, t) { return apiSettingsGet_(s, d, t); } },
    'settings.set': { file: 'Settings.gs', ok: typeof apiSettingsSet_ === 'function', fn: function (s, d, t) { return apiSettingsSet_(s, d, t); } },
    'backup.run': { file: 'Backup.gs', ok: typeof apiBackupRun_ === 'function', fn: function (s, d, t) { return apiBackupRun_(s, d, t); } },
    'backup.list': { file: 'Backup.gs', ok: typeof apiBackupList_ === 'function', fn: function (s, d, t) { return apiBackupList_(s, d, t); } }
  };
}

function apiPing_() {
  var out = { pong: true, app: 'SyuraDocs API', version: APP_VERSION_, time: nowIso_() };
  var routes = getRoutes_(), missing = {};
  Object.keys(routes).forEach(function (k) { if (routes[k].ok === false) missing[routes[k].file] = true; });
  // Fail yang tiada action tetapi diperlukan (dipanggil oleh fail lain atau trigger)
  if (typeof notifyInvite_ !== 'function' || typeof sendDigest_ !== 'function') missing['Notify.gs'] = true;
  if (typeof syncUserDriveAccess_ !== 'function' || typeof driveShare_ !== 'function') missing['DriveSync.gs'] = true;
  if (typeof setupSystem !== 'function') missing['Setup.gs'] = true;
  if (typeof refreshState_ !== 'function') missing['State.gs'] = true;
  var list = Object.keys(missing).sort();
  if (list.length) out.missing = list; // pemasangan tidak lengkap: senarai fail .gs yang belum ditampal
  return out;
}

function doGet() {
  return json_({ ok: true, data: { app: 'SyuraDocs API', message: 'API aktif. Gunakan POST.' } });
}

function doPost(e) {
  var session = null;
  try {
    if (!e || !e.postData || !e.postData.contents) throw new ApiError(400, 'Permintaan kosong.');
    if (e.postData.contents.length > 50 * 1024 * 1024) throw new ApiError(413, 'Permintaan terlalu besar.');
    var req;
    try { req = JSON.parse(e.postData.contents); } catch (err) { throw new ApiError(400, 'Format permintaan tidak sah.'); }
    if (!req || typeof req.action !== 'string') throw new ApiError(400, 'Action tidak dinyatakan.');

    var route = getRoutes_()[req.action];
    if (!route) throw new ApiError(404, 'Action tidak dikenali.');
    if (route.ok === false) throw new ApiError(503, 'Pemasangan Apps Script tidak lengkap: fail ' + route.file + ' belum ditampal atau terlalu lama. Hubungi Admin.');

    if (!route.public) session = requireSession_(req.token);
    var data = route.fn(session, req.data || {}, req.token);
    return json_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    if (err instanceof ApiError) {
      return json_({ ok: false, error: { code: err.code, message: err.message } });
    }
    Logger.log('Ralat dalaman: ' + (err && err.stack ? err.stack : err)); // stack hanya dalam log, bukan respons
    var out = { code: 500, message: 'Ralat dalaman. Sila cuba lagi.' };
    // Hanya Admin: sebab ringkas (tanpa stack) supaya ralat boleh didiagnosis tanpa membuka log Apps Script
    if (session && session.role === 'Admin') out.detail = String(err && err.message ? err.message : err).slice(0, 300);
    return json_({ ok: false, error: out });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
