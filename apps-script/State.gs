/**
 * State.gs - keadaan mesyuarat untuk Mod Mesyuarat (F-10). TRD seksyen 7: polling membaca CACHE sahaja.
 * Cache `mstate_<id>` memegang status, item semasa, status item agenda, senarai emel ahli (untuk semakan akses)
 * dan `fbrev` (nombor semakan komen supaya klien hanya muat semula komen bila berubah).
 * Dibina semula daripada Sheet bila cache tiada; dikemas kini oleh setiap action yang mengubah data berkaitan.
 */

var STATE_TTL_ = 600; // saat; dibina semula secara automatik bila tamat

function stateKey_(id) { return 'mstate_' + id; }

function nowSecs_() { return Math.floor(Date.now() / 1000); }

/** Bina semula state daripada Sheet dan simpan dalam cache. bumpFb=true menaikkan fbrev (komen berubah). */
function refreshState_(meetingOrId, bumpFb) {
  var m = typeof meetingOrId === 'string' ? getMeetingRow_(meetingOrId) : meetingOrId;
  var prev = cacheGet_(stateKey_(m.id));
  var fbrev = prev && prev.fbrev ? prev.fbrev : nowSecs_();
  if (bumpFb) fbrev = Math.max(fbrev + 1, nowSecs_());
  var st = {
    id: m.id, status: m.status, current: m.current_agenda_id || '',
    agenda: agendaRows_(m.id).map(function (a) { return { id: a.id, status: a.status }; }),
    members: getMembers_(m.id).map(function (r) { return looseEmail_(r.email); }),
    chair: looseEmail_(m.pengerusi_email), fbrev: fbrev
  };
  cachePut_(stateKey_(m.id), st, STATE_TTL_);
  return st;
}

/** Kemas kini state tanpa menggagalkan action utama jika cache bermasalah. */
function touchState_(meetingId, bumpFb) {
  try { refreshState_(meetingId, bumpFb); } catch (e) { Logger.log('touchState_ gagal: ' + e); }
}

function getState_(meetingId) {
  var c = cacheGet_(stateKey_(meetingId));
  return c || refreshState_(String(meetingId || ''));
}

/** Pulang state ringkas untuk klien. Akses disemak daripada cache (tiada bacaan Sheet bila cache hangat). */
function apiMeetingsPollState_(session, data) {
  var id = String((data && data.id) || '');
  if (!id) throw new ApiError(400, 'ID mesyuarat diperlukan.');
  var st = getState_(id);
  if (!isStaff_(session)) {
    if (st.status === 'Draf' || st.members.indexOf(looseEmail_(session.email)) === -1) {
      throw new ApiError(403, 'Anda tidak dijemput ke mesyuarat ini.');
    }
  }
  return { status: st.status, current_agenda_id: st.current, agenda: st.agenda, fbrev: st.fbrev, server_time: nowIso_() };
}

/** Pilih item semasa (atau kosongkan dengan agenda_id ''). Admin / Setiausaha / Pengerusi mesyuarat itu. */
function apiMeetingsSetCurrentAgenda_(session, data) {
  var m = requireMeetingAccess_(session, data && data.id, { chairOnly: true });
  if (m.status !== 'Sedang Berlangsung') throw new ApiError(409, 'Mesyuarat belum dimulakan atau sudah tamat.');
  var aid = String((data && data.agenda_id) || '');
  withLock_(function () {
    var cur = getMeetingRow_(m.id);
    if (cur.status !== 'Sedang Berlangsung') throw new ApiError(409, 'Status mesyuarat telah berubah. Muat semula.');
    var rows = agendaRows_(m.id);
    var item = aid ? rows.filter(function (r) { return r.id === aid; })[0] : null;
    if (aid && !item) throw new ApiError(404, 'Item agenda tidak dijumpai dalam mesyuarat ini.');
    // Hanya satu item "Sedang Dibincang": item semasa lama yang belum diselesaikan dikembalikan kepada Belum
    var prev = rows.filter(function (r) { return r.id === cur.current_agenda_id; })[0];
    if (prev && prev.id !== aid && prev.status === 'Sedang Dibincang') updateObject_('agenda_items', prev._row, { status: 'Belum', updated_by: session.email, updated_at: nowIso_() });
    if (item && (item.status === 'Belum' || item.status === 'Ditangguh')) updateObject_('agenda_items', item._row, { status: 'Sedang Dibincang', updated_by: session.email, updated_at: nowIso_() });
    updateObject_('meetings', cur._row, { current_agenda_id: aid, updated_at: nowIso_() });
  });
  var st = refreshState_(m.id);
  return { status: st.status, current_agenda_id: st.current, agenda: st.agenda, fbrev: st.fbrev };
}
