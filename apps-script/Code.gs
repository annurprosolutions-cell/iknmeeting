/**
 * Code.gs - titik masuk Web App (doGet / doPost) dan router action.
 * Respons sentiasa JSON: {ok:true,data} atau {ok:false,error:{code,message}}.
 * Apps Script tidak boleh set kod HTTP, jadi kod 401/403 dibawa dalam badan JSON.
 */

function getRoutes_() {
  return {
    'ping':             { fn: apiPing_, public: true },
    'auth.login':       { fn: apiAuthLogin_, public: true },
    'auth.logout':      { fn: apiAuthLogout_ },
    'me.get':           { fn: apiMeGet_ },
    'users.list':       { fn: apiUsersList_ },
    'users.save':       { fn: apiUsersSave_ },
    'users.deactivate': { fn: apiUsersDeactivate_ },
    'users.import':     { fn: apiUsersImport_ },
    'meetings.list':    { fn: apiMeetingsList_ },
    'meetings.get':     { fn: apiMeetingsGet_ },
    'meetings.create':  { fn: apiMeetingsCreate_ },
    'meetings.update':  { fn: apiMeetingsUpdate_ },
    'meetings.publish': { fn: apiMeetingsPublish_ },
    'meetings.cancel':  { fn: apiMeetingsCancel_ },
    'meetings.setStatus': { fn: apiMeetingsSetStatus_ },
    'members.set':      { fn: apiMembersSet_ },
    'attendance.set':   { fn: apiAttendanceSet_ },
    'agenda.save':      { fn: apiAgendaSave_ },
    'agenda.delete':    { fn: apiAgendaDelete_ },
    'agenda.reorder':   { fn: apiAgendaReorder_ },
    'agenda.setStatus': { fn: apiAgendaSetStatus_ },
    'materials.upload':   { fn: apiMaterialsUpload_ },
    'materials.register': { fn: apiMaterialsRegister_ },
    'materials.replace':  { fn: apiMaterialsReplace_ },
    'materials.archive':  { fn: apiMaterialsArchive_ },
    'materials.update':   { fn: apiMaterialsUpdate_ },
    'materials.logOpen':  { fn: apiMaterialsLogOpen_ },
    'meetings.pollState':        { fn: apiMeetingsPollState_ },
    'meetings.setCurrentAgenda': { fn: apiMeetingsSetCurrentAgenda_ },
    'feedback.list':   { fn: apiFeedbackList_ },
    'feedback.add':    { fn: apiFeedbackAdd_ },
    'feedback.update': { fn: apiFeedbackUpdate_ },
    'feedback.delete': { fn: apiFeedbackDelete_ },
    'audit.list':         { fn: apiAuditList_ },
    'notifications.list': { fn: apiNotificationsList_ },
    'settings.get':       { fn: apiSettingsGet_ },
    'settings.set':       { fn: apiSettingsSet_ },
    'backup.run':         { fn: apiBackupRun_ },
    'backup.list':        { fn: apiBackupList_ }
  };
}

function apiPing_() {
  return { pong: true, app: 'SyuraDocs API', version: APP_VERSION_, time: nowIso_() };
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
