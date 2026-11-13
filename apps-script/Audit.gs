/**
 * Audit.gs - rekod audit (F-12). Tiada API untuk ubah atau padam baris audit.
 * audit.list (Admin) ditambah pada Fasa 6.
 */

/** Tulis satu baris audit. Kegagalan audit tidak menggagalkan operasi utama, tetapi dilog. */
function audit_(email, action, entity, entityId, detail) {
  try {
    withLock_(function () {
      appendObject_('audit_log', {
        id: genId_('AUD'),
        timestamp: nowIso_(),
        email: email || 'sistem',
        action: action,
        entity: entity || '',
        entity_id: entityId || '',
        detail: String(detail || '').slice(0, 500)
      });
    });
  } catch (e) {
    Logger.log('audit_ gagal: ' + e);
  }
}

/** Admin sahaja. Tapis: email (mengandungi), action (tepat), from/to (YYYY-MM-DD, waktu Malaysia), entity_id. Terbaru dahulu. */
function apiAuditList_(session, data) {
  requireRole_(session, ['Admin']);
  data = data || {};
  var q = String(data.email || '').trim().toLowerCase(), action = String(data.action || '').trim();
  var from = String(data.from || ''), to = String(data.to || ''), ent = String(data.entity_id || '').trim();
  var limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200), offset = Math.max(Number(data.offset) || 0, 0);
  var rows = readTable_('audit_log').rows, actions = {};
  rows.forEach(function (r) { actions[r.action] = true; });
  rows = rows.filter(function (r) {
    if (q && r.email.toLowerCase().indexOf(q) === -1) return false;
    if (action && r.action !== action) return false;
    if (ent && r.entity_id !== ent) return false;
    if (from && r.timestamp.slice(0, 10) < from) return false;
    if (to && r.timestamp.slice(0, 10) > to) return false;
    return true;
  }).sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : (a.timestamp > b.timestamp ? -1 : 0); });
  return { total: rows.length, offset: offset, limit: limit, actions: Object.keys(actions).sort(),
    rows: rows.slice(offset, offset + limit).map(function (r) { return { id: r.id, timestamp: r.timestamp, email: r.email, action: r.action, entity: r.entity, entity_id: r.entity_id, detail: r.detail }; }) };
}

/** Admin sahaja: log emel. Tapis: type, status, to (mengandungi), meeting_id. */
function apiNotificationsList_(session, data) {
  requireRole_(session, ['Admin']);
  data = data || {};
  var type = String(data.type || ''), status = String(data.status || ''), to = String(data.to || '').trim().toLowerCase(), mid = String(data.meeting_id || '');
  var limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200), offset = Math.max(Number(data.offset) || 0, 0);
  var all = readTable_('notification_log').rows, counts = { Dihantar: 0, Gagal: 0, Dilangkau: 0 };
  all.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status]++; });
  var rows = all.filter(function (r) {
    return (!type || r.type === type) && (!status || r.status === status) && (!to || r.to_email.toLowerCase().indexOf(to) !== -1) && (!mid || r.meeting_id === mid);
  }).sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : (a.timestamp > b.timestamp ? -1 : 0); });
  var quota = null; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { quota = null; }
  return { total: rows.length, offset: offset, limit: limit, counts: counts, quota_remaining: quota,
    rows: rows.slice(offset, offset + limit).map(function (r) { return { id: r.id, timestamp: r.timestamp, to_email: r.to_email, type: r.type, meeting_id: r.meeting_id, subject: r.subject, status: r.status, error: r.error }; }) };
}
