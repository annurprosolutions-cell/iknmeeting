// Pemasangan Apps Script tidak lengkap (fail .gs tertinggal atau versi lama): hanya action terjejas gagal; ping melaporkan fail yang hilang.
const assert = require('assert');
const { create } = require('./gas-harness');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const CID = 'client-123.apps.googleusercontent.com', FAKE = 'eyJ' + 'a'.repeat(40);

function boot(opts) {
  const h = create(opts); const { call, fetchMock, run } = h;
  run("ADMIN_EMAIL = 'admin@x.com'"); try { run('setupSystem()'); } catch (e) { /* setup memerlukan semua fail; abaikan di sini */ }
  const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); return call('auth.login', { idToken: FAKE }); };
  return { h, call, login };
}

t('pemasangan lengkap: ping tiada "missing"', () => {
  const { call } = boot(); const r = call('ping'); assert.ok(r.ok && r.data.pong && !('missing' in r.data), JSON.stringify(r));
});
t('Settings.gs dan Backup.gs tertinggal (kes pengguna): ping dan log masuk TETAP berfungsi; ping menyenaraikan fail yang hilang', () => {
  const { call, login } = boot({ skip: ['Settings.gs', 'Backup.gs'] });
  const p = call('ping'); assert.ok(p.ok && p.data.pong); assert.deepStrictEqual(Array.from(p.data.missing), ['Backup.gs', 'Settings.gs']);
  const l = login('admin@x.com'); assert.ok(l.ok, JSON.stringify(l)); const tok = l.data.token;
  assert.ok(call('me.get', {}, tok).ok); assert.ok(call('meetings.list', {}, tok).ok); assert.ok(call('users.list', {}, tok).ok);
});
t('action dalam fail yang hilang gagal dengan mesej jelas (503), bukan "Ralat dalaman"', () => {
  const { call, login } = boot({ skip: ['Settings.gs', 'Backup.gs'] }); const tok = login('admin@x.com').data.token;
  const a = call('settings.get', {}, tok), b = call('backup.run', {}, tok);
  assert.strictEqual(a.error.code, 503); assert.ok(a.error.message.includes('Settings.gs') && !/Ralat dalaman/.test(a.error.message)); assert.strictEqual(b.error.code, 503); assert.ok(b.error.message.includes('Backup.gs'));
  assert.strictEqual(call('xxx', {}, tok).error.code, 404);
});
t('Audit.gs versi LAMA (tiada audit.list): login berfungsi; ping menyebut Audit.gs', () => {
  const { call, login } = boot({ drop: ['apiAuditList_', 'apiNotificationsList_'] });
  assert.deepStrictEqual(Array.from(call('ping').data.missing), ['Audit.gs']); const l = login('admin@x.com'); assert.ok(l.ok, JSON.stringify(l));
  assert.strictEqual(call('audit.list', {}, l.data.token).error.code, 503); assert.ok(call('me.get', {}, l.data.token).ok);
});
t('Notify.gs tertinggal: penerbitan mesyuarat TETAP berjaya (emel dilangkau, bukan ralat)', () => {
  const { call, login, h } = boot({ skip: ['Notify.gs'] }); const tok = login('admin@x.com').data.token;
  call('users.save', { email: 'chair@x.com', name: 'Chair', role: 'Ahli' }, tok); call('users.save', { email: 'a1@x.com', name: 'A1', role: 'Ahli' }, tok);
  const id = call('meetings.create', { title: 'M', bil: '1', date: '2026-12-01', start_time: '09:00', pengerusi_email: 'chair@x.com', members: ['a1@x.com'] }, tok).data.id;
  const r = call('meetings.publish', { id }, tok); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(call('meetings.get', { id }, tok).data.status, 'Dijadualkan'); assert.deepStrictEqual(Array.from(call('ping').data.missing), ['Notify.gs']);
});
t('KAWALAN: dengan penghala lama (tanpa pembungkus) satu fail tertinggal merosakkan SEMUA action termasuk ping', () => {
  const h = create({ skip: ['Settings.gs'] }); const { run, call } = h;
  run("getRoutes_ = function () { return { 'ping': { fn: apiPing_, public: true }, 'settings.get': { fn: apiSettingsGet_ } }; }"); // gaya lama: rujuk function terus
  const r = call('ping'); assert.strictEqual(r.ok, false); assert.strictEqual(r.error.code, 500); assert.strictEqual(r.error.message, 'Ralat dalaman. Sila cuba lagi.');
});

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
