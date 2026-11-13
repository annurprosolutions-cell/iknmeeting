/**
 * Notify.gs - notifikasi emel (F-11). AFD seksyen 7: emel HANYA tajuk, tarikh dan pautan (tiada kandungan bahan, komen atau minit).
 * Semua emel direkod dalam `notification_log`. Bila kuota harian habis, baki dilangkau dan direkod "Dilangkau".
 * Jenis: invite (terbit / ahli ditambah), digest (bahan baharu, trigger setiap jam), reminder (trigger harian 08:00).
 * Minit untuk semakan/disahkan dan tindakan tertunggak menunggu Fasa 5.
 */

var DIGEST_PROP_ = 'DIGEST_LAST_RUN';
var DAY_NAMES_ = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

function appUrl_() { return String(getSettings_().app_url || '').replace(/\/+$/, ''); }
function meetingLink_(id) { var u = appUrl_(); return u ? u + '/#/meetings/' + id : ''; }

function ddmmyyyy_(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
function weekdayOf_(iso) { var p = String(iso).split('-').map(Number); return DAY_NAMES_[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]; }
function meetingLabel_(m) { return m.title + (m.bil ? ' Bil.' + m.bil + '/' + (m.tahun || String(m.date).slice(0, 4)) : ''); }
function whenText_(m) { return weekdayOf_(m.date) + ', ' + ddmmyyyy_(m.date) + ', ' + m.start_time + (m.end_time ? ' - ' + m.end_time : ''); }
function todayMy_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd'); }
function addDaysIso_(iso, n) { var p = iso.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return d.toISOString().slice(0, 10); }

/** Emel ahli Aktif bagi satu mesyuarat (unik, huruf kecil). */
function activeMemberEmails_(meetingId) {
  var seen = {}, out = [];
  getMembers_(meetingId).forEach(function (r) {
    var e = looseEmail_(r.email);
    if (e && !seen[e] && isActiveUser_(e)) { seen[e] = true; out.push(e); }
  });
  return out;
}

var MAIL_FOOTER_ = '\n\nEmel ini dijana secara automatik oleh SyuraDocs. Sila jangan balas emel ini.';

function linkLine_(url) { return url ? '\nBuka sistem: ' + url : '\nBuka SyuraDocs dan pilih mesyuarat ini daripada senarai Mesyuarat.'; }

/**
 * Hantar sekumpulan emel dengan semakan kuota. items: [{to, subject, body, type, meeting_id}].
 * Pulang {sent, failed, skipped}. Tidak melempar ralat; setiap hasil direkod dalam notification_log.
 */
function sendMailBatch_(items) {
  var remaining = null;
  try { remaining = MailApp.getRemainingDailyQuota(); } catch (e) { remaining = null; }
  var log = [], res = { sent: 0, failed: 0, skipped: 0 };
  items.forEach(function (it) {
    var status = 'Dihantar', err = '';
    if (!EMAIL_RE_.test(String(it.to))) { status = 'Gagal'; err = 'Emel tidak sah'; }
    else if (remaining !== null && remaining <= 0) { status = 'Dilangkau'; err = 'Kuota emel harian tidak mencukupi'; }
    else {
      try { MailApp.sendEmail({ to: it.to, subject: it.subject, body: it.body, name: 'SyuraDocs' }); if (remaining !== null) remaining--; }
      catch (e) { status = 'Gagal'; err = String(e && e.message ? e.message : e).slice(0, 200); }
    }
    if (status === 'Dihantar') res.sent++; else if (status === 'Gagal') res.failed++; else res.skipped++;
    log.push({ id: genId_('NTF'), timestamp: nowIso_(), to_email: String(it.to), type: it.type, meeting_id: it.meeting_id || '', subject: it.subject, status: status, error: err });
  });
  if (log.length) {
    try { withLock_(function () { appendObjects_('notification_log', log); }); } catch (e) { Logger.log('notification_log gagal: ' + e); }
  }
  return res;
}

/** Jemputan. onlyEmails (pilihan): hanya kepada senarai ini (ahli yang baru ditambah). */
function notifyInvite_(meetingId, onlyEmails) {
  var m = getMeetingRow_(meetingId);
  if (m.status !== 'Dijadualkan' && m.status !== 'Sedang Berlangsung') return { sent: 0, failed: 0, skipped: 0 };
  var only = onlyEmails ? onlyEmails.map(looseEmail_) : null;
  var emails = activeMemberEmails_(m.id).filter(function (e) { return !only || only.indexOf(e) !== -1; });
  var label = meetingLabel_(m);
  var body = 'Salam sejahtera,\n\nAnda dijemput ke mesyuarat berikut:\n\n' + label + '\nTarikh dan masa: ' + whenText_(m) + '\n' + linkLine_(meetingLink_(m.id)) +
    '\n\nSila log masuk dengan akaun Google yang sama dengan emel ini, jawab kehadiran anda dan baca dokumen mesyuarat dalam sistem.' + MAIL_FOOTER_;
  return sendMailBatch_(emails.map(function (e) { return { to: e, type: 'invite', meeting_id: m.id, subject: 'Jemputan mesyuarat: ' + label, body: body }; }));
}

/** Panggil selepas ahli ditambah pada mesyuarat yang sudah terbit (jika pilihan emel jemputan dihidupkan). */
function inviteAddedMembers_(meeting, addedEmails) {
  if (!addedEmails || !addedEmails.length || meeting.notify_on_publish !== 'TRUE') return;
  try { notifyInvite_(meeting.id, addedEmails); } catch (e) { Logger.log('inviteAddedMembers_ gagal: ' + e); }
}

/** Trigger setiap jam: satu emel bagi setiap ahli yang menyenaraikan bahan baharu (bukan satu emel setiap fail). */
function sendDigest_() {
  var props = PropertiesService.getScriptProperties();
  var now = nowIso_(), last = props.getProperty(DIGEST_PROP_);
  if (!last) { props.setProperty(DIGEST_PROP_, now); return { sent: 0, failed: 0, skipped: 0, baseline: true }; }
  if (String(getSettings_().digest_enabled).toUpperCase() === 'FALSE') { props.setProperty(DIGEST_PROP_, now); return { sent: 0, failed: 0, skipped: 0, disabled: true }; }

  var meetings = {};
  readTable_('meetings').rows.forEach(function (m) { meetings[m.id] = m; });
  var published = {};
  readTable_('audit_log').rows.forEach(function (a) { if (a.action === 'meeting.publish') published[a.entity_id] = a.timestamp; });

  var byMeeting = {};
  readTable_('materials').rows.forEach(function (x) {
    var m = meetings[x.meeting_id];
    if (!m || x.status !== 'Aktif' || RESTRICTED_TYPES_.indexOf(x.type) !== -1) return; // Bahan Bicara tidak pernah disebut dalam emel
    if (m.status !== 'Dijadualkan' && m.status !== 'Sedang Berlangsung') return;
    if (!(x.uploaded_at > last && x.uploaded_at <= now)) return;
    if (published[m.id] && x.uploaded_at <= published[m.id]) return; // bahan semasa Draf sudah dimaklumkan melalui jemputan
    (byMeeting[m.id] = byMeeting[m.id] || []).push(x);
  });

  var perUser = {}; // emel -> [{m, mats}]
  Object.keys(byMeeting).forEach(function (id) {
    activeMemberEmails_(id).forEach(function (e) {
      var mats = byMeeting[id].filter(function (x) { return looseEmail_(x.uploaded_by) !== e; });
      if (mats.length) (perUser[e] = perUser[e] || []).push({ m: meetings[id], mats: mats });
    });
  });

  var items = Object.keys(perUser).map(function (e) {
    var sections = perUser[e].map(function (s) {
      return meetingLabel_(s.m) + '\n' + s.mats.map(function (x) { return '  - ' + x.title + ' (' + x.type + ')'; }).join('\n') + linkLine_(meetingLink_(s.m.id));
    }).join('\n\n');
    var total = perUser[e].reduce(function (n, s) { return n + s.mats.length; }, 0);
    return { to: e, type: 'digest', meeting_id: perUser[e].length === 1 ? perUser[e][0].m.id : '',
      subject: 'Bahan baharu ditambah (' + total + ')', body: 'Salam sejahtera,\n\nBahan baharu telah ditambah:\n\n' + sections + MAIL_FOOTER_ };
  });
  var res = items.length ? sendMailBatch_(items) : { sent: 0, failed: 0, skipped: 0 };
  props.setProperty(DIGEST_PROP_, now);
  return res;
}

/** Trigger harian 08:00: peringatan sekali bagi setiap ahli sebelum mesyuarat Dijadualkan. */
function sendReminders_() {
  var hours = Number(getSettings_().reminder_hours_before || 24);
  var daysBefore = Math.max(1, Math.round(hours / 24));
  var today = todayMy_(), limit = addDaysIso_(today, daysBefore), tomorrow = addDaysIso_(today, 1);
  var nowHm = Utilities.formatDate(new Date(), TZ_, 'HH:mm');
  var sent = {};
  readTable_('notification_log').rows.forEach(function (r) { if (r.type === 'reminder' && r.status === 'Dihantar') sent[r.meeting_id + '|' + looseEmail_(r.to_email)] = true; });

  var items = [];
  readTable_('meetings').rows.forEach(function (m) {
    if (m.status !== 'Dijadualkan' || m.date < today || m.date > limit) return;
    if (m.date === today && m.start_time < nowHm) return; // sudah bermula
    var when = m.date === today ? 'hari ini' : (m.date === tomorrow ? 'esok' : 'pada ' + weekdayOf_(m.date) + ', ' + ddmmyyyy_(m.date));
    var label = meetingLabel_(m);
    activeMemberEmails_(m.id).forEach(function (e) {
      if (sent[m.id + '|' + e]) return;
      items.push({ to: e, type: 'reminder', meeting_id: m.id, subject: 'Peringatan: mesyuarat ' + when + ' (' + label + ')',
        body: 'Salam sejahtera,\n\nPeringatan: mesyuarat berikut diadakan ' + when + '.\n\n' + label + '\nTarikh dan masa: ' + whenText_(m) + '\n' + linkLine_(meetingLink_(m.id)) +
          '\n\nSila pastikan kehadiran anda telah dijawab dalam sistem.' + MAIL_FOOTER_ });
    });
  });
  return items.length ? sendMailBatch_(items) : { sent: 0, failed: 0, skipped: 0 };
}
