// Memuatkan fail .gs ke dalam vm dengan mock servis Apps Script.
// Guna: const { ctx, call, fetchMock, state } = require('./gas-harness').create();
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function makeSheet(name) {
  const sh = { name, data: [[]], maxRows: 1000, maxCols: 26, validations: {}, formats: {} };
  const grow = (r, c) => { while (sh.data.length < r) sh.data.push([]); sh.data.forEach(row => { while (row.length < c) row.push(''); }); };
  sh.getLastRow = () => { let l = 0; sh.data.forEach((r, i) => { if (r.some(v => v !== '' && v != null)) l = i + 1; }); return l; };
  sh.getLastColumn = () => Math.max(1, ...sh.data.map(r => { let l = 0; r.forEach((v, i) => { if (v !== '' && v != null) l = i + 1; }); return l; }));
  sh.getMaxRows = () => sh.maxRows;
  sh.getMaxColumns = () => sh.maxCols;
  sh.insertColumnsAfter = (a, n) => { sh.maxCols += n; };
  sh.setFrozenRows = () => {};
  sh.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { grow(r + nr - 1, c + nc - 1); return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.data[r - 1 + i][c - 1 + j])); },
    setValues: (v) => { grow(r + nr - 1, c + nc - 1); v.forEach((row, i) => row.forEach((x, j) => { sh.data[r - 1 + i][c - 1 + j] = x; })); },
    setNumberFormat: (f) => { sh.formats[c] = f; },
    setFontWeight: () => {},
    setDataValidation: (rule) => { sh.validations[c] = rule; }
  });
  return sh;
}

function create() {
  const state = { sheets: {}, props: { GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com' }, cache: {}, triggers: [], folders: [], mail: [], fetchResponses: {} };
  const ss = {
    getId: () => 'SHEET1',
    setSpreadsheetTimeZone: () => {},
    getSheetByName: (n) => state.sheets[n] || null,
    insertSheet: (n) => (state.sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(state.sheets),
    deleteSheet: (s) => { delete state.sheets[s.name]; }
  };
  const fetchMock = { calls: [], respond: null };
  let uuidN = 0;
  const lockState = { held: 0 };
  const sandbox = {
    console, Date, JSON, Math, Object, Array, String, Number, Error, Promise,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, openById: () => ss,
      newDataValidation: () => { const o = {}; const b = { requireValueInList: (l) => { o.list = l; return b; }, setAllowInvalid: () => b, build: () => o }; return b; },
      getUi: () => { throw new Error('no ui'); }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => state.props[k] || null, setProperty: (k, v) => { state.props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({
      get: k => (state.cache[k] && state.cache[k].exp > Date.now() ? state.cache[k].v : null),
      put: (k, v, ttl) => { state.cache[k] = { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }; },
      remove: k => { delete state.cache[k]; } }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { if (lockState.held) throw new Error('lock sudah dipegang (tidak reentrant)'); lockState.held = 1; },
      releaseLock: () => { lockState.held = 0; } }) },
    Utilities: {
      formatDate: (d, tz, fmt) => { const p = n => String(n).padStart(2, '0'); const k = new Date(d.getTime() + 8 * 3600e3); return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}`; },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(text).digest()).map(b => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }
    },
    UrlFetchApp: { fetch: (url) => { fetchMock.calls.push(url); const r = fetchMock.respond(url); return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) }; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log: () => {} },
    DriveApp: {
      getFolderById: (id) => { const f = state.folders.find(x => x.id === id); if (!f) throw new Error('x'); return f; },
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: (n) => mkFolder(n)
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@gmail.com' }) },
    ScriptApp: {
      WeekDay: { MONDAY: 'MON', SUNDAY: 'SUN' },
      getProjectTriggers: () => state.triggers.slice(),
      deleteTrigger: t => { state.triggers = state.triggers.filter(x => x !== t); },
      newTrigger: (fn) => { const t = { fn, getHandlerFunction: () => fn }; const b = { timeBased: () => b, everyHours: () => b, everyDays: () => b, atHour: () => b, onWeekDay: () => b, nearMinute: () => b, create: () => { state.triggers.push(t); return t; } }; return b; }
    }
  };
  function mkFolder(n) {
    const f = { id: 'FOLDER_' + state.folders.length, name: n, getId() { return this.id; }, isTrashed: () => false, getFoldersByName: (nm) => { const m = state.folders.filter(x => x.parent === f && x.name === nm); let i = 0; return { hasNext: () => i < m.length, next: () => m[i++] }; }, createFolder: (nm) => { const c = mkFolder(nm); c.parent = f; return c; } };
    state.folders.push(f); return f;
  }
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  ['Utils', 'Audit', 'Auth', 'Users', 'Code', 'Setup'].forEach(n => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', n + '.gs'), 'utf8'), ctx, { filename: n + '.gs' });
  });
  const call = (action, data, token) => {
    const out = vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify({ action, token, data }) } });
    return JSON.parse(out.text);
  };
  return { ctx, call, fetchMock, state, run: (code) => vm.runInContext(code, ctx) };
}

module.exports = { create };
