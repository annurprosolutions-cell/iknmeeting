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
