// Muat naik bahan: baca fail, semak awal di klien, hantar sebagai base64 dengan kemajuan.
import { apiUpload } from './api.js';
import { fileToBase64, fmtSize } from './ui.js';
import { getSettings } from './auth.js';

export const FILE_ACCEPT = '.pdf,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg';
export const MATERIAL_TYPES = ['Surat Jemputan', 'Memo', 'Agenda', 'Kertas Cadangan', 'Kertas Makluman', 'Kertas Laporan', 'Bahan Bicara', 'Minit', 'Maklum Balas', 'Slaid', 'Lampiran', 'Lain-lain'];
export const RESTRICTED_TYPES = ['Bahan Bicara'];

/** Mesej ralat jika fail jelas tidak sah, atau '' jika boleh dihantar. Server tetap menyemak semula. */
export function checkFile(file) {
  const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(file.name) || [])[1];
  if (!ext || !FILE_ACCEPT.includes('.' + ext.toLowerCase())) return 'Jenis fail tidak dibenarkan (PDF, PPT/PPTX, DOC/DOCX, XLS/XLSX, PNG, JPG).';
  const max = (getSettings().max_upload_mb || 20) * 1048576;
  if (file.size > max) return `Fail ${fmtSize(file.size)} melebihi had ${getSettings().max_upload_mb || 20} MB. Letak fail dalam folder Drive mesyuarat dan guna "Imbas folder Drive".`;
  if (!file.size) return 'Fail kosong.';
  return '';
}

/** action: 'materials.upload' atau 'materials.replace'. */
export async function sendFile(action, fields, file, onProgress) {
  const bad = checkFile(file);
  if (bad) throw new Error(bad);
  const data_base64 = await fileToBase64(file);
  return apiUpload(action, { ...fields, file_name: file.name, data_base64 }, onProgress);
}
