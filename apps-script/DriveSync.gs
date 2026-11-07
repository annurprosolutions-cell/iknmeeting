/**
 * DriveSync.gs - folder Drive per mesyuarat dan kawalan akses Viewer (TRD seksyen 5).
 * Tambah akses guna Drive Advanced Service (tanpa emel notifikasi Google). Jika servis itu belum
 * didayakan dalam appsscript.json, jatuh balik ke DriveApp.addViewer (Google hantar emel kongsi).
 */

var STATUS_WITH_FOLDER_ACCESS_ = ['Dijadualkan', 'Sedang Berlangsung', 'Selesai'];

function ownerEmail_() { return String(Session.getEffectiveUser().getEmail()).toLowerCase(); }

function getMeetingsFolder_() {
  var rootId = getSettings_().root_folder_id;
  if (!rootId) throw new Error('root_folder_id tiada. Jalankan setupSystem().');
  var root = DriveApp.getFolderById(rootId);
  var it = root.getFoldersByName('Mesyuarat');
  return it.hasNext() ? it.next() : root.createFolder('Mesyuarat');
}

function meetingFolderName_(id, date, title) {
  var short = String(title).replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return date + ' ' + short + ' [' + id + ']';
}

function createMeetingFolder_(id, date, title) {
  return getMeetingsFolder_().createFolder(meetingFolderName_(id, date, title)).getId();
}

function renameMeetingFolder_(folderId, id, date, title) {
  try { DriveApp.getFolderById(folderId).setName(meetingFolderName_(id, date, title)); }
  catch (e) { Logger.log('renameMeetingFolder_ gagal: ' + e); }
}

/** Beri akses Viewer. Pulang true jika berjaya. */
function driveShare_(folderId, email) {
  if (!folderId || email === ownerEmail_()) return true;
  try {
    if (typeof Drive !== 'undefined' && Drive.Permissions) {
      Drive.Permissions.create({ type: 'user', role: 'reader', emailAddress: email }, folderId, { sendNotificationEmail: false });
    } else {
      DriveApp.getFolderById(folderId).addViewer(email);
    }
    return true;
  } catch (e) {
    Logger.log('driveShare_ gagal (' + email + '): ' + e);
    return false;
  }
}

/** Tarik balik akses Viewer. Pulang true jika berjaya. */
function driveUnshare_(folderId, email) {
  if (!folderId || email === ownerEmail_()) return true;
  try {
    DriveApp.getFolderById(folderId).removeViewer(email);
    return true;
  } catch (e) {
    Logger.log('driveUnshare_ gagal (' + email + '): ' + e);
    return false;
  }
}

/** Kongsi kepada banyak emel; pulang senarai yang gagal. */
function driveShareMany_(folderId, emails) {
  return emails.filter(function (e) { return !driveShare_(folderId, e); });
}

function isActiveUser_(email) {
  var u = findUser_(email);
  return Boolean(u && u.status === 'Aktif');
}

/**
 * Hitung semula akses Drive seorang pengguna selepas role/status berubah:
 * folder akar (Admin/Setiausaha Aktif sahaja) dan setiap folder mesyuarat yang dia ahli.
 */
function syncUserDriveAccess_(email) {
  var u = findUser_(email);
  var active = Boolean(u && u.status === 'Aktif');
  var rootId = getSettings_().root_folder_id;
  if (active && (u.role === 'Admin' || u.role === 'Setiausaha')) driveShare_(rootId, email);
  else driveUnshare_(rootId, email);

  var meetings = {};
  readTable_('meetings').rows.forEach(function (m) { meetings[m.id] = m; });
  readTable_('meeting_members').rows.forEach(function (r) {
    if (r.email !== email) return;
    var m = meetings[r.meeting_id];
    if (!m || !m.drive_folder_id) return;
    if (active && STATUS_WITH_FOLDER_ACCESS_.indexOf(m.status) !== -1) driveShare_(m.drive_folder_id, email);
    else driveUnshare_(m.drive_folder_id, email);
  });
}
