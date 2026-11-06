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
