/**
 * Backup.gs - salinan Sheet ke folder Backup (F-12, BSD seksyen 8). Mingguan (trigger) dan manual (Admin).
 * Folder Backup MESTI di luar folder akar yang dikongsi kepada Setiausaha (lihat Setup.gs), kerana salinan memuatkan
 * seluruh pangkalan data termasuk senarai pengguna dan audit log.
 */

function backupFolder_() {
  var id = getSettings_().backup_folder_id;
  if (!id) throw new Error('backup_folder_id tiada. Jalankan setupSystem().');
  return DriveApp.getFolderById(id);
}

function backupFiles_(folder) {
  var out = [], it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (/^DB-/.test(f.getName())) out.push(f); }
  out.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  return out;
}

/** Cipta salinan dan buang yang lama (kekalkan `backup_keep` terkini). */
function backupNow_(actorEmail) {
  var folder = backupFolder_();
  var base = 'DB-' + Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd');
  var name = base, n = 1;
  while (folder.getFilesByName(name).hasNext()) { // sama hari: tambah masa; jika masih sama (saat yang sama): tambah nombor
    name = base + '-' + Utilities.formatDate(new Date(), TZ_, 'HHmmss') + (n > 1 ? '-' + n : ''); n++;
  }
  var copy = DriveApp.getFileById(getDb_().getId()).makeCopy(name, folder);
  var keep = Math.max(1, Number(getSettings_().backup_keep || 8));
  var files = backupFiles_(folder), removed = 0;
  files.slice(keep).forEach(function (f) { f.setTrashed(true); removed++; });
  audit_(actorEmail || 'sistem', 'backup.run', 'backup', copy.getId(), name + (removed ? ', ' + removed + ' lama dibuang' : ''));
  return { name: name, id: copy.getId(), kept: Math.min(files.length, keep), removed: removed };
}

function backupWeekly_() {
  try { return backupNow_('sistem'); }
  catch (e) { Logger.log('backupWeekly_ gagal: ' + e); audit_('sistem', 'backup.gagal', 'backup', '', String(e && e.message ? e.message : e).slice(0, 200)); }
}

function apiBackupRun_(session) {
  requireRole_(session, ['Admin']);
  return backupNow_(session.email);
}

function apiBackupList_(session) {
  requireRole_(session, ['Admin']);
  var folder = backupFolder_();
  return { keep: Number(getSettings_().backup_keep || 8), backups: backupFiles_(folder).map(function (f) {
    return { name: f.getName(), created_at: Utilities.formatDate(f.getDateCreated(), TZ_, "yyyy-MM-dd'T'HH:mm:ss") + '+08:00', size_bytes: f.getSize() };
  }) };
}
