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
    'materials.logOpen':  { fn: apiMaterialsLogOpen_ }
  };
}

function apiPing_() {
  return { pong: true, app: 'SyuraDocs API', version: APP_VERSION_, time: nowIso_() };
}

function doGet() {
  return json_({ ok: true, data: { app: 'SyuraDocs API', message: 'API aktif. Gunakan POST.' } });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new ApiError(400, 'Permintaan kosong.');
    if (e.postData.contents.length > 50 * 1024 * 1024) throw new ApiError(413, 'Permintaan terlalu besar.');
    var req;
    try { req = JSON.parse(e.postData.contents); } catch (err) { throw new ApiError(400, 'Format permintaan tidak sah.'); }
    if (!req || typeof req.action !== 'string') throw new ApiError(400, 'Action tidak dinyatakan.');

    var route = getRoutes_()[req.action];
    if (!route) throw new ApiError(404, 'Action tidak dikenali.');

    var session = null;
    if (!route.public) session = requireSession_(req.token);
    var data = route.fn(session, req.data || {}, req.token);
    return json_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    if (err instanceof ApiError) {
      return json_({ ok: false, error: { code: err.code, message: err.message } });
    }
    Logger.log('Ralat dalaman: ' + (err && err.stack ? err.stack : err)); // stack hanya dalam log, bukan respons
    return json_({ ok: false, error: { code: 500, message: 'Ralat dalaman. Sila cuba lagi.' } });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
