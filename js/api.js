// Pembungkus fetch ke Apps Script. text/plain supaya tiada preflight CORS (TRD seksyen 4).
import { API_URL } from '../config.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code; // 0 = rangkaian, selain itu kod daripada server
  }
}

let getToken = () => null;
let onUnauthorized = null;

export function configureApi(opts) {
  if (opts.getToken) getToken = opts.getToken;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
}

async function post(action, data, token) {
  if (!API_URL) throw new ApiError(0, 'API_URL belum diisi dalam config.js.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: token || undefined, data }),
      signal: ctrl.signal
    });
  } catch (e) {
    throw new ApiError(0, 'Tidak dapat sambung ke server. Semak sambungan internet anda.');
  } finally {
    clearTimeout(timer);
  }
  let body;
  try { body = await res.json(); } catch (e) { throw new ApiError(0, 'Respons server tidak sah.'); }
  return body;
}

/** Panggil action. Pada 401 (selain auth.login), cuba pulihkan sesi secara senyap sekali, kemudian ulang. */
export async function api(action, data = {}, opts = {}) {
  const body = await post(action, data, opts.noAuth ? null : getToken());
  if (body.ok) return body.data;
  const err = body.error || { code: 500, message: 'Ralat tidak diketahui.' };
  if (err.code === 401 && !opts.noAuth && !opts.retried && action !== 'auth.login' && onUnauthorized) {
    if (await onUnauthorized()) return api(action, data, { ...opts, retried: true });
  }
  throw new ApiError(err.code, err.message);
}

/**
 * Hantar action dengan kemajuan muat naik (XHR kerana fetch tiada upload progress).
 * Sama seperti api(): text/plain tanpa preflight; pada 401 cuba pulihkan sesi sekali.
 */
export function apiUpload(action, data, onProgress, retried = false) {
  return new Promise((resolve, reject) => {
    if (!API_URL) return reject(new ApiError(0, 'API_URL belum diisi dalam config.js.'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL);
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
    xhr.timeout = 5 * 60 * 1000;
    if (onProgress && xhr.upload) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(new ApiError(0, 'Tidak dapat sambung ke server. Semak sambungan internet anda.'));
    xhr.ontimeout = () => reject(new ApiError(0, 'Muat naik mengambil masa terlalu lama. Cuba fail yang lebih kecil atau guna folder Drive.'));
    xhr.onload = async () => {
      let body;
      try { body = JSON.parse(xhr.responseText); } catch (e) { return reject(new ApiError(0, 'Respons server tidak sah. Fail mungkin terlalu besar untuk dimuat naik; guna folder Drive.')); }
      if (body.ok) return resolve(body.data);
      const err = body.error || { code: 500, message: 'Ralat tidak diketahui.' };
      if (err.code === 401 && !retried && onUnauthorized && (await onUnauthorized())) {
        return apiUpload(action, data, onProgress, true).then(resolve, reject);
      }
      reject(new ApiError(err.code, err.message));
    };
    xhr.send(JSON.stringify({ action, token: getToken() || undefined, data }));
  });
}
